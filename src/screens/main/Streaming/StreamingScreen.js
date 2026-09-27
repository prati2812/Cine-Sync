import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  StatusBar,
  useWindowDimensions,
  Share,
  BackHandler,
  ActivityIndicator,
  Image,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CineVideoPlayer from '../../../components/video/CineVideoPlayer';
import { searchCinemaMedia } from '../../../services/video/CinemaMediaSearchService';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import LinearGradient from 'react-native-linear-gradient';
import Orientation from 'react-native-orientation-locker';
import { auth, database } from '../../../config/firebase';
import { createSyncSession, saveLocalProgress, getLocalProgress } from '../../../services/video/CineSyncEngine';
import { showCineAlert } from '../../../components/CineAlert';
import { toggleWatchlist, isItemInWatchlist, subscribeWatchlist } from '../../../services/video/WatchlistService';
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
  const [activeThumbnail, setActiveThumbnail] = useState(initialThumbnail || null);
  const [activeChannelName, setActiveChannelName] = useState(initialChannelName || '');
  const [activeViews, setActiveViews] = useState(initialViews || '');
  const [activeDurationText, setActiveDurationText] = useState(initialDurationText || '');

  // Watch Later / Wishlist State for Solo Cinema
  const [watchlistItems, setWatchlistItems] = useState([]);

  useEffect(() => {
    const unsub = subscribeWatchlist(items => {
      setWatchlistItems(items);
    });
    return () => unsub();
  }, []);

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
  const [isVideoEnded, setIsVideoEnded] = useState(false);
  const [scrubberWidth, setScrubberWidth] = useState(0);
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

  const toggleFullscreen = useCallback(() => {
    if (isLandscape) {
      Orientation.lockToPortrait();
    } else {
      Orientation.lockToLandscapeLeft();
    }
  }, [isLandscape]);

  useEffect(() => {
    setIsInitialLoading(true);
    if (!streamUrl || !streamUrl.trim()) {
      showCineAlert({
        type: 'danger',
        icon: 'error-outline',
        title: 'Invalid Stream',
        message: 'No streaming URL provided for this cinema room.',
        confirmText: 'Return',
        onConfirm: () => navigation.goBack(),
      });
    }
    // Safety failsafe: Ensure initial loader never hangs indefinitely
    const fallbackTimer = setTimeout(() => {
      setIsInitialLoading(false);
    }, 4000);
    return () => clearTimeout(fallbackTimer);
  }, [streamUrl, navigation]);

  const [creatorLeft, setCreatorLeft] = useState(false);

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
  }, [currentRoomId, isLocalSolo, isCreator, streamUrl, isSoloRoom, participants.length]);

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

  const addNote = useCallback(async (customText = null) => {
    const user = auth().currentUser;
    if (!user) {
      showCineAlert({
        type: 'action',
        icon: 'lock',
        title: 'Sign In Required',
        message: 'Please sign in to save cinema notes.',
        confirmText: 'OK',
      });
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
          createdAt: database.ServerValue.TIMESTAMP,
          createdBy: user.uid,
          creator: {
            uid: user.uid,
            userName: user.email?.split('@')[0] || 'Me',
          },
          currentMediaUrl: streamUrl || '',
          duration: durationRef.current || 0,
          isLive: false,
          isPrivate: true,
          isStreaming: false,
          name: roomTitle,
          participants: {
            [user.uid]: {
              joinedAt: database.ServerValue.TIMESTAMP,
              role: 'creator',
              userName: user.email?.split('@')[0] || 'Me',
            },
          },
          pin: '',
          position: roundedSecs,
          sourceType: 'youtube',
          status: 'active',
          thumbnail: initialThumbnail || null,
        };

        const updates = {};
        updates[`rooms/${targetRoomId}`] = newRoomData;
        updates[`userRooms/${user.uid}/${targetRoomId}`] = {
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
      showCineAlert({
        type: 'danger',
        icon: 'cloud-off',
        title: 'Save Error',
        message: 'Unable to save note to cloud storyboard.',
        confirmText: 'OK',
      });
    }
  }, [currentRoomId, newNoteText, currentTime, streamUrl, initialThumbnail, roomTitle]);

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

  const handleSeekToNote = useCallback(seconds => {
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
  }, [duration, isCreator, isLocalSolo, playing, streamUrl, currentRoomId]);

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

  const handleSeek = useCallback(
    (targetSeconds) => {
      if (!playerRef.current) return;
      resetControlsTimeout();
      setIsVideoEnded(false);
      isSeekingRef.current = true;
      if (seekLockTimeoutRef.current) clearTimeout(seekLockTimeoutRef.current);
      seekLockTimeoutRef.current = setTimeout(() => {
        isSeekingRef.current = false;
      }, 800);

      const maxDur = durationRef.current || duration || 0;
      const bounded = Math.max(0, maxDur > 0 ? Math.min(maxDur, targetSeconds) : targetSeconds);
      playerRef.current.seekTo(bounded);
      currentTimeRef.current = bounded;
      setCurrentTime(bounded);
      const dur = durationRef.current || duration;
      if (isCreator && syncSessionRef.current && !isLocalSolo) {
        syncSessionRef.current.pushSeek(bounded, playing, dur);
      } else {
        saveLocalProgress(streamUrl || currentRoomId, bounded, dur, currentRoomId);
      }
    },
    [duration, isCreator, isLocalSolo, playing, streamUrl, currentRoomId, resetControlsTimeout]
  );

  const handleScrubberTouch = useCallback(
    (evt) => {
      const dur = durationRef.current || duration;
      if (!dur || dur <= 0 || scrubberWidth <= 0) return;
      const touchX = Math.max(0, Math.min(scrubberWidth, evt.nativeEvent.locationX));
      const ratio = touchX / scrubberWidth;
      const target = ratio * dur;
      handleSeek(target);
    },
    [duration, scrubberWidth, handleSeek]
  );

  const handleReplay = useCallback(() => {
    setIsVideoEnded(false);
    currentTimeRef.current = 0;
    setCurrentTime(0);
    playerRef.current?.seekTo(0);
    playerRef.current?.play();
    setPlaying(true);
    const dur = durationRef.current || duration;
    if (isCreator && syncSessionRef.current && !isLocalSolo) {
      syncSessionRef.current.pushSeek(0, true, dur);
      syncSessionRef.current.pushPlay(0, dur);
    } else {
      saveLocalProgress(streamUrl || currentRoomId, 0, dur, currentRoomId);
    }
    resetControlsTimeout();
  }, [duration, isCreator, isLocalSolo, streamUrl, currentRoomId, resetControlsTimeout]);

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
  const shortRoomId = (currentRoomId ? currentRoomId.replace('room_', '').replace('solo_', '') : 'SOLO').slice(-4);
  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  // Up Next & Recommended Cinema for Solo Mode
  useEffect(() => {
    if (!isSoloRoom) return;
    let isMounted = true;
    setIsLoadingRecommendations(true);

    const titleToUse = soloSelectedTitle || initialRoomName || roomData?.name || '';
    const cleanWords = titleToUse
      .replace(/[()[\]{}\-–—|:;,.]/g, ' ')
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
    setActiveThumbnail(item.thumbnail || null);
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

  const isCurrentInWatchlist = useMemo(() => {
    return isItemInWatchlist(streamUrl || roomTitle, watchlistItems);
  }, [streamUrl, roomTitle, watchlistItems]);

  const handleToggleWatchlist = useCallback(async () => {
    if (!streamUrl && !roomTitle) return;

    const itemToSave = {
      id: streamUrl || `solo_${Date.now()}`,
      mediaKey: streamUrl,
      streamUrl: streamUrl,
      title: roomTitle,
      thumbnail: activeThumbnail || initialThumbnail || roomData?.thumbnail || null,
      channelName: displayChannelName,
      duration: activeDurationText || initialDurationText || '',
      views: displayViews || '',
    };

    const isNowSaved = await toggleWatchlist(itemToSave);

    showCineAlert({
      presentationStyle: 'bottomSheet',
      type: isNowSaved ? 'success' : 'info',
      icon: isNowSaved ? 'playlist-add-check' : 'remove-circle-outline',
      title: isNowSaved ? 'Saved to Watch Later' : 'Removed from Watch Later',
      message: isNowSaved
        ? `"${roomTitle}" has been added to your Watch Later list.`
        : `"${roomTitle}" was removed from your Watch Later list.`,
      confirmText: 'OK',
    });
  }, [
    streamUrl,
    roomTitle,
    activeThumbnail,
    initialThumbnail,
    roomData?.thumbnail,
    displayChannelName,
    activeDurationText,
    initialDurationText,
    displayViews,
  ]);

  const handleToggleRecommendedWatchlist = useCallback(async (item) => {
    if (!item) return;
    const isNowSaved = await toggleWatchlist({
      id: item.mediaUrl || item.id,
      mediaKey: item.mediaUrl || item.id,
      streamUrl: item.mediaUrl,
      title: item.title,
      thumbnail: item.thumbnail,
      channelName: item.channelName,
      duration: item.duration,
      views: item.views,
    });

    showCineAlert({
      presentationStyle: 'bottomSheet',
      type: isNowSaved ? 'success' : 'info',
      icon: isNowSaved ? 'playlist-add-check' : 'remove-circle-outline',
      title: isNowSaved ? 'Saved to Watch Later' : 'Removed from Watch Later',
      message: isNowSaved
        ? `"${item.title}" added to your Watch Later list.`
        : `"${item.title}" removed from your Watch Later list.`,
      confirmText: 'OK',
    });
  }, []);

  const handleShareScreening = useCallback(async () => {
    try {
      if (isSoloRoom || isLocalSolo) {
        await Share.share({
          title: `Cine-Sync: ${roomTitle}`,
          message: `Streaming "${roomTitle}" on Cine-Sync!\n${streamUrl}\nStream anytime with 100% native cinema audio & video!`,
        });
        return;
      }
      const cleanCode = (currentRoomId || '').replace('room_', '');
      const pinText = roomData?.isPrivate && roomData?.pin ? `\nAccess PIN: ${roomData.pin}` : '';
      await Share.share({
        title: `Cine-Sync: ${roomTitle}`,
        message: `Join my Cine-Sync Watch Party "${roomTitle}" in Live Sync!\nRoom Code: #${cleanCode}${pinText}\nLaunch Cine-Sync to watch together!`,
      });
    } catch (e) {
      console.log('Error sharing screening:', e);
    }
  }, [isSoloRoom, isLocalSolo, roomTitle, streamUrl, currentRoomId, roomData]);

  // ── Solo Screening: 2-Column Grid Header ──
  const renderSoloListHeader = useCallback(() => {
    return (
      <View style={styles.soloHeaderWrapper}>
        {/* ── 1. HERO VIDEO INFO ── */}
        <View style={styles.heroVideoInfo}>
          {/* Movie Title */}
          <Text style={styles.heroMovieTitle} numberOfLines={2}>
            {roomTitle}
          </Text>

          {/* Cinema Badge Row (4K Ultra HD, Auto-Saved) */}
          <View style={styles.cinemaBadgeRow}>
            {/* 4K Chip */}
            <View style={styles.chip4K}>
              <Text style={styles.chip4KText}>4K Ultra HD</Text>
            </View>

            {/* Auto-Saved Badge */}
            <View style={styles.chipAutoSaved}>
              <MaterialIcons name="done" size={13} color={colors.ACCEPT_GREEN} />
              <Text style={styles.chipAutoSavedText}>Auto-Saved</Text>
            </View>
          </View>

          {/* Channel / Source Details */}
          <View style={styles.channelDetailsRow}>
            <View style={styles.channelLeft}>
              <View style={styles.channelAvatarSquircle}>
                <Text style={styles.channelAvatarInitials}>
                  {getInitials(displayChannelName)}
                </Text>
              </View>
              <View style={styles.channelMetaCol}>
                <View style={styles.channelNameRow}>
                  <Text style={styles.channelNameText} numberOfLines={1}>
                    {displayChannelName}
                  </Text>
                  <MaterialIcons name="verified" size={13} color={colors.CYAN_ACCENT} />
                </View>
                <Text style={styles.channelSubtext} numberOfLines={1}>
                  {displayViews && displayViews !== 'Cinema Stream'
                    ? `${displayViews} • 4K Remastered`
                    : 'SyncLabs Cinema Archive • 4K Remastered'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── 2. QUICK ACTION BAR (3-Column Equal Grid) ── */}
        <View style={styles.quickActionBar}>
          {/* Button 1: Watch Later / Wishlist */}
          <TouchableOpacity
            style={[
              styles.quickActionBtn,
              isCurrentInWatchlist && styles.quickActionBtnActive,
            ]}
            onPress={handleToggleWatchlist}
            activeOpacity={0.8}
          >
            <MaterialIcons
              name={isCurrentInWatchlist ? 'playlist-add-check' : 'watch-later'}
              size={20}
              color={isCurrentInWatchlist ? colors.ACCEPT_GREEN : colors.FILM_GOLD}
            />
            <Text
              style={[
                styles.quickActionLabel,
                isCurrentInWatchlist && { color: colors.ACCEPT_GREEN, fontWeight: '700' },
              ]}
            >
              {isCurrentInWatchlist ? 'In Watchlist' : 'Watch Later'}
            </Text>
          </TouchableOpacity>

          {/* Button 2: Share */}
          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={handleShareScreening}
            activeOpacity={0.8}
          >
            <MaterialIcons name="share" size={20} color={colors.FILM_GOLD} />
            <Text style={styles.quickActionLabel}>Share</Text>
          </TouchableOpacity>

          {/* Button 3: Theater */}
          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={toggleFullscreen}
            activeOpacity={0.8}
          >
            <MaterialIcons name="desktop-windows" size={20} color={colors.CYAN_ACCENT} />
            <Text style={styles.quickActionLabel}>Theater</Text>
          </TouchableOpacity>
        </View>

        {/* ── 3. MORE LIKE THIS SECTION HEADER ── */}
        <View style={styles.recommendedGridHeader}>
          <View style={styles.recommendedHeaderLeft}>
            <MaterialIcons name="auto-awesome" size={15} color={colors.CYAN_ACCENT} />
            <Text style={styles.recommendedHeaderTitle}>MORE LIKE THIS</Text>
          </View>
          {recommendedMedia.length > 0 && (
            <View style={styles.recommendedBadgeCount}>
              <Text style={styles.recommendedBadgeCountText}>{recommendedMedia.length} STREAMS</Text>
            </View>
          )}
        </View>
      </View>
    );
  }, [
    roomTitle,
    displayChannelName,
    displayViews,
    isCurrentInWatchlist,
    handleToggleWatchlist,
    handleShareScreening,
    toggleFullscreen,
    recommendedMedia.length,
  ]);

  // ── Solo Screening: 2-Column Faded Black Card ──
  const renderRecommendedGridCard = useCallback(
    ({ item }) => {
      const cardWidth = Math.floor((width - 42) / 2);
      const isRecSaved = isItemInWatchlist(item.mediaUrl || item.id, watchlistItems);
      return (
        <TouchableOpacity
          key={item.id}
          style={[styles.recommendedGridCard, { width: cardWidth }]}
          onPress={() => handleSelectRecommendedMedia(item)}
          activeOpacity={0.84}
        >
          <LinearGradient
            colors={[colors.SURFACE_ELEVATED, colors.BACKGROUND_COLOR, '#06060A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.recommendedCardGradient}
          >
            {/* 16:9 Squircle Thumbnail Box */}
            <View style={styles.recommendedThumbBox}>
              {item.thumbnail ? (
                <Image
                  source={{ uri: item.thumbnail }}
                  style={styles.recommendedThumbImg}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.recommendedThumbFallback}>
                  <MaterialIcons name="movie" size={24} color={colors.MUTED_COLOR} />
                </View>
              )}

              {/* Bottom Thumbnail Gradient Fade into Black Card */}
              <LinearGradient
                colors={['transparent', 'rgba(10, 10, 18, 0.45)', colors.BACKGROUND_COLOR]}
                locations={[0.2, 0.7, 1]}
                style={styles.recommendedThumbFade}
                pointerEvents="none"
              />

              {/* Quick Watch Later Action Button */}
              <TouchableOpacity
                style={[
                  styles.recWatchLaterBtn,
                  isRecSaved && styles.recWatchLaterBtnActive,
                ]}
                onPress={() => handleToggleRecommendedWatchlist(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <MaterialIcons
                  name={isRecSaved ? 'playlist-add-check' : 'watch-later'}
                  size={14}
                  color={isRecSaved ? colors.ACCEPT_GREEN : '#FFFFFF'}
                />
              </TouchableOpacity>

              {item.duration ? (
                <View style={styles.recommendedDurationBadge}>
                  <Text style={styles.recommendedDurationText}>{item.duration}</Text>
                </View>
              ) : null}
            </View>

            {/* Info Container */}
            <View style={styles.recommendedCardInfo}>
              <Text style={styles.recommendedCardTitle} numberOfLines={2}>
                {item.title}
              </Text>

              <View style={styles.recommendedChannelRow}>
                <Text style={styles.recommendedChannelText} numberOfLines={1}>
                  {item.channelName || 'SyncLabs Cinema'}
                </Text>
                <MaterialIcons name="verified" size={11} color={colors.CYAN_ACCENT} />
              </View>

              <View style={styles.recommendedFooterRow}>
                {item.views ? (
                  <Text style={styles.recommendedViewsText} numberOfLines={1}>
                    {item.views}
                  </Text>
                ) : null}
                <View style={styles.recommendedPlayPill}>
                  <MaterialIcons name="play-arrow" size={11} color="#FFF" />
                  <Text style={styles.recommendedPlayText}>Play</Text>
                </View>
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      );
    },
    [width, handleSelectRecommendedMedia, handleToggleRecommendedWatchlist, watchlistItems]
  );

  // ── Solo Screening: Infinite Pagination Footer ──
  const renderSoloListFooter = useCallback(() => {
    if (isLoadingMoreRecommendations) {
      return (
        <View style={styles.gridFooterLoader}>
          <ActivityIndicator size="small" color={colors.CYAN_ACCENT} />
          <Text style={styles.gridFooterLoadingText}>Discovering more cinema streams...</Text>
        </View>
      );
    }
    if (!recommendedContinuationToken && recommendedMedia.length > 0) {
      return (
        <View style={styles.gridEndNotice}>
          <View style={styles.gridEndLine} />
          <Text style={styles.gridEndText}>END OF RECOMMENDATIONS</Text>
          <View style={styles.gridEndLine} />
        </View>
      );
    }
    return <View style={styles.gridBottomSpacer} />;
  }, [isLoadingMoreRecommendations, recommendedContinuationToken, recommendedMedia.length]);

  // ── Solo Screening: Empty State ──
  const renderSoloListEmpty = useCallback(() => {
    if (isLoadingRecommendations) {
      return (
        <View style={styles.gridEmptyBox}>
          <ActivityIndicator size="small" color={colors.CYAN_ACCENT} />
          <Text style={styles.gridEmptyLoadingText}>Finding related cinema streams...</Text>
        </View>
      );
    }
    return (
      <View style={styles.gridEmptyBox}>
        <MaterialIcons name="theaters" size={32} color={colors.MUTED_COLOR} />
        <Text style={styles.gridEmptyText}>No matching cinema streams found</Text>
      </View>
    );
  }, [isLoadingRecommendations]);

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

      {/* ── TOP HEADER BAR (Stitch AI Architecture) ── */}
      {!isLandscape && (
        <View style={[styles.topHeader, { paddingTop: safeTopPadding }]}>
          {/* Back Button Squircle */}
          <TouchableOpacity
            onPress={handleGoBack}
            style={styles.backBtnSquircle}
            activeOpacity={0.75}
            accessibilityLabel="Go Back"
          >
            <MaterialIcons name="arrow-back-ios-new" size={16} color={colors.TITLE_COLOR} />
          </TouchableOpacity>

          {/* Center Title & Room Meta */}
          <View style={styles.headerCenterCol}>
            <Text style={styles.headerTitleText} numberOfLines={1}>
              {roomTitle}
            </Text>
            <Text style={styles.headerSubtitleText} numberOfLines={1}>
              {isSoloRoom
                ? 'Cinema Screening'
                : (currentRoomId ? `Live Sync Room • #${shortRoomId}` : 'Live Cinema Sync')}
            </Text>
          </View>

          {/* Right Live Status Squircle Badge (Only for Live Watch Party) or Balanced Spacer */}
          {!isSoloRoom ? (
            <View style={styles.liveStreamBadge}>
              <Animated.View style={[styles.liveDotSolid, { opacity: livePulseAnim }]} />
              <Text style={styles.liveStreamText}>LIVE</Text>
            </View>
          ) : (
            <View style={styles.headerRightSpacer} />
          )}
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
          onEnd={() => {
            setIsVideoEnded(true);
            setPlaying(false);
            setShowControls(true);
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
              {!isSoloRoom ? (
                <View style={styles.overlaySyncPill}>
                  <Animated.View
                    style={[
                      styles.syncBufferDot,
                      {
                        backgroundColor: syncStateInfo.isSynced
                          ? colors.ACCEPT_GREEN
                          : colors.FILM_GOLD,
                        opacity: syncPulseAnim,
                      },
                    ]}
                  />
                  <Text style={styles.overlaySyncText}>
                    {syncStateInfo.isSynced
                      ? 'Live Synced'
                      : 'Re-syncing'}
                  </Text>
                </View>
              ) : (
                <View style={styles.overlayTopBarSpacer} />
              )}

              <TouchableOpacity
                style={styles.theaterExpandBtn}
                onPress={toggleFullscreen}
                activeOpacity={0.8}
                accessibilityLabel="Theater Mode"
              >
                <MaterialIcons
                  name={isLandscape ? 'fullscreen-exit' : 'fullscreen'}
                  size={18}
                  color="#FFF"
                />
              </TouchableOpacity>
            </View>

            {/* Center Controls (Host & Solo Only; Viewer controls hidden) */}
            {isSoloRoom || isCreator ? (
              <View style={styles.centerControlsRow}>
                {/* -10s */}
                <TouchableOpacity
                  style={styles.seekStepBtn}
                  onPress={handleRewind10}
                  activeOpacity={0.8}
                  accessibilityLabel="Rewind 10 seconds"
                >
                  <MaterialIcons name="replay-10" size={22} color="#FFF" />
                </TouchableOpacity>

                {/* Play / Pause / Replay with Glowing Squircle */}
                {isVideoEnded ? (
                  <TouchableOpacity
                    style={styles.playPauseGlowBtn}
                    onPress={handleReplay}
                    activeOpacity={0.85}
                    accessibilityLabel="Replay Video"
                  >
                    <LinearGradient
                      colors={[colors.PRIMARY_COLOR, colors.CYAN_ACCENT]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.playPauseGradient}
                    >
                      <MaterialIcons name="replay" size={28} color="#FFF" />
                    </LinearGradient>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.playPauseGlowBtn}
                    onPress={togglePlayPause}
                    activeOpacity={0.85}
                    accessibilityLabel={playing ? 'Pause' : 'Play'}
                  >
                    <LinearGradient
                      colors={[colors.PRIMARY_COLOR, colors.CYAN_ACCENT]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.playPauseGradient}
                    >
                      <MaterialIcons
                        name={playing ? 'pause' : 'play-arrow'}
                        size={30}
                        color="#FFF"
                        style={{ marginLeft: playing ? 0 : 2 }}
                      />
                    </LinearGradient>
                  </TouchableOpacity>
                )}

                {/* +10s */}
                <TouchableOpacity
                  style={styles.seekStepBtn}
                  onPress={handleForward10}
                  activeOpacity={0.8}
                  accessibilityLabel="Forward 10 seconds"
                >
                  <MaterialIcons name="forward-10" size={22} color="#FFF" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.centerControlsRow}>
                <View style={styles.centerViewerSyncedPill}>
                  <MaterialIcons name="sync" size={14} color={colors.CYAN_ACCENT} />
                  <Text style={styles.centerViewerSyncedText}>Controlled by Host • Synced</Text>
                </View>
              </View>
            )}

            {/* Bottom Scrubber & Time Counter (Interactive Touch Scrubber) */}
            <View style={styles.bottomScrubberRow}>
              <View
                style={styles.scrubberTouchArea}
                onLayout={e => {
                  const w = e.nativeEvent.layout.width;
                  if (w > 0) setScrubberWidth(w);
                }}
                onStartShouldSetResponder={() => isSoloRoom || isCreator}
                onMoveShouldSetResponder={() => isSoloRoom || isCreator}
                onResponderGrant={handleScrubberTouch}
                onResponderMove={handleScrubberTouch}
              >
                <View style={styles.scrubberTrack}>
                  <View style={[styles.scrubberFill, { width: `${progressPercent}%` }]} />
                </View>

                {/* Glowing Squircle Thumb Indicator */}
                <View
                  style={[
                    styles.scrubberThumb,
                    { left: `${progressPercent}%` },
                  ]}
                />
              </View>

              {/* High-Contrast Time Counter */}
              <Text style={styles.highContrastTimeCounter}>
                {duration > 0
                  ? `${formatTime(currentTime)} / ${formatTime(duration)}`
                  : activeDurationText
                  ? `${formatTime(currentTime)} / ${activeDurationText}`
                  : `${formatTime(currentTime)} • LIVE`}
              </Text>
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
            /* CINEMA SCREENING COMPANION (2-Column Infinite Grid)           */
            /* ============================================================== */
            <FlatList
              data={recommendedMedia}
              keyExtractor={(item, index) => item.id || `rec_${index}`}
              numColumns={2}
              columnWrapperStyle={styles.recommendedGridRow}
              contentContainerStyle={styles.soloGridScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              onEndReached={handleLoadMoreRecommendations}
              onEndReachedThreshold={0.5}
              renderItem={renderRecommendedGridCard}
              ListHeaderComponent={renderSoloListHeader}
              ListFooterComponent={renderSoloListFooter}
              ListEmptyComponent={renderSoloListEmpty}
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
                      <Text style={styles.privateVaultText}>Cinema Storyboard</Text>
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
                    <Text style={styles.emptyNotesTitle}>Cinema Notes & Bookmarks</Text>
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
                    Capture your thoughts, key quotes, or scene timestamps while watching.
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
  headerCenterCol: {
    flex: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  backBtnSquircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_ELEVATED,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  headerTitleText: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  headerSubtitleText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 2,
  },
  headerRightSpacer: {
    width: 40,
  },
  liveStreamBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  liveDotSolid: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.LIVE_RED,
  },
  liveStreamText: {
    color: colors.LIVE_RED,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
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
  overlayTopBarSpacer: {
    flex: 1,
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
  theaterExpandBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
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
  centerViewerSyncedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.35)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
  },
  centerViewerSyncedText: {
    color: colors.CYAN_ACCENT,
    fontSize: 12,
    fontWeight: '700',
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
    shadowColor: colors.CYAN_ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 16,
    elevation: 8,
  },
  playPauseGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Bottom Scrubber Bar & Timers
  bottomScrubberRow: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    paddingTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(8, 8, 16, 0.8)',
  },
  scrubberTouchArea: {
    flex: 1,
    height: 32,
    justifyContent: 'center',
  },
  scrubberTrack: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  scrubberFill: {
    height: '100%',
    backgroundColor: colors.CYAN_ACCENT,
  },
  scrubberThumb: {
    position: 'absolute',
    top: 9,
    width: 14,
    height: 14,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: colors.CYAN_ACCENT,
    shadowColor: colors.CYAN_ACCENT,
    shadowRadius: 8,
    shadowOpacity: 0.8,
    elevation: 6,
    marginLeft: -7,
  },
  highContrastTimeCounter: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.9)',
    letterSpacing: 0.4,
    flexShrink: 0,
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

  // ── Cinema Screening Companion & 2-Column Infinite Grid Hub ──
  soloGridScrollContent: {
    paddingBottom: 40,
  },
  soloHeaderWrapper: {
    gap: 14,
    marginBottom: 12,
  },
  heroVideoInfo: {
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 10,
  },
  heroMovieTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    letterSpacing: 0.2,
  },
  cinemaBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  chip4K: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.4)',
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip4KText: {
    color: colors.CYAN_ACCENT,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  chipAutoSaved: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 200, 83, 0.3)',
    backgroundColor: 'rgba(0, 200, 83, 0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chipAutoSavedText: {
    color: colors.ACCEPT_GREEN,
    fontSize: 11,
    fontWeight: '600',
  },
  channelDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  channelLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  channelAvatarSquircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelAvatarInitials: {
    color: colors.CYAN_ACCENT,
    fontSize: 12,
    fontWeight: '700',
  },
  channelMetaCol: {
    flex: 1,
    gap: 2,
  },
  channelNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  channelNameText: {
    color: colors.TITLE_COLOR,
    fontSize: 13,
    fontWeight: '600',
  },
  channelSubtext: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
  },

  // ── Quick Action Bar (3-Column Equal Grid) ──
  quickActionBar: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 10,
  },
  quickActionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    gap: 6,
  },
  quickActionBtnActive: {
    borderColor: 'rgba(0, 200, 83, 0.40)',
    backgroundColor: 'rgba(0, 200, 83, 0.08)',
  },
  quickActionLabel: {
    color: colors.TITLE_COLOR,
    fontSize: 11,
    fontWeight: '500',
  },

  // Quick Watch Later in Recommendation Thumbnail
  recWatchLaterBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'rgba(15, 15, 26, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  recWatchLaterBtnActive: {
    backgroundColor: 'rgba(0, 200, 83, 0.22)',
    borderColor: colors.ACCEPT_GREEN,
  },

  // ── More Like This Section Header ──
  recommendedGridHeader: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 2,
  },
  recommendedHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recommendedHeaderTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  recommendedBadgeCount: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  recommendedBadgeCountText: {
    color: colors.CYAN_ACCENT,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },

  // ── Faded Black Recommended Grid Card (Matching Design Standard) ──
  recommendedGridRow: {
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  recommendedGridCard: {
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    overflow: 'hidden',
  },
  recommendedCardGradient: {
    flex: 1,
  },
  recommendedThumbBox: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.SURFACE_ELEVATED,
    position: 'relative',
    overflow: 'hidden',
  },
  recommendedThumbImg: {
    width: '100%',
    height: '100%',
  },
  recommendedThumbFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recommendedThumbFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 34,
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
    fontSize: 9.5,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  recommendedCardInfo: {
    padding: 8,
    gap: 3,
    backgroundColor: 'transparent',
  },
  recommendedCardTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  recommendedChannelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  recommendedChannelText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 10.5,
    fontWeight: '600',
    flexShrink: 1,
  },
  recommendedFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  recommendedViewsText: {
    color: colors.MUTED_COLOR,
    fontSize: 10,
    fontWeight: '500',
    flexShrink: 1,
  },
  recommendedPlayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(6, 182, 212, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: 'rgba(6, 182, 212, 0.4)',
  },
  recommendedPlayText: {
    color: colors.CYAN_ACCENT,
    fontSize: 9.5,
    fontWeight: '700',
  },

  // ── Grid Footer & Empty States ──
  gridFooterLoader: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  gridFooterLoadingText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '500',
  },
  gridEndNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 24,
    gap: 12,
  },
  gridEndLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.BORDER_SUBTLE,
  },
  gridEndText: {
    color: colors.MUTED_COLOR,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  gridBottomSpacer: {
    height: 28,
  },
  gridEmptyBox: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  gridEmptyLoadingText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
  },
  gridEmptyText: {
    color: colors.MUTED_COLOR,
    fontSize: 12,
  },
  browseAllText: {
    color: colors.CYAN_ACCENT,
    fontSize: 12,
    fontWeight: '600',
  },

  // ── Saved Milestones Preview ──
  storyboardPreviewSection: {
    paddingHorizontal: 16,
    marginTop: 6,
    gap: 8,
  },
  storyboardPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  milestoneMiniCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  milestoneMiniLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  milestoneTimePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  milestoneTimeText: {
    color: colors.CYAN_ACCENT,
    fontSize: 10.5,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  milestoneMiniText: {
    color: colors.TITLE_COLOR,
    fontSize: 11.5,
    flex: 1,
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
