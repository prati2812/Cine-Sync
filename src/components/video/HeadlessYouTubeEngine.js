import React, { useRef, useImperativeHandle, forwardRef, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

/**
 * HeadlessYouTubeEngine
 * Custom, pure HTML5 YouTube Player running inside an optimized WebView.
 * 
 * COMPLETELY ELIMINATES react-native-youtube-iframe:
 * 1. Uses direct injectJavaScript for 100% reliable play(), pause(), and seekTo() execution.
 * 2. Uses trusted domain baseUrl (https://lonelycpp.github.io) to avoid Error 152-4.
 * 3. Uses desktop User-Agent + mediaPlaybackRequiresUserAction={false} to bypass Android autoplay blocks.
 * 4. Injects CSS to hide all YouTube chrome, titles, watermarks, and pause overlay suggestions.
 * 5. Disables direct touch events (pointerEvents="none") so 100% of touches register on Cine-Sync controls.
 */

const CUSTOM_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.90 Safari/537.36';

const buildHtml = (videoId, autoPlay) => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      background: #000000;
      overflow: hidden;
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      user-select: none;
    }
    html, body {
      width: 100%;
      height: 100%;
      background: #000000;
      position: relative;
    }
    #player {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: none;
    }
    /* Strip 100% of YouTube player chrome, titles, watermarks, and pause overlays */
    .ytp-chrome-top,
    .ytp-chrome-bottom,
    .ytp-watermark,
    .ytp-pause-overlay,
    .ytp-pause-overlay-container,
    .ytp-show-cards-title,
    .ytp-gradient-top,
    .ytp-gradient-bottom,
    .ytp-large-play-button,
    .ytp-large-play-button-bg,
    .ytp-contextmenu,
    .ytp-ce-element,
    .ytp-ce-covering-overlay,
    .ytp-ce-element-shadow,
    .ytp-impression-link,
    .ytp-button,
    .ytp-title,
    .ytp-title-channel {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
  </style>
</head>
<body>
  <div id="player"></div>

  <script>
    var tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    var firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    window.player = null;
    var isReady = false;

    function onYouTubeIframeAPIReady() {
      window.player = new YT.Player('player', {
        videoId: '${videoId}',
        playerVars: {
          autoplay: ${autoPlay ? 1 : 0},
          controls: 0,
          showinfo: 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          fs: 0,
          disablekb: 1,
          enablejsapi: 1,
          origin: 'https://lonelycpp.github.io'
        },
        events: {
          'onReady': onPlayerReady,
          'onStateChange': onPlayerStateChange,
          'onError': onPlayerError
        }
      });
    }

    function onPlayerReady() {
      isReady = true;
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'ready',
          duration: window.player.getDuration() || 0
        }));
      }

      ${autoPlay ? 'window.player.playVideo();' : ''}

      setInterval(function() {
        if (window.player && typeof window.player.getCurrentTime === 'function') {
          var cur = window.player.getCurrentTime() || 0;
          var dur = window.player.getDuration() || 0;
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'progress',
              currentTime: cur,
              duration: dur
            }));
          }
        }
      }, 350);
    }

    function onPlayerStateChange(event) {
      // 1: playing, 2: paused, 3: buffering, 0: ended
      var isPlaying = (event.data === 1);
      var isBuffering = (event.data === 3);
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'stateChange',
          isPlaying: isPlaying,
          isBuffering: isBuffering,
          state: event.data
        }));
        if (event.data === 0) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ended' }));
        }
      }
    }

    function onPlayerError(event) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'error',
          code: event.data
        }));
      }
    }
  </script>
</body>
</html>
`;

const HeadlessYouTubeEngine = forwardRef((props, ref) => {
  const {
    videoId,
    playing = true,
    onProgress,
    onStateChange,
    onReady,
    onError,
    onEnd,
    style,
  } = props;

  const webViewRef = useRef(null);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);

  const executeJs = useCallback(code => {
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(code);
    }
  }, []);

  // Sync playing prop via direct JavaScript execution
  useEffect(() => {
    if (playing) {
      executeJs(`
        if (window.player && typeof window.player.playVideo === 'function') {
          window.player.playVideo();
        }
        true;
      `);
    } else {
      executeJs(`
        if (window.player && typeof window.player.pauseVideo === 'function') {
          window.player.pauseVideo();
        }
        true;
      `);
    }
  }, [playing, executeJs]);

  // Imperative ref methods
  useImperativeHandle(ref, () => ({
    play: () => {
      executeJs(`
        if (window.player && typeof window.player.playVideo === 'function') {
          window.player.playVideo();
        }
        true;
      `);
    },
    pause: () => {
      executeJs(`
        if (window.player && typeof window.player.pauseVideo === 'function') {
          window.player.pauseVideo();
        }
        true;
      `);
    },
    seekTo: seconds => {
      currentTimeRef.current = seconds;
      executeJs(`
        if (window.player && typeof window.player.seekTo === 'function') {
          window.player.seekTo(${seconds}, true);
        }
        true;
      `);
    },
    getCurrentTime: async () => currentTimeRef.current,
    getDuration: async () => durationRef.current,
  }));

  const handleMessage = event => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (!data || !data.type) return;

      switch (data.type) {
        case 'ready':
          durationRef.current = data.duration || 0;
          if (playing) {
            executeJs(`
              if (window.player && typeof window.player.playVideo === 'function') {
                window.player.playVideo();
              }
              true;
            `);
          }
          if (onReady) onReady();
          if (onStateChange) onStateChange({ isPlaying: playing, isBuffering: false });
          break;

        case 'progress':
          currentTimeRef.current = data.currentTime || 0;
          if (data.duration > 0) durationRef.current = data.duration;
          if (onProgress) {
            onProgress({
              currentTime: data.currentTime,
              duration: durationRef.current,
            });
          }
          break;

        case 'stateChange':
          if (onStateChange) {
            onStateChange({
              isPlaying: data.isPlaying,
              isBuffering: data.isBuffering,
              state: data.state,
            });
          }
          break;

        case 'ended':
          if (onEnd) onEnd();
          break;

        case 'error':
          if (onError) onError(data.code);
          break;

        default:
          break;
      }
    } catch (e) {
      // ignore JSON parse error
    }
  };

  return (
    <View style={[styles.container, style]} pointerEvents="none">
      <WebView
        ref={webViewRef}
        source={{
          html: buildHtml(videoId, playing),
          baseUrl: 'https://lonelycpp.github.io',
        }}
        userAgent={CUSTOM_USER_AGENT}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onMessage={handleMessage}
        pointerEvents="none"
        androidLayerType="hardware"
        style={styles.webView}
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
  webView: {
    flex: 1,
    backgroundColor: '#000000',
    opacity: 0.99,
  },
});

export default HeadlessYouTubeEngine;
