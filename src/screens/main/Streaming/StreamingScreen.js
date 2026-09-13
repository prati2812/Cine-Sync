import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  BackHandler,
  ActivityIndicator,
  Image,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CineVideoPlayer from '../../../components/video/CineVideoPlayer';
import { getStreamBadgeInfo } from '../../../services/video/VideoPlayerService';
import { searchCinemaMedia } from '../../../services/video/CinemaMediaSearchService';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import Orientation from 'react-native-orientation-locker';
import { auth, database } from '../../../config/firebase';
import { createSyncSession, saveLocalProgress, getLocalProgress } from '../../../services/video/CineSyncEngine';
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
      <View style={styles.floatingReactionBubble}>
        <MaterialIcons name={emoji || 'auto-awesome'} size={22} color={colors.CYAN_ACCENT} />
      </View>
    </Animated.View>
  );
};

const StreamingScreen = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const {
    streamUrl: initialStreamUrl,
    roomName: initialRoomName,
    roomId: initialRoomId,
    isLocalSolo: initialIsLocalSolo,
    thumbnail: initialThumbnail,
    channelName: initialChannelName,
    durationText: initialDurationText,
    views: initialViews,
  } = route.params || {};

  const [currentRoomId, setCurrentRoomId] = useState(initialRoomId || null);
  const roomId = currentRoomId;
  const isLocalSolo = Boolean(initialIsLocalSolo || !initialRoomId);

  // Active solo stream state (allows seamlessly playing recommended videos)
  const [activeStreamUrl, setActiveStreamUrl] = useState(initialStreamUrl || '');
  const streamUrl = activeStreamUrl || initialStreamUrl || '';
  const [soloSelectedTitle, setSoloSelectedTitle] = useState(null);
  const [activeChannelName, setActiveChannelName] = useState(initialChannelName || '');
  const [activeViews, setActiveViews] = useState(initialViews || '');
  const [activeDurationText, setActiveDurationText] = useState(initialDurationText || '');

  // On-demand Notes Sheet state (Completely hidden from main screen by default)
  const [isNotesSheetVisible, setIsNotesSheetVisible] = useState(false);

  // Up Next & Recommended Cinema for Solo mode
  const [recommendedMedia, setRecommendedMedia] = useState([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const [recommendedContinuationToken, setRecommendedContinuationToken] = useState(null);
  const [isLoadingMoreRecommendations, setIsLoadingMoreRecommendations] = useState(false);

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
  const [initialPosition, setInitialPosition] = useState(0);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const pendingResumeRef = useRef(null);
  const isSeekingRef = useRef(false);
  const seekLockTimeoutRef = useRef(null);
  const [showControls, setShowControls] = useState(false);
  const controlsTimeoutRef = useRef(null);
  const playerRef = useRef(null);
  const [isCreator, setIsCreator] = useState(false);
  const [roomData, setRoomData] = useState(null);

  // Adaptive Switcher: 'chat' vs 'notes' (Multi-user party only)
  const [activeMode, setActiveMode] = useState('chat');
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

  useEffect(() => {
    setIsInitialLoading(true);
    if (!streamUrl || !streamUrl.trim()) {
      Alert.alert('Invalid Stream', 'No streaming URL provided for this room.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    }
    // Safety failsafe: Ensure initial loader never hangs indefinitely
    const fallbackTimer = setTimeout(() => {
      setIsInitialLoading(false);
    }, 4000);
    return () => clearTimeout(fallbackTimer);
  }, [streamUrl, navigation]);

  const [creatorLeft, setCreatorLeft] = useState(false);
  const streamBadge = useMemo(() => getStreamBadgeInfo(streamUrl), [streamUrl]);

  // Detected if room is for self (no friends invited) or direct solo stream
  const isSoloRoom = useMemo(() => {
    if (isLocalSolo || !currentRoomId) return true;
    if (roomData?.isSolo !== undefined) return Boolean(roomData.isSolo);
    if (route.params?.isSolo !== undefined) return Boolean(route.params.isSolo);
    if (roomData) {
      const parts = roomData.participants || [];
      return parts.length === 0;
    }
    return false;
  }, [isLocalSolo, currentRoomId, roomData, route.params]);

  // Auto-hide controls overlay after 3.5s (hidden while initial loading)
  const resetControlsTimeout = useCallback(() => {
    if (isInitialLoading) {
      setShowControls(false);
      return;
    }
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3500);
  }, [isInitialLoading]);

  // When video transitions from loading to ready, show controls briefly then auto-hide
  useEffect(() => {
    if (!isInitialLoading) {
      resetControlsTimeout();
    } else {
      setShowControls(false);
    }
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isInitialLoading, resetControlsTimeout]);

  // Fetch Room & Participants from RTDB (Only for multi-user networked rooms)
  useEffect(() => {
    if (isLocalSolo || !currentRoomId) {
      setIsCreator(true);
      if (!hasAutoSetDefaultModeRef.current) {
        hasAutoSetDefaultModeRef.current = true;
        setActiveMode('notes');
      }
      return;
    }

    const roomRef = database().ref(`rooms/${currentRoomId}`);

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

      // Default mode on initial room load:
      // If room is for self (no friends invited), default to 'notes' (Scene Notes / Storyboard);
      // If group watch party with invited members, default to 'chat'.
      if (!hasAutoSetDefaultModeRef.current) {
        hasAutoSetDefaultModeRef.current = true;
        const isSelfRoom = data.isSolo === true || !data.participants || data.participants.length === 0;
        setActiveMode(isSelfRoom ? 'notes' : 'chat');
      }
    };

    roomRef.on('value', onRoomHandler);
    return () => roomRef.off('value', onRoomHandler);
  }, [currentRoomId, isLocalSolo]);

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
  // Production Dead-Reckoning Synchronization & Local Progress Engine
  // ──────────────────────────────────────────────────────────────
  const syncSessionRef = useRef(null);
  const [syncStateInfo, setSyncStateInfo] = useState({
    isSynced: true,
    status: 'SYNC_LOCKED',
    driftMs: 0,
    isSolo: false,
  });

  // Read local progress immediately to set initialPosition prop before player mounts
  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (!currentRoomId && !streamUrl) return;
      const saved = await getLocalProgress(streamUrl, currentRoomId);
      if (isMounted && saved && typeof saved.position === 'number' && saved.position >= 1) {
        pendingResumeRef.current = saved.position;
        setInitialPosition(saved.position);
        setCurrentTime(saved.position);
        currentTimeRef.current = saved.position;
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [currentRoomId, streamUrl]);

  useEffect(() => {
    if (!currentRoomId || isLocalSolo) return;

    const session = createSyncSession({
      roomId: currentRoomId,
      mediaKey: streamUrl || currentRoomId,
      isHost: isCreator,
      isSolo: isCreator && (isSoloRoom || participants.length <= 1),
      playerRef,
      onSyncStatusChange: statusData => {
        setSyncStateInfo(statusData);
      },
      onRemotePlayStateChange: isRemotePlaying => {
        setPlaying(isRemotePlaying);
      },
      onResumeProgress: ({ position }) => {
        if (typeof position === 'number' && position >= 1) {
          pendingResumeRef.current = position;
          setCurrentTime(position);
          currentTimeRef.current = position;
          setInitialPosition(position);
          playerRef.current?.seekTo(position);
        }
      },
    });

    syncSessionRef.current = session;

    return () => {
      session.destroy(currentTimeRef.current, durationRef.current);
      syncSessionRef.current = null;
    };
  }, [currentRoomId, isLocalSolo, isCreator, streamUrl, isSoloRoom]);

  // Dynamically update solo vs party mode when participants join or leave
  useEffect(() => {
    if (syncSessionRef.current && isCreator && !isLocalSolo) {
      syncSessionRef.current.setSolo(isSoloRoom || participants.length <= 1);
    }
  }, [participants.length, isCreator, isSoloRoom, isLocalSolo]);

  // ──────────────────────────────────────────────────────────────
  // Notes Logic: Lazy Cloud Persistence
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const user = auth().currentUser;
    if (!user || !currentRoomId) return;

    const notesRef = database().ref(`notes/${user.uid}/${currentRoomId}`);
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
  }, [currentRoomId]);

  const addNote = async (customText = null) => {
    const user = auth().currentUser;
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in to save cinema notes.');
      return;
    }
    const textToSave = (typeof customText === 'string' ? customText : newNoteText).trim();
    if (!textToSave) return;

    try {
      const secs = (await playerRef.current?.getCurrentTime()) || currentTimeRef.current || currentTime || 0;
      const roundedSecs = Math.floor(secs);
      let targetRoomId = currentRoomId;

      // Lazy Database Persistence:
      // If user was streaming solo with zero DB room, create the room record now on first note!
      if (!targetRoomId) {
        targetRoomId = `solo_${Date.now()}`;
        const db = database();

        const newRoomData = {
          roomId: targetRoomId,
          name: roomTitle,
          nameLower: roomTitle.toLowerCase(),
          streamUrl: streamUrl,
          thumbnail: initialThumbnail || null,
          isSolo: true,
          isPrivate: true,
          isStreaming: true,
          createdAt: new Date().toISOString(),
          creator: {
            uid: user.uid,
            email: user.email,
            userName: user.displayName || user.email?.split('@')[0] || 'Host',
          },
          playback: {
            currentTime: roundedSecs,
            isPlaying: playing,
            lastUpdated: database.ServerValue.TIMESTAMP,
          },
        };

        const updates = {};
        updates[`rooms/${targetRoomId}`] = newRoomData;
        updates[`user_rooms/${user.uid}/${targetRoomId}`] = {
          roomId: targetRoomId,
          name: roomTitle,
          nameLower: roomTitle.toLowerCase(),
          role: 'creator',
          isSolo: true,
          createdAt: newRoomData.createdAt,
          status: 'active',
          thumbnail: initialThumbnail || null,
          lastWatched: database.ServerValue.TIMESTAMP,
        };

        await db.ref().update(updates);
        setCurrentRoomId(targetRoomId);
      }

      // Save note in notes/${user.uid}/${targetRoomId}
      const notesRef = database().ref(`notes/${user.uid}/${targetRoomId}`);
      const newNoteRef = await notesRef.push({
        text: textToSave,
        seconds: roundedSecs,
        tag: 'Storyboard Note',
        author: user.email?.split('@')[0] || 'Me',
        timestamp: database.ServerValue.TIMESTAMP,
      });

      // Optimistic local state update so note renders instantaneously
      setNotes(prevNotes => {
        const noteItem = {
          id: newNoteRef.key || `local_${Date.now()}`,
          text: textToSave,
          seconds: roundedSecs,
          tag: 'Storyboard Note',
          author: user.email?.split('@')[0] || 'Me',
          timestamp: Date.now(),
        };
        const updated = [noteItem, ...prevNotes.filter(n => n.id !== noteItem.id)];
        return updated.sort((a, b) => (b.seconds || 0) - (a.seconds || 0));
      });

      setNewNoteText('');
    } catch (e) {
      console.log('Error adding note:', e);
      Alert.alert('Save Error', 'Unable to save note to cloud storyboard.');
    }
  };

  const deleteNote = async noteId => {
    const user = auth().currentUser;
    if (!user) return;
    try {
      if (currentRoomId) {
        await database().ref(`notes/${user.uid}/${currentRoomId}/${noteId}`).remove();
      }
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (e) {
      console.log('Error deleting note:', e);
    }
  };

  const handleSeekToNote = seconds => {
    if (!playerRef.current) return;
    playerRef.current.seekTo(seconds);
    currentTimeRef.current = seconds;
    setCurrentTime(seconds);
    const dur = durationRef.current || duration;
    if (isCreator && syncSessionRef.current && !isLocalSolo) {
      syncSessionRef.current.pushSeek(seconds, playing, dur);
    } else {
      saveLocalProgress(streamUrl || currentRoomId, seconds, dur, currentRoomId);
    }
  };

  // ──────────────────────────────────────────────────────────────
  // Chat & Reactions Logic (Only for multi-user watch parties)
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentRoomId || isLocalSolo) return;
    const messagesRef = database().ref(`rooms/${currentRoomId}/messages`);
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
  }, [currentRoomId, isLocalSolo]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !currentRoomId || isLocalSolo) return;
    const messagesRef = database().ref(`rooms/${currentRoomId}/messages`);
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
    if (!currentRoomId || isLocalSolo) return;
    const reactionsRef = database().ref(`rooms/${currentRoomId}/reactions`);
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
  }, [currentRoomId, isLocalSolo]);

  const sendReaction = async emoji => {
    if (!currentRoomId || isLocalSolo) return;
    try {
      await database().ref(`rooms/${currentRoomId}/reactions`).push({
        emoji,
        senderId: auth().currentUser?.uid,
        timestamp: database.ServerValue.TIMESTAMP,
      });
    } catch (e) {
      console.log('Error sending reaction:', e);
    }
  };

  // ──────────────────────────────────────────────────────────────
  // Playback Control Handlers (Zero Debounce, Instant Native Response)
  // ──────────────────────────────────────────────────────────────
  const togglePlayPause = () => {
    const next = !playing;
    setPlaying(next);
    if (playerRef.current) {
      if (next) {
        playerRef.current.play();
      } else {
        playerRef.current.pause();
      }
    }
    const cur = currentTimeRef.current || currentTime;
    const dur = durationRef.current || duration;
    if (isCreator && syncSessionRef.current && !isLocalSolo) {
      if (next) {
        syncSessionRef.current.pushPlay(cur, dur);
      } else {
        syncSessionRef.current.pushPause(cur, dur);
      }
    } else {
      saveLocalProgress(streamUrl || currentRoomId, cur, dur, currentRoomId);
    }
  };

  const handleRewind10 = async () => {
    if (!playerRef.current) return;
    resetControlsTimeout();
    isSeekingRef.current = true;
    if (seekLockTimeoutRef.current) clearTimeout(seekLockTimeoutRef.current);
    seekLockTimeoutRef.current = setTimeout(() => {
      isSeekingRef.current = false;
    }, 800);

    try {
      const t = (await playerRef.current.getCurrentTime()) || currentTimeRef.current || currentTime || 0;
      const target = Math.max(0, t - 10);
      playerRef.current.seekTo(target);
      currentTimeRef.current = target;
      setCurrentTime(target);
      const dur = durationRef.current || duration;
      if (isCreator && syncSessionRef.current && !isLocalSolo) {
        syncSessionRef.current.pushSeek(target, playing, dur);
      } else {
        saveLocalProgress(streamUrl || currentRoomId, target, dur, currentRoomId);
      }
    } catch (e) {}
  };

  const handleForward10 = async () => {
    if (!playerRef.current) return;
    resetControlsTimeout();
    isSeekingRef.current = true;
    if (seekLockTimeoutRef.current) clearTimeout(seekLockTimeoutRef.current);
    seekLockTimeoutRef.current = setTimeout(() => {
      isSeekingRef.current = false;
    }, 800);

    try {
      const t = (await playerRef.current.getCurrentTime()) || currentTimeRef.current || currentTime || 0;
      const target = t + 10;
      playerRef.current.seekTo(target);
      currentTimeRef.current = target;
      setCurrentTime(target);
      const dur = durationRef.current || duration;
      if (isCreator && syncSessionRef.current && !isLocalSolo) {
        syncSessionRef.current.pushSeek(target, playing, dur);
      } else {
        saveLocalProgress(streamUrl || currentRoomId, target, dur, currentRoomId);
      }
    } catch (e) {}
  };

  const savePlaybackOnExit = useCallback(async () => {
    const cur = currentTimeRef.current;
    const dur = durationRef.current;
    if (typeof cur === 'number' && cur >= 1) {
      await saveLocalProgress(streamUrl || currentRoomId, cur, dur, currentRoomId);
    }
  }, [streamUrl, currentRoomId]);

  const handleGoBack = useCallback(async () => {
    await savePlaybackOnExit();
    if (isCreator && currentRoomId && !isLocalSolo) {
      try {
        await database().ref(`rooms/${currentRoomId}`).update({
          isStreaming: false,
        });
      } catch (error) {
        console.error('Error resetting stream state:', error);
      }
    }
    navigation.goBack();
  }, [savePlaybackOnExit, isCreator, currentRoomId, isLocalSolo, navigation]);

  // Guaranteed save on Android hardware back button
  useEffect(() => {
    const backAction = () => {
      handleGoBack();
      return true;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [handleGoBack]);

  // Guaranteed save on screen unmount
  useEffect(() => {
    return () => {
      savePlaybackOnExit();
    };
  }, [savePlaybackOnExit]);

  const roomTitle = soloSelectedTitle || roomData?.name || initialRoomName || 'Screening Room';
  const displayChannelName = activeChannelName || (roomData?.creator?.userName ? `${roomData.creator.userName}` : 'Cinema Studio');
  const displayViews = activeViews || 'Cinema Stream';
  const displayDuration = activeDurationText || (duration > 0 ? formatTime(duration) : 'Feature Film');
  const shortRoomId = (currentRoomId ? currentRoomId.replace('room_', '').replace('solo_', '') : 'SOLO').slice(-4);
  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  // Up Next & Recommended Cinema for Solo Mode
  useEffect(() => {
    if (!isSoloRoom) return;
    let isMounted = true;
    setIsLoadingRecommendations(true);

    const titleToUse = soloSelectedTitle || initialRoomName || roomData?.name || '';
    const cleanWords = titleToUse
      .replace(/[\(\)\[\]\{\}\-–—|:;,.]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(w => w.length > 2)
      .slice(0, 3)
      .join(' ');

    const query = cleanWords || 'Movie Trailers 4K';

    searchCinemaMedia(query)
      .then(items => {
        if (isMounted) {
          const currentUrl = streamUrl;
          const filtered = (items || []).filter(item => item && item.mediaUrl !== currentUrl);
          setRecommendedMedia(filtered);
          setRecommendedContinuationToken(items?.continuationToken || null);
        }
      })
      .catch(err => {
        console.warn('[StreamingScreen] Recommended media error:', err);
        if (isMounted) {
          setRecommendedMedia([]);
          setRecommendedContinuationToken(null);
        }
      })
      .finally(() => {
        if (isMounted) setIsLoadingRecommendations(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isSoloRoom, soloSelectedTitle, initialRoomName, streamUrl, roomData]);

  // Infinite Scroll Pagination for Recommendations in Solo Grid
  const handleLoadMoreRecommendations = useCallback(async () => {
    if (isLoadingMoreRecommendations || isLoadingRecommendations || !recommendedContinuationToken) return;
    setIsLoadingMoreRecommendations(true);
    try {
      const nextBatch = await searchCinemaMedia('', recommendedContinuationToken);
      if (nextBatch && nextBatch.length > 0) {
        setRecommendedMedia(prev => {
          const currentUrl = streamUrl;
          const existingIds = new Set(prev.map(p => p.id));
          const uniqueItems = nextBatch.filter(item => !existingIds.has(item.id) && item.mediaUrl !== currentUrl);
          return [...prev, ...uniqueItems];
        });
        setRecommendedContinuationToken(nextBatch.continuationToken || null);
      } else {
        setRecommendedContinuationToken(null);
      }
    } catch (err) {
      console.warn('[StreamingScreen] Recommendations pagination error:', err);
    } finally {
      setIsLoadingMoreRecommendations(false);
    }
  }, [isLoadingMoreRecommendations, isLoadingRecommendations, recommendedContinuationToken, streamUrl]);

  const handleSelectRecommendedMedia = useCallback((item) => {
    if (!item || !item.mediaUrl) return;
    setActiveStreamUrl(item.mediaUrl);
    setSoloSelectedTitle(item.title);
    setActiveChannelName(item.channelName);
    setActiveViews(item.views);
    setActiveDurationText(item.duration);
    setCurrentTime(0);
    currentTimeRef.current = 0;
    setInitialPosition(0);
    setIsInitialLoading(true);
    setPlaying(true);
    setRecommendedContinuationToken(null);
    saveLocalProgress(item.mediaUrl, 0, 0, currentRoomId);
  }, [currentRoomId]);

  const handleShareScreening = async () => {
    try {
      if (isSoloRoom || isLocalSolo) {
        await Share.share({
          title: `Cine-Sync: ${roomTitle}`,
          message: `🎬 Streaming "${roomTitle}" on Cine-Sync!\n${streamUrl}\nStream anytime with 100% native cinema audio & video!`,
        });
        return;
      }
      const cleanCode = (currentRoomId || '').replace('room_', '');
      const pinText = roomData?.isPrivate && roomData?.pin ? `\nAccess PIN: ${roomData.pin}` : '';
      await Share.share({
        title: `Cine-Sync: ${roomTitle}`,
        message: `🎬 Join my Cine-Sync Watch Party "${roomTitle}" in Live Sync!\nRoom Code: #${cleanCode}${pinText}\nLaunch Cine-Sync to watch together!`,
      });
    } catch (e) {
      console.log('Error sharing screening:', e);
    }
  };

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
              style={styles.backBtnSquircle}
              activeOpacity={0.75}
            >
              <MaterialIcons name="arrow-back-ios-new" size={16} color={colors.TITLE_COLOR} />
            </TouchableOpacity>

            <View style={styles.headerTitleCol}>
              <View style={styles.titleWithBadgeRow}>
                <Text style={styles.headerTitleText} numberOfLines={1}>
                  {roomTitle}
                </Text>
              </View>
              <Text style={styles.headerSubtitleText}>
                {isSoloRoom
                  ? (currentRoomId ? `Personal Cinema #${shortRoomId}` : 'Personal Cinema • Direct Stream')
                  : `Live Sync Room #${shortRoomId}`}
              </Text>
            </View>
          </View>

          {/* Right Action Icons */}
          <View style={styles.headerRightActions}>
            {isSoloRoom ? (
              <View style={styles.soloHeaderBadge}>
                <MaterialIcons name="person" size={11} color={colors.CYAN_ACCENT} />
                <Text style={styles.soloHeaderBadgeText}>SOLO</Text>
              </View>
            ) : (
              <View style={styles.liveStreamBadge}>
                <Animated.View style={[styles.liveDotSolid, { opacity: livePulseAnim }]} />
                <Text style={styles.liveStreamText}>LIVE</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={handleShareScreening}
              activeOpacity={0.75}
            >
              <MaterialIcons name="share" size={18} color={colors.PRIMARY_COLOR} />
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
        {/* Universal Video Engine (Zero Controls, Plays YouTube & Custom Streams) */}
        <CineVideoPlayer
          ref={playerRef}
          url={streamUrl}
          playing={playing}
          initialPosition={initialPosition}
          onProgress={({ currentTime: cur, duration: dur }) => {
            if (typeof cur === 'number') {
              // Dismiss initial loader immediately upon receiving progress
              if (isInitialLoading) {
                setIsInitialLoading(false);
              }
              if (typeof dur === 'number' && dur > 0) {
                durationRef.current = dur;
                setDuration(dur);
              }

              currentTimeRef.current = cur;
              setCurrentTime(cur);
              syncSessionRef.current?.checkDrift(cur, dur);
            }
          }}
          onStateChange={({ isPlaying: playerPlaying, isBuffering, playbackState }) => {
            // Immediately dismiss initial loader when player is ready (playbackState === 3), playing, or finished initial buffer
            if (isInitialLoading && (playerPlaying || isBuffering === false || playbackState === 3)) {
              setIsInitialLoading(false);
            }

            if (typeof playerPlaying === 'boolean' && playerPlaying !== playing) {
              // Suppress transient pause emitted during seek buffering
              if (isSeekingRef.current && !playerPlaying && playing) {
                return;
              }
              setPlaying(playerPlaying);
              const cur = currentTimeRef.current;
              const dur = durationRef.current;
              if (isCreator && syncSessionRef.current) {
                if (playerPlaying) {
                  syncSessionRef.current.pushPlay(cur, dur);
                } else {
                  syncSessionRef.current.pushPause(cur, dur);
                }
              } else {
                saveLocalProgress(streamUrl || roomId, cur, dur, roomId);
              }
            }
          }}
          onError={error => {
            setIsInitialLoading(false);
            console.warn('[StreamingScreen] Player Error:', error);
          }}
          style={StyleSheet.absoluteFill}
        />

        {/* Tap backdrop to toggle Cine-Sync controls */}
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          disabled={isInitialLoading}
          onPress={() => {
            if (showControls) {
              setShowControls(false);
              if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
            } else {
              resetControlsTimeout();
            }
          }}
        />

        {/* Video Overlays: Host Paused */}
        {creatorLeft && (
          <View style={styles.creatorLeftOverlay}>
            <MaterialIcons name="pause" size={46} color={colors.TITLE_COLOR} />
            <Text style={styles.creatorLeftTitle}>Host Paused Stream</Text>
            <Text style={styles.creatorLeftText}>Waiting for host to resume...</Text>
          </View>
        )}

        {/* Player Controls Overlay (Strictly hidden when video is loading) */}
        {!isInitialLoading && showControls && (
          <View style={styles.controlsOverlay} pointerEvents="box-none">
            {/* Top Bar inside Overlay */}
            <View style={styles.overlayTopBar}>
              <View style={styles.overlaySyncPill}>
                <Animated.View
                  style={[
                    styles.syncBufferDot,
                    {
                      backgroundColor: isSoloRoom ? colors.CYAN_ACCENT : colors.ACCEPT_GREEN,
                      opacity: syncPulseAnim,
                    },
                  ]}
                />
                <Text style={styles.overlaySyncText}>
                  {isSoloRoom ? 'Solo Cinema' : 'Live Synced'}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.fullscreenBtn}
                onPress={toggleFullscreen}
                activeOpacity={0.8}
              >
                <MaterialIcons
                  name={isLandscape ? 'fullscreen-exit' : 'fullscreen'}
                  size={20}
                  color="#FFF"
                />
              </TouchableOpacity>
            </View>

            {/* Center Controls */}
            <View style={styles.centerControlsRow}>
              {/* -10s */}
              <TouchableOpacity
                style={styles.seekStepBtn}
                onPress={handleRewind10}
                activeOpacity={0.8}
              >
                <MaterialIcons name="replay-10" size={22} color="#FFF" />
              </TouchableOpacity>

              {/* Play / Pause with Gradient Squircle */}
              <TouchableOpacity
                style={styles.playPauseGlowBtn}
                onPress={togglePlayPause}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={[colors.GRADIENT_START, colors.GRADIENT_END]}
                  style={styles.playPauseGradient}
                >
                  <MaterialIcons
                    name={playing ? 'pause' : 'play-arrow'}
                    size={30}
                    color="#FFF"
                  />
                </LinearGradient>
              </TouchableOpacity>

              {/* +10s */}
              <TouchableOpacity
                style={styles.seekStepBtn}
                onPress={handleForward10}
                activeOpacity={0.8}
              >
                <MaterialIcons name="forward-10" size={22} color="#FFF" />
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
                    <Animated.View
                      style={[
                        styles.syncLockDot,
                        {
                          backgroundColor: syncStateInfo.isSolo || isSoloRoom
                            ? colors.CYAN_ACCENT
                            : syncStateInfo.isSynced
                            ? colors.ACCEPT_GREEN
                            : colors.FILM_GOLD,
                          opacity: syncPulseAnim,
                        },
                      ]}
                    />
                    <Text style={styles.syncLockText}>
                      {syncStateInfo.isSolo || isSoloRoom
                        ? 'Solo Mode • Progress Saved'
                        : syncStateInfo.isSynced
                        ? 'Sync Locked'
                        : 'Re-syncing'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Video Loading Overlay: Centered circular loader on login background color */}
        {isInitialLoading && (
          <View style={styles.videoLoaderOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color={colors.PRIMARY_COLOR} />
          </View>
        )}

        {/* Floating Emojis (Only for multi-user watch parties) */}
        {!isSoloRoom && floatingEmojis.map(item => (
          <FloatingEmoji key={item.id} emoji={item.emoji} />
        ))}
      </View>

      {/* ── STATE SWITCHER DOCK (Interactive Mode Toggle: ONLY for Multi-user Watch Party) ── */}
      {!isLandscape && !isSoloRoom && (
        <View style={styles.stateSwitcherDock}>
          <View style={styles.stateSwitcherContainer}>
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
                Live Theater Chat
              </Text>
              <View style={styles.switcherBadgeParty}>
                <View style={styles.partyLiveMiniDot} />
                <Text style={styles.switcherBadgePartyText}>{messages.length}</Text>
              </View>
            </TouchableOpacity>

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
                Scene Notes
              </Text>
              {notes.length > 0 && (
                <View style={styles.switcherBadgeSolo}>
                  <Text style={styles.switcherBadgeSoloText}>{notes.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── DYNAMIC ADAPTIVE VIEW CONTAINER ── */}
      {!isLandscape && (
        <View style={styles.adaptiveContentWrap}>
          {isSoloRoom ? (
            /* ============================================================== */
            /* SOLO CINEMA COMPANION (2-Column Grid with Infinite Scroll)    */
            /* ============================================================== */
            <FlatList
              data={recommendedMedia}
              keyExtractor={item => item.id}
              numColumns={2}
              columnWrapperStyle={styles.recommendedGridRow}
              style={styles.soloCompanionScroll}
              contentContainerStyle={styles.soloCompanionContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              onEndReached={handleLoadMoreRecommendations}
              onEndReachedThreshold={0.5}
              ListHeaderComponent={
                <View style={styles.soloHeaderComponentsWrap}>
                  {/* ── 1. VIDEO INFO HERO CARD ── */}
                  <LinearGradient
                    colors={['#141424', '#0D0D18', '#080810']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.soloInfoCard}
                  >
                    <Text style={styles.soloVideoTitle} numberOfLines={2}>
                      {roomTitle}
                    </Text>

                    {/* Channel Row (No Direct 4K tag) */}
                    <View style={styles.soloChannelRow}>
                      <View style={styles.soloChannelLeft}>
                        <View style={styles.soloChannelAvatar}>
                          <MaterialIcons name="theaters" size={13} color={colors.CYAN_ACCENT} />
                        </View>
                        <Text style={styles.soloChannelName} numberOfLines={1}>
                          {displayChannelName}
                        </Text>
                        <MaterialIcons name="verified" size={13} color={colors.CYAN_ACCENT} />
                      </View>
                    </View>

                    {/* Metrics Row */}
                    <View style={styles.soloMetricsRow}>
                      <View style={styles.soloMetricItem}>
                        <MaterialIcons name="visibility" size={13} color={colors.SUB_TITLE_COLOR} />
                        <Text style={styles.soloMetricText}>{displayViews}</Text>
                      </View>

                      <View style={styles.soloMetricDivider} />

                      <View style={styles.soloMetricItem}>
                        <MaterialIcons name="schedule" size={13} color={colors.SUB_TITLE_COLOR} />
                        <Text style={styles.soloMetricText}>{displayDuration}</Text>
                      </View>

                      <View style={styles.soloMetricDivider} />

                      <View style={styles.soloMetricItem}>
                        <MaterialIcons name="cloud-done" size={13} color={colors.ACCEPT_GREEN} />
                        <Text style={styles.soloAutoSaveText}>Auto-Saved</Text>
                      </View>
                    </View>
                  </LinearGradient>

                  {/* ── 2. QUICK ACTION BAR ── */}
                  <View style={styles.soloActionBar}>
                    {/* Notes & Moments Button - Opens On-Demand Bottom Sheet */}
                    <TouchableOpacity
                      style={[styles.soloActionBtn, notes.length > 0 && styles.soloActionBtnActive]}
                      onPress={() => setIsNotesSheetVisible(true)}
                      activeOpacity={0.78}
                    >
                      <MaterialIcons
                        name="bookmarks"
                        size={17}
                        color={notes.length > 0 ? colors.CYAN_ACCENT : colors.TITLE_COLOR}
                      />
                      <Text
                        style={[
                          styles.soloActionBtnText,
                          notes.length > 0 && styles.soloActionBtnTextActive,
                        ]}
                      >
                        Notes {notes.length > 0 ? `(${notes.length})` : ''}
                      </Text>
                    </TouchableOpacity>

                    {/* Quick Instant Bookmark Button */}
                    <TouchableOpacity
                      style={styles.soloActionBtn}
                      onPress={() => {
                        addNote(`Saved milestone @ ${formatTime(currentTime)}`);
                        setIsNotesSheetVisible(true);
                      }}
                      activeOpacity={0.78}
                    >
                      <MaterialIcons name="bookmark-add" size={17} color={colors.PRIMARY_COLOR} />
                      <Text style={styles.soloActionBtnText}>+ Bookmark</Text>
                    </TouchableOpacity>

                    {/* Share Button */}
                    <TouchableOpacity
                      style={styles.soloActionBtn}
                      onPress={handleShareScreening}
                      activeOpacity={0.78}
                    >
                      <MaterialIcons name="share" size={17} color={colors.FILM_GOLD} />
                      <Text style={styles.soloActionBtnText}>Share</Text>
                    </TouchableOpacity>

                    {/* Theater / Fullscreen Button */}
                    <TouchableOpacity
                      style={styles.soloActionBtn}
                      onPress={toggleFullscreen}
                      activeOpacity={0.78}
                    >
                      <MaterialIcons name="fullscreen" size={19} color={colors.TITLE_COLOR} />
                      <Text style={styles.soloActionBtnText}>Theater</Text>
                    </TouchableOpacity>
                  </View>

                  {/* ── 3. UP NEXT & RECOMMENDED GRID HEADER ── */}
                  <View style={styles.upNextHeaderRow}>
                    <View style={styles.upNextTitleGroup}>
                      <MaterialIcons name="auto-awesome" size={15} color={colors.CYAN_ACCENT} />
                      <Text style={styles.upNextHeading}>UP NEXT & RECOMMENDED</Text>
                    </View>
                    <Text style={styles.upNextSubheading}>Instant Play</Text>
                  </View>

                  {isLoadingRecommendations && (
                    <View style={styles.upNextLoadingBox}>
                      <ActivityIndicator size="small" color={colors.CYAN_ACCENT} />
                      <Text style={styles.upNextLoadingText}>Finding related cinema streams...</Text>
                    </View>
                  )}
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.recommendedGridCard}
                  onPress={() => handleSelectRecommendedMedia(item)}
                  activeOpacity={0.82}
                >
                  <LinearGradient
                    colors={['#131322', '#0A0A12', '#06060A']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={styles.recommendedGridCardGradient}
                  >
                    {/* 16:9 Squircle Thumbnail */}
                    <View style={styles.recommendedGridThumbWrap}>
                      {item.thumbnail ? (
                        <Image
                          source={{ uri: item.thumbnail }}
                          style={styles.recommendedGridThumbImg}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.recommendedThumbFallback}>
                          <MaterialIcons name="movie" size={24} color={colors.MUTED_COLOR} />
                        </View>
                      )}

                      {/* Smooth black card thumbnail fade overlay */}
                      <LinearGradient
                        colors={['transparent', 'rgba(10, 10, 18, 0.45)', '#0A0A12']}
                        locations={[0.2, 0.7, 1]}
                        style={styles.recommendedThumbFade}
                        pointerEvents="none"
                      />

                      {item.duration ? (
                        <View style={styles.recommendedDurationBadge}>
                          <Text style={styles.recommendedDurationText}>{item.duration}</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Grid Info */}
                    <View style={styles.recommendedGridInfo}>
                      <Text style={styles.recommendedGridTitle} numberOfLines={2}>
                        {item.title}
                      </Text>

                      <View style={styles.recommendedGridChannelRow}>
                        <Text style={styles.recommendedGridChannel} numberOfLines={1}>
                          {item.channelName}
                        </Text>
                        <MaterialIcons name="verified" size={11} color={colors.CYAN_ACCENT} />
                      </View>

                      <View style={styles.recommendedGridFooterRow}>
                        {item.views ? (
                          <Text style={styles.recommendedGridViews} numberOfLines={1}>
                            {item.views}
                          </Text>
                        ) : null}
                        <View style={styles.recommendedGridPlayPill}>
                          <MaterialIcons name="play-arrow" size={11} color="#FFF" />
                          <Text style={styles.recommendedGridPlayText}>Play</Text>
                        </View>
                      </View>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                !isLoadingRecommendations ? (
                  <View style={styles.upNextEmptyBox}>
                    <MaterialIcons name="theaters" size={26} color={colors.MUTED_COLOR} />
                    <Text style={styles.upNextEmptyText}>Ready for personal playback</Text>
                  </View>
                ) : null
              }
              ListFooterComponent={
                isLoadingMoreRecommendations ? (
                  <View style={styles.upNextLoadingBox}>
                    <ActivityIndicator size="small" color={colors.CYAN_ACCENT} />
                    <Text style={styles.upNextLoadingText}>Loading more suggestions...</Text>
                  </View>
                ) : recommendedContinuationToken ? (
                  <TouchableOpacity
                    style={styles.loadMoreSuggestionsBtn}
                    onPress={handleLoadMoreRecommendations}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="expand-more" size={18} color={colors.CYAN_ACCENT} />
                    <Text style={styles.loadMoreSuggestionsText}>Load More Suggestions</Text>
                  </TouchableOpacity>
                ) : recommendedMedia.length > 0 ? (
                  <View style={styles.endOfSuggestionsWrap}>
                    <MaterialIcons name="check-circle" size={14} color={colors.ACCEPT_GREEN} />
                    <Text style={styles.endOfSuggestionsText}>All matching suggestions loaded</Text>
                  </View>
                ) : null
              }
            />
          ) : activeMode === 'notes' ? (
            /* PARTY MODE: Notes Tab */
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
                      {'\n'}• Tap any saved [▶ MM:SS] pill to jump to that moment!
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

                    <View style={styles.frameSnapshotRow}>
                      <MaterialIcons name="photo-camera" size={12} color={colors.ACCEPT_GREEN} />
                      <Text style={styles.frameSnapshotText}>
                        Captured Frame: {formatTime(item.seconds || 0)} • 4K HDR Color Grade
                      </Text>
                    </View>
                  </View>
                )}
              />

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
            /* PARTY MODE: Live Theater Chat Tab */
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={{ flex: 1 }}
            >
              {/* Compact Audience & Invite Bar */}
              <View style={styles.compactAudienceBar}>
                <View style={styles.audienceLeftStack}>
                  <View style={styles.avatarStackRow}>
                    {participants.slice(0, 5).map((p, idx) => (
                      <View
                        key={p.id}
                        style={[
                          styles.audienceSquircleAvatar,
                          {
                            backgroundColor: p.color,
                            marginLeft: idx > 0 ? -8 : 0,
                            zIndex: 10 - idx,
                          },
                        ]}
                      >
                        <Text style={styles.audienceInitialsText}>{p.initial}</Text>
                        {p.isHost && (
                          <View style={styles.miniHostBadge}>
                            <MaterialIcons name="workspace-premium" size={8} color={colors.FILM_GOLD} />
                          </View>
                        )}
                        <View
                          style={[
                            styles.miniPresenceDot,
                            { backgroundColor: p.isOnline ? colors.ACCEPT_GREEN : colors.MUTED_COLOR },
                          ]}
                        />
                      </View>
                    ))}
                    {participants.length > 5 && (
                      <View style={[styles.audienceSquircleAvatar, styles.extraCountAvatar, { marginLeft: -8 }]}>
                        <Text style={styles.extraCountText}>+{participants.length - 5}</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.liveAudienceBadge}>
                    <Animated.View style={[styles.liveDotSolid, { opacity: livePulseAnim }]} />
                    <Text style={styles.liveAudienceText}>
                      {participants.length} {participants.length === 1 ? 'Viewer' : 'Viewers'}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.quickInviteBtn}
                  onPress={handleShareScreening}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="person-add-alt" size={13} color={colors.PRIMARY_COLOR} style={{ marginRight: 4 }} />
                  <Text style={styles.quickInviteBtnText}>+ Invite</Text>
                </TouchableOpacity>
              </View>

              {/* Chat Stream */}
              <FlatList
                data={messages}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.chatListContainer}
                showsVerticalScrollIndicator={false}
                ListHeaderComponent={
                  <View style={styles.systemChatEventPill}>
                    <MaterialIcons name="auto-awesome" size={12} color={colors.FILM_GOLD} style={{ marginRight: 5 }} />
                    <Text style={styles.systemChatEventText}>
                      Spatial Audio synchronized for all {participants.length} viewers
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

              {/* Floating Reaction Emojis Dock (Vector Icons per Rule 6) */}
              <View style={styles.floatingReactionsDock}>
                {[
                  { id: 'fire', icon: 'local-fire-department', color: colors.LIVE_RED },
                  { id: 'love', icon: 'favorite', color: colors.LIVE_RED },
                  { id: 'like', icon: 'thumb-up', color: colors.PRIMARY_COLOR },
                  { id: 'laugh', icon: 'sentiment-very-satisfied', color: colors.FILM_GOLD },
                  { id: 'star', icon: 'auto-awesome', color: colors.CYAN_ACCENT },
                  { id: 'party', icon: 'celebration', color: colors.PURPLE_ACCENT },
                ].map(reaction => (
                  <TouchableOpacity
                    key={reaction.id}
                    style={styles.reactionEmojiBtn}
                    onPress={() => sendReaction(reaction.icon)}
                    activeOpacity={0.65}
                  >
                    <MaterialIcons name={reaction.icon} size={20} color={reaction.color} />
                  </TouchableOpacity>
                ))}
              </View>

              {/* Party Chat Input Bar */}
              <View style={styles.partyBottomInputBar}>
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

                <TextInput
                  style={styles.partyTextInput}
                  placeholder="Say something to the room..."
                  placeholderTextColor={colors.SUB_TITLE_COLOR}
                  value={newMessage}
                  onChangeText={setNewMessage}
                  onSubmitEditing={sendMessage}
                />

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

      {/* ── ON-DEMAND NOTES & STORYBOARD BOTTOM SHEET MODAL (SOLO COMPANION) ── */}
      <Modal
        visible={isNotesSheetVisible}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() => setIsNotesSheetVisible(false)}
      >
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setIsNotesSheetVisible(false)}
          />

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.sheetContentContainer}
          >
            {/* Ambient Top Handle Bar */}
            <View style={styles.sheetHandleBarWrap}>
              <View style={styles.sheetHandleBar} />
            </View>

            {/* Sheet Header Row */}
            <View style={styles.sheetHeaderRow}>
              <View style={styles.sheetHeaderLeft}>
                <MaterialIcons name="bookmarks" size={18} color={colors.CYAN_ACCENT} />
                <Text style={styles.sheetHeaderTitle}>Cinema Storyboard & Notes</Text>
                <View style={styles.sheetBadgePill}>
                  <Text style={styles.sheetBadgeText}>{notes.length} saved</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.sheetCloseBtn}
                onPress={() => setIsNotesSheetVisible(false)}
                activeOpacity={0.75}
              >
                <MaterialIcons name="close" size={20} color={colors.SUB_TITLE_COLOR} />
              </TouchableOpacity>
            </View>

            {/* Quick Instant Bookmark Button */}
            <View style={styles.sheetQuickActionRow}>
              <TouchableOpacity
                style={styles.sheetInstantBookmarkBtn}
                onPress={() => addNote(`Saved milestone @ ${formatTime(currentTime)}`)}
                activeOpacity={0.8}
              >
                <MaterialIcons name="bookmark-add" size={15} color={colors.CYAN_ACCENT} />
                <Text style={styles.sheetInstantBookmarkText}>
                  + Instant Bookmark at {formatTime(currentTime)}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Notes & Milestones List */}
            <FlatList
              data={notes}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.sheetNotesList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={styles.sheetEmptyBox}>
                  <View style={styles.sheetEmptyIconCircle}>
                    <MaterialIcons name="bookmark-outline" size={32} color={colors.CYAN_ACCENT} />
                  </View>
                  <Text style={styles.sheetEmptyTitle}>No Notes Yet</Text>
                  <Text style={styles.sheetEmptySubtitle}>
                    Capture your personal thoughts, key quotes, or scene timestamps while watching.
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={styles.noteCard}>
                  <View style={styles.noteCardTopRow}>
                    <View style={styles.noteTimestampGroup}>
                      <TouchableOpacity
                        style={styles.jumpTimePill}
                        onPress={() => {
                          handleSeekToNote(item.seconds || 0);
                          setIsNotesSheetVisible(false);
                        }}
                        activeOpacity={0.8}
                      >
                        <MaterialIcons name="play-arrow" size={13} color={colors.CYAN_ACCENT} />
                        <Text style={styles.jumpTimeText}>{formatTime(item.seconds || 0)}</Text>
                      </TouchableOpacity>
                      <Text style={styles.noteActTag}>{item.tag || 'Scene Bookmark'}</Text>
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
                </View>
              )}
            />

            {/* Bottom Input Dock inside Sheet */}
            <View style={styles.sheetInputDock}>
              <TouchableOpacity
                style={styles.cameraSnapBtn}
                onPress={() => addNote(`Captured frame at ${formatTime(currentTime)}`)}
                activeOpacity={0.8}
              >
                <MaterialIcons name="photo-camera" size={20} color={colors.CYAN_ACCENT} />
                <View style={styles.cameraSnapDot} />
              </TouchableOpacity>

              <View style={styles.soloInputWrap}>
                <TextInput
                  style={styles.soloTextInput}
                  placeholder={`Add note at ${formatTime(currentTime)}...`}
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
        </View>
      </Modal>
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
  backBtnSquircle: {
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
  soloHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.35)',
  },
  soloHeaderBadgeText: {
    color: colors.CYAN_ACCENT,
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
  overlayTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  overlaySyncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(8, 8, 16, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.35)',
  },
  syncBufferDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.CYAN_ACCENT,
  },
  overlaySyncText: {
    color: colors.CYAN_ACCENT,
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  fullscreenBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(8, 8, 16, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoLoaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.BACKGROUND_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99,
    elevation: 20,
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

  // ── Solo Cinema & Storyboard ──
  soloOverviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 6,
    gap: 10,
  },
  soloOverviewLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  soloCinemaIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soloOverviewTextCol: {
    flex: 1,
  },
  soloOverviewTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  soloOverviewTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  soloCinemaTag: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.35)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  soloCinemaTagText: {
    color: colors.CYAN_ACCENT,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  soloOverviewSubtitle: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  storyboardCountText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '600',
  },
  emptyNotesIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  floatingReactionBubble: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.CYAN_ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
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
    backgroundColor: '#0C0C16',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
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

  // ── VIEW B: Multi-Participant Party Compact Bar ──
  compactAudienceBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.SURFACE_COLOR,
    borderBottomWidth: 1,
    borderBottomColor: colors.BORDER_SUBTLE,
  },
  audienceLeftStack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarStackRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  audienceSquircleAvatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.SURFACE_COLOR,
    position: 'relative',
  },
  audienceInitialsText: {
    color: colors.TITLE_COLOR,
    fontSize: 10,
    fontWeight: '700',
  },
  miniHostBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 11,
    height: 11,
    borderRadius: 3,
    backgroundColor: 'rgba(8, 8, 16, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniPresenceDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 6,
    height: 6,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: colors.SURFACE_COLOR,
  },
  extraCountAvatar: {
    backgroundColor: colors.SURFACE_ELEVATED,
    borderColor: colors.SURFACE_COLOR,
  },
  extraCountText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 9,
    fontWeight: '700',
  },
  liveAudienceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.ACCEPT_GREEN_GLOW,
    borderWidth: 1,
    borderColor: 'rgba(0, 200, 83, 0.25)',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 8,
  },
  liveAudienceText: {
    color: colors.ACCEPT_GREEN,
    fontSize: 10,
    fontWeight: '700',
  },
  quickInviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 122, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  quickInviteBtnText: {
    color: colors.PRIMARY_COLOR,
    fontSize: 11,
    fontWeight: '700',
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
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.SURFACE_ELEVATED,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
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

  // ── Solo Cinema Companion & Up Next Hub ──
  soloCompanionScroll: {
    flex: 1,
  },
  soloCompanionContent: {
    paddingTop: 12,
    paddingBottom: 40,
  },
  soloHeaderComponentsWrap: {
    paddingHorizontal: 16,
    gap: 14,
    marginBottom: 14,
  },
  soloInfoCard: {
    backgroundColor: '#0A0A12',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    gap: 10,
    overflow: 'hidden',
  },
  soloVideoTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
    letterSpacing: 0.2,
  },
  soloChannelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  soloChannelLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  soloChannelAvatar: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soloChannelName: {
    color: colors.TITLE_COLOR,
    fontSize: 13,
    fontWeight: '700',
    maxWidth: '75%',
  },
  soloSpecsBadge: {
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.28)',
  },
  soloSpecsText: {
    color: colors.CYAN_ACCENT,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  soloMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
  },
  soloMetricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  soloMetricText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '600',
  },
  soloMetricDivider: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.MUTED_COLOR,
  },
  soloAutoSaveText: {
    color: colors.ACCEPT_GREEN,
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Solo Quick Action Bar ──
  soloActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  soloActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: '#0C0C16',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  soloActionBtnActive: {
    borderColor: 'rgba(6, 182, 212, 0.4)',
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
  },
  soloActionBtnText: {
    color: colors.TITLE_COLOR,
    fontSize: 12,
    fontWeight: '700',
  },
  soloActionBtnTextActive: {
    color: colors.CYAN_ACCENT,
  },

  // ── Up Next & Recommended Cinema ──
  upNextSection: {
    gap: 12,
  },
  upNextHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  upNextTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  upNextHeading: {
    color: colors.TITLE_COLOR,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  upNextSubheading: {
    color: colors.MUTED_COLOR,
    fontSize: 11,
    fontWeight: '600',
  },
  upNextLoadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 24,
    backgroundColor: '#0A0A12',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  upNextLoadingText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    fontWeight: '600',
  },
  recommendedGridRow: {
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  recommendedGridCard: {
    width: '48.5%',
    backgroundColor: '#0A0A12',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    overflow: 'hidden',
  },
  recommendedGridCardGradient: {
    flex: 1,
  },
  recommendedGridThumbWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#07070E',
    position: 'relative',
    overflow: 'hidden',
  },
  recommendedGridThumbImg: {
    width: '100%',
    height: '100%',
  },
  recommendedThumbFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 38,
  },
  recommendedThumbFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recommendedDurationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  recommendedDurationText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
  recommendedGridInfo: {
    padding: 8,
    gap: 3,
  },
  recommendedGridTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  recommendedGridChannelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  recommendedGridChannel: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 10.5,
    fontWeight: '600',
    flexShrink: 1,
  },
  recommendedGridFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 3,
  },
  recommendedGridViews: {
    color: colors.MUTED_COLOR,
    fontSize: 10,
    fontWeight: '500',
    flexShrink: 1,
  },
  recommendedGridPlayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.PRIMARY_COLOR,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 2,
  },
  recommendedGridPlayText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
  loadMoreSuggestionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginVertical: 14,
    marginHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  loadMoreSuggestionsText: {
    color: colors.CYAN_ACCENT,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  endOfSuggestionsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
  },
  endOfSuggestionsText: {
    color: colors.MUTED_COLOR,
    fontSize: 11,
    fontWeight: '600',
  },
  upNextEmptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    gap: 6,
    marginHorizontal: 16,
  },
  upNextEmptyText: {
    color: colors.MUTED_COLOR,
    fontSize: 12,
    fontWeight: '600',
  },

  // ── On-Demand Notes Bottom Sheet Modal ──
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end',
  },
  sheetContentContainer: {
    backgroundColor: colors.SURFACE_COLOR,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    maxHeight: '75%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
  },
  sheetHandleBarWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  sheetHandleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.MUTED_COLOR,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  sheetHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sheetHeaderTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 15,
    fontWeight: '800',
  },
  sheetBadgePill: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.35)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  sheetBadgeText: {
    color: colors.CYAN_ACCENT,
    fontSize: 10,
    fontWeight: '700',
  },
  sheetCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.SURFACE_ELEVATED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetQuickActionRow: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  sheetInstantBookmarkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.28)',
    borderRadius: 10,
    paddingVertical: 8,
  },
  sheetInstantBookmarkText: {
    color: colors.CYAN_ACCENT,
    fontSize: 12,
    fontWeight: '700',
  },
  sheetNotesList: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  sheetEmptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  sheetEmptyIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 14,
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetEmptyTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '700',
  },
  sheetEmptySubtitle: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
    maxWidth: 260,
  },
  sheetInputDock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: colors.BORDER_SUBTLE,
    backgroundColor: colors.SURFACE_COLOR,
  },
});

export default StreamingScreen;
