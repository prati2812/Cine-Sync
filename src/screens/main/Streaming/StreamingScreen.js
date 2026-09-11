import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  StatusBar,
  ScrollView,
  useWindowDimensions,
  Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import YoutubePlayer from 'react-native-youtube-iframe';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
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

function formatTime(secs) {
  if (isNaN(secs) || secs < 0) return '00:00';
  const totalSecs = Math.floor(secs);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const remSecs = totalSecs % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${remSecs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${remSecs.toString().padStart(2, '0')}`;
}

const FloatingEmoji = ({ emoji }) => {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -180,
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
      <Text style={{ fontSize: 30 }}>{emoji}</Text>
    </Animated.View>
  );
};

const StreamingScreen = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { streamUrl, roomName: initialRoomName, roomId } = route.params || {};

  const safeTopPadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 12
  ) + 8;

  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const VIDEO_HEIGHT = width * (9 / 16);

  // Video State
  const [playing, setPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef(null);
  const playerRef = useRef(null);
  const [isCreator, setIsCreator] = useState(false);
  const [roomData, setRoomData] = useState(null);

  // Adaptive Switcher: 'notes' (Solo) vs 'chat' (Party)
  const [activeMode, setActiveMode] = useState('notes');
  const hasAutoSetDefaultModeRef = useRef(false);

  // Chat State
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isMicActive, setIsMicActive] = useState(true);

  // Participants State
  const [participantProfiles, setParticipantProfiles] = useState([]);
  const [onlineStatuses, setOnlineStatuses] = useState({});

  // Reactions State
  const [floatingEmojis, setFloatingEmojis] = useState([]);

  // Notes State
  const [notes, setNotes] = useState([]);
  const [newNoteText, setNewNoteText] = useState('');

  // Pulsing Animations
  const livePulseAnim = useRef(new Animated.Value(1)).current;
  const syncPulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const liveLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(livePulseAnim, { toValue: 0.35, duration: 800, useNativeDriver: true }),
        Animated.timing(livePulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    const syncLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(syncPulseAnim, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        Animated.timing(syncPulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    liveLoop.start();
    syncLoop.start();
    return () => {
      liveLoop.stop();
      syncLoop.stop();
    };
  }, [livePulseAnim, syncPulseAnim]);

  useEffect(() => {
    return () => {
      Orientation.lockToPortrait();
    };
  }, []);

  const toggleFullscreen = () => {
    if (isLandscape) {
      Orientation.lockToPortrait();
    } else {
      Orientation.lockToLandscapeLeft();
    }
  };

  const getYoutubeVideoId = url => {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url?.match(regExp);
    return match && match[7].length === 11 ? match[7] : false;
  };

  const videoId = getYoutubeVideoId(streamUrl);

  useEffect(() => {
    if (!videoId) {
      Alert.alert('Invalid URL', 'The provided YouTube URL is not valid.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    }
  }, [videoId, navigation]);

  const [creatorLeft, setCreatorLeft] = useState(false);

  // Track playback time & duration periodically
  useEffect(() => {
    let interval;
    if (playing) {
      interval = setInterval(async () => {
        if (!playerRef.current) return;
        try {
          const t = await playerRef.current.getCurrentTime();
          const d = await playerRef.current.getDuration();
          if (typeof t === 'number') setCurrentTime(t);
          if (typeof d === 'number' && d > 0) setDuration(d);
        } catch (e) {
          // ignore
        }
      }, 500);
    }
    return () => interval && clearInterval(interval);
  }, [playing]);

  // Auto-hide controls overlay after 3.5s
  const resetControlsTimeout = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3500);
  };

  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, []);

  // Fetch Room & Participants from RTDB
  useEffect(() => {
    const roomRef = database().ref(`rooms/${roomId}`);

    const onRoomHandler = async snapshot => {
      const data = snapshot.val();
      if (!data) return;
      setRoomData(data);

      const userIsCreator = data.creator?.email === auth().currentUser?.email;
      setIsCreator(userIsCreator);

      if (!userIsCreator && data.isStreaming === false) {
        setCreatorLeft(true);
        setPlaying(false);
      } else if (data.isStreaming === true) {
        setCreatorLeft(false);
      }

      // Fetch participants
      const allEmails = [data.creator?.email, ...(data.participants || [])].filter(Boolean);
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
              isHost: email.toLowerCase() === data.creator?.email?.toLowerCase(),
            });
          }
        } catch (error) {
          console.log('Error fetching user profile:', error);
        }
      }
      setParticipantProfiles(profiles);

      // Adaptive default: only set ONCE on initial load so user can freely switch tabs
      if (!hasAutoSetDefaultModeRef.current) {
        hasAutoSetDefaultModeRef.current = true;
        if (uniqueEmails.length <= 1) {
          setActiveMode('notes');
        } else {
          setActiveMode('chat');
        }
      }
    };

    roomRef.on('value', onRoomHandler);
    return () => roomRef.off('value', onRoomHandler);
  }, [roomId]);

  useEffect(() => {
    if (participantProfiles.length === 0) return;
    const db = database();
    const unsubs = participantProfiles.map(p => {
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
  const syncDebounceRef = useRef(null);
  const isSyncingRef = useRef(false);
  const lastPlaybackRef = useRef(null);

  const pushPlaybackState = async isCurrentPlaying => {
    if (!isCreator) return;
    try {
      const curTime = (await playerRef.current?.getCurrentTime()) || 0;
      await database().ref(`rooms/${roomId}/playback`).set({
        isPlaying: isCurrentPlaying,
        currentTime: curTime,
        updatedAt: Date.now(),
      });
    } catch (e) {
      console.log('[Sync] Error pushing playback state:', e);
    }
  };

  const debouncedPushRef = useRef(null);
  const debouncedPushPlaybackState = isCurrentPlaying => {
    if (debouncedPushRef.current) clearTimeout(debouncedPushRef.current);
    debouncedPushRef.current = setTimeout(() => {
      pushPlaybackState(isCurrentPlaying);
    }, 600);
  };

  useEffect(() => {
    if (!isCreator || !playing) return;
    const intervalId = setInterval(async () => {
      if (!playerRef.current) return;
      try {
        const curTime = await playerRef.current.getCurrentTime();
        await database().ref(`rooms/${roomId}/playback`).update({
          currentTime: curTime || 0,
          updatedAt: Date.now(),
        });
      } catch (e) {
        console.log('[Sync] Heartbeat error:', e);
      }
    }, 3000);
    return () => clearInterval(intervalId);
  }, [isCreator, playing, roomId]);

  // Viewer playback listener
  useEffect(() => {
    if (isCreator) return;
    const playbackRef = database().ref(`rooms/${roomId}/playback`);

    const onPlaybackHandler = async snapshot => {
      const data = snapshot.val();
      if (!data || isSyncingRef.current) return;
      lastPlaybackRef.current = data;

      isSyncingRef.current = true;
      setPlaying(data.isPlaying);

      if (playerRef.current) {
        if (data.isPlaying) {
          const elapsed = (Date.now() - data.updatedAt) / 1000;
          const targetTime = data.currentTime + elapsed;
          playerRef.current.getCurrentTime().then(viewerTime => {
            if (Math.abs(viewerTime - targetTime) > 1.5) {
              playerRef.current.seekTo(targetTime, true);
            }
          });
        } else {
          await playerRef.current.seekTo(data.currentTime, true);
        }
      }
      isSyncingRef.current = false;
    };

    playbackRef.on('value', onPlaybackHandler);
    return () => playbackRef.off('value', onPlaybackHandler);
  }, [roomId, isCreator]);

  // ──────────────────────────────────────────────────────────────
  // Notes Logic
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const user = auth().currentUser;
    if (!user || !roomId) return;

    const notesRef = database().ref(`notes/${user.uid}/${roomId}`);
    const onNotesHandler = snapshot => {
      const data = snapshot.val();
      if (data) {
        const list = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        list.sort((a, b) => (b.seconds || 0) - (a.seconds || 0));
        setNotes(list);
      } else {
        setNotes([]);
      }
    };
    notesRef.on('value', onNotesHandler);
    return () => notesRef.off('value', onNotesHandler);
  }, [roomId]);

  const addNote = async (customText = null) => {
    const user = auth().currentUser;
    if (!user) return;
    const textToSave = (typeof customText === 'string' ? customText : newNoteText).trim();
    if (!textToSave) return;
    try {
      const secs = (await playerRef.current?.getCurrentTime()) || currentTime || 0;
      const notesRef = database().ref(`notes/${user.uid}/${roomId}`);
      await notesRef.push({
        text: textToSave,
        seconds: Math.floor(secs),
        tag: 'Storyboard Note',
        author: user.email?.split('@')[0] || 'Me',
        timestamp: database.ServerValue.TIMESTAMP,
      });
      setNewNoteText('');
    } catch (e) {
      console.log('Error adding note:', e);
    }
  };

  const deleteNote = async noteId => {
    const user = auth().currentUser;
    if (!user) return;
    try {
      await database().ref(`notes/${user.uid}/${roomId}/${noteId}`).remove();
    } catch (e) {
      console.log('Error deleting note:', e);
    }
  };

  const handleSeekToNote = seconds => {
    if (!playerRef.current) return;
    playerRef.current.seekTo(seconds, true);
    setCurrentTime(seconds);
    if (isCreator) {
      debouncedPushPlaybackState(playing);
    }
  };

  // ──────────────────────────────────────────────────────────────
  // Chat & Reactions Logic
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const messagesRef = database().ref(`rooms/${roomId}/messages`);
    const onMessagesHandler = snapshot => {
      const data = snapshot.val();
      if (data) {
        const msgs = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        msgs.sort((a, b) => a.timestamp - b.timestamp);
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
    const currentUserProfile = participantProfiles.find(
      p => p.email === auth().currentUser?.email
    ) || {
      name: auth().currentUser?.email?.split('@')[0] || 'Me',
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

  useEffect(() => {
    const reactionsRef = database().ref(`rooms/${roomId}/reactions`);
    const now = Date.now();

    const onChildAddedHandler = snapshot => {
      const data = snapshot.val();
      if (data && data.timestamp > now - 4000) {
        const id = Math.random().toString();
        setFloatingEmojis(prev => [...prev, { id, emoji: data.emoji }]);
        setTimeout(() => {
          setFloatingEmojis(prev => prev.filter(e => e.id !== id));
        }, 2000);
      }
    };

    reactionsRef.limitToLast(1).on('child_added', onChildAddedHandler);
    return () => reactionsRef.limitToLast(1).off('child_added', onChildAddedHandler);
  }, [roomId]);

  const sendReaction = async emoji => {
    try {
      await database().ref(`rooms/${roomId}/reactions`).push({
        emoji,
        senderId: auth().currentUser?.uid,
        timestamp: database.ServerValue.TIMESTAMP,
      });
    } catch (e) {
      console.log('Error sending reaction:', e);
    }
  };

  // ──────────────────────────────────────────────────────────────
  // Playback Control Handlers
  // ──────────────────────────────────────────────────────────────
  const togglePlayPause = () => {
    const next = !playing;
    setPlaying(next);
    if (isCreator) {
      pushPlaybackState(next);
    }
  };

  const handleRewind10 = async () => {
    if (!playerRef.current) return;
    try {
      const t = await playerRef.current.getCurrentTime();
      const target = Math.max(0, t - 10);
      playerRef.current.seekTo(target, true);
      setCurrentTime(target);
      if (isCreator) debouncedPushPlaybackState(playing);
    } catch (e) {}
  };

  const handleForward10 = async () => {
    if (!playerRef.current) return;
    try {
      const t = await playerRef.current.getCurrentTime();
      const target = t + 10;
      playerRef.current.seekTo(target, true);
      setCurrentTime(target);
      if (isCreator) debouncedPushPlaybackState(playing);
    } catch (e) {}
  };

  const handleGoBack = async () => {
    if (isCreator) {
      try {
        await database().ref(`rooms/${roomId}`).update({
          isStreaming: false,
        });
      } catch (error) {
        console.error('Error resetting stream state:', error);
      }
    }
    navigation.goBack();
  };

  const roomTitle = roomData?.name || initialRoomName || 'Screening Room';
  const shortRoomId = (roomId ? roomId.replace('room_', '') : '842').slice(-4);
  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <View style={[styles.container, isLandscape && styles.containerLandscape]}>
      <StatusBar
        hidden={isLandscape}
        barStyle="light-content"
        translucent
        backgroundColor={colors.BACKGROUND_COLOR}
      />

      {/* Ambient Top Glow Overlay - identical to Login & SignUp pattern */}
      {!isLandscape && (
        <View style={styles.ambientTopGlow} pointerEvents="none">
          <LinearGradient
            colors={['rgba(124, 58, 237, 0.18)', 'rgba(0, 122, 255, 0.08)', 'transparent']}
            style={StyleSheet.absoluteFillObject}
          />
        </View>
      )}

      {/* ── TOP HEADER BAR ── */}
      {!isLandscape && (
        <View style={[styles.topHeader, { paddingTop: safeTopPadding }]}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              onPress={handleGoBack}
              style={styles.backBtnCircle}
              activeOpacity={0.75}
            >
              <MaterialIcons name="arrow-back-ios-new" size={17} color={colors.TITLE_COLOR} />
            </TouchableOpacity>

            <View style={styles.headerTitleCol}>
              <View style={styles.titleWithBadgeRow}>
                <Text style={styles.headerTitleText} numberOfLines={1}>
                  {roomTitle}
                </Text>
                <View style={styles.hdrTag}>
                  <Text style={styles.hdrTagText}>4K HDR</Text>
                </View>
              </View>
              <Text style={styles.headerSubtitleText}>
                Live Sync Theater #{shortRoomId}
              </Text>
            </View>
          </View>

          {/* Right Action Icons */}
          <View style={styles.headerRightActions}>
            <View style={styles.liveStreamBadge}>
              <Animated.View style={[styles.liveDotSolid, { opacity: livePulseAnim }]} />
              <Text style={styles.liveStreamText}>LIVE</Text>
            </View>

            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => navigation.navigate('StreamInfo', { roomId, roomName: roomTitle, streamUrl })}
              activeOpacity={0.75}
            >
              <MaterialIcons name="screen-share" size={18} color={colors.SUB_TITLE_COLOR} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => navigation.navigate('StreamInfo', { roomId, roomName: roomTitle, streamUrl })}
              activeOpacity={0.75}
            >
              <MaterialIcons name="tune" size={18} color={colors.CYAN_ACCENT} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── CINEMA VIDEO PLAYER HERO (16:9 Aspect Ratio) ── */}
      <View
        style={[
          styles.videoSection,
          isLandscape && styles.videoSectionLandscape,
          { height: isLandscape ? height : VIDEO_HEIGHT },
        ]}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={resetControlsTimeout}
        >
          {videoId ? (
            <YoutubePlayer
              ref={playerRef}
              height={isLandscape ? height : VIDEO_HEIGHT}
              width={width}
              play={playing}
              videoId={videoId}
              initialPlayerParams={{
                controls: 0,
                modestbranding: 1,
                preventFullScreen: false,
                rel: 0,
              }}
              onChangeState={state => {
                if (state === 'playing') {
                  setPlaying(true);
                  if (isCreator) debouncedPushPlaybackState(true);
                } else if (state === 'paused') {
                  setPlaying(false);
                  if (isCreator) pushPlaybackState(false);
                }
              }}
            />
          ) : (
            <View style={styles.errorVideo}>
              <Text style={{ color: colors.TITLE_COLOR }}>Invalid Video Stream</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Live Sync Telemetry Watermarks */}
        <View style={styles.telemetryWatermarkBar} pointerEvents="none">
          <View style={styles.syncBufferBadge}>
            <Animated.View style={[styles.syncBufferDot, { opacity: syncPulseAnim }]} />
            <Text style={styles.syncBufferText}>SYNC BUFFER: 0.08s</Text>
          </View>
          <View style={styles.spatialAudioBadge}>
            <Text style={styles.spatialAudioText}>SPATIAL 3D</Text>
          </View>
        </View>

        <View style={styles.resolutionTag} pointerEvents="none">
          <Text style={styles.resolutionText}>1080p 60fps</Text>
        </View>

        {/* Video Overlays: Host Paused */}
        {creatorLeft && (
          <View style={styles.creatorLeftOverlay}>
            <MaterialIcons name="pause" size={46} color={colors.TITLE_COLOR} />
            <Text style={styles.creatorLeftTitle}>Host Paused Stream</Text>
            <Text style={styles.creatorLeftText}>Waiting for host to resume...</Text>
          </View>
        )}

        {/* Player Controls Overlay */}
        {showControls && (
          <View style={styles.controlsOverlay} pointerEvents="box-none">
            <View style={styles.centerControlsRow}>
              {/* -10s */}
              <TouchableOpacity
                style={styles.seekStepBtn}
                onPress={handleRewind10}
                activeOpacity={0.8}
              >
                <MaterialIcons name="replay-10" size={20} color={colors.TITLE_COLOR} />
              </TouchableOpacity>

              {/* Play / Pause with Gradient */}
              <TouchableOpacity
                style={styles.playPauseGlowBtn}
                onPress={togglePlayPause}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]}
                  style={styles.playPauseGradient}
                >
                  <MaterialIcons
                    name={playing ? 'pause' : 'play-arrow'}
                    size={28}
                    color={colors.TITLE_COLOR}
                  />
                </LinearGradient>
              </TouchableOpacity>

              {/* +10s */}
              <TouchableOpacity
                style={styles.seekStepBtn}
                onPress={handleForward10}
                activeOpacity={0.8}
              >
                <MaterialIcons name="forward-10" size={20} color={colors.TITLE_COLOR} />
              </TouchableOpacity>
            </View>

            {/* Bottom Scrubber & Time Counter */}
            <View style={styles.bottomScrubberRow}>
              <View style={styles.scrubberTrack}>
                <View style={[styles.scrubberBuffered, { width: '55%' }]} />
                <View style={[styles.scrubberFill, { width: `${progressPercent}%` }]} />
              </View>

              <View style={styles.scrubberMetaRow}>
                <View style={styles.timeCounterGroup}>
                  <Text style={styles.timeCurrentText}>{formatTime(currentTime)}</Text>
                  <Text style={styles.timeDivider}>/</Text>
                  <Text style={styles.timeTotalText}>{formatTime(duration)}</Text>
                  <View style={styles.syncLockBadge}>
                    <Animated.View style={[styles.syncLockDot, { opacity: syncPulseAnim }]} />
                    <Text style={styles.syncLockText}>Sync Lock</Text>
                  </View>
                </View>

                <View style={styles.telemetryQuickBtns}>
                  <TouchableOpacity onPress={toggleFullscreen} activeOpacity={0.75}>
                    <MaterialIcons name="fullscreen" size={18} color={colors.CYAN_ACCENT} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Floating Emojis */}
        {floatingEmojis.map(item => (
          <FloatingEmoji key={item.id} emoji={item.emoji} />
        ))}
      </View>

      {/* ── STATE SWITCHER DOCK (Interactive Mode Toggle) ── */}
      {!isLandscape && (
        <View style={styles.stateSwitcherDock}>
          <View style={styles.stateSwitcherContainer}>
            {/* Solo Notes Tab */}
            <TouchableOpacity
              style={[
                styles.switcherTabBtn,
                activeMode === 'notes' && styles.switcherTabActive,
              ]}
              onPress={() => setActiveMode('notes')}
              activeOpacity={0.85}
            >
              <MaterialIcons
                name="edit-note"
                size={18}
                color={activeMode === 'notes' ? colors.TITLE_COLOR : colors.SUB_TITLE_COLOR}
              />
              <Text
                style={[
                  styles.switcherTabText,
                  activeMode === 'notes' && styles.switcherTabTextActive,
                ]}
              >
                Personal Notes
              </Text>
              <View style={styles.switcherBadgeSolo}>
                <Text style={styles.switcherBadgeSoloText}>{notes.length}</Text>
              </View>
            </TouchableOpacity>

            {/* Party Chat Tab */}
            <TouchableOpacity
              style={[
                styles.switcherTabBtn,
                activeMode === 'chat' && styles.switcherTabActive,
              ]}
              onPress={() => setActiveMode('chat')}
              activeOpacity={0.85}
            >
              <MaterialIcons
                name="forum"
                size={16}
                color={activeMode === 'chat' ? colors.TITLE_COLOR : colors.SUB_TITLE_COLOR}
              />
              <Text
                style={[
                  styles.switcherTabText,
                  activeMode === 'chat' && styles.switcherTabTextActive,
                ]}
              >
                Party Live Chat
              </Text>
              <View style={styles.switcherBadgeParty}>
                <View style={styles.partyLiveMiniDot} />
                <Text style={styles.switcherBadgePartyText}>{participants.length}</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── DYNAMIC ADAPTIVE VIEW CONTAINER ── */}
      {!isLandscape && (
        <View style={styles.adaptiveContentWrap}>
          {/* ============================================================== */}
          {/* VIEW A: SOLO VIEWER MODE (Personal Notes / Storyboard)        */}
          {/* ============================================================== */}
          {activeMode === 'notes' ? (
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={{ flex: 1 }}
            >
              <View style={styles.storyboardHeaderRow}>
                <View>
                  <View style={styles.storyboardTitleGroup}>
                    <Text style={styles.storyboardTitle}>My Stream Storyboard</Text>
                    <View style={styles.privateVaultBadge}>
                      <Text style={styles.privateVaultText}>Private Vault</Text>
                    </View>
                  </View>
                  <Text style={styles.storyboardSubtitle}>
                    Capture insights & bookmarks at current timestamp
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.quickBookmarkBtn}
                  onPress={() => addNote(`Key milestone saved at ${formatTime(currentTime)}`)}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="bookmark-add" size={14} color={colors.CYAN_ACCENT} />
                  <Text style={styles.quickBookmarkText}>
                    + Bookmark @ {formatTime(currentTime)}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Notes List */}
              <FlatList
                data={notes}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.notesListContainer}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={styles.emptyNotesBox}>
                    <MaterialIcons name="bookmark-outline" size={42} color={colors.CYAN_ACCENT} />
                    <Text style={styles.emptyNotesTitle}>Personal Notes & Bookmarks</Text>
                    <Text style={styles.emptyNotesSubtitle}>
                      Save your thoughts linked to timestamps while watching:
                      {'\n'}• Tap "+ Bookmark" above to mark this exact second.
                      {'\n'}• Or type any note below and tap Save.
                      {'\n'}• Tap any saved [▶ MM:SS] pill to immediately jump the video to that moment!
                    </Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <View style={styles.noteCard}>
                    <View style={styles.noteCardTopRow}>
                      <View style={styles.noteTimestampGroup}>
                        <TouchableOpacity
                          style={styles.jumpTimePill}
                          onPress={() => handleSeekToNote(item.seconds || 0)}
                          activeOpacity={0.8}
                        >
                          <MaterialIcons name="play-arrow" size={12} color={colors.CYAN_ACCENT} />
                          <Text style={styles.jumpTimeText}>{formatTime(item.seconds || 0)}</Text>
                        </TouchableOpacity>
                        <Text style={styles.noteActTag}>{item.tag || 'Storyboard Bookmark'}</Text>
                      </View>

                      <TouchableOpacity
                        style={styles.noteDeleteBtn}
                        onPress={() => deleteNote(item.id)}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons name="delete-outline" size={16} color={colors.SUB_TITLE_COLOR} />
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.noteContentText}>{item.text}</Text>

                    {/* Frame Snapshot Pill */}
                    <View style={styles.frameSnapshotRow}>
                      <MaterialIcons name="photo-camera" size={12} color={colors.ACCEPT_GREEN} />
                      <Text style={styles.frameSnapshotText}>
                        Captured Frame: {formatTime(item.seconds || 0)} • 4K HDR Color Grade
                      </Text>
                    </View>
                  </View>
                )}
              />

              {/* Solo Mode: Quick Frame Capture Bottom Dock */}
              <View style={styles.soloBottomDock}>
                <TouchableOpacity
                  style={styles.cameraSnapBtn}
                  onPress={() => addNote(`Captured 4K frame at ${formatTime(currentTime)}`)}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="photo-camera" size={20} color={colors.CYAN_ACCENT} />
                  <View style={styles.cameraSnapDot} />
                </TouchableOpacity>

                <View style={styles.soloInputWrap}>
                  <TextInput
                    style={styles.soloTextInput}
                    placeholder={`Type a note at ${formatTime(currentTime)}...`}
                    placeholderTextColor={colors.SUB_TITLE_COLOR}
                    value={newNoteText}
                    onChangeText={setNewNoteText}
                    onSubmitEditing={() => addNote()}
                  />
                  <Text style={styles.soloInputTimestamp}>{formatTime(currentTime)}</Text>
                </View>

                <TouchableOpacity
                  style={styles.saveNoteBtn}
                  onPress={() => addNote()}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]}
                    style={styles.saveNoteGradient}
                  >
                    <MaterialIcons name="bookmark-add" size={16} color={colors.TITLE_COLOR} />
                    <Text style={styles.saveNoteBtnText}>Save</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          ) : (
            /* ============================================================== */
            /* VIEW B: MULTI-PARTICIPANT MODE (Social Party)                  */
            /* ============================================================== */
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={{ flex: 1 }}
            >
              {/* Connected Audience Presence Row */}
              <View style={styles.audiencePresenceRow}>
                <View style={styles.audiencePresenceHeader}>
                  <View style={styles.audienceLeftTitle}>
                    <Text style={styles.audienceTitleText}>CONNECTED THEATER</Text>
                    <View style={styles.liveAudiencePill}>
                      <Text style={styles.liveAudiencePillText}>{participants.length} LIVE</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    onPress={() => navigation.navigate('StreamInfo', { roomId, roomName: roomTitle, streamUrl })}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.inviteFriendsLink}>+ Invite Friends</Text>
                  </TouchableOpacity>
                </View>

                {/* Audience Avatar Scroll Reel */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.avatarScrollTrack}
                >
                  {participants.map(p => (
                    <View key={p.id} style={styles.audienceItemCol}>
                      <View style={[styles.audienceAvatarWrap, { borderColor: p.color }]}>
                        <Text style={styles.audienceInitialText}>{p.initial}</Text>
                        {p.isHost && (
                          <View style={styles.hostCrownBadge}>
                            <Text style={styles.hostCrownStar}>★</Text>
                          </View>
                        )}
                        <View
                          style={[
                            styles.audienceMicBeacon,
                            { backgroundColor: p.isOnline ? colors.ACCEPT_GREEN : colors.MUTED_COLOR },
                          ]}
                        >
                          <MaterialIcons
                            name={p.isOnline ? 'mic' : 'mic-off'}
                            size={7}
                            color={colors.BACKGROUND_COLOR}
                          />
                        </View>
                      </View>
                      <Text style={styles.audienceNameText} numberOfLines={1}>
                        {p.name}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </View>

              {/* Chat Stream */}
              <FlatList
                data={messages}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.chatListContainer}
                showsVerticalScrollIndicator={false}
                ListHeaderComponent={
                  <View style={styles.systemChatEventPill}>
                    <Text style={styles.systemChatEventText}>
                      ✨ Spatial Audio synchronized for all {participants.length} viewers
                    </Text>
                  </View>
                }
                renderItem={({ item }) => {
                  const isMe = item.senderId === auth().currentUser?.uid;

                  return (
                    <View style={[styles.chatRowItem, isMe && styles.chatRowItemMe]}>
                      {!isMe && (
                        <View style={[styles.chatAvatarThumb, { backgroundColor: item.senderColor || colors.PRIMARY_COLOR }]}>
                          <Text style={styles.chatAvatarThumbText}>
                            {getInitials(item.senderName)}
                          </Text>
                        </View>
                      )}

                      <View style={[styles.chatBubbleCol, isMe && styles.chatBubbleColMe]}>
                        <View style={[styles.chatMetaRow, isMe && styles.chatMetaRowMe]}>
                          <Text style={[styles.chatSenderName, { color: item.senderColor || colors.CYAN_ACCENT }]}>
                            {isMe ? 'You' : item.senderName}
                          </Text>
                          <Text style={styles.chatTimeText}>
                            {item.timestamp ? formatTime(Math.floor((Date.now() - item.timestamp) / 1000)) : ''}
                          </Text>
                        </View>

                        <View style={[styles.chatBubbleBody, isMe ? styles.chatBubbleMe : styles.chatBubbleThem]}>
                          <Text style={[styles.chatMessageText, isMe && styles.chatMessageTextMe]}>
                            {item.text}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                }}
              />

              {/* Floating Reaction Emojis Dock */}
              <View style={styles.floatingReactionsDock}>
                {['🔥', '🍿', '😱', '🚀', '❤️', '👏'].map(emoji => (
                  <TouchableOpacity
                    key={emoji}
                    style={styles.reactionEmojiBtn}
                    onPress={() => sendReaction(emoji)}
                    activeOpacity={0.65}
                  >
                    <Text style={styles.reactionEmojiText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Party Chat Input Bar */}
              <View style={styles.partyBottomInputBar}>
                {/* Mic Toggle Button */}
                <TouchableOpacity
                  style={[
                    styles.partyMicBtn,
                    isMicActive ? styles.partyMicBtnActive : styles.partyMicBtnMuted,
                  ]}
                  onPress={() => setIsMicActive(prev => !prev)}
                  activeOpacity={0.8}
                >
                  <MaterialIcons
                    name={isMicActive ? 'mic' : 'mic-off'}
                    size={19}
                    color={isMicActive ? colors.CYAN_ACCENT : colors.DELETE_RED_COLOR}
                  />
                </TouchableOpacity>

                {/* Message Input */}
                <TextInput
                  style={styles.partyTextInput}
                  placeholder="Say something to the room..."
                  placeholderTextColor={colors.SUB_TITLE_COLOR}
                  value={newMessage}
                  onChangeText={setNewMessage}
                  onSubmitEditing={sendMessage}
                />

                {/* Send Button */}
                <TouchableOpacity
                  style={styles.partySendBtn}
                  onPress={sendMessage}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]}
                    style={styles.partySendGradient}
                  >
                    <MaterialIcons name="send" size={17} color={colors.TITLE_COLOR} />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
  },
  containerLandscape: {
    backgroundColor: colors.BACKGROUND_COLOR,
  },
  ambientTopGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 380,
    zIndex: 0,
  },

  // ── Top Header ──
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: colors.BORDER_SUBTLE,
    zIndex: 50,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  backBtnCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.SURFACE_ELEVATED,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  headerTitleCol: {
    flex: 1,
  },
  titleWithBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitleText: {
    color: colors.TITLE_COLOR,
    fontSize: 15,
    fontWeight: '700',
    maxWidth: '75%',
  },
  hdrTag: {
    backgroundColor: colors.FILM_GOLD_GLOW,
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 0, 0.3)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  hdrTagText: {
    color: colors.FILM_GOLD,
    fontSize: 9,
    fontWeight: '800',
  },
  headerSubtitleText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveStreamBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.LIVE_RED_GLOW,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  liveDotSolid: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.LIVE_RED,
  },
  liveStreamText: {
    color: colors.LIVE_RED,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.SURFACE_ELEVATED,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },

  // ── Video Section ──
  videoSection: {
    width: '100%',
    backgroundColor: colors.BACKGROUND_COLOR,
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
  telemetryWatermarkBar: {
    position: 'absolute',
    top: 10,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  syncBufferBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(8, 8, 16, 0.75)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  syncBufferDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.CYAN_ACCENT,
  },
  syncBufferText: {
    color: colors.CYAN_ACCENT,
    fontSize: 9,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  spatialAudioBadge: {
    backgroundColor: 'rgba(8, 8, 16, 0.75)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.3)',
  },
  spatialAudioText: {
    color: colors.PURPLE_ACCENT,
    fontSize: 9,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  resolutionTag: {
    position: 'absolute',
    top: 10,
    right: 12,
    backgroundColor: 'rgba(8, 8, 16, 0.75)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  resolutionText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 9,
    fontWeight: '600',
  },
  creatorLeftOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 8, 16, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
  },
  creatorLeftTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 10,
  },
  creatorLeftText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 13,
    marginTop: 4,
  },

  // Controls Overlay
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 8, 16, 0.45)',
    justifyContent: 'space-between',
    zIndex: 25,
  },
  centerControlsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  seekStepBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(8, 8, 16, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playPauseGlowBtn: {
    width: 52,
    height: 52,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 6,
  },
  playPauseGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Bottom Scrubber Bar
  bottomScrubberRow: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: 'rgba(8, 8, 16, 0.7)',
  },
  scrubberTrack: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  scrubberBuffered: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  scrubberFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.CYAN_ACCENT,
  },
  scrubberMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  timeCounterGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeCurrentText: {
    color: colors.CYAN_ACCENT,
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  timeDivider: {
    color: colors.MUTED_COLOR,
    fontSize: 11,
  },
  timeTotalText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  syncLockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 6,
  },
  syncLockDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.ACCEPT_GREEN,
  },
  syncLockText: {
    color: colors.ACCEPT_GREEN,
    fontSize: 10,
    fontWeight: '700',
  },
  telemetryQuickBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  // ── State Switcher Dock ──
  stateSwitcherDock: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.BACKGROUND_COLOR,
    borderBottomWidth: 1,
    borderBottomColor: colors.BORDER_SUBTLE,
  },
  stateSwitcherContainer: {
    flexDirection: 'row',
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 16,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  switcherTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 13,
  },
  switcherTabActive: {
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.4)',
  },
  switcherTabText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    fontWeight: '600',
  },
  switcherTabTextActive: {
    color: colors.TITLE_COLOR,
    fontWeight: '700',
  },
  switcherBadgeSolo: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  switcherBadgeSoloText: {
    color: colors.TITLE_COLOR,
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  switcherBadgeParty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.ACCEPT_GREEN_GLOW,
    borderWidth: 1,
    borderColor: 'rgba(0, 200, 83, 0.3)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  partyLiveMiniDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.ACCEPT_GREEN,
  },
  switcherBadgePartyText: {
    color: colors.ACCEPT_GREEN,
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // ── Adaptive Content Wrap ──
  adaptiveContentWrap: {
    flex: 1,
  },

  // ── VIEW A: Solo Storyboard ──
  storyboardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  storyboardTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  storyboardTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '700',
  },
  privateVaultBadge: {
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  privateVaultText: {
    color: colors.CYAN_ACCENT,
    fontSize: 9,
    fontWeight: '700',
  },
  storyboardSubtitle: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    marginTop: 2,
  },
  quickBookmarkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.35)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
  },
  quickBookmarkText: {
    color: colors.CYAN_ACCENT,
    fontSize: 10,
    fontWeight: '700',
  },
  notesListContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  noteCard: {
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  noteCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noteTimestampGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  jumpTimePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  jumpTimeText: {
    color: colors.CYAN_ACCENT,
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  noteActTag: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
  },
  noteDeleteBtn: {
    padding: 4,
  },
  noteContentText: {
    color: colors.TITLE_COLOR,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 8,
  },
  frameSnapshotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  frameSnapshotText: {
    color: colors.ACCEPT_GREEN,
    fontSize: 10,
    fontWeight: '500',
  },
  emptyNotesBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    gap: 6,
  },
  emptyNotesTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '700',
  },
  emptyNotesSubtitle: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 30,
  },

  // Solo Bottom Dock
  soloBottomDock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.SURFACE_COLOR,
    borderTopWidth: 1,
    borderTopColor: colors.BORDER_SUBTLE,
  },
  cameraSnapBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cameraSnapDot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.CYAN_ACCENT,
  },
  soloInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.BACKGROUND_COLOR,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    paddingHorizontal: 10,
    height: 40,
  },
  soloTextInput: {
    flex: 1,
    color: colors.TITLE_COLOR,
    fontSize: 12,
    paddingVertical: 0,
  },
  soloInputTimestamp: {
    color: colors.MUTED_COLOR,
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  saveNoteBtn: {
    height: 40,
    borderRadius: 12,
    overflow: 'hidden',
  },
  saveNoteGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
  },
  saveNoteBtnText: {
    color: colors.TITLE_COLOR,
    fontSize: 12,
    fontWeight: '700',
  },

  // ── VIEW B: Multi-Participant Party ──
  audiencePresenceRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.SURFACE_COLOR,
    borderBottomWidth: 1,
    borderBottomColor: colors.BORDER_SUBTLE,
  },
  audiencePresenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  audienceLeftTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  audienceTitleText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  liveAudiencePill: {
    backgroundColor: colors.ACCEPT_GREEN_GLOW,
    borderWidth: 1,
    borderColor: 'rgba(0, 200, 83, 0.3)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  liveAudiencePillText: {
    color: colors.ACCEPT_GREEN,
    fontSize: 9,
    fontWeight: '800',
  },
  inviteFriendsLink: {
    color: colors.PRIMARY_COLOR,
    fontSize: 11,
    fontWeight: '700',
  },
  avatarScrollTrack: {
    gap: 12,
  },
  audienceItemCol: {
    alignItems: 'center',
    gap: 4,
    width: 48,
  },
  audienceAvatarWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  audienceInitialText: {
    color: colors.TITLE_COLOR,
    fontSize: 13,
    fontWeight: '700',
  },
  hostCrownBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 14,
    height: 14,
    borderRadius: 4,
    backgroundColor: colors.FILM_GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hostCrownStar: {
    color: colors.BACKGROUND_COLOR,
    fontSize: 9,
    fontWeight: '900',
  },
  audienceMicBeacon: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audienceNameText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center',
  },

  // Chat Stream
  chatListContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  systemChatEventPill: {
    alignSelf: 'center',
    backgroundColor: colors.SURFACE_COLOR,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    marginBottom: 6,
  },
  systemChatEventText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 10,
    fontWeight: '500',
  },
  chatRowItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    maxWidth: '85%',
  },
  chatRowItemMe: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  chatAvatarThumb: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  chatAvatarThumbText: {
    color: colors.TITLE_COLOR,
    fontSize: 10,
    fontWeight: '700',
  },
  chatBubbleCol: {
    gap: 2,
  },
  chatBubbleColMe: {
    alignItems: 'flex-end',
  },
  chatMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chatMetaRowMe: {
    flexDirection: 'row-reverse',
  },
  chatSenderName: {
    fontSize: 11,
    fontWeight: '700',
  },
  chatTimeText: {
    color: colors.MUTED_COLOR,
    fontSize: 9,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  chatBubbleBody: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  chatBubbleMe: {
    backgroundColor: colors.PRIMARY_COLOR,
    borderTopRightRadius: 2,
  },
  chatBubbleThem: {
    backgroundColor: colors.SURFACE_COLOR,
    borderTopLeftRadius: 2,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  chatMessageText: {
    color: colors.TITLE_COLOR,
    fontSize: 12,
    lineHeight: 16,
  },
  chatMessageTextMe: {
    color: colors.TITLE_COLOR,
  },

  // Floating Reactions Dock
  floatingReactionsDock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.SURFACE_COLOR,
    borderTopWidth: 1,
    borderTopColor: colors.BORDER_SUBTLE,
  },
  reactionEmojiBtn: {
    padding: 4,
  },
  reactionEmojiText: {
    fontSize: 20,
  },

  // Party Bottom Input Bar
  partyBottomInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.SURFACE_COLOR,
    borderTopWidth: 1,
    borderTopColor: colors.BORDER_SUBTLE,
  },
  partyMicBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partyMicBtnActive: {
    borderColor: colors.CYAN_ACCENT,
  },
  partyMicBtnMuted: {
    borderColor: colors.DELETE_RED_COLOR,
  },
  partyTextInput: {
    flex: 1,
    height: 38,
    backgroundColor: colors.BACKGROUND_COLOR,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    paddingHorizontal: 12,
    color: colors.TITLE_COLOR,
    fontSize: 12,
  },
  partySendBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    overflow: 'hidden',
  },
  partySendGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Floating Emoji particle
  floatingEmoji: {
    position: 'absolute',
    bottom: 30,
    right: 25,
    zIndex: 60,
  },
});

export default StreamingScreen;
