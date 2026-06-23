import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Pressable,
  Alert,
  SafeAreaView,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { auth, database } from '../../../config/firebase';
import colors from '../../../theme/Colors';
import { useRoomVoiceChat } from '../../../webRTC/useRoomVoiceChat';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const VIDEO_HEIGHT = SCREEN_WIDTH * (9 / 16);

const AVATAR_COLORS = [
  colors.PRIMARY_COLOR,
  colors.PURPLE_ACCENT,
  colors.CYAN_ACCENT,
  colors.FILM_GOLD,
  colors.ACCEPT_GREEN,
  colors.LIVE_RED,
];

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

const FloatingEmoji = ({ emoji }) => {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -150,
        duration: 2000,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 2000,
        useNativeDriver: true,
      }),
    ]).start();
  }, [translateY, opacity]);

  return (
    <Animated.View style={[styles.floatingEmoji, { transform: [{ translateY }], opacity }]}>
      <Text style={{ fontSize: 32 }}>{emoji}</Text>
    </Animated.View>
  );
};

const StreamingScreen = ({ route, navigation }) => {
  const { streamUrl, roomName, roomId } = route.params;

  // Video State
  const [playing, setPlaying] = useState(true);
  const playerRef = useRef(null);
  const [isCreator, setIsCreator] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  // Tabs
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'participants'

  // Chat State
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');

  // Participants State
  const [participantProfiles, setParticipantProfiles] = useState([]);
  const [onlineStatuses, setOnlineStatuses] = useState({});
  const [voiceParticipantStates, setVoiceParticipantStates] = useState({});

  // Reactions State
  const [floatingEmojis, setFloatingEmojis] = useState([]);

  // Auto-hide controls
  useEffect(() => {
    let timeoutId;
    if (controlsVisible && playing) {
      timeoutId = setTimeout(() => {
        setControlsVisible(false);
      }, 3000);
    }
    return () => timeoutId && clearTimeout(timeoutId);
  }, [controlsVisible, playing]);

  const getYoutubeVideoId = (url) => {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url?.match(regExp);
    return (match && match[7].length === 11) ? match[7] : false;
  };
  const videoId = getYoutubeVideoId(streamUrl);

  useEffect(() => {
    if (!videoId) {
      Alert.alert('Invalid URL', 'The provided YouTube URL is not valid.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    }
  }, [videoId, navigation]);

  const [creatorLeft, setCreatorLeft] = useState(false);

  // Fetch Room & Participants
  useEffect(() => {
    const roomRef = database().ref(`rooms/${roomId}`);

    const onRoomHandler = async (snapshot) => {
      const roomData = snapshot.val();
      if (!roomData) return;

      const userIsCreator = roomData.creator?.email === auth().currentUser?.email;
      setIsCreator(userIsCreator);

      // If the stream is stopped by creator, pause video and show message to viewers
      if (!userIsCreator && roomData.isStreaming === false) {
        setCreatorLeft(true);
        setPlaying(false);
      } else if (roomData.isStreaming === true) {
        setCreatorLeft(false);
      }

      // Fetch participants
      const allEmails = [roomData.creator?.email, ...(roomData.participants || [])].filter(Boolean);
      const uniqueEmails = [...new Set(allEmails)];
      const profiles = [];

      for (let i = 0; i < uniqueEmails.length; i++) {
        const email = uniqueEmails[i];
        try {
          const userSnap = await database()
            .ref('users')
            .orderByChild('email')
            .equalTo(email)
            .once('value');

          if (userSnap.exists()) {
            const userKey = Object.keys(userSnap.val())[0];
            const userData = userSnap.val()[userKey];
            const name = userData.username || email.split('@')[0];
            profiles.push({
              id: userKey,
              uid: userKey,
              name,
              email,
              username: `@${name.toLowerCase().replace(/\s/g, '')}`,
              color: AVATAR_COLORS[i % AVATAR_COLORS.length],
              initial: getInitials(name),
              isHost: email === roomData.creator?.email,
            });
          }
        } catch (error) {
          console.log('Error fetching user profile:', error);
        }
      }
      setParticipantProfiles(profiles);
    };

    roomRef.on('value', onRoomHandler);
    return () => roomRef.off('value', onRoomHandler);
  }, [roomId]);

  useEffect(() => {
    if (participantProfiles.length === 0) return;
    const db = database();
    const unsubs = participantProfiles.map(p => {
      // Listen at /status (supports both string "online" and object {state:"online"})
      const statusRef = db.ref(`users/${p.uid}/status`);
      const handler = snap => {
        const val = snap.val();
        const online = val === 'online' || val?.state === 'online';
        setOnlineStatuses(prev => ({ ...prev, [p.uid]: online }));
      };
      statusRef.on('value', handler);
      return () => statusRef.off('value', handler);
    });
    return () => unsubs.forEach(u => u());
  }, [participantProfiles]);

  const participants = participantProfiles.map(p => ({
    ...p,
    isOnline: onlineStatuses[p.uid] ?? false,
    isVoiceMuted: voiceParticipantStates[p.uid]?.muted ?? true,
  }));

  const {
    isReady: isVoiceReady,
    isMuted: isVoiceMuted,
    activeSpeakerCount,
    error: voiceError,
    toggleMute: toggleVoiceMute,
  } = useRoomVoiceChat(roomId, participantProfiles);

  const canUseRoomVoice = participants.length > 1;

  useEffect(() => {
    const voiceParticipantsRef = database().ref(`rooms/${roomId}/voice/participants`);
    const handler = snapshot => {
      setVoiceParticipantStates(snapshot.val() || {});
    };

    voiceParticipantsRef.on('value', handler);
    return () => voiceParticipantsRef.off('value', handler);
  }, [roomId]);

  // ──────────────────────────────────────────────────────────────
  // Sync Playback Logic
  // ──────────────────────────────────────────────────────────────

  // Viewer Sync
  useEffect(() => {
    const playbackRef = database().ref(`rooms/${roomId}/playback`);

    const onPlaybackHandler = (snapshot) => {
      const playbackData = snapshot.val();
      if (playbackData && !isCreator) {
        setPlaying(playbackData.isPlaying);

        if (playerRef.current) {
          if (playbackData.isPlaying) {
            const elapsed = (Date.now() - playbackData.updatedAt) / 1000;
            const currentPosition = playbackData.currentTime + elapsed;

            playerRef.current.getCurrentTime().then((viewerTime) => {
              if (Math.abs(viewerTime - currentPosition) > 2) {
                playerRef.current.seekTo(currentPosition);
              }
            });
          } else {
            playerRef.current.seekTo(playbackData.currentTime);
          }
        }
      }
    };

    playbackRef.on('value', onPlaybackHandler);
    return () => playbackRef.off('value', onPlaybackHandler);
  }, [roomId, isCreator]);

  // Creator Continuous Sync
  useEffect(() => {
    if (!isCreator || !playing) return;

    // Push the creator's current time to Firebase every 5 seconds
    const intervalId = setInterval(async () => {
      if (playerRef.current) {
        try {
          const currentTime = await playerRef.current.getCurrentTime();
          const db = database();
          const playbackRef = db.ref(`rooms/${roomId}/playback`);

          await playbackRef.set({
            isPlaying: true,
            currentTime: currentTime || 0,
            updatedAt: Date.now()
          });
        } catch (error) {
          console.log("Error syncing time:", error);
        }
      }
    }, 5000);

    return () => clearInterval(intervalId);
  }, [isCreator, playing, roomId]);

  const updatePlaybackState = async (isPlaying) => {
    if (!isCreator) return;
    const playbackRef = database().ref(`rooms/${roomId}/playback`);
    const currentTime = await playerRef.current?.getCurrentTime() || 0;

    await playbackRef.set({
      isPlaying,
      currentTime,
      updatedAt: Date.now()
    });
  };

  const seekBackward = async () => {
    if (!isCreator || !playerRef.current) return;
    const currentTime = await playerRef.current.getCurrentTime();
    playerRef.current.seekTo(Math.max(currentTime - 10, 0));
    await updatePlaybackState(playing);
  };

  const seekForward = async () => {
    if (!isCreator || !playerRef.current) return;
    const currentTime = await playerRef.current.getCurrentTime();
    playerRef.current.seekTo(currentTime + 10);
    await updatePlaybackState(playing);
  };

  const togglePlayback = async () => {
    if (!isCreator) return;
    const newPlayingState = !playing;
    setPlaying(newPlayingState);
    await updatePlaybackState(newPlayingState);
  };

  // Chat
  useEffect(() => {
    const messagesRef = database().ref(`rooms/${roomId}/messages`);
    const onMessagesHandler = snapshot => {
      const data = snapshot.val();
      if (data) {
        const msgs = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        msgs.sort((a, b) => b.timestamp - a.timestamp);
        setMessages(msgs);
      } else {
        setMessages([]);
      }
    };
    messagesRef.limitToLast(50).on('value', onMessagesHandler);
    return () => messagesRef.limitToLast(50).off('value', onMessagesHandler);
  }, [roomId]);

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    const messagesRef = database().ref(`rooms/${roomId}/messages`);
    const currentUserProfile = participantProfiles.find(p => p.email === auth().currentUser?.email) || {
      name: auth().currentUser?.email.split('@')[0],
      color: colors.PRIMARY_COLOR,
    };

    await messagesRef.push({
      text: newMessage.trim(),
      senderId: auth().currentUser?.uid,
      senderName: currentUserProfile.name,
      senderColor: currentUserProfile.color,
      timestamp: database.ServerValue.TIMESTAMP,
    });
    setNewMessage('');
  };

  // Reactions
  useEffect(() => {
    const reactionsRef = database().ref(`rooms/${roomId}/reactions`);
    const now = Date.now();

    const reactionsQuery = reactionsRef.limitToLast(1);
    const onChildAddedHandler = (snapshot) => {
      const data = snapshot.val();
      if (data && data.timestamp > now - 5000) { // Only show recent ones
        const id = Math.random().toString();
        setFloatingEmojis(prev => [...prev, { id, emoji: data.emoji }]);
        setTimeout(() => {
          setFloatingEmojis(prev => prev.filter(e => e.id !== id));
        }, 2000);
      }
    };
    reactionsQuery.on('child_added', onChildAddedHandler);
    return () => reactionsQuery.off('child_added', onChildAddedHandler);
  }, [roomId]);

  const sendReaction = async (emoji) => {
    const reactionsRef = database().ref(`rooms/${roomId}/reactions`);
    await reactionsRef.push({
      emoji,
      senderId: auth().currentUser?.uid,
      timestamp: Date.now(),
    });
  };

  const renderMessage = ({ item }) => {
    const isMe = item.senderId === auth().currentUser?.uid;
    return (
      <View style={[styles.messageBubble, isMe ? styles.messageBubbleMe : styles.messageBubbleThem]}>
        {!isMe && <Text style={[styles.messageSender, { color: item.senderColor || colors.PRIMARY_COLOR }]}>{item.senderName}</Text>}
        <Text style={styles.messageText}>{item.text}</Text>
      </View>
    );
  };

  const renderParticipant = ({ item }) => (
    <View style={styles.participantCard}>
      <View style={[styles.avatar, { backgroundColor: item.color }]}>
        <Text style={styles.avatarText}>{item.initial}</Text>
        <View style={[styles.statusIndicator, { backgroundColor: item.isOnline ? colors.ACCEPT_GREEN : colors.MUTED_COLOR }]} />
      </View>
      <View style={styles.participantInfo}>
        <Text style={styles.participantName}>{item.name}</Text>
        <Text style={styles.participantUsername}>{item.username}</Text>
      </View>
      <View style={styles.participantVoiceState}>
        <MaterialIcons
          name={item.isVoiceMuted ? 'mic-off' : 'mic'}
          size={18}
          color={item.isVoiceMuted ? colors.SUB_TITLE_COLOR : colors.ACCEPT_GREEN}
        />
      </View>
      {item.isHost && (
        <View style={styles.hostBadge}>
          <Text style={styles.hostBadgeText}>Host</Text>
        </View>
      )}
    </View>
  );

  const handleGoBack = async () => {
    if (isCreator) {
      try {
        await database().ref(`rooms/${roomId}`).update({
          isStreaming: false
        });
      } catch (error) {
        console.error("Error resetting stream state:", error);
      }
    }
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
          <MaterialIcons name="arrow-back-ios" size={20} color={colors.TITLE_COLOR} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{roomName || 'Streaming Room'}</Text>
        <TouchableOpacity
          style={[
            styles.voiceButton,
            !canUseRoomVoice && styles.voiceButtonDisabled,
            canUseRoomVoice && !isVoiceMuted && styles.voiceButtonLive,
          ]}
          disabled={!canUseRoomVoice || !isVoiceReady}
          onPress={toggleVoiceMute}
        >
          <MaterialIcons
            name={canUseRoomVoice && !isVoiceMuted ? 'mic' : 'mic-off'}
            size={18}
            color="#FFF"
          />
          <Text style={styles.voiceButtonText}>
            {canUseRoomVoice ? (isVoiceMuted ? 'Unmute' : 'Live') : 'Voice'}
          </Text>
        </TouchableOpacity>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>

      {/* VIDEO PLAYER SECTION */}
      <View style={styles.videoSection}>
        {videoId ? (
          <Pressable style={{ flex: 1 }} onPress={() => setControlsVisible(true)}>
            <YoutubePlayer
              ref={playerRef}
              height={VIDEO_HEIGHT}
              width={SCREEN_WIDTH}
              play={playing}
              videoId={videoId}
              initialPlayerParams={{
                controls: 0,
                modestbranding: 1,
                preventFullScreen: true,
                rel: 0,
              }}
            />
            {/* Custom Controls Overlay */}
            {controlsVisible && (
              <View style={styles.controlsOverlay}>
                <TouchableOpacity onPress={seekBackward} disabled={!isCreator}>
                  <MaterialIcons name="replay-10" size={36} color={isCreator ? "#FFF" : "rgba(255,255,255,0.3)"} />
                </TouchableOpacity>
                <TouchableOpacity onPress={togglePlayback} disabled={!isCreator}>
                  <MaterialIcons name={playing ? "pause-circle-filled" : "play-circle-filled"} size={64} color={isCreator ? "#FFF" : "rgba(255,255,255,0.3)"} />
                </TouchableOpacity>
                <TouchableOpacity onPress={seekForward} disabled={!isCreator}>
                  <MaterialIcons name="forward-10" size={36} color={isCreator ? "#FFF" : "rgba(255,255,255,0.3)"} />
                </TouchableOpacity>
              </View>
            )}
          </Pressable>
        ) : (
          <View style={styles.errorVideo}>
            <Text style={{ color: '#fff' }}>Invalid Video URL</Text>
          </View>
        )}

        {/* Video Overlays */}
        {creatorLeft && (
          <View style={styles.creatorLeftOverlay}>
            <Ionicons name="pause-circle" size={48} color="#FFF" />
            <Text style={styles.creatorLeftTitle}>Host Left</Text>
            <Text style={styles.creatorLeftText}>The host has paused the stream.</Text>
          </View>
        )}

        {/* Floating Emojis */}
        {floatingEmojis.map(item => (
          <FloatingEmoji key={item.id} emoji={item.emoji} />
        ))}
      </View>

      {/* CONTENT SECTION (Tabs) */}
      <View style={styles.contentSection}>
        <View style={styles.voiceStatusBar}>
          <View style={styles.voiceStatusLeft}>
            <MaterialIcons
              name={canUseRoomVoice && !isVoiceMuted ? 'graphic-eq' : 'hearing-disabled'}
              size={18}
              color={canUseRoomVoice ? colors.PRIMARY_COLOR : colors.SUB_TITLE_COLOR}
            />
            <Text style={styles.voiceStatusText}>
              {canUseRoomVoice
                ? (isVoiceMuted
                  ? 'Room voice is ready. Unmute anytime to talk while the video keeps playing.'
                  : `You are live in voice with ${activeSpeakerCount || participants.length - 1} participant${(activeSpeakerCount || participants.length - 1) === 1 ? '' : 's'}.`)
                : 'Voice chat becomes available as soon as another participant joins.'}
            </Text>
          </View>
        </View>

        {voiceError ? (
          <View style={styles.voiceErrorBanner}>
            <Text style={styles.voiceErrorText}>{voiceError}</Text>
          </View>
        ) : null}

        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'chat' && styles.activeTab]}
            onPress={() => setActiveTab('chat')}
          >
            <Text style={[styles.tabText, activeTab === 'chat' && styles.activeTabText]}>Live Chat</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'participants' && styles.activeTab]}
            onPress={() => setActiveTab('participants')}
          >
            <Text style={[styles.tabText, activeTab === 'participants' && styles.activeTabText]}>Participants ({participants.length})</Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'chat' ? (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <FlatList
              data={messages}
              keyExtractor={item => item.id}
              renderItem={renderMessage}
              inverted
              contentContainerStyle={styles.chatList}
              showsVerticalScrollIndicator={false}
            />

            {/* Emoji Reaction Bar */}
            <View style={styles.reactionBar}>
              {['❤️', '😂', '🔥', '👏', '🎉', '😮'].map(emoji => (
                <TouchableOpacity key={emoji} onPress={() => sendReaction(emoji)} style={styles.reactionBtn}>
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.chatInputContainer}>
              <TextInput
                style={styles.chatInput}
                placeholder="Say something..."
                placeholderTextColor={colors.SUB_TITLE_COLOR}
                value={newMessage}
                onChangeText={setNewMessage}
                onSubmitEditing={sendMessage}
              />
              <TouchableOpacity onPress={sendMessage} style={styles.sendBtn}>
                <Ionicons name="send" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        ) : (
          <FlatList
            data={participants}
            keyExtractor={item => item.id}
            renderItem={renderParticipant}
            contentContainerStyle={styles.participantsList}
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR || '#0F0F13',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.BORDER_SUBTLE || '#1F1F25',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    flex: 1,
    color: colors.TITLE_COLOR || '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  voiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.PRIMARY_COLOR || '#7C3AED',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    marginRight: 10,
  },
  voiceButtonDisabled: {
    opacity: 0.45,
  },
  voiceButtonLive: {
    backgroundColor: colors.ACCEPT_GREEN || '#22C55E',
  },
  voiceButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 6,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.LIVE_RED || '#EF4444',
    marginRight: 4,
  },
  liveText: {
    color: colors.LIVE_RED || '#EF4444',
    fontSize: 10,
    fontWeight: 'bold',
  },
  videoSection: {
    height: VIDEO_HEIGHT,
    backgroundColor: '#000',
    position: 'relative',
  },
  errorVideo: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  creatorLeftOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  creatorLeftTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 10,
  },
  creatorLeftText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginTop: 5,
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  contentSection: {
    flex: 1,
  },
  voiceStatusBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.BORDER_SUBTLE || '#1F1F25',
  },
  voiceStatusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  voiceStatusText: {
    flex: 1,
    marginLeft: 10,
    color: colors.SUB_TITLE_COLOR || '#9CA3AF',
    fontSize: 13,
    lineHeight: 18,
  },
  voiceErrorBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
  },
  voiceErrorText: {
    color: colors.LIVE_RED || '#EF4444',
    fontSize: 13,
  },
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.BORDER_SUBTLE || '#1F1F25',
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: colors.PRIMARY_COLOR || '#7C3AED',
  },
  tabText: {
    color: colors.SUB_TITLE_COLOR || '#9CA3AF',
    fontSize: 15,
    fontWeight: '600',
  },
  activeTabText: {
    color: colors.PRIMARY_COLOR || '#7C3AED',
  },
  chatList: {
    padding: 16,
    paddingBottom: 20,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
  },
  messageBubbleMe: {
    alignSelf: 'flex-end',
    backgroundColor: colors.PRIMARY_COLOR || '#7C3AED',
    borderBottomRightRadius: 4,
  },
  messageBubbleThem: {
    alignSelf: 'flex-start',
    backgroundColor: colors.CARD_COLOR || '#1C1C23',
    borderBottomLeftRadius: 4,
  },
  messageSender: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  messageText: {
    color: '#FFF',
    fontSize: 15,
  },
  reactionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.BORDER_SUBTLE || '#1F1F25',
  },
  reactionBtn: {
    padding: 8,
  },
  reactionEmoji: {
    fontSize: 24,
  },
  chatInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.BORDER_SUBTLE || '#1F1F25',
  },
  chatInput: {
    flex: 1,
    backgroundColor: colors.CARD_COLOR || '#1C1C23',
    color: '#FFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 100,
  },
  sendBtn: {
    marginLeft: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.PRIMARY_COLOR || '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  participantsList: {
    padding: 16,
  },
  participantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.CARD_COLOR || '#1C1C23',
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.CARD_COLOR || '#1C1C23',
  },
  participantInfo: {
    flex: 1,
  },
  participantVoiceState: {
    marginRight: 10,
  },
  participantName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  participantUsername: {
    color: colors.SUB_TITLE_COLOR || '#9CA3AF',
    fontSize: 13,
  },
  hostBadge: {
    backgroundColor: 'rgba(250, 204, 21, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  hostBadgeText: {
    color: colors.FILM_GOLD || '#FACC15',
    fontSize: 12,
    fontWeight: 'bold',
  },
  floatingEmoji: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    zIndex: 1000,
  },
});

export default StreamingScreen;
