import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  StatusBar,
  Animated,
  Platform,
  PermissionsAndroid,
  KeyboardAvoidingView,
  Keyboard,
  Dimensions,
  Alert,
  Linking,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import { auth, database } from '../../../config/firebase';
import { useAudioCall } from '../../../webRTC/useAudioCall';
import colors from '../../../theme/Colors';
import { uploadMediaBlob, resolveMediaUri, deleteMediaBlob } from '../../../functions/mediaService';
import { showCineAlert } from '../../../components/CineAlert';
import { getYouTubeThumbnailDetails } from '../../../functions';
import LinkPreviewCard, { extractFirstUrl } from '../../../components/LinkPreviewCard';
import ChatLockBottomSheet from '../../../components/ChatLockBottomSheet';
import ChatImageViewerModal from '../../../components/ChatImageViewerModal';
import { captureRef } from 'react-native-view-shot';
import {
  isChatLockedForUser,
  lockChatForUser,
  unlockChatForUser,
  isSessionUnlocked,
  markSessionUnlocked,
} from '../../../functions/chatLockService';

// Decomposed Chat Subcomponents
import AnimatedTypingDots from '../../../components/chat/AnimatedTypingDots';
import QuotedMessageReply from '../../../components/chat/QuotedMessageReply';
import ChatImageThumbnail from '../../../components/chat/ChatImageThumbnail';
import SwipeableMessageRow from '../../../components/chat/SwipeableMessageRow';
import WatchPartyInviteTile from '../../../components/chat/WatchPartyInviteTile';
import CallOverlayModal from '../../../components/chat/CallOverlayModal';
import PhotoPreviewModal from '../../../components/chat/PhotoPreviewModal';
import MessageActionModal from '../../../components/chat/MessageActionModal';
import AttachmentModal from '../../../components/chat/AttachmentModal';
import ChatInputBar from '../../../components/chat/ChatInputBar';
import ChatHeader from '../../../components/chat/ChatHeader';

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

