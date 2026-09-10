import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
  TouchableOpacity,
  FlatList,
  StatusBar,
  Image,
  ImageBackground,
  Animated,
  Platform,
  PermissionsAndroid,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Dimensions,
  Alert,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import { auth, database } from '../../../config/firebase';
import { useAudioCall } from '../../../webRTC/useAudioCall';
import { RTCView } from 'react-native-webrtc';
import colors from '../../../theme/Colors';
import { uploadMediaBlob, resolveMediaUri, deleteMediaBlob } from '../../../functions/mediaService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const isSameDay = (d1, d2) => {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
};

const getDateLabel = (date) => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(date, today)) {
    return 'Today';
  } else if (isSameDay(date, yesterday)) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
};

/**
 * Lightweight, decoupled image bubble that loads cached Base64 from local disk
 * or fetches from RTDB media_blobs on-demand to keep messages under 1KB.
 */
const ChatImageThumbnail = ({ item, isMyMessage, onOpenFullscreen, onLongPress }) => {
  const [resolvedUri, setResolvedUri] = useState(item.imageUri || null);
  const [loading, setLoading] = useState(!item.imageUri && Boolean(item.mediaId));

  useEffect(() => {
    let isMounted = true;
    if (item.imageUri) {
      setResolvedUri(item.imageUri);
      setLoading(false);
      return;
    }

    if (item.mediaId) {
      setLoading(true);
      resolveMediaUri(item.mediaId, item.imageUri)
        .then((uri) => {
          if (isMounted) {
            setResolvedUri(uri);
            setLoading(false);
          }
        })
        .catch(() => {
          if (isMounted) setLoading(false);
        });
    } else {
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [item.mediaId, item.imageUri]);

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => {
        if (resolvedUri) {
          onOpenFullscreen(resolvedUri, item.caption);
        }
      }}
      onLongPress={() => onLongPress && onLongPress(item)}
      style={[
        styles.imageMessageCard,
        isMyMessage ? styles.myImageMessageCard : styles.theirImageMessageCard,
      ]}
    >
      {loading ? (
        <View style={styles.imagePlaceholder}>
          <ActivityIndicator size="small" color={colors.CYAN_ACCENT} />
          <Text style={styles.imagePlaceholderText}>Loading photo...</Text>
        </View>
      ) : resolvedUri ? (
        <Image
          source={{ uri: resolvedUri }}
          style={styles.imageThumbnail}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.imagePlaceholder}>
          <MaterialIcons name="broken-image" size={32} color="rgba(255, 255, 255, 0.4)" />
          <Text style={styles.imagePlaceholderText}>Photo unavailable</Text>
        </View>
      )}

      {/* Optional Caption */}
      {Boolean(item.caption) && (
        <Text style={styles.imageCaptionText}>{item.caption}</Text>
      )}

      {/* Image Card Footer */}
      <View style={styles.imageCardFooter}>
        <Text style={styles.imageTimestamp}>
          {new Date(item.timestamp || Date.now()).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
        {isMyMessage && (
          <View style={styles.seenReceiptRow}>
            <MaterialIcons
              name={item.seen || item.status === 'seen' ? 'done-all' : 'done'}
              size={14}
              color={item.seen || item.status === 'seen' ? colors.CYAN_ACCENT : 'rgba(255, 255, 255, 0.7)'}
              style={{ marginLeft: 4 }}
            />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const ChatScreen = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('');
  const [showAttachments, setShowAttachments] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatId, setChatId] = useState(route.params?.chatId || null);
  const [otherUserStatus, setOtherUserStatus] = useState('offline');
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [showMessageActionModal, setShowMessageActionModal] = useState(false);
  // Photo & Ephemeral View-Once states (No cloud storage required)
  const [selectedPhoto, setSelectedPhoto] = useState(null); // { uri, width, height }
  const [photoCaption, setPhotoCaption] = useState('');
  const [isViewOnce, setIsViewOnce] = useState(false);
  const [showPhotoPreviewModal, setShowPhotoPreviewModal] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState(null); // { uri, caption, isViewOnce, messageId }
  const [isSendingPhoto, setIsSendingPhoto] = useState(false);
  const flatListRef = useRef(null);

  const otherUsername = route.params?.username || 'Chat';
  const otherUserId = route.params?.userId || route.params?.id || route.params?.friendId;
  const otherAvatar = route.params?.avatar || null;

  // Dynamic safe area top inset for Android & iOS notch protection
  const safeTopPadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 12
  ) + 8;

  // State for in-call minimize & equalizer frequency bars
  const [isCallMinimized, setIsCallMinimized] = useState(false);
  const eqBars = useRef([
    new Animated.Value(6),
    new Animated.Value(16),
    new Animated.Value(8),
    new Animated.Value(22),
    new Animated.Value(10),
    new Animated.Value(18),
    new Animated.Value(7),
  ]).current;

  // Animations for call UI & attachments
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ringAnim = useRef(new Animated.Value(0)).current;
  const attachAnim = useRef(new Animated.Value(0)).current;

  // Audio/Video call hook
  const {
    callState,
    callType,
    callDuration,
    isMuted,
    isSpeaker,
    isCameraOff,
    callError,
    localStream,
    remoteStream,
    startCall,
    answerCall,
    declineCall,
    endCall,
    listenIncoming,
    toggleMute,
    toggleSpeaker,
    toggleCamera,
    switchCamera,
    formatDuration,
  } = useAudioCall(chatId, otherUserId);

  const autoAnswerTriggeredRef = useRef(false);

  // Auto-answer incoming call if routed from GlobalIncomingCallNotifier Accept button
  useEffect(() => {
    if (route.params?.autoAnswer && callState === 'incoming' && !autoAnswerTriggeredRef.current) {
      autoAnswerTriggeredRef.current = true;
      console.log('[ChatScreen] Auto-answering call triggered from global incoming notification');
      answerCall();
    }
  }, [route.params?.autoAnswer, callState, answerCall]);

  // Reset minimize state when call ends
  useEffect(() => {
    if (callState === 'idle') {
      setIsCallMinimized(false);
      autoAnswerTriggeredRef.current = false;
    }
  }, [callState]);

  // Animated equalizer waves for live call audio
  useEffect(() => {
    if (callState === 'connected' || callState === 'calling') {
      const anims = eqBars.map((bar, i) => {
        const minH = 6 + (i % 3) * 3;
        const maxH = 20 + (i % 4) * 4;
        return Animated.loop(
          Animated.sequence([
            Animated.timing(bar, {
              toValue: maxH,
              duration: 380 + i * 80,
              useNativeDriver: false,
            }),
            Animated.timing(bar, {
              toValue: minH,
              duration: 380 + i * 80,
              useNativeDriver: false,
            }),
          ])
        );
      });
      anims.forEach((a) => a.start());
      return () => {
        anims.forEach((a) => a.stop());
      };
    }
  }, [callState]);

  // Send quick reaction emoji during call
  const sendReaction = (emoji) => {
    if (!chatId) return;
    const currentUser = auth().currentUser;
    if (!currentUser) return;
    database().ref(`chats/${chatId}/messages`).push({
      text: emoji,
      senderId: currentUser.uid,
      timestamp: database.ServerValue.TIMESTAMP,
      type: 'text',
    });
  };

  // Initialize Chat & Presence
  useEffect(() => {
    initializeChat();
    setupUserPresence();
    listenOtherUserStatus();
    return () => {
      if (chatId) {
        database().ref(`chats/${chatId}/messages`).off('value');
      }
    };
  }, []);

  useEffect(() => {
    if (!chatId) return;
    const unsubscribe = listenIncoming();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [chatId, listenIncoming]);

  // Pulse animation for calls
  useEffect(() => {
    if (callState === 'calling' || callState === 'incoming') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.12, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        ])
      );
      pulse.start();

      const ring = Animated.loop(
        Animated.sequence([
          Animated.timing(ringAnim, { toValue: 1, duration: 1400, useNativeDriver: true }),
          Animated.timing(ringAnim, { toValue: 0, duration: 1400, useNativeDriver: true }),
        ])
      );
      ring.start();

      return () => {
        pulse.stop();
        ring.stop();
        pulseAnim.setValue(1);
        ringAnim.setValue(0);
      };
    }
  }, [callState]);

  // Attachment panel animation
  useEffect(() => {
    Animated.spring(attachAnim, {
      toValue: showAttachments ? 1 : 0,
      tension: 65,
      friction: 10,
      useNativeDriver: true,
    }).start();
  }, [showAttachments]);

  const listenOtherUserStatus = () => {
    if (!otherUserId) return;
    const statusRef = database().ref(`users/${otherUserId}/status`);
    statusRef.on('value', (snapshot) => {
      const val = snapshot.val();
      const isOnline = val === 'online' || val?.state === 'online';
      setOtherUserStatus(isOnline ? 'online' : 'offline');
    });
  };

  const initializeChat = async () => {
    const currentUser = auth().currentUser;
    if (!currentUser || !otherUserId) return;

    if (route.params?.chatId) {
      setChatId(route.params.chatId);
      listenToMessages(route.params.chatId);
    }

    const userChatsRef = database().ref(`user_chats/${currentUser.uid}`);
    userChatsRef.on('value', (snapshot) => {
      const chats = snapshot.val();
      if (chats) {
        const existingChatId = Object.keys(chats).find(
          (key) => chats[key].otherUserId === otherUserId
        );
        if (existingChatId) {
          setChatId(existingChatId);
          listenToMessages(existingChatId);
        } else if (!route.params?.chatId) {
          createNewChat(currentUser.uid, otherUserId);
        }
      } else if (!route.params?.chatId) {
        createNewChat(currentUser.uid, otherUserId);
      }
    });
  };

  const createNewChat = async (currentUserId, otherId) => {
    const db = database();
    const newChatRef = db.ref('chats').push();
    const newChatId = newChatRef.key;

    await Promise.all([
      db.ref(`chats/${newChatId}/participants/${currentUserId}`).set(true),
      db.ref(`chats/${newChatId}/participants/${otherId}`).set(true),
      db.ref(`user_chats/${currentUserId}/${newChatId}`).set({
        otherUserId: otherId,
        lastMessage: '',
        lastMessageTimestamp: database.ServerValue.TIMESTAMP,
      }),
      db.ref(`user_chats/${otherId}/${newChatId}`).set({
        otherUserId: currentUserId,
        lastMessage: '',
        lastMessageTimestamp: database.ServerValue.TIMESTAMP,
      }),
    ]);

    setChatId(newChatId);
    listenToMessages(newChatId);
  };

  const listenToMessages = (activeChatId) => {
    const messagesRef = database().ref(`chats/${activeChatId}/messages`);
    messagesRef.on('value', (snapshot) => {
      const data = snapshot.val();
      const currentUid = auth().currentUser?.uid;
      if (data) {
        const messagesList = Object.keys(data).map((id) => ({
          id,
          ...data[id],
        }));
        messagesList.sort((a, b) => a.timestamp - b.timestamp);

        // ── 1. Filter out messages that current user deleted "For Me" ──
        const visibleMessages = messagesList.filter(
          (msg) => !(msg.deletedFor && currentUid && msg.deletedFor[currentUid])
        );
        setMessages(visibleMessages);

        // ── 2. Mark incoming unread messages as SEEN in real time ──
        if (currentUid) {
          messagesList.forEach((msg) => {
            if (msg.senderId !== currentUid && !msg.seen && !msg.deletedForEveryone) {
              database().ref(`chats/${activeChatId}/messages/${msg.id}`).update({
                seen: true,
                seenAt: database.ServerValue.TIMESTAMP,
                status: 'seen',
              });
            }
          });
        }

        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      } else {
        setMessages([]);
      }
    });
  };

  const sendMessage = async () => {
    if (!message.trim() || !chatId) return;

    const db = database();
    const currentUser = auth().currentUser;
    if (!currentUser) return;

    const textToSend = message.trim();
    const messageData = {
      text: textToSend,
      senderId: currentUser.uid,
      timestamp: database.ServerValue.TIMESTAMP,
      type: 'text',
      seen: false,
      status: 'sent',
    };

    setMessage('');

    const newMessageRef = db.ref(`chats/${chatId}/messages`).push();
    await newMessageRef.set(messageData);

    // Update user_chats preview for both users
    const updates = {};
    updates[`user_chats/${currentUser.uid}/${chatId}/lastMessage`] = textToSend;
    updates[`user_chats/${currentUser.uid}/${chatId}/lastMessageTimestamp`] = database.ServerValue.TIMESTAMP;
    if (otherUserId) {
      updates[`user_chats/${otherUserId}/${chatId}/lastMessage`] = textToSend;
      updates[`user_chats/${otherUserId}/${chatId}/lastMessageTimestamp`] = database.ServerValue.TIMESTAMP;
    }
    await db.ref().update(updates);
  };

  // Send Watch Party Invite inside Chat
  const sendWatchPartyInvite = async (roomData) => {
    if (!chatId) return;
    const db = database();
    const currentUser = auth().currentUser;
    if (!currentUser) return;

    const inviteText = `Hey! Join my watch party for ${roomData?.name || 'a live screening'} 🍿`;
    const messageData = {
      text: inviteText,
      senderId: currentUser.uid,
      timestamp: database.ServerValue.TIMESTAMP,
      type: 'watch_party_invite',
      roomId: roomData?.roomId || '',
      roomName: roomData?.name || 'Watch Party',
      streamUrl: roomData?.streamUrl || '',
      thumbnail: roomData?.thumbnail || '',
      seen: false,
      status: 'sent',
    };

    const newMessageRef = db.ref(`chats/${chatId}/messages`).push();
    await newMessageRef.set(messageData);

    const updates = {};
    updates[`user_chats/${currentUser.uid}/${chatId}/lastMessage`] = inviteText;
    updates[`user_chats/${currentUser.uid}/${chatId}/lastMessageTimestamp`] = database.ServerValue.TIMESTAMP;
    if (otherUserId) {
      updates[`user_chats/${otherUserId}/${chatId}/lastMessage`] = inviteText;
      updates[`user_chats/${otherUserId}/${chatId}/lastMessageTimestamp`] = database.ServerValue.TIMESTAMP;
    }
    await db.ref().update(updates);
  };

  // Trigger watch party invite with real active rooms from RTDB
  const handleTriggerWatchPartyInvite = async () => {
    const currentUser = auth().currentUser;
    if (!currentUser) return;
    try {
      const snapshot = await database().ref('rooms').once('value');
      const val = snapshot.val();
      if (val) {
        // Find rooms created by currentUser or active rooms
        const userRooms = Object.values(val).filter(
          r => r && (r.creator?.email === currentUser?.email || r.creator?.uid === currentUser?.uid)
        );
        const anyRooms = Object.values(val).filter(r => r && r.name);

        const targetRoom = userRooms.length > 0 ? userRooms[0] : (anyRooms.length > 0 ? anyRooms[0] : null);

        if (targetRoom) {
          sendWatchPartyInvite(targetRoom);
          return;
        }
      }
      // If no rooms exist, prompt user to create a room
      Alert.alert(
        'No Active Rooms',
        "You don't have an active watch party room yet. Would you like to create one now?",
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Create Room', onPress: () => navigation.navigate('CreateRoom') },
        ]
      );
    } catch (err) {
      console.error('Error fetching rooms for invite:', err);
    }
  };

  // ── Long Press Message Action Handlers ──
  const handleMessageLongPress = (msg) => {
    setSelectedMessage(msg);
    setShowMessageActionModal(true);
  };

  // Delete message for the current user only
  const handleDeleteForMe = async () => {
    if (!selectedMessage || !chatId) return;
    const currentUid = auth().currentUser?.uid;
    if (!currentUid) return;

    try {
      await database()
        .ref(`chats/${chatId}/messages/${selectedMessage.id}/deletedFor/${currentUid}`)
        .set(true);
      setShowMessageActionModal(false);
      setSelectedMessage(null);
    } catch (error) {
      console.error('[Chat] Delete for me error:', error);
      Alert.alert('Error', 'Could not delete message for you.');
    }
  };

  // Delete message for all participants in chat
  const handleDeleteForEveryone = async () => {
    if (!selectedMessage || !chatId) return;
    const currentUid = auth().currentUser?.uid;
    if (!currentUid || selectedMessage.senderId !== currentUid) return;

    Alert.alert(
      'Delete for Everyone?',
      'This message will be deleted for everyone in this chat.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await database()
                .ref(`chats/${chatId}/messages/${selectedMessage.id}`)
                .update({
                  deletedForEveryone: true,
                  deletedAt: database.ServerValue.TIMESTAMP,
                  text: 'This message was deleted',
                });

              // Also update lastMessage in user_chats if needed
              const updates = {};
              updates[`user_chats/${currentUid}/${chatId}/lastMessage`] = 'This message was deleted';
              if (otherUserId) {
                updates[`user_chats/${otherUserId}/${chatId}/lastMessage`] = 'This message was deleted';
              }
              await database().ref().update(updates);

              setShowMessageActionModal(false);
              setSelectedMessage(null);
            } catch (error) {
              console.error('[Chat] Delete for everyone error:', error);
              Alert.alert('Error', 'Could not delete message for everyone.');
            }
          },
        },
      ]
    );
  };

  const setupUserPresence = () => {
    if (!auth().currentUser) return;
    const db = database();
    const userStatusRef = db.ref(`users/${auth().currentUser.uid}/status`);
    userStatusRef.set('online');

    const connectedRef = db.ref('.info/connected');
    connectedRef.on('value', (snapshot) => {
      if (snapshot.val() === false) {
        userStatusRef.set('offline');
      } else {
        userStatusRef.set('online');
      }
    });
  };

  // ── PHOTO PICKING & EPHEMERAL VIEW-ONCE LOGIC (No Storage) ──

  // Request Android Camera Permission
  const requestCameraPermission = async () => {
    if (Platform.OS !== 'android') return true;
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
        {
          title: 'Camera Permission',
          message: 'Cine-Sync requires access to your camera to take and share photos.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn('Camera permission request error:', err);
      return false;
    }
  };

  // Launch Camera with base64 compression for direct RTDB transport
  const handlePickCamera = async () => {
    setShowAttachments(false);
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      Alert.alert('Permission Denied', 'Camera permission is required to capture photos.');
      return;
    }

    try {
      const result = await launchCamera({
        mediaType: 'photo',
        cameraType: 'back',
        quality: 0.6,
        maxWidth: 720,
        maxHeight: 720,
        includeBase64: true,
        saveToPhotos: false,
      });

      if (result.didCancel || !result.assets || result.assets.length === 0) return;
      const asset = result.assets[0];

      let base64String = asset.base64;
      if (!base64String && asset.uri) {
        try {
          base64String = await RNFS.readFile(asset.uri, 'base64');
        } catch (e) {
          console.warn('[RNFS] Camera base64 fallback error:', e);
        }
      }
      const dataUri = base64String
        ? `data:${asset.type || 'image/jpeg'};base64,${base64String}`
        : asset.uri;

      setSelectedPhoto({
        previewUri: asset.uri || dataUri,
        uri: dataUri,
        width: asset.width || SCREEN_WIDTH,
        height: asset.height || SCREEN_HEIGHT,
        sourceType: 'Camera',
      });
      setIsViewOnce(false);
      setPhotoCaption('');
      setShowPhotoPreviewModal(true);
    } catch (err) {
      console.warn('launchCamera error:', err);
      Alert.alert('Camera Error', 'Could not access device camera.');
    }
  };

  // Launch Gallery with base64 compression for direct RTDB transport
  const handlePickGallery = async () => {
    setShowAttachments(false);
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        quality: 0.6,
        maxWidth: 720,
        maxHeight: 720,
        includeBase64: true,
      });

      if (result.didCancel || !result.assets || result.assets.length === 0) return;
      const asset = result.assets[0];

      let base64String = asset.base64;
      if (!base64String && asset.uri) {
        try {
          base64String = await RNFS.readFile(asset.uri, 'base64');
        } catch (e) {
          console.warn('[RNFS] Gallery base64 fallback error:', e);
        }
      }
      const dataUri = base64String
        ? `data:${asset.type || 'image/jpeg'};base64,${base64String}`
        : asset.uri;

      setSelectedPhoto({
        previewUri: asset.uri || dataUri,
        uri: dataUri,
        width: asset.width || SCREEN_WIDTH,
        height: asset.height || SCREEN_HEIGHT,
        sourceType: 'Gallery',
      });
      setIsViewOnce(false);
      setPhotoCaption('');
      setShowPhotoPreviewModal(true);
    } catch (err) {
      console.warn('launchImageLibrary error:', err);
      Alert.alert('Gallery Error', 'Could not open image gallery.');
    }
  };

  // Send photo to chat (decoupled media_blobs in RTDB + local disk cache)
  const handleSendPhoto = async () => {
    if (!selectedPhoto || !chatId || isSendingPhoto) return;
    const currentUser = auth().currentUser;
    if (!currentUser) return;

    setIsSendingPhoto(true);
    const photoDataUri = selectedPhoto.uri;
    const caption = photoCaption.trim();
    const sendAsViewOnce = isViewOnce;

    // Dismiss preview modal immediately
    setShowPhotoPreviewModal(false);
    setSelectedPhoto(null);
    setPhotoCaption('');
    setIsViewOnce(false);

    try {
      // Decouple heavy Base64 image into media_blobs node + local disk cache
      const mediaId = await uploadMediaBlob(photoDataUri, currentUser.uid);

      const messagesRef = database().ref(`chats/${chatId}/messages`);
      const newMsgRef = messagesRef.push();

      const messagePayload = {
        id: newMsgRef.key,
        type: 'image',
        mediaId: mediaId || '',
        imageUri: '', // Decoupled from message payload: keeps messages under 1KB
        caption: caption,
        viewOnce: sendAsViewOnce,
        opened: false,
        senderId: currentUser.uid,
        timestamp: database.ServerValue.TIMESTAMP,
        seen: false,
        status: 'sent',
      };

      await newMsgRef.set(messagePayload);

      // Update user_chats preview for both users
      const previewText = sendAsViewOnce
        ? '📷 View-once photo'
        : (caption ? `📷 ${caption}` : '📷 Photo');

      const updates = {};
      updates[`user_chats/${currentUser.uid}/${chatId}/lastMessage`] = previewText;
      updates[`user_chats/${currentUser.uid}/${chatId}/lastMessageTimestamp`] = database.ServerValue.TIMESTAMP;
      if (otherUserId) {
        updates[`user_chats/${otherUserId}/${chatId}/lastMessage`] = previewText;
        updates[`user_chats/${otherUserId}/${chatId}/lastMessageTimestamp`] = database.ServerValue.TIMESTAMP;
      }
      await database().ref().update(updates);
    } catch (error) {
      console.error('Error sending photo:', error);
      Alert.alert('Send Error', 'Failed to send photo. Please try again.');
    } finally {
      setIsSendingPhoto(false);
    }
  };

  // Handle tapping on a View-Once ephemeral photo
  const handleViewOncePhotoPress = async (item) => {
    const currentUid = auth().currentUser?.uid;
    const isMyMessage = item.senderId === currentUid;

    if (item.opened) {
      Alert.alert(
        'Photo Expired',
        'This view-once photo has already been opened and is no longer available.'
      );
      return;
    }

    if (isMyMessage) {
      Alert.alert(
        'View-Once Photo',
        'You sent this photo as view-once. It can only be opened once by the recipient.'
      );
      return;
    }

    if (!item.imageUri && !item.mediaId) {
      Alert.alert('Unavailable', 'This photo is no longer available.');
      return;
    }

    // Resolve media URI on-demand (checks local disk cache first, else fetches once from media_blobs)
    let uri = item.imageUri;
    if (item.mediaId) {
      uri = await resolveMediaUri(item.mediaId, item.imageUri);
    }

    if (!uri) {
      Alert.alert('Unavailable', 'This photo is no longer available or has expired.');
      return;
    }

    // Recipient opens the view-once photo
    setFullscreenImage({
      uri: uri,
      caption: item.caption,
      isViewOnce: true,
      messageId: item.id,
      mediaId: item.mediaId || null,
    });
  };

  // Close fullscreen photo viewer (if view-once, marks opened, wipes imageUri, and purges blob)
  const handleCloseFullscreenImage = () => {
    if (fullscreenImage && fullscreenImage.isViewOnce && fullscreenImage.messageId && chatId) {
      const msgId = fullscreenImage.messageId;
      const mediaId = fullscreenImage.mediaId;

      // Mark opened and clear references to enforce single viewing and save RTDB bandwidth
      database().ref(`chats/${chatId}/messages/${msgId}`).update({
        opened: true,
        openedAt: database.ServerValue.TIMESTAMP,
        imageUri: '',
        mediaId: '',
      }).catch((e) => console.warn('Error marking view-once opened:', e));

      // Purge heavy Base64 from RTDB and local disk cache to reclaim free quota
      if (mediaId) {
        deleteMediaBlob(mediaId).catch((e) => console.warn('Error deleting media blob:', e));
      }
    }
    setFullscreenImage(null);
  };

  // Render Message Item
  const renderMessage = ({ item, index }) => {
    const isMyMessage = item.senderId === auth().currentUser?.uid;

    const dateSeparator = (() => {
      const currentMessageDate = new Date(item.timestamp || Date.now());
      const previousMessage = index > 0 ? messages[index - 1] : null;
      const previousMessageDate = previousMessage ? new Date(previousMessage.timestamp || Date.now()) : null;

      if (!previousMessageDate || !isSameDay(currentMessageDate, previousMessageDate)) {
        return (
          <View style={styles.dateSeparator}>
            <View style={styles.dateLine} />
            <Text style={styles.dateText}>{getDateLabel(currentMessageDate)}</Text>
            <View style={styles.dateLine} />
          </View>
        );
      }
      return null;
    })();

    // ── DELETED FOR EVERYONE MESSAGE ──
    if (item.deletedForEveryone) {
      return (
        <View style={styles.messageOuterWrap}>
          {dateSeparator}
          <TouchableOpacity
            activeOpacity={0.8}
            onLongPress={() => handleMessageLongPress(item)}
            style={[
              styles.deletedBubbleContainer,
              isMyMessage ? styles.myDeletedBubble : styles.theirDeletedBubble,
            ]}
          >
            <MaterialIcons
              name="block"
              size={13}
              color={colors.SUB_TITLE_COLOR}
              style={{ marginRight: 6 }}
            />
            <Text style={styles.deletedBubbleText}>
              {isMyMessage ? 'You deleted this message' : 'This message was deleted'}
            </Text>
            <Text style={styles.deletedBubbleTime}>
              {new Date(item.timestamp || Date.now()).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    // ── CALL LOG MESSAGE TILE (WhatsApp Style) ──
    if (item.type === 'call') {
      const isCaller = item.callerId === auth().currentUser?.uid;
      const isVideo = item.callType === 'video';
      const isMissed =
        item.callStatus === 'missed' ||
        item.callStatus === 'declined' ||
        item.callStatus === 'cancelled';

      const mins = Math.floor((item.duration || 0) / 60);
      const secs = (item.duration || 0) % 60;
      const durationLabel = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

      let title = isVideo ? 'Video call' : 'Voice call';
      let subtitle = durationLabel;
      let iconName = isVideo ? 'videocam' : 'call';
      let iconColor = colors.ACCEPT_GREEN;
      let badgeBg = 'rgba(0, 200, 83, 0.15)';

      if (isMissed) {
        iconColor = colors.LIVE_RED;
        badgeBg = 'rgba(239, 68, 68, 0.15)';
        if (!isCaller) {
          title = isVideo ? 'Missed video call' : 'Missed voice call';
          subtitle = 'Tap to call back';
          iconName = isVideo ? 'videocam-off' : 'call-missed';
        } else {
          title = isVideo ? 'Video call' : 'Voice call';
          subtitle = item.callStatus === 'declined' ? 'Declined' : 'No answer';
          iconName = isVideo ? 'videocam' : 'call-made';
        }
      }

      return (
        <View style={styles.messageOuterWrap}>
          {dateSeparator}
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => {
              Alert.alert(
                isVideo ? 'Video Call' : 'Voice Call',
                `Call ${otherUsername}?`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Call',
                    onPress: () => startCall(isVideo ? 'video' : 'audio'),
                  },
                ]
              );
            }}
            onLongPress={() => handleMessageLongPress(item)}
            style={[
              styles.callTileCard,
              isMyMessage ? styles.myCallTileCard : styles.theirCallTileCard,
            ]}
          >
            <View style={styles.callTileMainRow}>
              {/* Call Icon Badge */}
              <View style={[styles.callTileIconBadge, { backgroundColor: badgeBg }]}>
                <MaterialIcons name={iconName} size={22} color={iconColor} />
              </View>

              {/* Text Info */}
              <View style={styles.callTileTextCol}>
                <Text
                  style={[
                    styles.callTileTitle,
                    isMissed && !isCaller && { color: colors.LIVE_RED },
                  ]}
                  numberOfLines={1}
                >
                  {title}
                </Text>
                <Text
                  style={[
                    styles.callTileSubtitle,
                    isMissed && !isCaller && { color: colors.CYAN_ACCENT },
                  ]}
                  numberOfLines={1}
                >
                  {subtitle}
                </Text>
              </View>

              {/* Direct Call Back Button */}
              <TouchableOpacity
                style={styles.callTileCallbackBtn}
                onPress={() => startCall(isVideo ? 'video' : 'audio')}
                activeOpacity={0.7}
              >
                <MaterialIcons
                  name={isVideo ? 'videocam' : 'call'}
                  size={18}
                  color={colors.CYAN_ACCENT}
                />
              </TouchableOpacity>
            </View>

            {/* Footer with Timestamp & Seen Status */}
            <View style={styles.callTileFooter}>
              <Text style={styles.callTileTimestamp}>
                {new Date(item.timestamp || Date.now()).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
              {isMyMessage && (
                <View style={styles.seenReceiptRow}>
                  <MaterialIcons
                    name={item.seen || item.status === 'seen' ? 'done-all' : 'done'}
                    size={14}
                    color={item.seen || item.status === 'seen' ? colors.CYAN_ACCENT : 'rgba(255, 255, 255, 0.65)'}
                    style={{ marginLeft: 4 }}
                  />
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>
      );
    }

    // ── EMBEDDED WATCH PARTY INVITATION CARD IN CHAT ──
    if (item.type === 'watch_party_invite') {
      return (
        <View style={styles.messageOuterWrap}>
          {dateSeparator}
          <TouchableOpacity
            activeOpacity={0.92}
            onLongPress={() => handleMessageLongPress(item)}
            style={[styles.inviteCardTile, isMyMessage ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}
          >
            {item.thumbnail ? (
              <ImageBackground
                source={{ uri: item.thumbnail }}
                style={styles.inviteTileBanner}
                imageStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
              >
                <LinearGradient
                  colors={['rgba(15, 15, 26, 0.2)', colors.SURFACE_COLOR]}
                  style={styles.inviteTileGradient}
                >
                  <View style={styles.inviteBadgeRow}>
                    <View style={styles.liveSyncBadge}>
                      <View style={styles.livePingDot} />
                      <Text style={styles.liveSyncText}>WATCH PARTY INVITE</Text>
                    </View>
                    <View style={styles.hdrTag}>
                      <Text style={styles.hdrText}>SYNC</Text>
                    </View>
                  </View>
                </LinearGradient>
              </ImageBackground>
            ) : (
              <LinearGradient
                colors={['#1E1B4B', colors.SURFACE_COLOR]}
                style={styles.inviteTileBanner}
              >
                <View style={styles.inviteTileGradient}>
                  <View style={styles.inviteBadgeRow}>
                    <View style={styles.liveSyncBadge}>
                      <View style={styles.livePingDot} />
                      <Text style={styles.liveSyncText}>WATCH PARTY INVITE</Text>
                    </View>
                    <View style={styles.hdrTag}>
                      <Text style={styles.hdrText}>SYNC</Text>
                    </View>
                  </View>
                </View>
              </LinearGradient>
            )}

            <View style={styles.inviteTileBody}>
              <Text style={styles.inviteCategory}>INCOMING INVITATION</Text>
              <Text style={styles.inviteMovieTitle}>{item.roomName || 'Watch Party'}</Text>
              <Text style={styles.inviteSubtext}>
                {isMyMessage ? 'You invited this friend' : `${otherUsername} invited you to watch together`}
              </Text>

              {/* Action Button */}
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.joinPartyCtaBtn}
                onPress={() => {
                  if (item.roomId) {
                    navigation.navigate('WaitingScreen', {
                      roomId: item.roomId,
                      roomName: item.roomName || 'Watch Party',
                      streamUrl: item.streamUrl || '',
                    });
                  } else {
                    navigation.navigate('HomeScreen');
                  }
                }}
              >
                <LinearGradient
                  colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.joinPartyGradient}
                >
                  <MaterialIcons name="rocket-launch" size={16} color="#FFF" />
                  <Text style={styles.joinPartyText}>Accept & Join Party</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            <View style={styles.messageFooterInside}>
              <Text style={styles.timestampInside}>
                {new Date(item.timestamp || Date.now()).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
              {isMyMessage && (
                <View style={styles.seenReceiptRow}>
                  <MaterialIcons
                    name={item.seen || item.status === 'seen' ? 'done-all' : 'done'}
                    size={14}
                    color={item.seen || item.status === 'seen' ? colors.CYAN_ACCENT : 'rgba(255, 255, 255, 0.65)'}
                    style={{ marginLeft: 4 }}
                  />
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>
      );
    }

    // ── PHOTO / IMAGE MESSAGES (Regular & Ephemeral View-Once) ──
    if (item.type === 'image' || item.type === 'photo') {
      if (item.viewOnce) {
        // VIEW-ONCE (1x) EPHEMERAL MESSAGE BUBBLE
        const isOpened = Boolean(item.opened);
        return (
          <View style={styles.messageOuterWrap}>
            {dateSeparator}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => handleViewOncePhotoPress(item)}
              onLongPress={() => handleMessageLongPress(item)}
              style={[
                styles.viewOnceBubble,
                isMyMessage ? styles.myViewOnceBubble : styles.theirViewOnceBubble,
                isOpened && styles.viewOnceBubbleOpened,
              ]}
            >
              <View style={styles.viewOnceContentRow}>
                {/* 1x Badge Circle */}
                <View
                  style={[
                    styles.viewOnceBadgeCircle,
                    isOpened
                      ? styles.viewOnceBadgeCircleOpened
                      : isMyMessage
                      ? styles.viewOnceBadgeCircleMy
                      : styles.viewOnceBadgeCircleTheir,
                  ]}
                >
                  <Text
                    style={[
                      styles.viewOnceBadgeText,
                      isOpened && styles.viewOnceBadgeTextOpened,
                    ]}
                  >
                    1
                  </Text>
                </View>

                {/* Text Info */}
                <View style={styles.viewOnceTextCol}>
                  <Text
                    style={[
                      styles.viewOnceTitle,
                      isOpened && styles.viewOnceTitleOpened,
                    ]}
                  >
                    {isOpened ? 'Opened' : 'Photo'}
                  </Text>
                  <Text style={styles.viewOnceSubtext} numberOfLines={1}>
                    {isOpened
                      ? 'Expired view-once photo'
                      : isMyMessage
                      ? 'View once'
                      : 'View once • Tap to open'}
                  </Text>
                </View>

                {/* Status / Lock Icon */}
                <MaterialIcons
                  name={isOpened ? 'lock-outline' : (isMyMessage ? 'visibility-off' : 'photo-camera')}
                  size={18}
                  color={isOpened ? 'rgba(255, 255, 255, 0.35)' : (isMyMessage ? '#FFF' : colors.CYAN_ACCENT)}
                  style={{ marginLeft: 8 }}
                />
              </View>

              {/* Timestamp & Seen Receipt */}
              <View style={styles.viewOnceFooter}>
                <Text style={styles.viewOnceTimestamp}>
                  {new Date(item.timestamp || Date.now()).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
                {isMyMessage && (
                  <View style={styles.seenReceiptRow}>
                    <MaterialIcons
                      name={item.seen || item.status === 'seen' ? 'done-all' : 'done'}
                      size={14}
                      color={item.seen || item.status === 'seen' ? colors.CYAN_ACCENT : 'rgba(255, 255, 255, 0.65)'}
                      style={{ marginLeft: 4 }}
                    />
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </View>
        );
      }

      // REGULAR PHOTO MESSAGE BUBBLE
      return (
        <View style={styles.messageOuterWrap}>
          {dateSeparator}
          <ChatImageThumbnail
            item={item}
            isMyMessage={isMyMessage}
            onOpenFullscreen={(uri, caption) =>
              setFullscreenImage({
                uri,
                caption,
                isViewOnce: false,
              })
            }
            onLongPress={handleMessageLongPress}
          />
        </View>
      );
    }

    // ── REGULAR CHAT BUBBLES ──
    return (
      <View style={styles.messageOuterWrap}>
        {dateSeparator}
        <TouchableOpacity
          activeOpacity={0.85}
          onLongPress={() => handleMessageLongPress(item)}
          style={[
            styles.messageContainer,
            isMyMessage ? styles.myMessage : styles.theirMessage,
          ]}
        >
          <Text style={[styles.messageText, isMyMessage && { color: '#FFF' }]}>
            {item.text}
          </Text>

          <View style={styles.messageFooter}>
            <Text style={[styles.timestamp, isMyMessage && { color: 'rgba(255, 255, 255, 0.7)' }]}>
              {new Date(item.timestamp || Date.now()).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
            {/* Read / Seen Receipt Checks */}
            {isMyMessage && (
              item.seen || item.status === 'seen' ? (
                <View style={styles.seenReceiptRow}>
                  <MaterialIcons
                    name="done-all"
                    size={15}
                    color={colors.CYAN_ACCENT}
                    style={{ marginLeft: 4 }}
                  />
                </View>
              ) : (
                <View style={styles.seenReceiptRow}>
                  <MaterialIcons
                    name="done"
                    size={14}
                    color="rgba(255, 255, 255, 0.65)"
                    style={{ marginLeft: 4 }}
                  />
                </View>
              )
            )}
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  // ── RENDER MESSAGE ACTION MODAL (Delete / Info) ──
  const renderMessageActionModal = () => {
    if (!selectedMessage) return null;

    const currentUid = auth().currentUser?.uid;
    const isMyMessage = selectedMessage.senderId === currentUid;
    const isDeleted = selectedMessage.deletedForEveryone;

    return (
      <Modal
        visible={showMessageActionModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowMessageActionModal(false);
          setSelectedMessage(null);
        }}
      >
        <TouchableOpacity
          style={styles.actionModalBackdrop}
          activeOpacity={1}
          onPress={() => {
            setShowMessageActionModal(false);
            setSelectedMessage(null);
          }}
        >
          <TouchableOpacity activeOpacity={1} style={styles.actionModalSheet}>
            {/* Draggable Handle Indicator */}
            <View style={styles.actionHandleBar} />

            {/* Message Preview Snippet */}
            <View style={styles.actionPreviewWrap}>
              <View style={styles.actionSenderRow}>
                <Text style={styles.actionSenderLabel}>
                  {isMyMessage ? 'You' : otherUsername}
                </Text>
                <Text style={styles.actionTimestampLabel}>
                  {new Date(selectedMessage.timestamp || Date.now()).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
              <Text style={styles.actionPreviewText} numberOfLines={2}>
                {selectedMessage.text}
              </Text>
              {isMyMessage && !isDeleted && (
                <View style={styles.actionSeenStatusRow}>
                  <MaterialIcons
                    name={selectedMessage.seen ? 'done-all' : 'done'}
                    size={14}
                    color={selectedMessage.seen ? colors.CYAN_ACCENT : colors.MUTED_COLOR}
                  />
                  <Text
                    style={[
                      styles.actionSeenStatusText,
                      selectedMessage.seen && { color: colors.CYAN_ACCENT },
                    ]}
                  >
                    {selectedMessage.seen ? `Seen by ${otherUsername}` : 'Delivered (Not seen yet)'}
                  </Text>
                </View>
              )}
            </View>

            {/* Actions List */}
            <View style={styles.actionButtonsList}>
              {/* Delete for Me Button */}
              <TouchableOpacity
                style={styles.actionItemBtn}
                activeOpacity={0.75}
                onPress={handleDeleteForMe}
              >
                <View style={styles.actionIconWrap}>
                  <MaterialIcons name="delete-outline" size={20} color={colors.TITLE_COLOR} />
                </View>
                <View style={styles.actionItemTextGroup}>
                  <Text style={styles.actionItemTitle}>Delete for me</Text>
                  <Text style={styles.actionItemSubtitle}>Remove this message from your device</Text>
                </View>
              </TouchableOpacity>

              {/* Delete for Everyone Button (Only available if sender of message) */}
              {isMyMessage && !isDeleted && (
                <TouchableOpacity
                  style={styles.actionItemBtn}
                  activeOpacity={0.75}
                  onPress={handleDeleteForEveryone}
                >
                  <View style={[styles.actionIconWrap, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                    <MaterialIcons name="delete-forever" size={20} color={colors.LIVE_RED} />
                  </View>
                  <View style={styles.actionItemTextGroup}>
                    <Text style={[styles.actionItemTitle, { color: colors.LIVE_RED }]}>
                      Delete for everyone
                    </Text>
                    <Text style={styles.actionItemSubtitle}>
                      Remove message for all participants
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Cancel Button */}
              <TouchableOpacity
                style={styles.actionCancelBtn}
                activeOpacity={0.75}
                onPress={() => {
                  setShowMessageActionModal(false);
                  setSelectedMessage(null);
                }}
              >
                <Text style={styles.actionCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  };

  // Render Attachment Bottom Sheet Modal
  const renderAttachmentModal = () => {
    const attachments = [
      {
        icon: 'confirmation-number',
        color: colors.PURPLE_ACCENT,
        label: 'Watch Invite',
        badge: 'LIVE',
        badgeColor: colors.LIVE_RED,
        onPress: () => {
          setShowAttachments(false);
          handleTriggerWatchPartyInvite();
        },
      },
      {
        icon: 'camera-alt',
        color: colors.PRIMARY_COLOR,
        label: 'Camera',
        onPress: handlePickCamera,
      },
      {
        icon: 'photo-library',
        color: colors.CYAN_ACCENT,
        label: 'Photos',
        onPress: handlePickGallery,
      },
      {
        icon: 'mic',
        color: '#FF9500',
        label: 'Audio Note',
        onPress: () => {
          setShowAttachments(false);
          Alert.alert('Audio Note', 'Record voice message');
        },
      },
      {
        icon: 'location-on',
        color: colors.ACCEPT_GREEN,
        label: 'Location',
        onPress: () => {
          setShowAttachments(false);
          Alert.alert('Location', 'Share live location with friend');
        },
      },
      {
        icon: 'insert-drive-file',
        color: colors.FILM_GOLD,
        label: 'Document',
        onPress: () => {
          setShowAttachments(false);
          Alert.alert('Document', 'Attach document or file');
        },
      },
      {
        icon: 'person-add',
        color: '#EC4899',
        label: 'Contact',
        onPress: () => {
          setShowAttachments(false);
          Alert.alert('Contact Card', 'Share contact details');
        },
      },
      {
        icon: 'movie',
        color: '#8B5CF6',
        label: 'Movie Pick',
        badge: 'SYNC',
        badgeColor: colors.PRIMARY_COLOR,
        onPress: () => {
          setShowAttachments(false);
          handleTriggerWatchPartyInvite();
        },
      },
    ];

    return (
      <Modal
        visible={showAttachments}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAttachments(false)}
        statusBarTranslucent
      >
        <View style={styles.modalBackdrop}>
          {/* Backdrop overlay: tapping outside closes the bottom sheet */}
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setShowAttachments(false)}
          />

          {/* Bottom Sheet Card */}
          <View
            style={[
              styles.attachmentModalSheet,
              { paddingBottom: Math.max(insets.bottom, 16) + 10 },
            ]}
          >
            {/* Sheet handle bar indicator */}
            <View style={styles.modalHandleBar} />

            {/* Modal Header */}
            <View style={styles.attachmentPanelHeader}>
              <View style={styles.headerTitleCol}>
                <Text style={styles.attachmentPanelTitle}>Media & Attachments</Text>
                <Text style={styles.attachmentPanelSubtitle}>
                  Choose an option to share or host a Watch Party
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setShowAttachments(false)}
                activeOpacity={0.8}
              >
                <MaterialIcons name="close" size={18} color={colors.SUB_TITLE_COLOR} />
              </TouchableOpacity>
            </View>

            {/* Grid of Attachment Options (Guaranteed 4 items per row x 2 rows) */}
            <View style={styles.attachmentGrid}>
              {attachments.map((att, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.attachmentItem}
                  activeOpacity={0.75}
                  onPress={att.onPress}
                >
                  <View
                    style={[
                      styles.attachmentButtonCircle,
                      { backgroundColor: att.color + '18', borderColor: att.color + '4D' },
                    ]}
                  >
                    <MaterialIcons name={att.icon} size={25} color={att.color} />
                    {att.badge && (
                      <View style={[styles.itemBadge, { backgroundColor: att.badgeColor || colors.LIVE_RED }]}>
                        <Text style={styles.itemBadgeText}>{att.badge}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.attachmentLabelText} numberOfLines={1}>
                    {att.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  // ── 1. RENDER STITCH AI VIDEO CALL VIEW (Live Screening Call) ──
  const renderVideoCallView = () => {
    const username = otherUsername;

    return (
      <View style={StyleSheet.absoluteFillObject}>
        {/* Fullscreen Remote Video Feed */}
        <View style={StyleSheet.absoluteFillObject}>
          {remoteStream ? (
            <RTCView
              streamURL={remoteStream.toURL()}
              style={videoCallStyles.fullscreenRemoteVideo}
              objectFit="cover"
              zOrder={0}
            />
          ) : (
            <View style={videoCallStyles.fullscreenWaitingWrap}>
              <LinearGradient
                colors={['#0F0F1A', '#080810', '#161625']}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={videoCallStyles.waitingAvatarWrap}>
                {otherAvatar ? (
                  <Image source={{ uri: otherAvatar }} style={videoCallStyles.waitingAvatarImage} />
                ) : (
                  <View style={videoCallStyles.waitingAvatarFallback}>
                    <Text style={videoCallStyles.waitingAvatarText}>
                      {username?.[0]?.toUpperCase() || 'C'}
                    </Text>
                  </View>
                )}
                <View style={videoCallStyles.waitingPulseDot} />
              </View>
              <Text style={videoCallStyles.waitingCallerName}>{username}</Text>
              <Text style={videoCallStyles.waitingCallStatus}>
                {callState === 'calling' ? 'Calling...' : 'Connecting video stream...'}
              </Text>
            </View>
          )}

          {/* Top Vignette Gradient for Status Contrast */}
          <LinearGradient
            colors={['rgba(8, 8, 16, 0.92)', 'rgba(8, 8, 16, 0.45)', 'transparent']}
            style={videoCallStyles.topVignette}
            pointerEvents="none"
          />

          {/* Bottom Vignette Gradient for Controls Contrast */}
          <LinearGradient
            colors={['transparent', 'rgba(8, 8, 16, 0.6)', 'rgba(8, 8, 16, 0.95)']}
            style={videoCallStyles.bottomVignette}
            pointerEvents="none"
          />
        </View>

        {/* ── TOP BAR AREA: MINIMIZE, E2EE, SYNC CTA & TELEMETRY ── */}
        <View style={[videoCallStyles.topHeaderWrap, { paddingTop: safeTopPadding }]}>
          {/* Top Row: Minimize + E2EE + Sync Screening CTA */}
          <View style={videoCallStyles.topActionRow}>
            {/* Left: Minimize / Floating Window Button */}
            <TouchableOpacity
              style={videoCallStyles.glassRoundBtn}
              onPress={() => setIsCallMinimized(true)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="keyboard-arrow-down" size={26} color="#FFF" />
            </TouchableOpacity>

            {/* Right: E2EE Badge + Screening Sync CTA */}
            <View style={videoCallStyles.topRightActions}>
              {/* End-to-End Encryption Badge */}
              <View style={videoCallStyles.e2eeBadge}>
                <MaterialIcons name="lock" size={12} color={colors.ACCEPT_GREEN} />
                <Text style={videoCallStyles.e2eeText}>E2EE</Text>
              </View>

              {/* Watch Screening Action CTA */}
              <TouchableOpacity
                style={videoCallStyles.syncScreeningBtn}
                activeOpacity={0.85}
                onPress={handleTriggerWatchPartyInvite}
              >
                <LinearGradient
                  colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={videoCallStyles.syncScreeningGradient}
                >
                  <Text style={videoCallStyles.syncScreeningText}>Sync Screening</Text>
                  <Text style={{ fontSize: 13 }}>🎬</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>

          {/* Caller Profile Card & Telemetry Panel */}
          <View style={videoCallStyles.callerTelemetryCard}>
            {/* Top Row: Name, Host Badge, Call Duration Timer */}
            <View style={videoCallStyles.callerTopRow}>
              <View style={videoCallStyles.callerNameGroup}>
                <Text style={videoCallStyles.callerNameText} numberOfLines={1}>
                  {username}
                </Text>
                <View style={videoCallStyles.hostMiniBadge}>
                  <Text style={videoCallStyles.hostMiniBadgeText}>★ HOST</Text>
                </View>
              </View>

              {/* Live Call Timer Pill with Pulsing Red Dot */}
              <View style={videoCallStyles.liveTimerPill}>
                <View
                  style={[
                    videoCallStyles.liveTimerRedDot,
                    callState === 'calling' && { backgroundColor: colors.PRIMARY_COLOR },
                  ]}
                />
                <Text style={videoCallStyles.liveTimerDigits}>
                  {callState === 'calling' ? 'Calling...' : formatDuration(callDuration)}
                </Text>
              </View>
            </View>

            {/* Bottom Row: Realtime Audio Spectrum & WebRTC Latency */}
            <View style={videoCallStyles.telemetryBottomRow}>
              <View style={videoCallStyles.audioSpectrumGroup}>
                <View style={videoCallStyles.miniEqBars}>
                  <Animated.View
                    style={[videoCallStyles.miniEqBar, { height: eqBars[0], backgroundColor: colors.CYAN_ACCENT }]}
                  />
                  <Animated.View
                    style={[videoCallStyles.miniEqBar, { height: eqBars[3], backgroundColor: colors.PRIMARY_COLOR }]}
                  />
                  <Animated.View
                    style={[videoCallStyles.miniEqBar, { height: eqBars[5], backgroundColor: colors.PURPLE_ACCENT }]}
                  />
                </View>
                <Text style={videoCallStyles.connectedStatusText}>
                  {callState === 'calling' ? 'Ringing...' : 'Connected'}
                </Text>
              </View>

              {/* WebRTC Latency Telemetry */}
              <View style={videoCallStyles.webrtcTelemetry}>
                <Text style={videoCallStyles.telemetrySpecs}>1080p 60fps</Text>
                <Text style={videoCallStyles.telemetryDot}>•</Text>
                <Text style={videoCallStyles.latencyText}>14ms</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── FLOATING LOCAL CAMERA PIP (Picture-in-Picture) ── */}
        <View style={[videoCallStyles.localPipCard, { top: safeTopPadding + 94 }]}>
          {localStream && !isCameraOff ? (
            <RTCView
              streamURL={localStream.toURL()}
              style={videoCallStyles.localPipVideo}
              objectFit="cover"
              mirror={true}
              zOrder={2}
            />
          ) : (
            <View style={videoCallStyles.cameraOffPlaceholder}>
              <MaterialIcons name="videocam-off" size={24} color={colors.SUB_TITLE_COLOR} />
              <Text style={videoCallStyles.camOffText}>Camera Off</Text>
            </View>
          )}

          {/* "You" Badge Indicator */}
          <View style={videoCallStyles.youBadge}>
            <View style={videoCallStyles.youDot} />
            <Text style={videoCallStyles.youBadgeText}>You</Text>
          </View>

          {/* Self Mic Speaking Wavelet Glow */}
          {!isMuted && (
            <View style={videoCallStyles.localWavelets}>
              <View style={[videoCallStyles.localWaveBar, { height: 7 }]} />
              <View style={[videoCallStyles.localWaveBar, { height: 11 }]} />
            </View>
          )}

          {/* Quick Camera Flip Overlay Icon */}
          <TouchableOpacity
            style={videoCallStyles.flipCameraBtn}
            onPress={switchCamera}
            activeOpacity={0.7}
          >
            <MaterialIcons name="flip-camera-ios" size={13} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* ── MID-OVERLAY: CINE-SYNC WATCH PARTY QUEUE & REACTIONS ── */}
        <View style={videoCallStyles.midOverlayArea}>
          {/* Cine-Sync Watch Party Queue Ribbon */}
          <View style={videoCallStyles.watchPartyRibbon}>
            <LinearGradient
              colors={['rgba(8, 8, 16, 0.92)', 'rgba(21, 18, 46, 0.88)', 'rgba(8, 8, 16, 0.92)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={videoCallStyles.watchPartyRibbonInner}
            >
              <View style={videoCallStyles.ribbonLeft}>
                <View style={videoCallStyles.ribbonPopcornIcon}>
                  <Text style={{ fontSize: 16 }}>🍿</Text>
                </View>
                <View>
                  <View style={videoCallStyles.ribbonTitleRow}>
                    <Text style={videoCallStyles.ribbonTitle}>Sync Screening</Text>
                    <View style={videoCallStyles.fourKBadge}>
                      <Text style={videoCallStyles.fourKBadgeText}>LIVE</Text>
                    </View>
                  </View>
                  <Text style={videoCallStyles.ribbonSubtext}>Co-watch stream in real-time sync</Text>
                </View>
              </View>

              <TouchableOpacity
                style={videoCallStyles.ribbonStartBtn}
                activeOpacity={0.85}
                onPress={handleTriggerWatchPartyInvite}
              >
                <Text style={videoCallStyles.ribbonStartBtnText}>Invite</Text>
                <MaterialIcons name="arrow-forward" size={12} color="#FFF" />
              </TouchableOpacity>
            </LinearGradient>
          </View>

          {/* Quick Floating Reactions Bar */}
          <View style={videoCallStyles.reactionsRow}>
            <View style={videoCallStyles.reactionsPill}>
              {['🍿', '🔥', '🚀', '❤️', '👏'].map((emoji, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={videoCallStyles.reactionMiniBtn}
                  onPress={() => sendReaction(emoji)}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 17 }}>{emoji}</Text>
                </TouchableOpacity>
              ))}
              <View style={videoCallStyles.reactionDivider} />
              <TouchableOpacity
                style={videoCallStyles.reactionPlusBtn}
                onPress={() => sendReaction('🎉')}
                activeOpacity={0.7}
              >
                <Text style={videoCallStyles.reactionPlusText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── BOTTOM ACTION CONTROL ISLAND (Glass Capsule Dock) ── */}
        <View style={[videoCallStyles.bottomControlsWrap, { paddingBottom: Math.max(insets.bottom, 16) + 6 }]}>
          <View style={videoCallStyles.glassIslandDock}>
            {/* Mic Control */}
            <TouchableOpacity
              style={videoCallStyles.islandActionBtn}
              onPress={toggleMute}
              activeOpacity={0.75}
            >
              <View style={[videoCallStyles.islandCircleBtn, isMuted && videoCallStyles.islandCircleActiveRed]}>
                <MaterialIcons
                  name={isMuted ? 'mic-off' : 'mic'}
                  size={20}
                  color={isMuted ? colors.LIVE_RED : '#F1F5F9'}
                />
              </View>
              <Text style={[videoCallStyles.islandLabel, isMuted && { color: colors.LIVE_RED }]}>
                Mic
              </Text>
            </TouchableOpacity>

            {/* Video Camera Toggle */}
            <TouchableOpacity
              style={videoCallStyles.islandActionBtn}
              onPress={toggleCamera}
              activeOpacity={0.75}
            >
              <View style={[videoCallStyles.islandCircleBtn, isCameraOff && videoCallStyles.islandCircleActiveRed]}>
                <MaterialIcons
                  name={isCameraOff ? 'videocam-off' : 'videocam'}
                  size={20}
                  color={isCameraOff ? colors.LIVE_RED : '#F1F5F9'}
                />
              </View>
              <Text style={[videoCallStyles.islandLabel, isCameraOff && { color: colors.LIVE_RED }]}>
                Camera
              </Text>
            </TouchableOpacity>

            {/* Audio Output Speaker */}
            <TouchableOpacity
              style={videoCallStyles.islandActionBtn}
              onPress={toggleSpeaker}
              activeOpacity={0.75}
            >
              <View style={[videoCallStyles.islandCircleBtn, isSpeaker && videoCallStyles.islandCircleActiveBlue]}>
                <MaterialIcons
                  name={isSpeaker ? 'volume-up' : 'volume-down'}
                  size={20}
                  color={isSpeaker ? colors.CYAN_ACCENT : '#F1F5F9'}
                />
              </View>
              <Text style={[videoCallStyles.islandLabel, isSpeaker && { color: colors.CYAN_ACCENT }]}>
                Speaker
              </Text>
            </TouchableOpacity>

            {/* Cine Watch Mode Button */}
            <TouchableOpacity
              style={videoCallStyles.islandActionBtn}
              onPress={handleTriggerWatchPartyInvite}
              activeOpacity={0.75}
            >
              <View style={[videoCallStyles.islandCircleBtn, videoCallStyles.islandCircleActivePurple]}>
                <MaterialIcons name="movie" size={20} color="#D8B4FE" />
              </View>
              <Text style={[videoCallStyles.islandLabel, { color: '#D8B4FE' }]}>Sync</Text>
            </TouchableOpacity>

            {/* End Video Call Button */}
            <TouchableOpacity
              style={videoCallStyles.islandActionBtn}
              onPress={() => endCall('ended')}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[colors.DELETE_RED_COLOR, '#DC2626']}
                style={videoCallStyles.islandLeaveBtn}
              >
                <MaterialIcons
                  name="call-end"
                  size={22}
                  color="#FFF"
                  style={{ transform: [{ rotate: '135deg' }] }}
                />
              </LinearGradient>
              <Text style={[videoCallStyles.islandLabel, { color: '#F87171', fontWeight: '700' }]}>
                Leave
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  // ── 2. RENDER STITCH AI AUDIO CALL VIEW ──
  const renderAudioCallView = () => {
    const username = otherUsername;
    const avatarUri = otherAvatar || null;
    const isVideo = callType === 'video';

    return (
      <View style={StyleSheet.absoluteFillObject}>
        {/* Ambient Top Glow matching LoginScreen */}
        <View style={callStyles.ambientTopGlow} pointerEvents="none">
          <LinearGradient
            colors={['rgba(124, 58, 237, 0.22)', 'rgba(0, 122, 255, 0.10)', 'transparent']}
            style={StyleSheet.absoluteFillObject}
          />
        </View>

        {/* Top Safe-Area Bar: Minimize + Encrypted + HD Audio */}
        <View style={[callStyles.topBar, { paddingTop: safeTopPadding }]}>
          <TouchableOpacity
            style={callStyles.minimizeBtn}
            onPress={() => setIsCallMinimized(true)}
            activeOpacity={0.8}
          >
            <MaterialIcons name="keyboard-arrow-down" size={26} color="#CBD5E1" />
          </TouchableOpacity>

          <View style={callStyles.encryptionBadge}>
            <View style={callStyles.encPingWrap}>
              <View style={callStyles.encPingDot} />
            </View>
            <MaterialIcons name="lock" size={12} color={colors.ACCEPT_GREEN} />
            <Text style={callStyles.encryptionText}>End-to-End Encrypted</Text>
          </View>

          <View style={callStyles.hdAudioBadge}>
            <Text style={callStyles.hdBadgeText}>HD AUDIO</Text>
            <View style={callStyles.miniSoundWaves}>
              <View style={[callStyles.miniWaveBar, { height: 7 }]} />
              <View style={[callStyles.miniWaveBar, { height: 12 }]} />
              <View style={[callStyles.miniWaveBar, { height: 5 }]} />
            </View>
          </View>
        </View>

        {/* Central Profile Stage */}
        <View style={callStyles.centerContent}>
          <View style={callStyles.avatarOrbitWrap}>
            <Animated.View
              style={[
                callStyles.pulseRingOuter,
                { transform: [{ scale: pulseAnim }], opacity: ringAnim },
              ]}
            />
            <Animated.View
              style={[
                callStyles.pulseRingInner,
                { transform: [{ scale: pulseAnim }] },
              ]}
            />

            <LinearGradient
              colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT, colors.CYAN_ACCENT]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={callStyles.avatarGradientRing}
            >
              <View style={callStyles.avatarFrameInner}>
                {avatarUri ? (
                  <Image style={callStyles.avatarImageLarge} source={{ uri: avatarUri }} />
                ) : (
                  <LinearGradient
                    colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]}
                    style={[callStyles.avatarImageLarge, { justifyContent: 'center', alignItems: 'center' }]}
                  >
                    <Text style={{ color: '#FFF', fontSize: 36, fontWeight: '800' }}>
                      {username?.charAt(0)?.toUpperCase() || 'U'}
                    </Text>
                  </LinearGradient>
                )}
                <View style={callStyles.headphoneBadge}>
                  <MaterialIcons name="headphones" size={13} color={colors.CYAN_ACCENT} />
                </View>
              </View>
            </LinearGradient>

            <View style={callStyles.statusPill}>
              <View
                style={[
                  callStyles.statusDot,
                  {
                    backgroundColor:
                      callState === 'connected' ? colors.ACCEPT_GREEN : colors.PRIMARY_COLOR,
                  },
                ]}
              />
              <Text style={callStyles.statusPillText}>
                {callState === 'calling'
                  ? 'Ringing...'
                  : callState === 'incoming'
                  ? 'Incoming Call'
                  : 'Connected'}
              </Text>
            </View>
          </View>

          <View style={callStyles.nameSection}>
            <View style={callStyles.nameRow}>
              <Text style={callStyles.callerNameTitle}>{username}</Text>
              <View style={callStyles.hostBadge}>
                <Text style={callStyles.hostBadgeText}>★ HOST</Text>
              </View>
            </View>
            <Text style={callStyles.callerSubtitle}>
              @{username} • Cine-Sync Room
            </Text>
          </View>

          {/* Timer and Equalizer only displayed once call is connected/received */}
          {callState === 'connected' && (
            <View style={callStyles.equalizerPill}>
              <View style={callStyles.timerRow}>
                <View style={callStyles.timerDot} />
                <Text style={callStyles.timerText}>{formatDuration(callDuration)}</Text>
              </View>
              <View style={callStyles.equalizerDivider} />
              <View style={callStyles.equalizerBarsRow}>
                {eqBars.map((bar, i) => (
                  <Animated.View
                    key={i}
                    style={[
                      callStyles.eqBar,
                      {
                        height: bar,
                        backgroundColor:
                          i % 3 === 0
                            ? colors.CYAN_ACCENT
                            : i % 2 === 0
                            ? colors.PURPLE_ACCENT
                            : colors.PRIMARY_COLOR,
                      },
                    ]}
                  />
                ))}
              </View>
              <View style={callStyles.equalizerDivider} />
              <Text style={callStyles.opusTag}>96kbps Opus</Text>
            </View>
          )}

          <View style={callStyles.syncPartyCard}>
            <LinearGradient
              colors={['rgba(22, 22, 37, 0.88)', 'rgba(15, 15, 26, 0.95)']}
              style={callStyles.syncPartyInner}
            >
              <View style={callStyles.syncPartyLeft}>
                <View style={callStyles.popcornIconWrap}>
                  <Text style={{ fontSize: 18 }}>🍿</Text>
                </View>
                <View>
                  <View style={callStyles.syncTitleRow}>
                    <Text style={callStyles.syncPartyTitle}>Sync Movie Stream</Text>
                    <View style={callStyles.syncLiveDot} />
                  </View>
                  <Text style={callStyles.syncPartySubtitle}>Watch together in 4K sync</Text>
                </View>
              </View>

              <TouchableOpacity
                style={callStyles.syncInviteBtn}
                activeOpacity={0.85}
                onPress={handleTriggerWatchPartyInvite}
              >
                <LinearGradient
                  colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={callStyles.syncInviteGradient}
                >
                  <Text style={callStyles.syncInviteBtnText}>Invite</Text>
                  <MaterialIcons name="arrow-forward" size={13} color="#FFF" />
                </LinearGradient>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        </View>

        {/* Bottom Call Controls Dock & Quick Actions */}
        <View style={[callStyles.bottomControlsWrap, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          {callState === 'connected' && (
            <View style={callStyles.reactionsShelf}>
              <Text style={callStyles.reactionsLabel}>Quick Send:</Text>
              {['❤️', '🔥', '👏', '🍿', '🚀'].map((emoji, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={callStyles.reactionBtn}
                  onPress={() => sendReaction(emoji)}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 17 }}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={callStyles.glassDock}>
            {callState === 'incoming' ? (
              <View style={callStyles.incomingActionsRow}>
                <TouchableOpacity
                  style={callStyles.incomingActionBtn}
                  onPress={declineCall}
                  activeOpacity={0.8}
                >
                  <View style={[callStyles.circleActionBtn, callStyles.declineBtn]}>
                    <MaterialIcons name="call-end" size={28} color="#FFF" />
                  </View>
                  <Text style={callStyles.actionText}>Decline</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={callStyles.incomingActionBtn}
                  onPress={answerCall}
                  activeOpacity={0.8}
                >
                  <View style={[callStyles.circleActionBtn, callStyles.acceptBtn]}>
                    <MaterialIcons name={isVideo ? 'videocam' : 'call'} size={28} color="#FFF" />
                  </View>
                  <Text style={[callStyles.actionText, { color: colors.ACCEPT_GREEN }]}>Accept</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={callStyles.dockControlsRow}>
                <TouchableOpacity
                  style={[callStyles.dockBtn, isMuted && callStyles.dockBtnActiveRed]}
                  onPress={toggleMute}
                  activeOpacity={0.75}
                >
                  <MaterialIcons
                    name={isMuted ? 'mic-off' : 'mic'}
                    size={20}
                    color={isMuted ? colors.LIVE_RED : '#E2E8F0'}
                  />
                  <Text style={[callStyles.dockBtnText, isMuted && { color: colors.LIVE_RED }]}>
                    {isMuted ? 'Unmute' : 'Mute'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[callStyles.dockBtn, isSpeaker && callStyles.dockBtnActiveBlue]}
                  onPress={toggleSpeaker}
                  activeOpacity={0.75}
                >
                  <MaterialIcons
                    name={isSpeaker ? 'volume-up' : 'volume-down'}
                    size={20}
                    color={isSpeaker ? colors.CYAN_ACCENT : '#E2E8F0'}
                  />
                  <Text style={[callStyles.dockBtnText, isSpeaker && { color: colors.CYAN_ACCENT }]}>
                    Speaker
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={callStyles.endCallBtnWrap}
                  onPress={() => endCall('ended')}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={[colors.DELETE_RED_COLOR, '#DC2626']}
                    style={callStyles.endCallBtnGradient}
                  >
                    <MaterialIcons
                      name="call-end"
                      size={26}
                      color="#FFF"
                      style={{ transform: [{ rotate: '135deg' }] }}
                    />
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={callStyles.dockBtn}
                  onPress={() => {
                    if (callType === 'audio') {
                      startCall('video');
                    } else {
                      toggleCamera();
                    }
                  }}
                  activeOpacity={0.75}
                >
                  <MaterialIcons
                    name={isCameraOff ? 'videocam-off' : 'videocam'}
                    size={20}
                    color={isCameraOff ? colors.SUB_TITLE_COLOR : '#E2E8F0'}
                  />
                  <Text style={callStyles.dockBtnText}>Video</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={callStyles.dockBtn}
                  onPress={() => setIsCallMinimized(true)}
                  activeOpacity={0.75}
                >
                  <View style={callStyles.chatNotifyDot} />
                  <MaterialIcons name="chat-bubble-outline" size={19} color="#E2E8F0" />
                  <Text style={callStyles.dockBtnText}>Chat</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  // ── 3. UNIFIED CALL MODAL ──
  const renderCallModal = () => {
    const isVisible = callState !== 'idle' && !isCallMinimized;
    const isVideo = callType === 'video';

    return (
      <Modal visible={isVisible} animationType="fade" transparent={false} statusBarTranslucent>
        <View style={callStyles.container}>
          <StatusBar backgroundColor="transparent" barStyle="light-content" translucent />
          {isVideo && callState !== 'incoming' ? renderVideoCallView() : renderAudioCallView()}
        </View>
      </Modal>
    );
  };

  // ── PHOTO PREVIEW & SEND MODAL (With View-Once 1x Option) ──
  const renderPhotoPreviewModal = () => {
    if (!selectedPhoto) return null;

    const previewUri = selectedPhoto.previewUri || selectedPhoto.uri;

    return (
      <Modal
        visible={showPhotoPreviewModal}
        transparent={false}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (!isSendingPhoto) {
            setShowPhotoPreviewModal(false);
            setSelectedPhoto(null);
            setPhotoCaption('');
            setIsViewOnce(false);
          }
        }}
      >
        <View style={styles.photoPreviewSafeContainer}>
          <StatusBar barStyle="light-content" backgroundColor={colors.BACKGROUND_COLOR} translucent />

          {/* Top Bar with safe notch padding */}
          <View style={[styles.photoPreviewHeader, { paddingTop: safeTopPadding }]}>
            <TouchableOpacity
              style={styles.photoPreviewHeaderBtn}
              onPress={() => {
                setShowPhotoPreviewModal(false);
                setSelectedPhoto(null);
                setPhotoCaption('');
                setIsViewOnce(false);
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons name="close" size={24} color={colors.TITLE_COLOR} />
            </TouchableOpacity>

            <View style={styles.photoPreviewHeaderCenter}>
              <Text style={styles.photoPreviewHeaderTitle}>
                {selectedPhoto.sourceType === 'Camera' ? 'Camera Capture' : 'Photo Preview'}
              </Text>
              <View style={styles.photoPreviewTag}>
                <MaterialIcons
                  name={selectedPhoto.sourceType === 'Camera' ? 'photo-camera' : 'photo-library'}
                  size={12}
                  color={colors.CYAN_ACCENT}
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.photoPreviewHeaderSubtitle}>
                  {selectedPhoto.sourceType === 'Camera' ? 'Direct Capture' : 'From Gallery'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.photoPreviewHeaderBtn}
              onPress={() => {
                setSelectedPhoto(null);
                setShowPhotoPreviewModal(false);
                setPhotoCaption('');
                setIsViewOnce(false);
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons name="delete-outline" size={22} color={colors.LIVE_RED} />
            </TouchableOpacity>
          </View>

          {/* Photo Display Card */}
          <View style={styles.photoPreviewImageWrap}>
            {previewUri ? (
              <Image
                source={{ uri: previewUri }}
                style={styles.photoPreviewImage}
                resizeMode="contain"
              />
            ) : null}
            {isViewOnce && (
              <View style={styles.viewOnceActiveWatermark}>
                <View style={styles.viewOnceWatermarkCircle}>
                  <Text style={styles.viewOnceWatermarkText}>1</Text>
                </View>
                <Text style={styles.viewOnceWatermarkLabel}>View-Once Active</Text>
              </View>
            )}
          </View>

          {/* Bottom Area with View Once Toggle & Caption Dock */}
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
            style={[styles.photoPreviewBottomArea, { paddingBottom: Math.max(insets.bottom, 16) }]}
          >
            {/* View Once (1x) Ephemeral Toggle Button */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setIsViewOnce(!isViewOnce)}
              style={[
                styles.viewOnceToggleBtn,
                isViewOnce ? styles.viewOnceToggleBtnActive : styles.viewOnceToggleBtnInactive,
              ]}
            >
              <View
                style={[
                  styles.viewOnceCircleBadge,
                  isViewOnce ? styles.viewOnceCircleBadgeActive : styles.viewOnceCircleBadgeInactive,
                ]}
              >
                <Text
                  style={[
                    styles.viewOnceCircleText,
                    isViewOnce ? styles.viewOnceCircleTextActive : styles.viewOnceCircleTextInactive,
                  ]}
                >
                  1
                </Text>
              </View>

              <View style={styles.viewOnceToggleTextWrap}>
                <Text
                  style={[
                    styles.viewOnceToggleTitle,
                    isViewOnce ? styles.viewOnceToggleTitleActive : styles.viewOnceToggleTitleInactive,
                  ]}
                >
                  {isViewOnce ? 'View-Once Enabled' : 'Send as View Once (1x)'}
                </Text>
                <Text style={styles.viewOnceToggleSubtitle}>
                  {isViewOnce
                    ? 'Photo can only be opened once by recipient'
                    : 'Tap to make photo expire after one view'}
                </Text>
              </View>

              <MaterialIcons
                name={isViewOnce ? 'check-circle' : 'radio-button-unchecked'}
                size={22}
                color={isViewOnce ? colors.CYAN_ACCENT : colors.SUB_TITLE_COLOR}
              />
            </TouchableOpacity>

            {/* Caption Input & Send Action Row */}
            <View style={styles.photoCaptionRow}>
              <View style={styles.photoCaptionInputWrap}>
                <TextInput
                  style={styles.photoCaptionInput}
                  placeholder="Add a caption..."
                  placeholderTextColor={colors.MUTED_COLOR}
                  value={photoCaption}
                  onChangeText={setPhotoCaption}
                  multiline={false}
                  returnKeyType="send"
                  onSubmitEditing={handleSendPhoto}
                />
              </View>

              <TouchableOpacity
                style={styles.photoSendBtn}
                onPress={handleSendPhoto}
                activeOpacity={0.85}
                disabled={isSendingPhoto}
              >
                <LinearGradient
                  colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.photoSendGradient}
                >
                  {isSendingPhoto ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <MaterialIcons name="send" size={20} color="#FFF" />
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    );
  };

  // ── FULLSCREEN IMAGE VIEWER MODAL ──
  const renderFullscreenImageModal = () => {
    if (!fullscreenImage) return null;

    return (
      <Modal
        visible={Boolean(fullscreenImage)}
        transparent={false}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={handleCloseFullscreenImage}
      >
        <View style={styles.fullscreenSafeContainer}>
          <StatusBar barStyle="light-content" backgroundColor="#000000" translucent />

          {/* Header with notch protection */}
          <View style={[styles.fullscreenHeader, { paddingTop: safeTopPadding }]}>
            <TouchableOpacity
              style={styles.fullscreenCloseBtn}
              onPress={handleCloseFullscreenImage}
              activeOpacity={0.8}
            >
              <MaterialIcons name="close" size={26} color="#FFF" />
            </TouchableOpacity>

            <View style={styles.fullscreenHeaderCenter}>
              {fullscreenImage.isViewOnce ? (
                <View style={styles.fullscreenViewOnceBadge}>
                  <View style={styles.fullscreenViewOnceCircleBadge}>
                    <Text style={styles.fullscreenViewOnceCircleText}>1</Text>
                  </View>
                  <Text style={styles.fullscreenViewOnceBadgeText}>View-Once Photo</Text>
                </View>
              ) : (
                <Text style={styles.fullscreenHeaderTitle}>{otherUsername}</Text>
              )}
            </View>

            <View style={{ width: 40 }} />
          </View>

          {/* Fullscreen Image Container */}
          <View style={styles.fullscreenImageContainer}>
            <Image
              source={{ uri: fullscreenImage.uri }}
              style={styles.fullscreenFullImage}
              resizeMode="contain"
            />
          </View>

          {/* Footer Notice & Caption */}
          <View style={[styles.fullscreenFooter, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            {fullscreenImage.isViewOnce && (
              <View style={styles.fullscreenViewOnceWarningPill}>
                <MaterialIcons name="info-outline" size={16} color={colors.FILM_GOLD} />
                <Text style={styles.fullscreenViewOnceWarningText}>
                  This photo will expire permanently once closed.
                </Text>
              </View>
            )}

            {Boolean(fullscreenImage.caption) && (
              <View style={styles.fullscreenCaptionBox}>
                <Text style={styles.fullscreenCaptionText}>{fullscreenImage.caption}</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar backgroundColor={colors.BACKGROUND_COLOR} barStyle="light-content" translucent />

      {/* ── TOP 1-ON-1 DIRECT CHAT HEADER BAR ────────────────────── */}
      <View style={[styles.header, { paddingTop: safeTopPadding }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
          >
            <MaterialIcons name="arrow-back-ios-new" size={18} color={colors.TITLE_COLOR} />
          </TouchableOpacity>

          {/* User Avatar with Status Indicator */}
          <View style={styles.userAvatarWrap}>
            {otherAvatar ? (
              <Image source={{ uri: otherAvatar }} style={styles.userAvatarImage} />
            ) : (
              <View style={styles.userAvatarFallback}>
                <Text style={styles.avatarInitial}>{otherUsername[0]?.toUpperCase()}</Text>
              </View>
            )}
            <View
              style={[
                styles.userOnlineDot,
                { backgroundColor: otherUserStatus === 'online' ? colors.ACCEPT_GREEN : colors.MUTED_COLOR },
              ]}
            />
          </View>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {otherUsername}
            </Text>
            <Text
              style={[
                styles.headerSubtext,
                otherUserStatus === 'online' && { color: colors.ACCEPT_GREEN },
              ]}
            >
              {otherUserStatus === 'online' ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>

        {/* Right Action Icons: Audio Call, Video Call, Watch Party Invite */}
        <View style={styles.headerRightActions}>
          <TouchableOpacity
            style={styles.headerActionBtn}
            onPress={() => startCall('audio')}
            activeOpacity={0.8}
          >
            <MaterialIcons name="call" size={18} color={colors.TITLE_COLOR} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerActionBtn}
            onPress={() => startCall('video')}
            activeOpacity={0.8}
          >
            <MaterialIcons name="videocam" size={20} color={colors.TITLE_COLOR} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerInviteTicketBtn}
            onPress={handleTriggerWatchPartyInvite}
            activeOpacity={0.8}
          >
            <MaterialIcons name="confirmation-number" size={18} color={colors.PRIMARY_COLOR} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Floating In-Call Mini Bar (when call is active but minimized) */}
      {isCallMinimized && callState !== 'idle' && (
        <TouchableOpacity
          style={callStyles.minimizedCallBanner}
          activeOpacity={0.85}
          onPress={() => setIsCallMinimized(false)}
        >
          <View style={callStyles.minimizedLeft}>
            <View style={callStyles.minimizedDot} />
            <MaterialIcons
              name={callType === 'video' ? 'videocam' : 'call'}
              size={15}
              color={colors.ACCEPT_GREEN}
            />
            <Text style={callStyles.minimizedText}>
              {otherUsername} • {callState === 'calling' ? 'Ringing...' : formatDuration(callDuration)}
            </Text>
          </View>
          <View style={callStyles.minimizedRight}>
            <Text style={callStyles.minimizedReturnText}>Tap to Return</Text>
            <MaterialIcons name="open-in-full" size={13} color={colors.PRIMARY_COLOR} />
          </View>
        </TouchableOpacity>
      )}

      {/* ── CHAT MESSAGES STREAM ───────────────────────────────── */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesListPadding}
        showsVerticalScrollIndicator={false}
      />

      {/* Attachment Bottom Sheet Modal */}
      {renderAttachmentModal()}

      {/* Message Action Sheet Modal (Delete for me / Delete for everyone) */}
      {renderMessageActionModal()}

      {/* Photo Preview & Send Modal (with View-Once 1x Option) */}
      {renderPhotoPreviewModal()}

      {/* Fullscreen Photo Lightbox Modal */}
      {renderFullscreenImageModal()}

      {/* ── FLOATING BOTTOM CHAT INPUT BAR ───────────────────────── */}
      <View style={[styles.bottomInputDock, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.inputBarInner}>
          <TouchableOpacity
            style={[styles.attachBtn, showAttachments && styles.attachBtnActive]}
            onPress={() => setShowAttachments(!showAttachments)}
            activeOpacity={0.8}
          >
            <MaterialIcons
              name={showAttachments ? 'close' : 'add'}
              size={22}
              color={showAttachments ? colors.PRIMARY_COLOR : colors.TITLE_COLOR}
            />
          </TouchableOpacity>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              placeholder="Type a message..."
              placeholderTextColor={colors.MUTED_COLOR}
              value={message}
              onChangeText={setMessage}
              multiline
            />
            <TouchableOpacity style={styles.emojiBtn} activeOpacity={0.8}>
              <MaterialIcons name="sentiment-satisfied" size={20} color={colors.SUB_TITLE_COLOR} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.micBtn} activeOpacity={0.8}>
              <MaterialIcons name="mic" size={20} color={colors.CYAN_ACCENT} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.sendBtnWrap}
            onPress={sendMessage}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sendBtnGradient}
            >
              <MaterialIcons name="send" size={18} color="#FFF" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      {/* Call Modal */}
      {renderCallModal()}
    </KeyboardAvoidingView>
  );
};

// ──────────────────────────────────────────────────────────────
//  Styles
// ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
  },

  // ── Header Bar ────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: colors.BACKGROUND_COLOR,
    borderBottomWidth: 1,
    borderBottomColor: colors.BORDER_SUBTLE,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarWrap: {
    position: 'relative',
  },
  userAvatarImage: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  userAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.PRIMARY_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  userOnlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.BACKGROUND_COLOR,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 16,
    fontWeight: '800',
  },
  headerSubtext: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },

  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInviteTicketBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
  },

  // ── Messages Stream ───────────────
  messagesListPadding: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    paddingBottom: 90,
  },
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  dateLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.BORDER_SUBTLE,
  },
  dateText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '600',
    marginHorizontal: 10,
  },

  messageOuterWrap: {
    marginVertical: 4,
  },
  messageContainer: {
    maxWidth: '82%',
    padding: 12,
    borderRadius: 18,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: colors.PRIMARY_COLOR,
    borderBottomRightRadius: 4,
  },
  theirMessage: {
    alignSelf: 'flex-start',
    backgroundColor: colors.SURFACE_COLOR,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
  },
  messageText: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    lineHeight: 20,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  timestamp: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 10,
  },
  seenReceiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // ── Deleted Message Bubble Styles ──
  deletedBubbleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '82%',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  myDeletedBubble: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(22, 22, 37, 0.65)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  theirDeletedBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(15, 15, 26, 0.65)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  deletedBubbleText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 13,
    fontStyle: 'italic',
    flexShrink: 1,
  },
  deletedBubbleTime: {
    color: colors.MUTED_COLOR,
    fontSize: 9,
    marginLeft: 8,
  },

  // ── Message Action Modal (Delete / Options) Styles ──
  actionModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  actionModalSheet: {
    backgroundColor: colors.SURFACE_COLOR,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 28,
  },
  actionHandleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  actionPreviewWrap: {
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
  },
  actionSenderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  actionSenderLabel: {
    color: colors.PRIMARY_COLOR,
    fontSize: 12,
    fontWeight: '700',
  },
  actionTimestampLabel: {
    color: colors.MUTED_COLOR,
    fontSize: 10,
  },
  actionPreviewText: {
    color: colors.TITLE_COLOR,
    fontSize: 13,
    lineHeight: 18,
  },
  actionSeenStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  actionSeenStatusText: {
    fontSize: 11,
    color: colors.MUTED_COLOR,
    fontWeight: '500',
  },
  actionButtonsList: {
    gap: 8,
  },
  actionItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  actionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  actionItemTextGroup: {
    flex: 1,
  },
  actionItemTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '600',
  },
  actionItemSubtitle: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    marginTop: 2,
  },
  actionCancelBtn: {
    marginTop: 6,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: colors.SURFACE_ELEVATED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCancelText: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '600',
  },

  // Embedded Watch Party Invite Tile
  inviteCardTile: {
    width: 280,
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
    overflow: 'hidden',
    marginVertical: 6,
  },
  inviteTileBanner: {
    width: '100%',
    height: 100,
  },
  inviteTileGradient: {
    flex: 1,
    padding: 10,
  },
  inviteBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveSyncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(8, 8, 16, 0.8)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  livePingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.LIVE_RED,
  },
  liveSyncText: {
    color: colors.TITLE_COLOR,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  hdrTag: {
    backgroundColor: 'rgba(0, 122, 255, 0.3)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  hdrText: {
    color: colors.PRIMARY_COLOR,
    fontSize: 9,
    fontWeight: '800',
  },

  inviteTileBody: {
    padding: 12,
    gap: 4,
  },
  inviteCategory: {
    color: colors.CYAN_ACCENT,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  inviteMovieTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '800',
  },
  inviteSubtext: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
  },

  joinPartyCtaBtn: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  joinPartyGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 6,
  },
  joinPartyText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
  messageFooterInside: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    alignItems: 'flex-end',
  },
  timestampInside: {
    color: colors.MUTED_COLOR,
    fontSize: 10,
  },

  // ── ATTACHMENT BOTTOM SHEET MODAL ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 4, 10, 0.72)',
    justifyContent: 'flex-end',
  },
  attachmentModalSheet: {
    backgroundColor: colors.SURFACE_ELEVATED,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 8,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 24,
  },
  modalHandleBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  attachmentPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingHorizontal: 12,
  },
  headerTitleCol: {
    flex: 1,
    paddingRight: 8,
  },
  attachmentPanelTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  attachmentPanelSubtitle: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.SURFACE_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  attachmentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: 4,
  },
  attachmentItem: {
    width: '25%',
    alignItems: 'center',
    paddingVertical: 10,
  },
  attachmentButtonCircle: {
    width: 56,
    height: 56,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    position: 'relative',
  },
  itemBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  itemBadgeText: {
    color: '#FFF',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  attachmentLabelText: {
    color: colors.TITLE_COLOR,
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 7,
    textAlign: 'center',
    letterSpacing: 0.2,
  },

  // ── Bottom Input Dock ─────────────
  bottomInputDock: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.BACKGROUND_COLOR,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.BORDER_SUBTLE,
    zIndex: 100,
  },
  inputBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  attachBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachBtnActive: {
    backgroundColor: 'rgba(0, 122, 255, 0.2)',
    borderWidth: 1,
    borderColor: colors.PRIMARY_COLOR,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 20,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
  },
  textInput: {
    flex: 1,
    color: colors.TITLE_COLOR,
    fontSize: 14,
    paddingVertical: 0,
  },
  emojiBtn: {
    padding: 4,
  },
  micBtn: {
    padding: 4,
  },
  sendBtnWrap: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  sendBtnGradient: {
    width: 42,
    height: 42,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── VIEW-ONCE EPHEMERAL PHOTO MESSAGE BUBBLES ──
  viewOnceBubble: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    marginVertical: 4,
    maxWidth: SCREEN_WIDTH * 0.76,
    borderWidth: 1,
  },
  myViewOnceBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.PRIMARY_COLOR,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomRightRadius: 4,
  },
  theirViewOnceBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.SURFACE_ELEVATED,
    borderColor: 'rgba(6, 182, 212, 0.35)',
    borderBottomLeftRadius: 4,
  },
  viewOnceBubbleOpened: {
    backgroundColor: 'rgba(22, 22, 37, 0.75)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    opacity: 0.8,
  },
  viewOnceContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewOnceBadgeCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewOnceBadgeCircleMy: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderColor: '#FFFFFF',
  },
  viewOnceBadgeCircleTheir: {
    backgroundColor: 'rgba(6, 182, 212, 0.18)',
    borderColor: colors.CYAN_ACCENT,
  },
  viewOnceBadgeCircleOpened: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  viewOnceBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  viewOnceBadgeTextOpened: {
    color: colors.SUB_TITLE_COLOR,
  },
  viewOnceTextCol: {
    marginLeft: 10,
    flex: 1,
  },
  viewOnceTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  viewOnceTitleOpened: {
    color: colors.SUB_TITLE_COLOR,
  },
  viewOnceSubtext: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 11,
    marginTop: 2,
  },
  viewOnceFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 6,
  },
  viewOnceTimestamp: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.65)',
  },

  // ── CALL LOG MESSAGE TILE (WhatsApp Style) ──
  callTileCard: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    marginVertical: 4,
    minWidth: SCREEN_WIDTH * 0.62,
    maxWidth: SCREEN_WIDTH * 0.78,
    borderWidth: 1,
  },
  myCallTileCard: {
    alignSelf: 'flex-end',
    backgroundColor: colors.SURFACE_ELEVATED,
    borderColor: 'rgba(0, 122, 255, 0.28)',
    borderBottomRightRadius: 4,
  },
  theirCallTileCard: {
    alignSelf: 'flex-start',
    backgroundColor: colors.SURFACE_COLOR,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomLeftRadius: 4,
  },
  callTileMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  callTileIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  callTileTextCol: {
    flex: 1,
    justifyContent: 'center',
  },
  callTileTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  callTileSubtitle: {
    fontSize: 12,
    color: colors.SUB_TITLE_COLOR,
    fontWeight: '500',
  },
  callTileCallbackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.25)',
  },
  callTileFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  callTileTimestamp: {
    fontSize: 10,
    color: colors.SUB_TITLE_COLOR,
  },

  // ── REGULAR IMAGE MESSAGE CARDS ──
  imageMessageCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginVertical: 4,
    maxWidth: SCREEN_WIDTH * 0.72,
    borderWidth: 1,
  },
  myImageMessageCard: {
    alignSelf: 'flex-end',
    backgroundColor: colors.SURFACE_ELEVATED,
    borderColor: 'rgba(0, 122, 255, 0.35)',
    borderBottomRightRadius: 4,
  },
  theirImageMessageCard: {
    alignSelf: 'flex-start',
    backgroundColor: colors.SURFACE_COLOR,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomLeftRadius: 4,
  },
  imageThumbnail: {
    width: SCREEN_WIDTH * 0.68,
    height: 190,
    backgroundColor: '#05050A',
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
  },
  imagePlaceholder: {
    width: SCREEN_WIDTH * 0.68,
    height: 140,
    backgroundColor: colors.SURFACE_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePlaceholderText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    marginTop: 6,
  },
  imageCaptionText: {
    color: '#FFFFFF',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    lineHeight: 18,
  },
  imageCardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingBottom: 8,
    paddingTop: 4,
  },
  imageTimestamp: {
    fontSize: 10,
    color: colors.SUB_TITLE_COLOR,
  },

  // ── PHOTO PREVIEW MODAL ──
  photoPreviewSafeContainer: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
  },
  photoPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.BACKGROUND_COLOR,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  photoPreviewHeaderBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.SURFACE_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  photoPreviewHeaderCenter: {
    alignItems: 'center',
  },
  photoPreviewHeaderTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 16,
    fontWeight: '700',
  },
  photoPreviewTag: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  photoPreviewHeaderSubtitle: {
    color: colors.CYAN_ACCENT,
    fontSize: 12,
    fontWeight: '500',
  },
  photoPreviewImageWrap: {
    flex: 1,
    marginHorizontal: 14,
    marginVertical: 12,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#05050A',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  photoPreviewImage: {
    width: '100%',
    height: '100%',
  },
  viewOnceActiveWatermark: {
    position: 'absolute',
    top: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(8, 8, 16, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.CYAN_ACCENT,
  },
  viewOnceWatermarkCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.CYAN_ACCENT,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  viewOnceWatermarkText: {
    color: '#080810',
    fontSize: 11,
    fontWeight: '900',
  },
  viewOnceWatermarkLabel: {
    color: colors.CYAN_ACCENT,
    fontSize: 12,
    fontWeight: '700',
  },
  photoPreviewBottomArea: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.SURFACE_COLOR,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  viewOnceToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  viewOnceToggleBtnActive: {
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderColor: colors.CYAN_ACCENT,
  },
  viewOnceToggleBtnInactive: {
    backgroundColor: colors.SURFACE_ELEVATED,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  viewOnceCircleBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  viewOnceCircleBadgeActive: {
    backgroundColor: colors.CYAN_ACCENT,
    borderColor: colors.CYAN_ACCENT,
  },
  viewOnceCircleBadgeInactive: {
    backgroundColor: 'transparent',
    borderColor: colors.SUB_TITLE_COLOR,
  },
  viewOnceCircleText: {
    fontSize: 14,
    fontWeight: '900',
  },
  viewOnceCircleTextActive: {
    color: '#080810',
  },
  viewOnceCircleTextInactive: {
    color: colors.SUB_TITLE_COLOR,
  },
  viewOnceToggleTextWrap: {
    flex: 1,
    marginLeft: 12,
  },
  viewOnceToggleTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  viewOnceToggleTitleActive: {
    color: colors.CYAN_ACCENT,
  },
  viewOnceToggleTitleInactive: {
    color: colors.TITLE_COLOR,
  },
  viewOnceToggleSubtitle: {
    fontSize: 11,
    color: colors.SUB_TITLE_COLOR,
    marginTop: 2,
  },
  photoCaptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  photoCaptionInputWrap: {
    flex: 1,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginRight: 10,
  },
  photoCaptionInput: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    padding: 0,
  },
  photoSendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  photoSendGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── FULLSCREEN IMAGE VIEWER MODAL ──
  fullscreenSafeContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  fullscreenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    zIndex: 10,
  },
  fullscreenCloseBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenHeaderCenter: {
    flex: 1,
    alignItems: 'center',
  },
  fullscreenHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  fullscreenViewOnceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.CYAN_ACCENT,
  },
  fullscreenViewOnceCircleBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.CYAN_ACCENT,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  fullscreenViewOnceCircleText: {
    color: '#080810',
    fontSize: 12,
    fontWeight: '900',
  },
  fullscreenViewOnceBadgeText: {
    color: colors.CYAN_ACCENT,
    fontSize: 13,
    fontWeight: '700',
  },
  fullscreenImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  fullscreenFullImage: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
  fullscreenFooter: {
    paddingHorizontal: 16,
    zIndex: 10,
  },
  fullscreenViewOnceWarningPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 180, 0, 0.15)',
    borderWidth: 1,
    borderColor: colors.FILM_GOLD,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginBottom: 10,
  },
  fullscreenViewOnceWarningText: {
    color: colors.FILM_GOLD,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  fullscreenCaptionBox: {
    backgroundColor: 'rgba(15, 15, 26, 0.85)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  fullscreenCaptionText: {
    color: '#FFFFFF',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 19,
  },
});

