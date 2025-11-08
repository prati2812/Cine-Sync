import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
  TouchableOpacity,
  FlatList,
  StatusBar,
  Image,
  Animated,
  Platform,
  KeyboardAvoidingView,
  Modal,
  PermissionsAndroid,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from '@react-native-community/blur';
import { getDatabase, ref, push, onValue, off, serverTimestamp, set, get } from 'firebase/database';
import { auth } from '../../../config/firebase';
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
} from 'react-native-webrtc';

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const ChatScreen = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('');
  const [showAttachments, setShowAttachments] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatId, setChatId] = useState(null);
  const flatListRef = useRef(null);
  const [isInCall, setIsInCall] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const peerConnection = useRef(null);
  const [callError, setCallError] = useState(null);
  const [callTimeout, setCallTimeout] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isCallMuted, setIsCallMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const durationInterval = useRef(null);

  useEffect(() => {
    initializeChat();
    setupUserPresence();
    return () => {
      // Cleanup listeners
      if (chatId) {
        const db = getDatabase();
        const chatRef = ref(db, `chats/${chatId}/messages`);
        off(chatRef);
      }
    };
  }, []);

  const initializeChat = async () => {
    const db = getDatabase();
    const currentUser = auth.currentUser;
    const otherUserId = route.params?.userId;

    if (!currentUser || !otherUserId) return;

    // Check if chat already exists between these users
    const userChatsRef = ref(db, `user_chats/${currentUser.uid}`);
    onValue(userChatsRef, (snapshot) => {
      const chats = snapshot.val();
      if (chats) {
        // Find chat with other user
        const existingChatId = Object.keys(chats).find(
          (key) => chats[key].otherUserId === otherUserId
        );

        if (existingChatId) {
          setChatId(existingChatId);
          listenToMessages(existingChatId);
        } else {
          // Create new chat
          createNewChat(currentUser.uid, otherUserId);
        }
      } else {
        // Create new chat
        createNewChat(currentUser.uid, otherUserId);
      }
    });
  };

  const createNewChat = async (currentUserId, otherUserId) => {
    const db = getDatabase();
    const newChatRef = push(ref(db, 'chats'));
    const chatId = newChatRef.key;

    // Set up chat participants
    await Promise.all([
      set(ref(db, `chats/${chatId}/participants/${currentUserId}`), true),
      set(ref(db, `chats/${chatId}/participants/${otherUserId}`), true),
      set(ref(db, `user_chats/${currentUserId}/${chatId}`), {
        otherUserId,
        lastMessage: '',
        lastMessageTimestamp: serverTimestamp(),
      }),
      set(ref(db, `user_chats/${otherUserId}/${chatId}`), {
        otherUserId: currentUserId,
        lastMessage: '',
        lastMessageTimestamp: serverTimestamp(),
      }),
    ]);

    setChatId(chatId);
    listenToMessages(chatId);
  };

  const listenToMessages = (chatId) => {
    const db = getDatabase();
    const messagesRef = ref(db, `chats/${chatId}/messages`);
    
    onValue(messagesRef, (snapshot) => {
      const messagesData = snapshot.val();
      if (messagesData) {
        const messagesList = Object.entries(messagesData).map(([id, data]) => ({
          id,
          ...data,
        }));
        // Sort messages by timestamp
        messagesList.sort((a, b) => a.timestamp - b.timestamp);
        setMessages(messagesList);
        
        // Scroll to bottom
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    });
  };

  const sendMessage = async () => {
    if (!message.trim() || !chatId) return;
    
    const db = getDatabase();
    const currentUser = auth.currentUser;
    const messageData = {
      text: message.trim(),
      senderId: currentUser.uid,
      timestamp: serverTimestamp(),
      type: 'text',
    };

    // Add message to chat
    const newMessageRef = push(ref(db, `chats/${chatId}/messages`));
    await set(newMessageRef, messageData);
    
    setMessage(''); // Clear input
  };

  const renderMessage = ({ item }) => {
    const isMyMessage = item.senderId === auth.currentUser?.uid;

    if (item.type === 'voice') {
      return (
        <View style={[
          styles.messageContainer,
          isMyMessage ? styles.myMessage : styles.theirMessage,
          styles.voiceContainer
        ]}>
          <TouchableOpacity style={styles.voicePlayButton}>
            <MaterialIcons name="play-arrow" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.voiceWaveform} />
          <Text style={styles.voiceDuration}>{item.duration}</Text>
          <Text style={styles.timestamp}>
            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      );
    }

    return (
      <View style={[
        styles.messageContainer,
        isMyMessage ? styles.myMessage : styles.theirMessage
      ]}>
        <Text style={styles.messageText}>{item.text}</Text>
        <Text style={styles.timestamp}>
          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    );
  };

  const renderAttachmentButtons = () => (
    <View style={styles.attachmentButtons}>
      <TouchableOpacity style={[styles.attachmentButton, { backgroundColor: '#FF2D55' }]}>
        <MaterialIcons name="camera-alt" size={24} color="#FFFFFF" />
      </TouchableOpacity>
      <TouchableOpacity style={[styles.attachmentButton, { backgroundColor: '#5856D6' }]}>
        <MaterialIcons name="photo" size={24} color="#FFFFFF" />
      </TouchableOpacity>
      <TouchableOpacity style={[styles.attachmentButton, { backgroundColor: '#FF9500' }]}>
        <MaterialIcons name="insert-drive-file" size={24} color="#FFFFFF" />
      </TouchableOpacity>
      <TouchableOpacity style={[styles.attachmentButton, { backgroundColor: '#4CD964' }]}>
        <MaterialIcons name="location-on" size={24} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );

  const handleScroll = (event) => {
    const scrollY = event.nativeEvent.contentOffset.y;
    setIsScrolled(scrollY > 10);
  };

  // Initialize WebRTC
  const setupWebRTC = async () => {
    try {
      console.log('Creating peer connection...');  // Debug log
      peerConnection.current = new RTCPeerConnection(configuration);

      // Get local stream
      console.log('Getting user media...');  // Debug log
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      
      console.log('Setting local stream...');  // Debug log
      setLocalStream(stream);

      // Add stream to peer connection
      stream.getTracks().forEach((track) => {
        console.log('Adding track to peer connection...');  // Debug log
        peerConnection.current.addTrack(track, stream);
      });

      // Handle remote stream
      peerConnection.current.ontrack = (event) => {
        console.log('Received remote track...');  // Debug log
        setRemoteStream(event.streams[0]);
      };

      // Handle ICE candidates
      peerConnection.current.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('Sending ICE candidate...');  // Debug log
          const db = getDatabase();
          push(ref(db, `calls/${chatId}/candidates/${auth.currentUser.uid}`), {
            candidate: event.candidate.toJSON(),
            timestamp: serverTimestamp(),
          });
        }
      };

      // Add connection state change handler
      peerConnection.current.onconnectionstatechange = () => {
        console.log('Connection state:', peerConnection.current.connectionState);  // Debug log
      };

    } catch (error) {
      console.error('WebRTC setup error:', error);  // Debug log
      throw error;
    }
  };

  // Modify the checkCallSecurity function
  const checkCallSecurity = async () => {
    try {
      const db = getDatabase();
      const currentUser = auth.currentUser;
      
      // Check if user is authenticated
      if (!currentUser) {
        throw new Error('You must be logged in to make calls');
      }

      // Check if we have a valid chatId and other user ID
      if (!chatId || !route.params?.userId) {
        throw new Error('Invalid chat or user');
      }

      // Check for ongoing call
      const activeCallRef = ref(db, `calls/${chatId}`);
      const activeCallSnapshot = await get(activeCallRef);
      if (activeCallSnapshot.exists()) {
        const callData = activeCallSnapshot.val();
        // Only throw error if there's an active call that hasn't ended
        if (callData && !callData.ended) {
          throw new Error('There is already an active call in this chat');
        }
      }

      // Check call permissions
      try {
        const stream = await mediaDevices.getUserMedia({ audio: true });
        // Stop the test stream immediately
        stream.getTracks().forEach(track => track.stop());
      } catch (error) {
        throw new Error('Microphone permission denied');
      }

      return true;
    } catch (error) {
      console.error('Security check failed:', error.message);  // Debug log
      setCallError(error.message);
      return false;
    }
  };

  // Add this function to monitor user presence
  const setupUserPresence = () => {
    if (!auth.currentUser) return;
    
    const db = getDatabase();
    const userStatusRef = ref(db, `users/${auth.currentUser.uid}/status`);
    
    // Set user as online
    set(userStatusRef, 'online');
    
    // Set up disconnect hook
    const connectedRef = ref(db, '.info/connected');
    onValue(connectedRef, (snapshot) => {
      if (snapshot.val() === true) {
        // When user disconnects, update the status
        set(userStatusRef, 'offline');
      }
    });
  };

  // Modify the startCall function
  const startCall = async () => {
    try {
      console.log('Starting call...');  // Debug log
      
      // Check permissions first
      const hasPermissions = await checkCallSecurity();
      if (!hasPermissions) {
        console.log('Permission denied');  // Debug log
        return;
      }

      // Check if user is authenticated
      if (!auth.currentUser) {
        setCallError('You must be logged in to make calls');
        console.log('User not authenticated');  // Debug log
        return;
      }

      // Check if chat is initialized
      if (!chatId) {
        setCallError('Chat not initialized');
        console.log('No chatId available');  // Debug log
        return;
      }

      setIsCalling(true);
      console.log('Setting up WebRTC...');  // Debug log
      
      try {
        await setupWebRTC();
      } catch (error) {
        console.error('WebRTC setup error:', error);  // Debug log
        setCallError('Failed to setup call: ' + error.message);
        setIsCalling(false);
        return;
      }

      // Set call timeout (30 seconds)
      const timeout = setTimeout(() => {
        if (!isInCall) {
          console.log('Call timeout');  // Debug log
          endCall();
          setCallError('Call timeout - no answer');
        }
      }, 30000);
      setCallTimeout(timeout);

      try {
        // Create and set local description
        console.log('Creating offer...');  // Debug log
        const offer = await peerConnection.current.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false,
          voiceActivityDetection: true,
        });
        
        console.log('Setting local description...');  // Debug log
        await peerConnection.current.setLocalDescription(offer);

        // Send offer to Firebase
        const db = getDatabase();
        const encryptedOffer = {
          ...offer,
          timestamp: serverTimestamp(),
          from: auth.currentUser.uid,
          secure: true,
          version: '1.0',
        };

        console.log('Sending offer to Firebase...');  // Debug log
        await set(ref(db, `calls/${chatId}/offer`), encryptedOffer);

        // Set up call monitoring
        setupCallMonitoring();

      } catch (error) {
        console.error('Offer creation/sending error:', error);  // Debug log
        setCallError('Failed to initiate call: ' + error.message);
        endCall();
      }

    } catch (error) {
      console.error('Call start error:', error);  // Debug log
      setCallError(error.message);
      setIsCalling(false);
    }
  };

  // Add call monitoring function
  const setupCallMonitoring = () => {
    // Monitor connection state
    peerConnection.current.onconnectionstatechange = () => {
      const state = peerConnection.current.connectionState;
      if (state === 'failed' || state === 'disconnected') {
        setCallError('Call connection lost');
        endCall();
      }
    };

    // Monitor ICE connection state
    peerConnection.current.oniceconnectionstatechange = () => {
      const state = peerConnection.current.iceConnectionState;
      if (state === 'failed') {
        setCallError('ICE connection failed');
        endCall();
      }
    };

    // Start call duration timer when connected
    if (isInCall) {
      durationInterval.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }
  };

  // Modify the answerCall function
  const answerCall = async () => {
    try {
      const securityCheck = await checkCallSecurity();
      if (!securityCheck) return;

      await setupWebRTC();

      const db = getDatabase();
      const snapshot = await get(ref(db, `calls/${chatId}/offer`));
      const data = snapshot.val();
      
      // Verify offer security
      if (!data?.secure || !data?.version) {
        throw new Error('Invalid call offer');
      }

      if (data?.offer) {
        const remoteDesc = new RTCSessionDescription(data.offer);
        await peerConnection.current.setRemoteDescription(remoteDesc);

        const answer = await peerConnection.current.createAnswer({
          voiceActivityDetection: true,
        });
        await peerConnection.current.setLocalDescription(answer);

        // Send encrypted answer
        const encryptedAnswer = {
          answer,
          timestamp: serverTimestamp(),
          from: auth.currentUser.uid,
          secure: true,
          version: '1.0',
        };

        await set(ref(db, `calls/${chatId}/answer`), encryptedAnswer);
      }

      setIsInCall(true);
      setupCallMonitoring();

    } catch (error) {
      setCallError(error.message);
      endCall();
    }
  };

  // Modify the endCall function
  const endCall = () => {
    try {
      // Clear timeouts and intervals
      if (callTimeout) {
        clearTimeout(callTimeout);
        setCallTimeout(null);
      }
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
        durationInterval.current = null;
      }

      // Stop all tracks
      if (localStream) {
        localStream.getTracks().forEach(track => {
          track.stop();
          localStream.removeTrack(track);
        });
      }

      // Close and cleanup peer connection
      if (peerConnection.current) {
        peerConnection.current.onicecandidate = null;
        peerConnection.current.ontrack = null;
        peerConnection.current.onconnectionstatechange = null;
        peerConnection.current.oniceconnectionstatechange = null;
        peerConnection.current.close();
        peerConnection.current = null;
      }

      setLocalStream(null);
      setRemoteStream(null);
      setIsInCall(false);
      setIsCalling(false);
      setCallDuration(0);
      setIsCallMuted(false);
      setIsSpeakerOn(false);

      // Clean up Firebase call data with security check
      const db = getDatabase();
      const currentUser = auth.currentUser;
      if (currentUser && chatId) {
        set(ref(db, `calls/${chatId}`), {
          ended: {
            by: currentUser.uid,
            timestamp: serverTimestamp()
          }
        });
      }

    } catch (error) {
      console.error('Error ending call:', error);
    }
  };

  // Add these new call control functions
  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsCallMuted(!isCallMuted);
    }
  };

  const toggleSpeaker = () => {
    if (remoteStream) {
      // Toggle audio output (implementation depends on device capabilities)
      setIsSpeakerOn(!isSpeakerOn);
    }
  };

  // Modify the renderCallModal to include new features
  const renderCallModal = () => (
    <Modal
      visible={isCalling || isInCall}
      animationType="slide"
      transparent={true}
    >
      <View style={styles.modalContainer}>
        <View style={styles.callCard}>
          <Image 
            style={styles.callAvatar}
            source={{ uri: route.params?.avatar || 'https://via.placeholder.com/100' }}
          />
          <Text style={styles.callName}>{route.params?.username}</Text>
          <Text style={styles.callStatus}>
            {isInCall ? `On Call ${formatDuration(callDuration)}` : (isCalling ? 'Calling...' : 'Incoming Call')}
          </Text>
          
          {callError && (
            <Text style={styles.errorText}>{callError}</Text>
          )}
          
          <View style={styles.callActions}>
            {isInCall && (
              <>
                <TouchableOpacity 
                  style={[styles.callButton, styles.controlButton]} 
                  onPress={toggleMute}
                >
                  <MaterialIcons 
                    name={isCallMuted ? "mic-off" : "mic"} 
                    size={24} 
                    color="#fff" 
                  />
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.callButton, styles.controlButton]} 
                  onPress={toggleSpeaker}
                >
                  <MaterialIcons 
                    name={isSpeakerOn ? "volume-up" : "volume-down"} 
                    size={24} 
                    color="#fff" 
                  />
                </TouchableOpacity>
              </>
            )}
            
            {!isInCall && !isCalling && (
              <>
                <TouchableOpacity 
                  style={[styles.callButton, styles.answerButton]} 
                  onPress={answerCall}
                >
                  <MaterialIcons name="call" size={30} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.callButton, styles.declineButton]} 
                  onPress={endCall}
                >
                  <MaterialIcons name="call-end" size={30} color="#fff" />
                </TouchableOpacity>
              </>
            )}
            
            {(isInCall || isCalling) && (
              <TouchableOpacity 
                style={[styles.callButton, styles.declineButton]} 
                onPress={endCall}
              >
                <MaterialIcons name="call-end" size={30} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );

  // Add this utility function
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Add these new styles
  const additionalStyles = {
    errorText: {
      color: '#FF3B30',
      fontSize: 14,
      marginBottom: 20,
      textAlign: 'center',
    },
    controlButton: {
      backgroundColor: '#666666',
      width: 50,
      height: 50,
      borderRadius: 25,
    },
  };

  // Add the additional styles to your StyleSheet
  Object.assign(styles, additionalStyles);

  // Modify the header right buttons to include call button
  const headerRight = (
    <View style={styles.headerRight}>
      <TouchableOpacity 
        style={styles.headerButton}
        onPress={() => {
          console.log('Call button pressed');  // Debug log
          console.log('ChatId:', chatId);  // Debug log
          console.log('User:', auth.currentUser?.uid);  // Debug log
          startCall();
        }}
      >
        <MaterialIcons name="call" size={22} color="#FFFFFF" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.headerButton}>
        <MaterialIcons name="more-horiz" size={22} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="transparent" barStyle="light-content" translucent />
      
      <Animated.View style={[
        styles.header,
        { paddingTop: insets.top },
        isScrolled && styles.headerScrolled
      ]}>
        <View style={styles.headerContent}>
          <View style={styles.headerLeft}>
            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <MaterialIcons name="arrow-back-ios" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.headerProfile}
              onPress={() => navigation.navigate('Profile', { userId: route.params?.userId })}
            >
              <Image 
                style={styles.avatar}
                source={{ uri: route.params?.avatar || 'https://via.placeholder.com/40' }}
              />
              <View style={styles.headerInfo}>
                <Text style={styles.headerName}>{route.params?.username || 'Chat'}</Text>
                <View style={styles.onlineContainer}>
                  <View style={styles.onlineDot} />
                  <Text style={styles.headerStatus}>Online</Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>

          {headerRight}
        </View>
      </Animated.View>

      <KeyboardAvoidingView 
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : null}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
      >
        <FlatList
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messagesList}
          inverted={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          ref={flatListRef}
        />

        {showAttachments && renderAttachmentButtons()}

        <View style={styles.inputContainer}>
          <TouchableOpacity 
            style={styles.addButton}
            onPress={() => setShowAttachments(!showAttachments)}
          >
            <MaterialIcons name="add" size={24} color="#007AFF" />
          </TouchableOpacity>
          
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Type a message..."
              placeholderTextColor="#666666"
              value={message}
              onChangeText={setMessage}
              multiline
            />
          </View>

          <TouchableOpacity style={styles.emojiButton}>
            <MaterialIcons name="emoji-emotions" size={24} color="#666666" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.sendButton, { opacity: message.trim().length > 0 ? 1 : 0.5 }]}
            onPress={sendMessage}
            disabled={message.trim().length === 0}
          >
            <MaterialIcons name="send" size={24} color="#007AFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {renderCallModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: 'rgba(26, 26, 26, 0.98)',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerScrolled: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backButton: {
    padding: 8,
    marginRight: 4,
  },
  headerProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2A2A2A',
  },
  headerInfo: {
    marginLeft: 12,
    flex: 1,
  },
  headerName: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  onlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
    marginRight: 6,
  },
  headerStatus: {
    color: '#999999',
    fontSize: 13,
    letterSpacing: 0.1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerButton: {
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  messagesList: {
    padding: 16,
    marginTop: 60,
  },
  messageContainer: {
    maxWidth: '80%',
    marginVertical: 4,
    padding: 12,
    borderRadius: 20,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
    borderTopRightRadius: 4,
  },
  theirMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#2A2A2A',
    borderTopLeftRadius: 4,
  },
  messageText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  timestamp: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  voiceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  voicePlayButton: {
    padding: 4,
  },
  voiceWaveform: {
    flex: 1,
    height: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 15,
    marginHorizontal: 8,
  },
  voiceDuration: {
    color: '#FFFFFF',
    fontSize: 12,
    marginRight: 8,
  },
  attachmentButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    backgroundColor: '#1A1A1A',
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
  },
  attachmentButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
  },
  addButton: {
    padding: 8,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: '#2A2A2A',
    borderRadius: 20,
    marginHorizontal: 8,
    paddingHorizontal: 16,
    maxHeight: 100,
  },
  input: {
    color: '#FFFFFF',
    fontSize: 16,
    paddingVertical: 8,
  },
  emojiButton: {
    padding: 8,
  },
  sendButton: {
    padding: 8,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  callCard: {
    backgroundColor: '#1A1A1A',
    padding: 20,
    borderRadius: 20,
    alignItems: 'center',
    width: '80%',
  },
  callAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 20,
  },
  callName: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  callStatus: {
    color: '#999999',
    fontSize: 16,
    marginBottom: 30,
  },
  callActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 30,
  },
  callButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  answerButton: {
    backgroundColor: '#4CAF50',
  },
  declineButton: {
    backgroundColor: '#FF3B30',
  },
});

export default ChatScreen; 