import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ImageBackground,
  ActivityIndicator,
  StatusBar,
  Platform,
  Alert,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSpring,
} from 'react-native-reanimated';
import colors from '../../../theme/Colors';
import { auth, database } from '../../../config/firebase';
import {
  getAllContinueWatching,
  removeContinueWatchingItem,
} from '../../../services/video/CineSyncEngine';
import {
  getWatchlist,
  removeFromWatchlist,
  subscribeWatchlist,
} from '../../../services/video/WatchlistService';
import { getYouTubeThumbnailDetails } from '../../../functions';
import JoinByCodeModal from '../../../components/JoinByCodeModal';
import PrivateRoomPinModal from '../../../components/PrivateRoomPinModal';
import CinemaSearchModal from '../../../components/CinemaSearchModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

const FILTER_TABS = [
  { key: 'all', label: 'All Rooms', icon: 'apps' },
  { key: 'live', label: 'Live Now', icon: 'stream', isLive: true },
  { key: 'created', label: 'My Rooms', icon: 'movie-creation' },
  { key: 'invited', label: 'Invited', icon: 'group' },
  { key: 'scheduled', label: 'Scheduled', icon: 'event' },
];

// ──────────────────────────────────────────────────────────────
//  Room Thumbnail Component with YouTube & Fallback Support
// ──────────────────────────────────────────────────────────────
const RoomCardThumbnail = ({ streamUrl, thumbnail, isCreator }) => {
  const thumbDetails = getYouTubeThumbnailDetails(streamUrl);
  const maxresUrl = thumbDetails?.maxresUrl || null;
  const fallbackUri = thumbDetails?.fallbackUrl || null;
  const initialUri =
    thumbnail && typeof thumbnail === 'string' && thumbnail.startsWith('http')
      ? thumbnail
      : maxresUrl;

  const [imgUri, setImgUri] = useState(initialUri);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const nextUri =
      thumbnail && typeof thumbnail === 'string' && thumbnail.startsWith('http')
        ? thumbnail
        : maxresUrl;
    setImgUri(nextUri);
    setHasError(false);
  }, [maxresUrl, thumbnail]);

  if (imgUri && !hasError) {
    return (
      <View style={styles.roomThumbnailWrap}>
        <Image
          source={{ uri: imgUri }}
          style={styles.roomThumbnailImage}
          resizeMode="cover"
          onError={() => {
            if (fallbackUri && imgUri !== fallbackUri) {
              setImgUri(fallbackUri);
            } else {
              setHasError(true);
            }
          }}
        />
        <View style={styles.roomThumbnailOverlay}>
          <Ionicons name="play" size={10} color="#FFF" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.roomThumbnailWrap}>
      <LinearGradient
        colors={isCreator ? ['#F59E0B', '#D97706'] : ['#2563EB', '#7C3AED']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.roomThumbnailGradient}
      >
        <Ionicons name="film" size={20} color="#FFF" />
      </LinearGradient>
    </View>
  );
};

// ──────────────────────────────────────────────────────────────
//  Hero Room Banner with YouTube & Fallback Support
// ──────────────────────────────────────────────────────────────
const HeroRoomBanner = ({ featuredRoom, content }) => {
  const thumbDetails = getYouTubeThumbnailDetails(featuredRoom?.streamUrl);
  const maxresUrl = thumbDetails?.maxresUrl || null;
  const fallbackUri = thumbDetails?.fallbackUrl || null;
  const thumbnail = featuredRoom?.thumbnail;
  const initialUri =
    thumbnail && typeof thumbnail === 'string' && thumbnail.startsWith('http')
      ? thumbnail
      : maxresUrl;

  const [imgUri, setImgUri] = useState(initialUri);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const nextUri =
      thumbnail && typeof thumbnail === 'string' && thumbnail.startsWith('http')
        ? thumbnail
        : maxresUrl;
    setImgUri(nextUri);
    setHasError(false);
  }, [maxresUrl, thumbnail]);

  const hasImage = imgUri && !hasError;

  return (
    <View style={styles.heroWrap}>
      {hasImage ? (
        <ImageBackground
          source={{ uri: imgUri }}
          style={styles.heroBackground}
          imageStyle={styles.heroBackgroundImage}
          onError={() => {
            if (fallbackUri && imgUri !== fallbackUri) {
              setImgUri(fallbackUri);
            } else {
              setHasError(true);
            }
          }}
        >
          {content}
        </ImageBackground>
      ) : (
        <View style={[styles.heroBackground, styles.heroFallbackBg]}>
          {content}
        </View>
      )}
    </View>
  );
};