// ── CALL MODAL & IN-CALL STYLES (Stitch AI Design) ───────────
const callStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
  },

  // ── Ambient Background matching LoginScreen ──
  ambientTopGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 380,
  },

  // ── Video Stream Views ──
  remoteVideo: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  remoteVideoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlaceholderText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 14,
    marginTop: 10,
  },
  localVideoWrapper: {
    position: 'absolute',
    right: 16,
    width: 105,
    height: 145,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.PRIMARY_COLOR,
    zIndex: 20,
  },
  localVideo: {
    width: '100%',
    height: '100%',
  },
  switchCameraBtn: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    padding: 4,
  },

  // ── Top Bar ──
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  minimizeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  encryptionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 6,
  },
  encPingWrap: {
    width: 8,
    height: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  encPingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.ACCEPT_GREEN,
  },
  encryptionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  hdAudioBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.35)',
    gap: 5,
  },
  hdBadgeText: {
    color: colors.CYAN_ACCENT,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  hdAudioText: {
    color: colors.CYAN_ACCENT,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  miniSoundWaves: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 12,
  },
  miniWaveBar: {
    width: 2.5,
    backgroundColor: colors.CYAN_ACCENT,
    borderRadius: 2,
  },

  // ── Central Profile Stage ──
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    zIndex: 5,
  },
  avatarOrbitWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  pulseRingOuter: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.35)',
  },
  pulseRingInner: {
    position: 'absolute',
    width: 156,
    height: 156,
    borderRadius: 78,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.4)',
  },
  avatarGradientRing: {
    width: 138,
    height: 138,
    borderRadius: 69,
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarFrameInner: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: colors.CARD_COLOR,
    borderWidth: 2,
    borderColor: colors.BACKGROUND_COLOR,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImageLarge: {
    width: 130,
    height: 130,
    borderRadius: 65,
  },
  headphoneBadge: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusPill: {
    position: 'absolute',
    bottom: -12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    color: '#F1F5F9',
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Name & Badges ──
  nameSection: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  callerNameTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  hostBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 180, 0, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 0, 0.5)',
  },
  hostBadgeText: {
    color: colors.FILM_GOLD,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  callerSubtitle: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },

  // ── Equalizer & Timer ──
  equalizerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(22, 22, 37, 0.88)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    gap: 10,
    marginBottom: 16,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.PRIMARY_COLOR,
  },
  timerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  equalizerDivider: {
    width: 1,
    height: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  equalizerBarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 26,
  },
  eqBar: {
    width: 3,
    borderRadius: 2,
  },
  opusTag: {
    color: colors.CYAN_ACCENT,
    fontSize: 11,
    fontWeight: '600',
  },

  // ── Watch Party Card ──
  syncPartyCard: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginTop: 4,
  },
  syncPartyInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  syncPartyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  popcornIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(124, 58, 237, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  syncPartyTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 13,
    fontWeight: '700',
  },
  syncLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.PRIMARY_COLOR,
  },
  syncPartySubtitle: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    marginTop: 1,
  },
  syncInviteBtn: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  syncInviteGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    gap: 4,
  },
  syncInviteBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Bottom Call Controls Dock ──
  bottomControlsWrap: {
    paddingHorizontal: 16,
    alignItems: 'center',
    zIndex: 10,
  },
  reactionsShelf: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 8,
    marginBottom: 12,
  },
  reactionsLabel: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '600',
    marginRight: 2,
  },
  reactionBtn: {
    padding: 3,
  },
  glassDock: {
    width: '100%',
    backgroundColor: 'rgba(19, 19, 31, 0.85)',
    borderRadius: 28,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 16,
  },
  dockControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dockBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
    position: 'relative',
  },
  dockBtnActiveRed: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: colors.LIVE_RED,
  },
  dockBtnActiveBlue: {
    backgroundColor: 'rgba(0, 122, 255, 0.2)',
    borderColor: colors.PRIMARY_COLOR,
  },
  dockBtnText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 10,
    fontWeight: '600',
  },
  chatNotifyDot: {
    position: 'absolute',
    top: 5,
    right: 7,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.PURPLE_ACCENT,
  },
  endCallBtnWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    overflow: 'hidden',
    shadowColor: colors.LIVE_RED,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  endCallBtnGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Incoming Call State ──
  incomingActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 8,
  },
  incomingActionBtn: {
    alignItems: 'center',
    gap: 6,
  },
  circleActionBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  declineBtn: {
    backgroundColor: colors.DELETE_RED_COLOR,
  },
  acceptBtn: {
    backgroundColor: colors.ACCEPT_GREEN,
  },
  actionText: {
    color: colors.TITLE_COLOR,
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Floating Minimized Call Banner ──
  minimizedCallBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.SURFACE_ELEVATED,
    marginHorizontal: 12,
    marginTop: 6,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.PRIMARY_COLOR + '55',
  },
  minimizedLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  minimizedDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.ACCEPT_GREEN,
  },
  minimizedText: {
    color: colors.TITLE_COLOR,
    fontSize: 12,
    fontWeight: '700',
  },
  minimizedRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  minimizedReturnText: {
    color: colors.PRIMARY_COLOR,
    fontSize: 11,
    fontWeight: '700',
  },
});

