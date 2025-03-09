import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert
} from 'react-native';
import { getDatabase, ref, set, get, query, orderByChild, equalTo } from 'firebase/database';
import { auth } from '../../config/firebase';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

const CreateRoomScreen = ({ navigation, route }) => {
  const editingRoom = route.params?.room;
  const isEditing = !!editingRoom;

  const [roomName, setRoomName] = useState(editingRoom?.name || '');
  const [inviteEmails, setInviteEmails] = useState(editingRoom?.participants || []);
  const [currentEmail, setCurrentEmail] = useState('');
  const [streamUrl, setStreamUrl] = useState(editingRoom?.streamUrl || '');
  const [selectedIcon, setSelectedIcon] = useState(editingRoom?.thumbnail || '🎬');

  const ROOM_ICONS = [
    { icon: '🎬', label: 'Movie' },
    { icon: '🎮', label: 'Gaming' },
    { icon: '🎵', label: 'Music' },
    { icon: '📺', label: 'TV Show' },
    { icon: '🎨', label: 'Art' },
    { icon: '📚', label: 'Study' },
    { icon: '💬', label: 'Chat' },
    { icon: '🎪', label: 'Event' },
  ];

  const checkUserExists = async (email) => {
    try {
      const db = getDatabase();
      const usersRef = ref(db, 'users');
      const userQuery = query(usersRef, orderByChild('email'), equalTo(email));
      const snapshot = await get(userQuery);
      return snapshot.exists();
    } catch (error) {
      console.error('Error checking user:', error);
      return false;
    }
  };

  const addEmail = async () => {
    if (!currentEmail) return;
    
    if (!currentEmail.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }

    if (inviteEmails.includes(currentEmail)) {
      Alert.alert('Duplicate Email', 'This email has already been added');
      return;
    }

    if (currentEmail === auth.currentUser?.email) {
      Alert.alert('Invalid Invitation', 'You cannot invite yourself');
      return;
    }

    try {
      const userExists = await checkUserExists(currentEmail);
      
      if (userExists) {
        setInviteEmails([...inviteEmails, currentEmail]);
        setCurrentEmail('');
      } else {
        Alert.alert(
          'User Not Found',
          'This user is not registered in the app. Only registered users can be invited.',
          [{ text: 'OK', onPress: () => setCurrentEmail('') }]
        );
      }
    } catch (error) {
      console.error('Error adding email:', error);
      Alert.alert('Error', 'Failed to verify user. Please try again.');
    }
  };

  const removeEmail = (emailToRemove) => {
    setInviteEmails(inviteEmails.filter(email => email !== emailToRemove));
  };

  const createRoom = async () => {
    if (!roomName || !streamUrl) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }
    
    const db = getDatabase();
    const user = auth.currentUser;
    
    if (!user) {
      Alert.alert('Error', 'You must be logged in to create a room');
      return;
    }

    try {
      const invalidEmails = [];
      for (const email of inviteEmails) {
        const exists = await checkUserExists(email);
        if (!exists) {
          invalidEmails.push(email);
        }
      }

      if (invalidEmails.length > 0) {
        Alert.alert(
          'Invalid Participants',
          `Some invited users are no longer registered: ${invalidEmails.join(', ')}. Please remove them and try again.`
        );
        return;
      }

      const roomId = isEditing ? editingRoom.roomId : `room_${Date.now()}`;
      const roomRef = ref(db, `rooms/${roomId}`);
      
      const roomData = {
        roomId: roomId,
        name: roomName,
        creator: isEditing ? editingRoom.creator : {
          uid: user.uid,
          email: user.email
        },
        streamUrl: streamUrl,
        participants: [...inviteEmails],
        thumbnail: selectedIcon,
        createdAt: isEditing ? editingRoom.createdAt : new Date().toISOString(),
        status: 'active'
      };
      
      await set(roomRef, roomData);
      
      navigation.replace('WaitingScreen', {
        roomId: roomId,
        roomName: roomName,
      });

    } catch (error) {
      console.error('Error saving room:', error);
      Alert.alert('Error', `Failed to ${isEditing ? 'update' : 'create'} room. Please try again.`);
    }
  };

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
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.closeButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isEditing ? 'Edit Room' : 'Create New Room'}
        </Text>
        <View style={{ width: 40 }}></View>
      </View>

      <ScrollView 
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
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
          <Text style={styles.label}>Room Icon</Text>
          <View style={styles.iconGrid}>
            {ROOM_ICONS.map((item) => (
              <TouchableOpacity
                key={item.icon}
                style={[
                  styles.iconOption,
                  selectedIcon === item.icon && styles.iconOptionSelected
                ]}
                onPress={() => setSelectedIcon(item.icon)}
              >
                <Text style={styles.iconOptionEmoji}>{item.icon}</Text>
                <Text style={styles.iconOptionLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
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
              autoCapitalize="none"
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
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={styles.createButton}
          onPress={createRoom}
        >
          <Text style={styles.createButtonText}>
            {isEditing ? 'Save Changes' : 'Create Room'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 24,
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
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  iconOption: {
    width: '22%',
    aspectRatio: 1,
    backgroundColor: '#2A2A2A',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333333',
  },
  iconOptionSelected: {
    backgroundColor: '#1A1A1A',
    borderColor: '#007AFF',
    borderWidth: 2,
  },
  iconOptionEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  iconOptionLabel: {
    color: '#888888',
    fontSize: 10,
    textAlign: 'center',
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
  footer: {
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    borderTopWidth: 1,
    borderTopColor: '#333333',
  },
  createButton: {
    backgroundColor: '#007AFF',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default CreateRoomScreen; 