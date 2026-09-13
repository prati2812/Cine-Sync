import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import {
  searchCinemaMedia,
  fetchMediaSuggestions,
} from '../services/video/CinemaMediaSearchService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const QUICK_EXPLORE_CHIPS = [
  { label: 'Trailers', icon: 'local-movies', query: 'Official Movie Trailers 4K' },
  { label: 'Sci-Fi', icon: 'rocket-launch', query: 'Sci-Fi Cinema 4K' },
  { label: 'Anime', icon: 'flash-on', query: 'Anime Animation 4K' },
  { label: 'Music', icon: 'music-note', query: 'Music Video Official 4K' },
  { label: 'Concerts', icon: 'headset', query: 'Live Music Concert 4K' },
  { label: 'Documentary', icon: 'movie-filter', query: 'Documentary 4K' },
  { label: 'Gaming', icon: 'sports-esports', query: 'Gaming Cinema 4K' },
];

const CinemaMediaSearchModal = ({ visible, onClose, onSelectMedia }) => {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [continuationToken, setContinuationToken] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedChip, setSelectedChip] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  const inputRef = useRef(null);

  // Native animations
  const animOpacity = useRef(new Animated.Value(0)).current;
  const animSlide = useRef(new Animated.Value(24)).current;

  // Safe area top padding for notch protection
  const safeTopPadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 12
  ) + 8;

  // Open/Close transition
  useEffect(() => {
    if (visible) {
      setContinuationToken(null);
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

  // Autocomplete suggestions debounce
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    let isMounted = true;
    const timer = setTimeout(async () => {
      try {
        const list = await fetchMediaSuggestions(query.trim());
        if (isMounted) {
          setSuggestions(list.slice(0, 5));
        }
      } catch (err) {
        if (isMounted) setSuggestions([]);
      }
    }, 200);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [query]);

  // Execute Media Search
  const handleExecuteSearch = useCallback(async (searchString) => {
    const q = (searchString || query).trim();
    if (!q) return;

    setSuggestions([]);
    setIsLoading(true);
    setHasSearched(true);
    setContinuationToken(null);

    try {
      const items = await searchCinemaMedia(q);
      setResults(items || []);
      setContinuationToken(items?.continuationToken || null);
    } catch (err) {
      console.warn('[CinemaMediaSearchModal] Search error:', err);
      setResults([]);
      setContinuationToken(null);
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  // High-performance media pagination (Infinite scroll & load more)
  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || isLoading || !continuationToken) return;
    setIsLoadingMore(true);
    try {
      const nextBatch = await searchCinemaMedia('', continuationToken);
      if (nextBatch && nextBatch.length > 0) {
        setResults(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const uniqueItems = nextBatch.filter(item => !existingIds.has(item.id));
          return [...prev, ...uniqueItems];
        });
        setContinuationToken(nextBatch.continuationToken || null);
      } else {
        setContinuationToken(null);
      }
    } catch (err) {
      console.warn('[CinemaMediaSearchModal] Pagination error:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, isLoading, continuationToken]);

  const handleChipPress = (chip) => {
    setSelectedChip(chip.label);
    setQuery(chip.label);
    handleExecuteSearch(chip.query);
  };

  const handleSelectSuggestion = (suggestionText) => {
    setQuery(suggestionText);
    setSuggestions([]);
    handleExecuteSearch(suggestionText);
  };

  const handleClearQuery = () => {
    setQuery('');
    setSuggestions([]);
    setSelectedChip(null);
    setContinuationToken(null);
  };

  const handleSelectCard = (item) => {
    onClose();
    if (onSelectMedia) {
      onSelectMedia(item);
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
            colors={['rgba(124, 58, 237, 0.24)', 'rgba(0, 122, 255, 0.12)', 'transparent']}
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
          {/* ── TOP SEARCH BAR ── */}
          <View style={styles.searchHeaderBar}>
            <View style={styles.searchBox}>
              <MaterialIcons name="search" size={22} color={colors.CYAN_ACCENT} />
              <TextInput
                ref={inputRef}
                style={styles.searchInput}
                placeholder="Search movies, trailers, cinema media..."
                placeholderTextColor={colors.MUTED_COLOR}
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={() => handleExecuteSearch()}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {query.length > 0 && (
                <TouchableOpacity
                  onPress={handleClearQuery}
                  activeOpacity={0.7}
                  style={styles.clearBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="close" size={18} color={colors.MUTED_COLOR} />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              activeOpacity={0.75}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* ── LIVE AUTOCOMPLETE SUGGESTIONS ── */}
          {suggestions.length > 0 && (
            <View style={styles.suggestionsContainer}>
              {suggestions.map((item, idx) => (
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

          {/* ── QUICK GENRE & ATMOSPHERE CHIPS ── */}
          <View style={styles.chipScrollWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipScroll}
              keyboardShouldPersistTaps="handled"
            >
              {QUICK_EXPLORE_CHIPS.map((chip) => {
                const isSelected = selectedChip === chip.label;
                return (
                  <TouchableOpacity
                    key={chip.label}
                    style={[
                      styles.chipItem,
                      isSelected && styles.chipItemActive,
                    ]}
                    onPress={() => handleChipPress(chip)}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons
                      name={chip.icon}
                      size={14}
                      color={isSelected ? colors.TITLE_COLOR : colors.CYAN_ACCENT}
                    />
                    <Text
                      style={[
                        styles.chipLabel,
                        isSelected && styles.chipLabelActive,
                      ]}
                    >
                      {chip.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* ── CONTENT AREA (LOADING, RESULTS, OR EMPTY) ── */}
          {isLoading ? (
            <View style={styles.centerLoadingState}>
              <ActivityIndicator size="large" color={colors.PRIMARY_COLOR} />
              <Text style={styles.loadingText}>Searching Cinema Media...</Text>
            </View>
          ) : results.length > 0 ? (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              style={styles.resultsScroll}
              contentContainerStyle={styles.resultsContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.5}
              ListHeaderComponent={
                <View style={styles.resultsHeaderRow}>
                  <View style={styles.resultsHeaderLeft}>
                    <MaterialIcons name="theaters" size={15} color={colors.CYAN_ACCENT} />
                    <Text style={styles.resultsHeading}>SEARCH RESULTS</Text>
                  </View>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.mediaCard}
                  onPress={() => handleSelectCard(item)}
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
                        <View style={styles.thumbFallback}>
                          <MaterialIcons name="movie" size={28} color={colors.MUTED_COLOR} />
                        </View>
                      )}

                      {/* Smooth thumbnail fade into black card */}
                      <LinearGradient
                        colors={['transparent', 'rgba(10, 10, 20, 0.35)', '#0A0A14']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.mediaThumbFade}
                        pointerEvents="none"
                      />

                      {/* Bottom Duration Badge */}
                      {item.duration ? (
                        <View style={styles.durationBadge}>
                          <Text style={styles.durationBadgeText}>{item.duration}</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Info Column */}
                    <View style={styles.mediaInfoCol}>
                      <Text style={styles.mediaTitleText} numberOfLines={2}>
                        {item.title}
                      </Text>

                      <View style={styles.mediaMetaRow}>
                        <MaterialIcons name="verified" size={13} color={colors.CYAN_ACCENT} />
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

                        <View style={styles.selectActionBadge}>
                          <MaterialIcons name="add" size={13} color={colors.PRIMARY_COLOR} />
                          <Text style={styles.selectActionText}>Select</Text>
                        </View>
                      </View>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              )}
              ListFooterComponent={
                isLoadingMore ? (
                  <View style={styles.paginationLoadingWrap}>
                    <ActivityIndicator size="small" color={colors.PRIMARY_COLOR} />
                    <Text style={styles.paginationLoadingText}>Loading more cinema media...</Text>
                  </View>
                ) : continuationToken ? (
                  <TouchableOpacity
                    style={styles.loadMoreBtn}
                    onPress={handleLoadMore}
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
              {hasSearched ? (
                /* No Results State */
                <View style={styles.emptyStateBox}>
                  <View style={styles.emptyIconCircle}>
                    <MaterialIcons name="search-off" size={32} color={colors.MUTED_COLOR} />
                  </View>
                  <Text style={styles.emptyTitle}>No Screenings Found</Text>
                  <Text style={styles.emptySub}>
                    Try different keywords, movie titles, or choose from trending categories above.
                  </Text>
                </View>
              ) : (
                /* Initial Discover State */
                <View style={styles.initialStateBox}>
                  <View style={styles.initialIconCircle}>
                    <MaterialIcons name="movie-filter" size={36} color={colors.CYAN_ACCENT} />
                  </View>
                  <Text style={styles.initialTitle}>Cinema Media Search</Text>
                  <Text style={styles.initialSub}>
                    Search across movies, official trailers, music, and streaming media to launch with your party.
                  </Text>
                  <View style={styles.initialTagsRow}>
                    <View style={styles.tagPill}>
                      <MaterialIcons name="hd" size={14} color={colors.PRIMARY_COLOR} />
                      <Text style={styles.tagText}>Full HD / 4K</Text>
                    </View>
                    <View style={styles.tagPill}>
                      <MaterialIcons name="speed" size={14} color={colors.CYAN_ACCENT} />
                      <Text style={styles.tagText}>Zero Lag</Text>
                    </View>
                    <View style={styles.tagPill}>
                      <MaterialIcons name="sync" size={14} color={colors.ACCEPT_GREEN} />
                      <Text style={styles.tagText}>Party Synced</Text>
                    </View>
                  </View>
                </View>
              )}
            </ScrollView>
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
    paddingBottom: 10,
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
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: 0,
  },
  clearBtn: {
    padding: 4,
  },
  cancelBtn: {
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  cancelBtnText: {
    color: colors.PRIMARY_COLOR,
    fontSize: 15,
    fontWeight: '600',
  },

  // Suggestions
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
    paddingVertical: 11,
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

  // Chips
  chipScrollWrap: {
    marginBottom: 10,
  },
  chipScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 6,
  },
  chipItemActive: {
    backgroundColor: colors.PRIMARY_COLOR,
    borderColor: colors.PRIMARY_COLOR,
  },
  chipLabel: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    fontWeight: '600',
  },
  chipLabelActive: {
    color: colors.TITLE_COLOR,
  },

  // Loading
  centerLoadingState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
  },
  loadingText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 13,
    fontWeight: '500',
  },

  // Results Scroll
  resultsScroll: {
    flex: 1,
  },
  resultsContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 12,
  },
  resultsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
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
    letterSpacing: 1,
  },
  resultsCountBadge: {
    color: colors.MUTED_COLOR,
    fontSize: 11,
    fontWeight: '600',
  },

  // Media Card (16:9)
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
    width: 124,
    height: 72,
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
  thumbFallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  qualityBadge: {
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
  qualityBadgeText: {
    color: colors.CYAN_ACCENT,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  durationBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  durationBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },

  // Card Info
  mediaInfoCol: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
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
  selectActionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 122, 255, 0.12)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 2,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
  },
  selectActionText: {
    color: colors.PRIMARY_COLOR,
    fontSize: 11,
    fontWeight: '700',
  },

  // Empty State
  emptyStateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: colors.SURFACE_COLOR,
    borderWidth: 1,
    borderColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySub: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 13,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 18,
  },

  // Initial State
  initialStateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 28,
    gap: 12,
  },
  initialIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: colors.SURFACE_COLOR,
    borderWidth: 1,
    borderColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initialTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  initialSub: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 13,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 19,
  },
  initialTagsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  tagText: {
    color: colors.TITLE_COLOR,
    fontSize: 11,
    fontWeight: '600',
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

export default CinemaMediaSearchModal;
