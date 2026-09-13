import React, { useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import {
  requireNativeComponent,
  UIManager,
  findNodeHandle,
  StyleSheet,
  Platform,
  View,
  Text,
} from 'react-native';
import colors from '../../theme/Colors';

const NativeCinePlayer = Platform.OS === 'android'
  ? requireNativeComponent('CineNativePlayerView')
  : null;

/**
 * CineNativePlayerView
 * High-performance Android Native Media3 ExoPlayer component wrapper.
 * Provides 100% native hardware acceleration with zero external controls.
 */
const CineNativePlayerView = forwardRef((props, ref) => {
  const {
    url,
    paused = false,
    resizeMode = 'contain',
    volume = 1.0,
    onProgress,
    onStateChange,
    onEnd,
    onError,
    style,
  } = props;

  const nativeRef = useRef(null);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);

  const dispatchCommand = useCallback((commandName, args = []) => {
    if (!nativeRef.current || Platform.OS !== 'android') return;
    const viewId = findNodeHandle(nativeRef.current);
    if (!viewId) return;

    const config = UIManager.getViewManagerConfig('CineNativePlayerView');
    const commandId = config?.Commands?.[commandName];

    if (commandId !== undefined) {
      UIManager.dispatchViewManagerCommand(viewId, commandId, args);
    }
  }, []);

  useImperativeHandle(ref, () => ({
    play: () => {
      dispatchCommand('play');
    },
    pause: () => {
      dispatchCommand('pause');
    },
    seekTo: seconds => {
      currentTimeRef.current = seconds;
      dispatchCommand('seekTo', [seconds]);
    },
    getCurrentTime: async () => currentTimeRef.current,
    getDuration: async () => durationRef.current,
  }));

  const handleProgress = event => {
    const data = event.nativeEvent;
    if (typeof data.currentTime === 'number') {
      currentTimeRef.current = data.currentTime;
    }
    if (typeof data.duration === 'number' && data.duration > 0) {
      durationRef.current = data.duration;
    }
    if (onProgress) {
      onProgress({
        currentTime: currentTimeRef.current,
        duration: durationRef.current,
      });
    }
  };

  const handlePlaybackStateChange = event => {
    const data = event.nativeEvent;
    if (onStateChange) {
      onStateChange({
        isPlaying: data.isPlaying,
        isBuffering: data.isBuffering,
      });
    }
  };

  const handleEnd = () => {
    if (onEnd) onEnd();
  };

  const handleError = event => {
    const data = event.nativeEvent;
    if (onError) onError(data.error);
  };

  if (Platform.OS !== 'android' || !NativeCinePlayer) {
    return (
      <View style={[styles.fallback, style]}>
        <Text style={styles.fallbackText}>Native player active on Android</Text>
      </View>
    );
  }

  return (
    <NativeCinePlayer
      ref={nativeRef}
      url={url}
      paused={paused}
      resizeMode={resizeMode}
      volume={volume}
      onProgress={handleProgress}
      onPlaybackStateChange={handlePlaybackStateChange}
      onEnd={handleEnd}
      onError={handleError}
      style={[styles.nativeView, style]}
    />
  );
});

const styles = StyleSheet.create({
  nativeView: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  fallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.SURFACE_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
  },
});

export default CineNativePlayerView;