// ── VIDEO CALL SCREEN STYLES (Stitch AI Live Screening Design) ──
const videoCallStyles = StyleSheet.create({
  fullscreenRemoteVideo: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    backgroundColor: colors.BACKGROUND_COLOR,
  },
  fullscreenWaitingWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.BACKGROUND_COLOR,
  },
  waitingAvatarWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: colors.PRIMARY_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  waitingAvatarImage: {
    width: 114,
    height: 114,
    borderRadius: 57,
  },
  waitingAvatarFallback: {
    width: 114,
    height: 114,
    borderRadius: 57,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waitingAvatarText: {
    fontSize: 44,
    fontWeight: '700',
    color: colors.TITLE_COLOR,
  },
  waitingPulseDot: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.ACCEPT_GREEN,
    borderWidth: 3,
    borderColor: colors.BACKGROUND_COLOR,
  },
  waitingCallerName: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.TITLE_COLOR,
    marginBottom: 6,
  },
  waitingCallStatus: {
    fontSize: 14,
    color: colors.CYAN_ACCENT,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  topVignette: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  bottomVignette: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 290,
  },
  topHeaderWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    zIndex: 30,
  },
  topActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  glassRoundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  e2eeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(15, 15, 26, 0.75)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  e2eeText: {
    color: colors.ACCEPT_GREEN,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  syncScreeningBtn: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  syncScreeningGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
  },
  syncScreeningText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Caller Profile Card & Telemetry Panel ──
  callerTelemetryCard: {
    backgroundColor: 'rgba(15, 15, 26, 0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 9,
    maxWidth: 250,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  callerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  callerNameGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  callerNameText: {
    color: colors.TITLE_COLOR,
    fontSize: 13.5,
    fontWeight: '700',
    maxWidth: 120,
  },
  hostMiniBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 180, 0, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 0, 0.35)',
  },
  hostMiniBadgeText: {
    color: colors.FILM_GOLD,
    fontSize: 9,
    fontWeight: '800',
  },
  liveTimerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  liveTimerRedDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.LIVE_RED,
  },
  liveTimerDigits: {
    color: '#E2E8F0',
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  telemetryBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  audioSpectrumGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  miniEqBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 14,
    width: 16,
  },
  miniEqBar: {
    width: 2.5,
    borderRadius: 1.5,
  },
  connectedStatusText: {
    color: colors.ACCEPT_GREEN,
    fontSize: 10,
    fontWeight: '600',
  },
  webrtcTelemetry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  telemetrySpecs: {
    color: colors.CYAN_ACCENT,
    fontSize: 10,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  telemetryDot: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 10,
  },
  latencyText: {
    color: colors.ACCEPT_GREEN,
    fontSize: 10,
    fontWeight: '600',
  },

  // ── Floating Local Camera PiP Window ──
  localPipCard: {
    position: 'absolute',
    right: 16,
    width: 104,
    height: 148,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(0, 122, 255, 0.65)',
    zIndex: 35,
    backgroundColor: colors.SURFACE_COLOR,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 20,
  },
  localPipVideo: {
    width: '100%',
    height: '100%',
  },
  cameraOffPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_COLOR,
    gap: 4,
  },
  camOffText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 9,
    fontWeight: '600',
  },
  youBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  youDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.ACCEPT_GREEN,
  },
  youBadgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '700',
  },
  localWavelets: {
    position: 'absolute',
    bottom: 6,
    left: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 12,
  },
  localWaveBar: {
    width: 2,
    borderRadius: 1,
    backgroundColor: colors.CYAN_ACCENT,
  },
  flipCameraBtn: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Mid-Overlay Area: Queue Ribbon & Reactions ──
  midOverlayArea: {
    position: 'absolute',
    bottom: 96,
    left: 14,
    right: 14,
    zIndex: 30,
    gap: 8,
  },
  watchPartyRibbon: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.35)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 18,
    elevation: 12,
  },
  watchPartyRibbonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  ribbonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  ribbonPopcornIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: 'rgba(124, 58, 237, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ribbonTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ribbonTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 12.5,
    fontWeight: '700',
  },
  fourKBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(6, 182, 212, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.35)',
  },
  fourKBadgeText: {
    color: colors.CYAN_ACCENT,
    fontSize: 8.5,
    fontWeight: '800',
  },
  ribbonSubtext: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 10.5,
    marginTop: 1,
  },
  ribbonStartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  ribbonStartBtnText: {
    color: '#E9D5FF',
    fontSize: 11,
    fontWeight: '700',
  },
  reactionsRow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(15, 15, 26, 0.78)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  reactionMiniBtn: {
    padding: 2,
  },
  reactionDivider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  reactionPlusBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reactionPlusText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Bottom Action Control Island (Glass Capsule Dock) ──
  bottomControlsWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    zIndex: 40,
  },
  glassIslandDock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(8, 8, 16, 0.84)',
    borderRadius: 32,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.7,
    shadowRadius: 24,
    elevation: 20,
  },
  islandActionBtn: {
    alignItems: 'center',
    gap: 4,
  },
  islandCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  islandCircleActiveRed: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    borderColor: colors.LIVE_RED,
  },
  islandCircleActiveBlue: {
    backgroundColor: 'rgba(0, 122, 255, 0.25)',
    borderColor: colors.PRIMARY_COLOR,
  },
  islandCircleActivePurple: {
    backgroundColor: 'rgba(124, 58, 237, 0.25)',
    borderColor: 'rgba(124, 58, 237, 0.8)',
  },
  islandLeaveBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.LIVE_RED,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
  },
  islandLabel: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 10,
    fontWeight: '600',
  },
});

export default ChatScreen;