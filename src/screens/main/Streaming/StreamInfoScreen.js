import React, {useEffect, useMemo, useRef, useState} from 'react';
import {SafeAreaView} from 'react-native-safe-area-context';
import colors from '../../../theme/Colors';
import {
  Alert,
  Dimensions,
  Image,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
  FlatList,
  ScrollView,
} from 'react-native';
import YoutubePlayer, {getYoutubeMeta} from 'react-native-youtube-iframe';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {formatTime, getYoutubeVideoId} from '../../../functions';
import {getDatabase, ref, onValue, set} from 'firebase/database';
import {auth} from '../../../config/firebase';
import Slider from '@react-native-community/slider';
import ViewShot from 'react-native-view-shot';
import BottomSheet from '@gorhom/bottom-sheet';

const StreamInfoScreen = ({route, navigation}) => {
  const {roomId, roomName, streamUrl} = route.params;
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  const playerRef = React.useRef();
  const viewShotRef = useRef(null);

  const [playing, setPlaying] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [videoInfo, setVideoInfo] = useState(null);
  const [isCreator, setIsCreator] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const bottomSheetRef = useRef(null);
  const [notes, setNotes] = useState([]);
  const [noteText, setNoteText] = useState('');
  const [screenshotUri, setScreenshotUri] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const [isModalVisible, setIsModalVisible] = useState(false);

  const emptyStateScale = useSharedValue(1);

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

    onValue(roomRef, snapshot => {
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
    // Start the pulsing animation
    emptyStateScale.value = withRepeat(
      withSpring(1.1, {duration: 1000}),
      -1,
      true,
    );
  }, []);

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

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{scale: emptyStateScale.value}],
    };
  });

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
    console.log('Newwwww Dataaaa', meta, videoDuration);
    setVideoInfo(meta);
    setDuration(videoDuration);
  };

  const onSeek = async value => {
    await playerRef.current?.seekTo(value, true);
    setCurrentTime(value);
  };

  const takeScreenshot = async () => {
    try {
      const uri = await viewShotRef.current.capture();
      console.log('Screenshot URI:', uri);
      // You can now save this URI to the device's media library
      // using libraries like @react-native-community/cameraroll or Expo's MediaLibrary
    } catch (error) {
      console.error('Error taking screenshot:', error);
    }
  };

  const renderEmptyState = () => (
    <Pressable style={styles.emptyStateContainer} onPress={openNoteBottomSheet}>
      <Animated.View style={[styles.emptyStateIconContainer, animatedStyle]}>
        <Text style={styles.emptyStateIcon}>🎥</Text>
      </Animated.View>
      <Text style={styles.emptyStateTitle}>Nothing on the Storyboard</Text>
      <Text style={styles.emptyStateDescription}>
        Spot something interesting? Pause the scene and jot it down.
      </Text>
    </Pressable>
  );

  const openNoteBottomSheet = () => {
    console.log('Opening bottom sheet');
    setPlaying(false);
    setIsModalVisible(true);
  };

  const captureScreenshot = async () => {
    try {
      const uri = await viewShotRef.current.capture();
      setScreenshotUri(uri);
    } catch (err) {
      console.log('Screenshot failed', err);
    }
  };

  const videoHeight = screenWidth * (9 / 16);

  const saveNote = () => {
    if (!noteText.trim() && !screenshotUri) {
      Alert.alert(
        'Add something',
        'Please write a note or capture a screenshot.',
      );
      return;
    }

    const newNote = {
      note: noteText.trim(),
      isScreenshotIncluded: screenshotUri ? true : false,
      screenshotUrl: screenshotUri || '',
      date: new Date().toISOString(),
    };

    setNotes(prev => [...prev, newNote]);

    // Reset fields
    setNoteText('');
    setScreenshotUri('');
    setIsModalVisible(false);
    setPlaying(true);

    console.log('Saved Notes:', newNote);
  };

  const renderNotesHeader = () => {
    if (!notes || notes.length === 0) return null;
  
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderRadius: 14,
          backgroundColor: 'rgba(255,255,255,0.06)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)',
        }}
      >
        <View>
          <Text
            style={{
              color: colors.SUB_TITLE_COLOR,
              fontSize: 13,
            }}
          >
            Your Notes
          </Text>
  
          <Text
            style={{
              color: 'white',
              fontSize: 18,
              fontWeight: '600',
            }}
          >
            {notes.length} Note{notes.length > 1 ? 's' : ''}
          </Text>
        </View>
  
        <Pressable
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 20,
            backgroundColor: 'rgba(255,255,255,0.12)',
          }}
          onPress={openNoteBottomSheet}
        >
          <Icon name="add" size={18} color="white" />
          <Text
            style={{
              color: 'white',
              marginLeft: 6,
              fontSize: 14,
              fontWeight: '500',
            }}
          >
            Add
          </Text>
        </Pressable>
      </View>
    );
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
          <ViewShot
            ref={viewShotRef}
            options={{format: 'png', quality: 0.9}}
            style={{
              width: screenWidth,
              height: videoHeight,
              overflow: 'hidden',
            }}>
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
          </ViewShot>
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
                  flex: 1,
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
                    <Icon name="replay-10" size={26} color={'white'} />
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
                    <Icon name="forward-10" size={26} color={'white'} />
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
                  <Icon name={'fullscreen'} size={30} color={'white'} />
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

          <View
            style={{
              position: 'absolute',
              marginTop: screenHeight / 3.9 + 15,
            }}>
            <View style={{paddingHorizontal: 16, maxWidth: screenWidth}}>
              {videoInfo && (
                <Text
                  style={{
                    color: colors.TITLE_COLOR,
                    fontSize: 20,
                    fontWeight: 'bold',
                  }}>
                  {videoInfo.title}
                </Text>
              )}
            </View>

            {notes?.length === 0 && (
              <View
                style={{
                  paddingHorizontal: 16,
                  maxWidth: screenWidth,
                  marginTop: 20,
                  height: screenHeight,
                }}>
                <View
                  style={{
                    flex: 0.5,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  {renderEmptyState()}
                </View>
              </View>
            )}

            <View
              style={{
                marginTop: 20,
                height: screenHeight,
                width: screenWidth,
              }}>

              <View style={{
                marginHorizontal: 16,
              }}>  

                <FlatList
                  data={notes}
                  keyExtractor={(item, index) => index.toString()}
                  ListHeaderComponent={renderNotesHeader}
                  renderItem={({item}) => (
                    <View
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.05)',
                        padding: 16,
                        borderRadius: 12,
                        marginBottom: 12,
                      }}>
                      <Text
                        style={{
                          color: 'white',
                          fontSize: 16,
                          marginBottom: item.isScreenshotIncluded ? 12 : 0,
                        }}>
                        {item.note}
                      </Text>
                      {item.isScreenshotIncluded && (
                        <Image
                          source={{uri: 'file://' + item.screenshotUrl}}
                          style={{
                            width: '100%',
                            height: 200,
                            borderRadius: 12,
                          }}
                          resizeMode="cover"
                        />
                      )}
                    </View>
                  )}
                 /> 

                </View>   

            </View>
          </View>
        </View>
      </Pressable>

      <Modal
        visible={isModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setIsModalVisible(false);
          setPlaying(true);
        }}>
        {/* BACKDROP */}
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
          }}
          onPress={() => {
            setIsModalVisible(false);
            setPlaying(true);
          }}>
          {/* BOTTOM SHEET */}
          <Pressable
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,

              backgroundColor: 'rgba(20,20,20,0.85)',
              paddingHorizontal: 22,
              paddingTop: 18,
              paddingBottom: 30,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,

              // GLASS EFFECT
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.06)',
              shadowColor: '#000',
              shadowOpacity: 0.4,
              shadowRadius: 16,
              elevation: 15,
            }}
            onPress={e => e.stopPropagation()}>
            {/* Handle Bar */}
            <View
              style={{
                width: 45,
                height: 5,
                backgroundColor: 'rgba(255,255,255,0.25)',
                borderRadius: 3,
                alignSelf: 'center',
                marginBottom: 18,
              }}
            />

            {/* Title */}
            <Text
              style={{
                fontSize: 22,
                fontWeight: '700',
                color: 'white',
                marginBottom: 16,
                letterSpacing: 0.6,
              }}>
              Add Note
            </Text>

            {/* Input */}
            <TextInput
              placeholder="Write something..."
              placeholderTextColor="rgba(255,255,255,0.45)"
              style={{
                backgroundColor: 'rgba(40,40,40,0.85)',
                color: 'white',
                padding: 16,
                borderRadius: 16,
                fontSize: 16,
                lineHeight: 22,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.08)',
                marginBottom: 16,
                maxHeight: 150,
              }}
              multiline
              value={noteText}
              onChangeText={setNoteText}
            />

            {/* Capture Screenshot */}
            <TouchableOpacity
              style={{
                backgroundColor: 'rgba(255,255,255,0.07)',
                padding: 14,
                borderRadius: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.08)',
              }}
              onPress={captureScreenshot}
              activeOpacity={0.8}>
              <Icon name="camera-alt" size={22} color="white" />
              <Text
                style={{
                  color: 'white',
                  marginLeft: 10,
                  fontSize: 16,
                  fontWeight: '500',
                }}>
                Capture Screenshot
              </Text>
            </TouchableOpacity>

            {/* Screenshot Preview */}
            {screenshotUri && (
              <View
                style={{
                  marginTop: 20,
                  borderRadius: 16,
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.08)',
                  height: 200,
                  width: '100%',
                  backgroundColor: '#000',
                }}>
                <Image
                  source={{uri: 'file://' + screenshotUri}}
                  style={{width: '100%', height: '100%'}}
                  resizeMode="cover"
                />
              </View>
            )}

            {/* SAVE BUTTON */}
            <TouchableOpacity
              style={{
                marginTop: 24,
                backgroundColor: '#4C8BFF',
                paddingVertical: 15,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#4C8BFF',
                shadowOpacity: 0.3,
                shadowRadius: 10,
                elevation: 8,
              }}
              onPress={saveNote}
              activeOpacity={0.85}>
              <Text
                style={{
                  color: 'white',
                  fontSize: 17,
                  fontWeight: '600',
                  letterSpacing: 0.5,
                }}>
                Save Note
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyStateIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
  },
  emptyStateIcon: {
    fontSize: 32,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.TITLE_COLOR,
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyStateDescription: {
    fontSize: 16,
    color: '#888888',
    textAlign: 'center',
    lineHeight: 24,
  },
});

export default StreamInfoScreen;
