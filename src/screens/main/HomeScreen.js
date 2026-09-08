import React, { useState, useEffect } from 'react';
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [searchFocused, setSearchFocused] = useState(false);
  const [roomCodeInput, setRoomCodeInput] = useState('');
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

  // Fetch rooms from Firebase
  useEffect(() => {
    const roomsRef = database().ref('rooms');
    const currentUser = auth().currentUser;
    if (!currentUser) return;

    const unsubscribe = roomsRef.on('value', (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const roomsArray = Object.values(data).filter(room => {
          const isCreator = room.creator.email === currentUser.email;
          const isParticipant = room.participants?.includes(currentUser.email);
          return isCreator || isParticipant;
        });
        const roomsWithDates = roomsArray.map(room => ({
          ...room,
          createdAt: room.createdAt || new Date().toISOString(),
        }));
        setRooms(roomsWithDates);
      } else {
        setRooms([]);
      }
    });

    return () => roomsRef.off('value', unsubscribe);
  }, []);

  // Delete Room Logic
  const deleteRoom = async (roomId) => {
    try {
      const currentUser = auth().currentUser;
      const roomRef = database().ref(`rooms/${roomId}`);
      const roomSnapshot = await roomRef.once('value');
      const roomData = roomSnapshot.val();

      if (roomData.creator.email !== currentUser.email) {
        Alert.alert('Error', 'Only the room creator can delete this room');
        return;
      }

      Alert.alert('Delete Room', 'Are you sure you want to delete this screening room?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await roomRef.set(null);
            Alert.alert('Done', 'Room deleted successfully');
          },
        },
      ]);
    } catch (error) {
      console.error('Error deleting room:', error);
      Alert.alert('Error', 'Failed to delete room');
    }
  };

  // Join Room by Code
  const handleJoinByCode = async () => {
    if (!roomCodeInput.trim()) {
      Alert.alert('Room Code Required', 'Please enter a valid room code.');
      return;
    }
    const code = roomCodeInput.trim();
    try {
      const roomRef = database().ref(`rooms/${code}`);
      const snapshot = await roomRef.once('value');
      if (snapshot.exists()) {
        const roomData = snapshot.val();
        setRoomCodeInput('');
        onRoomPress(roomData);
      } else {
        // Search by roomId property
        const allRoomsRef = database().ref('rooms');
        const allSnapshot = await allRoomsRef.once('value');
        const allData = allSnapshot.val();
        let foundRoom = null;
        if (allData) {
          foundRoom = Object.values(allData).find(
            r => r.roomId === code || r.name.toLowerCase() === code.toLowerCase()
          );
        }
        if (foundRoom) {
          setRoomCodeInput('');
          onRoomPress(foundRoom);
        } else {
          Alert.alert('Room Not Found', `No active room found with code "${code}".`);
        }
      }
    } catch (err) {
      console.error('Error joining room by code:', err);
      Alert.alert('Error', 'Unable to join room. Please check the code.');
    }
  };

  const onRoomPress = (item) => {
    const currentUser = auth().currentUser;
    const isCreator = item.creator.email === currentUser?.email;

    if (item.isStreaming) {
      navigation.navigate('Streaming', {
        roomId: item.roomId,
        roomName: item.name,
        streamUrl: item.streamUrl,
      });
      return;
    }

    if (isCreator) {
      if (!item?.participants?.length) {
        navigation.navigate('Streaming', {
          roomId: item.roomId,
          roomName: item.name,
          streamUrl: item.streamUrl,
        });
      } else {
        navigation.navigate('WaitingScreen', {
          roomId: item.roomId,
          roomName: item.name,
          streamUrl: item.streamUrl,
        });
      }
    } else {
      navigation.navigate('WaitingScreen', {
        roomId: item.roomId,
        roomName: item.name,
        streamUrl: item.streamUrl,
      });
    }
  };

  // Filter & Sort Logic
  const getFilteredRooms = () => {
    const currentUser = auth().currentUser;
    if (!currentUser) return [];

    let filteredRooms = [...rooms];
    if (filterType === 'created') {
      filteredRooms = rooms.filter(room => room.creator.email === currentUser.email);
    } else if (filterType === 'invited') {
      filteredRooms = rooms.filter(
        room => room.creator.email !== currentUser.email && room.participants?.includes(currentUser.email)
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filteredRooms = filteredRooms.filter(
        room => room.name.toLowerCase().includes(q) || room.creator.email.toLowerCase().includes(q)
      );
    }

    return filteredRooms.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.createdAt) - new Date(a.createdAt);
        case 'oldest':
          return new Date(a.createdAt) - new Date(b.createdAt);
        case 'alphabetical':
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });
  };

  const sortLabels = { newest: 'Newest', oldest: 'Oldest', alphabetical: 'A-Z' };
  const cycleSortBy = () => {
    const next = { newest: 'oldest', oldest: 'alphabetical', alphabetical: 'newest' };
    setSortBy(next[sortBy]);
  };

  const filtered = getFilteredRooms();
  const currentUser = auth().currentUser;

  // Handle Hero Banner Join Party Action
  const handleHeroJoin = () => {
    if (filtered.length > 0) {
      onRoomPress(filtered[0]);
    } else {
      navigation.navigate('CreateRoom');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#090A12" barStyle="light-content" />

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <View style={[styles.headerContainer, { paddingTop: Math.max(insets.top, 10) }]}>
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

          {/* Profile Shortcut */}
          <TouchableOpacity
            style={styles.profileAvatarBtn}
            onPress={() => navigation.navigate('Profile')}
            activeOpacity={0.8}
          >
            <Ionicons name="person-circle" size={32} color="#1D8CF8" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── SEARCH & FILTER CONTROLS ──────────────────────────── */}
        <View style={styles.searchSection}>
          <View style={[styles.searchBox, searchFocused && styles.searchBoxFocused]}>
            <MaterialIcons
              name="search"
              size={20}
              color={searchFocused ? '#1D8CF8' : '#707693'}
              style={{ marginRight: 10 }}
            />
            <TextInput
              style={styles.searchInput}
              placeholder="Search rooms..."
              placeholderTextColor="#5F647D"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7}>
                <MaterialIcons name="close" size={18} color="#707693" />
              </TouchableOpacity>
            )}
          </View>

          {/* Filter Chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            {[
              { key: 'all', label: 'All Rooms', icon: 'apps' },
              { key: 'created', label: 'My Rooms', icon: 'movie-creation' },
              { key: 'invited', label: 'Invited', icon: 'group' },
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
                      colors={['#1D8CF8', '#0052FF']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.filterChipActive}
                    >
                      <MaterialIcons name={f.icon} size={16} color="#FFF" />
                      <Text style={styles.filterChipTextActive}>{f.label}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={styles.filterChip}>
                      <MaterialIcons name={f.icon} size={16} color="#94A3B8" />
                      <Text style={styles.filterChipText}>{f.label}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Sort & Room Count */}
          <View style={styles.sortRow}>
            <TouchableOpacity activeOpacity={0.7} style={styles.sortBtn} onPress={cycleSortBy}>
              <MaterialIcons name="sort" size={16} color="#FBBF24" />
              <Text style={styles.sortLabel}>{sortLabels[sortBy]}</Text>
              <MaterialIcons name="swap-vert" size={14} color="#94A3B8" />
            </TouchableOpacity>
            <Text style={styles.roomCount}>
              {filtered.length} {filtered.length === 1 ? 'room' : 'rooms'}
            </Text>
          </View>
        </View>

        {/* ── HERO FEATURED WATCH PARTY ──────────────────────────── */}
        <View style={styles.heroWrap}>
          <ImageBackground
            source={{
              uri: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=1000&auto=format&fit=crop',
            }}
            style={styles.heroBackground}
            imageStyle={{ borderRadius: 20 }}
          >
            <LinearGradient
              colors={['rgba(19, 19, 27, 0.2)', 'rgba(19, 19, 27, 0.95)']}
              style={styles.heroGradient}
            >
              {/* Top Badges */}
              <View style={styles.heroBadgeRow}>
                <View style={styles.liveBadge}>
                  <Animated.View style={[styles.liveDot, animatedPulseStyle]} />
                  <Text style={styles.liveBadgeText}>LIVE SYNC</Text>
                </View>
                <View style={styles.spatialBadge}>
                  <Ionicons name="headset-outline" size={13} color="#4CD7F6" />
                  <Text style={styles.spatialBadgeText}>Spatial Audio 3D</Text>
                </View>
              </View>

              {/* Title & Info */}
              <View style={styles.heroDetails}>
                <Text style={styles.heroCategory}>FEATURED SCREENING</Text>
                <Text style={styles.heroTitle}>Inception - Live VIP Lounge</Text>

                <View style={styles.heroStatsRow}>
                  <View style={styles.heroStatItem}>
                    <MaterialIcons name="groups" size={15} color="#93C5FD" />
                    <Text style={styles.heroStatText}>1.2k watching</Text>
                  </View>
                  <Text style={styles.heroStatDivider}>•</Text>
                  <Text style={styles.heroHostText}>Host: <Text style={styles.heroHostName}>NolanFan99</Text></Text>
                  <Text style={styles.heroStatDivider}>•</Text>
                  <View style={styles.heroStatItem}>
                    <MaterialIcons name="sync" size={13} color="#4CD7F6" />
                    <Text style={styles.heroTimeText}>01:24:18 / 02:28:00</Text>
                  </View>
                </View>

                {/* Primary CTA */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleHeroJoin}
                  style={styles.heroCtaWrap}
                >
                  <LinearGradient
                    colors={['#4B8EFF', '#7C3AED']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.heroCtaGradient}
                  >
                    <Ionicons name="play" size={20} color="#FFF" />
                    <Text style={styles.heroCtaText}>Join Party Now</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </ImageBackground>
        </View>

        {/* ── JOIN VIA ROOM CODE ─────────────────────────────────── */}
        <View style={styles.codeSection}>
          <View style={styles.codeInputBox}>
            <MaterialIcons name="tag" size={22} color="#4CD7F6" style={{ marginRight: 6 }} />
            <TextInput
              style={styles.codeInput}
              placeholder="Enter 6-digit Room Code..."
              placeholderTextColor="#64748B"
              value={roomCodeInput}
              onChangeText={text => setRoomCodeInput(text.toUpperCase())}
              autoCapitalize="characters"
              maxLength={8}
            />
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.codeJoinBtn}
              onPress={handleJoinByCode}
            >
              <Text style={styles.codeJoinText}>Join</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── ACTIVE ROOMS LIST ─────────────────────────────────── */}
        <View style={styles.activeSection}>
          <View style={styles.activeHeaderRow}>
            <View style={styles.activeTitleWrap}>
              <MaterialIcons name="stream" size={20} color="#1D8CF8" />
              <Text style={styles.activeTitle}>Active Rooms</Text>
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
              <View style={styles.emptyIconCircle}>
                <Ionicons name="film-outline" size={36} color="#FBBF24" />
              </View>
              <Text style={styles.emptyTitle}>
                {searchQuery ? 'No matching rooms found' : 'No Active Rooms'}
              </Text>
              <Text style={styles.emptySub}>
                {searchQuery
                  ? 'Try a different search keyword'
                  : 'Tap the + button to create your first watch party!'}
              </Text>
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
    </View>
  );
};

