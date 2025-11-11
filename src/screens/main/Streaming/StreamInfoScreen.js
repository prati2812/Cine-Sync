import React, {useEffect, useState} from 'react';
import {SafeAreaView} from 'react-native-safe-area-context';
import colors from '../../../theme/Colors';
import {
  Dimensions,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import YoutubePlayer, { getYoutubeMeta } from 'react-native-youtube-iframe';
import Animated, {useAnimatedStyle, withTiming} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {formatTime, getYoutubeVideoId} from '../../../functions';
import { getDatabase, ref, onValue, set } from 'firebase/database';
import { auth } from '../../../config/firebase';
import Slider from '@react-native-community/slider';

const StreamInfoScreen = ({route, navigation}) => {
  const {roomId, roomName, streamUrl} = route.params;
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  const playerRef = React.useRef();

  const [playing, setPlaying] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Get streamUrl from navigation params
  const videoId = getYoutubeVideoId(
    'https://youtu.be/Mih6Znpibnk?si=WWSpKrTNLvkgmmSU',
  );

  const fadeAnim = useAnimatedStyle(() => {
    return {
      opacity: withTiming(controlsVisible ? 1 : 0, {
        duration: 300,
      }),
    };
  }, [controlsVisible]);

  useEffect(() => {
    if (!videoId) {
      Alert.alert('Invalid URL', 'The provided YouTube URL is not valid.', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    }
  }, [videoId]);

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

  useEffect(() => {
    let timeoutId;
    if (controlsVisible && playing) {
      timeoutId = setTimeout(() => {
        fadeOutControls();
      }, 3000);
    }
    return () => timeoutId && clearTimeout(timeoutId);
  }, [controlsVisible, playing]);

  useEffect(() => {
    let interval;
    if (playing) {
      interval = setInterval(async () => {
        const time = await playerRef.current?.getCurrentTime();
        if (time) setCurrentTime(time);
      }, 500);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [playing]);

  const fadeOutControls = () => {
    setControlsVisible(false);
  };

  const fadeInControls = () => {
    setControlsVisible(true);
  };

  const togglePlayback = async () => {
    if (isCreator) {
      const newPlayingState = !playing;
      setPlaying(newPlayingState);
    }
  };

  const seekBackward = async () => {
    if (!isCreator) return;
    
    if (playerRef.current) {
      const currentTime = await playerRef.current.getCurrentTime();
      const newTime = Math.max(currentTime - 10, 0);
      playerRef.current.seekTo(newTime);
    }
  };

  const seekForward = async () => {
    if (!isCreator) return;
    
    if (playerRef.current) {
      const currentTime = await playerRef.current.getCurrentTime();
      const newTime = currentTime + 10;
      playerRef.current.seekTo(newTime);
    }
  };

  const onReady = async () => {
    const meta = await getYoutubeMeta(videoId);
    const videoDuration = await playerRef.current?.getDuration();
    console.log("Newwwww Dataaaa", meta, videoDuration);
    
    setDuration(videoDuration);
  };


  const onSeek = async value => {
    await playerRef.current?.seekTo(value, true);
    setCurrentTime(value);
  };

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: colors.BACKGROUND_COLOR,
      }}>
      <StatusBar
        backgroundColor={colors.STATUSBAR_BG_COLOR}
        barStyle="light-content"
      />
      <Pressable
        style={{
          flex: 1,
        }}>
        <View style={{flexDirection: 'row', flex: 1}}>
          <YoutubePlayer
            ref={playerRef}
            height={screenHeight}
            width={screenWidth}
            play={playing}
            videoId={videoId}
            onReady={onReady}
            initialPlayerParams={{
              controls: 0,
              modestbranding: 1,
              rel: 0,
              playsinline: 1,
            }}
            webViewProps={{
              allowsInlineMediaPlayback: true,
              mediaPlaybackRequiresUserAction: false,
            }}
          />
          <Pressable
            style={{
              position: 'absolute',
              width: screenWidth,
              height: screenHeight / 3.9,
              backgroundColor: 'transparent',
            }}
            onPress={() => {}}
            disabled={true}
          />

          <Pressable
            style={{
              position: 'absolute',
              width: screenWidth,
              height: screenHeight / 3.9,
              backgroundColor: 'transparent',
            }}
            onPress={fadeInControls}>
            <Animated.View
              style={[
                {
                  flex: 1,
                  justifyContent: 'center',
                  top: 40,
                },
                fadeAnim,
              ]}
              pointerEvents={controlsVisible ? 'auto' : 'none'}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex:1,
                }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 24,
                  }}>
                  <TouchableOpacity
                    onPress={seekBackward}
                    style={[styles.controlButton]}
                    disabled={!isCreator}>
                    <Icon
                      name="replay-10"
                      size={26}
                      color={'white'}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={togglePlayback}
                    style={[styles.playButton]}
                    disabled={!isCreator}>
                    <Icon
                      name={playing ? 'pause' : 'play-arrow'}
                      size={40}
                      color={'white'}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={seekForward}
                    style={[styles.controlButton]}
                    disabled={!isCreator}>
                    <Icon
                      name="forward-10"
                      size={26}
                      color={'white'}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </Animated.View>

            <View style={{paddingHorizontal: 16, marginTop: 16}}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center', // center items vertically
                  justifyContent: 'space-between',
                }}>
                <Slider
                  style={{flex: 1, height: 25, marginRight: 12}}
                  minimumValue={0}
                  maximumValue={duration}
                  value={currentTime}
                  minimumTrackTintColor={colors.PRIMARY_COLOR_DARK}
                  maximumTrackTintColor={colors.SEEK_BAR_UNFILLED_COLOR}
                  thumbTintColor={colors.PRIMARY_COLOR_DARK}
                  onSlidingComplete={onSeek}
                />

                  <TouchableOpacity>
                    <Icon
                      name={'fullscreen'}
                      size={30}
                      color={"white"}
                    />
                  </TouchableOpacity>
              </View>

              <View
                style={{
                  marginBottom: 5,
                }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                  }}>
                  <Text
                    style={{
                      color: colors.SUB_TITLE_COLOR,
                      fontSize: 12,
                    }}>
                    {formatTime(currentTime)}
                  </Text>
                  <Text style={{color: colors.SUB_TITLE_COLOR, fontSize: 12}}>
                    {formatTime(duration)}
                  </Text>
                </View>
              </View>
            </View>
          </Pressable>
        </View>
      </Pressable>
    </SafeAreaView>
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
    transform: [{rotate: '90deg'}],
  },
  controlsWrapper: {
    position: 'absolute',
    left: 0,
    top: 0,
    background: 'transparent',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mainControls: {
    flexDirection: 'row',
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

export default StreamInfoScreen;
