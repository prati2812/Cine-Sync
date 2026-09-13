import React, { useRef, useImperativeHandle, forwardRef, useMemo } from 'react';
import { View, StyleSheet, Text, Platform } from 'react-native';
import Video from 'react-native-video';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import HeadlessYouTubeEngine from './HeadlessYouTubeEngine';
import CineNativePlayerView from './CineNativePlayerView';
import {
  STREAM_TYPES,
  extractYouTubeId,
  detectStreamType,
} from '../../services/video/VideoPlayerService';
import colors from '../../theme/Colors';

/**
 * CineVideoPlayer
 * Universal Cinema Video Player Engine for Cine-Sync.
 *
 * Capabilities:
 * - On Android: 100% Native Media3 ExoPlayer Engine (CineNativePlayerView).
 *   Bypasses all WebViews, iframe API bugs, and YouTube chrome.
 *   Natively extracts YouTube direct media streams in Kotlin (NewPipeExtractor)
 *   and plays direct HLS (.m3u8), MPEG-DASH (.mpd), MP4, and WebM.
 *   Provides 100% reliable play/pause/seek controls with zero UI lag.
 * - On iOS: Fallback using HeadlessYouTubeEngine (for YouTube) or react-native-video (for direct streams).
 * - Unified imperative ref API (play, pause, seekTo, getCurrentTime, getDuration).
 */

const CineVideoPlayer = forwardRef((props, ref) => {
  const {
    url,
    playing = true,
    onProgress,
    onStateChange,
    onEnd,
    onError,
    style,
    resizeMode = 'contain',
  } = props;

  const nativeVideoRef = useRef(null);
  const nativeCinePlayerRef = useRef(null);
  const youtubeEngineRef = useRef(null);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);

  const streamType = useMemo(() => detectStreamType(url), [url]);
  const youtubeId = useMemo(() => {
    if (streamType === STREAM_TYPES.YOUTUBE) {
      return extractYouTubeId(url);
    }
    return null;
  }, [url, streamType]);

  // Unified Ref Handlers
  useImperativeHandle(ref, () => ({
    play: () => {
      if (Platform.OS === 'android' && nativeCinePlayerRef.current) {
        nativeCinePlayerRef.current.play();
      } else if (streamType === STREAM_TYPES.YOUTUBE && youtubeEngineRef.current) {
        youtubeEngineRef.current.play();
      }
    },
    pause: () => {
      if (Platform.OS === 'android' && nativeCinePlayerRef.current) {
        nativeCinePlayerRef.current.pause();
      } else if (streamType === STREAM_TYPES.YOUTUBE && youtubeEngineRef.current) {
        youtubeEngineRef.current.pause();
      }
    },
    seekTo: seconds => {
      currentTimeRef.current = seconds;
      if (Platform.OS === 'android' && nativeCinePlayerRef.current) {
        nativeCinePlayerRef.current.seekTo(seconds);
      } else if (streamType === STREAM_TYPES.YOUTUBE && youtubeEngineRef.current) {
        youtubeEngineRef.current.seekTo(seconds);
      } else if (nativeVideoRef.current) {
        nativeVideoRef.current.seek(seconds);
      }
    },
    getCurrentTime: async () => {
      if (Platform.OS === 'android' && nativeCinePlayerRef.current) {
        return await nativeCinePlayerRef.current.getCurrentTime();
      } else if (streamType === STREAM_TYPES.YOUTUBE && youtubeEngineRef.current) {
        return await youtubeEngineRef.current.getCurrentTime();
      }
      return currentTimeRef.current;
    },
    getDuration: async () => {
      if (Platform.OS === 'android' && nativeCinePlayerRef.current) {
        return await nativeCinePlayerRef.current.getDuration();
      } else if (streamType === STREAM_TYPES.YOUTUBE && youtubeEngineRef.current) {
        return await youtubeEngineRef.current.getDuration();
      }
      return durationRef.current;
    },
  }));

  // Track progress from Native Video (iOS / fallback)
  const handleNativeProgress = data => {
    currentTimeRef.current = data.currentTime || 0;
    if (data.seekableDuration > 0) {
      durationRef.current = data.seekableDuration;
    }
    if (onProgress) {
      onProgress({
        currentTime: data.currentTime || 0,
        duration: durationRef.current,
      });
    }
  };

  const handleNativeLoad = data => {
    durationRef.current = data.duration || 0;
    if (onProgress) {
      onProgress({
        currentTime: data.currentTime || 0,
        duration: data.duration || 0,
      });
    }
    if (onStateChange) {
      onStateChange({ isPlaying: playing, isBuffering: false });
    }
  };

  const handleNativeBuffer = ({ isBuffering }) => {
    if (onStateChange) {
      onStateChange({ isPlaying: playing, isBuffering });
    }
  };

  if (!url) {
    return (
      <View style={[styles.fallbackContainer, style]}>
        <MaterialIcons name="movie" size={38} color={colors.SUB_TITLE_COLOR} />
        <Text style={styles.fallbackText}>No Video Source Provided</Text>
      </View>
    );
  }

  // 1. Android: 100% Native Media3 ExoPlayer Engine (CineNativePlayerView)
  // Handles all streams: YouTube (extracted natively in Kotlin) & custom streams (HLS, DASH, MP4)
  if (Platform.OS === 'android') {
    return (
      <View style={[styles.container, style]}>
        <CineNativePlayerView
          ref={nativeCinePlayerRef}
          url={url}
          paused={!playing}
          resizeMode={resizeMode}
          onProgress={onProgress}
          onStateChange={onStateChange}
          onEnd={onEnd}
          onError={onError}
          style={StyleSheet.absoluteFill}
        />
      </View>
    );
  }

  // 2. iOS Fallback: YouTube Headless Engine
  if (streamType === STREAM_TYPES.YOUTUBE) {
    if (!youtubeId) {
      return (
        <View style={[styles.fallbackContainer, style]}>
          <MaterialIcons name="error-outline" size={38} color={colors.DELETE_RED_COLOR} />
          <Text style={styles.fallbackText}>Invalid YouTube Stream URL</Text>
        </View>
      );
    }

    return (
      <View style={[styles.container, style]}>
        <HeadlessYouTubeEngine
          ref={youtubeEngineRef}
          videoId={youtubeId}
          playing={playing}
          onProgress={onProgress}
          onStateChange={onStateChange}
          onEnd={onEnd}
          onError={onError}
          style={StyleSheet.absoluteFill}
        />
      </View>
    );
  }

  // 3. iOS Fallback: Direct Streams (HLS/MP4) -> react-native-video
  return (
    <View style={[styles.container, style]}>
      <Video
        ref={nativeVideoRef}
        source={{ uri: url }}
        paused={!playing}
        controls={false}
        resizeMode={resizeMode}
        onProgress={handleNativeProgress}
        onLoad={handleNativeLoad}
        onBuffer={handleNativeBuffer}
        onEnd={onEnd}
        onError={onError}
        style={styles.nativeVideo}
        ignoreSilentSwitch="ignore"
        playInBackground={false}
        preventsDisplaySleepDuringVideoPlayback
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  nativeVideo: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  fallbackContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.SURFACE_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  fallbackText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 13,
    fontWeight: '600',
  },
});

export default CineVideoPlayer;
