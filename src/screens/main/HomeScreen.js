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
  StatusBar,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import Logo from '../../components/Logo1';
import { useNavigation } from '@react-navigation/native';
import { firebase, database,auth} from '../../config/firebase';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Animated, { 
  withSpring, 
  useAnimatedStyle, 
  useSharedValue, 
  withRepeat 
} from 'react-native-reanimated';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { getDatabase, ref, set, onValue, get, query, orderByChild, equalTo } from 'firebase/database';
import CreateRoomModal from '../../components/CreateRoomModal';
import WaitingScreen from './WaitingScreen';

const HomeScreen = () => {
  const [rooms, setRooms] = useState([]);
  const [isCreateRoomModalVisible, setCreateRoomModalVisible] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [inviteEmails, setInviteEmails] = useState([]);
  const [currentEmail, setCurrentEmail] = useState('');
  const [streamUrl, setStreamUrl] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('🎬');
  const [filterType, setFilterType] = useState('all'); // 'all', 'created', 'invited'
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest'); // 'newest', 'oldest', 'alphabetical'
  const navigation = useNavigation();
  
  // Animation setup
  const emptyStateScale = useSharedValue(1);

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

  useEffect(() => {
    // Start the pulsing animation
    emptyStateScale.value = withRepeat(
      withSpring(1.1, { duration: 1000 }), 
      -1, 
      true
    );
  }, []);

  useEffect(() => {
    const db = getDatabase();
    const roomsRef = ref(db, 'rooms');
    const currentUser = auth.currentUser;
    
    if (!currentUser) return;

    const unsubscribe = onValue(roomsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const roomsArray = Object.values(data).filter(room => {
          const isCreator = room.creator.email === currentUser.email;
          const isParticipant = room.participants?.includes(currentUser.email);
          return isCreator || isParticipant;
        });
        
        // Ensure all rooms have a createdAt value
        const roomsWithDates = roomsArray.map(room => ({
          ...room,
          createdAt: room.createdAt || new Date().toISOString()
        }));
        
        setRooms(roomsWithDates);
      } else {
        setRooms([]);
      }
    });

    return () => unsubscribe();
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: emptyStateScale.value }],
    };
  });

  const renderEmptyState = () => (
    <View style={styles.emptyStateContainer}>
      <Animated.View style={[styles.emptyStateIconContainer, animatedStyle]}>
        <Text style={styles.emptyStateIcon}>🎬</Text>
      </Animated.View>
      <Text style={styles.emptyStateTitle}>No Rooms Yet</Text>
      <Text style={styles.emptyStateDescription}>
        Create your first room or wait for an invitation to join one!
      </Text>
    </View>
  );

  const checkUserExists = async (email) => {
    try {
      console.log("NEW USERERR", email);
      
      const db = getDatabase();
      const usersRef = ref(db, 'users');
      console.log("USERSREF", usersRef);
      const userQuery = query(usersRef, orderByChild('email'), equalTo(email));
      
      const snapshot = await get(userQuery);
      console.log("SNAPSHOT", snapshot);
      return snapshot.exists();
    } catch (error) {
      console.error('Error checking user:', error);
      return false;
    }
  };

  const addEmail = async () => {
    if (!currentEmail) return;
    
    // Basic email validation
    if (!currentEmail.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }

    // Check for duplicate email
    if (inviteEmails.includes(currentEmail)) {
      Alert.alert('Duplicate Email', 'This email has already been added');
      return;
    }

    // Check if email is the current user's email
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
          [
            {
              text: 'OK',
              onPress: () => setCurrentEmail('')
            }
          ]
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
      // Verify all invited users exist
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

      // Generate a unique room ID
      const roomId = `room_${Date.now()}`;
      const newRoomRef = ref(db, `rooms/${roomId}`);
      
      const newRoom = {
        roomId: roomId,
        name: roomName,
        creator: {
          uid: user.uid,
          email: user.email
        },
        streamUrl: streamUrl,
        participants: [...inviteEmails],
        thumbnail: selectedIcon,
        createdAt: new Date().toISOString(),
        status: 'active'
      };
      
      await set(newRoomRef, newRoom);
      
      // Reset form and close modal
      setCreateRoomModalVisible(false);
      setRoomName('');
      setInviteEmails([]);
      setCurrentEmail('');
      setStreamUrl('');
      setSelectedIcon('🎬');
      
      navigation.navigate('WaitingScreen', {
        roomId: roomId,
        roomName: roomName,
      });

    } catch (error) {
      console.error('Error creating room:', error);
      Alert.alert('Error', 'Failed to create room. Please try again.');
    }
  };

  const renderRoom = ({ item, onDelete }) => {
    const renderRightActions = () => (
      <TouchableOpacity
        style={{
          backgroundColor: 'red',
          padding: 16,
          borderRadius: 16,
          marginBottom: 16,
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: 'red',
          marginLeft: 10,
        }}
        onPress={() => onDelete(item.roomId)}>
             <Text style={styles.deleteText}>Delete</Text>
      </TouchableOpacity>
    );
    
  
    return (
      <Swipeable renderRightActions={renderRightActions}>
        <TouchableOpacity
          style={styles.roomContainer}
          onPress={() =>
            // navigation.navigate('Streaming', {
            //   roomId: item.roomId,
            //   roomName: item.name,
            //   streamUrl: item.streamUrl,
            // })
            navigation.navigate('WaitingScreen', {
              roomId: item.roomId,
              roomName: item.name,
              streamUrl: item.streamUrl,
            })
          }
        >
          <View style={styles.roomThumbnail}>
            <Text style={styles.thumbnailText}>{item.thumbnail || '🎬'}</Text>
          </View>
          <View style={styles.roomInfo}>
            <Text style={styles.roomName}>{item.name}</Text>
            <Text style={styles.roomCreator}>Created by {item.creator.email}</Text>
            <View style={styles.participantsContainer}>
              <Text style={styles.roomParticipants}>
                {(item.participants?.length || 0) + 1} participants
              </Text>
            </View>
          </View>
          <Text style={styles.arrowText}>›</Text>
        </TouchableOpacity>
      </Swipeable>
    );
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

  const renderIconSelector = () => (
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
  );

  // Update getFilteredRooms to include search and sorting
  const getFilteredRooms = () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return [];

    // First filter by type (all, created, invited)
    let filteredRooms = [...rooms];
    if (filterType === 'created') {
      filteredRooms = rooms.filter(room => room.creator.email === currentUser.email);
    } else if (filterType === 'invited') {
      filteredRooms = rooms.filter(room => 
        room.creator.email !== currentUser.email && 
        room.participants?.includes(currentUser.email)
      );
    }

    // Then apply search filter if there's a search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filteredRooms = filteredRooms.filter(room => 
        room.name.toLowerCase().includes(query) ||
        room.creator.email.toLowerCase().includes(query)
      );
    }

    // Finally, sort the results
    return filteredRooms.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.createdAt) - new Date(a.createdAt);
        case 'oldest':
          return new Date(a.createdAt) - new Date(b.createdAt);
        case 'alphabetical':
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });
  };

  // Update the filter buttons with a more modern design
  const renderFilterButtons = () => (
    <View style={styles.filterSection}>
      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={20} color="#666666" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search rooms..."
          placeholderTextColor="#666666"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>
      
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.filterScrollView}
      >
        <View style={styles.filterContainer}>
          <TouchableOpacity 
            style={[styles.filterButton, filterType === 'all' && styles.filterButtonActive]}
            onPress={() => setFilterType('all')}
          >
            <MaterialIcons 
              name="dashboard" 
              size={18} 
              color={filterType === 'all' ? '#FFFFFF' : '#888888'} 
            />
            <Text style={[styles.filterButtonText, filterType === 'all' && styles.filterButtonTextActive]}>
              All Rooms
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.filterButton, filterType === 'created' && styles.filterButtonActive]}
            onPress={() => setFilterType('created')}
          >
            <MaterialIcons 
              name="add-circle" 
              size={18} 
              color={filterType === 'created' ? '#FFFFFF' : '#888888'} 
            />
            <Text style={[styles.filterButtonText, filterType === 'created' && styles.filterButtonTextActive]}>
              Created
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.filterButton, filterType === 'invited' && styles.filterButtonActive]}
            onPress={() => setFilterType('invited')}
          >
            <MaterialIcons 
              name="people" 
              size={18} 
              color={filterType === 'invited' ? '#FFFFFF' : '#888888'} 
            />
            <Text style={[styles.filterButtonText, filterType === 'invited' && styles.filterButtonTextActive]}>
              Invited
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.sortContainer}>
        <TouchableOpacity
          style={styles.sortButton}
          onPress={() => {
            // Toggle between sort options
            const nextSort = {
              'newest': 'oldest',
              'oldest': 'alphabetical',
              'alphabetical': 'newest'
            }[sortBy];
            setSortBy(nextSort);
          }}
        >
          <MaterialIcons name="sort" size={20} color="#FFFFFF" />
          <Text style={styles.sortButtonText}>
            {sortBy.charAt(0).toUpperCase() + sortBy.slice(1)}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const handleDelete = (roomId) => {
    setRooms((prevRooms) => prevRooms.filter((room) => room.roomId !== roomId));
  };
  
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
    backgroundColor="#121212"
    barStyle="light-content"
  />
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
        {rooms.length > 0 && renderFilterButtons()}
        
        {getFilteredRooms().length > 0 ? (
          <FlatList
            data={getFilteredRooms()}
            renderItem={({ item }) => renderRoom({ item, onDelete: handleDelete })}
            keyExtractor={(item) => item.roomId}
            contentContainerStyle={styles.roomsListContent}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <View style={styles.emptySearchContainer}>
            <Text style={styles.emptySearchText}>
              {searchQuery 
                ? renderEmptyState()
                : renderEmptyState()}
            </Text>
          </View>
        )}
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
          <KeyboardAvoidingView 
            style={styles.modalContent} 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView 
              contentContainerStyle={{
                flexGrow:1,
                paddingBottom: 20
              }} 
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
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
              
              {renderIconSelector()}
              
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

              <TouchableOpacity 
                style={styles.createButton}
                onPress={createRoom}
              >
                <Text style={styles.createButtonText}>Create Room</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
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
    elevation: 0,
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
    elevation: 0,
    height: 56,
    justifyContent: 'center',
    marginBottom:30
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
    shadowRadius: 1,
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
    borderColor: '#333333',
  },
  emptyStateIcon: {
    fontSize: 32,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyStateDescription: {
    fontSize: 16,
    color: '#888888',
    textAlign: 'center',
    lineHeight: 24,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
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
    padding: 8,
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
  filterSection: {
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
    height: 44,
    borderWidth: 1,
    borderColor: '#333333',
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    marginLeft: 8,
    fontSize: 15,
  },
  filterScrollView: {
    marginBottom: 12,
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#333333',
    gap: 6,
  },
  filterButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  filterButtonText: {
    color: '#888888',
    fontSize: 14,
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
  },
  sortContainer: {
    borderTopWidth: 1,
    borderTopColor: '#333333',
    paddingTop: 12,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sortButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  emptySearchContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptySearchText: {
    color: '#888888',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  deleteButton: {
    backgroundColor: 'red',
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    height: '100%',
  },
  deleteText: {
    color: 'white',
    fontWeight: 'bold',
  },
});

export default HomeScreen; 