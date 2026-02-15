import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  Dimensions,
  TouchableOpacity,
  Text,
  Pressable,
  Alert,
} from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';
import Orientation from 'react-native-orientation-locker';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { getDatabase, ref, onValue, set } from 'firebase/database';
import { auth } from '../../../config/firebase';
import Animated, { 
  withSpring, 
  useAnimatedStyle, 
  withTiming,
  withSequence,
} from 'react-native-reanimated';

const StreamingScreen = ({ route, navigation }) => {
  const [playing, setPlaying] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  const playerRef = React.useRef();
  const [controlsVisible, setControlsVisible] = useState(true);
  const fadeAnim = useAnimatedStyle(() => {
    return {
      opacity: withTiming(controlsVisible ? 1 : 0, {
        duration: 300,
      }),
    };
  }, [controlsVisible]);
  const [isCreator, setIsCreator] = useState(false);
  const { streamUrl, roomName, roomId } = route.params;


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
    setControlsVisible(false);
  };

  const fadeInControls = () => {
    setControlsVisible(true);
  };

  // // Lock to landscape when component mounts
  // useEffect(() => {
  //   Orientation.lockToLandscape();
  //   return () => {
  //     Orientation.unlockAllOrientations();
  //   };
  // }, []);

  // Extract video ID from the streamUrl passed through navigation
  const getYoutubeVideoId = (url) => {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : false;
  };

  // Get streamUrl from navigation params
  const videoId = getYoutubeVideoId(streamUrl);

  // Add error handling if videoId is not valid
  useEffect(() => {
    if (!videoId) {
      Alert.alert(
        'Invalid URL',
        'The provided YouTube URL is not valid.',
        [
          { 
            text: 'OK', 
            onPress: () => navigation.goBack() 
          }
        ]
      );
    }
  }, [videoId]);

  // Check if current user is the creator
  useEffect(() => {
    const db = getDatabase();
    const roomRef = ref(db, `rooms/${roomId}`);
    
    onValue(roomRef, (snapshot) => {
      const roomData = snapshot.val();
      if (roomData) {
        setIsCreator(roomData.creator.email === auth.currentUser?.email);
      }
    });
  }, [roomId]);

  // Sync playback state with Firebase
  useEffect(() => {
    const db = getDatabase();
    const playbackRef = ref(db, `rooms/${roomId}/playback`);
    
    // Listen for playback changes
    const unsubscribe = onValue(playbackRef, (snapshot) => {
      const playbackData = snapshot.val();
      if (playbackData && !isCreator) {
        setPlaying(playbackData.isPlaying);
        if (playerRef.current) {
          playerRef.current.seekTo(playbackData.currentTime || 0);
        }
      }
    });

    return () => unsubscribe();
  }, [roomId, isCreator]);

  // Update playback state in Firebase (only creator can do this)
  const updatePlaybackState = async (isPlaying) => {
    if (!isCreator) return;

    const db = getDatabase();
    const playbackRef = ref(db, `rooms/${roomId}/playback`);
    const currentTime = await playerRef.current?.getCurrentTime() || 0;

    await set(playbackRef, {
      isPlaying,
      currentTime,
      updatedAt: Date.now()
    });
  };

  const onStateChange = useCallback((state) => {
    if (state === "ended") {
      setPlaying(false);
    }
  }, []);

  const seekBackward = async () => {
    if (!isCreator) return;
    
    if (playerRef.current) {
      const currentTime = await playerRef.current.getCurrentTime();
      const newTime = Math.max(currentTime - 10, 0);
      playerRef.current.seekTo(newTime);
      await updatePlaybackState(playing);
    }
  };

  const seekForward = async () => {
    if (!isCreator) return;
    
    if (playerRef.current) {
      const currentTime = await playerRef.current.getCurrentTime();
      const newTime = currentTime + 10;
      playerRef.current.seekTo(newTime);
      await updatePlaybackState(playing);
    }
  };

  const togglePlayback = async () => {
    if (isCreator) {
      const newPlayingState = !playing;
      setPlaying(newPlayingState);
      await updatePlaybackState(newPlayingState);
    }
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
          {videoId ? (
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
          ) : (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>Invalid video URL</Text>
            </View>
          )}
          <Pressable style={styles.touchOverlay} onPress={() => {}} disabled={true}/>
        </View>

        <Animated.View 
          style={[
            styles.controlsWrapper, 
            fadeAnim,
            !isCreator && styles.disabledControls
          ]}
          pointerEvents={controlsVisible ? 'auto' : 'none'}
        >
          <View style={styles.controls}>
            <View style={styles.mainControls}>
              <TouchableOpacity 
                onPress={seekBackward} 
                style={[styles.controlButton, !isCreator && styles.disabledButton]}
                disabled={!isCreator}
              >
                <Icon name="replay-10" size={26} color={isCreator ? "white" : "#666666"} style={{transform: [{rotate: '90deg'}]}}/>
              </TouchableOpacity>

              <TouchableOpacity 
                onPress={togglePlayback} 
                style={[styles.playButton, !isCreator && styles.disabledButton]}
                disabled={!isCreator}
              >
                <Icon 
                  name={playing ? "pause" : "play-arrow"} 
                  size={40} 
                  color={isCreator ? "white" : "#666666"}
                  style={{transform: [{rotate: '90deg'}]}}
                />
              </TouchableOpacity>

              <TouchableOpacity 
                onPress={seekForward} 
                style={[styles.controlButton, !isCreator && styles.disabledButton]}
                disabled={!isCreator}
              >
                <Icon name="forward-10" size={26} color={isCreator ? "white" : "#666666"} style={{transform: [{rotate: '90deg'}]}}/>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 16,
    textAlign: 'center',
  },
  disabledControls: {
    opacity: 0.5,
  },
  disabledButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
});

export default StreamingScreen;
