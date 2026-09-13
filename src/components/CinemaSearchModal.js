import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Easing,
  TextInput,
  ScrollView,
  Platform,
  StatusBar,
  Dimensions,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import colors from '../theme/Colors';
import { database } from '../config/firebase';
import { getYouTubeThumbnailDetails } from '../functions';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const QUICK_GENRES = [
  { label: 'Movies', icon: 'local-movies', query: 'Movies' },
  { label: 'Anime', icon: 'flash-on', query: 'Anime' },
  { label: 'Music', icon: 'music-note', query: 'Music' },
  { label: 'Sports', icon: 'sports-soccer', query: 'Sports' },
  { label: 'Gaming', icon: 'sports-esports', query: 'Gaming' },
];

const CinemaSearchModal = ({ visible, onClose, rooms = [], onSelectRoom, currentUserEmail }) => {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all'); // 'all', 'live', 'scheduled', 'my'
  const [selectedGenre, setSelectedGenre] = useState(null);
  const [serverResults, setServerResults] = useState([]);
  const [isSearchingServer, setIsSearchingServer] = useState(false);

  const inputRef = useRef(null);

  // Native Driver Animations
  const animOpacity = useRef(new Animated.Value(0)).current;
  const animSlide = useRef(new Animated.Value(24)).current;

  // Notch protection padding
  const safeTopPadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 12
  ) + 8;

  // Debounce input to guarantee 60/120 FPS
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 150);
    return () => clearTimeout(handler);
  }, [query]);

  // Scalable server-side indexed query on nameLower for 20M / 5M DAU scale
  useEffect(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q || q.length < 2) {
      setServerResults([]);
      setIsSearchingServer(false);
      return;
    }

    let isMounted = true;
    setIsSearchingServer(true);

    database()
      .ref('rooms')
      .orderByChild('nameLower')
      .startAt(q)
      .endAt(q + '\uf8ff')
      .limitToFirst(20)
      .once('value')
      .then(snapshot => {
        if (!isMounted) return;
        const val = snapshot.val();
        if (val) {
          setServerResults(Object.values(val));
        } else {
          setServerResults([]);
        }
      })
      .catch(err => {
        console.warn('Server room search error:', err);
      })
      .finally(() => {
        if (isMounted) setIsSearchingServer(false);
      });

    return () => {
      isMounted = false;
    };
  }, [debouncedQuery]);

  // Open/close animation
  useEffect(() => {
    if (visible) {
      setQuery('');
      setDebouncedQuery('');
      setServerResults([]);
      setSelectedFilter('all');
      setSelectedGenre(null);

      Animated.parallel([
        Animated.timing(animOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(animSlide, {
          toValue: 0,
          duration: 250,
          easing: Easing.out(Easing.back(1.05)),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setTimeout(() => inputRef.current?.focus(), 120);
      });
    } else {
      Animated.parallel([
        Animated.timing(animOpacity, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(animSlide, {
          toValue: 24,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, animOpacity, animSlide]);

  // Combined local + server rooms, deduplicated by roomId
  const combinedRooms = useMemo(() => {
    const map = new Map();
    (rooms || []).forEach(r => {
      if (r && r.roomId) map.set(r.roomId, r);
    });
    serverResults.forEach(r => {
      if (r && r.roomId) map.set(r.roomId, r);
    });
    return Array.from(map.values());
  }, [rooms, serverResults]);

  // Search & Filter Results
  const searchResults = useMemo(() => {
    if (!combinedRooms || combinedRooms.length === 0) return [];

    let list = [...combinedRooms];

    // Status filter
    if (selectedFilter === 'live') {
      list = list.filter(r => r.isStreaming || r.status === 'active');
    } else if (selectedFilter === 'scheduled') {
      list = list.filter(r => r.isScheduled || r.status === 'scheduled');
    } else if (selectedFilter === 'my') {
      list = list.filter(r => r.creator?.email === currentUserEmail);
    }

    // Genre filter
    if (selectedGenre) {
      list = list.filter(r => (r.genre || '').toLowerCase() === selectedGenre.toLowerCase());
    }

    // Text query
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.toLowerCase().trim();
      list = list.filter(r => {
        const titleMatch = (r.name || '').toLowerCase().includes(q);
        const hostMatch =
          (r.creator?.email || '').toLowerCase().includes(q) ||
          (r.creator?.userName || '').toLowerCase().includes(q);
        const genreMatch = (r.genre || '').toLowerCase().includes(q);
        const codeMatch = (r.roomId || '').toLowerCase().includes(q);
        return titleMatch || hostMatch || genreMatch || codeMatch;
      });
    }

    return list;
  }, [combinedRooms, debouncedQuery, selectedFilter, selectedGenre, currentUserEmail]);

  // Live status count
  const liveCount = useMemo(() => {
    return combinedRooms.filter(r => r.isStreaming || r.status === 'active').length;
  }, [combinedRooms]);

  const scheduledCount = useMemo(() => {
    return combinedRooms.filter(r => r.isScheduled || r.status === 'scheduled').length;
  }, [combinedRooms]);

  const handleSelectRoom = (room) => {
    onClose();
    if (onSelectRoom) {
      onSelectRoom(room);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      transparent
      statusBarTranslucent
      animationType="none"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        {/* Ambient Top Glow Linear Gradient */}
        <View style={styles.ambientTopGlow} pointerEvents="none">
          <LinearGradient
            colors={['rgba(124, 58, 237, 0.22)', 'rgba(0, 122, 255, 0.1)', 'transparent']}
            style={StyleSheet.absoluteFillObject}
          />
        </View>

        <Animated.View
          style={[
            styles.contentContainer,
            {
              paddingTop: safeTopPadding,
              opacity: animOpacity,
              transform: [{ translateY: animSlide }],
            },
          ]}
        >
          {/* ── TOP SEARCH INPUT ROW ── */}
          <View style={styles.searchHeaderBar}>
            <View style={styles.searchBox}>
              <MaterialIcons name="search" size={22} color={colors.PRIMARY_COLOR} />
              <TextInput
                ref={inputRef}
                style={styles.searchInput}
                placeholder="Search movies, rooms, hosts, genres..."
                placeholderTextColor={colors.MUTED_COLOR}
                value={query}
                onChangeText={setQuery}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {query.length > 0 && (
                <TouchableOpacity
                  onPress={() => setQuery('')}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="close" size={18} color={colors.MUTED_COLOR} />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              activeOpacity={0.75}
            >
              <Text style={styles.closeBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* ── QUICK STATUS PILLS ── */}
          <View style={styles.statusPillsRow}>
            <TouchableOpacity
              style={[
                styles.statusPill,
                selectedFilter === 'all' && styles.statusPillActive,
              ]}
              onPress={() => setSelectedFilter('all')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.statusPillText,
                  selectedFilter === 'all' && styles.statusPillTextActive,
                ]}
              >
                All ({rooms.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.statusPill,
                selectedFilter === 'live' && styles.statusPillActiveLive,
              ]}
              onPress={() => setSelectedFilter(selectedFilter === 'live' ? 'all' : 'live')}
              activeOpacity={0.8}
            >
              <View style={styles.liveDot} />
              <Text
                style={[
                  styles.statusPillText,
                  selectedFilter === 'live' && styles.statusPillTextActiveLive,
                ]}
              >
                Live Sync ({liveCount})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.statusPill,
                selectedFilter === 'scheduled' && styles.statusPillActiveGold,
              ]}
              onPress={() => setSelectedFilter(selectedFilter === 'scheduled' ? 'all' : 'scheduled')}
              activeOpacity={0.8}
            >
              <MaterialIcons
                name="event"
                size={13}
                color={selectedFilter === 'scheduled' ? colors.FILM_GOLD : colors.SUB_TITLE_COLOR}
              />
              <Text
                style={[
                  styles.statusPillText,
                  selectedFilter === 'scheduled' && styles.statusPillTextActiveGold,
                ]}
              >
                Premieres ({scheduledCount})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.statusPill,
                selectedFilter === 'my' && styles.statusPillActive,
              ]}
              onPress={() => setSelectedFilter(selectedFilter === 'my' ? 'all' : 'my')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.statusPillText,
                  selectedFilter === 'my' && styles.statusPillTextActive,
                ]}
              >
                My Rooms
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── ATMOSPHERE GENRE CHIPS ── */}
          <View style={styles.genreScrollWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.genreScroll}
            >
              {QUICK_GENRES.map((g) => {
                const isGenreSelected = selectedGenre === g.query;
                return (
                  <TouchableOpacity
                    key={g.query}
                    style={[
                      styles.genreChip,
                      isGenreSelected && styles.genreChipActive,
                    ]}
                    onPress={() => setSelectedGenre(isGenreSelected ? null : g.query)}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons
                      name={g.icon}
                      size={14}
                      color={isGenreSelected ? colors.TITLE_COLOR : colors.CYAN_ACCENT}
                    />
                    <Text
                      style={[
                        styles.genreLabel,
                        isGenreSelected && styles.genreLabelActive,
                      ]}
                    >
                      {g.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* ── RESULTS LIST OR EMPTY STATE ── */}
          <ScrollView
            style={styles.resultsScroll}
            contentContainerStyle={styles.resultsContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {searchResults.length > 0 ? (
              <>
                <View style={styles.resultsHeaderRow}>
                  <Text style={styles.resultsHeading}>
                    {query.trim() || selectedGenre || selectedFilter !== 'all'
                      ? 'MATCHING SCREENINGS'
                      : 'ALL SCREENING ROOMS'}
                  </Text>
                  <Text style={styles.resultsCountBadge}>
                    {searchResults.length} {searchResults.length === 1 ? 'room' : 'rooms'}
                  </Text>
                </View>

                {searchResults.map((room) => {
                  const isLive = room.isStreaming || room.status === 'active';
                  const thumb =
                    getYouTubeThumbnailDetails(room.streamUrl)?.mqUrl ||
                    room.thumbnail ||
                    '🎬';
                  const participantCount =
                    (room.participants?.length ||
                      (room.participants ? Object.keys(room.participants).length : 0)) + 1;
                  const hostName =
                    room.creator?.userName ||
                    room.creator?.name ||
                    (room.creator?.email ? room.creator.email.split('@')[0] : 'Host');

                  return (
                    <TouchableOpacity
                      key={room.roomId}
                      style={styles.roomResultCard}
                      onPress={() => handleSelectRoom(room)}
                      activeOpacity={0.8}
                    >
                      {/* Thumbnail / Poster Box */}
                      <View style={styles.roomThumbBox}>
                        {thumb && typeof thumb === 'string' && thumb.startsWith('http') ? (
                          <Image
                            source={{ uri: thumb }}
                            style={StyleSheet.absoluteFillObject}
                            resizeMode="cover"
                          />
                        ) : (
                          <MaterialIcons
                            name={
                              room.genre === 'Anime'
                                ? 'flash-on'
                                : room.genre === 'Music'
                                ? 'music-note'
                                : room.genre === 'Gaming'
                                ? 'sports-esports'
                                : room.genre === 'Sports'
                                ? 'sports-soccer'
                                : 'local-movies'
                            }
                            size={22}
                            color={colors.CYAN_ACCENT}
                          />
                        )}
                        {isLive && (
                          <View style={styles.thumbLiveBadge}>
                            <View style={styles.thumbLiveDot} />
                            <Text style={styles.thumbLiveText}>LIVE</Text>
                          </View>
                        )}
                      </View>

                      {/* Info Col */}
                      <View style={styles.roomInfoCol}>
                        <View style={styles.roomTitleRow}>
                          <Text style={styles.roomTitleText} numberOfLines={1}>
                            {room.name || 'Untitled Party'}
                          </Text>
                          {room.isPrivate && (
                            <MaterialIcons name="lock" size={13} color={colors.FILM_GOLD} />
                          )}
                        </View>

                        <Text style={styles.roomHostText} numberOfLines={1}>
                          Host: <Text style={styles.roomHostName}>{hostName}</Text>
                        </Text>

                        <View style={styles.roomMetaTagsRow}>
                          <View style={styles.roomGenrePill}>
                            <Text style={styles.roomGenrePillText}>
                              {room.genre || 'Movies'}
                            </Text>
                          </View>
                          <View style={styles.roomAudiencePill}>
                            <Ionicons name="people" size={11} color={colors.SUB_TITLE_COLOR} />
                            <Text style={styles.roomAudienceText}>{participantCount}</Text>
                          </View>
                        </View>
                      </View>

                      {/* Join Action Arrow */}
                      <View style={styles.roomJoinActionBtn}>
                        <MaterialIcons
                          name="arrow-forward-ios"
                          size={13}
                          color={colors.CYAN_ACCENT}
                        />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            ) : (
              <View style={styles.emptyResultsBox}>
                <View style={styles.emptyIconWrap}>
                  <MaterialIcons name="search-off" size={32} color={colors.FILM_GOLD} />
                </View>
                <Text style={styles.emptyHeading}>No Screenings Found</Text>
                <Text style={styles.emptySubheading}>
                  {query
                    ? `No rooms matched "${query}". Try another title or host.`
                    : 'No rooms match the selected atmosphere filters.'}
                </Text>

                {(query || selectedGenre || selectedFilter !== 'all') && (
                  <TouchableOpacity
                    style={styles.resetFiltersBtn}
                    onPress={() => {
                      setQuery('');
                      setSelectedGenre(null);
                      setSelectedFilter('all');
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.resetFiltersBtnText}>Clear All Filters</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
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
  contentContainer: {
    flex: 1,
  },
  searchHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 46,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: 0,
  },
  closeBtn: {
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  closeBtnText: {
    color: colors.CYAN_ACCENT,
    fontSize: 14,
    fontWeight: '700',
  },
  statusPillsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    gap: 5,
  },
  statusPillActive: {
    backgroundColor: 'rgba(0, 122, 255, 0.15)',
    borderColor: colors.PRIMARY_COLOR,
  },
  statusPillActiveLive: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: colors.LIVE_RED,
  },
  statusPillActiveGold: {
    backgroundColor: 'rgba(255, 180, 0, 0.15)',
    borderColor: colors.FILM_GOLD,
  },
  statusPillText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '600',
  },
  statusPillTextActive: {
    color: colors.PRIMARY_COLOR,
    fontWeight: '700',
  },
  statusPillTextActiveLive: {
    color: colors.LIVE_RED,
    fontWeight: '800',
  },
  statusPillTextActiveGold: {
    color: colors.FILM_GOLD,
    fontWeight: '800',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.LIVE_RED,
  },
  genreScrollWrap: {
    borderBottomWidth: 1,
    borderBottomColor: colors.BORDER_SUBTLE,
    paddingBottom: 10,
  },
  genreScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  genreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: colors.SURFACE_COLOR,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    gap: 6,
  },
  genreChipActive: {
    backgroundColor: colors.PRIMARY_COLOR,
    borderColor: colors.PRIMARY_COLOR,
  },
  genreIconEmoji: {
    fontSize: 13,
  },
  genreLabel: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    fontWeight: '600',
  },
  genreLabelActive: {
    color: colors.TITLE_COLOR,
    fontWeight: '700',
  },
  resultsScroll: {
    flex: 1,
  },
  resultsContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
  },
  resultsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  resultsHeading: {
    color: colors.MUTED_COLOR,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  resultsCountBadge: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '600',
  },
  roomResultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    gap: 12,
  },
  roomThumbBox: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  roomThumbPlaceholderEmoji: {
    fontSize: 22,
  },
  thumbLiveBadge: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    right: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.85)',
    borderRadius: 4,
    paddingVertical: 1,
    gap: 3,
  },
  thumbLiveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFF',
  },
  thumbLiveText: {
    color: '#FFF',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  roomInfoCol: {
    flex: 1,
  },
  roomTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  roomTitleText: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  roomHostText: {
    color: colors.MUTED_COLOR,
    fontSize: 11,
    marginTop: 2,
  },
  roomHostName: {
    color: colors.SUB_TITLE_COLOR,
    fontWeight: '600',
  },
  roomMetaTagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  roomGenrePill: {
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roomGenrePillText: {
    color: colors.CYAN_ACCENT,
    fontSize: 10,
    fontWeight: '700',
  },
  roomAudiencePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  roomAudienceText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '600',
  },
  roomJoinActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  emptyResultsBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    paddingHorizontal: 24,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 0, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  emptyHeading: {
    color: colors.TITLE_COLOR,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubheading: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 260,
  },
  resetFiltersBtn: {
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  resetFiltersBtnText: {
    color: colors.CYAN_ACCENT,
    fontSize: 12,
    fontWeight: '700',
  },
});

export default CinemaSearchModal;
