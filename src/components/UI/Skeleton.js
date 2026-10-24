import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Easing, Dimensions } from 'react-native';
import colors from '../../theme/Colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Primitive Skeleton placeholder with native-driven pulse animation (60/120 FPS)
 */
export const SkeletonPlaceholder = ({
  width,
  height,
  borderRadius = 8,
  style,
  shimmer = true,
  children,
}) => {
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (!shimmer) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.75,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim, shimmer]);

  return (
    <Animated.View
      style={[
        styles.skeletonBase,
        width !== undefined && { width },
        height !== undefined && { height },
        borderRadius !== undefined && { borderRadius },
        shimmer && { opacity: pulseAnim },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
};

/**
 * Hero Card Skeleton matching the featured watch party card in LibraryScreen & HomeScreen
 */
export const HeroCardSkeleton = ({ style }) => {
  return (
    <View style={[styles.heroWrap, style]}>
      <View style={styles.heroCardContainer}>
        {/* Top Badge Placeholder */}
        <View style={styles.heroTopRow}>
          <SkeletonPlaceholder width={96} height={24} borderRadius={10} />
          <SkeletonPlaceholder width={64} height={24} borderRadius={10} />
        </View>

        {/* Hero Bottom Info Placeholders */}
        <View style={styles.heroDetails}>
          <SkeletonPlaceholder
            width={130}
            height={13}
            borderRadius={6}
            style={styles.heroCategoryPlaceholder}
          />
          <SkeletonPlaceholder
            width="82%"
            height={24}
            borderRadius={8}
            style={styles.heroTitlePlaceholder}
          />
          <SkeletonPlaceholder
            width="55%"
            height={15}
            borderRadius={6}
            style={styles.heroSubtitlePlaceholder}
          />
          <View style={styles.heroCtaRow}>
            <SkeletonPlaceholder width={140} height={42} borderRadius={12} />
          </View>
        </View>
      </View>
    </View>
  );
};

/**
 * Room Card Skeleton matching the exact layout of RoomCard in LibraryScreen
 */
export const RoomCardSkeleton = ({ style }) => {
  return (
    <View style={[styles.roomCard, style]}>
      {/* Left accent strip placeholder */}
      <SkeletonPlaceholder width={3} height="100%" borderRadius={2} />

      <View style={styles.roomCardInner}>
        {/* Left Thumbnail Poster */}
        <SkeletonPlaceholder
          width={90}
          height={72}
          borderRadius={12}
          style={styles.roomThumb}
        />

        {/* Center Details */}
        <View style={styles.roomInfo}>
          <SkeletonPlaceholder
            width="80%"
            height={16}
            borderRadius={6}
            style={styles.roomTitlePlaceholder}
          />
          <SkeletonPlaceholder
            width="50%"
            height={13}
            borderRadius={5}
            style={styles.roomHostPlaceholder}
          />
          <SkeletonPlaceholder
            width="36%"
            height={12}
            borderRadius={5}
          />
        </View>

        {/* Right chevron / badge placeholder */}
        <View style={styles.roomCardRight}>
          <SkeletonPlaceholder width={18} height={18} borderRadius={6} />
        </View>
      </View>
    </View>
  );
};

/**
 * Horizontal Rail Card Skeleton for Cinema Movies / Videos on HomeScreen
 */
export const RailCardSkeleton = ({ style, width = 135, height = 195 }) => {
  return (
    <View style={[styles.railCardWrap, { width }, style]}>
      <SkeletonPlaceholder
        width={width}
        height={height}
        borderRadius={14}
        style={styles.railPoster}
      />
      <SkeletonPlaceholder
        width="88%"
        height={14}
        borderRadius={5}
        style={styles.railTitlePlaceholder}
      />
      <SkeletonPlaceholder
        width="55%"
        height={11}
        borderRadius={4}
      />
    </View>
  );
};

/**
 * Horizontal row of RailCardSkeletons
 */
export const RailRowSkeleton = ({ count = 3, cardWidth = 135, cardHeight = 195 }) => {
  return (
    <View style={styles.railRow}>
      {Array.from({ length: count }).map((_, index) => (
        <RailCardSkeleton
          key={index}
          width={cardWidth}
          height={cardHeight}
          style={index < count - 1 ? styles.railCardMargin : null}
        />
      ))}
    </View>
  );
};

/**
 * 2-Column Grid Card Skeleton for Infinity Stream Catalog
 */
export const InfinityCardSkeleton = ({ style }) => {
  const cardWidth = (SCREEN_WIDTH - 44) / 2;
  const thumbHeight = cardWidth * (9 / 16);

  return (
    <View style={[styles.infinityCard, style]}>
      <SkeletonPlaceholder
        width="100%"
        height={thumbHeight}
        borderRadius={0}
      />
      <View style={styles.infinityCardInfo}>
        <SkeletonPlaceholder
          width="88%"
          height={14}
          borderRadius={5}
          style={styles.infinityTitlePlaceholder}
        />
        <SkeletonPlaceholder
          width="55%"
          height={11}
          borderRadius={4}
        />
      </View>
    </View>
  );
};

/**
 * Grid of InfinityCardSkeletons
 */
export const InfinityGridSkeleton = ({ count = 4 }) => {
  return (
    <View style={styles.infinityGrid}>
      {Array.from({ length: count }).map((_, i) => (
        <InfinityCardSkeleton key={i} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  skeletonBase: {
    backgroundColor: colors.SURFACE_ELEVATED,
  },

  // ── Hero Card Skeleton ──
  heroWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  heroCardContainer: {
    height: 250,
    borderRadius: 20,
    backgroundColor: colors.SURFACE_COLOR,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    padding: 16,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroDetails: {
    marginTop: 'auto',
  },
  heroCategoryPlaceholder: {
    marginBottom: 10,
  },
  heroTitlePlaceholder: {
    marginBottom: 8,
  },
  heroSubtitlePlaceholder: {
    marginBottom: 16,
  },
  heroCtaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // ── Room Card Skeleton ──
  roomCard: {
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
  },
  roomCardInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 12,
  },
  roomThumb: {
    flexShrink: 0,
  },
  roomInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  roomTitlePlaceholder: {
    marginBottom: 8,
  },
  roomHostPlaceholder: {
    marginBottom: 8,
  },
  roomCardRight: {
    paddingRight: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Rail Card Skeleton ──
  railCardWrap: {
    marginRight: 12,
  },
  railPoster: {
    marginBottom: 8,
  },
  railTitlePlaceholder: {
    marginBottom: 6,
  },
  railRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  railCardMargin: {
    marginRight: 12,
  },

  // ── Infinity Grid & Card Skeleton ──
  infinityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  infinityCard: {
    width: (SCREEN_WIDTH - 44) / 2,
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    overflow: 'hidden',
    marginBottom: 14,
  },
  infinityCardInfo: {
    padding: 10,
  },
  infinityTitlePlaceholder: {
    marginBottom: 6,
  },
});

export default SkeletonPlaceholder;
