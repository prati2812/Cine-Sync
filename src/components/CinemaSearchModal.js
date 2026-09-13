import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  FlatList,
  Platform,
  StatusBar,
  Dimensions,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import colors from '../theme/Colors';
import { database } from '../config/firebase';
import { getYouTubeThumbnailDetails } from '../functions';
import {
  searchCinemaMedia,
  fetchMediaSuggestions,
} from '../services/video/CinemaMediaSearchService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const QUICK_MEDIA_CHIPS = [
  { label: 'Trailers', icon: 'local-movies', query: 'Official Movie Trailers 4K' },
  { label: 'Sci-Fi', icon: 'rocket-launch', query: 'Sci-Fi Cinema 4K' },
  { label: 'Anime', icon: 'flash-on', query: 'Anime Animation 4K' },
  { label: 'Music', icon: 'music-note', query: 'Music Video Official 4K' },
  { label: 'Concerts', icon: 'headset', query: 'Live Music Concert 4K' },
  { label: 'Documentary', icon: 'movie-filter', query: 'Documentary 4K' },
  { label: 'Gaming', icon: 'sports-esports', query: 'Gaming Cinema 4K' },
];

const QUICK_GENRES = [
  { label: 'Movies', icon: 'local-movies', query: 'Movies' },
  { label: 'Anime', icon: 'flash-on', query: 'Anime' },
  { label: 'Music', icon: 'music-note', query: 'Music' },
  { label: 'Sports', icon: 'sports-soccer', query: 'Sports' },
  { label: 'Gaming', icon: 'sports-esports', query: 'Gaming' },
];

