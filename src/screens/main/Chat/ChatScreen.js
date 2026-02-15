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
  Animated,
  Platform,
  KeyboardAvoidingView,
  Modal,
  Dimensions,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDatabase, ref, push, onValue, off, serverTimestamp, set } from 'firebase/database';
import { auth } from '../../../config/firebase';
import { useAudioCall } from '../../../webRTC/useAudioCall';
import { RTCView } from 'react-native-webrtc';
import colors from '../../../theme/Colors';

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
      day: 'numeric'
    });
  }
};

const ChatScreen = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('');
  const [showAttachments, setShowAttachments] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatId, setChatId] = useState(null);
  const flatListRef = useRef(null);

  // Animations for call UI
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ringAnim = useRef(new Animated.Value(0)).current;
  const attachAnim = useRef(new Animated.Value(0)).current;
  const headerOpacity = useRef(new Animated.Value(1)).current;

  // Use the audio/video call hook
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
  } = useAudioCall(chatId);

  // ─── Initialize chat ─────────────────────────────────────

  useEffect(() => {
    initializeChat();
    setupUserPresence();
    return () => {
      if (chatId) {
        const db = getDatabase();
        const chatRef = ref(db, `chats/${chatId}/messages`);
        off(chatRef);
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

  // Pulse animation for call states
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

  const initializeChat = async () => {
    const db = getDatabase();
    const currentUser = auth.currentUser;
    const otherUserId = route.params?.userId;

    if (!currentUser || !otherUserId) return;

    const userChatsRef = ref(db, `user_chats/${currentUser.uid}`);
    onValue(userChatsRef, (snapshot) => {
      const chats = snapshot.val();
      if (chats) {
        const existingChatId = Object.keys(chats).find(
          (key) => chats[key].otherUserId === otherUserId
        );
        if (existingChatId) {
          setChatId(existingChatId);
          listenToMessages(existingChatId);
        } else {
          createNewChat(currentUser.uid, otherUserId);
        }
      } else {
        createNewChat(currentUser.uid, otherUserId);
      }
    });
  };

  const createNewChat = async (currentUserId, otherUserId) => {
    const db = getDatabase();
    const newChatRef = push(ref(db, 'chats'));
    const newChatId = newChatRef.key;

    await Promise.all([
      set(ref(db, `chats/${newChatId}/participants/${currentUserId}`), true),
      set(ref(db, `chats/${newChatId}/participants/${otherUserId}`), true),
      set(ref(db, `user_chats/${currentUserId}/${newChatId}`), {
        otherUserId,
        lastMessage: '',
        lastMessageTimestamp: serverTimestamp(),
      }),
      set(ref(db, `user_chats/${otherUserId}/${newChatId}`), {
        otherUserId: currentUserId,
        lastMessage: '',
        lastMessageTimestamp: serverTimestamp(),
      }),
    ]);

    setChatId(newChatId);
    listenToMessages(newChatId);
  };

  const listenToMessages = (activeChatId) => {
    const db = getDatabase();
    const messagesRef = ref(db, `chats/${activeChatId}/messages`);

    onValue(messagesRef, (snapshot) => {
      const messagesData = snapshot.val();
      if (messagesData) {
        const messagesList = Object.entries(messagesData).map(([id, data]) => ({
          id,
          ...data,
        }));
        messagesList.sort((a, b) => a.timestamp - b.timestamp);
        setMessages(messagesList);

        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    });
  };

  const sendMessage = async () => {
    if (!message.trim() || !chatId) return;

    const db = getDatabase();
    const currentUser = auth.currentUser;
    const messageData = {
      text: message.trim(),
      senderId: currentUser.uid,
      timestamp: serverTimestamp(),
      type: 'text',
    };

    const newMessageRef = push(ref(db, `chats/${chatId}/messages`));
    await set(newMessageRef, messageData);
    setMessage('');
  };

  const setupUserPresence = () => {
    if (!auth.currentUser) return;
    const db = getDatabase();
    const userStatusRef = ref(db, `users/${auth.currentUser.uid}/status`);
    set(userStatusRef, 'online');

    const connectedRef = ref(db, '.info/connected');
    onValue(connectedRef, (snapshot) => {
      if (snapshot.val() === false) {
        set(userStatusRef, 'offline');
      } else {
        set(userStatusRef, 'online');
      }
    });
  };

  // ─── Message rendering ───────────────────────────────────

  const renderMessage = ({ item, index }) => {
    const isMyMessage = item.senderId === auth.currentUser?.uid;

    const dateSeparator = (() => {
      const currentMessageDate = new Date(item.timestamp);
      const previousMessage = index > 0 ? messages[index - 1] : null;
      const previousMessageDate = previousMessage ? new Date(previousMessage.timestamp) : null;

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

    if (item.type === 'voice') {
      return (
        <View>
          {dateSeparator}
          <View style={[
            styles.messageContainer,
            isMyMessage ? styles.myMessage : styles.theirMessage,
            styles.voiceContainer,
          ]}>
            <TouchableOpacity style={styles.voicePlayButton}>
              <MaterialIcons name="play-arrow" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={styles.voiceWaveform}>
              {[...Array(18)].map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.waveBar,
                    { height: 4 + Math.sin(i * 0.8) * 10 + 8 },
                  ]}
                />
              ))}
            </View>
            <Text style={styles.voiceDuration}>{item.duration}</Text>
            <Text style={styles.timestamp}>
              {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View>
        {dateSeparator}
        <View style={[
          styles.messageContainer,
          isMyMessage ? styles.myMessage : styles.theirMessage,
        ]}>
          <Text style={styles.messageText}>{item.text}</Text>
          <View style={styles.messageFooter}>
            <Text style={styles.timestamp}>
              {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {isMyMessage && (
              <MaterialIcons name="done-all" size={13} color="rgba(0, 122, 255, 0.8)" style={{ marginLeft: 4 }} />
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderAttachmentButtons = () => {
    const attachments = [
      { icon: 'camera-alt', color: colors.PRIMARY_COLOR, label: 'Camera' },
      { icon: 'photo', color: '#AF52DE', label: 'Gallery' },
      { icon: 'insert-drive-file', color: colors.FILM_GOLD, label: 'File' },
      { icon: 'location-on', color: colors.ACCEPT_GREEN, label: 'Location' },
    ];

    return (
      <Animated.View style={[
        styles.attachmentPanel,
        {
          opacity: attachAnim,
          transform: [{ translateY: attachAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
        },
      ]}>
        {attachments.map((att, i) => (
          <TouchableOpacity key={i} style={styles.attachmentItem} activeOpacity={0.7}>
            <View style={[styles.attachmentButton, { backgroundColor: att.color + '22', borderColor: att.color + '44' }]}>
              <MaterialIcons name={att.icon} size={22} color={att.color} />
            </View>
            <Text style={styles.attachmentLabel}>{att.label}</Text>
          </TouchableOpacity>
        ))}
      </Animated.View>
    );
  };

  const handleScroll = (event) => {
    const scrollY = event.nativeEvent.contentOffset.y;
    setIsScrolled(scrollY > 10);
  };



  // ─── Call Modal UI ────────────────────────────────────────

  const renderCallModal = () => {
    const isVisible = callState !== 'idle';
    const username = route.params?.username || 'Unknown';
    const avatarUri = route.params?.avatar || 'https://via.placeholder.com/120';
    const isVideo = callType === 'video';

    const ringScale = ringAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });
    const ringOpacity = ringAnim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.5, 0.15, 0] });
    const ring2Scale = ringAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] });
    const ring2Opacity = ringAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.25, 0.05, 0] });

    return (
      <Modal
        visible={isVisible}
        animationType="fade"
        transparent={false}
        statusBarTranslucent
      >
        <View style={callStyles.container}>

          {/* ── Cinematic Background ── */}
          {isVideo && callState === 'connected' ? (
            <>
              {remoteStream ? (
                <RTCView
                  streamURL={remoteStream.toURL()}
                  style={callStyles.remoteVideo}
                  objectFit="cover"
                  mirror={false}
                />
              ) : (
                <View style={callStyles.remoteVideoPlaceholder}>
                  <MaterialIcons name="videocam-off" size={56} color="rgba(255,255,255,0.15)" />
                  <Text style={callStyles.videoPlaceholderText}>Connecting video...</Text>
                </View>
              )}
              {localStream && !isCameraOff && (
                <View style={[callStyles.localVideoWrapper, { top: insets.top + 100 }]}>
                  <RTCView
                    streamURL={localStream.toURL()}
                    style={callStyles.localVideo}
                    objectFit="cover"
                    mirror={true}
                    zOrder={2}
                  />
                  <TouchableOpacity style={callStyles.switchCameraBtn} onPress={switchCamera} activeOpacity={0.7}>
                    <MaterialIcons name="flip-camera-ios" size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : (
            /* Audio call / non-connected background */
            <View style={callStyles.audioBg}>
              <Image
                source={{ uri: avatarUri }}
                style={callStyles.blurredBgImage}
                blurRadius={Platform.OS === 'ios' ? 30 : 10}
              />
              <View style={callStyles.bgOverlay} />

              {/* Radial glow around center */}
              <View style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: 350,
                height: 350,
                borderRadius: 175,
                marginLeft: -175,
                marginTop: -175,
                backgroundColor: colors.PRIMARY_COLOR,
                opacity: 0.08,
                shadowColor: colors.PRIMARY_COLOR,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 1,
                shadowRadius: 100,
                elevation: 20,
              }} />

            </View>
          )}

          {/* ── Top bar ── */}
          <View style={[callStyles.topBar, { paddingTop: insets.top + 12 }]}>
            <View style={callStyles.encryptionBadge}>
              <MaterialIcons name="lock" size={11} color={colors.ACCEPT_GREEN} />
              <Text style={callStyles.encryptionText}>End-to-end encrypted</Text>
            </View>
            {isVideo && callState === 'connected' && (
              <View style={callStyles.callTypeBadge}>
                <MaterialIcons name="videocam" size={13} color={colors.PRIMARY_COLOR} />
                <Text style={callStyles.callTypeText}>Video Call</Text>
              </View>
            )}
          </View>

          {/* ── Center content (audio or non-connected video) ── */}
          {(!isVideo || callState !== 'connected') && (
            <View style={callStyles.centerContent}>

              {/* Ripple rings */}
              {(callState === 'calling' || callState === 'incoming') && (
                <>

                </>
              )}

              {/* Avatar with cinematic frame */}
              <Animated.View style={[
                callStyles.avatarFrame,
                callState === 'connected' && callStyles.avatarConnected,
                { transform: [{ scale: callState !== 'connected' ? pulseAnim : 1 }] },
              ]}>

                <View style={[callStyles.cornerMark, callStyles.cornerTL]} />
                <View style={[callStyles.cornerMark, callStyles.cornerTR]} />
                <View style={[callStyles.cornerMark, callStyles.cornerBL]} />
                <View style={[callStyles.cornerMark, callStyles.cornerBR]} />
                <Image style={{
                  width: 122,
                  height: 122,
                  borderRadius: 61,
                  backgroundColor: colors.CARD_COLOR,
                }} source={{ uri: "https://picsum.photos/id/237/200/300" }} />
              </Animated.View>

              <Text style={callStyles.callerName}>{username}</Text>

              <View style={callStyles.statusRow}>
                {callState === 'calling' && (
                  <View style={callStyles.statusPill}>
                    <Animated.View style={[callStyles.statusDot, { opacity: pulseAnim.interpolate({ inputRange: [1, 1.12], outputRange: [0.5, 1] }) }]} />
                    <Text style={callStyles.callStatusText}>{isVideo ? 'Video Calling...' : 'Ringing...'}</Text>
                  </View>
                )}
                {callState === 'incoming' && (
                  <View style={[callStyles.statusPill, { borderColor: colors.ACCEPT_GREEN + '66', backgroundColor: colors.ACCEPT_GREEN + '15' }]}>
                    <View style={[callStyles.statusDot, { backgroundColor: colors.ACCEPT_GREEN }]} />
                    <Text style={[callStyles.callStatusText, { color: colors.ACCEPT_GREEN }]}>
                      {isVideo ? 'Incoming Video Call' : 'Incoming Voice Call'}
                    </Text>
                  </View>
                )}
                {callState === 'connected' && (
                  <View style={[callStyles.statusPill, { borderColor: colors.ACCEPT_GREEN + '66', backgroundColor: colors.ACCEPT_GREEN + '15' }]}>
                    <View style={[callStyles.statusDot, { backgroundColor: colors.ACCEPT_GREEN }]} />
                    <Text style={[callStyles.callStatusText, { color: colors.ACCEPT_GREEN }]}>
                      {formatDuration(callDuration)}
                    </Text>
                  </View>
                )}
              </View>

              {callError && (
                <View style={callStyles.errorBadge}>
                  <MaterialIcons name="error-outline" size={15} color={colors.DELETE_RED_COLOR} />
                  <Text style={callStyles.errorText}>{callError}</Text>
                </View>
              )}
            </View>
          )}

          {/* Video overlay info */}
          {isVideo && callState === 'connected' && (
            <View style={[callStyles.videoOverlayInfo, { top: insets.top + 70 }]}>
              <Text style={callStyles.videoCallerName}>{username}</Text>
              <View style={[callStyles.statusPill, { borderColor: colors.ACCEPT_GREEN + '66', backgroundColor: 'rgba(0,200,83,0.15)' }]}>
                <View style={[callStyles.statusDot, { backgroundColor: colors.ACCEPT_GREEN }]} />
                <Text style={[callStyles.callStatusText, { color: colors.ACCEPT_GREEN }]}>
                  {formatDuration(callDuration)}
                </Text>
              </View>
              {callError && (
                <View style={callStyles.errorBadge}>
                  <MaterialIcons name="error-outline" size={15} color={colors.DELETE_RED_COLOR} />
                  <Text style={callStyles.errorText}>{callError}</Text>
                </View>
              )}
            </View>
          )}

          {/* ── Bottom action buttons ── */}
          <View style={[callStyles.bottomBar, { paddingBottom: insets.bottom + 24 }]}>

            {/* Gradient divider */}
            <View style={callStyles.bottomDivider} />

            {/* Outgoing Call */}
            {callState === 'calling' && (
              <View style={callStyles.actionsRow}>
                <TouchableOpacity style={callStyles.actionBtn} onPress={() => endCall('cancelled')} activeOpacity={0.8}>
                  <View style={[callStyles.circleBtn, callStyles.declineBtn]}>
                    <MaterialIcons name="call-end" size={30} color="#FFFFFF" />
                  </View>
                  <Text style={callStyles.actionLabel}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Incoming Call */}
            {callState === 'incoming' && (
              <View style={callStyles.actionsRow}>
                <TouchableOpacity style={callStyles.actionBtn} onPress={declineCall} activeOpacity={0.8}>
                  <View style={[callStyles.circleBtn, callStyles.declineBtn]}>
                    <MaterialIcons name="call-end" size={28} color="#FFFFFF" />
                  </View>
                  <Text style={callStyles.actionLabel}>Decline</Text>
                </TouchableOpacity>

                <TouchableOpacity style={callStyles.actionBtn} onPress={answerCall} activeOpacity={0.8}>
                  <View style={[callStyles.circleBtn, callStyles.acceptBtn]}>
                    <MaterialIcons name={isVideo ? 'videocam' : 'call'} size={28} color="#FFFFFF" />
                  </View>
                  <Text style={[callStyles.actionLabel, { color: colors.ACCEPT_GREEN }]}>Accept</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Connected (In Call) */}
            {callState === 'connected' && (
              <View style={callStyles.actionsRow}>
                <TouchableOpacity style={callStyles.actionBtn} onPress={toggleMute} activeOpacity={0.8}>
                  <View style={[callStyles.circleBtn, callStyles.controlBtn, isMuted && callStyles.controlBtnActive]}>
                    <MaterialIcons name={isMuted ? 'mic-off' : 'mic'} size={22} color="#FFFFFF" />
                  </View>
                  <Text style={callStyles.actionLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
                </TouchableOpacity>

                {isVideo && (
                  <TouchableOpacity style={callStyles.actionBtn} onPress={toggleCamera} activeOpacity={0.8}>
                    <View style={[callStyles.circleBtn, callStyles.controlBtn, isCameraOff && callStyles.controlBtnActive]}>
                      <MaterialIcons name={isCameraOff ? 'videocam-off' : 'videocam'} size={22} color="#FFFFFF" />
                    </View>
                    <Text style={callStyles.actionLabel}>{isCameraOff ? 'Cam On' : 'Cam Off'}</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={callStyles.actionBtn} onPress={() => endCall('ended')} activeOpacity={0.8}>
                  <View style={[callStyles.circleBtn, callStyles.declineBtn, callStyles.endCallLarge]}>
                    <MaterialIcons name="call-end" size={30} color="#FFFFFF" />
                  </View>
                  <Text style={callStyles.actionLabel}>End</Text>
                </TouchableOpacity>

                <TouchableOpacity style={callStyles.actionBtn} onPress={toggleSpeaker} activeOpacity={0.8}>
                  <View style={[callStyles.circleBtn, callStyles.controlBtn, isSpeaker && callStyles.controlBtnActive]}>
                    <MaterialIcons name={isSpeaker ? 'volume-up' : 'volume-down'} size={22} color="#FFFFFF" />
                  </View>
                  <Text style={callStyles.actionLabel}>{isSpeaker ? 'Speaker' : 'Earpiece'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    );
  };

  // ─── Header ───────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="transparent" barStyle="light-content" translucent />

      {/* ── Header ── */}
      <Animated.View style={[
        styles.header,
        { paddingTop: insets.top },
        isScrolled && styles.headerScrolled,
      ]}>


        <View style={styles.headerContent}>
          <View style={styles.headerLeft}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.7}>
              <MaterialIcons name="arrow-back-ios" size={20} color={colors.TITLE_COLOR} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerProfile}
              onPress={() => navigation.navigate('Profile', { userId: route.params?.userId })}
              activeOpacity={0.8}
            >
              <View style={styles.avatarWrapper}>
                <Image
                  style={styles.headerAvatar}
                  source={{ uri: route.params?.avatar || 'https://via.placeholder.com/40' }}
                />
                <View style={styles.onlineBadge} />
              </View>
              <View style={styles.headerInfo}>
                <Text style={styles.headerName}>{route.params?.username || 'Chat'}</Text>
                <View style={styles.onlineContainer}>
                  <View style={styles.onlineDot} />
                  <Text style={styles.headerStatus}>Online now</Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => startCall('audio')}
              activeOpacity={0.7}
            >
              <MaterialIcons name="call" size={19} color={colors.TITLE_COLOR} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => startCall('video')}
              activeOpacity={0.7}
            >
              <MaterialIcons name="videocam" size={20} color={colors.TITLE_COLOR} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerActionBtn} activeOpacity={0.7}>
              <MaterialIcons name="more-horiz" size={20} color={colors.TITLE_COLOR} />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : null}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
      >
        <FlatList
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.messagesList, { paddingTop: insets.top + 72 }]}
          inverted={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          ref={flatListRef}
          showsVerticalScrollIndicator={false}
        />

        {showAttachments && renderAttachmentButtons()}

        {/* ── Input Bar ── */}
        <View style={[styles.inputContainer, { alignItems: "center" }]}>
          <TouchableOpacity
            style={[styles.addButton, showAttachments && styles.addButtonActive]}
            onPress={() => setShowAttachments(!showAttachments)}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name={showAttachments ? 'close' : 'add'}
              size={22}
              color={showAttachments ? colors.PRIMARY_COLOR : colors.SUB_TITLE_COLOR}
            />
          </TouchableOpacity>

          <View style={[styles.inputWrapper, message.length > 0 && styles.inputWrapperActive]}>
            <TextInput
              style={styles.input}
              placeholder="Message..."
              placeholderTextColor={colors.MUTED_COLOR}
              value={message}
              onChangeText={setMessage}
              multiline
            />
            <TouchableOpacity style={styles.emojiButton} activeOpacity={0.7}>
              <MaterialIcons name="emoji-emotions" size={20} color={colors.MUTED_COLOR} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.sendButton, message.trim().length > 0 && styles.sendButtonActive]}
            onPress={sendMessage}
            disabled={message.trim().length === 0}
            activeOpacity={0.8}
          >
            <MaterialIcons name="send" size={20} color={message.trim().length > 0 ? '#FFFFFF' : colors.MUTED_COLOR} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {renderCallModal()}
    </SafeAreaView>
  );
};

