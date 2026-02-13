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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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

  // Listen for incoming calls ONLY after chatId is ready
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
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();

      const ring = Animated.loop(
        Animated.sequence([
          Animated.timing(ringAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(ringAnim, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
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

  const renderMessage = ({ item }) => {
    const isMyMessage = item.senderId === auth.currentUser?.uid;

    if (item.type === 'voice') {
      return (
        <View style={[
          styles.messageContainer,
          isMyMessage ? styles.myMessage : styles.theirMessage,
          styles.voiceContainer,
        ]}>
          <TouchableOpacity style={styles.voicePlayButton}>
            <MaterialIcons name="play-arrow" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.voiceWaveform} />
          <Text style={styles.voiceDuration}>{item.duration}</Text>
          <Text style={styles.timestamp}>
            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      );
    }

    return (
      <View style={[
        styles.messageContainer,
        isMyMessage ? styles.myMessage : styles.theirMessage,
      ]}>
        <Text style={styles.messageText}>{item.text}</Text>
        <Text style={styles.timestamp}>
          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    );
  };

  const renderAttachmentButtons = () => (
    <View style={styles.attachmentButtons}>
      <TouchableOpacity style={[styles.attachmentButton, { backgroundColor: '#FF2D55' }]}>
        <MaterialIcons name="camera-alt" size={24} color="#FFFFFF" />
      </TouchableOpacity>
      <TouchableOpacity style={[styles.attachmentButton, { backgroundColor: '#5856D6' }]}>
        <MaterialIcons name="photo" size={24} color="#FFFFFF" />
      </TouchableOpacity>
      <TouchableOpacity style={[styles.attachmentButton, { backgroundColor: '#FF9500' }]}>
        <MaterialIcons name="insert-drive-file" size={24} color="#FFFFFF" />
      </TouchableOpacity>
      <TouchableOpacity style={[styles.attachmentButton, { backgroundColor: '#4CD964' }]}>
        <MaterialIcons name="location-on" size={24} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );

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

    const ringScale = ringAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 1.6],
    });
    const ringOpacity = ringAnim.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0.4, 0.15, 0],
    });

    return (
      <Modal
        visible={isVisible}
        animationType="fade"
        transparent={false}
        statusBarTranslucent
      >
        <View style={callStyles.container}>
          {/* ── Video backgrounds when in video call ── */}
          {isVideo && callState === 'connected' ? (
            <>
              {/* Remote video — full screen */}
              {remoteStream ? (
                <RTCView
                  streamURL={remoteStream.toURL()}
                  style={callStyles.remoteVideo}
                  objectFit="cover"
                  mirror={false}
                />
              ) : (
                <View style={callStyles.remoteVideoPlaceholder}>
                  <MaterialIcons name="videocam-off" size={48} color="rgba(255,255,255,0.3)" />
                  <Text style={callStyles.videoPlaceholderText}>Waiting for video...</Text>
                </View>
              )}

              {/* Local video — small PiP */}
              {localStream && !isCameraOff && (
                <View style={[callStyles.localVideoWrapper, { top: insets.top + 60 }]}>
                  <RTCView
                    streamURL={localStream.toURL()}
                    style={callStyles.localVideo}
                    objectFit="cover"
                    mirror={true}
                    zOrder={1}
                  />
                  <TouchableOpacity
                    style={callStyles.switchCameraBtn}
                    onPress={switchCamera}
                  >
                    <MaterialIcons name="flip-camera-ios" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : (
            <>
              {/* Non-video background gradients */}
              <View style={callStyles.bgGradientTop} />
              <View style={callStyles.bgGradientBottom} />
            </>
          )}

          {/* ── Top bar ── */}
          <View style={[callStyles.topBar, { paddingTop: insets.top + 10 }]}>
            <View style={callStyles.encryptionBadge}>
              <MaterialIcons name="lock" size={12} color="#4CAF50" />
              <Text style={callStyles.encryptionText}>End-to-end encrypted</Text>
            </View>
            {isVideo && callState === 'connected' && (
              <View style={callStyles.callTypeBadge}>
                <MaterialIcons name="videocam" size={14} color="#6C63FF" />
                <Text style={callStyles.callTypeText}>Video Call</Text>
              </View>
            )}
          </View>

          {/* ── Center content (show avatar for audio, & for video when not connected) ── */}
          {(!isVideo || callState !== 'connected') && (
            <View style={callStyles.centerContent}>
              {(callState === 'calling' || callState === 'incoming') && (
                <>
                  <Animated.View
                    style={[
                      callStyles.pulseRing,
                      {
                        transform: [{ scale: ringScale }],
                        opacity: ringOpacity,
                      },
                    ]}
                  />
                  <Animated.View
                    style={[
                      callStyles.pulseRingOuter,
                      {
                        transform: [{ scale: Animated.multiply(ringScale, 1.2) }],
                        opacity: Animated.multiply(ringOpacity, 0.5),
                      },
                    ]}
                  />
                </>
              )}

              <Animated.View
                style={[
                  callStyles.avatarWrapper,
                  callState === 'connected' && callStyles.avatarConnectedGlow,
                  {
                    transform: [{ scale: callState !== 'connected' ? pulseAnim : 1 }],
                  },
                ]}
              >
                <Image
                  style={callStyles.avatar}
                  source={{ uri: avatarUri }}
                />
              </Animated.View>

              <Text style={callStyles.callerName}>{username}</Text>

              <Text style={callStyles.callStatusText}>
                {callState === 'calling' && (isVideo ? 'Video Calling...' : 'Calling...')}
                {callState === 'incoming' && (isVideo ? 'Incoming Video Call' : 'Incoming Voice Call')}
                {callState === 'connected' && formatDuration(callDuration)}
              </Text>

              {callError && (
                <View style={callStyles.errorBadge}>
                  <MaterialIcons name="error-outline" size={16} color="#FF6B6B" />
                  <Text style={callStyles.errorText}>{callError}</Text>
                </View>
              )}
            </View>
          )}

          {/* Video connected overlay info */}
          {isVideo && callState === 'connected' && (
            <View style={callStyles.videoOverlayInfo}>
              <Text style={callStyles.videoCallerName}>{username}</Text>
              <Text style={callStyles.videoDuration}>{formatDuration(callDuration)}</Text>
              {callError && (
                <View style={callStyles.errorBadge}>
                  <MaterialIcons name="error-outline" size={16} color="#FF6B6B" />
                  <Text style={callStyles.errorText}>{callError}</Text>
                </View>
              )}
            </View>
          )}

          {/* ── Bottom action buttons ── */}
          <View style={[callStyles.bottomBar, { paddingBottom: insets.bottom + 20 }]}>
            {/* Outgoing Call */}
            {callState === 'calling' && (
              <View style={callStyles.actionsRow}>
                <TouchableOpacity
                  style={callStyles.endCallBtn}
                  onPress={() => endCall('cancelled')}
                  activeOpacity={0.7}
                >
                  <View style={callStyles.endCallIcon}>
                    <MaterialIcons name="call-end" size={32} color="#FFFFFF" />
                  </View>
                  <Text style={callStyles.actionLabel}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Incoming Call */}
            {callState === 'incoming' && (
              <View style={callStyles.actionsRow}>
                <TouchableOpacity
                  style={callStyles.actionBtn}
                  onPress={declineCall}
                  activeOpacity={0.7}
                >
                  <View style={[callStyles.circleBtn, callStyles.declineBtn]}>
                    <MaterialIcons name="call-end" size={30} color="#FFFFFF" />
                  </View>
                  <Text style={callStyles.actionLabel}>Decline</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={callStyles.actionBtn}
                  onPress={answerCall}
                  activeOpacity={0.7}
                >
                  <View style={[callStyles.circleBtn, callStyles.acceptBtn]}>
                    <MaterialIcons name={isVideo ? 'videocam' : 'call'} size={30} color="#FFFFFF" />
                  </View>
                  <Text style={callStyles.actionLabel}>Accept</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Connected (In Call) */}
            {callState === 'connected' && (
              <View style={callStyles.actionsRow}>
                <TouchableOpacity
                  style={callStyles.actionBtn}
                  onPress={toggleMute}
                  activeOpacity={0.7}
                >
                  <View style={[
                    callStyles.circleBtn,
                    callStyles.controlBtn,
                    isMuted && callStyles.controlBtnActive,
                  ]}>
                    <MaterialIcons
                      name={isMuted ? 'mic-off' : 'mic'}
                      size={24}
                      color="#FFFFFF"
                    />
                  </View>
                  <Text style={callStyles.actionLabel}>
                    {isMuted ? 'Unmute' : 'Mute'}
                  </Text>
                </TouchableOpacity>

                {/* Camera toggle — only for video calls */}
                {isVideo && (
                  <TouchableOpacity
                    style={callStyles.actionBtn}
                    onPress={toggleCamera}
                    activeOpacity={0.7}
                  >
                    <View style={[
                      callStyles.circleBtn,
                      callStyles.controlBtn,
                      isCameraOff && callStyles.controlBtnActive,
                    ]}>
                      <MaterialIcons
                        name={isCameraOff ? 'videocam-off' : 'videocam'}
                        size={24}
                        color="#FFFFFF"
                      />
                    </View>
                    <Text style={callStyles.actionLabel}>
                      {isCameraOff ? 'Cam On' : 'Cam Off'}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={callStyles.actionBtn}
                  onPress={() => endCall('ended')}
                  activeOpacity={0.7}
                >
                  <View style={[callStyles.circleBtn, callStyles.declineBtn, { width: 68, height: 68, borderRadius: 34 }]}>
                    <MaterialIcons name="call-end" size={32} color="#FFFFFF" />
                  </View>
                  <Text style={callStyles.actionLabel}>End</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={callStyles.actionBtn}
                  onPress={toggleSpeaker}
                  activeOpacity={0.7}
                >
                  <View style={[
                    callStyles.circleBtn,
                    callStyles.controlBtn,
                    isSpeaker && callStyles.controlBtnActive,
                  ]}>
                    <MaterialIcons
                      name={isSpeaker ? 'volume-up' : 'volume-down'}
                      size={24}
                      color="#FFFFFF"
                    />
                  </View>
                  <Text style={callStyles.actionLabel}>
                    {isSpeaker ? 'Speaker' : 'Phone'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    );
  };

  // ─── Header ───────────────────────────────────────────────

  const headerRight = (
    <View style={styles.headerRight}>
      <TouchableOpacity
        style={styles.headerButton}
        onPress={() => {
          console.log('Voice call pressed, chatId:', chatId);
          startCall('audio');
        }}
      >
        <MaterialIcons name="call" size={22} color="#FFFFFF" />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.headerButton}
        onPress={() => {
          console.log('Video call pressed, chatId:', chatId);
          startCall('video');
        }}
      >
        <MaterialIcons name="videocam" size={22} color="#FFFFFF" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.headerButton}>
        <MaterialIcons name="more-horiz" size={22} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );

  // ─── Render ───────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="transparent" barStyle="light-content" translucent />

      <Animated.View style={[
        styles.header,
        { paddingTop: insets.top },
        isScrolled && styles.headerScrolled,
      ]}>
        <View style={styles.headerContent}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <MaterialIcons name="arrow-back-ios" size={22} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerProfile}
              onPress={() => navigation.navigate('Profile', { userId: route.params?.userId })}
            >
              <Image
                style={styles.avatar}
                source={{ uri: route.params?.avatar || 'https://via.placeholder.com/40' }}
              />
              <View style={styles.headerInfo}>
                <Text style={styles.headerName}>{route.params?.username || 'Chat'}</Text>
                <View style={styles.onlineContainer}>
                  <View style={styles.onlineDot} />
                  <Text style={styles.headerStatus}>Online</Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>

          {headerRight}
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
          contentContainerStyle={styles.messagesList}
          inverted={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          ref={flatListRef}
        />

        {showAttachments && renderAttachmentButtons()}

        <View style={styles.inputContainer}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowAttachments(!showAttachments)}
          >
            <MaterialIcons name="add" size={24} color="#007AFF" />
          </TouchableOpacity>

          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Type a message..."
              placeholderTextColor="#666666"
              value={message}
              onChangeText={setMessage}
              multiline
            />
          </View>

          <TouchableOpacity style={styles.emojiButton}>
            <MaterialIcons name="emoji-emotions" size={24} color="#666666" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sendButton, { opacity: message.trim().length > 0 ? 1 : 0.5 }]}
            onPress={sendMessage}
            disabled={message.trim().length === 0}
          >
            <MaterialIcons name="send" size={24} color="#007AFF" />
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
    backgroundColor: '#121212',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: 'rgba(26, 26, 26, 0.98)',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerScrolled: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backButton: {
    padding: 8,
    marginRight: 4,
  },
  headerProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2A2A2A',
  },
  headerInfo: {
    marginLeft: 12,
    flex: 1,
  },
  headerName: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  onlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
    marginRight: 6,
  },
  headerStatus: {
    color: '#999999',
    fontSize: 13,
    letterSpacing: 0.1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerButton: {
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  messagesList: {
    padding: 16,
    marginTop: 60,
  },
  messageContainer: {
    maxWidth: '80%',
    marginVertical: 4,
    padding: 12,
    borderRadius: 20,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
    borderTopRightRadius: 4,
  },
  theirMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#2A2A2A',
    borderTopLeftRadius: 4,
  },
  messageText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  timestamp: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  voiceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  voicePlayButton: {
    padding: 4,
  },
  voiceWaveform: {
    flex: 1,
    height: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 15,
    marginHorizontal: 8,
  },
  voiceDuration: {
    color: '#FFFFFF',
    fontSize: 12,
    marginRight: 8,
  },
  attachmentButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    backgroundColor: '#1A1A1A',
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
  },
  attachmentButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
  },
  addButton: {
    padding: 8,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: '#2A2A2A',
    borderRadius: 20,
    marginHorizontal: 8,
    paddingHorizontal: 16,
    maxHeight: 100,
  },
  input: {
    color: '#FFFFFF',
    fontSize: 16,
    paddingVertical: 8,
  },
  emojiButton: {
    padding: 8,
  },
  sendButton: {
    padding: 8,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

// ─── Call Modal Styles ──────────────────────────────────────

const callStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  bgGradientTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40%',
    backgroundColor: 'transparent',
    borderBottomLeftRadius: 300,
    borderBottomRightRadius: 300,
    opacity: 0.4,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 80 },
    shadowOpacity: 0.3,
    shadowRadius: 120,
  },
  bgGradientBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '30%',
    backgroundColor: 'rgba(20, 20, 30, 0.8)',
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
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#1A1A2E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlaceholderText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    marginTop: 12,
  },
  localVideoWrapper: {
    position: 'absolute',
    right: 16,
    width: 120,
    height: 170,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(108, 99, 255, 0.6)',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  localVideo: {
    width: '100%',
    height: '100%',
  },
  switchCameraBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 12,
    zIndex: 10,
  },
  encryptionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.12)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  encryptionText: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  callTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(108, 99, 255, 0.12)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  callTypeText: {
    color: '#6C63FF',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.3,
  },

  // Center content
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 40,
    zIndex: 5,
  },
  pulseRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: '#6C63FF',
  },
  pulseRingOuter: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1.5,
    borderColor: '#6C63FF',
  },
  avatarWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'rgba(108, 99, 255, 0.5)',
    marginBottom: 24,
  },
  avatarConnectedGlow: {
    borderColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  callerName: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  callStatusText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 16,
    fontWeight: '400',
    letterSpacing: 0.3,
  },

  // Video overlay info (shown when video is connected)
  videoOverlayInfo: {
    position: 'absolute',
    top: '12%',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  videoCallerName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  videoDuration: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    fontWeight: '500',
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  errorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 16,
    gap: 8,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
    fontWeight: '500',
  },

  // Bottom bar
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 28,
  },

  // Action buttons
  actionBtn: {
    alignItems: 'center',
    gap: 10,
  },
  circleBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  declineBtn: {
    backgroundColor: '#FF3B30',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  acceptBtn: {
    backgroundColor: '#34C759',
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  controlBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  controlBtnActive: {
    backgroundColor: '#6C63FF',
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  actionLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
  },

  // End call (for calling state)
  endCallBtn: {
    alignItems: 'center',
    gap: 10,
  },
  endCallIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
});

export default ChatScreen;