const ChatScreen = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();

  const otherUsername = route.params?.username || 'Chat';
  const otherUserId = route.params?.userId || route.params?.id || route.params?.friendId;
  const otherAvatar = route.params?.avatar || null;
  const isSelfChat = Boolean(
    route.params?.isSelfChat ||
    (otherUserId && otherUserId === auth().currentUser?.uid)
  );

  const [message, setMessage] = useState('');
  const [showAttachments, setShowAttachments] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatId, setChatId] = useState(route.params?.chatId || null);
  const [otherUserStatus, setOtherUserStatus] = useState('offline');
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [showMessageActionModal, setShowMessageActionModal] = useState(false);

  // Photo & Ephemeral View-Once states (Supports Multi-Select & Upload)
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [photoCaption, setPhotoCaption] = useState('');
  const [isViewOnce, setIsViewOnce] = useState(false);
  const [showPhotoPreviewModal, setShowPhotoPreviewModal] = useState(false);
  const [imageViewerState, setImageViewerState] = useState({
    visible: false,
    images: [],
    initialIndex: 0,
    isViewOnce: false,
    viewOnceMessage: null,
  });
  const [isSendingPhoto, setIsSendingPhoto] = useState(false);
  const [replyingToMessage, setReplyingToMessage] = useState(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const highlightTimeoutRef = useRef(null);
  const messageInputRef = useRef(null);
  const photoPreviewImageRef = useRef(null);

  // Chat List & Inverted Scroll Tracking References
  const flatListRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const scrollBottomBtnAnim = useRef(new Animated.Value(0)).current;

  // Inverted messages array: newest messages at index 0 (rendered at bottom of screen)
  const invertedMessages = useMemo(() => {
    return [...messages].reverse();
  }, [messages]);

  const updateScrollBottomVisibility = useCallback((show) => {
    setShowScrollBottomBtn((prev) => {
      if (prev !== show) {
        Animated.timing(scrollBottomBtnAnim, {
          toValue: show ? 1 : 0,
          duration: 180,
          useNativeDriver: true,
        }).start();
        return show;
      }
      return prev;
    });
  }, [scrollBottomBtnAnim]);

  const handleJumpToLatest = useCallback(() => {
    isAtBottomRef.current = true;
    updateScrollBottomVisibility(false);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [updateScrollBottomVisibility]);

  const handleScroll = useCallback((event) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    isAtBottomRef.current = offsetY <= 60;

    if (offsetY > 250 && messages.length > 5) {
      updateScrollBottomVisibility(true);
    } else {
      updateScrollBottomVisibility(false);
    }
  }, [messages.length, updateScrollBottomVisibility]);

  // Keyboard Visibility & Height Handling (Android & iOS)
  const keyboardHeightAnim = useRef(new Animated.Value(0)).current;
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setIsKeyboardVisible(true);
      if (Platform.OS === 'android') {
        const h = e?.endCoordinates?.height || 0;
        const androidNavOffset = Math.max(insets.bottom, 28);
        const targetHeight = h + androidNavOffset + 10;
        Animated.timing(keyboardHeightAnim, {
          toValue: targetHeight,
          duration: 150,
          useNativeDriver: false,
        }).start();
      }
      if (isAtBottomRef.current) {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      }
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
      if (Platform.OS === 'android') {
        Animated.timing(keyboardHeightAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: false,
        }).start();
      }
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardHeightAnim, insets.bottom]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  // Handler to scroll to quoted message and highlight it
  const handleScrollToMessage = useCallback(
    (targetId) => {
      if (!targetId || !invertedMessages || invertedMessages.length === 0) return;

      const targetIndex = invertedMessages.findIndex(
        (m) => m.id === targetId || m.key === targetId
      );

      if (targetIndex >= 0) {
        try {
          flatListRef.current?.scrollToIndex({
            index: targetIndex,
            animated: true,
            viewPosition: 0.5,
          });
        } catch (e) {
          flatListRef.current?.scrollToOffset({
            offset: targetIndex * 80,
            animated: true,
          });
        }

        setHighlightedMessageId(targetId);
        if (highlightTimeoutRef.current) {
          clearTimeout(highlightTimeoutRef.current);
        }
        highlightTimeoutRef.current = setTimeout(() => {
          setHighlightedMessageId(null);
        }, 1800);
      } else {
        Alert.alert('Message not found', 'The quoted message is not available in the current chat view.');
      }
    },
    [invertedMessages]
  );

  // Swipe to reply handler
  const handleInitiateReply = useCallback(
    (targetMessage) => {
      if (!targetMessage) return;
      const isImg = targetMessage.type === 'image' || targetMessage.type === 'photo';
      let imgUri = targetMessage.imageUri || null;

      setReplyingToMessage({
        id: targetMessage.id,
        text: targetMessage.text,
        type: targetMessage.type,
        senderId: targetMessage.senderId,
        senderName: targetMessage.senderId === auth().currentUser?.uid ? 'You' : otherUsername,
        caption: targetMessage.caption,
        imageUri: imgUri,
        mediaId: targetMessage.mediaId || null,
      });

      if (isImg && !imgUri && targetMessage.mediaId) {
        resolveMediaUri(targetMessage.mediaId)
          .then((resolved) => {
            if (resolved) {
              setReplyingToMessage((prev) =>
                prev && prev.id === targetMessage.id ? { ...prev, imageUri: resolved } : prev
              );
            }
          })
          .catch((err) => console.warn('Error resolving image in reply dock:', err));
      }

      setTimeout(() => {
        messageInputRef.current?.focus();
      }, 50);
    },
    [otherUsername]
  );

  // Collect all regular (non-viewOnce) photos in current chat
  const chatImages = useMemo(() => {
    return messages
      .filter(
        (m) =>
          (m.type === 'image' || m.type === 'photo') &&
          !m.viewOnce &&
          (m.imageUri || m.mediaId)
      )
      .map((m) => ({
        id: m.id || String(m.timestamp),
        messageId: m.id,
        mediaId: m.mediaId || null,
        uri: m.imageUri || null,
        caption: m.caption || '',
        timestamp: m.timestamp,
        senderId: m.senderId,
        isViewOnce: false,
      }));
  }, [messages]);

  const activeMessagesRef = useRef(null);
  const activeUserChatsRef = useRef(null);
  const activeStatusRef = useRef(null);
  const activeTypingRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isCurrentlyTypingRef = useRef(false);
  const markedSeenIdsRef = useRef(new Set());
  const pendingMessagesRef = useRef(new Map());
  const prevMessagesCountRef = useRef(0);
  const chatIdRef = useRef(chatId);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);

  // Chat Lock States (WhatsApp-style private vault lock)
  const [isChatLocked, setIsChatLocked] = useState(Boolean(route.params?.isLocked));
  const [isScreenUnlocked, setIsScreenUnlocked] = useState(
    Boolean(route.params?.isUnlocked || (otherUserId && isSessionUnlocked(otherUserId)))
  );
  const [chatLockModalVisible, setChatLockModalVisible] = useState(false);
  const [chatLockModalMode, setChatLockModalMode] = useState('unlock');

  // Verify chat lock status on mount
  useEffect(() => {
    if (isSelfChat || !otherUserId) {
      setIsScreenUnlocked(true);
      return;
    }
    const currentUid = auth().currentUser?.uid;
    if (!currentUid) return;

    isChatLockedForUser(currentUid, otherUserId).then((locked) => {
      setIsChatLocked(locked);
      if (locked) {
        const unlocked = Boolean(route.params?.isUnlocked || isSessionUnlocked(otherUserId));
        setIsScreenUnlocked(unlocked);
      } else {
        setIsScreenUnlocked(true);
      }
    });
  }, [otherUserId, isSelfChat, route.params?.isUnlocked]);

  const handleToggleChatLock = async () => {
    if (isSelfChat || !otherUserId) return;
    const currentUid = auth().currentUser?.uid;
    if (!currentUid) return;

    if (isChatLocked) {
      setChatLockModalMode('remove');
      setChatLockModalVisible(true);
    } else {
      setChatLockModalMode('setup');
      setChatLockModalVisible(true);
    }
  };

  useEffect(() => {
    chatIdRef.current = chatId;
    isAtBottomRef.current = true;
    prevMessagesCountRef.current = 0;
    setShowScrollBottomBtn(false);
    scrollBottomBtnAnim.setValue(0);
  }, [chatId, scrollBottomBtnAnim]);

  // Dynamic safe area top inset for Android & iOS notch protection
  const safeTopPadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 12
  ) + 8;

  // Audio/Video call hook & minimized call state
  const [isCallMinimized, setIsCallMinimized] = useState(false);
  const {
    callState,
    callType,
    callDuration,
    isMuted,
    isSpeaker,
    isCameraOff,
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

  // Send quick reaction during call
  const sendReaction = useCallback((reactionText) => {
    if (!chatId) return;
    const currentUser = auth().currentUser;
    if (!currentUser) return;
    database().ref(`chats/${chatId}/messages`).push({
      text: reactionText,
      senderId: currentUser.uid,
      timestamp: database.ServerValue.TIMESTAMP,
      type: 'text',
    });
  }, [chatId]);

  // Presence Listener
  const listenOtherUserStatus = useCallback(() => {
    if (!otherUserId || isSelfChat) return;
    if (activeStatusRef.current) {
      activeStatusRef.current.off('value');
      activeStatusRef.current = null;
    }
    const statusRef = database().ref(`users/${otherUserId}/status`);
    activeStatusRef.current = statusRef;
    statusRef.on('value', (snapshot) => {
      const val = snapshot.val();
      const isOnline = val === 'online' || val?.state === 'online';
      setOtherUserStatus(isOnline ? 'online' : 'offline');
    });
  }, [otherUserId, isSelfChat]);

  const setupUserPresence = useCallback(() => {
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
  }, []);

  const listenToTyping = useCallback((activeChatId) => {
    if (!activeChatId || isSelfChat || !otherUserId) return;
    if (activeTypingRef.current) {
      activeTypingRef.current.off('value');
      activeTypingRef.current = null;
    }
    const typingRef = database().ref(`chats/${activeChatId}/typing/${otherUserId}`);
    activeTypingRef.current = typingRef;
    typingRef.on('value', (snapshot) => {
      const isTyping = Boolean(snapshot.val());
      setIsOtherUserTyping(isTyping);
      if (isTyping && isAtBottomRef.current) {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }
    });
  }, [isSelfChat, otherUserId]);

  const listenToMessages = useCallback((activeChatId) => {
    if (!activeChatId) return;
    if (activeMessagesRef.current) {
      activeMessagesRef.current.off('value');
      activeMessagesRef.current = null;
    }
    markedSeenIdsRef.current.clear();
    const messagesRef = database().ref(`chats/${activeChatId}/messages`);
    activeMessagesRef.current = messagesRef;
    messagesRef.on('value', (snapshot) => {
      const data = snapshot.val();
      const currentUid = auth().currentUser?.uid;
      if (data) {
        const messagesList = Object.keys(data).map((id) => ({
          id,
          ...data[id],
        }));
        messagesList.sort((a, b) => a.timestamp - b.timestamp);

        // Reconcile pending optimistic messages
        if (pendingMessagesRef.current.size > 0 && currentUid) {
          pendingMessagesRef.current.forEach((pendingMsg, pId) => {
            const confirmed = messagesList.some(
              (m) =>
                m.senderId === currentUid &&
                (
                  (m.type === 'image' && pendingMsg.type === 'image') ||
                  (m.text && m.text === pendingMsg.text)
                ) &&
                Math.abs((m.timestamp || 0) - pendingMsg.timestamp) < 60000
            );
            if (confirmed) {
              pendingMessagesRef.current.delete(pId);
            }
          });
        }

        // Filter out messages that current user deleted "For Me"
        const visibleMessages = messagesList.filter(
          (msg) => !(msg.deletedFor && currentUid && msg.deletedFor[currentUid])
        );

        const stillPending = Array.from(pendingMessagesRef.current.values());
        const mergedMessages = [...visibleMessages, ...stillPending];
        setMessages(mergedMessages);

        // Mark incoming unread messages as SEEN in an atomic batch
        if (currentUid && !isSelfChat) {
          const unreadIncoming = messagesList.filter(
            (msg) =>
              msg.senderId !== currentUid &&
              !msg.seen &&
              !msg.deletedForEveryone &&
              !markedSeenIdsRef.current.has(msg.id)
          );

          if (unreadIncoming.length > 0) {
            const batchUpdates = {};
            unreadIncoming.forEach((msg) => {
              markedSeenIdsRef.current.add(msg.id);
              batchUpdates[`chats/${activeChatId}/messages/${msg.id}/seen`] = true;
              batchUpdates[`chats/${activeChatId}/messages/${msg.id}/status`] = 'seen';
            });
            batchUpdates[`user_chats/${currentUid}/${activeChatId}/unreadCount`] = 0;
            database().ref().update(batchUpdates).catch((err) => {
              console.warn('Batch mark seen error:', err);
            });
          }
        }

        if (isAtBottomRef.current) {
          flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
        }
      } else {
        setMessages(Array.from(pendingMessagesRef.current.values()));
      }
    });
  }, [isSelfChat]);

  const createNewChat = useCallback(async (currentUserId, otherId) => {
    const db = database();
    const newChatRef = db.ref('chats').push();
    const newChatId = newChatRef.key;

    if (currentUserId === otherId) {
      await Promise.all([
        db.ref(`chats/${newChatId}/participants/${currentUserId}`).set(true),
        db.ref(`chats/${newChatId}/isSelfChat`).set(true),
        db.ref(`user_chats/${currentUserId}/${newChatId}`).set({
          otherUserId: currentUserId,
          isSelfChat: true,
          lastMessage: '',
          lastMessageTimestamp: database.ServerValue.TIMESTAMP,
        }),
      ]);
    } else {
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
    }

    setChatId(newChatId);
    chatIdRef.current = newChatId;
    listenToMessages(newChatId);
    listenToTyping(newChatId);
  }, [listenToMessages, listenToTyping]);

  const initializeChat = useCallback(async () => {
    const currentUser = auth().currentUser;
    if (!currentUser || !otherUserId) return;

    if (route.params?.chatId) {
      setChatId(route.params.chatId);
      chatIdRef.current = route.params.chatId;
      listenToMessages(route.params.chatId);
      listenToTyping(route.params.chatId);
      return;
    }

    if (activeUserChatsRef.current) {
      activeUserChatsRef.current.off('value');
      activeUserChatsRef.current = null;
    }

    const userChatsRef = database().ref(`user_chats/${currentUser.uid}`);
    activeUserChatsRef.current = userChatsRef;
    userChatsRef.once('value').then((snapshot) => {
      const chats = snapshot.val();
      if (chats) {
        const existingChatId = Object.keys(chats).find(
          (key) => chats[key].otherUserId === otherUserId
        );
        if (existingChatId) {
          setChatId(existingChatId);
          chatIdRef.current = existingChatId;
          listenToMessages(existingChatId);
          listenToTyping(existingChatId);
          return;
        }
      }
      createNewChat(currentUser.uid, otherUserId);
    }).catch((err) => {
      console.warn('Error fetching user_chats:', err);
      createNewChat(currentUser.uid, otherUserId);
    });
  }, [otherUserId, route.params?.chatId, listenToMessages, listenToTyping, createNewChat]);

  // Initialize Chat & Presence
  useEffect(() => {
    initializeChat();
    setupUserPresence();
    if (!isSelfChat) {
      listenOtherUserStatus();
    }
    return () => {
      if (activeMessagesRef.current) {
        activeMessagesRef.current.off('value');
        activeMessagesRef.current = null;
      }
      if (activeUserChatsRef.current) {
        activeUserChatsRef.current.off('value');
        activeUserChatsRef.current = null;
      }
      if (activeStatusRef.current) {
        activeStatusRef.current.off('value');
        activeStatusRef.current = null;
      }
      if (activeTypingRef.current) {
        activeTypingRef.current.off('value');
        activeTypingRef.current = null;
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      const curUid = auth().currentUser?.uid;
      const curChatId = chatIdRef.current || route.params?.chatId;
      if (!isSelfChat && curChatId && curUid) {
        database().ref(`chats/${curChatId}/typing/${curUid}`).set(false);
      }
    };
  }, [initializeChat, isSelfChat, listenOtherUserStatus, route.params?.chatId, setupUserPresence]);

  useEffect(() => {
    if (!chatId) return;
    const unsubscribe = listenIncoming();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [chatId, listenIncoming]);

  const handleMessageTextChange = useCallback((text) => {
    setMessage(text);

    const effectiveChatId = chatId || chatIdRef.current || route.params?.chatId;
    if (isSelfChat || !effectiveChatId) return;
    const currentUid = auth().currentUser?.uid;
    if (!currentUid) return;

    if (text.trim().length > 0) {
      if (!isCurrentlyTypingRef.current) {
        isCurrentlyTypingRef.current = true;
        database().ref(`chats/${effectiveChatId}/typing/${currentUid}`).set(true);
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        isCurrentlyTypingRef.current = false;
        database().ref(`chats/${effectiveChatId}/typing/${currentUid}`).set(false);
      }, 2500);
    } else {
      if (isCurrentlyTypingRef.current) {
        isCurrentlyTypingRef.current = false;
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        database().ref(`chats/${effectiveChatId}/typing/${currentUid}`).set(false);
      }
    }
  }, [chatId, isSelfChat, route.params?.chatId]);

  const sendMessage = useCallback(async () => {
    const textToSend = message.trim();
    const effectiveChatId = chatId || chatIdRef.current || route.params?.chatId;
    if (!textToSend || !effectiveChatId) return;

    const db = database();
    const currentUser = auth().currentUser;
    if (!currentUser) return;

    setMessage('');
    const activeReply = replyingToMessage;
    setReplyingToMessage(null);

    if (!isSelfChat) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      isCurrentlyTypingRef.current = false;
      db.ref(`chats/${effectiveChatId}/typing/${currentUser.uid}`).set(false);
    }

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const optimisticMessage = {
      id: tempId,
      text: textToSend,
      senderId: currentUser.uid,
      timestamp: Date.now(),
      type: 'text',
      seen: isSelfChat ? true : false,
      status: 'sending',
      pending: true,
      ...(activeReply && {
        replyTo: {
          id: activeReply.id,
          senderId: activeReply.senderId,
          senderName: activeReply.senderId === currentUser.uid ? 'You' : otherUsername,
          text:
            activeReply.type === 'image' || activeReply.type === 'photo'
              ? (activeReply.caption ? activeReply.caption : 'Photo')
              : (activeReply.text || 'Message'),
          type: activeReply.type || 'text',
          mediaId: activeReply.mediaId || '',
          imageUri: activeReply.imageUri || '',
        },
      }),
    };

    pendingMessagesRef.current.set(tempId, optimisticMessage);
    setMessages((prev) => [...prev, optimisticMessage]);
    prevMessagesCountRef.current += 1;
    isAtBottomRef.current = true;
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });

    try {
      const newMessageRef = db.ref(`chats/${effectiveChatId}/messages`).push();
      const messageData = {
        text: textToSend,
        senderId: currentUser.uid,
        timestamp: database.ServerValue.TIMESTAMP,
        type: 'text',
        seen: isSelfChat ? true : false,
        status: isSelfChat ? 'seen' : 'sent',
        ...(activeReply && {
          replyTo: {
            id: activeReply.id,
            senderId: activeReply.senderId,
            senderName: activeReply.senderId === currentUser.uid ? 'You' : otherUsername,
            text:
              activeReply.type === 'image' || activeReply.type === 'photo'
                ? (activeReply.caption ? activeReply.caption : 'Photo')
                : (activeReply.text || 'Message'),
            type: activeReply.type || 'text',
            mediaId: activeReply.mediaId || '',
          },
        }),
      };
      await newMessageRef.set(messageData);

      const updates = {};
      updates[`user_chats/${currentUser.uid}/${effectiveChatId}/lastMessage`] = textToSend;
      updates[`user_chats/${currentUser.uid}/${effectiveChatId}/lastMessageTimestamp`] = database.ServerValue.TIMESTAMP;
      updates[`user_chats/${currentUser.uid}/${effectiveChatId}/lastSenderId`] = currentUser.uid;
      updates[`user_chats/${currentUser.uid}/${effectiveChatId}/unreadCount`] = 0;
      if (otherUserId && !isSelfChat) {
        updates[`user_chats/${otherUserId}/${effectiveChatId}/lastMessage`] = textToSend;
        updates[`user_chats/${otherUserId}/${effectiveChatId}/lastMessageTimestamp`] = database.ServerValue.TIMESTAMP;
        updates[`user_chats/${otherUserId}/${effectiveChatId}/lastSenderId`] = currentUser.uid;
        updates[`user_chats/${otherUserId}/${effectiveChatId}/unreadCount`] = database.ServerValue.increment(1);
      }
      await db.ref().update(updates);
      pendingMessagesRef.current.delete(tempId);
    } catch (error) {
      console.error('[ChatScreen] Error sending message:', error);
      pendingMessagesRef.current.delete(tempId);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, status: 'failed', pending: false } : m
        )
      );
    }
  }, [message, chatId, route.params?.chatId, replyingToMessage, isSelfChat, otherUsername, otherUserId]);

  // Send Watch Party Invite inside Chat
  const sendWatchPartyInvite = useCallback(async (roomData) => {
    const effectiveChatId = chatId || route.params?.chatId;
    if (!effectiveChatId) {
      console.warn('sendWatchPartyInvite: No active chatId found');
      return;
    }
    const db = database();
    const currentUser = auth().currentUser;
    if (!currentUser) return;

    let resolvedThumbnail = '';
    if (roomData?.thumbnail && typeof roomData.thumbnail === 'string' && roomData.thumbnail.startsWith('http')) {
      resolvedThumbnail = roomData.thumbnail.replace('/hqdefault.jpg', '/maxresdefault.jpg');
    } else if (roomData?.streamUrl) {
      const details = getYouTubeThumbnailDetails(roomData.streamUrl);
      if (details) {
        resolvedThumbnail = details.maxresUrl || details.mqUrl || details.fallbackUrl || '';
      }
    }

    const inviteText = `Hey! Join my watch party for ${roomData?.name || 'a live screening'}`;
    const messageData = {
      text: inviteText,
      senderId: currentUser.uid,
      timestamp: database.ServerValue.TIMESTAMP,
      type: 'watch_party_invite',
      roomId: roomData?.roomId || '',
      roomName: roomData?.name || 'Watch Party',
      streamUrl: roomData?.streamUrl || '',
      thumbnail: resolvedThumbnail || '',
      isScheduled: !!roomData?.scheduledDate || !!roomData?.isScheduled,
      scheduledDate: roomData?.scheduledDate || null,
      inviteStatus: 'pending',
      seen: false,
      status: 'sent',
    };

    const newMessageRef = db.ref(`chats/${effectiveChatId}/messages`).push();
    await newMessageRef.set(messageData);

    const updates = {};
    updates[`user_chats/${currentUser.uid}/${effectiveChatId}/lastMessage`] = inviteText;
    updates[`user_chats/${currentUser.uid}/${effectiveChatId}/lastMessageTimestamp`] = database.ServerValue.TIMESTAMP;
    updates[`user_chats/${currentUser.uid}/${effectiveChatId}/lastSenderId`] = currentUser.uid;
    updates[`user_chats/${currentUser.uid}/${effectiveChatId}/unreadCount`] = 0;
    if (otherUserId && !isSelfChat) {
      updates[`user_chats/${otherUserId}/${effectiveChatId}/lastMessage`] = inviteText;
      updates[`user_chats/${otherUserId}/${effectiveChatId}/lastMessageTimestamp`] = database.ServerValue.TIMESTAMP;
      updates[`user_chats/${otherUserId}/${effectiveChatId}/lastSenderId`] = currentUser.uid;
      updates[`user_chats/${otherUserId}/${effectiveChatId}/unreadCount`] = database.ServerValue.increment(1);
    }
    await db.ref().update(updates);

    isAtBottomRef.current = true;
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [chatId, route.params?.chatId, otherUserId, isSelfChat]);

  const autoInviteSentRef = useRef(false);

  // Automatically send watch party invite if passed via navigation params
  useEffect(() => {
    if (route.params?.autoSendInvite && chatId && !autoInviteSentRef.current) {
      autoInviteSentRef.current = true;
      sendWatchPartyInvite(route.params.autoSendInvite);
    }
  }, [route.params?.autoSendInvite, chatId, sendWatchPartyInvite]);

  // Trigger watch party invite with real active rooms from RTDB
  const handleTriggerWatchPartyInvite = useCallback(async () => {
    const currentUser = auth().currentUser;
    if (!currentUser) return;
    try {
      const snapshot = await database().ref('rooms').once('value');
      const val = snapshot.val();
      if (val) {
        const myRooms = Object.values(val).filter(
          (r) => r && (r.creator?.email === currentUser?.email || r.creator?.uid === currentUser?.uid)
        );

        const participatedRooms = Object.values(val).filter((r) => {
          if (!r) return false;
          if (r.participants && typeof r.participants === 'object') {
            return Object.keys(r.participants).includes(currentUser.uid);
          }
          return false;
        });

        const combined = [...myRooms];
        participatedRooms.forEach((pr) => {
          if (!combined.some((r) => r.roomId === pr.roomId)) {
            combined.push(pr);
          }
        });

        const availableRooms = combined.length > 0 ? combined : Object.values(val).filter((r) => r && r.name);

        if (availableRooms.length === 1) {
          const targetRoom = availableRooms[0];
          showCineAlert({
            type: 'invite',
            title: 'Watch Party VIP Pass',
            message: `Dispatch real-time synchronized invitation to @${otherUsername}`,
            roomTicket: {
              name: targetRoom.name,
              roomId: targetRoom.roomId,
              isStreaming: targetRoom.isStreaming,
              streamUrl: targetRoom.streamUrl,
              thumbnail: targetRoom.thumbnail,
              scheduledDate: targetRoom.scheduledDate,
              isScheduled: targetRoom.isScheduled,
            },
            confirmText: 'Send Invite',
            cancelText: 'Dismiss',
            onConfirm: () => {
              sendWatchPartyInvite(targetRoom);
            },
          });
          return;
        }

        if (availableRooms.length > 1) {
          showCineAlert({
            type: 'invite',
            title: 'Select Watch Party Room',
            message: `Choose which room to invite @${otherUsername} to:`,
            roomList: availableRooms,
            confirmText: 'Send Invite',
            cancelText: 'Dismiss',
            onConfirm: (selectedRoom) => {
              const target = selectedRoom || availableRooms[0];
              sendWatchPartyInvite(target);
            },
          });
          return;
        }
      }

      showCineAlert({
        type: 'action',
        icon: 'video-camera-front',
        title: 'No Active Watch Room',
        message: "You don't have an active watch party room yet. Would you like to create one now to stream together?",
        confirmText: 'Create Room',
        cancelText: 'Cancel',
        onConfirm: () => navigation.navigate('CreateRoom'),
      });
    } catch (err) {
      console.error('Error fetching rooms for invite:', err);
    }
  }, [navigation, otherUsername, sendWatchPartyInvite]);

  // Long Press Message Action Handlers
  const handleMessageLongPress = useCallback((msg) => {
    Keyboard.dismiss();
    setSelectedMessage(msg);
    setShowMessageActionModal(true);
  }, []);

  const handleDeleteForMe = useCallback(async () => {
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
  }, [chatId, selectedMessage]);

  const handleDeleteForEveryone = useCallback(async () => {
    if (!selectedMessage || !chatId) return;
    const currentUid = auth().currentUser?.uid;
    if (!currentUid || selectedMessage.senderId !== currentUid) return;

    showCineAlert({
      type: 'danger',
      icon: 'delete-forever',
      title: 'Delete for Everyone?',
      message: 'This message will be permanently deleted for all members in this chat.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          await database()
            .ref(`chats/${chatId}/messages/${selectedMessage.id}`)
            .update({
              deletedForEveryone: true,
              deletedAt: database.ServerValue.TIMESTAMP,
              text: 'This message was deleted',
            });

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
          showCineAlert({
            type: 'danger',
            title: 'Delete Failed',
            message: 'Could not delete message for everyone. Please try again.',
          });
        }
      },
    });
  }, [chatId, selectedMessage, otherUserId]);

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
        quality: 1.0,
        includeBase64: true,
        saveToPhotos: false,
      });

      if (result.didCancel || !result.assets || result.assets.length === 0) return;
      const asset = result.assets[0];

      const MAX_RAW_BYTES = 6.8 * 1024 * 1024;
      if (asset.fileSize && asset.fileSize > MAX_RAW_BYTES) {
        showCineAlert({
          title: 'Photo Too Large',
          message: 'Captured photo exceeds the 6.8MB uncompressed relay limit. Please take another shot.',
          type: 'warning',
        });
        return;
      }

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

      setSelectedPhotos([
        {
          previewUri: asset.uri || dataUri,
          uri: dataUri,
          width: asset.width || SCREEN_WIDTH,
          height: asset.height || SCREEN_HEIGHT,
          sourceType: 'Camera',
        },
      ]);
      setActivePhotoIndex(0);
      setIsViewOnce(false);
      setPhotoCaption('');
      setShowPhotoPreviewModal(true);
    } catch (err) {
      console.warn('launchCamera error:', err);
      Alert.alert('Camera Error', 'Could not access device camera.');
    }
  };

  const handlePickGallery = async () => {
    setShowAttachments(false);
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 0,
        quality: 1.0,
        includeBase64: true,
      });

      if (result.didCancel || !result.assets || result.assets.length === 0) return;

      const MAX_RAW_BYTES = 6.8 * 1024 * 1024;
      const validAssets = result.assets.filter((asset) => {
        if (asset.fileSize && asset.fileSize > MAX_RAW_BYTES) {
          showCineAlert({
            title: 'Photo Too Large',
            message: `"${asset.fileName || 'Photo'}" exceeds the 6.8MB uncompressed relay limit.`,
            type: 'warning',
          });
          return false;
        }
        return true;
      });

      if (validAssets.length === 0) return;

      const photoItems = await Promise.all(
        validAssets.map(async (asset) => {
          let base64String = asset.base64;
          if (!base64String && asset.uri) {
            try {
              base64String = await RNFS.readFile(asset.uri, 'base64');
            } catch (e) {
              console.warn('[RNFS] Gallery multi-base64 fallback error:', e);
            }
          }
          const dataUri = base64String
            ? `data:${asset.type || 'image/jpeg'};base64,${base64String}`
            : asset.uri;

          return {
            previewUri: asset.uri || dataUri,
            uri: dataUri,
            width: asset.width || SCREEN_WIDTH,
            height: asset.height || SCREEN_HEIGHT,
            sourceType: 'Gallery',
          };
        })
      );

      setSelectedPhotos(photoItems);
      setActivePhotoIndex(0);
      setIsViewOnce(false);
      setPhotoCaption('');
      setShowPhotoPreviewModal(true);
    } catch (err) {
      console.warn('launchImageLibrary error:', err);
      Alert.alert('Gallery Error', 'Could not open image gallery.');
    }
  };

  const handleSendPhoto = useCallback(async () => {
    const effectiveChatId = chatId || chatIdRef.current || route.params?.chatId;
    if (!selectedPhotos || selectedPhotos.length === 0 || !effectiveChatId || isSendingPhoto) return;
    const currentUser = auth().currentUser;
    if (!currentUser) return;

    setIsSendingPhoto(true);
    const photosToSend = [...selectedPhotos];
    const caption = photoCaption.trim();
    const sendAsViewOnce = isViewOnce && photosToSend.length === 1;
    const activeReply = replyingToMessage;

    let activeMicroThumb = '';
    try {
      if (photoPreviewImageRef.current) {
        activeMicroThumb = await Promise.race([
          captureRef(photoPreviewImageRef.current, {
            format: 'jpg',
            quality: 0.15,
            width: 28,
            height: 28,
            result: 'data-uri',
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('captureRef timeout')), 1000)),
        ]);
      }
    } catch (captureErr) {
      console.warn('[ChatScreen] microThumb capture warning:', captureErr);
    }

    setShowPhotoPreviewModal(false);
    setSelectedPhotos([]);
    setActivePhotoIndex(0);
    setPhotoCaption('');
    setIsViewOnce(false);
    setReplyingToMessage(null);

    const optimisticMessages = photosToSend.map((photo, i) => {
      const tempId = `temp_photo_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`;
      const optimisticMsg = {
        id: tempId,
        type: 'image',
        mediaId: '',
        imageUri: photo.previewUri || photo.uri,
        caption: i === 0 ? caption : '',
        viewOnce: sendAsViewOnce,
        opened: false,
        senderId: currentUser.uid,
        timestamp: Date.now() + i,
        seen: isSelfChat ? true : false,
        status: isSelfChat ? 'seen' : 'sending',
        pending: true,
        width: Number(photo.width) || 800,
        height: Number(photo.height) || 800,
        microThumb: activeMicroThumb || photo.microThumb || '',
        ...(i === 0 &&
          activeReply && {
          replyTo: {
            id: activeReply.id || '',
            senderId: activeReply.senderId || '',
            senderName: activeReply.senderId === currentUser.uid ? 'You' : (otherUsername || 'User'),
            text:
              activeReply.type === 'image' || activeReply.type === 'photo'
                ? (activeReply.caption ? activeReply.caption : 'Photo')
                : (activeReply.text || 'Message'),
            type: activeReply.type || 'text',
            mediaId: activeReply.mediaId || '',
          },
        }),
      };
      pendingMessagesRef.current.set(tempId, optimisticMsg);
      return optimisticMsg;
    });

    setMessages((prev) => [...prev, ...optimisticMessages]);
    prevMessagesCountRef.current += optimisticMessages.length;
    isAtBottomRef.current = true;
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });

    try {
      const messagesRef = database().ref(`chats/${effectiveChatId}/messages`);

      for (let i = 0; i < photosToSend.length; i++) {
        const photo = photosToSend[i];
        const mediaId = await uploadMediaBlob(photo.uri, currentUser.uid);
        const newMsgRef = messagesRef.push();

        const messagePayload = {
          id: newMsgRef.key,
          type: 'image',
          mediaId: mediaId || '',
          imageUri: '',
          caption: (i === 0 ? caption : '') || '',
          viewOnce: Boolean(sendAsViewOnce),
          opened: false,
          senderId: currentUser.uid,
          timestamp: database.ServerValue.TIMESTAMP,
          seen: isSelfChat ? true : false,
          status: isSelfChat ? 'seen' : 'sent',
          width: Number(photo.width) || 800,
          height: Number(photo.height) || 800,
          microThumb: activeMicroThumb || photo.microThumb || '',
          ...(i === 0 &&
            activeReply && {
            replyTo: {
              id: activeReply.id || '',
              senderId: activeReply.senderId || '',
              senderName: activeReply.senderId === currentUser.uid ? 'You' : (otherUsername || 'User'),
              text:
                activeReply.type === 'image' || activeReply.type === 'photo'
                  ? (activeReply.caption ? activeReply.caption : 'Photo')
                  : (activeReply.text || 'Message'),
              type: activeReply.type || 'text',
              mediaId: activeReply.mediaId || '',
            },
          }),
        };

        await newMsgRef.set(messagePayload);
      }

      const previewText = sendAsViewOnce
        ? 'View-once photo'
        : photosToSend.length > 1
          ? `${photosToSend.length} Photos`
          : (caption ? caption : 'Photo');

      const updates = {};
      updates[`user_chats/${currentUser.uid}/${effectiveChatId}/lastMessage`] = previewText;
      updates[`user_chats/${currentUser.uid}/${effectiveChatId}/lastMessageTimestamp`] = database.ServerValue.TIMESTAMP;
      updates[`user_chats/${currentUser.uid}/${effectiveChatId}/lastSenderId`] = currentUser.uid;
      updates[`user_chats/${currentUser.uid}/${effectiveChatId}/unreadCount`] = 0;
      if (otherUserId && !isSelfChat) {
        updates[`user_chats/${otherUserId}/${effectiveChatId}/lastMessage`] = previewText;
        updates[`user_chats/${otherUserId}/${effectiveChatId}/lastMessageTimestamp`] = database.ServerValue.TIMESTAMP;
        updates[`user_chats/${otherUserId}/${effectiveChatId}/lastSenderId`] = currentUser.uid;
        updates[`user_chats/${otherUserId}/${effectiveChatId}/unreadCount`] = database.ServerValue.increment(photosToSend.length);
      }
      await database().ref().update(updates);
    } catch (error) {
      console.error('Error sending photo(s):', error);
      Alert.alert('Send Error', 'Failed to send photo(s). Please try again.');
    } finally {
      setIsSendingPhoto(false);
    }
  }, [chatId, isSendingPhoto, isSelfChat, isViewOnce, otherUserId, otherUsername, photoCaption, replyingToMessage, route.params?.chatId, selectedPhotos]);

  const handleViewOncePhotoPress = useCallback(async (item) => {
    const currentUid = auth().currentUser?.uid;
    const isMyMessage = item.senderId === currentUid;

    if (item.opened) {
      Alert.alert('Photo Expired', 'This view-once photo has already been opened and is no longer available.');
      return;
    }

    if (isMyMessage) {
      Alert.alert('View-Once Photo', 'You sent this photo as view-once. It can only be opened once by the recipient.');
      return;
    }

    if (!item.imageUri && !item.mediaId) {
      Alert.alert('Unavailable', 'This photo is no longer available.');
      return;
    }

    let uri = item.imageUri;
    if (item.mediaId) {
      uri = await resolveMediaUri(item.mediaId, item.imageUri, !isMyMessage);
    }

    if (!uri) {
      Alert.alert('Unavailable', 'This photo is no longer available or has expired.');
      return;
    }

    setImageViewerState({
      visible: true,
      images: [
        {
          id: item.id,
          messageId: item.id,
          mediaId: item.mediaId || null,
          uri: uri,
          caption: item.caption || '',
          timestamp: item.timestamp,
          senderId: item.senderId,
          isViewOnce: true,
        },
      ],
      initialIndex: 0,
      isViewOnce: true,
      viewOnceMessage: item,
    });
  }, []);

  const handleOpenRegularPhoto = useCallback((resolvedUri, caption, item) => {
    const clickedId = item?.id;
    let targetIndex = chatImages.findIndex(
      (img) => img.id === clickedId || img.messageId === clickedId
    );

    let imagesList = [...chatImages];
    if (targetIndex >= 0) {
      imagesList[targetIndex] = {
        ...imagesList[targetIndex],
        uri: resolvedUri || imagesList[targetIndex].uri,
      };
    } else {
      const fallbackItem = {
        id: item?.id || String(Date.now()),
        messageId: item?.id,
        mediaId: item?.mediaId || null,
        uri: resolvedUri || item?.imageUri || null,
        caption: caption || item?.caption || '',
        timestamp: item?.timestamp || Date.now(),
        senderId: item?.senderId,
        isViewOnce: false,
      };
      imagesList = [fallbackItem];
      targetIndex = 0;
    }

    setImageViewerState({
      visible: true,
      images: imagesList,
      initialIndex: targetIndex,
      isViewOnce: false,
      viewOnceMessage: null,
    });
  }, [chatImages]);

  const handleCloseImageViewer = useCallback(() => {
    if (imageViewerState.isViewOnce && imageViewerState.viewOnceMessage && chatId) {
      const msgId = imageViewerState.viewOnceMessage.id;
      const mediaId = imageViewerState.viewOnceMessage.mediaId;

      database().ref(`chats/${chatId}/messages/${msgId}`).update({
        opened: true,
        openedAt: database.ServerValue.TIMESTAMP,
        imageUri: '',
        mediaId: '',
      }).catch((e) => console.warn('Error marking view-once opened:', e));

      if (mediaId) {
        deleteMediaBlob(mediaId).catch((e) => console.warn('Error deleting media blob:', e));
      }
    }

    setImageViewerState({
      visible: false,
      images: [],
      initialIndex: 0,
      isViewOnce: false,
      viewOnceMessage: null,
    });
  }, [chatId, imageViewerState.isViewOnce, imageViewerState.viewOnceMessage]);

  const renderMessage = useCallback(({ item, index }) => {
    const isMyMessage = item.senderId === auth().currentUser?.uid;
    const isHighlighted = highlightedMessageId === item.id;

    const dateSeparator = (() => {
      const currentMessageDate = new Date(item.timestamp || Date.now());
      const olderMessage = index < invertedMessages.length - 1 ? invertedMessages[index + 1] : null;
      const olderMessageDate = olderMessage ? new Date(olderMessage.timestamp || Date.now()) : null;

      if (!olderMessageDate || !isSameDay(currentMessageDate, olderMessageDate)) {
        return (
          <View style={styles.dateSeparator}>
            <Text style={styles.dateText}>{getDateLabel(currentMessageDate)}</Text>
          </View>
        );
      }
      return null;
    })();

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
              style={styles.deletedBubbleIcon}
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
              isHighlighted && styles.highlightedMessageBubble,
            ]}
          >
            <View style={styles.callTileMainRow}>
              <View style={[styles.callTileIconBadge, { backgroundColor: badgeBg }]}>
                <MaterialIcons name={iconName} size={22} color={iconColor} />
              </View>

              <View style={styles.callTileTextCol}>
                <Text
                  style={[
                    styles.callTileTitle,
                    isMissed && !isCaller && styles.callTileTitleMissed,
                  ]}
                  numberOfLines={1}
                >
                  {title}
                </Text>
                <Text
                  style={[
                    styles.callTileSubtitle,
                    isMissed && !isCaller && styles.callTileSubtitleMissed,
                  ]}
                  numberOfLines={1}
                >
                  {subtitle}
                </Text>
              </View>

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
                    style={styles.seenIconMargin}
                  />
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>
      );
    }

    if (item.type === 'watch_party_invite') {
      return (
        <WatchPartyInviteTile
          item={item}
          chatId={chatId}
          isMyMessage={isMyMessage}
          otherUsername={otherUsername}
          navigation={navigation}
          handleMessageLongPress={handleMessageLongPress}
          dateSeparator={dateSeparator}
          isHighlighted={isHighlighted}
        />
      );
    }

    if (item.type === 'image' || item.type === 'photo') {
      if (item.viewOnce) {
        const isOpened = Boolean(item.opened);
        return (
          <View style={styles.messageOuterWrap}>
            {dateSeparator}
            <SwipeableMessageRow item={item} isMyMessage={isMyMessage} onSwipeReply={handleInitiateReply}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => handleViewOncePhotoPress(item)}
                onLongPress={() => handleMessageLongPress(item)}
                style={[
                  styles.viewOnceBubble,
                  isMyMessage ? styles.myViewOnceBubble : styles.theirViewOnceBubble,
                  isOpened && styles.viewOnceBubbleOpened,
                  isHighlighted && styles.highlightedMessageBubble,
                ]}
              >
                <View style={styles.viewOnceContentRow}>
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

                  <MaterialIcons
                    name={isOpened ? 'lock-outline' : (isMyMessage ? 'visibility-off' : 'photo-camera')}
                    size={18}
                    color={isOpened ? 'rgba(255, 255, 255, 0.35)' : (isMyMessage ? '#FFF' : colors.CYAN_ACCENT)}
                    style={styles.viewOnceLockIcon}
                  />
                </View>

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
                        style={styles.seenIconMargin}
                      />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            </SwipeableMessageRow>
          </View>
        );
      }

      return (
        <View style={styles.messageOuterWrap}>
          {dateSeparator}
          <SwipeableMessageRow item={item} isMyMessage={isMyMessage} onSwipeReply={handleInitiateReply}>
            <ChatImageThumbnail
              item={item}
              isMyMessage={isMyMessage}
              onOpenFullscreen={(uri, caption, photoItem) =>
                handleOpenRegularPhoto(uri, caption, photoItem || item)
              }
              onLongPress={handleMessageLongPress}
              onScrollToMessage={handleScrollToMessage}
              allMessages={messages}
              currentUserId={auth().currentUser?.uid}
              otherUsername={otherUsername}
              isHighlighted={isHighlighted}
            />
          </SwipeableMessageRow>
        </View>
      );
    }

    const extractedUrl = extractFirstUrl(item.text);

    const renderFormattedMessageText = (rawText, isMine) => {
      if (!rawText) return null;
      const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
      const parts = rawText.split(urlRegex);

      return (
        <Text style={[styles.messageText, isMine && styles.myMessageTextColor]}>
          {parts.map((part, i) => {
            if (!part) return null;
            const isUrl = /(https?:\/\/[^\s]+|www\.[^\s]+)/i.test(part);
            if (isUrl) {
              const fullUrl = part.toLowerCase().startsWith('www.') ? 'https://' + part : part;
              return (
                <Text
                  key={i}
                  style={isMine ? styles.linkTextMine : styles.linkTextTheir}
                  onPress={() => Linking.openURL(fullUrl)}
                >
                  {part}
                </Text>
              );
            }
            return part;
          })}
        </Text>
      );
    };

    return (
      <View style={styles.messageOuterWrap}>
        {dateSeparator}
        <SwipeableMessageRow item={item} isMyMessage={isMyMessage} onSwipeReply={handleInitiateReply}>
          <TouchableOpacity
            activeOpacity={0.85}
            onLongPress={() => handleMessageLongPress(item)}
            style={[
              styles.messageContainer,
              isMyMessage ? styles.myMessage : styles.theirMessage,
              Boolean(extractedUrl) && styles.linkMessageBubble,
              isHighlighted && styles.highlightedMessageBubble,
            ]}
          >
            {item.replyTo && (
              <QuotedMessageReply
                replyTo={item.replyTo}
                isMyMessage={isMyMessage}
                onScrollToMessage={handleScrollToMessage}
                allMessages={messages}
                currentUserId={auth().currentUser?.uid}
                fallbackUsername={otherUsername}
              />
            )}

            {Boolean(extractedUrl) && (
              <LinkPreviewCard
                url={extractedUrl}
                navigation={navigation}
                isMyMessage={isMyMessage}
                onLongPress={() => handleMessageLongPress(item)}
              />
            )}

            <View style={extractedUrl ? styles.linkMessageTextWrap : null}>
              {renderFormattedMessageText(item.text, isMyMessage)}
            </View>

            <View style={[styles.messageFooter, Boolean(extractedUrl) && styles.linkMessageFooter]}>
              <Text style={[styles.timestamp, isMyMessage && styles.myTimestamp]}>
                {new Date(item.timestamp || Date.now()).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
              {isMyMessage && (
                item.status === 'sending' || item.pending ? (
                  <View style={styles.seenReceiptRow}>
                    <MaterialIcons
                      name="access-time"
                      size={12}
                      color="rgba(255, 255, 255, 0.55)"
                      style={styles.seenIconMargin}
                    />
                  </View>
                ) : item.status === 'failed' ? (
                  <View style={styles.seenReceiptRow}>
                    <MaterialIcons
                      name="error-outline"
                      size={13}
                      color={colors.LIVE_RED}
                      style={styles.seenIconMargin}
                    />
                  </View>
                ) : item.seen || item.status === 'seen' ? (
                  <View style={styles.seenReceiptRow}>
                    <MaterialIcons
                      name="done-all"
                      size={15}
                      color={colors.CYAN_ACCENT}
                      style={styles.seenIconMargin}
                    />
                  </View>
                ) : (
                  <View style={styles.seenReceiptRow}>
                    <MaterialIcons
                      name="done"
                      size={14}
                      color="rgba(255, 255, 255, 0.65)"
                      style={styles.seenIconMargin}
                    />
                  </View>
                )
              )}
            </View>
          </TouchableOpacity>
        </SwipeableMessageRow>
      </View>
    );
  }, [invertedMessages, highlightedMessageId, otherUsername, handleMessageLongPress, startCall, chatId, navigation, handleInitiateReply, handleViewOncePhotoPress, handleOpenRegularPhoto, handleScrollToMessage, messages]);

  const renderImageViewerModal = () => {
    if (!imageViewerState.visible) return null;

    return (
      <ChatImageViewerModal
        visible={imageViewerState.visible}
        images={imageViewerState.images}
        initialIndex={imageViewerState.initialIndex}
        onClose={handleCloseImageViewer}
        otherUsername={otherUsername}
        safeTopPadding={safeTopPadding}
        safeBottomPadding={Math.max(insets.bottom, 20)}
      />
    );
  };

  const renderEmptyChat = () => (
    <View style={styles.emptyChatWrap}>
      <View style={[styles.emptyChatIconBox, isSelfChat && styles.emptyChatIconBoxSelfChat]}>
        <LinearGradient
          colors={
            isSelfChat
              ? [colors.PURPLE_ACCENT, colors.PRIMARY_COLOR]
              : ['rgba(0, 122, 255, 0.25)', 'rgba(124, 58, 237, 0.25)']
          }
          style={styles.emptyChatIconGrad}
        >
          <MaterialIcons
            name={isSelfChat ? 'bookmark' : 'chat-bubble-outline'}
            size={30}
            color="#FFF"
          />
        </LinearGradient>
      </View>
      <Text style={styles.emptyChatTitle}>
        {isSelfChat ? 'Your Personal Space' : 'No messages yet'}
      </Text>
      <Text style={styles.emptyChatSubtext}>
        {isSelfChat
          ? 'Draft messages, save notes, or store stream links. Only you can see these messages.'
          : `Send a message to start conversing with ${otherUsername}.`}
      </Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <StatusBar backgroundColor={colors.BACKGROUND_COLOR} barStyle="light-content" translucent />

      {/* Top 1-on-1 Direct Chat Header Bar */}
      <ChatHeader
        navigation={navigation}
        otherUserId={otherUserId}
        otherUsername={otherUsername}
        otherAvatar={otherAvatar}
        otherUserStatus={otherUserStatus}
        isSelfChat={isSelfChat}
        isOtherUserTyping={isOtherUserTyping}
        isChatLocked={isChatLocked}
        onToggleChatLock={handleToggleChatLock}
        onStartCall={startCall}
        onTriggerWatchPartyInvite={handleTriggerWatchPartyInvite}
      />

      {/* WebRTC Video/Audio Call Screens & Floating In-Call Banner */}
      <CallOverlayModal
        callState={callState}
        callType={callType}
        callDuration={callDuration}
        isMuted={isMuted}
        isSpeaker={isSpeaker}
        isCameraOff={isCameraOff}
        localStream={localStream}
        remoteStream={remoteStream}
        startCall={startCall}
        answerCall={answerCall}
        declineCall={declineCall}
        endCall={endCall}
        toggleMute={toggleMute}
        toggleSpeaker={toggleSpeaker}
        toggleCamera={toggleCamera}
        switchCamera={switchCamera}
        formatDuration={formatDuration}
        otherUsername={otherUsername}
        otherAvatar={otherAvatar}
        isCallMinimized={isCallMinimized}
        setIsCallMinimized={setIsCallMinimized}
        safeTopPadding={safeTopPadding}
        insets={insets}
        onTriggerWatchParty={handleTriggerWatchPartyInvite}
        onSendReaction={sendReaction}
      />

      {/* Conditional: Locked Chat Security Guard or Chat Messages Stream */}
      {isChatLocked && !isScreenUnlocked ? (
        <View style={styles.chatLockGuardOverlay}>
          <LinearGradient
            colors={['rgba(124, 58, 237, 0.25)', 'rgba(0, 122, 255, 0.10)', 'transparent']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />

          <View style={styles.lockGuardEmblem}>
            <LinearGradient
              colors={[colors.PURPLE_ACCENT, colors.PRIMARY_COLOR]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.lockGuardGradient}
            >
              <MaterialIcons name="lock" size={34} color={colors.FILM_GOLD} />
            </LinearGradient>
          </View>

          <Text style={styles.lockGuardTitle}>Conversation Locked</Text>
          <Text style={styles.lockGuardSubtitle}>
            This chat with @{otherUsername} is protected. Enter your alphanumeric passcode to view messages.
          </Text>

          <TouchableOpacity
            style={styles.lockGuardUnlockBtn}
            activeOpacity={0.85}
            onPress={() => {
              setChatLockModalMode('unlock');
              setChatLockModalVisible(true);
            }}
          >
            <LinearGradient
              colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.lockGuardUnlockGradient}
            >
              <MaterialIcons name="lock-open" size={18} color="#FFF" style={styles.lockGuardUnlockIcon} />
              <Text style={styles.lockGuardUnlockText}>Unlock Chat</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Chat Messages Stream */}
          <FlatList
            ref={flatListRef}
            data={invertedMessages}
            inverted
            renderItem={renderMessage}
            keyExtractor={(item) => item.id || `temp_${item.timestamp}`}
            style={styles.messagesList}
            contentContainerStyle={[
              styles.messagesListPadding,
              invertedMessages.length === 0 && styles.messagesListEmpty,
            ]}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            ListEmptyComponent={renderEmptyChat}
            ListHeaderComponent={
              isOtherUserTyping && !isSelfChat ? (
                <View style={styles.typingIndicatorRow}>
                  <View style={styles.typingIndicatorBubble}>
                    <AnimatedTypingDots />
                    <Text style={styles.typingIndicatorLabel}>{otherUsername} is typing...</Text>
                  </View>
                </View>
              ) : null
            }
            initialNumToRender={20}
            maxToRenderPerBatch={15}
            windowSize={11}
            removeClippedSubviews={false}
            keyboardShouldPersistTaps="handled"
            onScroll={handleScroll}
            scrollEventThrottle={32}
            onScrollToIndexFailed={(info) => {
              const offset = info.averageItemLength
                ? info.averageItemLength * info.index
                : info.index * 80;
              flatListRef.current?.scrollToOffset({
                offset,
                animated: false,
              });
              setTimeout(() => {
                flatListRef.current?.scrollToIndex({
                  index: info.index,
                  animated: true,
                  viewPosition: 0.5,
                });
              }, 100);
            }}
          />

          {/* Attachment Bottom Sheet Modal */}
          <AttachmentModal
            visible={showAttachments}
            onClose={() => setShowAttachments(false)}
            onWatchPartyInvite={handleTriggerWatchPartyInvite}
            onCamera={handlePickCamera}
            onGallery={handlePickGallery}
            onAudioNote={() => Alert.alert('Audio Note', 'Record voice message')}
            onLocation={() => Alert.alert('Location', 'Share live location with friend')}
            onDocument={() => Alert.alert('Document', 'Attach document or file')}
            onContact={() => Alert.alert('Contact Card', 'Share contact details')}
          />

          {/* Message Action Sheet Modal (Delete for me / Delete for everyone) */}
          <MessageActionModal
            visible={showMessageActionModal}
            selectedMessage={selectedMessage}
            currentUserId={auth().currentUser?.uid}
            otherUsername={otherUsername}
            onClose={() => {
              setShowMessageActionModal(false);
              setSelectedMessage(null);
            }}
            onDeleteForMe={handleDeleteForMe}
            onDeleteForEveryone={handleDeleteForEveryone}
            onReply={(msg) => {
              handleInitiateReply(msg);
              setShowMessageActionModal(false);
              setSelectedMessage(null);
            }}
            onCopy={() => {
              setShowMessageActionModal(false);
              setSelectedMessage(null);
            }}
            insets={insets}
          />

          {/* Photo Preview & Send Modal (with View-Once Option) */}
          <PhotoPreviewModal
            visible={showPhotoPreviewModal}
            selectedPhotos={selectedPhotos}
            activePhotoIndex={activePhotoIndex}
            setActivePhotoIndex={setActivePhotoIndex}
            setSelectedPhotos={setSelectedPhotos}
            photoCaption={photoCaption}
            setPhotoCaption={setPhotoCaption}
            isViewOnce={isViewOnce}
            setIsViewOnce={setIsViewOnce}
            isSendingPhoto={isSendingPhoto}
            onClose={() => {
              if (!isSendingPhoto) {
                setShowPhotoPreviewModal(false);
                setSelectedPhotos([]);
                setPhotoCaption('');
                setIsViewOnce(false);
              }
            }}
            onSend={handleSendPhoto}
            safeTopPadding={safeTopPadding}
            insets={insets}
          />

          {/* Fullscreen Photo Lightbox Modal */}
          {renderImageViewerModal()}

          {/* Floating Jump to Latest Message Button */}
          {showScrollBottomBtn && (
            <Animated.View
              style={[
                styles.floatingScrollBottomWrap,
                {
                  opacity: scrollBottomBtnAnim,
                  transform: [
                    {
                      scale: scrollBottomBtnAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.75, 1],
                      }),
                    },
                  ],
                },
              ]}
              pointerEvents={showScrollBottomBtn ? 'auto' : 'none'}
            >
              <TouchableOpacity
                style={styles.floatingScrollBottomBtn}
                onPress={handleJumpToLatest}
                activeOpacity={0.82}
              >
                <MaterialIcons name="keyboard-arrow-down" size={24} color={colors.CYAN_ACCENT} />
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Floating Bottom Chat Input Bar */}
          <ChatInputBar
            message={message}
            onChangeMessage={handleMessageTextChange}
            onSend={sendMessage}
            showAttachments={showAttachments}
            onToggleAttachments={() => {
              Keyboard.dismiss();
              setShowAttachments((prev) => !prev);
            }}
            replyingToMessage={replyingToMessage}
            onDismissReply={() => setReplyingToMessage(null)}
            otherUsername={otherUsername}
            currentUserId={auth().currentUser?.uid}
            isSelfChat={isSelfChat}
            isKeyboardVisible={isKeyboardVisible}
            messageInputRef={messageInputRef}
          />

          {/* Android Keyboard Dynamic Spacer */}
          {Platform.OS === 'android' && (
            <Animated.View style={{ height: keyboardHeightAnim }} />
          )}
        </>
      )}

      {/* Alphanumeric Chat Lock Bottom Sheet */}
      <ChatLockBottomSheet
        visible={chatLockModalVisible}
        mode={chatLockModalMode}
        userName={otherUsername}
        onSuccess={async () => {
          const currentUid = auth().currentUser?.uid;
          if (chatLockModalMode === 'setup') {
            if (currentUid && otherUserId) {
              const effectiveChatId = chatId || chatIdRef.current || route.params?.chatId;
              await lockChatForUser(currentUid, otherUserId, effectiveChatId);
              setIsChatLocked(true);
              setIsScreenUnlocked(true);
              markSessionUnlocked(otherUserId);
              showCineAlert({
                title: 'Chat Locked',
                message: `@${otherUsername} is now locked and protected with passcode.`,
                type: 'success',
              });
            }
          } else if (chatLockModalMode === 'remove') {
            if (currentUid && otherUserId) {
              const effectiveChatId = chatId || chatIdRef.current || route.params?.chatId;
              await unlockChatForUser(currentUid, otherUserId, effectiveChatId);
              setIsChatLocked(false);
              setIsScreenUnlocked(true);
              showCineAlert({
                title: 'Chat Unlocked',
                message: `@${otherUsername} is now unlocked and accessible from your main chats.`,
                type: 'success',
              });
            }
          } else {
            setIsScreenUnlocked(true);
            if (otherUserId) markSessionUnlocked(otherUserId);
          }
          setChatLockModalVisible(false);
        }}
        onClose={() => setChatLockModalVisible(false)}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
  },
  chatLockGuardOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: colors.BACKGROUND_COLOR,
  },
  lockGuardEmblem: {
    width: 76,
    height: 76,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 0, 0.35)',
    shadowColor: colors.FILM_GOLD,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  lockGuardGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockGuardTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 8,
    textAlign: 'center',
  },
  lockGuardSubtitle: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 28,
  },
  lockGuardUnlockBtn: {
    width: '100%',
    maxWidth: 240,
    height: 48,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  lockGuardUnlockGradient: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  lockGuardUnlockIcon: {
    marginRight: 8,
  },
  lockGuardUnlockText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  messagesList: {
    flex: 1,
  },
  messagesListPadding: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    paddingBottom: 12,
  },
  messagesListEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typingIndicatorRow: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    alignItems: 'flex-start',
  },
  typingIndicatorBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.22)',
  },
  typingIndicatorLabel: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    fontWeight: '500',
  },
  emptyChatWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 20,
  },
  emptyChatIconBox: {
    width: 64,
    height: 64,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  emptyChatIconBoxSelfChat: {
    borderColor: 'rgba(124, 58, 237, 0.4)',
  },
  emptyChatIconGrad: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyChatTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyChatSubtext: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  dateSeparator: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    marginVertical: 14,
  },
  dateText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
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
  myMessageTextColor: {
    color: '#FFF',
  },
  linkTextMine: {
    color: '#93C5FD',
    textDecorationLine: 'underline',
  },
  linkTextTheir: {
    color: colors.CYAN_ACCENT,
    textDecorationLine: 'underline',
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
  myTimestamp: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  seenReceiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  seenIconMargin: {
    marginLeft: 4,
  },
  linkMessageBubble: {
    padding: 0,
    overflow: 'hidden',
    minWidth: 260,
    maxWidth: '85%',
  },
  linkMessageTextWrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  linkMessageFooter: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 0,
  },
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
  deletedBubbleIcon: {
    marginRight: 6,
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
  viewOnceLockIcon: {
    marginLeft: 8,
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
  callTileTitleMissed: {
    color: colors.LIVE_RED,
  },
  callTileSubtitle: {
    fontSize: 12,
    color: colors.SUB_TITLE_COLOR,
    fontWeight: '500',
  },
  callTileSubtitleMissed: {
    color: colors.CYAN_ACCENT,
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
    paddingTop: 2,
  },
  callTileTimestamp: {
    fontSize: 10,
    color: colors.SUB_TITLE_COLOR,
  },
  highlightedMessageBubble: {
    borderWidth: 1.5,
    borderColor: colors.CYAN_ACCENT,
    shadowColor: colors.CYAN_ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 10,
    elevation: 8,
  },
  floatingScrollBottomWrap: {
    position: 'absolute',
    right: 16,
    bottom: 85,
    zIndex: 10,
  },
  floatingScrollBottomBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
});

export default React.memo(ChatScreen);