// ─── Chat Screen Styles ─────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: colors.SURFACE_COLOR,
    borderBottomWidth: 1,
    borderBottomColor: colors.BORDER_SUBTLE,
  },

  headerScrolled: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
    backgroundColor: colors.SURFACE_COLOR,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 2,
  },
  headerProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarWrapper: {
    position: 'relative',
  },
  headerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.CARD_COLOR,
    borderWidth: 1.5,
    borderColor: colors.BORDER_ACTIVE,
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: colors.ACCEPT_GREEN,
    borderWidth: 2,
    borderColor: colors.SURFACE_COLOR,
  },
  headerInfo: {
    marginLeft: 11,
    flex: 1,
  },
  headerName: {
    color: colors.TITLE_COLOR,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  onlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.ACCEPT_GREEN,
    marginRight: 5,
  },
  headerStatus: {
    color: colors.ACCEPT_GREEN,
    fontSize: 11.5,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerActionBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: colors.CARD_COLOR,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  headerActionBtnPrimary: {
    backgroundColor: colors.PRIMARY_COLOR,
    borderColor: colors.PRIMARY_COLOR,
  },

  // Content
  content: {
    flex: 1,
  },
  messagesList: {
    paddingHorizontal: 14,
    paddingBottom: 12,
  },

  // Date separator
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dateLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.BORDER_SUBTLE,
  },
  dateText: {
    color: colors.MUTED_COLOR,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginHorizontal: 12,
  },

  // Messages
  messageContainer: {
    maxWidth: '78%',
    marginVertical: 3,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: colors.PRIMARY_COLOR,
    borderBottomRightRadius: 5,
  },
  theirMessage: {
    alignSelf: 'flex-start',
    backgroundColor: colors.SURFACE_ELEVATED,
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  messageText: {
    color: colors.TITLE_COLOR,
    fontSize: 15.5,
    lineHeight: 21,
    fontWeight: '400',
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  timestamp: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11,
    fontWeight: '400',
  },

  // Voice message
  voiceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 8,
  },
  voicePlayButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceWaveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 30,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  voiceDuration: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '500',
  },

  // Attachment panel
  attachmentPanel: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: colors.SURFACE_COLOR,
    borderTopWidth: 1,
    borderTopColor: colors.BORDER_SUBTLE,
  },
  attachmentItem: {
    alignItems: 'center',
    gap: 6,
  },
  attachmentButton: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  attachmentLabel: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '500',
  },

  // Input area
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: colors.SURFACE_COLOR,
    borderTopWidth: 1,
    borderTopColor: colors.BORDER_SUBTLE,
    gap: 8,
  },
  addButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.CARD_COLOR,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  addButtonActive: {
    borderColor: colors.PRIMARY_COLOR,
    backgroundColor: colors.PRIMARY_GLOW,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.CARD_COLOR,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
    paddingHorizontal: 14,
    paddingVertical: 4,
    maxHeight: 110,
  },
  inputWrapperActive: {
    borderColor: colors.PRIMARY_COLOR + '60',
  },
  input: {
    flex: 1,
    color: colors.TITLE_COLOR,
    fontSize: 15,
    paddingVertical: 8,
    lineHeight: 20,
  },
  emojiButton: {
    padding: 6,
    paddingBottom: 8,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.CARD_COLOR,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonActive: {
    backgroundColor: colors.PRIMARY_COLOR,
    borderColor: colors.PRIMARY_COLOR,
  },
});

