import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
  TouchableOpacity,
  FlatList,
  StatusBar,
  Alert,
  ActivityIndicator
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Logo from '../../components/Logo1';
import { getDatabase, ref,set,remove, get, query, orderByChild, equalTo, onValue, off } from 'firebase/database';
import { auth } from '../../config/firebase';

const FriendsScreen = ({ navigation }) => {
  const [searchEmail, setSearchEmail] = useState('');
  const [activeTab, setActiveTab] = useState('friends');
  const [isLoading, setIsLoading] = useState(false);
  const [friendRequests, setFriendRequests] = useState([]);
  const [friendsList, setFriendsList] = useState([]);


  useEffect(() => {
    getFriendRequests();
    const unsubscribe = getFriends();
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);


  const renderFriendRequest = ({ item }) => (
    
    <View style={styles.requestCard}>
      <View style={styles.requestInfo}>
        <View style={[styles.avatarContainer, { backgroundColor: generateAvatarColor(item.email) }]}>
          <Text style={styles.avatarText}>
            {item?.username[0].toUpperCase()}
          </Text>
        </View>
        <View style={styles.requestTextContainer}>
          <Text style={styles.requestEmail}>{item?.username}</Text>
        </View>
      </View>
      <View style={styles.requestActions}>
        <TouchableOpacity 
          style={styles.acceptButton}
          onPress={() => {
             acceptFriendRequest(item?.userId);
          }}
        >
          <MaterialIcons name="check" size={20} color="#FFFFFF" />
          <Text style={styles.acceptButtonText}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity 
           style={styles.declineButton}
           onPress={() => {
            declineFriendRequest(item?.userId);
           }}
           >
          <MaterialIcons name="close" size={20} color="#FF3B30" />
          <Text style={styles.declineButtonText}>Decline</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderFriend = ({ item }) => (
    console.log("item", item),
    
    <View style={styles.friendCard}>
      <View style={styles.friendInfo}>
        <View style={[styles.avatarContainer, { backgroundColor: generateAvatarColor(item?.username || '') }]}>
          <Text style={styles.avatarText}>
            {(item?.username || '')[0]?.toUpperCase() || '?'}
          </Text>
        </View>
        <View>
          <Text style={styles.friendEmail}>{item?.username || 'Unknown'}</Text>
          <View style={styles.statusContainer}>
            <View style={[styles.statusDot, 
              { backgroundColor: item?.status?.state === 'online' ? '#4CAF50' : '#666666' }
            ]} />
            <Text style={styles.statusText}>{item?.status?.state}</Text>
          </View>
        </View>
      </View>
      <TouchableOpacity 
        style={styles.messageButton}
        onPress={() => navigation.navigate('Chat', { username: item?.username || 'New Chat' })}
      >
        <MaterialIcons name="chat" size={20} color="#007AFF" />
      </TouchableOpacity>
    </View>
  );

  const generateAvatarColor = (email) => {
    const colors = ['#007AFF', '#FF2D55', '#5856D6', '#34C759', '#FF9500'];
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
      hash = email.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const getFriendRequests = async () => {
    const db = getDatabase();
    const user = await auth.currentUser;
    const friendRequestsRef = ref(db, `friend_requests/${user?.uid}`);
    const unsubscribe = onValue(friendRequestsRef, async (snapshot) => {
      const friendRequests = snapshot.val();
      if (!friendRequests) {
        setFriendRequests([]);
        return;
      }
      console.log("friendRequests", friendRequests);

      let userDetails = [];
      for(let request in friendRequests){
        let friendUserRequestId = request;
        let friendUserDetails = await getUserFriendDetails(friendUserRequestId);
        userDetails.push(friendUserDetails);
      }
      console.log("Friend Details", userDetails);
      
      setFriendRequests(userDetails);
    });
    
    return () => unsubscribe();
  }

  const getFriends = () => {
    const db = getDatabase();
    const user = auth.currentUser;
    
    if (!user) return null;
    
    const friendsRef = ref(db, `friends/${user.uid}`);
    
    const unsubscribe = onValue(friendsRef, (snapshot) => {
      const friends = snapshot.val();
      if (!friends) {
        setFriendsList([]);
        return;
      }
      
      // Create listeners for each friend's details
      Object.keys(friends).forEach(friendId => {
        const userRef = ref(db, `users/${friendId}`);
        onValue(userRef, (userSnapshot) => {
          const friendDetails = userSnapshot.val();
          if (friendDetails) {
            setFriendsList(currentList => {
              const newList = currentList.filter(f => f.userId !== friendId);
              return [...newList, friendDetails];
            });
          }
        });
      });
    });
    
    return () => {
      const db = getDatabase();
      if (user) {
        const friendsRef = ref(db, `friends/${user.uid}`);
        off(friendsRef);
        
        // Clean up individual user listeners if there are any friends
        const currentFriends = friendsList;
        currentFriends.forEach(friend => {
          const userRef = ref(db, `users/${friend.userId}`);
          off(userRef);
        });
      }
    };
  };

  const acceptFriendRequest = async (userId) => {
    try {
      const db = getDatabase();
      const user = await auth.currentUser;
  
      if (!user) {
        throw new Error('No authenticated user');
      }
  
      const friendRequestRef = ref(db, `friend_requests/${user.uid}/${userId}`);
      const unsubscribe = onValue(friendRequestRef, async (snapshot) => {
        const friendRequest = snapshot.val();
        if (friendRequest) {
          await remove(friendRequestRef);

          const friendRef1 = ref(db, `friends/${user.uid}/${userId}`);
          const friendRef2 = ref(db, `friends/${userId}/${user.uid}`);
          
          await set(friendRef1, true);  
          await set(friendRef2, true);  
          
          console.log("Friend request accepted and friends updated successfully.");
        }
      });
  
      // const friendRef1 = ref(db, `friends/${user.uid}/${userId}`);
      // const friendRef2 = ref(db, `friends/${userId}/${user.uid}`);
  
      // await set(friendRef1, true);  
      // await set(friendRef2, true);  
  
      // console.log("Friend request accepted and friends updated successfully.");
    } catch (error) {
      console.error("Error accepting friend request:", error.message);
    }
  }

  const declineFriendRequest = async (userId) => {
    const db = getDatabase();
    const user = await auth.currentUser;
    const friendRequestRef = ref(db, `friend_requests/${user.uid}/${userId}`);
    const unsubscribe = onValue(friendRequestRef, async (snapshot) => {
      const friendRequest = snapshot.val();
      if (friendRequest) {
        await remove(friendRequestRef);
        console.log("Friend request declined successfully.");
      }
    });
    return unsubscribe;
  }

  const getUserFriendDetails = async (userId) => {
    const db = getDatabase();
    const userRef = ref(db, `users/${userId}`);
    const snapshot = await get(userRef);
    return snapshot.val();
  }


  const isFriendIsOrNot =  async (userId) => {
    const db = getDatabase();
    const user = await auth.currentUser;
    const userRef = ref(db, `friends/${user.uid}/${userId}`);
    const snapshot = await get(userRef);
    return snapshot.val();
  }

  

  const checkUserExists = async (email) => {
    try{
      setIsLoading(true);
       const db = getDatabase();
       const usersRef = ref(db, 'users');
       const userQuery = query(usersRef, orderByChild('email'), equalTo(email));
       const snapshot = await get(userQuery);
       let newVal = await snapshot.val();
       return Object.values(newVal)[0];  
    }catch(error){
      setIsLoading(false);
      return false;
    }

  }  

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#121212" barStyle="light-content" />
      
      <View style={styles.header}>
        <Logo size="small" />
      </View>

      <View style={styles.content}>
        <View style={styles.searchSection}>
          <View style={styles.searchContainer}>
            <MaterialIcons name="search" size={20} color="#666666" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by email..."
              placeholderTextColor="#666666"
              value={searchEmail}
              onChangeText={async (text) => {
                setSearchEmail(text);
              }}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>
          <TouchableOpacity style={styles.addButton}
            onPress={async () => {
              const tempUser = await auth.currentUser;
              if(tempUser.email !== searchEmail){
                const userExists = await checkUserExists(searchEmail);
                if(userExists && userExists.userId !== null){
                  const isFriend = await isFriendIsOrNot(userExists?.userId);
                  if(isFriend){
                    Alert.alert('User already in friends list');
                    setIsLoading(false);
                    return;
                  }else{
                    const db = getDatabase();
                    const user = await auth.currentUser;
                    console.log("user", user.uid);
                    if(user.uid){
                      const friendRequestRef = ref(db, `friend_requests/${userExists?.userId}/${user?.uid}`);
                      set(friendRequestRef , true);
                      setSearchEmail('');
                      setIsLoading(false);
                    }  
                  }
                }else{
                  Alert.alert('User not found', 'Please enter a valid email address');
                  setIsLoading(false);
                  return;
                }
              }else{
                Alert.alert('You cannot add yourself as a friend');
                setIsLoading(false);
                return;
              }
            }}
          >
            {
              isLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <MaterialIcons name="person-add" size={20} color="#FFFFFF" />
                  <Text style={styles.addButtonText}>Add Friend</Text>
                </>
              )
            }
          </TouchableOpacity>
        </View>

        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'friends' && styles.activeTab]}
            onPress={() => setActiveTab('friends')}
          >
            <Text style={[styles.tabText, activeTab === 'friends' && styles.activeTabText]}>
              Friends ({friendsList.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'requests' && styles.activeTab]}
            onPress={() => setActiveTab('requests')}
          >
            <Text style={[styles.tabText, activeTab === 'requests' && styles.activeTabText]}>
              Requests ({friendRequests.length})
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'friends' ? (
          <FlatList
            data={friendsList}
            renderItem={renderFriend}
            keyExtractor={(item) => item.userId}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.friendsList}
          />
        ) : (
          <FlatList
            data={friendRequests}
            renderItem={renderFriendRequest}
            keyExtractor={(item) => item.userId}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.friendsList}
          />
        )}
      </View>
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
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  searchSection: {
    marginBottom: 24,
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
  addButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  requestCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333333',
  },
  requestInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  requestEmail: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  declineButton: {
    flex: 1,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  declineButtonText: {
    color: '#FF3B30',
    fontWeight: '600',
  },
  friendCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#333333',
  },
  friendInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  friendEmail: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    color: '#888888',
    fontSize: 14,
  },
  messageButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  requestsList: {
    paddingRight: 24,
  },
  friendsList: {
    paddingBottom: 24,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    marginHorizontal: 4,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
  },
  activeTab: {
    backgroundColor: '#007AFF',
  },
  tabText: {
    color: '#888888',
    fontSize: 15,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#FFFFFF',
  },
});

export default FriendsScreen; 