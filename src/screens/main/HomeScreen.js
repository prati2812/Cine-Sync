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
} from 'react-native';
import Logo from '../../components/Logo1';
import { useNavigation } from '@react-navigation/native';
import { auth} from '../../config/firebase';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Animated, { 
  withSpring, 
  useAnimatedStyle, 
  useSharedValue, 
  withRepeat 
} from 'react-native-reanimated';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { getDatabase, ref, set, onValue, get, query, orderByChild, equalTo } from 'firebase/database';
import colors from '../../theme/Colors';

const HomeScreen = () => {
  const [rooms, setRooms] = useState([]);
  const [filterType, setFilterType] = useState('all'); // 'all', 'created', 'invited'
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest'); // 'newest', 'oldest', 'alphabetical'
  const navigation = useNavigation();
  
  // Animation setup
  const emptyStateScale = useSharedValue(1);

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

  const deleteRoom = async (roomId) => {
    try {
      const db = getDatabase();
      const currentUser = auth.currentUser;
      
      // Get the room data first to check permissions
      const roomRef = ref(db, `rooms/${roomId}`);
      const roomSnapshot = await get(roomRef);
      const roomData = roomSnapshot.val();

      // Only allow creator to delete the room
      if (roomData.creator.email !== currentUser.email) {
        Alert.alert('Error', 'Only the room creator can delete this room');
        return;
      }

      // Show confirmation dialog
      Alert.alert(
        'Delete Room',
        'Are you sure you want to delete this room?',
        [
          {
            text: 'Cancel',
            style: 'cancel'
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              await set(roomRef, null);
              Alert.alert('Success', 'Room deleted successfully');
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error deleting room:', error);
      Alert.alert('Error', 'Failed to delete room');
    }
  };

  const renderRoom = ({ item }) => {
    const currentUser = auth.currentUser;
    const isCreator = item.creator.email === currentUser?.email;

    const renderRightActions = () => (
      <TouchableOpacity
        style={[
           {
              backgroundColor: 'red',
              padding: 16,
              borderRadius: 16,
              marginBottom: 16,
              flexDirection: 'row',
              alignItems: 'center',
              borderWidth: 1,
              borderColor: 'red',
              marginLeft: 10
           },
          { display: isCreator ? 'flex' : 'none' }
        ]}
        onPress={() => deleteRoom(item.roomId)}
      >
        <MaterialIcons name="delete" size={24} color={colors.TITLE_COLOR} />
        <Text style={styles.deleteText}>Delete</Text>
      </TouchableOpacity>
    );

    const onRoomPress = () => {
      if (isCreator) {
        Alert.alert(
          'Room Options',
          'What would you like to do?',
          [
            {
              text: 'Join Room',
              onPress: () => {
                console.log("Newww Dataa", item?.participants?.length);
                if(item?.participants?.length === 0 || item?.participants === undefined){
                  navigation.navigate('StreamInfo', {
                    roomId: item.roomId,
                    roomName: item.name,
                    streamUrl: item.streamUrl,
                  });
                 
                }else{
                  navigation.navigate('WaitingScreen', {
                    roomId: item.roomId,
                    roomName: item.name,
                    streamUrl: item.streamUrl,
                  });
                }
              }
            },
            {
              text: 'Edit Room',
              onPress: () => navigation.navigate('CreateRoom', { room: item })
            },
            {
              text: 'Cancel',
              style: 'cancel'
            }
          ]
        );
      } else {
        navigation.navigate('WaitingScreen', {
          roomId: item.roomId,
          roomName: item.name,
          streamUrl: item.streamUrl,
        });
      }
    };

    return (
      <Swipeable renderRightActions={renderRightActions}>
        <TouchableOpacity style={styles.roomContainer} onPress={onRoomPress}>
          <View style={styles.roomThumbnail}>
            <Text style={styles.thumbnailText}>{item.thumbnail || '🎬'}</Text>
          </View>
          <View style={styles.roomInfo}>
            <Text style={styles.roomName}>{item.name}</Text>
            <Text style={styles.roomCreator}>
              Created by {item.creator?.userName}
            </Text>
            {item?.participants?.length > 0 && (
              <View style={styles.participantsContainer}>
                <Text style={styles.roomParticipants}>
                  { item.participants?.length} participants
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.arrowText}>›</Text>
        </TouchableOpacity>
      </Swipeable>
    );
  };

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
              color={filterType === 'all' ? colors.TITLE_COLOR : '#888888'} 
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
              color={filterType === 'created' ? colors.TITLE_COLOR : '#888888'} 
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
              color={filterType === 'invited' ? colors.TITLE_COLOR : '#888888'} 
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
          <MaterialIcons name="sort" size={20} color={colors.TITLE_COLOR} />
          <Text style={styles.sortButtonText}>
            {sortBy.charAt(0).toUpperCase() + sortBy.slice(1)}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
  
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor={colors.STATUSBAR_BG_COLOR} barStyle="light-content" />
      <View style={styles.header}>
        <Logo size="small" />
        <View style={styles.headerButtons}></View>
      </View>

      <View style={styles.roomsSection}>
        {rooms.length > 0 && renderFilterButtons()}

        {getFilteredRooms().length > 0 ? (
          <FlatList
            data={getFilteredRooms()}
            renderItem={({item}) => renderRoom({item})}
            keyExtractor={item => item.roomId}
            contentContainerStyle={styles.roomsListContent}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <View style={styles.emptySearchContainer}>
            <Text style={styles.emptySearchText}>
             {searchQuery ? renderEmptyState() : renderEmptyState()}
            </Text>
          </View>
        )}
      </View>

      {filterType !== 'invited' && (
        <TouchableOpacity
          style={styles.createRoomButton}
          onPress={() => navigation.navigate('CreateRoom')}>
          <Text style={styles.createButtonIcon}>+</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingRight: 24,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.PRIMARY_COLOR_DARK,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.PRIMARY_COLOR_DARK,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  createRoomButton: {
    position: 'absolute',
    bottom: 54,
    right: 24,
    backgroundColor: colors.PRIMARY_COLOR_DARK,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.PRIMARY_COLOR_DARK,
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
    color: colors.TITLE_COLOR,
    marginBottom: 16,
  },
  roomsListContent: {
    paddingVertical: 8,
  },
  roomContainer: {
    backgroundColor: colors.INPUTBOX_BG_COLOR,
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
  },
  roomThumbnail: {
    width: 48,
    height: 48,
    backgroundColor: colors.PRIMARY_COLOR_DARK,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  roomInfo: {
    flex: 1,
  },
  roomName: {
    color: colors.TITLE_COLOR,
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
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  modalContent: {
    backgroundColor: colors.INPUTBOX_BG_COLOR,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingTop: 32,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
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
    color: colors.TITLE_COLOR,
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
    color: colors.TITLE_COLOR,
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
    color: colors.TITLE_COLOR,
    marginBottom: 12,
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
    paddingHorizontal: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
    fontSize: 20,
  },
  textInput: {
    flex: 1,
    color: colors.TITLE_COLOR,
    fontSize: 16,
    height: '100%',
  },
  createButton: {
    backgroundColor: colors.PRIMARY_COLOR_DARK,
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: colors.PRIMARY_COLOR_DARK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 0,
    height: 56,
    justifyContent: 'center',
    marginBottom:30
  },
  createButtonText: {
    color: colors.TITLE_COLOR,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  logoText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.TITLE_COLOR,
  },
  createButtonIcon: {
    fontSize: 28,
    color: colors.TITLE_COLOR,
    fontWeight: 'bold',
  },
  thumbnailText: {
    color: colors.TITLE_COLOR,
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
    backgroundColor: colors.PRIMARY_COLOR_DARK,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
  },
  emailChipText: {
    color: colors.TITLE_COLOR,
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
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: 'bold',
  },
  addButton: {
    backgroundColor: colors.PRIMARY_COLOR_DARK,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginLeft: 8,
  },
  addButtonText: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '600',
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
    borderColor: colors.INPUTBOX_BORDER_COLOR,
    padding: 8,
  },
  iconOptionSelected: {
    backgroundColor: '#1A1A1A',
    borderColor: colors.PRIMARY_COLOR_DARK,
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
    borderColor: colors.INPUTBOX_BORDER_COLOR,
  },
  searchInput: {
    flex: 1,
    color: colors.TITLE_COLOR,
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
    borderColor: colors.INPUTBOX_BORDER_COLOR,
    gap: 6,
  },
  filterButtonActive: {
    backgroundColor: colors.PRIMARY_COLOR_DARK,
    borderColor: colors.PRIMARY_COLOR_DARK,
  },
  filterButtonText: {
    color: '#888888',
    fontSize: 14,
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: colors.TITLE_COLOR,
  },
  sortContainer: {
    borderTopWidth: 1,
    borderTopColor: colors.INPUTBOX_BORDER_COLOR,
    paddingTop: 12,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sortButtonText: {
    color: colors.TITLE_COLOR,
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
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    height: '100%',
    borderRadius: 16,
    marginBottom: 16,
    marginLeft: 10,
    flexDirection: 'column',
  },
  deleteText: {
    color: colors.TITLE_COLOR,
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },
});

export default HomeScreen; 