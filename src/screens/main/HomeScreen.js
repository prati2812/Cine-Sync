import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { auth } from '../../config/firebase';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Logo from '../../components/Logo1';
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
import { getDatabase, ref, set, onValue, get, query, orderByChild, equalTo } from 'firebase/database';
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
          colors={isCreator ? [colors.GRADIENT_START, colors.GRADIENT_END] : [colors.FILM_GOLD, '#FF8C00']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.roomAccentStrip}
        />

        <View style={styles.roomCardInner}>
          {/* Thumbnail */}
          <View style={styles.roomThumbnailWrap}>
            <LinearGradient
              colors={isCreator ? [colors.GRADIENT_START, colors.GRADIENT_END] : [colors.FILM_GOLD, '#FF8C00']}
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
                {isCreator ? 'Created by you' : `by ${item.creator?.userName}`}
              </Text>
            </View>
            {participantCount > 0 && (
              <View style={styles.roomParticipantRow}>
                <MaterialIcons name="people" size={13} color={colors.CYAN_ACCENT} />
                <Text style={styles.roomParticipantText}>
                  {participantCount} {participantCount === 1 ? 'viewer' : 'viewers'}
                </Text>
              </View>
            )}
          </View>

          {/* Right side decorations */}
          <View style={styles.roomCardRight}>
            {isCreator && (
              <View style={styles.creatorBadge}>
                <Ionicons name="star" size={10} color={colors.FILM_GOLD} />
                <Text style={styles.creatorBadgeText}>Host</Text>
              </View>
            )}
            <MaterialIcons name="chevron-right" size={22} color={colors.MUTED_COLOR} />
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
  const navigation = useNavigation();

  // Empty state pulse
  const emptyStateScale = useSharedValue(1);

  useEffect(() => {
    emptyStateScale.value = withRepeat(
      withSpring(1.08, { duration: 1200 }),
      -1,
      true
    );
  }, []);

  useEffect(() => {
    const db = getDatabase();
    const roomsRef = ref(db, 'rooms');
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const unsubscribe = onValue(roomsRef, (snapshot) => {
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

    return () => unsubscribe();
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: emptyStateScale.value }],
  }));

  // ── Firebase logic ──────────────────────────────────────────
  const deleteRoom = async (roomId) => {
    try {
      const db = getDatabase();
      const currentUser = auth.currentUser;
      const roomRef = ref(db, `rooms/${roomId}`);
      const roomSnapshot = await get(roomRef);
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
            await set(roomRef, null);
            Alert.alert('Done', 'Room deleted successfully');
          },
        },
      ]);
    } catch (error) {
      console.error('Error deleting room:', error);
      Alert.alert('Error', 'Failed to delete room');
    }
  };

  const onRoomPress = (item) => {
    const currentUser = auth.currentUser;
    const isCreator = item.creator.email === currentUser?.email;

    if (isCreator) {
      Alert.alert('Screening Room', 'What would you like to do?', [
        {
          text: 'Join Room',
          onPress: () => {
            if (item?.participants?.length === 0 || item?.participants === undefined) {
              navigation.navigate('StreamInfo', {
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
          },
        },
        {
          text: 'Edit Room',
          onPress: () => navigation.navigate('CreateRoom', { room: item }),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      navigation.navigate('WaitingScreen', {
        roomId: item.roomId,
        roomName: item.name,
        streamUrl: item.streamUrl,
      });
    }
  };

  // ── Filtering & sorting ─────────────────────────────────────
  const getFilteredRooms = () => {
    const currentUser = auth.currentUser;
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
  const currentUser = auth.currentUser;

  // ── Render ──────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor={colors.BACKGROUND_COLOR} barStyle="light-content" />

      {/* ── Header ─────────────────────────────────────────── */}
      <View style={styles.header}>
        <Logo size="small" />
      </View>

      {/* ── Search ────────────────────────────────────────── */}
      <View style={styles.searchRow}>
        <View style={[styles.searchBox, searchFocused && styles.searchBoxFocused]}>
          <MaterialIcons name="search" size={20} color={searchFocused ? colors.PRIMARY_COLOR : colors.MUTED_COLOR} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search rooms..."
            placeholderTextColor={colors.MUTED_COLOR}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7}>
              <MaterialIcons name="close" size={18} color={colors.MUTED_COLOR} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Filters ───────────────────────────────────────── */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {[
            { key: 'all', label: 'All Rooms', icon: 'apps' },
            { key: 'created', label: 'My Rooms', icon: 'movie-creation' },
            { key: 'invited', label: 'Invited', icon: 'group' },
          ].map(f => (
            <TouchableOpacity
              key={f.key}
              activeOpacity={0.8}
              style={styles.filterChipWrap}
              onPress={() => setFilterType(f.key)}
            >
              {filterType === f.key ? (
                <LinearGradient
                  colors={[colors.GRADIENT_START, colors.GRADIENT_END]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.filterChipActive}
                >
                  <MaterialIcons name={f.icon} size={16} color="#FFF" />
                  <Text style={styles.filterChipTextActive}>{f.label}</Text>
                </LinearGradient>
              ) : (
                <View style={styles.filterChip}>
                  <MaterialIcons name={f.icon} size={16} color={colors.SUB_TITLE_COLOR} />
                  <Text style={styles.filterChipText}>{f.label}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── Sort ──────────────────────────────────────────── */}
      <View style={styles.sortRow}>
        <TouchableOpacity activeOpacity={0.7} style={styles.sortBtn} onPress={cycleSortBy}>
          <MaterialIcons name="sort" size={18} color={colors.FILM_GOLD} />
          <Text style={styles.sortLabel}>{sortLabels[sortBy]}</Text>
          <MaterialIcons name="swap-vert" size={16} color={colors.MUTED_COLOR} />
        </TouchableOpacity>
        <Text style={styles.roomCount}>
          {filtered.length} {filtered.length === 1 ? 'room' : 'rooms'}
        </Text>
      </View>

      {/* ── Room List ─────────────────────────────────────── */}
      <View style={styles.content}>
        {filtered.length > 0 ? (
          <FlatList
            data={filtered}
            renderItem={({ item, index }) => {
              const isCreator = item.creator.email === currentUser?.email;
              return (
                <RoomCard
                  item={item}
                  isCreator={isCreator}
                  index={index}
                  onPress={() => onRoomPress(item)}
                  onDelete={() => deleteRoom(item.roomId)}
                />
              );
            }}
            keyExtractor={item => item.roomId}
            contentContainerStyle={styles.listPadding}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <View style={styles.emptyContainer}>
            <Animated.View style={[styles.emptyIconCircle, animatedStyle]}>
              <Ionicons name="film-outline" size={40} color={colors.FILM_GOLD} />
            </Animated.View>
            <Text style={styles.emptyTitle}>
              {searchQuery ? 'No rooms found' : 'No Screening Rooms'}
            </Text>
            <Text style={styles.emptySub}>
              {searchQuery
                ? 'Try a different search term'
                : 'Create a room and invite friends to watch together!'}
            </Text>
          </View>
        )}
      </View>

      {/* ── FAB ───────────────────────────────────────────── */}
      {filterType !== 'invited' && (
        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.fabWrap}
          onPress={() => navigation.navigate('CreateRoom')}
        >
          <LinearGradient
            colors={[colors.GRADIENT_START, colors.GRADIENT_END]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fab}
          >
            <MaterialIcons name="add" size={28} color="#FFF" />
          </LinearGradient>
        </TouchableOpacity>
      )}
    </SafeAreaView>
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

  // ── Header ────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.BORDER_SUBTLE,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.PRIMARY_GLOW,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.TITLE_COLOR,
    letterSpacing: 0.5,
  },
  headerSub: {
    fontSize: 13,
    color: colors.SUB_TITLE_COLOR,
    marginTop: 2,
  },

  // ── Search ────────────────────────
  searchRow: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 4,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,
    borderWidth: 1.5,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
  },
  searchBoxFocused: {
    borderColor: colors.BORDER_ACTIVE,
    backgroundColor: colors.CARD_COLOR,
  },
  searchInput: {
    flex: 1,
    color: colors.TITLE_COLOR,
    marginLeft: 10,
    fontSize: 15,
    fontWeight: '400',
  },

  // ── Filter Chips ──────────────────
  filterRow: {
    paddingTop: 12,
    paddingBottom: 4,
  },
  filterScroll: {
    paddingLeft: 20,
    paddingRight: 20,
    gap: 8,
  },
  filterChipWrap: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_COLOR,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
    gap: 6,
  },
  filterChipActive: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  filterChipText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Sort ──────────────────────────
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 6,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
  },
  sortLabel: {
    color: colors.TITLE_COLOR,
    fontSize: 13,
    fontWeight: '600',
  },
  roomCount: {
    color: colors.MUTED_COLOR,
    fontSize: 12,
    fontWeight: '500',
  },

  // ── Content ───────────────────────
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  listPadding: {
    paddingVertical: 8,
    paddingBottom: 100,
  },

  // ── Room Card ─────────────────────
  roomCard: {
    backgroundColor: colors.CARD_COLOR,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
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
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  roomThumbnailWrap: {
    marginRight: 14,
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
  },
  roomName: {
    color: colors.TITLE_COLOR,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  roomMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 3,
  },
  roomCreator: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    fontWeight: '500',
  },
  roomParticipantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  roomParticipantText: {
    color: colors.CYAN_ACCENT,
    fontSize: 12,
    fontWeight: '600',
  },
  roomCardRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 6,
    marginLeft: 8,
  },
  creatorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.FILM_GOLD_GLOW,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 3,
  },
  creatorBadgeText: {
    color: colors.FILM_GOLD,
    fontSize: 10,
    fontWeight: '800',
  },

  // ── Swipe Delete ──────────────────
  swipeDeleteBtn: {
    justifyContent: 'center',
    marginLeft: 10,
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  swipeDeleteGradient: {
    width: 80,
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.FILM_GOLD_GLOW,
  },
  emptyTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySub: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── FAB ───────────────────────────
  fabWrap: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default HomeScreen;