// ──────────────────────────────────────────────────────────────
//  Styles
// ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090A12',
  },
  scrollContent: {
    paddingBottom: 110,
  },

  // ── Header ────────────────────────
  headerContainer: {
    backgroundColor: '#090A12',
    borderBottomWidth: 1,
    borderBottomColor: '#1B1C2B',
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
  profileAvatarBtn: {
    padding: 2,
  },

  // ── Search & Filters ──────────────
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121320',
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 46,
    borderWidth: 1,
    borderColor: '#202236',
  },
  searchBoxFocused: {
    borderColor: '#1D8CF8',
    backgroundColor: '#161726',
  },
  searchInput: {
    flex: 1,
    color: '#E4E1ED',
    fontSize: 14,
    fontWeight: '400',
  },

  filterScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  filterChipWrap: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: '#161726',
    borderWidth: 1,
    borderColor: '#23263B',
    gap: 6,
  },
  filterChipActive: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 14,
    gap: 6,
  },
  filterChipText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },

  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#161726',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#23263B',
  },
  sortLabel: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
  },
  roomCount: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
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

  // ── Code Section ──────────────────
  codeSection: {
    paddingHorizontal: 16,
    marginTop: 14,
  },
  codeInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131422',
    borderRadius: 16,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#1F2136',
  },
  codeInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
  },
  codeJoinBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 12,
  },
  codeJoinText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
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
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#161726',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.2)',
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