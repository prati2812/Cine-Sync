import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  Dimensions,
  TouchableOpacity,
  Text,
  Pressable,
  Animated,
} from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';
import Orientation from 'react-native-orientation-locker';
import Icon from 'react-native-vector-icons/MaterialIcons';

const StreamingScreen = ({ route }) => {
  const [playing, setPlaying] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  const playerRef = React.useRef();
  const [controlsVisible, setControlsVisible] = useState(true);
  const fadeAnim = React.useRef(new Animated.Value(1)).current;

  // Auto-hide controls after 3 seconds of inactivity
  useEffect(() => {
    let timeoutId;
    if (controlsVisible && playing) {
      timeoutId = setTimeout(() => {
        fadeOutControls();
      }, 3000);
    }
    return () => timeoutId && clearTimeout(timeoutId);
  }, [controlsVisible, playing]);

  const fadeOutControls = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => setControlsVisible(false));
  };

  const fadeInControls = () => {
    setControlsVisible(true);
    fadeAnim.setValue(1);
  };

  // Lock to landscape when component mounts
  useEffect(() => {
    Orientation.lockToLandscape();
    return () => {
      Orientation.unlockAllOrientations();
    };
  }, []);

  // Extract video ID from YouTube URL
  const getYoutubeVideoId = (url) => {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : false;
  };

  const videoId = getYoutubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

  const onStateChange = useCallback((state) => {
    if (state === "ended") {
      setPlaying(false);
    }
  }, []);

  const seekBackward = async () => {
    try{
      if (playerRef.current) {
        const currentTime = await playerRef.current.getCurrentTime();
        playerRef.current.seekTo(Math.max(currentTime - 10, 0));
      } 
    }catch(error){
      console.log(error);
    }
    
  };

  const seekForward = async () => {
    if (playerRef.current) {
      const currentTime = await playerRef.current.getCurrentTime();
      playerRef.current.seekTo(currentTime + 10);
    }
  };

  const togglePlayback = () => {
    setPlaying(prev => !prev);
  };

  const changeSpeed = () => {
    try{
      const speeds = [0.5, 1, 1.5, 2];
      const currentIndex = speeds.indexOf(playbackRate);
      const nextIndex = (currentIndex + 1) % speeds.length;
      setPlaybackRate(speeds[nextIndex]);
      if (playerRef.current) {
        playerRef.current.setPlaybackRate(speeds[nextIndex]);
      }
    }catch(error){
      console.log(error);
    }
   
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <Pressable 
        style={styles.videoWrapper}
        onPress={fadeInControls}
      >
        <View style={styles.videoContainer}>
           <YoutubePlayer
            ref={playerRef}
            height={screenWidth}
            width={screenHeight}
            play={playing}
            videoId={videoId}
            initialPlayerParams={{
              controls: 1,
              modestbranding: 1,
              preventFullScreen: true,
            }}
           />
          <Pressable style={styles.touchOverlay} onPress={() => {}} disabled={true}/>
        </View>

        <Animated.View 
          style={[styles.controlsWrapper, { opacity: fadeAnim }]}
          pointerEvents={controlsVisible ? 'auto' : 'none'}
        >
          <View style={styles.controls}>
            <View style={styles.mainControls}>
              <TouchableOpacity onPress={seekBackward} style={styles.controlButton}>
                <Icon name="replay-10" size={26} color="white" style={{transform: [{rotate: '90deg'}]}}/>
              </TouchableOpacity>

              <TouchableOpacity onPress={togglePlayback} style={styles.playButton}>
                <Icon 
                  name={playing ? "pause" : "play-arrow"} 
                  size={40} 
                  color="white"
                  style={{transform: [{rotate: '90deg'}]}}
                />
              </TouchableOpacity>

              <TouchableOpacity onPress={seekForward} style={styles.controlButton}>
                <Icon name="forward-10" size={26} color="white" style={{transform: [{rotate: '90deg'}]}}/>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  videoWrapper: {
    flex: 1,
    position: 'relative',
  },
  videoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
    transform: [{ rotate: '90deg' }],
  },
  controlsWrapper: {
    position: 'absolute',
    left: 20,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    background: 'transparent',
  },
  controls: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  mainControls: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 24,
  },
  controlButton: {
    width: 45,
    height: 45,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 60,
    height: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  touchOverlay: {
    position: 'absolute',
    width: Dimensions.get('window').height,
    height: Dimensions.get('window').width,
    backgroundColor: 'transparent',
    zIndex: 2,
  },
});

export default StreamingScreen;
