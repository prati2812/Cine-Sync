import React, { useState, useRef } from 'react';
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
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from '@react-native-community/blur';

const ChatScreen = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('');
  const [showAttachments, setShowAttachments] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  
  // Dummy messages data
  const messages = [
    { id: '1', text: 'Hey, how are you?', sender: 'them', timestamp: '10:30 AM' },
    { id: '2', text: 'I\'m good! Just working on some new features. How about you?', sender: 'me', timestamp: '10:31 AM' },
    { id: '3', type: 'voice', duration: '0:30', sender: 'them', timestamp: '10:32 AM' },
    { id: '4', text: 'Oh nice! Let me know if you need any help getting started!', sender: 'me', timestamp: '10:33 AM' },
    { id: '5', text: 'Thanks! I appreciate that.', sender: 'them', timestamp: '10:34 AM' },
    { id: '6', text: 'By the way, have you checked out the latest updates?', sender: 'me', timestamp: '10:35 AM' },
    { id: '7', text: 'Not yet. Are they live now?', sender: 'them', timestamp: '10:36 AM' },
    { id: '8', text: 'Yes, they went live this morning!', sender: 'me', timestamp: '10:37 AM' },
    { id: '9', text: 'Awesome! I will check them out soon.', sender: 'them', timestamp: '10:38 AM' },
    { id: '10', type: 'image', url: 'https://example.com/image1.jpg', sender: 'me', timestamp: '10:39 AM' },
    { id: '11', text: 'That looks great!', sender: 'them', timestamp: '10:40 AM' },
    { id: '12', text: 'Glad you like it!', sender: 'me', timestamp: '10:41 AM' },
    { id: '13', type: 'voice', duration: '1:15', sender: 'them', timestamp: '10:42 AM' },
    { id: '14', text: 'Got your voice note. Will listen to it shortly.', sender: 'me', timestamp: '10:43 AM' },
    { id: '15', text: 'No rush! Take your time.', sender: 'them', timestamp: '10:44 AM' },
    { id: '16', text: 'Thanks! How has your day been so far?', sender: 'me', timestamp: '10:45 AM' },
    { id: '17', text: 'Pretty good, just busy with some work.', sender: 'them', timestamp: '10:46 AM' },
    { id: '18', text: 'Same here. Lots of things to do.', sender: 'me', timestamp: '10:47 AM' },
    { id: '19', type: 'image', url: 'https://example.com/image2.jpg', sender: 'them', timestamp: '10:48 AM' },
    { id: '20', text: 'Wow! Where did you take this photo?', sender: 'me', timestamp: '10:49 AM' },
    { id: '21', text: 'Just outside my house. The sky looked amazing.', sender: 'them', timestamp: '10:50 AM' },
    { id: '22', text: 'It really does! Beautiful shot.', sender: 'me', timestamp: '10:51 AM' },
    { id: '23', type: 'video', url: 'https://example.com/video1.mp4', sender: 'them', timestamp: '10:52 AM' },
    { id: '24', text: 'Nice video! What is it about?', sender: 'me', timestamp: '10:53 AM' },
    { id: '25', text: 'Just a small clip from my recent trip.', sender: 'them', timestamp: '10:54 AM' },
    { id: '26', text: 'That looks like a great place to visit!', sender: 'me', timestamp: '10:55 AM' },
    { id: '27', text: 'You should definitely go there sometime.', sender: 'them', timestamp: '10:56 AM' },
    { id: '28', text: 'I will add it to my list!', sender: 'me', timestamp: '10:57 AM' },
    { id: '29', type: 'voice', duration: '0:45', sender: 'them', timestamp: '10:58 AM' },
    { id: '30', text: 'Heard your voice note. Sounds good!', sender: 'me', timestamp: '10:59 AM' },
    { id: '31', text: 'Great! Let me know if you have any questions.', sender: 'them', timestamp: '11:00 AM' },
    { id: '32', text: 'Will do! Thanks!', sender: 'me', timestamp: '11:01 AM' },
    { id: '33', text: 'Are you free for a quick call later?', sender: 'them', timestamp: '11:02 AM' },
    { id: '34', text: 'Sure! What time works for you?', sender: 'me', timestamp: '11:03 AM' },
    { id: '35', text: 'Maybe around 2 PM?', sender: 'them', timestamp: '11:04 AM' },
    { id: '36', text: 'Sounds good. See you then!', sender: 'me', timestamp: '11:05 AM' },
    { id: '37', text: 'Hey, do you have the latest report?', sender: 'them', timestamp: '11:06 AM' },
    { id: '38', text: 'Yes! Sending it now.', sender: 'me', timestamp: '11:07 AM' },
    { id: '39', type: 'document', url: 'https://example.com/report.pdf', sender: 'me', timestamp: '11:08 AM' },
    { id: '40', text: 'Got it! Thanks!', sender: 'them', timestamp: '11:09 AM' },
    { id: '41', text: 'No problem!', sender: 'me', timestamp: '11:10 AM' },
    { id: '42', text: 'What do you think about the latest update?', sender: 'them', timestamp: '11:11 AM' },
    { id: '43', text: 'It looks great! Really improved the UX.', sender: 'me', timestamp: '11:12 AM' },
    { id: '44', text: 'Glad to hear that!', sender: 'them', timestamp: '11:13 AM' },
    { id: '45', text: 'Keep up the great work!', sender: 'me', timestamp: '11:14 AM' }
  ];
  

  const renderMessage = ({ item }) => {
    const isMyMessage = item.sender === 'me';

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
          <Text style={styles.timestamp}>{item.timestamp}</Text>
        </View>
      );
    }

    return (
      <View style={[
        styles.messageContainer,
        isMyMessage ? styles.myMessage : styles.theirMessage
      ]}>
        <Text style={styles.messageText}>{item.text}</Text>
        <Text style={styles.timestamp}>{item.timestamp}</Text>
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

          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.headerButton}>
              <MaterialIcons name="videocam" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerButton}>
              <MaterialIcons name="call" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerButton}>
              <MaterialIcons name="more-horiz" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
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

          <TouchableOpacity style={styles.micButton}>
            <MaterialIcons name="mic" size={24} color="#666666" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  micButton: {
    padding: 8,
  }
});

export default ChatScreen; 