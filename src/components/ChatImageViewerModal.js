import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  Modal,
  StatusBar,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Platform,
  Image,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import LinearGradient from 'react-native-linear-gradient';
import colors from '../theme/Colors';
import { resolveMediaUri } from '../functions/mediaService';

/**
 * Format timestamp into user-friendly string
 */
const formatImageTimestamp = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) {
    return `Today at ${timeStr}`;
  }
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} • ${timeStr}`;
};

/**
 * ZoomableSlide Component
 * Provides smooth pinch-to-zoom, pan when zoomed, and double-tap zoom toggle.
 */
const ZoomableSlide = memo(({
  item,
  isActive,
  isPagingZoomed,
  onZoomChange,
  onToggleControls,
  screenWidth,
  screenHeight,
  resetZoomKey,
}) => {
  const [resolvedUri, setResolvedUri] = useState(item.uri || null);
  const [loading, setLoading] = useState(!item.uri && Boolean(item.mediaId));

  // Reanimated shared values for zoom & pan transformations
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Resolve media on demand if not yet available
  useEffect(() => {
    let isMounted = true;
    if (item.uri) {
      setResolvedUri(item.uri);
      setLoading(false);
      return;
    }

    if (item.mediaId) {
      setLoading(true);
      resolveMediaUri(item.mediaId, item.uri)
        .then((uri) => {
          if (isMounted) {
            setResolvedUri(uri);
            setLoading(false);
          }
        })
        .catch(() => {
          if (isMounted) setLoading(false);
        });
    } else {
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [item.uri, item.mediaId]);

  // Reset zoom animation helper
  const resetZoom = useCallback(() => {
    scale.value = withTiming(1, { duration: 220 });
    translateX.value = withTiming(0, { duration: 220 });
    translateY.value = withTiming(0, { duration: 220 });
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [scale, translateX, translateY, savedScale, savedTranslateX, savedTranslateY]);

  // When swiping away from this slide or reset requested, restore scale = 1
  useEffect(() => {
    if (!isActive) {
      resetZoom();
    }
  }, [isActive, resetZoom]);

  useEffect(() => {
    if (resetZoomKey > 0) {
      resetZoom();
    }
  }, [resetZoomKey, resetZoom]);

  // ── PINCH GESTURE ──
  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      'worklet';
      savedScale.value = scale.value;
    })
    .onUpdate((event) => {
      'worklet';
      const nextScale = savedScale.value * event.scale;
      // Allow fluid pinch from 0.8x up to 5x
      scale.value = Math.max(0.8, Math.min(nextScale, 5));
      if (scale.value > 1.05) {
        runOnJS(onZoomChange)(true);
      }
    })
    .onEnd(() => {
      'worklet';
      if (scale.value <= 1.05) {
        scale.value = withTiming(1, { duration: 200 });
        translateX.value = withTiming(0, { duration: 200 });
        translateY.value = withTiming(0, { duration: 200 });
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        runOnJS(onZoomChange)(false);
      } else {
        savedScale.value = scale.value;
        runOnJS(onZoomChange)(true);
      }
    });

  // ── PAN GESTURE (Enabled when zoomed to navigate around details) ──
  const panGesture = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => {
      'worklet';
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((event) => {
      'worklet';
      if (scale.value > 1.05) {
        const maxTx = ((scale.value - 1) * screenWidth) / 2;
        const maxTy = ((scale.value - 1) * screenHeight) / 2;
        const nextX = savedTranslateX.value + event.translationX;
        const nextY = savedTranslateY.value + event.translationY;
        translateX.value = Math.max(-maxTx, Math.min(maxTx, nextX));
        translateY.value = Math.max(-maxTy, Math.min(maxTy, nextY));
      }
    })
    .onEnd(() => {
      'worklet';
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  // ── DOUBLE-TAP GESTURE (Toggle between 1x and 2.5x zoom) ──
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onEnd((event) => {
      'worklet';
      if (scale.value > 1.05) {
        // Reset to normal
        scale.value = withTiming(1, { duration: 220 });
        translateX.value = withTiming(0, { duration: 220 });
        translateY.value = withTiming(0, { duration: 220 });
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        runOnJS(onZoomChange)(false);
      } else {
        // Zoom into tapped location (2.5x)
        scale.value = withTiming(2.5, { duration: 220 });
        savedScale.value = 2.5;
        const targetX = (screenWidth / 2 - event.x) * 1.5;
        const targetY = (screenHeight / 2 - event.y) * 1.5;
        const maxTx = (1.5 * screenWidth) / 2;
        const maxTy = (1.5 * screenHeight) / 2;
        translateX.value = withTiming(Math.max(-maxTx, Math.min(maxTx, targetX)), { duration: 220 });
        translateY.value = withTiming(Math.max(-maxTy, Math.min(maxTy, targetY)), { duration: 220 });
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
        runOnJS(onZoomChange)(true);
      }
    });

  // ── SINGLE-TAP GESTURE (Toggle Controls) ──
  const singleTapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .maxDuration(250)
    .onEnd(() => {
      'worklet';
      if (onToggleControls) {
        runOnJS(onToggleControls)();
      }
    });

  // Compose gestures: double-tap takes priority over single-tap; pinch and pan run simultaneously
  const taps = Gesture.Exclusive(doubleTapGesture, singleTapGesture);
  const composedGesture = isPagingZoomed
    ? Gesture.Simultaneous(pinchGesture, panGesture, taps)
    : Gesture.Simultaneous(pinchGesture, taps);

  const animatedImageStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    };
  });

  return (
    <View style={[styles.slideContainer, { width: screenWidth, height: screenHeight }]}>
      {loading ? (
        <View style={styles.loaderWrap}>
          {item.microThumb ? (
            <Image
              source={{ uri: item.microThumb }}
              style={[StyleSheet.absoluteFillObject, { opacity: 0.55 }]}
              blurRadius={Platform.OS === 'ios' ? 12 : 2}
              resizeMode="contain"
            />
          ) : null}
          <ActivityIndicator size="large" color={colors.CYAN_ACCENT} />
          <Text style={styles.loaderText}>Loading photo...</Text>
        </View>
      ) : resolvedUri ? (
        <GestureDetector gesture={composedGesture}>
          <View style={[styles.gestureTouchArea, { width: screenWidth, height: screenHeight }]}>
            <Animated.View style={[styles.animatedImageWrap, animatedImageStyle]}>
              <Image
                source={{ uri: resolvedUri }}
                style={[styles.fullImage, { width: screenWidth, height: screenHeight * 0.78 }]}
                resizeMode="contain"
              />
            </Animated.View>
          </View>
        </GestureDetector>
      ) : (
        <View style={styles.loaderWrap}>
          <MaterialIcons name="broken-image" size={48} color="rgba(255, 255, 255, 0.35)" />
          <Text style={styles.loaderText}>Photo unavailable</Text>
        </View>
      )}
    </View>
  );
});

/**
 * ChatImageViewerModal Component
 * Full-screen immersive photo viewer with:
 * - Pinch-to-zoom (up to 5x)
 * - Double-tap zoom toggle
 * - Free 2D panning when zoomed
 * - Horizontal swipe between chat images (with arrow shortcuts)
 * - Safe area & notch compliance
 * - View-once single photo mode with security warnings
 */
const ChatImageViewerModal = ({
  visible,
  images = [],
  initialIndex = 0,
  onClose,
  otherUsername = 'Chat Photo',
  safeTopPadding = 44,
  safeBottomPadding = 24,
}) => {
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const flatListRef = useRef(null);

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isZoomed, setIsZoomed] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [resetZoomKey, setResetZoomKey] = useState(0);

  // Sync index when initialIndex changes or modal opens
  useEffect(() => {
    if (visible) {
      const validIndex = Math.max(0, Math.min(initialIndex, Math.max(0, images.length - 1)));
      setCurrentIndex(validIndex);
      setIsZoomed(false);
      setShowControls(true);

      if (validIndex > 0) {
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({ index: validIndex, animated: false });
        }, 60);
      }
    }
  }, [visible, initialIndex, images.length]);

  const handleZoomChange = useCallback((zoomed) => {
    setIsZoomed(zoomed);
  }, []);

  const handleToggleControls = useCallback(() => {
    setShowControls((prev) => !prev);
  }, []);

  const handleResetZoom = useCallback(() => {
    setIsZoomed(false);
    setResetZoomKey((k) => k + 1);
  }, []);

  const handlePrevImage = useCallback(() => {
    if (currentIndex > 0) {
      setIsZoomed(false);
      flatListRef.current?.scrollToIndex({ index: currentIndex - 1, animated: true });
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex]);

  const handleNextImage = useCallback(() => {
    if (currentIndex < images.length - 1) {
      setIsZoomed(false);
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
      setCurrentIndex(currentIndex + 1);
    }
  }, [currentIndex, images.length]);

  const onMomentumScrollEnd = useCallback(
    (e) => {
      const offset = e.nativeEvent.contentOffset.x;
      const newIndex = Math.round(offset / SCREEN_WIDTH);
      if (newIndex >= 0 && newIndex < images.length && newIndex !== currentIndex) {
        setCurrentIndex(newIndex);
        setIsZoomed(false);
      }
    },
    [SCREEN_WIDTH, images.length, currentIndex]
  );

  if (!visible || !images || images.length === 0) {
    return null;
  }

  const currentImage = images[currentIndex] || images[0] || {};
  const isViewOnce = Boolean(currentImage.isViewOnce);
  const hasMultipleImages = images.length > 1;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.modalRoot}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" translucent />

        {/* ── HORIZONTAL SWIPEABLE PAGING LIST ── */}
        <FlatList
          ref={flatListRef}
          data={images}
          keyExtractor={(item, index) => item.id || item.messageId || String(index)}
          horizontal
          pagingEnabled
          scrollEnabled={!isZoomed}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={Math.max(0, Math.min(initialIndex, images.length - 1))}
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
          onScrollToIndexFailed={(info) => {
            setTimeout(() => {
              flatListRef.current?.scrollToIndex({ index: info.index, animated: false });
            }, 50);
          }}
          onMomentumScrollEnd={onMomentumScrollEnd}
          initialNumToRender={Math.max(1, images.length)}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          renderItem={({ item, index }) => (
            <ZoomableSlide
              item={item}
              isActive={index === currentIndex}
              isPagingZoomed={isZoomed}
              onZoomChange={handleZoomChange}
              onToggleControls={handleToggleControls}
              screenWidth={SCREEN_WIDTH}
              screenHeight={SCREEN_HEIGHT}
              resetZoomKey={resetZoomKey}
            />
          )}
        />

        {/* ── TOP HEADER BAR OVERLAY ── */}
        {showControls && (
          <LinearGradient
            colors={['rgba(8, 8, 16, 0.95)', 'rgba(8, 8, 16, 0.5)', 'transparent']}
            style={[styles.headerOverlay, { paddingTop: safeTopPadding }]}
            pointerEvents="box-none"
          >
            <View style={styles.headerContentRow}>
              {/* Back / Close Button */}
              <TouchableOpacity
                style={styles.headerIconButton}
                onPress={onClose}
                activeOpacity={0.75}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialIcons name="arrow-back" size={24} color="#FFF" />
              </TouchableOpacity>

              {/* Title / Subtitle Center Column */}
              <View style={styles.headerCenterCol}>
                {isViewOnce ? (
                  <View style={styles.viewOnceHeaderBadge}>
                    <View style={styles.viewOncePillNumber}>
                      <Text style={styles.viewOncePillText}>1</Text>
                    </View>
                    <Text style={styles.viewOnceTitleText}>View-Once Photo</Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.headerMainTitle} numberOfLines={1}>
                      {otherUsername}
                    </Text>
                    <Text style={styles.headerSubtitleText} numberOfLines={1}>
                      {hasMultipleImages
                        ? `${currentIndex + 1} of ${images.length} • ${formatImageTimestamp(currentImage.timestamp)}`
                        : formatImageTimestamp(currentImage.timestamp)}
                    </Text>
                  </>
                )}
              </View>

              {/* Right Action: Reset Zoom or Spacer */}
              <View style={styles.headerRightCol}>
                {isZoomed ? (
                  <TouchableOpacity
                    style={styles.resetZoomButton}
                    onPress={handleResetZoom}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="zoom-out-map" size={16} color={colors.CYAN_ACCENT} />
                    <Text style={styles.resetZoomButtonText}>Reset</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.headerRightSpacer} />
                )}
              </View>
            </View>
          </LinearGradient>
        )}

        {/* ── SIDE CHEVRONS (SWIPE NAVIGATION SHORTCUTS) ── */}
        {showControls && hasMultipleImages && !isZoomed && (
          <>
            {currentIndex > 0 && (
              <TouchableOpacity
                style={[styles.sideChevronBtn, styles.sideChevronLeft]}
                onPress={handlePrevImage}
                activeOpacity={0.7}
              >
                <MaterialIcons name="chevron-left" size={32} color="#FFF" />
              </TouchableOpacity>
            )}

            {currentIndex < images.length - 1 && (
              <TouchableOpacity
                style={[styles.sideChevronBtn, styles.sideChevronRight]}
                onPress={handleNextImage}
                activeOpacity={0.7}
              >
                <MaterialIcons name="chevron-right" size={32} color="#FFF" />
              </TouchableOpacity>
            )}
          </>
        )}

        {/* ── BOTTOM CAPTION & WARNING FOOTER OVERLAY ── */}
        {showControls && (
          <LinearGradient
            colors={['transparent', 'rgba(8, 8, 16, 0.7)', 'rgba(8, 8, 16, 0.95)']}
            style={[styles.footerOverlay, { paddingBottom: safeBottomPadding }]}
            pointerEvents="box-none"
          >
            {/* View-Once Warning Pill */}
            {isViewOnce && (
              <View style={styles.viewOnceWarningPill}>
                <MaterialIcons name="info-outline" size={16} color={colors.FILM_GOLD} />
                <Text style={styles.viewOnceWarningText}>
                  This photo will expire permanently once closed.
                </Text>
              </View>
            )}

            {/* Photo Caption Text Box */}
            {Boolean(currentImage.caption) && (
              <View style={styles.captionContainer}>
                <Text style={styles.captionText}>{currentImage.caption}</Text>
              </View>
            )}

            {/* Pagination Indicators for Multi-Photo Gallery */}
            {hasMultipleImages && !isZoomed && (
              <View style={styles.paginationDotsRow}>
                {images.length <= 10 ? (
                  images.map((_, dotIdx) => (
                    <View
                      key={`dot_${dotIdx}`}
                      style={[
                        styles.paginationDot,
                        dotIdx === currentIndex && styles.paginationDotActive,
                      ]}
                    />
                  ))
                ) : (
                  <View style={styles.paginationCounterBadge}>
                    <MaterialIcons name="photo-library" size={14} color="rgba(255, 255, 255, 0.7)" />
                    <Text style={styles.paginationCounterText}>
                      {currentIndex + 1} / {images.length}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </LinearGradient>
        )}
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    backgroundColor: '#000000',
  },
  slideContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  gestureTouchArea: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  animatedImageWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    backgroundColor: 'transparent',
  },
  loaderWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderText: {
    marginTop: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    fontWeight: '500',
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 20,
    zIndex: 10,
  },
  headerContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerCenterCol: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 12,
  },
  headerMainTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  headerSubtitleText: {
    color: colors.CYAN_ACCENT,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
    opacity: 0.9,
  },
  headerRightCol: {
    minWidth: 40,
    alignItems: 'flex-end',
  },
  headerRightSpacer: {
    width: 40,
  },
  resetZoomButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.16)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.4)',
  },
  resetZoomButtonText: {
    color: colors.CYAN_ACCENT,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  viewOnceHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.18)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.4)',
  },
  viewOncePillNumber: {
    width: 18,
    height: 18,
    borderRadius: 6,
    backgroundColor: colors.CYAN_ACCENT,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  viewOncePillText: {
    color: '#080810',
    fontSize: 11,
    fontWeight: '900',
  },
  viewOnceTitleText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  sideChevronBtn: {
    position: 'absolute',
    top: '50%',
    marginTop: -24,
    width: 44,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  sideChevronLeft: {
    left: 12,
  },
  sideChevronRight: {
    right: 12,
  },
  footerOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18,
    paddingTop: 24,
    zIndex: 10,
  },
  viewOnceWarningPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 180, 0, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 0, 0.35)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 10,
  },
  viewOnceWarningText: {
    color: colors.FILM_GOLD,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  captionContainer: {
    backgroundColor: 'rgba(15, 15, 26, 0.85)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
  },
  captionText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  paginationDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  paginationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginHorizontal: 3,
  },
  paginationDotActive: {
    width: 18,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.CYAN_ACCENT,
  },
  paginationCounterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  paginationCounterText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 5,
  },
});

export default memo(ChatImageViewerModal);