const CinemaSearchModal = ({
  visible,
  onClose,
  rooms = [],
  onSelectRoom,
  onSelectSoloMedia,
  currentUserEmail,
}) => {
  const insets = useSafeAreaInsets();

  // Top Switcher: 'media' (Solo Cinema) vs 'parties' (Watch Parties)
  const [searchTab, setSearchTab] = useState('media');

  // Input states
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Watch Parties states
  const [selectedFilter, setSelectedFilter] = useState('all'); // 'all', 'live', 'scheduled', 'my'
  const [selectedGenre, setSelectedGenre] = useState(null);
  const [serverResults, setServerResults] = useState([]);
  const [isSearchingServer, setIsSearchingServer] = useState(false);

  // Cinema Media (Solo) states & Pagination
  const [mediaResults, setMediaResults] = useState([]);
  const [mediaSuggestions, setMediaSuggestions] = useState([]);
  const [mediaContinuationToken, setMediaContinuationToken] = useState(null);
  const [isSearchingMedia, setIsSearchingMedia] = useState(false);
  const [isLoadingMoreMedia, setIsLoadingMoreMedia] = useState(false);
  const [hasSearchedMedia, setHasSearchedMedia] = useState(false);
  const [selectedMediaChip, setSelectedMediaChip] = useState(null);

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
    }, 180);
    return () => clearTimeout(handler);
  }, [query]);

  // Scalable server-side indexed query on nameLower for Watch Parties
  useEffect(() => {
    if (searchTab !== 'parties') return;
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
  }, [debouncedQuery, searchTab]);

  // Keyless on-device Cinema Media search for Solo Stream (Zero Database Writes)
  useEffect(() => {
    if (searchTab !== 'media') return;
    const q = debouncedQuery.trim();
    if (!q || q.length < 2) {
      setMediaResults([]);
      setMediaContinuationToken(null);
      setIsSearchingMedia(false);
      return;
    }

    let isMounted = true;
    setIsSearchingMedia(true);
    setHasSearchedMedia(true);
    setMediaContinuationToken(null);

    searchCinemaMedia(q)
      .then(items => {
        if (isMounted) {
          setMediaResults(items || []);
          setMediaContinuationToken(items?.continuationToken || null);
        }
      })
      .catch(err => {
        console.warn('Media search error:', err);
        if (isMounted) {
          setMediaResults([]);
          setMediaContinuationToken(null);
        }
      })
      .finally(() => {
        if (isMounted) setIsSearchingMedia(false);
      });

    return () => {
      isMounted = false;
    };
  }, [debouncedQuery, searchTab]);

  // Autocomplete Suggestions for Media
  useEffect(() => {
    if (searchTab !== 'media') {
      setMediaSuggestions([]);
      return;
    }
    const q = query.trim();
    if (!q || q.length < 2) {
      setMediaSuggestions([]);
      return;
    }

    let isMounted = true;
    const timer = setTimeout(async () => {
      try {
        const list = await fetchMediaSuggestions(q);
        if (isMounted) setMediaSuggestions((list || []).slice(0, 5));
      } catch (err) {
        if (isMounted) setMediaSuggestions([]);
      }
    }, 200);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [query, searchTab]);

  // Open/close animation
  useEffect(() => {
    if (visible) {
      setQuery('');
      setDebouncedQuery('');
      setServerResults([]);
      setMediaResults([]);
      setMediaContinuationToken(null);
      setMediaSuggestions([]);
      setSelectedFilter('all');
      setSelectedGenre(null);
      setSelectedMediaChip(null);
      setHasSearchedMedia(false);

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

  // Search & Filter Results for Watch Parties
  const partyResults = useMemo(() => {
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

  // Handlers
  const handleSelectRoom = room => {
    onClose();
    if (onSelectRoom) {
      onSelectRoom(room);
    }
  };

  const handleSelectSoloMedia = mediaItem => {
    onClose();
    if (onSelectSoloMedia) {
      onSelectSoloMedia(mediaItem);
    }
  };

  const handleMediaChipPress = chip => {
    setSelectedMediaChip(chip.label);
    setQuery(chip.label);
    setMediaSuggestions([]);
    setIsSearchingMedia(true);
    setHasSearchedMedia(true);
    setMediaContinuationToken(null);
    searchCinemaMedia(chip.query)
      .then(items => {
        setMediaResults(items || []);
        setMediaContinuationToken(items?.continuationToken || null);
      })
      .catch(() => {
        setMediaResults([]);
        setMediaContinuationToken(null);
      })
      .finally(() => setIsSearchingMedia(false));
  };

  const handleSelectSuggestion = text => {
    setQuery(text);
    setMediaSuggestions([]);
    setIsSearchingMedia(true);
    setHasSearchedMedia(true);
    setMediaContinuationToken(null);
    searchCinemaMedia(text)
      .then(items => {
        setMediaResults(items || []);
        setMediaContinuationToken(items?.continuationToken || null);
      })
      .catch(() => {
        setMediaResults([]);
        setMediaContinuationToken(null);
      })
      .finally(() => setIsSearchingMedia(false));
  };

  // High-performance media pagination (Infinite scroll & load more)
  const handleLoadMoreMedia = useCallback(async () => {
    if (isLoadingMoreMedia || isSearchingMedia || !mediaContinuationToken) return;
    setIsLoadingMoreMedia(true);
    try {
      const nextBatch = await searchCinemaMedia('', mediaContinuationToken);
      if (nextBatch && nextBatch.length > 0) {
        setMediaResults(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const uniqueItems = nextBatch.filter(item => !existingIds.has(item.id));
          return [...prev, ...uniqueItems];
        });
        setMediaContinuationToken(nextBatch.continuationToken || null);
      } else {
        setMediaContinuationToken(null);
      }
    } catch (err) {
      console.warn('Media pagination error:', err);
    } finally {
      setIsLoadingMoreMedia(false);
    }
  }, [isLoadingMoreMedia, isSearchingMedia, mediaContinuationToken]);

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
              <MaterialIcons
                name="search"
                size={22}
                color={searchTab === 'media' ? colors.CYAN_ACCENT : colors.PRIMARY_COLOR}
              />
              <TextInput
                ref={inputRef}
                style={styles.searchInput}
                placeholder={
                  searchTab === 'media'
                    ? 'Search movies, trailers, cinema media...'
                    : 'Search watch parties, screening rooms, hosts...'
                }
                placeholderTextColor={colors.MUTED_COLOR}
                value={query}
                onChangeText={setQuery}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {query.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    setQuery('');
                    setMediaSuggestions([]);
                    setMediaResults([]);
                    setSelectedMediaChip(null);
                  }}
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

          {/* ── TOP MODE SEGMENT SWITCHER ── */}
          <View style={styles.tabSegmentContainer}>
            <TouchableOpacity
              style={[
                styles.tabSegmentBtn,
                searchTab === 'media' && styles.tabSegmentBtnActive,
              ]}
              onPress={() => {
                setSearchTab('media');
                setQuery('');
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons
                name="movie-filter"
                size={16}
                color={searchTab === 'media' ? colors.TITLE_COLOR : colors.SUB_TITLE_COLOR}
              />
              <Text
                style={[
                  styles.tabSegmentText,
                  searchTab === 'media' && styles.tabSegmentTextActive,
                ]}
              >
                Cinema Media (Solo)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tabSegmentBtn,
                searchTab === 'parties' && styles.tabSegmentBtnActive,
              ]}
              onPress={() => {
                setSearchTab('parties');
                setQuery('');
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons
                name="groups"
                size={17}
                color={searchTab === 'parties' ? colors.TITLE_COLOR : colors.SUB_TITLE_COLOR}
              />
              <Text
                style={[
                  styles.tabSegmentText,
                  searchTab === 'parties' && styles.tabSegmentTextActive,
                ]}
              >
                Watch Parties ({rooms.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* ════════════════════════════════════════════════════════════
              MODE A: CINEMA MEDIA (SOLO STREAM - ZERO DB COST)
          ════════════════════════════════════════════════════════════ */}
          {searchTab === 'media' && (
            <>
              {/* Autocomplete Suggestions */}
              {mediaSuggestions.length > 0 && (
                <View style={styles.suggestionsContainer}>
                  {mediaSuggestions.map((item, idx) => (
                    <TouchableOpacity
                      key={`${item}-${idx}`}
                      style={styles.suggestionRow}
                      onPress={() => handleSelectSuggestion(item)}
                      activeOpacity={0.75}
                    >
                      <MaterialIcons name="north-west" size={14} color={colors.CYAN_ACCENT} />
                      <Text style={styles.suggestionText} numberOfLines={1}>
                        {item}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Quick Explore Chips */}
              <View style={styles.genreScrollWrap}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.genreScroll}
                  keyboardShouldPersistTaps="handled"
                >
                  {QUICK_MEDIA_CHIPS.map(chip => {
                    const isSelected = selectedMediaChip === chip.label;
                    return (
                      <TouchableOpacity
                        key={chip.label}
                        style={[styles.genreChip, isSelected && styles.genreChipActive]}
                        onPress={() => handleMediaChipPress(chip)}
                        activeOpacity={0.8}
                      >
                        <MaterialIcons
                          name={chip.icon}
                          size={14}
                          color={isSelected ? colors.TITLE_COLOR : colors.CYAN_ACCENT}
                        />
                        <Text
                          style={[styles.genreLabel, isSelected && styles.genreLabelActive]}
                        >
                          {chip.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Media Content Scroll */}
              {isSearchingMedia ? (
                <View style={styles.centerLoadingState}>
                  <ActivityIndicator size="large" color={colors.PRIMARY_COLOR} />
                  <Text style={styles.loadingStateText}>Searching Cinema Media...</Text>
                </View>
              ) : mediaResults.length > 0 ? (
                <FlatList
                  data={mediaResults}
                  keyExtractor={item => item.id}
                  style={styles.resultsScroll}
                  contentContainerStyle={styles.resultsContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  onEndReached={handleLoadMoreMedia}
                  onEndReachedThreshold={0.5}
                  ListHeaderComponent={
                    <View style={styles.resultsHeaderRow}>
                      <View style={styles.resultsHeaderLeft}>
                        <MaterialIcons name="theaters" size={15} color={colors.CYAN_ACCENT} />
                        <Text style={styles.resultsHeading}>CINEMA MEDIA RESULTS</Text>
                      </View>
                    </View>
                  }
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.mediaCard}
                      onPress={() => handleSelectSoloMedia(item)}
                      activeOpacity={0.82}
                    >
                      <LinearGradient
                        colors={['#131322', '#0A0A14', '#06060B']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.mediaCardGradient}
                      >
                        {/* 16:9 Squircle Thumbnail */}
                        <View style={styles.mediaThumbBox}>
                          {item.thumbnail ? (
                            <Image
                              source={{ uri: item.thumbnail }}
                              style={styles.mediaThumbImg}
                              resizeMode="cover"
                            />
                          ) : (
                            <MaterialIcons name="movie" size={24} color={colors.MUTED_COLOR} />
                          )}

                          {/* Smooth thumbnail fade into black card */}
                          <LinearGradient
                            colors={['transparent', 'rgba(10, 10, 20, 0.35)', '#0A0A14']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.mediaThumbFade}
                            pointerEvents="none"
                          />

                          {item.duration ? (
                            <View style={styles.mediaDurationBadge}>
                              <Text style={styles.mediaDurationText}>{item.duration}</Text>
                            </View>
                          ) : null}
                        </View>

                        {/* Info Column */}
                        <View style={styles.mediaInfoCol}>
                          <Text style={styles.mediaTitleText} numberOfLines={2}>
                            {item.title}
                          </Text>

                          <View style={styles.mediaMetaRow}>
                            <MaterialIcons name="verified" size={12} color={colors.CYAN_ACCENT} />
                            <Text style={styles.mediaChannelText} numberOfLines={1}>
                              {item.channelName}
                            </Text>
                          </View>

                          <View style={styles.mediaFooterRow}>
                            {item.views ? (
                              <Text style={styles.mediaViewsText} numberOfLines={1}>
                                {item.views}
                              </Text>
                            ) : null}

                            {/* Watch Now Button */}
                            <View style={styles.watchNowActionBtn}>
                              <MaterialIcons name="play-arrow" size={13} color="#FFF" />
                              <Text style={styles.watchNowActionText}>Watch Now</Text>
                            </View>
                          </View>
                        </View>
                      </LinearGradient>
                    </TouchableOpacity>
                  )}
                  ListFooterComponent={
                    isLoadingMoreMedia ? (
                      <View style={styles.paginationLoadingWrap}>
                        <ActivityIndicator size="small" color={colors.PRIMARY_COLOR} />
                        <Text style={styles.paginationLoadingText}>Loading more cinema media...</Text>
                      </View>
                    ) : mediaContinuationToken ? (
                      <TouchableOpacity
                        style={styles.loadMoreBtn}
                        onPress={handleLoadMoreMedia}
                        activeOpacity={0.8}
                      >
                        <MaterialIcons name="expand-more" size={18} color={colors.CYAN_ACCENT} />
                        <Text style={styles.loadMoreBtnText}>Load More Results</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.endOfResultsWrap}>
                        <MaterialIcons name="check-circle" size={14} color={colors.ACCEPT_GREEN} />
                        <Text style={styles.endOfResultsText}>All matching results loaded</Text>
                      </View>
                    )
                  }
                />
              ) : (
                <ScrollView
                  style={styles.resultsScroll}
                  contentContainerStyle={styles.resultsContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {hasSearchedMedia ? (
                    <View style={styles.emptyResultsBox}>
                      <View style={styles.emptyIconWrap}>
                        <MaterialIcons name="search-off" size={32} color={colors.FILM_GOLD} />
                      </View>
                      <Text style={styles.emptyHeading}>No Cinema Media Found</Text>
                      <Text style={styles.emptySubheading}>
                        Try searching with different keywords, movie titles, or explore trending categories.
                      </Text>
                    </View>
                  ) : (
                    /* Initial Discover State */
                    <View style={styles.initialMediaBox}>
                      <View style={styles.initialMediaIconCircle}>
                        <MaterialIcons name="movie-filter" size={36} color={colors.CYAN_ACCENT} />
                      </View>
                      <Text style={styles.initialMediaTitle}>Cinema Media Search</Text>
                      <Text style={styles.initialMediaSub}>
                        Search across movies, official trailers, and streaming media to watch instantly with zero delay.
                      </Text>
                      <View style={styles.initialMediaTagsRow}>
                        <View style={styles.mediaTagPill}>
                          <MaterialIcons name="hd" size={13} color={colors.PRIMARY_COLOR} />
                          <Text style={styles.mediaTagText}>Full HD / 4K</Text>
                        </View>
                        <View style={styles.mediaTagPill}>
                          <MaterialIcons name="speed" size={13} color={colors.CYAN_ACCENT} />
                          <Text style={styles.mediaTagText}>Zero Lag</Text>
                        </View>
                        <View style={styles.mediaTagPill}>
                          <MaterialIcons name="play-circle" size={13} color={colors.ACCEPT_GREEN} />
                          <Text style={styles.mediaTagText}>Instant Solo Play</Text>
                        </View>
                      </View>
                    </View>
                  )}
                </ScrollView>
              )}
            </>
          )}

          {/* ════════════════════════════════════════════════════════════
              MODE B: WATCH PARTIES (MULTIPLAYER LIVE SYNC ROOMS)
          ════════════════════════════════════════════════════════════ */}
          {searchTab === 'parties' && (
            <>
              {/* Quick Status Pills */}
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

              {/* Genre Chips */}
              <View style={styles.genreScrollWrap}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.genreScroll}
                  keyboardShouldPersistTaps="handled"
                >
                  {QUICK_GENRES.map(g => {
                    const isGenreSelected = selectedGenre === g.query;
                    return (
                      <TouchableOpacity
                        key={g.query}
                        style={[styles.genreChip, isGenreSelected && styles.genreChipActive]}
                        onPress={() => setSelectedGenre(isGenreSelected ? null : g.query)}
                        activeOpacity={0.8}
                      >
                        <MaterialIcons
                          name={g.icon}
                          size={14}
                          color={isGenreSelected ? colors.TITLE_COLOR : colors.CYAN_ACCENT}
                        />
                        <Text
                          style={[styles.genreLabel, isGenreSelected && styles.genreLabelActive]}
                        >
                          {g.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Parties Results Scroll */}
              <ScrollView
                style={styles.resultsScroll}
                contentContainerStyle={styles.resultsContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {partyResults.length > 0 ? (
                  <>
                    <View style={styles.resultsHeaderRow}>
                      <Text style={styles.resultsHeading}>
                        {query.trim() || selectedGenre || selectedFilter !== 'all'
                          ? 'MATCHING SCREENINGS'
                          : 'ALL SCREENING ROOMS'}
                      </Text>
                      <Text style={styles.resultsCountBadge}>
                        {partyResults.length} {partyResults.length === 1 ? 'room' : 'rooms'}
                      </Text>
                    </View>

                    {partyResults.map(room => {
                      const isLive = room.isStreaming || room.status === 'active';
                      const thumb =
                        getYouTubeThumbnailDetails(room.streamUrl)?.mqUrl ||
                        room.thumbnail ||
                        null;
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
                          <LinearGradient
                            colors={['#131322', '#0A0A14']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.roomResultCardGradient}
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
                          </LinearGradient>
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
                        <Text style={styles.resetFiltersBtnText}>Reset Atmosphere Filters</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </ScrollView>
            </>
          )}
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
    height: 260,
  },
  contentContainer: {
    flex: 1,
  },

  // Search Header
  searchHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 12,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 12,
    height: 46,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.TITLE_COLOR,
    fontSize: 13,
    fontWeight: '500',
    paddingVertical: 0,
  },
  closeBtn: {
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  closeBtnText: {
    color: colors.PRIMARY_COLOR,
    fontSize: 15,
    fontWeight: '600',
  },

  // Mode Segment Switcher
  tabSegmentContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.SURFACE_ELEVATED,
    gap: 4,
  },
  tabSegmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 9,
    gap: 6,
  },
  tabSegmentBtnActive: {
    backgroundColor: colors.PRIMARY_COLOR,
  },
  tabSegmentText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    fontWeight: '600',
  },
  tabSegmentTextActive: {
    color: colors.TITLE_COLOR,
    fontWeight: '700',
  },

  // Media Autocomplete Suggestions
  suggestionsContainer: {
    backgroundColor: colors.SURFACE_COLOR,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.SURFACE_ELEVATED,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.SURFACE_ELEVATED,
  },
  suggestionText: {
    color: colors.TITLE_COLOR,
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },

  // Media Card
  mediaCard: {
    backgroundColor: '#0A0A14',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    overflow: 'hidden',
    marginBottom: 10,
  },
  mediaCardGradient: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    padding: 10,
  },
  mediaThumbBox: {
    width: 120,
    height: 70,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#07070E',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaThumbFade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 24,
  },
  mediaThumbImg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 10,
  },
  mediaQualityTag: {
    position: 'absolute',
    top: 5,
    left: 5,
    backgroundColor: 'rgba(8, 8, 16, 0.78)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 0.5,
    borderColor: colors.CYAN_ACCENT,
  },
  mediaQualityTagText: {
    color: colors.CYAN_ACCENT,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  mediaDurationBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  mediaDurationText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
  mediaInfoCol: {
    flex: 1,
    justifyContent: 'center',
    gap: 3,
  },
  mediaTitleText: {
    color: colors.TITLE_COLOR,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  mediaMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  mediaChannelText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '500',
    flex: 1,
  },
  mediaFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  mediaViewsText: {
    color: colors.MUTED_COLOR,
    fontSize: 10,
    fontWeight: '500',
  },
  watchNowActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.PRIMARY_COLOR,
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 4,
    gap: 3,
  },
  watchNowActionText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },

  // Discover State for Media
  initialMediaBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
    gap: 10,
  },
  initialMediaIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 16,
    backgroundColor: colors.SURFACE_COLOR,
    borderWidth: 1,
    borderColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initialMediaTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  initialMediaSub: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  initialMediaTagsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  mediaTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 9,
    paddingVertical: 5,
    gap: 5,
  },
  mediaTagText: {
    color: colors.TITLE_COLOR,
    fontSize: 11,
    fontWeight: '600',
  },

  // Loading state
  centerLoadingState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingStateText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 13,
    fontWeight: '500',
  },

  // Status Pills Row (Parties)
  statusPillsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_COLOR,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.SURFACE_ELEVATED,
    gap: 5,
  },
  statusPillActive: {
    backgroundColor: colors.SURFACE_ELEVATED,
    borderColor: colors.PRIMARY_COLOR,
  },
  statusPillActiveLive: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: colors.LIVE_RED,
  },
  statusPillActiveGold: {
    backgroundColor: 'rgba(255, 180, 0, 0.12)',
    borderColor: colors.FILM_GOLD,
  },
  statusPillText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '600',
  },
  statusPillTextActive: {
    color: colors.TITLE_COLOR,
    fontWeight: '700',
  },
  statusPillTextActiveLive: {
    color: colors.LIVE_RED,
    fontWeight: '700',
  },
  statusPillTextActiveGold: {
    color: colors.FILM_GOLD,
    fontWeight: '700',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.LIVE_RED,
  },

  // Genre Chips
  genreScrollWrap: {
    marginBottom: 8,
  },
  genreScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  genreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_COLOR,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.SURFACE_ELEVATED,
    gap: 5,
  },
  genreChipActive: {
    backgroundColor: colors.PRIMARY_COLOR,
    borderColor: colors.PRIMARY_COLOR,
  },
  genreLabel: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '600',
  },
  genreLabelActive: {
    color: colors.TITLE_COLOR,
    fontWeight: '700',
  },

  // Results Scroll
  resultsScroll: {
    flex: 1,
  },
  resultsContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  resultsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 2,
  },
  resultsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resultsHeading: {
    color: colors.CYAN_ACCENT,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  resultsCountBadge: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '600',
  },

  // Room Card
  roomResultCard: {
    backgroundColor: '#0A0A14',
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    overflow: 'hidden',
  },
  roomResultCardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
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

  // Empty Results
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

  // Media Pagination Controls
  paginationLoadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  paginationLoadingText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    fontWeight: '600',
  },
  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginVertical: 14,
    marginHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.28)',
  },
  loadMoreBtnText: {
    color: colors.CYAN_ACCENT,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  endOfResultsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 20,
  },
  endOfResultsText: {
    color: colors.MUTED_COLOR,
    fontSize: 12,
    fontWeight: '600',
  },
});

export default CinemaSearchModal;
