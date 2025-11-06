import React, { useState, useEffect, useRef } from 'react';
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
  ActivityIndicator,
  Animated,
  Easing
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Logo from '../../components/Logo1';
import { getDatabase, ref,set,remove, get, query, orderByChild, equalTo, onValue, off } from 'firebase/database';
import { auth } from '../../config/firebase';

const EmptyStateAnimation = ({ icon, title, subtitle }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View style={styles.emptyStateContainer}>
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
          alignItems: 'center',
        }}
      >
        <MaterialIcons name={icon} size={64} color="#666666" />
        <Animated.Text style={[styles.emptyStateText, { opacity: fadeAnim }]}>
          {title}
        </Animated.Text>
        <Animated.Text style={[styles.emptyStateSubText, { opacity: fadeAnim }]}>
          {subtitle}
        </Animated.Text>
      </Animated.View>
    </View>
  );
};

const FriendsScreen = ({ navigation }) => {
  const [searchEmail, setSearchEmail] = useState('');
  const [activeTab, setActiveTab] = useState('friends');
  const [isLoading, setIsLoading] = useState(false);
  const [friendRequests, setFriendRequests] = useState([]);
  const [friendsList, setFriendsList] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);


  useEffect(() => {
    getFriendRequests();
    getFriendSentRequests();
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
      <View style={styles.friendActions}>
        <TouchableOpacity 
          style={styles.messageButton}
          onPress={() => navigation.navigate('Chat', { 
            username: item?.username || 'New Chat',
            userId: item?.userId,
            avatar: item?.avatar
          })}
        >
          <MaterialIcons name="chat" size={20} color="#007AFF" />
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.removeFriendButton}
          onPress={() => {
            Alert.alert(
              'Remove Friend',
              'Are you sure you want to remove this friend?',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', 
                  onPress: () => {
                   removeFriend(item?.userId);
                  }
                } 
              ]
            );
          }}
        >
          <MaterialIcons name="person-remove" size={20} color="#FF3B30" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const cancelFriendRequest = async (userId) => {
    const db = getDatabase();
    const user = await auth.currentUser;
    const friendRequestRef = ref(db, `friend_requests/${user?.uid}/${userId}`);
    const userFriendRequestRef = ref(db, `user_friend_requests/${user?.uid}/${userId}`);
    await remove(friendRequestRef);
    await remove(userFriendRequestRef);
    console.log("Friend request cancelled successfully.");
  }

  const renderSentRequest = ({ item }) => (
    <View style={styles.requestCard}>
      <View style={styles.requestInfo}>
        <View style={[styles.avatarContainer, { backgroundColor: generateAvatarColor(item.email) }]}>
          <Text style={styles.avatarText}>
            {item?.username[0].toUpperCase()}
          </Text>
        </View>
        <View style={styles.requestTextContainer}>
          <Text style={styles.requestEmail}>{item?.username}</Text>
          <Text style={styles.pendingText}>Pending</Text>
        </View>
      </View>
      <TouchableOpacity 
        style={styles.cancelRequestButton}
        onPress={() => {
          Alert.alert(
            'Cancel Request',
            'Are you sure you want to cancel this friend request?',
            [
              { text: 'No', style: 'cancel' },
              { text: 'Yes', style: 'destructive', 
                onPress: () => {
                  cancelFriendRequest(item?.userId);
                }
              }
            ]
          );
        }}
      >
        <MaterialIcons name="close" size={20} color="#FF3B30" />
        <Text style={styles.cancelButtonText}>Cancel</Text>
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

  const getFriendSentRequests = async () => {
    const db = getDatabase();
    const user = auth.currentUser;
    const friendSentRequestRef = ref(db, `user_friend_requests/${user?.uid}`);
    const unsubscribe = onValue(friendSentRequestRef, async (snapshot) => {
      const friendSentRequests = snapshot.val();
      if(!friendSentRequests){
        setSentRequests([]);
        return;
      }

      let userDetails = [];
      for(let request in friendSentRequests){
        let friendUserRequestId = request;
        let friendUserDetails = await getUserFriendDetails(friendUserRequestId);
        userDetails.push(friendUserDetails);
      }
      console.log("Friend Details", userDetails);
      setSentRequests(userDetails);
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

          const userFriendSentRequestRef = ref(db, `user_friend_requests/${userId}/${user.uid}`);
          await remove(userFriendSentRequestRef);
          
          console.log("Friend request accepted and friends updated successfully.");
        }
      });
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

  const removeFriend = async (userId) => {
    const db = getDatabase();
    const user = await auth.currentUser;
    const friendRef = ref(db, `friends/${user.uid}/${userId}`);
    const friendRef2 = ref(db, `friends/${userId}/${user.uid}`);
    await remove(friendRef);
    await remove(friendRef2);
    console.log("Friend removed successfully.");
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
                      const userFriendRequestRef = ref(db, `user_friend_requests/${user?.uid}/${userExists?.userId}`);
                      set(friendRequestRef , true);
                      set(userFriendRequestRef, true);
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
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'sent' && styles.activeTab]}
            onPress={() => setActiveTab('sent')}
          >
            <Text style={[styles.tabText, activeTab === 'sent' && styles.activeTabText]}>
              Sent ({sentRequests.length})
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'friends' ? (
          friendsList.length > 0 ? (
            <FlatList
              data={friendsList}
              renderItem={renderFriend}
              keyExtractor={(item) => item.userId}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.friendsList}
            />
          ) : (
            <EmptyStateAnimation
              icon="people"
              title="No friends yet"
              subtitle="Search for friends using their email to connect"
            />
          )
        ) : activeTab === 'requests' ? (
          friendRequests.length > 0 ? (
            <FlatList
              data={friendRequests}
              renderItem={renderFriendRequest}
              keyExtractor={(item) => item.userId}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.friendsList}
            />
          ) : (
            <EmptyStateAnimation
              icon="person-add"
              title="No friend requests"
              subtitle="When someone adds you, they'll appear here"
            />
          )
        ) : (
          sentRequests.length > 0 ? (
            <FlatList
              data={sentRequests}
              renderItem={renderSentRequest}
              keyExtractor={(item) => item.userId}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.friendsList}
            />
          ) : (
            <EmptyStateAnimation
              icon="send"
              title="No sent requests"
              subtitle="Friend requests you've sent will appear here"
            />
          )
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  searchSection: {
    marginVertical: 20,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 16,
    height: 50,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    marginLeft: 12,
    fontSize: 16,
    fontWeight: '400',
  },
  addButton: {
    backgroundColor: '#2563EB',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 4,
    borderRadius: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    marginHorizontal: 4,
    borderRadius: 12,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: '#2563EB',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  tabText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#FFFFFF',
  },
  requestCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  requestInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  requestEmail: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  requestActions: {
    flexDirection: 'row',
    gap: 12,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  declineButton: {
    flex: 1,
    backgroundColor: 'rgba(255,59,48,0.1)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.3)',
  },
  declineButtonText: {
    color: '#FF3B30',
    fontWeight: '600',
  },
  friendCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  friendInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  friendEmail: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 6,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '500',
  },
  friendActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  messageButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(37,99,235,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.3)',
  },
  removeFriendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,59,48,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.3)',
  },
  pendingText: {
    color: '#F59E0B',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 4,
  },
  cancelRequestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,59,48,0.1)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.3)',
  },
  cancelButtonText: {
    color: '#FF3B30',
    fontWeight: '600',
    fontSize: 15,
  },
  friendsList: {
    paddingBottom: 24,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyStateText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 24,
    textAlign: 'center',
  },
  emptyStateSubText: {
    color: '#666666',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
  },
});

export default FriendsScreen; 