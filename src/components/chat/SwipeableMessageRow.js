import React, { useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import colors from '../../theme/Colors';

const SwipeableMessageRow = ({ item, isMyMessage, onSwipeReply, children }) => {
  const swipeableRef = useRef(null);

  const renderLeftActions = (progress, dragX) => {
    const scale = dragX.interpolate({
      inputRange: [0, 35, 75],
      outputRange: [0.3, 0.85, 1.15],
      extrapolate: 'clamp',
    });
    const opacity = dragX.interpolate({
      inputRange: [0, 15, 40],
      outputRange: [0, 0.6, 1],
      extrapolate: 'clamp',
    });

    return (
      <View style={styles.swipeReplyActionBox}>
        <Animated.View style={[styles.swipeReplyIconWrap, { opacity, transform: [{ scale }] }]}>
          <MaterialIcons name="reply" size={20} color={colors.CYAN_ACCENT} />
        </Animated.View>
      </View>
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      friction={2}
      leftThreshold={35}
      overshootLeft={false}
      renderLeftActions={renderLeftActions}
      onSwipeableWillOpen={() => {
        if (onSwipeReply) {
          onSwipeReply(item);
        }
        setTimeout(() => {
          swipeableRef.current?.close();
        }, 80);
      }}
    >
      {children}
    </Swipeable>
  );
};

const styles = StyleSheet.create({
  swipeReplyActionBox: {
    width: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  swipeReplyIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(6, 182, 212, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default React.memo(SwipeableMessageRow);

