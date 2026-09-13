import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  StatusBar,
  ImageBackground,
  Image,
  Dimensions,
  Platform,
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
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import LinearGradient from 'react-native-linear-gradient';
import colors from '../../theme/Colors';
import { getYouTubeThumbnailDetails } from '../../functions';
import JoinByCodeModal from '../../components/JoinByCodeModal';
import CinemaSearchModal from '../../components/CinemaSearchModal';
import PrivateRoomPinModal from '../../components/PrivateRoomPinModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ──────────────────────────────────────────────────────────────
//  Room Thumbnail Component with YouTube & Fallback Support
// ──────────────────────────────────────────────────────────────
const RoomCardThumbnail = ({ streamUrl, thumbnail, isCreator }) => {
  const thumbDetails = getYouTubeThumbnailDetails(streamUrl);
  const maxresUrl = thumbDetails?.maxresUrl || null;
  const fallbackUri = thumbDetails?.fallbackUrl || null;
  const initialUri = (thumbnail && typeof thumbnail === 'string' && thumbnail.startsWith('http'))
    ? thumbnail
    : maxresUrl;

  const [imgUri, setImgUri] = useState(initialUri);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const nextUri = (thumbnail && typeof thumbnail === 'string' && thumbnail.startsWith('http'))
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
        <Ionicons name="film" size={22} color="#FFF" />
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
  const initialUri = (thumbnail && typeof thumbnail === 'string' && thumbnail.startsWith('http'))
    ? thumbnail
    : maxresUrl;

  const [imgUri, setImgUri] = useState(initialUri);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const nextUri = (thumbnail && typeof thumbnail === 'string' && thumbnail.startsWith('http'))
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
//  Room Card Component
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

  const participantCount = item?.participants?.length || 0;

  return (
    <Swipeable renderRightActions={renderRightActions}>
      <TouchableOpacity activeOpacity={0.85} style={styles.roomCard} onPress={onPress}>
        {/* Left accent strip */}
        <LinearGradient
          colors={isCreator ? ['#F59E0B', '#D97706'] : [colors.GRADIENT_START, colors.GRADIENT_END]}
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
            <Text style={styles.roomName} numberOfLines={1}>{item.name}</Text>
            <View style={styles.roomMeta}>
              <MaterialIcons name="person" size={13} color={colors.SUB_TITLE_COLOR} />
              <Text style={styles.roomCreator} numberOfLines={1}>
                {isCreator ? 'Created by you' : `by ${item.creator?.userName || 'Host'}`}
              </Text>
            </View>
            <View style={styles.roomParticipantRow}>
              <MaterialIcons name="group" size={13} color="#38BDF8" />
              <Text style={styles.roomParticipantText}>
                {participantCount} {participantCount === 1 ? 'viewer' : 'viewers'}
              </Text>
            </View>
          </View>

          {/* Right side decorations */}
          <View style={styles.roomCardRight}>
            {isCreator && (
              <View style={styles.creatorBadge}>
                <Ionicons name="star" size={10} color="#FBBF24" />
                <Text style={styles.creatorBadgeText}>Host</Text>
              </View>
            )}
            <MaterialIcons name="chevron-right" size={22} color="#64748B" />
          </View>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
};

// ──────────────────────────────────────────────────────────────
//  Home Screen
// ──────────────────────────────────────────────────────────────
const HomeScreen = () => {
  const [rooms, setRooms] = useState([]);
  const [filterType, setFilterType] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [isJoinModalVisible, setIsJoinModalVisible] = useState(false);
  const [isSearchModalVisible, setIsSearchModalVisible] = useState(false);
  const [isPinModalVisible, setIsPinModalVisible] = useState(false);
  const [selectedPrivateRoom, setSelectedPrivateRoom] = useState(null);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

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

  // Scalable Room Fetching for 20M / 5M DAU scale:
  // 1. Listen to user's personal rooms at user_rooms/${currentUser.uid} (O(1) bandwidth)
  // 2. Query recent screening rooms with limitToLast(50) indexed on createdAt
  useEffect(() => {
    const currentUser = auth().currentUser;
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
        return isCreator || isParticipant;
      });
      const roomsWithDates = roomsArray.map(room => ({
        ...room,
        createdAt: room.createdAt || new Date().toISOString(),
      }));
      setRooms(roomsWithDates);
    };

    // User's dedicated room partition (O(1) isolated read)
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
  }, []);

  // Delete Room Logic with multi-path atomic purge
  const deleteRoom = async (roomId) => {
    try {
      const currentUser = auth().currentUser;
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

  const navigateToRoom = (item) => {
    const currentUser = auth().currentUser;
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

  const onRoomPress = (item) => {
    const currentUser = auth().currentUser;
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

  // Filter & Sort Logic (Optimized with useMemo for Zero-Lag)
  const filtered = useMemo(() => {
    const currentUser = auth().currentUser;
    if (!currentUser) return [];

    let list = [...rooms];

    if (filterType === 'created') {
      list = list.filter(r => r.creator?.email === currentUser.email);
    } else if (filterType === 'invited') {
      list = list.filter(
        r => r.creator?.email !== currentUser.email && r.participants?.includes(currentUser.email)
      );
    } else if (filterType === 'live') {
      list = list.filter(r => r.isStreaming || r.status === 'active');
    } else if (filterType === 'scheduled') {
      list = list.filter(r => r.isScheduled || r.status === 'scheduled');
    }

    return list.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        case 'oldest':
          return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
        case 'alphabetical':
          return (a.name || '').localeCompare(b.name || '');
        default:
          return 0;
      }
    });
  }, [rooms, filterType, sortBy]);

  const sortLabels = { newest: 'Newest', oldest: 'Oldest', alphabetical: 'A-Z' };
  const cycleSortBy = () => {
    const next = { newest: 'oldest', oldest: 'alphabetical', alphabetical: 'newest' };
    setSortBy(next[sortBy]);
  };

  const currentUser = auth().currentUser;

  // Handle Hero Banner Join Party Action
  const handleHeroJoin = () => {
    if (filtered.length > 0) {
      onRoomPress(filtered[0]);
    } else {
      navigation.navigate('CreateRoom');
    }
  };

  const safeTopPadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 12
  ) + 8;

  return (
    <View style={styles.container}>
      <StatusBar
        backgroundColor={colors.BACKGROUND_COLOR}
        barStyle="light-content"
        translucent
      />

      {/* Ambient Top Glow - exact pattern from Login & SignUp screens */}
      <View style={styles.ambientTopGlow} pointerEvents="none">
        <LinearGradient
          colors={['rgba(124, 58, 237, 0.18)', 'rgba(0, 122, 255, 0.08)', 'transparent']}
          style={StyleSheet.absoluteFillObject}
        />
      </View>

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <View style={[styles.headerContainer, { paddingTop: safeTopPadding }]}>
        <View style={styles.headerInner}>
          {/* Logo Mark & Text */}
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
              <Text style={styles.logoCine}>CINE</Text>
              <Text style={styles.logoSync}>SYNC</Text>
            </View>
          </View>

          {/* Header Right Actions */}
          <View style={styles.headerRightActions}>
            {/* Cinema Spotlight Search Trigger */}
            <TouchableOpacity
              style={styles.headerSearchBtn}
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
        {/* ── HERO FEATURED WATCH PARTY ──────────────────────────── */}
        {filtered.length > 0 ? (
          (() => {
            const featuredRoom = filtered[0];
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
                  {featuredRoom.isStreaming ? (
                    <View style={styles.liveBadge}>
                      <Animated.View style={[styles.liveDot, animatedPulseStyle]} />
                      <Text style={styles.liveBadgeText}>LIVE SYNC</Text>
                    </View>
                  ) : (
                    <View style={[styles.liveBadge, { backgroundColor: 'rgba(56, 189, 248, 0.2)', borderColor: 'rgba(56, 189, 248, 0.4)' }]}>
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
                  <Text style={styles.heroCategory}>
                    {featuredRoom.isStreaming ? 'FEATURED SCREENING' : 'ACTIVE WATCH PARTY'}
                  </Text>
                  <Text style={styles.heroTitle} numberOfLines={1}>
                    {featuredRoom.name}
                  </Text>

                  <View style={styles.heroStatsRow}>
                    <View style={styles.heroStatItem}>
                      <MaterialIcons name="groups" size={15} color="#93C5FD" />
                      <Text style={styles.heroStatText}>
                        {participantCount} {participantCount === 1 ? 'viewer' : 'viewers'}
                      </Text>
                    </View>
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
                      colors={['#4B8EFF', '#7C3AED']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.heroCtaGradient}
                    >
                      <Ionicons
                        name={featuredRoom.isStreaming ? 'play' : 'enter-outline'}
                        size={18}
                        color="#FFF"
                      />
                      <Text style={styles.heroCtaText}>
                        {featuredRoom.isStreaming ? 'Join Party Now' : 'Enter Room'}
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
                  <View style={[styles.spatialBadge, { backgroundColor: 'rgba(251, 191, 36, 0.15)', borderColor: 'rgba(251, 191, 36, 0.3)' }]}>
                    <Ionicons name="sparkles" size={13} color="#FBBF24" />
                    <Text style={[styles.spatialBadgeText, { color: '#FBBF24' }]}>PREMIERE LOUNGE</Text>
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

        {/* ── CINEMA CATEGORY FILTERS & QUICK SORT ROW ───────────── */}
        <View style={styles.categoryFilterSection}>
          <View style={styles.categoryFilterRow}>
            <View style={styles.categoryScrollContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterScroll}
              >
                {[
                  { key: 'all', label: 'All Rooms', icon: 'apps' },
                  { key: 'live', label: 'Live Now', icon: 'stream', isLive: true },
                  { key: 'created', label: 'My Rooms', icon: 'movie-creation' },
                  { key: 'invited', label: 'Invited', icon: 'group' },
                  { key: 'scheduled', label: 'Scheduled', icon: 'event' },
                ].map(f => {
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

        {/* ── ACTIVE ROOMS LIST ─────────────────────────────────── */}
        <View style={styles.activeSection}>
          <View style={styles.activeHeaderRow}>
            <View style={styles.activeTitleWrap}>
              <MaterialIcons name="stream" size={20} color="#1D8CF8" />
              <Text style={styles.activeTitle}>Active Rooms</Text>
              <View style={styles.roomCountBadge}>
                <Text style={styles.roomCountText}>{filtered.length}</Text>
              </View>
            </View>
            <Text style={styles.activeSubtitle}>Live Now</Text>
          </View>

          {filtered.length > 0 ? (
            <View style={styles.listContainer}>
              {filtered.map((item, index) => {
                const isCreator = item.creator.email === currentUser?.email;
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

      {/* ── 6-DIGIT JOIN BY CODE MODAL (Isolated State & Zero-Lag) ── */}
      <JoinByCodeModal
        visible={isJoinModalVisible}
        onClose={() => setIsJoinModalVisible(false)}
        onJoinRoom={onRoomPress}
      />

      {/* ── CINEMA SPOTLIGHT SEARCH MODAL (Concept 3 - Isolated Zero-Lag) ── */}
      <CinemaSearchModal
        visible={isSearchModalVisible}
        onClose={() => setIsSearchModalVisible(false)}
        rooms={rooms}
        onSelectRoom={onRoomPress}
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
    paddingBottom: 110,
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

  // ── Cinema Category Filters & Quick Sort Row ──────
  categoryFilterSection: {
    paddingHorizontal: 16,
    marginTop: 16,
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
    paddingHorizontal: 14,
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
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  roomCountBadge: {
    backgroundColor: 'rgba(0, 122, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomCountText: {
    color: colors.PRIMARY_COLOR,
    fontSize: 11,
    fontWeight: '800',
  },

  // ── Hero Banner ───────────────────
  heroWrap: {
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 20,
    overflow: 'hidden',
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
  listContainer: {
    gap: 10,
  },

  // ── Room Card ─────────────────────
  roomCard: {
    backgroundColor: '#131422',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1F2136',
    overflow: 'hidden',
    flexDirection: 'row',
  },
  roomAccentStrip: {
    width: 5,
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
  },
  roomThumbnailGradient: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roomThumbnailImage: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#1E1B4B',
  },
  roomThumbnailOverlay: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  roomInfo: {
    flex: 1,
    gap: 2,
  },
  roomName: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  roomMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  roomCreator: {
    color: '#94A3B8',
    fontSize: 12,
  },
  roomParticipantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  roomParticipantText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
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
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  creatorBadgeText: {
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Swipe Delete ──────────────────
  swipeDeleteBtn: {
    justifyContent: 'center',
    marginLeft: 10,
    borderRadius: 18,
    overflow: 'hidden',
  },
  swipeDeleteGradient: {
    width: 80,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
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
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default HomeScreen;