// ──────────────────────────────────────────────────────────────
//  Room Card Component (Faded Black Card with Swipe-to-Delete)
// ──────────────────────────────────────────────────────────────
const RoomCard = ({ item, isCreator, onPress, onDelete, index }) => {
  const renderRightActions = () => (
    <TouchableOpacity
      style={[
        styles.swipeDeleteBtn,
        { display: isCreator ? 'flex' : 'none' },
      ]}
      onPress={onDelete}
    >
      <LinearGradient
        colors={[colors.DELETE_RED_COLOR, '#CC2D26']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.swipeDeleteGradient}
      >
        <MaterialIcons name="delete-outline" size={22} color="#FFF" />
        <Text style={styles.swipeDeleteText}>Delete</Text>
      </LinearGradient>
    </TouchableOpacity>
  );

  const isSolo = item?.isSolo === true || (!item?.participants || item?.participants?.length === 0);
  const participantCount = item?.participants?.length || 0;
  const isLive = item?.isStreaming === true;

  return (
    <Swipeable renderRightActions={renderRightActions}>
      <TouchableOpacity activeOpacity={0.85} style={styles.roomCard} onPress={onPress}>
        {/* Left accent strip */}
        <LinearGradient
          colors={
            isSolo
              ? [colors.CYAN_ACCENT, colors.PURPLE_ACCENT]
              : isLive
              ? [colors.LIVE_RED, '#DC2626']
              : isCreator
              ? [colors.FILM_GOLD, '#D97706']
              : [colors.GRADIENT_START, colors.GRADIENT_END]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.roomAccentStrip}
        />

        <View style={styles.roomCardInner}>
          {/* Thumbnail */}
          <RoomCardThumbnail
            streamUrl={item?.streamUrl}
            thumbnail={item?.thumbnail}
            isCreator={isCreator}
          />

          {/* Info */}
          <View style={styles.roomInfo}>
            <View style={styles.roomTitleRow}>
              <Text style={styles.roomName} numberOfLines={1}>
                {item.name}
              </Text>
              {item.isPrivate && (
                <MaterialIcons name="lock" size={12} color={colors.FILM_GOLD} />
              )}
            </View>

            <View style={styles.roomMeta}>
              {isSolo ? (
                <>
                  <MaterialIcons name="person" size={13} color={colors.CYAN_ACCENT} />
                  <Text style={[styles.roomCreator, styles.roomSoloCreatorText]} numberOfLines={1}>
                    {isCreator ? 'Cinema Screening • You' : 'Solo Room'}
                  </Text>
                </>
              ) : (
                <>
                  <MaterialIcons name="person" size={13} color={colors.SUB_TITLE_COLOR} />
                  <Text style={styles.roomCreator} numberOfLines={1}>
                    {isCreator ? 'Created by you' : `by ${item.creator?.userName || 'Host'}`}
                  </Text>
                </>
              )}
            </View>

            {isSolo ? (
              <View style={styles.roomSoloRow}>
                <View style={styles.soloActiveDot} />
                <Text style={styles.roomSoloText}>Solo Mode • Progress Saved</Text>
              </View>
            ) : (
              <View style={styles.roomParticipantRow}>
                {isLive ? (
                  <View style={styles.liveRoomBadge}>
                    <View style={styles.liveDotMini} />
                    <Text style={styles.liveRoomText}>LIVE NOW</Text>
                  </View>
                ) : (
                  <View style={styles.viewerRow}>
                    <MaterialIcons name="group" size={12} color="#38BDF8" />
                    <Text style={styles.roomParticipantText}>
                      {participantCount} {participantCount === 1 ? 'viewer' : 'viewers'}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Right side decorations */}
          <View style={styles.roomCardRight}>
            {isSolo ? (
              <View style={styles.soloBadge}>
                <MaterialIcons name="person" size={10} color={colors.CYAN_ACCENT} />
                <Text style={styles.soloBadgeText}>Solo</Text>
              </View>
            ) : isCreator ? (
              <View style={styles.creatorBadge}>
                <Ionicons name="star" size={10} color="#FBBF24" />
                <Text style={styles.creatorBadgeText}>Host</Text>
              </View>
            ) : null}
            <MaterialIcons name="chevron-right" size={20} color="#64748B" />
          </View>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
};

// ──────────────────────────────────────────────────────────────
//  Library Screen (My Watch Parties & Rooms + Continue Watching)
// ──────────────────────────────────────────────────────────────
const LibraryScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const currentUser = auth().currentUser;

  // States
  const [rooms, setRooms] = useState([]);
  const [continueList, setContinueList] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [filterType, setFilterType] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [isLoading, setIsLoading] = useState(true);

  // Subscribe to Watch Later real-time updates
  useEffect(() => {
    const unsub = subscribeWatchlist(items => {
      setWatchlist(items);
    });
    return () => unsub();
  }, []);

  // Modals
  const [isJoinModalVisible, setIsJoinModalVisible] = useState(false);
  const [isSearchModalVisible, setIsSearchModalVisible] = useState(false);
  const [isPinModalVisible, setIsPinModalVisible] = useState(false);
  const [selectedPrivateRoom, setSelectedPrivateRoom] = useState(null);

  // Safe padding
  const safeTopPadding =
    Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 12) + 8;

  // Pulse animation for LIVE SYNC badge
  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withSpring(0.3, { duration: 800 }),
      -1,
      true
    );
  }, [pulseOpacity]);

  const animatedPulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  // ──────────────────────────────────────────────────────────────
  // Scalable Room Fetching (Personal + Invited + Public Rooms)
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;

    let userRoomsMap = {};
    let recentRoomsMap = {};

    const syncCombinedRooms = () => {
      const mergedMap = { ...userRoomsMap, ...recentRoomsMap };
      const roomsArray = Object.values(mergedMap).filter(room => {
        if (!room) return false;
        const isCreator =
          room.creator?.email === currentUser.email ||
          room.creator?.uid === currentUser.uid;
        const isParticipant = room.participants?.includes(currentUser.email);
        const isPublic = !room.isPrivate;
        return isCreator || isParticipant || isPublic;
      });

      const roomsWithDates = roomsArray.map(room => ({
        ...room,
        createdAt: room.createdAt || new Date().toISOString(),
      }));

      setRooms(roomsWithDates);
      setIsLoading(false);
    };

    // 1. User's dedicated room partition
    const userRoomsRef = database().ref(`user_rooms/${currentUser.uid}`);
    const userRoomsSub = userRoomsRef.on('value', async snapshot => {
      const val = snapshot.val() || {};
      const roomIds = Object.keys(val);
      if (roomIds.length === 0) {
        userRoomsMap = {};
        syncCombinedRooms();
        return;
      }
      try {
        const promises = roomIds.map(id => database().ref(`rooms/${id}`).once('value'));
        const snapshots = await Promise.all(promises);
        const fetched = {};
        snapshots.forEach(s => {
          const r = s.val();
          if (r && r.roomId) fetched[r.roomId] = r;
        });
        userRoomsMap = fetched;
        syncCombinedRooms();
      } catch (err) {
        console.warn('Failed to load user rooms details:', err);
      }
    });

    // 2. Recent screening rooms limit query (indexed on createdAt)
    const recentRoomsQuery = database().ref('rooms').orderByChild('createdAt').limitToLast(50);
    const recentRoomsSub = recentRoomsQuery.on('value', snapshot => {
      const data = snapshot.val() || {};
      recentRoomsMap = data;
      syncCombinedRooms();
    });

    return () => {
      userRoomsRef.off('value', userRoomsSub);
      recentRoomsQuery.off('value', recentRoomsSub);
    };
  }, [currentUser]);

  // Load In-Progress Continue Watching sessions
  const loadProgressData = useCallback(async () => {
    try {
      const items = await getAllContinueWatching();
      setContinueList(items);
    } catch (err) {
      console.warn('[LibraryScreen] Error loading progress:', err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProgressData();
      getWatchlist().then(items => setWatchlist(items));
    }, [loadProgressData])
  );

  // ──────────────────────────────────────────────────────────────
  // Room Navigation & Deletion Handlers
  // ──────────────────────────────────────────────────────────────
  const deleteRoom = async roomId => {
    try {
      const roomRef = database().ref(`rooms/${roomId}`);
      const roomSnapshot = await roomRef.once('value');
      const roomData = roomSnapshot.val();

      if (!roomData) return;

      const isCreator =
        roomData.creator?.email === currentUser?.email ||
        roomData.creator?.uid === currentUser?.uid;

      if (!isCreator) {
        Alert.alert('Error', 'Only the room creator can delete this room');
        return;
      }

      Alert.alert('Delete Room', 'Are you sure you want to delete this screening room?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const updates = {};
            updates[`rooms/${roomId}`] = null;
            updates[`user_rooms/${currentUser.uid}/${roomId}`] = null;
            await database().ref().update(updates);
            Alert.alert('Done', 'Room deleted successfully');
          },
        },
      ]);
    } catch (error) {
      console.error('Error deleting room:', error);
      Alert.alert('Error', 'Failed to delete room');
    }
  };

  const navigateToRoom = item => {
    const isCreator =
      item.creator?.email === currentUser?.email ||
      item.creator?.uid === currentUser?.uid;

    if (item.isStreaming) {
      navigation.navigate('Streaming', {
        roomId: item.roomId,
        roomName: item.name,
        streamUrl: item.streamUrl,
        thumbnail: item.thumbnail,
      });
      return;
    }

    if (isCreator) {
      if (!item?.participants?.length) {
        navigation.navigate('Streaming', {
          roomId: item.roomId,
          roomName: item.name,
          streamUrl: item.streamUrl,
          thumbnail: item.thumbnail,
        });
      } else {
        navigation.navigate('WaitingScreen', {
          roomId: item.roomId,
          roomName: item.name,
          streamUrl: item.streamUrl,
          thumbnail: item.thumbnail,
          isScheduled: item.isScheduled,
          scheduledDate: item.scheduledDate,
        });
      }
    } else {
      navigation.navigate('WaitingScreen', {
        roomId: item.roomId,
        roomName: item.name,
        streamUrl: item.streamUrl,
        thumbnail: item.thumbnail,
        isScheduled: item.isScheduled,
        scheduledDate: item.scheduledDate,
      });
    }
  };

  const onRoomPress = item => {
    const isCreator =
      item.creator?.email === currentUser?.email ||
      item.creator?.uid === currentUser?.uid;

    // If private room with PIN and clicked by guest -> Prompt for PIN!
    if (item.isPrivate && item.pin && !isCreator) {
      setSelectedPrivateRoom(item);
      setIsPinModalVisible(true);
      return;
    }

    navigateToRoom(item);
  };

  // Instant Solo Media Playback with 0 Database Writes
  const handleSelectSoloMedia = useCallback(
    mediaItem => {
      if (!mediaItem) return;
      setIsSearchModalVisible(false);
      navigation.navigate('Streaming', {
        roomId: null,
        streamUrl: mediaItem.mediaUrl,
        roomName: mediaItem.title,
        thumbnail: mediaItem.thumbnail,
        isLocalSolo: true,
      });
    },
    [navigation]
  );

  // Resume In-Progress Playback
  const handleResumePlayback = item => {
    const streamUrl = item.mediaKey && item.mediaKey.startsWith('http') ? item.mediaKey : null;
    const roomId = item.roomId || (item.isSolo ? `solo_${Date.now()}` : item.mediaKey);

    navigation.navigate('Streaming', {
      roomId,
      streamUrl,
      isSolo: item.isSolo === true,
      roomName: item.title || 'Resumed Screening',
      initialPosition: item.position || 0,
      initialThumbnail: item.thumbnail || null,
      duration: item.duration || 0,
    });
  };

  const handleDismissProgress = async item => {
    await removeContinueWatchingItem(item.mediaKey, item.roomId);
    setContinueList(prev => prev.filter(i => i.mediaKey !== item.mediaKey && i.roomId !== item.roomId));
  };

  const handlePlayWatchlistItem = item => {
    navigation.navigate('Streaming', {
      streamUrl: item.streamUrl || item.mediaKey,
      roomId: `solo_${Date.now()}`,
      roomName: item.title,
      isSolo: true,
      thumbnail: item.thumbnail,
      channelName: item.channelName,
      durationText: item.duration,
      views: item.views,
    });
  };

  const handleDismissWatchlist = async item => {
    await removeFromWatchlist(item.streamUrl || item.id);
  };

  const renderWatchlistCard = (item, index) => {
    const title = item.title || 'Cinema Screening';
    let thumb = item.thumbnail;
    if (!thumb && item.streamUrl) {
      const details = getYouTubeThumbnailDetails(item.streamUrl);
      thumb = details?.maxresUrl || details?.fallbackUrl || null;
    }

    return (
      <TouchableOpacity
        key={item.streamUrl || item.id || `wl_${index}`}
        style={styles.hProgressCard}
        onPress={() => handlePlayWatchlistItem(item)}
        activeOpacity={0.84}
      >
        <LinearGradient
          colors={['#141424', '#0A0A12', '#05050A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hProgressGradient}
        >
          {/* 16:9 Thumbnail with bottom fade */}
          <View style={styles.hProgressThumbWrap}>
            {thumb ? (
              <Image source={{ uri: thumb }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
            ) : (
              <MaterialIcons name="movie" size={24} color={colors.MUTED_COLOR} />
            )}

            <LinearGradient
              colors={['transparent', 'rgba(10, 10, 18, 0.45)', '#0A0A12']}
              locations={[0.2, 0.7, 1]}
              style={styles.thumbFade}
              pointerEvents="none"
            />

            {/* Mode badge: Watch Later (FILM_GOLD badge) */}
            <View
              style={[
                styles.hModeBadge,
                { backgroundColor: `${colors.FILM_GOLD}25`, borderColor: `${colors.FILM_GOLD}50` },
              ]}
            >
              <Text style={[styles.hModeText, { color: colors.FILM_GOLD }]}>
                SOLO
              </Text>
            </View>

            {/* Dismiss button */}
            <TouchableOpacity
              style={styles.hDismissBtn}
              onPress={() => handleDismissWatchlist(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="close" size={12} color="#FFF" />
            </TouchableOpacity>

            {/* Duration badge */}
            {Boolean(item.duration) && (
              <View style={styles.hTimeBadge}>
                <Text style={styles.hTimeBadgeText}>{item.duration}</Text>
              </View>
            )}
          </View>

          {/* Details */}
          <View style={styles.hProgressInfo}>
            <Text style={styles.hProgressTitle} numberOfLines={1}>
              {title}
            </Text>

            <View style={[styles.hProgressFooter, { marginTop: 10 }]}>
              <Text style={styles.hProgressPercent} numberOfLines={1}>
                {item.channelName || 'SyncLabs Cinema'}
              </Text>
              <View style={[styles.hResumePill, { backgroundColor: colors.PRIMARY_COLOR }]}>
                <MaterialIcons name="play-arrow" size={11} color="#FFF" />
                <Text style={styles.hResumeText}>Watch</Text>
              </View>
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  // ──────────────────────────────────────────────────────────────
  // Filter & Sort Logic (Optimized with useMemo for Zero-Lag)
  // ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!currentUser) return [];

    let result = rooms.filter(room => {
      if (filterType === 'all') return true;
      if (filterType === 'live') return room.isStreaming;
      if (filterType === 'created') {
        return (
          room.creator?.email === currentUser.email ||
          room.creator?.uid === currentUser.uid
        );
      }
      if (filterType === 'invited') {
        return (
          room.participants?.includes(currentUser.email) &&
          room.creator?.email !== currentUser.email
        );
      }
      if (filterType === 'scheduled') {
        return room.isScheduled === true;
      }
      return true;
    });

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'alphabetical') {
        return (a.name || '').localeCompare(b.name || '');
      }
      if (sortBy === 'oldest') {
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      }
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    return result;
  }, [rooms, filterType, sortBy, currentUser]);

  const sortLabels = { newest: 'Newest', oldest: 'Oldest', alphabetical: 'A-Z' };
  const cycleSortBy = () => {
    const next = { newest: 'oldest', oldest: 'alphabetical', alphabetical: 'newest' };
    setSortBy(next[sortBy]);
  };

  // ──────────────────────────────────────────────────────────────
  // Render: Horizontal In-Progress Item (Faded Black Card)
  // ──────────────────────────────────────────────────────────────
  const renderHorizontalProgressCard = (item, index) => {
    const duration = item.duration || 0;
    const position = item.position || 0;
    const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0;
    const title = item.title || (item.isSolo ? 'Cinema Screening' : 'Watch Party');

    let thumb = item.thumbnail;
    if (!thumb && item.mediaKey) {
      const details = getYouTubeThumbnailDetails(item.mediaKey);
      thumb = details?.maxresUrl || details?.fallbackUrl || null;
    }

    return (
      <TouchableOpacity
        key={item.mediaKey || item.roomId || `prog_${index}`}
        style={styles.hProgressCard}
        onPress={() => handleResumePlayback(item)}
        activeOpacity={0.84}
      >
        <LinearGradient
          colors={['#141424', '#0A0A12', '#05050A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hProgressGradient}
        >
          {/* 16:9 Thumbnail with bottom fade */}
          <View style={styles.hProgressThumbWrap}>
            {thumb ? (
              <Image source={{ uri: thumb }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
            ) : (
              <MaterialIcons name="movie" size={24} color={colors.MUTED_COLOR} />
            )}

            <LinearGradient
              colors={['transparent', 'rgba(10, 10, 18, 0.45)', '#0A0A12']}
              locations={[0.2, 0.7, 1]}
              style={styles.thumbFade}
              pointerEvents="none"
            />

            {/* Mode badge */}
            <View style={[styles.hModeBadge, item.isSolo ? styles.soloPill : styles.partyPill]}>
              <Text style={[styles.hModeText, item.isSolo ? styles.soloPillText : styles.partyPillText]}>
                {item.isSolo ? 'SOLO' : 'PARTY'}
              </Text>
            </View>

            {/* Dismiss button */}
            <TouchableOpacity
              style={styles.hDismissBtn}
              onPress={() => handleDismissProgress(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="close" size={12} color="#FFF" />
            </TouchableOpacity>

            {/* Time badge */}
            <View style={styles.hTimeBadge}>
              <Text style={styles.hTimeBadgeText}>{formatTime(position)}</Text>
            </View>
          </View>

          {/* Details */}
          <View style={styles.hProgressInfo}>
            <Text style={styles.hProgressTitle} numberOfLines={1}>
              {title}
            </Text>

            {/* Progress Bar */}
            <View style={styles.progressBarTrack}>
              <LinearGradient
                colors={[colors.PRIMARY_COLOR, colors.CYAN_ACCENT]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressBarFill, { width: `${progressPercent}%` }]}
              />
            </View>

            <View style={styles.hProgressFooter}>
              <Text style={styles.hProgressPercent}>{Math.round(progressPercent)}% watched</Text>
              <View style={styles.hResumePill}>
                <MaterialIcons name="play-arrow" size={11} color="#FFF" />
                <Text style={styles.hResumeText}>Resume</Text>
              </View>
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar
        backgroundColor={colors.BACKGROUND_COLOR}
        barStyle="light-content"
        translucent
      />

      {/* Ambient Top Glow - consistent with Login & Home screens */}
      <View style={styles.ambientTopGlow} pointerEvents="none">
        <LinearGradient
          colors={['rgba(124, 58, 237, 0.18)', 'rgba(0, 122, 255, 0.08)', 'transparent']}
          style={StyleSheet.absoluteFillObject}
        />
      </View>

      {/* ── TOP HEADER (Safe Area Handled) ─────────────────────────────── */}
      <View style={[styles.headerContainer, { paddingTop: safeTopPadding }]}>
        <View style={styles.headerInner}>
          {/* Logo Mark & Title */}
          <View style={styles.headerLeft}>
            <LinearGradient
              colors={['#0080FF', '#0052FF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logoBadge}
            >
              <Ionicons name="film" size={20} color="#FFF" />
            </LinearGradient>
            <View style={styles.logoTextWrap}>
              <Text style={styles.logoCine}>MY</Text>
              <Text style={styles.logoSync}>ROOMS</Text>
            </View>
          </View>

          {/* Header Right Actions */}
          <View style={styles.headerRightActions}>
            {/* Spotlight Search Trigger */}
            <TouchableOpacity
              style={styles.headerSearchBtn}
              onPress={() => setIsSearchModalVisible(true)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="search" size={20} color={colors.TITLE_COLOR} />
            </TouchableOpacity>

            {/* Enter Code Button */}
            <TouchableOpacity
              style={styles.headerCodeBtn}
              onPress={() => setIsJoinModalVisible(true)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="pin" size={16} color={colors.CYAN_ACCENT} />
              <Text style={styles.headerCodeBtnText}>Enter Code</Text>
            </TouchableOpacity>

            {/* Profile Shortcut */}
            <TouchableOpacity
              style={styles.profileAvatarBtn}
              onPress={() => navigation.navigate('Profile')}
              activeOpacity={0.8}
            >
              <View style={styles.profileAvatarBox}>
                <Ionicons name="person" size={17} color={colors.TITLE_COLOR} />
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── HERO FEATURED WATCH PARTY (Just like previous Home Screen) ── */}
        {filtered.length > 0 ? (
          (() => {
            const featuredRoom = filtered[0];
            const isFeaturedSolo =
              featuredRoom?.isSolo === true ||
              (!featuredRoom?.participants || featuredRoom?.participants?.length === 0);
            const participantCount =
              (featuredRoom?.participants?.length ||
                (featuredRoom?.participants ? Object.keys(featuredRoom.participants).length : 0)) + 1;
            const hostName =
              featuredRoom.creator?.userName ||
              featuredRoom.creator?.name ||
              (featuredRoom.creator?.email ? featuredRoom.creator.email.split('@')[0] : 'Host');

            const content = (
              <LinearGradient
                colors={['rgba(19, 19, 27, 0.4)', 'rgba(9, 10, 18, 0.96)']}
                style={styles.heroGradient}
              >
                {/* Top Badges */}
                <View style={styles.heroBadgeRow}>
                  {isFeaturedSolo ? (
                    <View style={[styles.liveBadge, styles.soloLiveBadge]}>
                      <MaterialIcons name="person" size={11} color={colors.CYAN_ACCENT} />
                      <Text style={[styles.liveBadgeText, { color: colors.CYAN_ACCENT }]}>
                        SOLO CINEMA
                      </Text>
                    </View>
                  ) : featuredRoom.isStreaming ? (
                    <View style={styles.liveBadge}>
                      <Animated.View style={[styles.liveDot, animatedPulseStyle]} />
                      <Text style={styles.liveBadgeText}>LIVE SYNC</Text>
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.liveBadge,
                        {
                          backgroundColor: 'rgba(56, 189, 248, 0.2)',
                          borderColor: 'rgba(56, 189, 248, 0.4)',
                        },
                      ]}
                    >
                      <Ionicons name="time-outline" size={12} color="#38BDF8" />
                      <Text style={[styles.liveBadgeText, { color: '#38BDF8' }]}>READY</Text>
                    </View>
                  )}
                  <View style={styles.spatialBadge}>
                    <Ionicons name="headset-outline" size={13} color="#4CD7F6" />
                    <Text style={styles.spatialBadgeText}>Spatial Audio 3D</Text>
                  </View>
                </View>

                {/* Title & Info */}
                <View style={styles.heroDetails}>
                  <Text
                    style={[
                      styles.heroCategory,
                      isFeaturedSolo && { color: colors.CYAN_ACCENT },
                    ]}
                  >
                    {isFeaturedSolo
                      ? 'PERSONAL SCREENING'
                      : featuredRoom.isStreaming
                      ? 'FEATURED SCREENING'
                      : 'ACTIVE WATCH PARTY'}
                  </Text>
                  <Text style={styles.heroTitle} numberOfLines={1}>
                    {featuredRoom.name}
                  </Text>

                  <View style={styles.heroStatsRow}>
                    {isFeaturedSolo ? (
                      <View style={styles.heroStatItem}>
                        <MaterialIcons name="person" size={14} color={colors.CYAN_ACCENT} />
                        <Text style={[styles.heroStatText, { color: colors.CYAN_ACCENT }]}>
                          Solo Room • Auto-Saved
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.heroStatItem}>
                        <MaterialIcons name="groups" size={15} color="#93C5FD" />
                        <Text style={styles.heroStatText}>
                          {participantCount} {participantCount === 1 ? 'viewer' : 'viewers'}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.heroStatDivider}>•</Text>
                    <Text style={styles.heroHostText}>
                      Host: <Text style={styles.heroHostName}>{hostName}</Text>
                    </Text>
                    {featuredRoom.roomId ? (
                      <>
                        <Text style={styles.heroStatDivider}>•</Text>
                        <View style={styles.heroStatItem}>
                          <MaterialIcons name="tag" size={13} color="#4CD7F6" />
                          <Text style={styles.heroTimeText}>
                            {String(featuredRoom.roomId).substring(0, 8)}
                          </Text>
                        </View>
                      </>
                    ) : null}
                  </View>

                  {/* Primary CTA */}
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => onRoomPress(featuredRoom)}
                    style={styles.heroCtaWrap}
                  >
                    <LinearGradient
                      colors={
                        isFeaturedSolo
                          ? [colors.CYAN_ACCENT, colors.PURPLE_ACCENT]
                          : ['#4B8EFF', '#7C3AED']
                      }
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.heroCtaGradient}
                    >
                      <Ionicons name="play" size={18} color="#FFF" />
                      <Text style={styles.heroCtaText}>
                        {isFeaturedSolo
                          ? 'Watch Solo Now'
                          : featuredRoom.isStreaming
                          ? 'Join Party Now'
                          : 'Enter Room'}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            );

            return (
              <HeroRoomBanner
                key={featuredRoom.roomId || featuredRoom.name}
                featuredRoom={featuredRoom}
                content={content}
              />
            );
          })()
        ) : (
          <View style={styles.heroWrap}>
            <View style={[styles.heroBackground, styles.heroFallbackBg]}>
              <LinearGradient
                colors={['rgba(30, 27, 75, 0.95)', 'rgba(9, 10, 18, 0.98)']}
                style={styles.heroGradient}
              >
                <View style={styles.heroBadgeRow}>
                  <View
                    style={[
                      styles.spatialBadge,
                      {
                        backgroundColor: 'rgba(251, 191, 36, 0.15)',
                        borderColor: 'rgba(251, 191, 36, 0.3)',
                      },
                    ]}
                  >
                    <Ionicons name="sparkles" size={13} color="#FBBF24" />
                    <Text style={[styles.spatialBadgeText, { color: '#FBBF24' }]}>
                      PREMIERE LOUNGE
                    </Text>
                  </View>
                  <View style={styles.spatialBadge}>
                    <Ionicons name="headset-outline" size={13} color="#4CD7F6" />
                    <Text style={styles.spatialBadgeText}>Spatial Audio 3D</Text>
                  </View>
                </View>

                <View style={styles.heroDetails}>
                  <Text style={styles.heroCategory}>WATCH PARTY SYNC</Text>
                  <Text style={styles.heroTitle}>Host a Live Screening</Text>
                  <Text style={styles.heroEmptySubtext}>
                    Stream videos in real-time sync with friends, crystal-clear audio, and interactive chat.
                  </Text>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => navigation.navigate('CreateRoom')}
                    style={styles.heroCtaWrap}
                  >
                    <LinearGradient
                      colors={['#0066FF', '#7C3AED']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.heroCtaGradient}
                    >
                      <Ionicons name="add-circle-outline" size={18} color="#FFF" />
                      <Text style={styles.heroCtaText}>Create Watch Party</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </View>
          </View>
        )}

        {/* ── OPTION 1: CONTINUE WATCHING (SOLO & ROOMS) HORIZONTAL RAIL ── */}
        {continueList.length > 0 && (
          <View style={styles.inProgressSection}>
            <View style={styles.inProgressHeader}>
              <View style={styles.inProgressTitleWrap}>
                <MaterialIcons name="history" size={18} color={colors.CYAN_ACCENT} />
                <Text style={styles.inProgressTitle}>CONTINUE WATCHING</Text>
                <View style={styles.progressCountBadge}>
                  <Text style={styles.progressCountText}>{continueList.length}</Text>
                </View>
              </View>
              <Text style={styles.inProgressSubtitle}>Solo & Rooms</Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hProgressScroll}
            >
              {continueList.map((item, idx) => renderHorizontalProgressCard(item, idx))}
            </ScrollView>
          </View>
        )}

        {/* ── OPTION 2: WATCH LATER / WISHLIST HORIZONTAL RAIL ── */}
        {watchlist.length > 0 && (
          <View style={styles.inProgressSection}>
            <View style={styles.inProgressHeader}>
              <View style={styles.inProgressTitleWrap}>
                <MaterialIcons name="watch-later" size={18} color={colors.FILM_GOLD} />
                <Text style={[styles.inProgressTitle, { color: colors.FILM_GOLD }]}>WATCH LATER</Text>
                <View
                  style={[
                    styles.progressCountBadge,
                    {
                      backgroundColor: `${colors.FILM_GOLD}22`,
                      borderColor: `${colors.FILM_GOLD}45`,
                    },
                  ]}
                >
                  <Text style={[styles.progressCountText, { color: colors.FILM_GOLD }]}>
                    {watchlist.length}
                  </Text>
                </View>
              </View>
              <Text style={styles.inProgressSubtitle}>Saved Solo Cinema</Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hProgressScroll}
            >
              {watchlist.map((item, idx) => renderWatchlistCard(item, idx))}
            </ScrollView>
          </View>
        )}

        {/* ── CATEGORY FILTERS & QUICK SORT ROW ───────────────────────── */}
        <View style={styles.categoryFilterSection}>
          <View style={styles.categoryFilterRow}>
            <View style={styles.categoryScrollContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterScroll}
              >
                {FILTER_TABS.map(f => {
                  const isActive = filterType === f.key;
                  return (
                    <TouchableOpacity
                      key={f.key}
                      activeOpacity={0.8}
                      onPress={() => setFilterType(f.key)}
                      style={styles.filterChipWrap}
                    >
                      {isActive ? (
                        <LinearGradient
                          colors={[colors.PRIMARY_COLOR, '#0052FF']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.filterChipActive}
                        >
                          <MaterialIcons name={f.icon} size={15} color="#FFF" />
                          <Text style={styles.filterChipTextActive}>{f.label}</Text>
                        </LinearGradient>
                      ) : (
                        <View style={styles.filterChip}>
                          <MaterialIcons
                            name={f.icon}
                            size={15}
                            color={f.isLive ? colors.LIVE_RED : colors.SUB_TITLE_COLOR}
                          />
                          <Text
                            style={[
                              styles.filterChipText,
                              f.isLive && { color: colors.LIVE_RED, fontWeight: '700' },
                            ]}
                          >
                            {f.label}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Compact Sort Button */}
            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.sortBtnCompact}
              onPress={cycleSortBy}
            >
              <MaterialIcons name="sort" size={16} color={colors.FILM_GOLD} />
              <Text style={styles.sortLabelCompact}>{sortLabels[sortBy]}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── ACTIVE ROOMS LIST (Faded Black Cards) ──────────────────── */}
        <View style={styles.activeSection}>
          <View style={styles.activeHeaderRow}>
            <View style={styles.activeTitleWrap}>
              <MaterialIcons name="stream" size={20} color="#1D8CF8" />
              <Text style={styles.activeTitle}>Active Rooms</Text>
              <View style={styles.roomCountBadge}>
                <Text style={styles.roomCountText}>{filtered.length}</Text>
              </View>
            </View>
            <Text style={styles.activeSubtitle}>
              {filterType === 'live'
                ? 'Live Streaming Now'
                : filterType === 'created'
                ? 'Created by You'
                : filterType === 'invited'
                ? 'Your Invitations'
                : filterType === 'scheduled'
                ? 'Scheduled Screenings'
                : 'All Screening Rooms'}
            </Text>
          </View>

          {isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color={colors.PRIMARY_COLOR} />
              <Text style={styles.loadingSub}>Loading rooms...</Text>
            </View>
          ) : filtered.length > 0 ? (
            <View style={styles.listContainer}>
              {filtered.map((item, index) => {
                const isCreator =
                  item.creator?.email === currentUser?.email ||
                  item.creator?.uid === currentUser?.uid;

                return (
                  <RoomCard
                    key={item.roomId}
                    item={item}
                    isCreator={isCreator}
                    index={index}
                    onPress={() => onRoomPress(item)}
                    onDelete={() => deleteRoom(item.roomId)}
                  />
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconBox}>
                <Ionicons name="film-outline" size={34} color="#FBBF24" />
              </View>
              <Text style={styles.emptyTitle}>
                {filterType !== 'all' ? 'No Rooms in This Category' : 'No Active Rooms'}
              </Text>
              <Text style={styles.emptySub}>
                {filterType !== 'all'
                  ? 'Switch categories above or tap 🔍 to search all screenings.'
                  : 'Tap the + button to create your first watch party!'}
              </Text>
              {filterType !== 'all' && (
                <TouchableOpacity
                  style={styles.emptyResetBtn}
                  onPress={() => setFilterType('all')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.emptyResetText}>View All Rooms</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── FLOATING ACTION BUTTON (FAB) ─────────────────────────── */}
      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.fabWrap}
        onPress={() => navigation.navigate('CreateRoom')}
      >
        <LinearGradient
          colors={['#0066FF', '#6366F1']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabGradient}
        >
          <MaterialIcons name="add" size={32} color="#FFF" />
        </LinearGradient>
      </TouchableOpacity>

      {/* ── 6-DIGIT JOIN BY CODE MODAL ───────────────────────────── */}
      <JoinByCodeModal
        visible={isJoinModalVisible}
        onClose={() => setIsJoinModalVisible(false)}
        onJoinRoom={onRoomPress}
      />

      {/* ── CINEMA SPOTLIGHT SEARCH MODAL ────────────────────────── */}
      <CinemaSearchModal
        visible={isSearchModalVisible}
        onClose={() => setIsSearchModalVisible(false)}
        rooms={rooms}
        onSelectRoom={onRoomPress}
        onSelectSoloMedia={handleSelectSoloMedia}
        currentUserEmail={currentUser?.email}
      />

      {/* ── PRIVATE ROOM PIN VERIFICATION MODAL ──────────────────── */}
      <PrivateRoomPinModal
        visible={isPinModalVisible}
        room={selectedPrivateRoom}
        onClose={() => {
          setIsPinModalVisible(false);
          setSelectedPrivateRoom(null);
        }}
        onSuccess={targetRoom => {
          setIsPinModalVisible(false);
          setSelectedPrivateRoom(null);
          navigateToRoom(targetRoom);
        }}
      />
    </View>
  );
};

export default LibraryScreen;

// ──────────────────────────────────────────────────────────────
//  Styles
// ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
  },
  ambientTopGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 380,
  },
  scrollContent: {
    paddingBottom: 120,
  },

  // ── Header ────────────────────────
  headerContainer: {
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: colors.BORDER_SUBTLE,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 52,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBadge: {
    width: 40,
    height: 40,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0080FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },
  logoTextWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoCine: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  logoSync: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1D8CF8',
    letterSpacing: 2,
    marginLeft: 4,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerCodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    gap: 5,
  },
  headerCodeBtnText: {
    color: colors.CYAN_ACCENT,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  profileAvatarBtn: {
    padding: 2,
  },
  profileAvatarBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerSearchBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },

  // ── Hero Banner ───────────────────
  heroWrap: {
    paddingHorizontal: 16,
    marginTop: 14,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 8,
  },
  heroBackground: {
    width: '100%',
    height: 240,
    justifyContent: 'flex-end',
    borderRadius: 20,
    overflow: 'hidden',
  },
  heroBackgroundImage: {
    borderRadius: 20,
  },
  heroGradient: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 20,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    gap: 6,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  liveBadgeText: {
    color: '#EF4444',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  soloLiveBadge: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderColor: 'rgba(6, 182, 212, 0.35)',
  },
  spatialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    gap: 5,
  },
  spatialBadgeText: {
    color: '#4CD7F6',
    fontSize: 10,
    fontWeight: '700',
  },
  heroDetails: {
    marginTop: 'auto',
  },
  heroCategory: {
    color: '#4CD7F6',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 2,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6,
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  heroStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heroStatText: {
    color: '#93C5FD',
    fontSize: 12,
    fontWeight: '600',
  },
  heroStatDivider: {
    color: '#64748B',
    fontSize: 12,
  },
  heroHostText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  heroHostName: {
    color: '#FFF',
    fontWeight: '700',
  },
  heroTimeText: {
    color: '#4CD7F6',
    fontSize: 11,
    fontWeight: '600',
  },
  heroCtaWrap: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  heroCtaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    gap: 8,
  },
  heroCtaText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  heroFallbackBg: {
    backgroundColor: '#0F0F1A',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  heroEmptySubtext: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },

  // ── Continue Watching (Option 1) ──
  inProgressSection: {
    marginTop: 18,
    paddingHorizontal: 16,
    gap: 10,
  },
  inProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inProgressTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inProgressTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  progressCountBadge: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: 'rgba(6, 182, 212, 0.4)',
  },
  progressCountText: {
    color: colors.CYAN_ACCENT,
    fontSize: 10.5,
    fontWeight: '800',
  },
  inProgressSubtitle: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    fontWeight: '500',
  },
  hProgressScroll: {
    gap: 12,
    paddingVertical: 2,
  },
  hProgressCard: {
    width: 190,
    backgroundColor: '#0A0A12',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  hProgressGradient: {
    flex: 1,
  },
  hProgressThumbWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#07070E',
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 32,
  },
  hModeBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  hModeText: {
    fontSize: 9,
    fontWeight: '900',
  },
  soloPill: {
    backgroundColor: 'rgba(6, 182, 212, 0.2)',
    borderColor: 'rgba(6, 182, 212, 0.4)',
    borderWidth: 0.5,
  },
  soloPillText: {
    color: colors.CYAN_ACCENT,
  },
  partyPill: {
    backgroundColor: 'rgba(124, 58, 237, 0.2)',
    borderColor: 'rgba(124, 58, 237, 0.4)',
    borderWidth: 0.5,
  },
  partyPillText: {
    color: colors.PURPLE_ACCENT,
  },
  hDismissBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 10,
    padding: 3,
  },
  hTimeBadge: {
    position: 'absolute',
    bottom: 5,
    right: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  hTimeBadgeText: {
    color: '#FFF',
    fontSize: 9.5,
    fontWeight: '700',
  },
  hProgressInfo: {
    padding: 10,
    gap: 6,
  },
  hProgressTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 12.5,
    fontWeight: '700',
  },
  progressBarTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  hProgressFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  hProgressPercent: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 10,
    fontWeight: '600',
  },
  hResumePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.PRIMARY_COLOR,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    gap: 2,
  },
  hResumeText: {
    color: '#FFF',
    fontSize: 9.5,
    fontWeight: '800',
  },

  // ── Category Filters & Quick Sort Row ──
  categoryFilterSection: {
    paddingHorizontal: 16,
    marginTop: 18,
    marginBottom: 4,
  },
  categoryFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryScrollContainer: {
    flex: 1,
  },
  sortBtnCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    paddingHorizontal: 10,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    gap: 5,
  },
  sortLabelCompact: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '700',
  },
  filterScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  filterChipWrap: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    gap: 6,
  },
  filterChipActive: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 12,
    gap: 6,
  },
  filterChipText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },

  // ── Active Section ────────────────
  activeSection: {
    paddingHorizontal: 16,
    marginTop: 18,
  },
  activeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  activeTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  activeSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
  },
  roomCountBadge: {
    backgroundColor: 'rgba(0, 122, 255, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: colors.PRIMARY_COLOR,
  },
  roomCountText: {
    color: colors.PRIMARY_COLOR,
    fontSize: 10,
    fontWeight: '800',
  },
  listContainer: {
    gap: 10,
  },
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    gap: 8,
  },
  loadingSub: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    fontWeight: '600',
  },

  // ── Room Card (Faded Black Card) ──
  roomCard: {
    backgroundColor: '#0A0A14',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    flexDirection: 'row',
  },
  roomAccentStrip: {
    width: 4,
  },
  roomCardInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  roomThumbnailWrap: {
    marginRight: 12,
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#07070E',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  roomThumbnailGradient: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roomThumbnailImage: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  roomThumbnailOverlay: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  roomInfo: {
    flex: 1,
    gap: 2,
  },
  roomTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  roomName: {
    color: '#FFF',
    fontSize: 14.5,
    fontWeight: '700',
    maxWidth: '90%',
  },
  roomMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  roomCreator: {
    color: '#94A3B8',
    fontSize: 11.5,
  },
  roomSoloCreatorText: {
    color: colors.CYAN_ACCENT,
    fontWeight: '600',
  },
  roomParticipantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  viewerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  roomParticipantText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '600',
  },
  liveRoomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: colors.LIVE_RED,
  },
  liveDotMini: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.LIVE_RED,
  },
  liveRoomText: {
    color: colors.LIVE_RED,
    fontSize: 9,
    fontWeight: '900',
  },
  roomCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },
  creatorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3D2F13',
    borderColor: '#785416',
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 8,
    gap: 3,
  },
  creatorBadgeText: {
    color: '#FBBF24',
    fontSize: 10,
    fontWeight: '700',
  },
  roomSoloRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  soloActiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.CYAN_ACCENT,
  },
  roomSoloText: {
    color: colors.CYAN_ACCENT,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  soloBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderColor: 'rgba(6, 182, 212, 0.4)',
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 8,
    gap: 3,
  },
  soloBadgeText: {
    color: colors.CYAN_ACCENT,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ── Swipe Delete ──────────────────
  swipeDeleteBtn: {
    justifyContent: 'center',
    marginLeft: 10,
    borderRadius: 16,
    overflow: 'hidden',
  },
  swipeDeleteGradient: {
    width: 76,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
  },
  swipeDeleteText: {
    color: '#FFF',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '700',
  },

  // ── Empty State ───────────────────
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
  },
  emptyIconBox: {
    width: 68,
    height: 68,
    borderRadius: 18,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.25)',
  },
  emptyTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  emptySub: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyResetBtn: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  emptyResetText: {
    color: colors.CYAN_ACCENT,
    fontSize: 12,
    fontWeight: '700',
  },

  // ── FAB ───────────────────────────
  fabWrap: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
  },
  fabGradient: {
    width: 54,
    height: 54,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
