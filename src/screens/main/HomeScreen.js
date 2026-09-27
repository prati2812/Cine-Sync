import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ImageBackground,
  Image,
  Dimensions,
  Platform,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, database } from '../../config/firebase';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Animated, {
  withSpring,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import colors from '../../theme/Colors';
import { getYouTubeThumbnailDetails } from '../../functions';
import JoinByCodeModal from '../../components/JoinByCodeModal';
import CinemaSearchModal from '../../components/CinemaSearchModal';
import PrivateRoomPinModal from '../../components/PrivateRoomPinModal';
import { searchCinemaMedia } from '../../services/video/CinemaMediaSearchService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const CATEGORY_CHIPS = [
  { key: 'all', label: 'All', icon: 'auto-awesome' },
  { key: 'parties', label: 'Live Parties', icon: 'stream', isLive: true },
  { key: 'movies', label: '4K Cinema', icon: 'local-movies' },
  { key: 'anime', label: 'Anime', icon: 'flash-on' },
  { key: 'gaming', label: 'Gaming', icon: 'sports-esports' },
  { key: 'music', label: 'Concerts', icon: 'music-note' },
];

const INFINITE_TOPICS = [
  'Official Movie Trailers 4K',
  'Sci-Fi Cinema 4K',
  'Action Movies 4K',
  'Cyberpunk Sci-Fi 4K',
  'Hollywood Blockbuster 4K',
  'Anime Movie 4K',
  'Marvel Cinematic 4K',
  'Epic Fantasy Cinema 4K',
  'Space Exploration 4K',
  'Thriller Movie 4K',
  'IMAX 4K HDR',
  'Documentary Film 4K',
];

const INFINITY_GENRES = [
  { id: 'all', label: 'All Streams', icon: 'all-inclusive', query: 'Official Movie Trailers 4K' },
  { id: 'scifi', label: 'Sci-Fi 4K', icon: 'rocket-launch', query: 'Sci-Fi Cinema Movies 4K' },
  { id: 'action', label: 'Action & Thrill', icon: 'flash-on', query: 'Action Movie Scenes 4K' },
  { id: 'cyberpunk', label: 'Cyberpunk', icon: 'computer', query: 'Cyberpunk Futuristic Cinema 4K' },
  { id: 'anime', label: 'Anime & Manga', icon: 'play-arrow', query: 'Anime Movie Screenings 4K' },
  { id: 'imax', label: 'IMAX Cinema', icon: 'theaters', query: 'IMAX Cinema 4K HDR' },
  { id: 'gaming', label: 'Esports & Games', icon: 'sports-esports', query: 'Gaming Cinema Cinematic 4K' },
];

const HomeScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const currentUser = auth().currentUser;

  // Firebase Room states
  const [rooms, setRooms] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');

  // Multi-genre cinema streams (Netflix Rails)
  const [trendingMovies, setTrendingMovies] = useState([]);
  const [animeStreams, setAnimeStreams] = useState([]);
  const [gamingStreams, setGamingStreams] = useState([]);
  const [musicStreams, setMusicStreams] = useState([]);
  const [isLoadingRails, setIsLoadingRails] = useState(true);

  // Infinity Endless Discovery Section
  const [infiniteItems, setInfiniteItems] = useState([]);
  const [infiniteContinuationToken, setInfiniteContinuationToken] = useState(null);
  const [infiniteTopicIndex, setInfiniteTopicIndex] = useState(0);
  const [isLoadingInfinite, setIsLoadingInfinite] = useState(true);
  const [isLoadingMoreInfinite, setIsLoadingMoreInfinite] = useState(false);
  const [selectedInfinityGenre, setSelectedInfinityGenre] = useState('Official Movie Trailers 4K');

  // Quick Action Sheet modal for selecting a streamable card
  const [selectedMediaForAction, setSelectedMediaForAction] = useState(null);

  // Standard modals
  const [isJoinModalVisible, setIsJoinModalVisible] = useState(false);
  const [isSearchModalVisible, setIsSearchModalVisible] = useState(false);
  const [isPinModalVisible, setIsPinModalVisible] = useState(false);
  const [selectedPrivateRoom, setSelectedPrivateRoom] = useState(null);

  // Pulse animation for LIVE SYNC badge
  const pulseOpacity = useSharedValue(1);
  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withSpring(0.3, { duration: 800 }),
      -1,
      true
    );
  }, []);

  const animatedPulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  const safeTopPadding =
    Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 12) + 8;

  // ──────────────────────────────────────────────────────────────
  // Scalable Firebase Room Listener (Personal + Public Parties)
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

      // Sort live rooms first, then newest
      roomsWithDates.sort((a, b) => {
        if (a.isStreaming && !b.isStreaming) return -1;
        if (!a.isStreaming && b.isStreaming) return 1;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });

      setRooms(roomsWithDates);
    };

    // User's dedicated room partition
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

    // Recent screening rooms limit query (indexed on createdAt)
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

  // ──────────────────────────────────────────────────────────────
  // Load Multi-Genre Content Rails (Netflix Style)
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    const loadCinemaRails = async () => {
      try {
        const [trendingRes, animeRes, gamingRes, musicRes] = await Promise.allSettled([
          searchCinemaMedia('Official Movie Trailers 4K', null),
          searchCinemaMedia('Anime Animation 4K', null),
          searchCinemaMedia('Gaming Cinema 4K', null),
          searchCinemaMedia('Music Video Concert 4K', null),
        ]);

        if (!isMounted) return;

        if (trendingRes.status === 'fulfilled' && trendingRes.value?.results?.length) {
          setTrendingMovies(trendingRes.value.results);
        }
        if (animeRes.status === 'fulfilled' && animeRes.value?.results?.length) {
          setAnimeStreams(animeRes.value.results);
        }
        if (gamingRes.status === 'fulfilled' && gamingRes.value?.results?.length) {
          setGamingStreams(gamingRes.value.results);
        }
        if (musicRes.status === 'fulfilled' && musicRes.value?.results?.length) {
          setMusicStreams(musicRes.value.results);
        }
      } catch (err) {
        console.warn('[HomeScreen] Error loading cinema rails:', err);
      } finally {
        if (isMounted) setIsLoadingRails(false);
      }
    };

    loadCinemaRails();
    return () => {
      isMounted = false;
    };
  }, []);

  // ──────────────────────────────────────────────────────────────
  // Infinity Endless Discovery Data Fetching & Pagination
  // ──────────────────────────────────────────────────────────────
  const fetchInitialInfiniteData = useCallback(async (genreQuery = null) => {
    setIsLoadingInfinite(true);
    const query = genreQuery || INFINITE_TOPICS[0];
    try {
      const res = await searchCinemaMedia(query, null);
      const items = res?.results || (Array.isArray(res) ? res : []);
      const token = res?.continuationToken || null;
      setInfiniteItems(items);
      setInfiniteContinuationToken(token);
      setInfiniteTopicIndex(0);
    } catch (err) {
      console.warn('[HomeScreen] Failed to load initial infinite items:', err);
    } finally {
      setIsLoadingInfinite(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialInfiniteData();
  }, [fetchInitialInfiniteData]);

  const loadMoreInfiniteData = useCallback(async () => {
    if (isLoadingMoreInfinite || isLoadingInfinite) return;
    setIsLoadingMoreInfinite(true);

    try {
      let nextItems = [];
      let nextToken = null;

      // 1. Try pagination continuation token first if available
      if (infiniteContinuationToken) {
        const query = selectedInfinityGenre;
        const res = await searchCinemaMedia(query, infiniteContinuationToken);
        nextItems = res?.results || (Array.isArray(res) ? res : []);
        nextToken = res?.continuationToken || null;
      }

      // 2. If continuation token returned nothing or was null, fetch next topic seamlessly
      if (!nextItems || nextItems.length === 0) {
        const nextIdx = (infiniteTopicIndex + 1) % INFINITE_TOPICS.length;
        setInfiniteTopicIndex(nextIdx);
        const query = INFINITE_TOPICS[nextIdx];
        const res = await searchCinemaMedia(query, null);
        nextItems = res?.results || (Array.isArray(res) ? res : []);
        nextToken = res?.continuationToken || null;
      }

      if (nextItems && nextItems.length > 0) {
        setInfiniteItems(prev => {
          const existingIds = new Set(prev.map(i => i.id || i.mediaUrl));
          const uniqueNew = nextItems.filter(i => !existingIds.has(i.id || i.mediaUrl));
          return [...prev, ...uniqueNew];
        });
        setInfiniteContinuationToken(nextToken);
      }
    } catch (err) {
      console.warn('[HomeScreen] Error loading more infinite data:', err);
    } finally {
      setIsLoadingMoreInfinite(false);
    }
  }, [
    isLoadingMoreInfinite,
    isLoadingInfinite,
    infiniteContinuationToken,
    infiniteTopicIndex,
    selectedInfinityGenre,
  ]);

  // ──────────────────────────────────────────────────────────────
  // Navigation & Room Entry Handlers
  // ──────────────────────────────────────────────────────────────
  const navigateToRoom = useCallback(
    item => {
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
    },
    [currentUser, navigation]
  );

  const onRoomPress = useCallback(
    item => {
      const isCreator =
        item.creator?.email === currentUser?.email ||
        item.creator?.uid === currentUser?.uid;

      // If private room with PIN and clicked by guest -> Prompt for PIN
      if (item.isPrivate && item.pin && !isCreator) {
        setSelectedPrivateRoom(item);
        setIsPinModalVisible(true);
        return;
      }

      navigateToRoom(item);
    },
    [currentUser, navigateToRoom]
  );

  const handleLaunchSoloMedia = useCallback(
    media => {
      if (!media) return;
      const targetUrl = media.mediaUrl || media.url || media.streamUrl;
      navigation.navigate('Streaming', {
        streamUrl: targetUrl,
        mediaUrl: targetUrl,
        url: targetUrl,
        isSolo: true,
        isLocalSolo: true,
        roomName: media.title || media.name || 'Personal Cinema',
        thumbnail: media.thumbnail,
        initialThumbnail: media.thumbnail,
        channelName: media.channelName || '',
        durationText: media.duration || '',
        views: media.views || '',
        duration: media.durationSec || 0,
      });
    },
    [navigation]
  );

  const handleHostPartyWithMedia = useCallback(
    media => {
      if (!media) return;
      const targetUrl = media.mediaUrl || media.url || media.streamUrl;
      navigation.navigate('CreateRoom', {
        room: {
          name: media?.title || media?.name || 'Watch Party',
          streamUrl: targetUrl,
          thumbnail: media?.thumbnail,
        },
      });
    },
    [navigation]
  );

  const handleSelectSoloMediaFromSearch = useCallback(
    item => {
      setIsSearchModalVisible(false);
      handleLaunchSoloMedia(item);
    },
    [handleLaunchSoloMedia]
  );

  // ──────────────────────────────────────────────────────────────
  // Hero Billboard Item Determination
  // ──────────────────────────────────────────────────────────────
  const liveParty = useMemo(() => rooms.find(r => r.isStreaming), [rooms]);
  const heroItem = useMemo(() => {
    if (liveParty) return { type: 'room', data: liveParty };
    if (rooms.length > 0) return { type: 'room', data: rooms[0] };
    if (trendingMovies.length > 0) return { type: 'media', data: trendingMovies[0] };
    return null;
  }, [liveParty, rooms, trendingMovies]);

  // Hero background image
  const heroThumbUri = useMemo(() => {
    if (!heroItem) return null;
    if (heroItem.type === 'room') {
      const r = heroItem.data;
      if (r.thumbnail && typeof r.thumbnail === 'string' && r.thumbnail.startsWith('http')) {
        return r.thumbnail;
      }
      const details = getYouTubeThumbnailDetails(r.streamUrl);
      return details?.maxresUrl || details?.fallbackUrl || null;
    }
    return heroItem.data.thumbnail || null;
  }, [heroItem]);

  // Filtered public watch parties for Rail 1
  const publicRoomsList = useMemo(() => {
    return rooms.filter(r => !r.isSolo);
  }, [rooms]);

  // ──────────────────────────────────────────────────────────────
  // Render: Faded Black Horizontal Card
  // ──────────────────────────────────────────────────────────────
  const renderCinemaCard = useCallback(
    (item, onPress) => {
      return (
        <TouchableOpacity
          key={item.id || item.url}
          style={styles.railCard}
          onPress={() => onPress(item)}
          activeOpacity={0.84}
        >
          <LinearGradient
            colors={['#131322', '#0A0A12', '#06060A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.railCardGradient}
          >
            {/* 16:9 Squircle Thumbnail Box */}
            <View style={styles.railThumbBox}>
              {item.thumbnail ? (
                <Image source={{ uri: item.thumbnail }} style={styles.railThumbImg} resizeMode="cover" />
              ) : (
                <View style={styles.railThumbFallback}>
                  <MaterialIcons name="movie" size={24} color={colors.MUTED_COLOR} />
                </View>
              )}

              {/* Bottom Thumbnail Gradient Fade into Black Card */}
              <LinearGradient
                colors={['transparent', 'rgba(10, 10, 18, 0.45)', '#0A0A12']}
                locations={[0.2, 0.7, 1]}
                style={styles.railThumbFade}
                pointerEvents="none"
              />

              {item.duration ? (
                <View style={styles.railDurationBadge}>
                  <Text style={styles.railDurationText}>{item.duration}</Text>
                </View>
              ) : null}
            </View>

            {/* Info Container */}
            <View style={styles.railCardInfo}>
              <Text style={styles.railCardTitle} numberOfLines={2}>
                {item.title}
              </Text>

              <View style={styles.railChannelRow}>
                <Text style={styles.railChannelText} numberOfLines={1}>
                  {item.channelName}
                </Text>
                <MaterialIcons name="verified" size={11} color={colors.CYAN_ACCENT} />
              </View>

              <View style={styles.railFooterRow}>
                {item.views ? (
                  <Text style={styles.railViewsText} numberOfLines={1}>
                    {item.views}
                  </Text>
                ) : null}
                <View style={styles.railPlayPill}>
                  <MaterialIcons name="play-arrow" size={11} color="#FFF" />
                  <Text style={styles.railPlayText}>Play</Text>
                </View>
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      );
    },
    []
  );

  // ──────────────────────────────────────────────────────────────
  // Render: Faded Black Public Room Card
  // ──────────────────────────────────────────────────────────────
  const renderRoomCard = useCallback(
    item => {
      const isLive = item.isStreaming === true;
      const participantCount = item.participants?.length || 0;
      const hostName =
        item.creator?.userName ||
        (item.creator?.email ? item.creator.email.split('@')[0] : 'Host');

      let thumb = item.thumbnail;
      if (!thumb && item.streamUrl) {
        const details = getYouTubeThumbnailDetails(item.streamUrl);
        thumb = details?.maxresUrl || details?.fallbackUrl || null;
      }

      return (
        <TouchableOpacity
          key={item.roomId}
          style={styles.railCard}
          onPress={() => onRoomPress(item)}
          activeOpacity={0.84}
        >
          <LinearGradient
            colors={['#131322', '#0A0A12', '#06060A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.railCardGradient}
          >
            {/* 16:9 Thumbnail */}
            <View style={styles.railThumbBox}>
              {thumb ? (
                <Image source={{ uri: thumb }} style={styles.railThumbImg} resizeMode="cover" />
              ) : (
                <View style={styles.railThumbFallback}>
                  <MaterialIcons name="theaters" size={24} color={colors.CYAN_ACCENT} />
                </View>
              )}

              {/* Bottom Thumbnail Gradient Fade */}
              <LinearGradient
                colors={['transparent', 'rgba(10, 10, 18, 0.45)', '#0A0A12']}
                locations={[0.2, 0.7, 1]}
                style={styles.railThumbFade}
                pointerEvents="none"
              />

              {/* Top Left Live Sync or Ready Badge */}
              <View style={[styles.roomTopBadge, isLive ? styles.roomLiveBadge : styles.roomReadyBadge]}>
                {isLive && <Animated.View style={[styles.liveDotSmall, animatedPulseStyle]} />}
                <Text style={styles.roomBadgeText}>{isLive ? 'LIVE' : 'READY'}</Text>
              </View>

              {/* Top Right Viewer Count */}
              <View style={styles.roomViewerBadge}>
                <MaterialIcons name="people" size={10} color="#FFF" />
                <Text style={styles.roomViewerText}>{participantCount}</Text>
              </View>
            </View>

            {/* Info Container */}
            <View style={styles.railCardInfo}>
              <Text style={styles.railCardTitle} numberOfLines={2}>
                {item.name || 'Watch Party'}
              </Text>

              <View style={styles.railChannelRow}>
                <Text style={styles.railChannelText} numberOfLines={1}>
                  Host: {hostName}
                </Text>
                {item.isPrivate && <MaterialIcons name="lock" size={11} color={colors.FILM_GOLD} />}
              </View>

              <View style={styles.railFooterRow}>
                <View style={styles.roomGenrePill}>
                  <Text style={styles.roomGenreText}>{item.genre || 'Cinema'}</Text>
                </View>
                <View style={styles.roomJoinPill}>
                  <MaterialIcons name="login" size={11} color="#FFF" />
                  <Text style={styles.roomJoinText}>Join</Text>
                </View>
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      );
    },
    [animatedPulseStyle, onRoomPress]
  );

  // ──────────────────────────────────────────────────────────────
  // Render: 2-Column Infinity Grid Card (Faded Black Card)
  // ──────────────────────────────────────────────────────────────
  const renderInfinityGridCard = useCallback(
    (item, index) => {
      return (
        <TouchableOpacity
          key={`${item.id || item.url}_${index}`}
          style={styles.infinityCard}
          onPress={() => setSelectedMediaForAction(item)}
          activeOpacity={0.84}
        >
          <LinearGradient
            colors={['#131322', '#0A0A12', '#06060A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.infinityCardGradient}
          >
            {/* 16:9 Squircle Thumbnail Box */}
            <View style={styles.infinityThumbBox}>
              {item.thumbnail ? (
                <Image
                  source={{ uri: item.thumbnail }}
                  style={styles.infinityThumbImg}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.infinityThumbFallback}>
                  <MaterialIcons name="movie" size={24} color={colors.MUTED_COLOR} />
                </View>
              )}

              {/* Bottom Thumbnail Gradient Fade into Black Card */}
              <LinearGradient
                colors={['transparent', 'rgba(10, 10, 18, 0.45)', '#0A0A12']}
                locations={[0.2, 0.7, 1]}
                style={styles.infinityThumbFade}
                pointerEvents="none"
              />

              {/* 4K Cinema Badge */}
              <View style={styles.infinity4kBadge}>
                <Text style={styles.infinity4kText}>4K HDR</Text>
              </View>

              {/* Duration Badge */}
              {item.duration ? (
                <View style={styles.infinityDurationBadge}>
                  <Text style={styles.infinityDurationText}>{item.duration}</Text>
                </View>
              ) : null}
            </View>

            {/* Info Container */}
            <View style={styles.infinityCardInfo}>
              <Text style={styles.infinityCardTitle} numberOfLines={2}>
                {item.title}
              </Text>

              <View style={styles.infinityChannelRow}>
                <Text style={styles.infinityChannelText} numberOfLines={1}>
                  {item.channelName}
                </Text>
                <MaterialIcons name="verified" size={11} color={colors.CYAN_ACCENT} />
              </View>

              <View style={styles.infinityFooterRow}>
                {item.views ? (
                  <Text style={styles.infinityViewsText} numberOfLines={1}>
                    {item.views}
                  </Text>
                ) : (
                  <Text style={styles.infinityViewsText}>HD Stream</Text>
                )}
                <View style={styles.infinityPlayPill}>
                  <MaterialIcons name="play-arrow" size={11} color="#FFF" />
                  <Text style={styles.infinityPlayText}>Play</Text>
                </View>
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      );
    },
    []
  );

  // Auto-scroll infinite data trigger
  const handleScroll = useCallback(
    event => {
      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
      const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 700;
      if (isCloseToBottom && !isLoadingMoreInfinite && !isLoadingInfinite) {
        loadMoreInfiniteData();
      }
    },
    [isLoadingMoreInfinite, isLoadingInfinite, loadMoreInfiniteData]
  );

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={colors.BACKGROUND_COLOR} barStyle="light-content" translucent />

      {/* ── AMBIENT TOP GLOW ── */}
      <View style={styles.ambientTopGlow} pointerEvents="none">
        <LinearGradient
          colors={['rgba(124, 58, 237, 0.18)', 'rgba(0, 122, 255, 0.08)', 'transparent']}
          style={StyleSheet.absoluteFillObject}
        />
      </View>

      {/* ── TRANSLUCENT NETFLIX HEADER ── */}
      <View style={[styles.headerContainer, { paddingTop: safeTopPadding }]}>
        <View style={styles.headerInner}>
          {/* Logo & Brand */}
          <View style={styles.headerLeft}>
            <LinearGradient
              colors={['#0080FF', '#7C3AED']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logoBadge}
            >
              <Ionicons name="film" size={19} color="#FFF" />
            </LinearGradient>
            <View style={styles.logoTextWrap}>
              <Text style={styles.logoCine}>CINE</Text>
              <Text style={styles.logoSync}>SYNC</Text>
            </View>
          </View>

          {/* Action Shortcuts */}
          <View style={styles.headerRightActions}>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => setIsSearchModalVisible(true)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="search" size={20} color={colors.TITLE_COLOR} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerCodeBtn}
              onPress={() => setIsJoinModalVisible(true)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="pin" size={15} color={colors.CYAN_ACCENT} />
              <Text style={styles.headerCodeBtnText}>Enter Code</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => navigation.navigate('CreateRoom')}
              activeOpacity={0.8}
            >
              <MaterialIcons name="add" size={22} color={colors.CYAN_ACCENT} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Category Pill Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScrollContent}
        >
          {CATEGORY_CHIPS.map(chip => {
            const isActive = activeCategory === chip.key;
            return (
              <TouchableOpacity
                key={chip.key}
                onPress={() => setActiveCategory(chip.key)}
                activeOpacity={0.8}
                style={styles.categoryPillWrap}
              >
                {isActive ? (
                  <LinearGradient
                    colors={[colors.PRIMARY_COLOR, '#0052FF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.categoryPillActive}
                  >
                    <MaterialIcons name={chip.icon} size={13} color="#FFF" />
                    <Text style={styles.categoryPillTextActive}>{chip.label}</Text>
                  </LinearGradient>
                ) : (
                  <View style={styles.categoryPillInactive}>
                    <MaterialIcons
                      name={chip.icon}
                      size={13}
                      color={chip.isLive ? colors.LIVE_RED : colors.SUB_TITLE_COLOR}
                    />
                    <Text
                      style={[
                        styles.categoryPillTextInactive,
                        chip.isLive && { color: colors.LIVE_RED, fontWeight: '700' },
                      ]}
                    >
                      {chip.label}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── MAIN SCROLLING CINEMA CANVAS ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={32}
      >
        {/* ── 1. CINEMATIC HERO BILLBOARD (Netflix Style) ── */}
        {heroItem && (
          <View style={styles.billboardWrap}>
            <ImageBackground
              source={heroThumbUri ? { uri: heroThumbUri } : undefined}
              style={styles.billboardBg}
              resizeMode="cover"
            >
              {/* Deep 3-Layer Cinematic Gradient Fade into Background */}
              <LinearGradient
                colors={[
                  'rgba(8, 8, 16, 0.15)',
                  'rgba(8, 8, 16, 0.45)',
                  'rgba(8, 8, 16, 0.82)',
                  colors.BACKGROUND_COLOR,
                ]}
                locations={[0, 0.35, 0.72, 1]}
                style={styles.billboardGradient}
              >
                {/* Top Badges */}
                <View style={styles.billboardBadgeRow}>
                  {heroItem.type === 'room' && heroItem.data.isStreaming ? (
                    <View style={styles.billboardLiveBadge}>
                      <Animated.View style={[styles.liveDotSmall, animatedPulseStyle]} />
                      <Text style={styles.billboardLiveText}>LIVE SYNC WATCH PARTY</Text>
                    </View>
                  ) : (
                    <View style={styles.billboardPremiereBadge}>
                      <MaterialIcons name="auto-awesome" size={12} color={colors.CYAN_ACCENT} />
                      <Text style={styles.billboardPremiereText}>FEATURED CINEMA 4K</Text>
                    </View>
                  )}

                  <View style={styles.billboardSpatialBadge}>
                    <Ionicons name="headset-outline" size={12} color="#4CD7F6" />
                    <Text style={styles.billboardSpatialText}>Spatial 3D Audio</Text>
                  </View>
                </View>

                {/* Hero Info */}
                <View style={styles.billboardInfoBlock}>
                  <Text style={styles.billboardTitle} numberOfLines={2}>
                    {heroItem.type === 'room' ? heroItem.data.name : heroItem.data.title}
                  </Text>

                  <View style={styles.billboardMetaRow}>
                    <Text style={styles.billboardSubtext} numberOfLines={1}>
                      {heroItem.type === 'room'
                        ? `Host: ${heroItem.data.creator?.userName || 'Host'} • ${heroItem.data.genre || 'Movies'}`
                        : `${heroItem.data.channelName || 'Cinema Studio'} • 4K Ultra HD`}
                    </Text>
                  </View>

                  {/* Dual Action CTAs */}
                  <View style={styles.billboardCtaRow}>
                    {heroItem.type === 'room' ? (
                      <>
                        <TouchableOpacity
                          style={styles.billboardPrimaryBtn}
                          onPress={() => onRoomPress(heroItem.data)}
                          activeOpacity={0.84}
                        >
                          <LinearGradient
                            colors={[colors.PRIMARY_COLOR, '#0052FF']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.billboardCtaGradient}
                          >
                            <Ionicons name="play" size={17} color="#FFF" />
                            <Text style={styles.billboardPrimaryText}>
                              {heroItem.data.isStreaming ? 'Join Party Now' : 'Enter Room'}
                            </Text>
                          </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.billboardSecondaryBtn}
                          onPress={() => {
                            const streamUrl =
                              heroItem.data?.streamUrl ||
                              heroItem.data?.mediaUrl ||
                              heroItem.data?.url;
                            navigation.navigate('Streaming', {
                              streamUrl,
                              mediaUrl: streamUrl,
                              url: streamUrl,
                              isSolo: true,
                              isLocalSolo: true,
                              roomName: heroItem.data?.name || heroItem.data?.title || 'Personal Cinema',
                              thumbnail: heroItem.data?.thumbnail,
                              initialThumbnail: heroItem.data?.thumbnail,
                              channelName: heroItem.data?.channelName || '',
                              durationText: heroItem.data?.duration || '',
                              views: heroItem.data?.views || '',
                            });
                          }}
                          activeOpacity={0.84}
                        >
                          <MaterialIcons name="person" size={17} color={colors.CYAN_ACCENT} />
                          <Text style={styles.billboardSecondaryText}>Watch Solo</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <TouchableOpacity
                          style={styles.billboardPrimaryBtn}
                          onPress={() => handleLaunchSoloMedia(heroItem.data)}
                          activeOpacity={0.84}
                        >
                          <LinearGradient
                            colors={[colors.PRIMARY_COLOR, '#0052FF']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.billboardCtaGradient}
                          >
                            <Ionicons name="play" size={17} color="#FFF" />
                            <Text style={styles.billboardPrimaryText}>Watch Solo Now</Text>
                          </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.billboardSecondaryBtn}
                          onPress={() => handleHostPartyWithMedia(heroItem.data)}
                          activeOpacity={0.84}
                        >
                          <MaterialIcons name="groups" size={17} color={colors.CYAN_ACCENT} />
                          <Text style={styles.billboardSecondaryText}>Host Party</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              </LinearGradient>
            </ImageBackground>
          </View>
        )}

        {/* ── 2. RAIL 1: 🔴 LIVE PUBLIC WATCH PARTIES ── */}
        {(activeCategory === 'all' || activeCategory === 'parties') && (
          <View style={styles.railSection}>
            <View style={styles.railHeaderRow}>
              <View style={styles.railTitleGroup}>
                <View style={styles.liveIndicatorDot} />
                <Text style={styles.railTitle}>LIVE PUBLIC WATCH PARTIES</Text>
                <View style={styles.railCountBadge}>
                  <Text style={styles.railCountText}>{publicRoomsList.length}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => navigation.navigate('CreateRoom')} activeOpacity={0.75}>
                <Text style={styles.railActionText}>+ Host Room</Text>
              </TouchableOpacity>
            </View>

            {publicRoomsList.length > 0 ? (
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={publicRoomsList}
                keyExtractor={item => item.roomId}
                contentContainerStyle={styles.railScrollContent}
                renderItem={({ item }) => renderRoomCard(item)}
              />
            ) : (
              <View style={styles.emptyRailCard}>
                <LinearGradient
                  colors={['#141424', '#0A0A12']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.emptyRailGradient}
                >
                  <MaterialIcons name="theaters" size={28} color={colors.CYAN_ACCENT} />
                  <View style={styles.emptyRailInfo}>
                    <Text style={styles.emptyRailTitle}>No Public Parties Streaming Right Now</Text>
                    <Text style={styles.emptyRailSub}>Be the first to host a public screening with friends!</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.emptyHostBtn}
                    onPress={() => navigation.navigate('CreateRoom')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.emptyHostText}>Create Party</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </View>
            )}
          </View>
        )}

        {/* ── 3. RAIL 2: 🍿 TRENDING 4K CINEMA & TRAILERS ── */}
        {(activeCategory === 'all' || activeCategory === 'movies') && (
          <View style={styles.railSection}>
            <View style={styles.railHeaderRow}>
              <View style={styles.railTitleGroup}>
                <MaterialIcons name="local-movies" size={16} color={colors.FILM_GOLD} />
                <Text style={styles.railTitle}>TRENDING 4K CINEMA & TRAILERS</Text>
              </View>
              <Text style={styles.railSubTag}>Instant Play</Text>
            </View>

            {isLoadingRails && trendingMovies.length === 0 ? (
              <View style={styles.railLoadingBox}>
                <ActivityIndicator size="small" color={colors.PRIMARY_COLOR} />
                <Text style={styles.railLoadingText}>Discovering 4K Cinema...</Text>
              </View>
            ) : (
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={trendingMovies}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.railScrollContent}
                renderItem={({ item }) => renderCinemaCard(item, setSelectedMediaForAction)}
              />
            )}
          </View>
        )}

        {/* ── 4. RAIL 3: 🎌 ANIME & ANIMATION HUB ── */}
        {(activeCategory === 'all' || activeCategory === 'anime') && (
          <View style={styles.railSection}>
            <View style={styles.railHeaderRow}>
              <View style={styles.railTitleGroup}>
                <MaterialIcons name="flash-on" size={16} color={colors.CYAN_ACCENT} />
                <Text style={styles.railTitle}>ANIME & ANIMATION SCREENINGS</Text>
              </View>
              <Text style={styles.railSubTag}>4K HDR</Text>
            </View>

            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={animeStreams}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.railScrollContent}
              renderItem={({ item }) => renderCinemaCard(item, setSelectedMediaForAction)}
            />
          </View>
        )}

        {/* ── 5. RAIL 4: 🎮 GAMING & ESPORTS ARENA ── */}
        {(activeCategory === 'all' || activeCategory === 'gaming') && (
          <View style={styles.railSection}>
            <View style={styles.railTitleGroup}>
              <MaterialIcons name="sports-esports" size={16} color={colors.PURPLE_ACCENT} />
              <Text style={styles.railTitle}>GAMING & ESPORTS ARENAS</Text>
            </View>

            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={gamingStreams}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.railScrollContent}
              renderItem={({ item }) => renderCinemaCard(item, setSelectedMediaForAction)}
            />
          </View>
        )}

        {/* ── 6. RAIL 5: 🎵 MUSIC CONCERTS & FESTIVALS ── */}
        {(activeCategory === 'all' || activeCategory === 'music') && (
          <View style={styles.railSection}>
            <View style={styles.railHeaderRow}>
              <View style={styles.railTitleGroup}>
                <MaterialIcons name="music-note" size={16} color={colors.FILM_GOLD} />
                <Text style={styles.railTitle}>MUSIC CONCERTS & LIVE STAGES</Text>
              </View>
              <Text style={styles.railSubTag}>3D Audio</Text>
            </View>

            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={musicStreams}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.railScrollContent}
              renderItem={({ item }) => renderCinemaCard(item, setSelectedMediaForAction)}
            />
          </View>
        )}

        {/* ── 7. INFINITY SECTION (ENDLESS 4K CINEMA STREAM) ── */}
        <View style={styles.infinitySection}>
          <View style={styles.infinityHeader}>
            <View style={styles.infinityTitleGroup}>
              <LinearGradient
                colors={['#0080FF', '#7C3AED']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.infinityIconBox}
              >
                <MaterialIcons name="all-inclusive" size={19} color="#FFF" />
              </LinearGradient>
              <View>
                <Text style={styles.infinityTitle}>ENDLESS DISCOVERY</Text>
                <Text style={styles.infinitySubtitle}>Infinite 4K Cinema, Trailers & Shows</Text>
              </View>
            </View>
            <View style={styles.infinityBadge}>
              <View style={styles.infinityPulseDot} />
              <Text style={styles.infinityBadgeText}>AUTO-SYNC</Text>
            </View>
          </View>

          {/* Infinity Genre Filter Chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.infinityFilterScroll}
          >
            {INFINITY_GENRES.map(genre => {
              const isActive = selectedInfinityGenre === genre.query;
              return (
                <TouchableOpacity
                  key={genre.id}
                  onPress={() => {
                    setSelectedInfinityGenre(genre.query);
                    fetchInitialInfiniteData(genre.query);
                  }}
                  activeOpacity={0.8}
                  style={styles.infinityGenreChipWrap}
                >
                  {isActive ? (
                    <LinearGradient
                      colors={[colors.PRIMARY_COLOR, colors.CYAN_ACCENT]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.infinityGenreChipActive}
                    >
                      <MaterialIcons name={genre.icon} size={13} color="#FFF" />
                      <Text style={styles.infinityGenreTextActive}>{genre.label}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={styles.infinityGenreChipInactive}>
                      <MaterialIcons name={genre.icon} size={13} color={colors.SUB_TITLE_COLOR} />
                      <Text style={styles.infinityGenreTextInactive}>{genre.label}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* 2-Column Faded Black Cards Grid */}
          {isLoadingInfinite && infiniteItems.length === 0 ? (
            <View style={styles.infinityInitialLoading}>
              <ActivityIndicator size="large" color={colors.CYAN_ACCENT} />
              <Text style={styles.infinityInitialLoadingText}>
                Loading infinite stream catalog...
              </Text>
            </View>
          ) : (
            <View style={styles.infinityGrid}>
              {infiniteItems.map((item, index) => renderInfinityGridCard(item, index))}
            </View>
          )}

          {/* Bottom Infinite Loading Indicator & Load More CTA */}
          {isLoadingMoreInfinite ? (
            <View style={styles.infinityLoadingMoreRow}>
              <ActivityIndicator size="small" color={colors.CYAN_ACCENT} />
              <Text style={styles.infinityLoadingMoreText}>
                Fetching more infinite streams...
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.infinityManualLoadBtn}
              onPress={loadMoreInfiniteData}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#161628', '#0D0D18']}
                style={styles.infinityManualLoadGradient}
              >
                <MaterialIcons name="all-inclusive" size={17} color={colors.CYAN_ACCENT} />
                <Text style={styles.infinityManualLoadText}>Load More Streams</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* ── FLOATING ACTION BUTTON (FAB) ── */}
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
          <MaterialIcons name="add" size={30} color="#FFF" />
        </LinearGradient>
      </TouchableOpacity>

      {/* ── QUICK ACTION SHEET MODAL (Watch Solo or Host Party) ── */}
      <Modal
        visible={!!selectedMediaForAction}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedMediaForAction(null)}
      >
        <TouchableOpacity
          style={styles.actionSheetBackdrop}
          activeOpacity={1}
          onPress={() => setSelectedMediaForAction(null)}
        >
          <View style={styles.actionSheetCard}>
            <LinearGradient
              colors={['#18182C', '#0E0E1A', '#080810']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.actionSheetGradient}
            >
              {/* Top Handle */}
              <View style={styles.sheetHandle} />

              {/* Media Preview Row */}
              <View style={styles.sheetPreviewRow}>
                <View style={styles.sheetThumbBox}>
                  {selectedMediaForAction?.thumbnail ? (
                    <Image
                      source={{ uri: selectedMediaForAction.thumbnail }}
                      style={StyleSheet.absoluteFillObject}
                      resizeMode="cover"
                    />
                  ) : (
                    <MaterialIcons name="movie" size={24} color={colors.MUTED_COLOR} />
                  )}
                  {selectedMediaForAction?.duration ? (
                    <View style={styles.sheetDurationBadge}>
                      <Text style={styles.sheetDurationText}>{selectedMediaForAction.duration}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.sheetInfoCol}>
                  <Text style={styles.sheetTitle} numberOfLines={2}>
                    {selectedMediaForAction?.title}
                  </Text>
                  <View style={styles.sheetChannelRow}>
                    <Text style={styles.sheetChannel} numberOfLines={1}>
                      {selectedMediaForAction?.channelName}
                    </Text>
                    <MaterialIcons name="verified" size={12} color={colors.CYAN_ACCENT} />
                  </View>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.sheetBtnGroup}>
                <TouchableOpacity
                  style={styles.sheetActionBtnPrimary}
                  onPress={() => {
                    const media = selectedMediaForAction;
                    setSelectedMediaForAction(null);
                    handleLaunchSoloMedia(media);
                  }}
                  activeOpacity={0.82}
                >
                  <LinearGradient
                    colors={[colors.PRIMARY_COLOR, '#0052FF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.sheetActionGradient}
                  >
                    <MaterialIcons name="play-arrow" size={18} color="#FFF" />
                    <Text style={styles.sheetActionTextPrimary}>Watch Solo</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sheetActionBtnSecondary}
                  onPress={() => {
                    const media = selectedMediaForAction;
                    setSelectedMediaForAction(null);
                    handleHostPartyWithMedia(media);
                  }}
                  activeOpacity={0.82}
                >
                  <MaterialIcons name="groups" size={18} color={colors.CYAN_ACCENT} />
                  <Text style={styles.sheetActionTextSecondary}>Host Public Watch Party</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── 6-DIGIT JOIN BY CODE MODAL ── */}
      <JoinByCodeModal
        visible={isJoinModalVisible}
        onClose={() => setIsJoinModalVisible(false)}
        onJoinRoom={onRoomPress}
      />

      {/* ── CINEMA SPOTLIGHT SEARCH MODAL ── */}
      <CinemaSearchModal
        visible={isSearchModalVisible}
        onClose={() => setIsSearchModalVisible(false)}
        rooms={rooms}
        onSelectRoom={onRoomPress}
        onSelectSoloMedia={handleSelectSoloMediaFromSearch}
        currentUserEmail={currentUser?.email}
      />

      {/* ── PRIVATE ROOM PIN VERIFICATION MODAL ── */}
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

export default HomeScreen;

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

  // ── Translucent Netflix Header ──
  headerContainer: {
    backgroundColor: 'rgba(8, 8, 16, 0.88)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoTextWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoCine: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  logoSync: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.PRIMARY_COLOR,
    letterSpacing: 1.5,
    marginLeft: 3,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#0E0E18',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerCodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E0E18',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    gap: 4,
  },
  headerCodeBtnText: {
    color: colors.CYAN_ACCENT,
    fontSize: 11.5,
    fontWeight: '700',
  },

  // Category Pills
  categoryScrollContent: {
    gap: 8,
    paddingVertical: 2,
  },
  categoryPillWrap: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  categoryPillActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  categoryPillTextActive: {
    color: '#FFF',
    fontSize: 11.5,
    fontWeight: '800',
  },
  categoryPillInactive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#0C0C16',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  categoryPillTextInactive: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11.5,
    fontWeight: '600',
  },

  // ── Cinematic Hero Billboard ──
  billboardWrap: {
    width: '100%',
    height: SCREEN_WIDTH * 0.95,
    backgroundColor: colors.SURFACE_COLOR,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 16,
  },
  billboardBg: {
    width: '100%',
    height: '100%',
  },
  billboardGradient: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 8,
  },
  billboardBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  billboardLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.LIVE_RED,
  },
  billboardLiveText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  billboardPremiereBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.35)',
  },
  billboardPremiereText: {
    color: colors.CYAN_ACCENT,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  billboardSpatialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  billboardSpatialText: {
    color: '#4CD7F6',
    fontSize: 10,
    fontWeight: '700',
  },
  billboardInfoBlock: {
    gap: 8,
  },
  billboardTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
    letterSpacing: 0.2,
  },
  billboardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  billboardSubtext: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    fontWeight: '600',
  },
  billboardCtaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  billboardPrimaryBtn: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  billboardCtaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
  },
  billboardPrimaryText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },
  billboardSecondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: '#0E0E18',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  billboardSecondaryText: {
    color: colors.TITLE_COLOR,
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Horizontal Cinema Rails ──
  railSection: {
    marginBottom: 20,
    gap: 10,
  },
  railHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  railTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
  },
  railTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  railCountBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
    borderWidth: 0.5,
    borderColor: colors.LIVE_RED,
  },
  railCountText: {
    color: colors.LIVE_RED,
    fontSize: 10,
    fontWeight: '800',
  },
  railActionText: {
    color: colors.CYAN_ACCENT,
    fontSize: 11.5,
    fontWeight: '700',
  },
  railSubTag: {
    color: colors.MUTED_COLOR,
    fontSize: 11,
    fontWeight: '600',
  },
  railScrollContent: {
    paddingHorizontal: 16,
    gap: 12,
  },

  // Faded Black Rail Card
  railCard: {
    width: 172,
    backgroundColor: '#0A0A12',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    overflow: 'hidden',
  },
  railCardGradient: {
    flex: 1,
  },
  railThumbBox: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#07070E',
    position: 'relative',
    overflow: 'hidden',
  },
  railThumbImg: {
    width: '100%',
    height: '100%',
  },
  railThumbFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railThumbFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 34,
  },
  railDurationBadge: {
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
  railDurationText: {
    color: '#FFF',
    fontSize: 9.5,
    fontWeight: '700',
  },
  railCardInfo: {
    padding: 8,
    gap: 3,
    backgroundColor: 'transparent',
  },
  railCardTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  railChannelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  railChannelText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 10.5,
    fontWeight: '600',
    flexShrink: 1,
  },
  railFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 3,
  },
  railViewsText: {
    color: colors.MUTED_COLOR,
    fontSize: 9.5,
    fontWeight: '500',
    flexShrink: 1,
  },
  railPlayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.PRIMARY_COLOR,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    gap: 2,
  },
  railPlayText: {
    color: '#FFF',
    fontSize: 9.5,
    fontWeight: '800',
  },

  // Room Specific Card Elements
  roomTopBadge: {
    position: 'absolute',
    top: 5,
    left: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  roomLiveBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.88)',
  },
  roomReadyBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.35)',
    borderWidth: 0.5,
    borderColor: '#38BDF8',
  },
  roomBadgeText: {
    color: '#FFF',
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  liveDotSmall: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#FFF',
  },
  liveIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.LIVE_RED,
  },
  roomViewerBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  roomViewerText: {
    color: '#FFF',
    fontSize: 9.5,
    fontWeight: '700',
  },
  roomGenrePill: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  roomGenreText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 9.5,
    fontWeight: '600',
  },
  roomJoinPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.PRIMARY_COLOR,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    gap: 3,
  },
  roomJoinText: {
    color: '#FFF',
    fontSize: 9.5,
    fontWeight: '800',
  },

  // Empty Rail
  emptyRailCard: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  emptyRailGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  emptyRailInfo: {
    flex: 1,
    gap: 2,
  },
  emptyRailTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 12.5,
    fontWeight: '700',
  },
  emptyRailSub: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
  },
  emptyHostBtn: {
    backgroundColor: colors.PRIMARY_COLOR,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  emptyHostText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },

  // Rail Loading
  railLoadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 24,
    marginHorizontal: 16,
    backgroundColor: '#0A0A12',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  railLoadingText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    fontWeight: '600',
  },

  // ── FAB ──
  fabWrap: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  fabGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Quick Action Sheet Modal ──
  actionSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  actionSheetCard: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  actionSheetGradient: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 36,
    gap: 14,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignSelf: 'center',
    marginBottom: 6,
  },
  sheetPreviewRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  sheetThumbBox: {
    width: 110,
    height: 64,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#07070E',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetDurationBadge: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  sheetDurationText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '700',
  },
  sheetInfoCol: {
    flex: 1,
    gap: 4,
  },
  sheetTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  sheetChannelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sheetChannel: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '600',
  },
  sheetBtnGroup: {
    gap: 10,
    marginTop: 4,
  },
  sheetActionBtnPrimary: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  sheetActionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  sheetActionTextPrimary: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },
  sheetActionBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: '#121222',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  sheetActionTextSecondary: {
    color: colors.CYAN_ACCENT,
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Infinity Section ─────────────
  infinitySection: {
    marginTop: 28,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  infinityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  infinityTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infinityIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infinityTitle: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  infinitySubtitle: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  infinityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    gap: 4,
  },
  infinityPulseDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.CYAN_ACCENT,
  },
  infinityBadgeText: {
    color: colors.CYAN_ACCENT,
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  infinityFilterScroll: {
    gap: 8,
    paddingVertical: 4,
    marginBottom: 14,
  },
  infinityGenreChipWrap: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  infinityGenreChipActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  infinityGenreTextActive: {
    color: '#FFF',
    fontSize: 11.5,
    fontWeight: '800',
  },
  infinityGenreChipInactive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#0C0C16',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  infinityGenreTextInactive: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11.5,
    fontWeight: '600',
  },
  infinityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  infinityCard: {
    width: (SCREEN_WIDTH - 44) / 2,
    backgroundColor: '#0A0A14',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    marginBottom: 14,
  },
  infinityCardGradient: {
    flex: 1,
  },
  infinityThumbBox: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#07070E',
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infinityThumbImg: {
    width: '100%',
    height: '100%',
  },
  infinityThumbFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infinityThumbFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 30,
  },
  infinity4kBadge: {
    position: 'absolute',
    top: 5,
    left: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(6, 182, 212, 0.4)',
  },
  infinity4kText: {
    color: colors.CYAN_ACCENT,
    fontSize: 8.5,
    fontWeight: '800',
  },
  infinityDurationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  infinityDurationText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '700',
  },
  infinityCardInfo: {
    padding: 8,
    gap: 4,
  },
  infinityCardTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  infinityChannelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  infinityChannelText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 10,
    fontWeight: '500',
    maxWidth: '85%',
  },
  infinityFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  infinityViewsText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 9.5,
    fontWeight: '600',
    maxWidth: '65%',
  },
  infinityPlayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.PRIMARY_COLOR,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    gap: 2,
  },
  infinityPlayText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '800',
  },
  infinityInitialLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  infinityInitialLoadingText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    fontWeight: '600',
  },
  infinityLoadingMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  infinityLoadingMoreText: {
    color: colors.CYAN_ACCENT,
    fontSize: 12,
    fontWeight: '700',
  },
  infinityManualLoadBtn: {
    marginTop: 10,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  infinityManualLoadGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  infinityManualLoadText: {
    color: colors.TITLE_COLOR,
    fontSize: 13,
    fontWeight: '800',
  },
});