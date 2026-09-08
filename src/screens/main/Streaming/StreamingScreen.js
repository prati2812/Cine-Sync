import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Orientation from 'react-native-orientation-locker';
import { auth, database } from '../../../config/firebase';
import colors from '../../../theme/Colors';


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

  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const VIDEO_HEIGHT = width * (9 / 16);

  useEffect(() => {
    return () => {
      Orientation.lockToPortrait();
      if (reactionTimerRef.current) {
        clearTimeout(reactionTimerRef.current);
      }
    };
  }, []);

  const toggleFullscreen = () => {
    if (isLandscape) {
      Orientation.lockToPortrait();
    } else {
      Orientation.lockToLandscapeLeft();
    }
  };

  // Video State
  const [playing, setPlaying] = useState(true);
  const playerRef = useRef(null);
  const [isCreator, setIsCreator] = useState(false);

  // Tabs
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'participants'

  // Chat State
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');

  // Participants State
  const [participantProfiles, setParticipantProfiles] = useState([]);
  const [onlineStatuses, setOnlineStatuses] = useState({});

  // Reactions State
  const [floatingEmojis, setFloatingEmojis] = useState([]);
  const [showReactions, setShowReactions] = useState(false);
  const reactionTimerRef = useRef(null);

  // Notes State
  const [notes, setNotes] = useState([]);
  const [newNoteText, setNewNoteText] = useState('');

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
  }));

  // ──────────────────────────────────────────────────────────────
  // Sync Playback Logic
  // ──────────────────────────────────────────────────────────────

  const syncDebounceRef = useRef(null); // debounce host pushes after seek
  const isSyncingRef = useRef(false);   // prevent viewer re-triggering sync
  const lastPlaybackRef = useRef(null); // last snapshot from Firebase

  // Push current host state to Firebase (debounced after seek)
  const pushPlaybackState = async (isPlaying) => {
    if (!isCreator) return;
    try {
      const currentTime = await playerRef.current?.getCurrentTime() || 0;
      await database().ref(`rooms/${roomId}/playback`).set({
        isPlaying,
        currentTime,
        updatedAt: Date.now(),
      });
    } catch (e) {
      console.log('[Sync] Error pushing playback state:', e);
    }
  };

  // Debounced version – waits 600ms after last call (covers rapid scrubbing)
  const debouncedPushRef = useRef(null);
  const debouncedPushPlaybackState = (isPlaying) => {
    if (debouncedPushRef.current) clearTimeout(debouncedPushRef.current);
    debouncedPushRef.current = setTimeout(() => {
      pushPlaybackState(isPlaying);
    }, 600);
  };

  // ── HOST: heartbeat every 3 s while playing ──
  useEffect(() => {
    if (!isCreator || !playing) return;
    const intervalId = setInterval(async () => {
      if (!playerRef.current) return;
      try {
        const currentTime = await playerRef.current.getCurrentTime();
        await database().ref(`rooms/${roomId}/playback`).update({
          currentTime: currentTime || 0,
          updatedAt: Date.now(),
        });
      } catch (e) {
        console.log('[Sync] Heartbeat error:', e);
      }
    }, 3000);
    return () => clearInterval(intervalId);
  }, [isCreator, playing, roomId]);

  // ── VIEWER: listen to Firebase playback changes ──
  useEffect(() => {
    if (isCreator) return; // host doesn't listen to its own writes
    const playbackRef = database().ref(`rooms/${roomId}/playback`);

    const onPlaybackHandler = async (snapshot) => {
      const data = snapshot.val();
      if (!data || isSyncingRef.current) return;
      lastPlaybackRef.current = data;

      isSyncingRef.current = true;

      // Apply play / pause
      setPlaying(data.isPlaying);

      if (playerRef.current) {
        if (data.isPlaying) {
          // Compute where the host is NOW, accounting for network delay
          const elapsed = (Date.now() - data.updatedAt) / 1000;
          const targetTime = data.currentTime + elapsed;

          playerRef.current.getCurrentTime().then((viewerTime) => {
            // Only seek if drift > 1.5 s to avoid constant micro-seeks
            if (Math.abs(viewerTime - targetTime) > 1.5) {
              playerRef.current.seekTo(targetTime, true);
            }
          });
        } else {
          // Host paused – snap to the exact paused position
          await playerRef.current.seekTo(data.currentTime, true);
        }
      }

      isSyncingRef.current = false;
    };

    playbackRef.on('value', onPlaybackHandler);
    return () => playbackRef.off('value', onPlaybackHandler);
  }, [roomId, isCreator]);

  // ── VIEWER: periodic drift correction every 10 s ──
  useEffect(() => {
    if (isCreator) return;
    const driftCheckId = setInterval(async () => {
      const data = lastPlaybackRef.current;
      if (!data || !data.isPlaying || !playerRef.current) return;
      try {
        const elapsed = (Date.now() - data.updatedAt) / 1000;
        const targetTime = data.currentTime + elapsed;
        const viewerTime = await playerRef.current.getCurrentTime();
        if (Math.abs(viewerTime - targetTime) > 2) {
          playerRef.current.seekTo(targetTime, true);
        }
      } catch (e) {
        // silently ignore
      }
    }, 10000);
    return () => clearInterval(driftCheckId);
  }, [isCreator]);

  // Cleanup debounce refs on unmount
  useEffect(() => {
    return () => {
      if (debouncedPushRef.current) clearTimeout(debouncedPushRef.current);
      if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
    };
  }, []);

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

  const triggerReactions = () => {
    setShowReactions(true);
    resetReactionTimeout();
  };

  const resetReactionTimeout = () => {
    if (reactionTimerRef.current) {
      clearTimeout(reactionTimerRef.current);
    }
    reactionTimerRef.current = setTimeout(() => {
      setShowReactions(false);
    }, 4000);
  };

  const handleEmojiPress = (emoji) => {
    sendReaction(emoji);
    resetReactionTimeout();
  };

  // Video Notes Logic
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  useEffect(() => {
    if (participants.length > 1) return;
    const notesRef = database().ref(`rooms/${roomId}/notes`);
    const onNotesHandler = snapshot => {
      const data = snapshot.val();
      if (data) {
        const list = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        list.sort((a, b) => a.seconds - b.seconds);
        setNotes(list);
      } else {
        setNotes([]);
      }
    };
    notesRef.on('value', onNotesHandler);
    return () => notesRef.off('value', onNotesHandler);
  }, [roomId, participants.length]);

  const addNote = async () => {
    if (!newNoteText.trim()) return;
    try {
      const secs = await playerRef.current?.getCurrentTime() || 0;
      const notesRef = database().ref(`rooms/${roomId}/notes`);
      await notesRef.push({
        text: newNoteText.trim(),
        seconds: secs,
        timestamp: database.ServerValue.TIMESTAMP,
      });
      setNewNoteText('');
    } catch (e) {
      console.log("Error adding note:", e);
    }
  };

  const deleteNote = async (noteId) => {
    try {
      await database().ref(`rooms/${roomId}/notes/${noteId}`).remove();
    } catch (e) {
      console.log("Error deleting note:", e);
    }
  };

  const renderNote = ({ item }) => {
    return (
      <View style={styles.noteCard}>
        <TouchableOpacity
          style={styles.noteTimeBadge}
          onPress={() => playerRef.current?.seekTo(item.seconds)}
        >
          <Ionicons name="play" size={12} color="#FFF" style={{ marginRight: 4 }} />
          <Text style={styles.noteTimeText}>{formatTime(item.seconds)}</Text>
        </TouchableOpacity>
        <Text style={styles.noteText}>{item.text}</Text>
        <TouchableOpacity
          style={styles.noteDeleteBtn}
          onPress={() => deleteNote(item.id)}
        >
          <Ionicons name="trash-outline" size={16} color="rgba(255,255,255,0.4)" />
        </TouchableOpacity>
      </View>
    );
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
    <View style={[styles.container, isLandscape && styles.containerLandscape]}>
      <StatusBar hidden={isLandscape} barStyle="light-content" />

      {!isLandscape && (
        <SafeAreaView style={styles.safeHeader}>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
              <MaterialIcons name="arrow-back-ios" size={20} color={colors.TITLE_COLOR || '#FFF'} />
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>{roomName || 'Streaming Room'}</Text>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>
        </SafeAreaView>
      )}

      {/* VIDEO PLAYER SECTION */}
      <View style={[styles.videoSection, isLandscape && styles.videoSectionLandscape, { height: isLandscape ? height : VIDEO_HEIGHT }]}>
        {videoId ? (
          <View style={{ flex: 1, position: 'relative' }}>
            <YoutubePlayer
              ref={playerRef}
              height={isLandscape ? height : VIDEO_HEIGHT}
              width={width}
              play={playing}
              videoId={videoId}
              initialPlayerParams={{
                controls: 1,
                modestbranding: 1,
                preventFullScreen: false,
                rel: 0,
              }}
              onChangeState={(state) => {
                if (state === 'playing') {
                  setPlaying(true);
                  if (isCreator) {
                    debouncedPushPlaybackState(true);
                  }
                } else if (state === 'paused') {
                  setPlaying(false);
                  if (isCreator) {
                    // Push immediately on pause so viewers stop right away
                    pushPlaybackState(false);
                  }
                } else if (state === 'unstarted' || state === 'buffering') {
                  // no-op – don't push mid-buffer events
                }
              }}
            />
          </View>
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

      {/* CONTENT SECTION */}
      {!isLandscape && (
        <View style={styles.contentSection}>
          {participants.length <= 1 ? (
            <View style={{ flex: 1 }}>
              <View style={styles.notesHeader}>
                <Text style={styles.notesTitle}>My Stream Notes</Text>
                <Text style={styles.notesSubtitle}>Capture notes at specific timestamps</Text>
              </View>
              <FlatList
                data={notes}
                keyExtractor={item => item.id}
                renderItem={renderNote}
                contentContainerStyle={styles.notesList}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={styles.emptyNotesContainer}>
                    <Ionicons name="document-text-outline" size={48} color="rgba(255,255,255,0.2)" />
                    <Text style={styles.emptyNotesText}>No notes saved yet</Text>
                    <Text style={styles.emptyNotesSubtext}>Type a note below to save it at the current video time.</Text>
                  </View>
                }
              />
              <SafeAreaView style={styles.chatInputSafeArea}>
                <View style={styles.chatInputContainer}>
                  <TextInput
                    style={styles.chatInput}
                    placeholder="Add note at current time..."
                    placeholderTextColor={colors.SUB_TITLE_COLOR}
                    value={newNoteText}
                    onChangeText={setNewNoteText}
                    onSubmitEditing={addNote}
                  />
                  <TouchableOpacity onPress={addNote} style={styles.sendBtn}>
                    <Ionicons name="add" size={24} color="#FFF" />
                  </TouchableOpacity>
                </View>
              </SafeAreaView>
            </View>
          ) : (
            <View style={{ flex: 1 }}>
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
                  {showReactions && (
                    <View style={styles.reactionBar}>
                      {['❤️', '😂', '🔥', '👏', '🎉', '😮'].map(emoji => (
                        <TouchableOpacity key={emoji} onPress={() => handleEmojiPress(emoji)} style={styles.reactionBtn}>
                          <Text style={styles.reactionEmoji}>{emoji}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  <SafeAreaView style={styles.chatInputSafeArea}>
                    <View style={styles.chatInputContainer}>
                      <TouchableOpacity onPress={triggerReactions} style={styles.reactionToggleBtn}>
                        <Ionicons name="happy-outline" size={24} color={colors.SUB_TITLE_COLOR || '#9CA3AF'} />
                      </TouchableOpacity>
                      <TextInput
                        style={styles.chatInput}
                        placeholder="Say something..."
                        placeholderTextColor={colors.SUB_TITLE_COLOR}
                        value={newMessage}
                        onChangeText={setNewMessage}
                        onSubmitEditing={sendMessage}
                      />
                      <TouchableOpacity onPress={sendMessage} style={styles.sendBtn}>
                        <Ionicons name="send" size={18} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                  </SafeAreaView>
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
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR || '#0F0F13',
  },
  containerLandscape: {
    backgroundColor: '#000',
  },
  safeHeader: {
    backgroundColor: colors.BACKGROUND_COLOR || '#0F0F13',
    borderBottomWidth: 1,
    borderBottomColor: colors.BORDER_SUBTLE || '#1F1F25',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
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
    backgroundColor: '#000',
    position: 'relative',
    overflow: 'hidden',
  },
  videoSectionLandscape: {
    width: '100%',
    height: '100%',
  },
  errorVideo: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  creatorLeftOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 25,
  },
  creatorLeftTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 12,
  },
  creatorLeftText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginTop: 6,
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '70%',
  },
  controlBtn: {
    padding: 10,
    marginHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 30,
  },
  playPauseBtn: {
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayBackButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 44 : 20,
    left: 20,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    zIndex: 20,
  },
  fullscreenBtn: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    zIndex: 20,
  },
  contentSection: {
    flex: 1,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.CARD_COLOR || '#1E1E24',
    borderRadius: 25,
    padding: 4,
    marginHorizontal: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 21,
  },
  activeTab: {
    backgroundColor: colors.PRIMARY_COLOR || '#7C3AED',
  },
  tabText: {
    color: colors.SUB_TITLE_COLOR || '#9CA3AF',
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#FFF',
  },
  chatList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    marginBottom: 10,
  },
  messageBubbleMe: {
    alignSelf: 'flex-end',
    backgroundColor: '#6366F1',
    borderBottomRightRadius: 2,
  },
  messageBubbleThem: {
    alignSelf: 'flex-start',
    backgroundColor: '#1E1E24',
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
  },
  messageSender: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 3,
  },
  messageText: {
    color: '#E5E7EB',
    fontSize: 14,
    lineHeight: 18,
  },
  reactionBar: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    backgroundColor: 'rgba(28, 28, 35, 0.8)',
    borderRadius: 20,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  reactionBtn: {
    padding: 6,
  },
  reactionEmoji: {
    fontSize: 22,
  },
  reactionToggleBtn: {
    padding: 8,
    marginRight: 4,
  },
  chatInputSafeArea: {
    backgroundColor: colors.BACKGROUND_COLOR || '#0F0F13',
  },
  chatInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: colors.BACKGROUND_COLOR || '#0F0F13',
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#1E1E24',
    color: '#FFF',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    maxHeight: 100,
  },
  sendBtn: {
    marginLeft: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.PRIMARY_COLOR || '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.PRIMARY_COLOR || '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  participantsList: {
    padding: 16,
  },
  participantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E24',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
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
    borderColor: '#1E1E24',
  },
  participantInfo: {
    flex: 1,
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
  notesHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  notesTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
  notesSubtitle: {
    fontSize: 12,
    color: colors.SUB_TITLE_COLOR || '#9CA3AF',
    marginTop: 2,
  },
  notesList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E24',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
  },
  noteTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.PRIMARY_COLOR || '#7C3AED',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 12,
  },
  noteTimeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },
  noteText: {
    flex: 1,
    fontSize: 14,
    color: '#E5E7EB',
    lineHeight: 18,
  },
  noteDeleteBtn: {
    padding: 8,
  },
  emptyNotesContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyNotesText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 12,
  },
  emptyNotesSubtext: {
    fontSize: 13,
    color: colors.SUB_TITLE_COLOR || '#9CA3AF',
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 32,
  },
});

export default StreamingScreen;
