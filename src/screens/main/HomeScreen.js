import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import Logo from '../../components/Logo1';
import { useNavigation } from '@react-navigation/native';
import { firebase, database,auth} from '../../config/firebase';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

const DUMMY_ROOMS = [
  {
    id: 1,
    name: "Movie Night",
    creator: "John Doe",
    streamUrl: "https://example.com/stream1",
    participants: ["alice@example.com", "bob@example.com"],
    thumbnail: "🎬"
  },
  {
    id: 2,
    name: "Gaming Session",
    creator: "Jane Smith",
    streamUrl: "https://example.com/stream2",
    participants: ["charlie@example.com"],
    thumbnail: "🎮"
  },
  {
    id: 3,
    name: "Music Stream",
    creator: "Mike Johnson",
    streamUrl: "https://example.com/stream3",
    participants: ["david@example.com", "eva@example.com", "frank@example.com"],
    thumbnail: "🎵"
  }
];

const HomeScreen = () => {
  const [rooms, setRooms] = useState(DUMMY_ROOMS);
  const [isCreateRoomModalVisible, setCreateRoomModalVisible] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [inviteEmails, setInviteEmails] = useState([]);
  const [currentEmail, setCurrentEmail] = useState('');
  const [streamUrl, setStreamUrl] = useState('');
  const navigation = useNavigation();
  

  useEffect(() => {
    
  }, []);

  const addEmail = () => {
    if (!currentEmail) return;
    
    if (!currentEmail.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }

    if (inviteEmails.includes(currentEmail)) {
      Alert.alert('Duplicate Email', 'This email has already been added');
      return;
    }

    setInviteEmails([...inviteEmails, currentEmail]);
    setCurrentEmail('');
  };

  const removeEmail = (emailToRemove) => {
    setInviteEmails(inviteEmails.filter(email => email !== emailToRemove));
  };

  const createRoom = () => {
    if (!roomName || !streamUrl) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }
    
    const newRoom = {
      id: Date.now(),
      name: roomName,
      creator: 'Current User',
      streamUrl: streamUrl,
      participants: inviteEmails,
      thumbnail: '🎬'
    };
    
    setRooms([...rooms, newRoom]);
    setCreateRoomModalVisible(false);
    setRoomName('');
    setInviteEmails([]);
    setCurrentEmail('');
    setStreamUrl('');

    database()
      .ref('/users/123677')
      .set({
        name: 'John Doe',
        age: 30,
      })
      .then(() => console.log('Data set.'))
      .catch((error) => console.error('Error setting data:', error));
    
    // Navigate to streaming screen
    navigation.navigate('Streaming', {
      roomName: roomName,
      streamUrl: streamUrl
    });
  };

  const renderRoom = ({ item }) => (
    <TouchableOpacity 
      style={styles.roomContainer}
      onPress={() => navigation.navigate('Streaming', {
        roomName: item.name,
        streamUrl: item.streamUrl
      })}
    >
      <View style={styles.roomThumbnail}>
        <Text style={styles.thumbnailText}>
          {item.thumbnail || '🎬'}
        </Text>
      </View>
      <View style={styles.roomInfo}>
        <Text style={styles.roomName}>{item.name}</Text>
        <Text style={styles.roomCreator}>Created by {item.creator}</Text>
        <View style={styles.participantsContainer}>
          <Text style={styles.roomParticipants}>
            {item.participants.length + 1} participants
          </Text>
        </View>
      </View>
      <Text style={styles.arrowText}>›</Text>
    </TouchableOpacity>
  );

  const renderEmailChip = (email) => (
    <View key={email} style={styles.emailChip}>
      <Text style={styles.emailChipText}>{email}</Text>
      <TouchableOpacity 
        onPress={() => removeEmail(email)}
        style={styles.removeEmailButton}
      >
        <Text style={styles.removeEmailText}>×</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Logo size="small" />
        <TouchableOpacity 
          style={styles.profileButton}
          onPress={() => navigation.navigate('Profile')}
        >
          <MaterialIcons name="person" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.roomsSection}>
        <Text style={styles.sectionTitle}>Active Rooms</Text>
        <FlatList
          data={rooms}
          renderItem={renderRoom}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.roomsListContent}
          showsVerticalScrollIndicator={false}
        />
      </View>

      <TouchableOpacity 
        style={styles.createRoomButton}
        onPress={() => setCreateRoomModalVisible(true)}
      >
        <Text style={styles.createButtonIcon}>+</Text>
      </TouchableOpacity>

      <Modal
        visible={isCreateRoomModalVisible}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.modalContainer}>
          <ScrollView style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create New Room</Text>
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => setCreateRoomModalVisible(false)}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Room Name</Text>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputIcon}>🎬</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter room name"
                  placeholderTextColor="#666666"
                  value={roomName}
                  onChangeText={setRoomName}
                />
              </View>
            </View>
            
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Invite Users</Text>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputIcon}>👥</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter email address"
                  placeholderTextColor="#666666"
                  value={currentEmail}
                  onChangeText={setCurrentEmail}
                  keyboardType="email-address"
                  onSubmitEditing={addEmail}
                />
                <TouchableOpacity 
                  style={styles.addButton}
                  onPress={addEmail}
                >
                  <Text style={styles.addButtonText}>Add</Text>
                </TouchableOpacity>
              </View>
              
              {inviteEmails.length > 0 && (
                <View style={styles.emailChipsContainer}>
                  {inviteEmails.map(renderEmailChip)}
                </View>
              )}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Stream URL</Text>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputIcon}>🔗</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter streaming URL"
                  placeholderTextColor="#666666"
                  value={streamUrl}
                  onChangeText={setStreamUrl}
                />
              </View>
            </View>

            <TouchableOpacity 
              style={styles.createButton}
              onPress={createRoom}
            >
              <Text style={styles.createButtonText}>Create Room</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingRight: 24,
  },
  createRoomButton: {
    position: 'absolute',
    bottom: 54,
    right: 24,
    backgroundColor: '#007AFF',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  roomsSection: {
    flex: 1,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  roomsListContent: {
    paddingVertical: 8,
  },
  roomContainer: {
    backgroundColor: '#1E1E1E',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333333',
  },
  roomThumbnail: {
    width: 48,
    height: 48,
    backgroundColor: '#007AFF',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  roomInfo: {
    flex: 1,
  },
  roomName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  roomCreator: {
    color: '#888888',
    fontSize: 14,
    marginBottom: 4,
  },
  participantsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roomParticipants: {
    color: '#666666',
    fontSize: 13,
    marginLeft: 4,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  modalContent: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingTop: 32,
    borderWidth: 1,
    borderColor: '#333333',
    borderBottomWidth: 0,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  closeButton: {
    padding: 8,
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '300',
    marginTop: -2,
  },
  inputContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333333',
    paddingHorizontal: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
    fontSize: 20,
  },
  textInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    height: '100%',
  },
  createButton: {
    backgroundColor: '#007AFF',
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    height: 56,
    justifyContent: 'center',
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  logoText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  createButtonIcon: {
    fontSize: 28,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  thumbnailText: {
    color: '#FFFFFF',
    fontSize: 24,
  },
  arrowText: {
    color: '#666666',
    fontSize: 24,
    fontWeight: '300',
  },
  emailChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 8,
  },
  emailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
  },
  emailChipText: {
    color: '#FFFFFF',
    fontSize: 14,
    marginRight: 6,
  },
  removeEmailButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeEmailText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  addButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginLeft: 8,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  profileButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
});

export default HomeScreen; 