// ─── Call Modal Styles ──────────────────────────────────────

const callStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
  },

  // Audio call cinematic background
  audioBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#05050A',
    overflow: 'hidden',
  },
  blurredBgImage: {
    position: 'absolute',
    top: -50,
    left: -50,
    right: -50,
    bottom: -50,
    opacity: 0.35,
    resizeMode: 'cover',
  },
  bgOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 5, 15, 0.75)',
  },
  bgGlow: {
    position: 'absolute',
    top: '30%',
    left: '50%',
    width: 400,
    height: 400,
    borderRadius: 200,
    marginLeft: -200,
    marginTop: -200,
    backgroundColor: colors.PRIMARY_COLOR,
    opacity: 0.08,
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 100,
    elevation: 20,
  },
  // Film strip decorations
  filmStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.03)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
  },
  filmStripTop: {
    top: 0,
  },
  filmStripBottom: {
    bottom: 0,
  },
  filmHole: {
    width: 22,
    height: 18,
    borderRadius: 3,
    backgroundColor: '#05050A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },

  // Video
  remoteVideo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
  },
  remoteVideoPlaceholder: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#0A0A16',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlaceholderText: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 14,
    letterSpacing: 0.3,
  },
  localVideoWrapper: {
    position: 'absolute',
    right: 16,
    width: 100,
    height: 150,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: '#000',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    zIndex: 100,
  },
  localVideo: {
    width: '100%',
    height: '100%',
  },
  switchCameraBtn: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 10,
    zIndex: 10,
  },
  encryptionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 200, 83, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(0, 200, 83, 0.2)',
  },
  encryptionText: {
    color: colors.ACCEPT_GREEN,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  callTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.PRIMARY_GLOW,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 5,
    borderWidth: 1,
    borderColor: colors.BORDER_ACTIVE,
  },
  callTypeText: {
    color: colors.PRIMARY_COLOR,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.2,
  },

  // Center
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 30,
    zIndex: 5,
  },
  pulseRing: {
    position: 'absolute',
    top: "32%",
    width: 180,
    height: 180,
    borderRadius: 180 / 2,
    borderWidth: 1.5,
    borderColor: colors.PRIMARY_COLOR,
  },
  pulseRingOuter: {
    position: 'absolute',
    top: "32%",
    width: 180,
    height: 180,
    borderRadius: 180 / 2,
    borderWidth: 1,
    borderColor: colors.PRIMARY_COLOR,
  },

  // Avatar with cinematic frame
  avatarFrame: {
    width: 126,
    height: 126,
    borderRadius: 63,
    position: 'relative',
    marginBottom: 26,
    borderWidth: 2,
    borderColor: colors.PRIMARY_COLOR + '70',
    overflow: 'visible',
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
  },
  avatarConnected: {
    borderColor: colors.ACCEPT_GREEN,
    shadowColor: colors.ACCEPT_GREEN,
    shadowOpacity: 0.5,
    shadowRadius: 24,
  },
  avatar: {
    width: 122,
    height: 122,
    borderRadius: 61,
    backgroundColor: colors.CARD_COLOR,
  },
  // Cinema-style corner marks
  cornerMark: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderColor: colors.PRIMARY_COLOR,
    zIndex: 10,
  },
  cornerTL: {
    top: -6,
    left: -6,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderTopLeftRadius: 3,
  },
  cornerTR: {
    top: -6,
    right: -6,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderTopRightRadius: 3,
  },
  cornerBL: {
    bottom: -6,
    left: -6,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderBottomLeftRadius: 3,
  },
  cornerBR: {
    bottom: -6,
    right: -6,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderBottomRightRadius: 3,
  },

  callerName: {
    color: colors.TITLE_COLOR,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 12,
  },
  statusRow: {
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(8, 8, 16, 0.5)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 7,
    borderWidth: 1.5,
    borderColor: colors.BORDER_ACTIVE,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.PRIMARY_COLOR,
  },
  callStatusText: {
    color: colors.PRIMARY_COLOR,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    fontVariant: ['tabular-nums'],
  },
  errorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    marginTop: 14,
    gap: 7,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.25)',
  },
  errorText: {
    color: colors.DELETE_RED_COLOR,
    fontSize: 13,
    fontWeight: '500',
  },

  // Video overlay
  videoOverlayInfo: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 8,
    zIndex: 10,
  },
  videoCallerName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
    marginBottom: 4,
  },

  // Bottom bar
  bottomBar: {
    marginHorizontal: 12,
    marginBottom: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    zIndex: 10,
    backgroundColor: 'rgba(15, 15, 26, 0.95)',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
  },
  bottomDivider: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.BORDER_SUBTLE,
    alignSelf: 'center',
    marginBottom: 20,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 24,
  },
  actionBtn: {
    alignItems: 'center',
    gap: 8,
    minWidth: 64,
  },
  circleBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  declineBtn: {
    backgroundColor: colors.DELETE_RED_COLOR,
    shadowColor: colors.DELETE_RED_COLOR,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
  },
  acceptBtn: {
    backgroundColor: colors.ACCEPT_GREEN,
    shadowColor: colors.ACCEPT_GREEN,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
  },
  controlBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  controlBtnActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  endCallLarge: {
    width: 68,
    height: 68,
    borderRadius: 34,
  },
  actionLabel: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11.5,
    fontWeight: '500',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
});

export default ChatScreen;