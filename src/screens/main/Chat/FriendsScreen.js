import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  StatusBar,
  Alert,
  ActivityIndicator,
  Animated,
  Easing,
  ScrollView,
  Image,
  ImageBackground,
  Dimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import colors from '../../../theme/Colors';
import { auth, database } from '../../../config/firebase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ──────────────────────────────────────────────────────────────
//  Pulsing Online Ring
// ──────────────────────────────────────────────────────────────
const PulsingRing = () => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseAnim, {
            toValue: 1.5,
            duration: 1200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0,
            duration: 1200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.6,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  return (
    <Animated.View
      style={[
        styles.pulsingRing,
        {
          opacity: opacityAnim,
          transform: [{ scale: pulseAnim }],
        },
      ]}
    />
  );
};

// ──────────────────────────────────────────────────────────────
//  Friends Screen
// ──────────────────────────────────────────────────────────────
const FriendsScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [searchEmail, setSearchEmail] = useState('');
  const [activeTab, setActiveTab] = useState('friends'); // 'friends', 'requests', 'sent'
  const [isLoading, setIsLoading] = useState(false);
  const [friendRequests, setFriendRequests] = useState([]);
  const [friendsList, setFriendsList] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeRooms, setActiveRooms] = useState([]);

  // Dynamic safe area top inset for Android & iOS notch protection
  const safeTopPadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 12
  ) + 8;

  useEffect(() => {
    getFriendRequests();
    getFriendSentRequests();
    const unsubscribe = getFriends();

    // Listen to live rooms from Firebase RTDB
    const roomsRef = database().ref('rooms');
    const onRoomsChange = snapshot => {
      const val = snapshot.val();
      if (val) {
        const list = Object.values(val).filter(r => r && r.name);
        setActiveRooms(list);
      } else {
        setActiveRooms([]);
      }
    };
    roomsRef.on('value', onRoomsChange);

    return () => {
      if (unsubscribe) unsubscribe();
      roomsRef.off('value', onRoomsChange);
    };
  }, []);

  // ── Avatar color generator ────────────────────────────────
  const generateAvatarColor = (str) => {
    const palette = [
      colors.PRIMARY_COLOR,
      colors.PURPLE_ACCENT,
      colors.CYAN_ACCENT,
      colors.ACCEPT_GREEN,
      colors.FILM_GOLD,
    ];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return palette[Math.abs(hash) % palette.length];
  };

  // ── Firebase Listeners ────────────────────────────────────
  const getFriendRequests = async () => {
    const db = database();
    const user = auth().currentUser;
    if (!user) return;
    const friendRequestsRef = db.ref(`friend_requests/${user.uid}`);
    const callback = friendRequestsRef.on('value', async (snapshot) => {
      const requestsData = snapshot.val();
      if (!requestsData) {
        setFriendRequests([]);
        return;
      }
      let userDetails = [];
      for (let request in requestsData) {
        let friendUserDetails = await getUserFriendDetails(request);
        if (friendUserDetails) userDetails.push(friendUserDetails);
      }
      setFriendRequests(userDetails);
    });
    return () => friendRequestsRef.off('value', callback);
  };

  const getFriendSentRequests = async () => {
    const db = database();
    const user = auth().currentUser;
    if (!user) return;
    const friendSentRequestRef = db.ref(`user_friend_requests/${user.uid}`);
    const callback = friendSentRequestRef.on('value', async (snapshot) => {
      const requestsData = snapshot.val();
      if (!requestsData) {
        setSentRequests([]);
        return;
      }
      let userDetails = [];
      for (let request in requestsData) {
        let friendUserDetails = await getUserFriendDetails(request);
        if (friendUserDetails) userDetails.push(friendUserDetails);
      }
      setSentRequests(userDetails);
    });
    return () => friendSentRequestRef.off('value', callback);
  };

  const getFriends = () => {
    const db = database();
    const user = auth().currentUser;
    if (!user) return null;
    const friendsRef = db.ref(`friends/${user.uid}`);
    const callback = friendsRef.on('value', (snapshot) => {
      const friends = snapshot.val();
      if (!friends) {
        setFriendsList([]);
        return;
      }
      Object.keys(friends).forEach(friendId => {
        const userRef = db.ref(`users/${friendId}`);
        userRef.on('value', (userSnapshot) => {
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
      if (user) {
        friendsRef.off('value', callback);
        friendsList.forEach(friend => {
          db.ref(`users/${friend.userId}`).off('value');
        });
      }
    };
  };

  const acceptFriendRequest = async (userId) => {
    try {
      const db = database();
      const user = auth().currentUser;
      if (!user) return;
      const friendRequestRef = db.ref(`friend_requests/${user.uid}/${userId}`);
      const snapshot = await friendRequestRef.once('value');
      if (snapshot.val()) {
        await friendRequestRef.remove();
        await db.ref(`friends/${user.uid}/${userId}`).set(true);
        await db.ref(`friends/${userId}/${user.uid}`).set(true);
        await db.ref(`user_friend_requests/${userId}/${user.uid}`).remove();
      }
    } catch (error) {
      console.error('Error accepting friend request:', error);
    }
  };

  const declineFriendRequest = async (userId) => {
    const db = database();
    const user = auth().currentUser;
    if (!user) return;
    await db.ref(`friend_requests/${user.uid}/${userId}`).remove();
  };

  const getUserFriendDetails = async (userId) => {
    const db = database();
    const snapshot = await db.ref(`users/${userId}`).once('value');
    return snapshot.val();
  };

  const isFriendIsOrNot = async (userId) => {
    const db = database();
    const user = auth().currentUser;
    const snapshot = await db.ref(`friends/${user.uid}/${userId}`).once('value');
    return snapshot.val();
  };

  const removeFriend = async (userId) => {
    const db = database();
    const user = auth().currentUser;
    await db.ref(`friends/${user.uid}/${userId}`).remove();
    await db.ref(`friends/${userId}/${user.uid}`).remove();
  };

  const cancelFriendRequest = async (userId) => {
    const db = database();
    const user = auth().currentUser;
    await db.ref(`friend_requests/${user?.uid}/${userId}`).remove();
    await db.ref(`user_friend_requests/${user?.uid}/${userId}`).remove();
  };

  const checkUserExists = async (emailOrUsername) => {
    try {
      setIsLoading(true);
      const db = database();
      const queryKey = emailOrUsername.includes('@') ? 'email' : 'username';
      const userQuery = db.ref('users').orderByChild(queryKey).equalTo(emailOrUsername);
      const snapshot = await userQuery.once('value');
      let newVal = snapshot.val();
      setIsLoading(false);
      return newVal ? Object.values(newVal)[0] : false;
    } catch (error) {
      setIsLoading(false);
      return false;
    }
  };

  const handleAddFriend = async () => {
    if (!searchEmail.trim()) {
      Alert.alert('Required', 'Please enter a valid email or username');
      return;
    }
    const tempUser = auth().currentUser;
    if (tempUser?.email === searchEmail.trim()) {
      Alert.alert('Oops!', "You can't add yourself as a friend");
      return;
    }
    const userExists = await checkUserExists(searchEmail.trim());
    if (userExists && userExists.userId) {
      const isFriend = await isFriendIsOrNot(userExists.userId);
      if (isFriend) {
        Alert.alert('Already Friends', 'This user is already in your crew!');
        return;
      }
      const db = database();
      await db.ref(`friend_requests/${userExists.userId}/${tempUser.uid}`).set(true);
      await db.ref(`user_friend_requests/${tempUser.uid}/${userExists.userId}`).set(true);
      setSearchEmail('');
      setShowAddModal(false);
      Alert.alert('Request Sent', `Friend request sent to ${userExists.username || searchEmail}!`);
    } else {
      Alert.alert('Not Found', 'No user found with that email or username');
    }
  };


  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={colors.BACKGROUND_COLOR} barStyle="light-content" translucent />

      {/* ── HEADER BAR ─────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: safeTopPadding }]}>
        <View style={styles.headerLeft}>
          <LinearGradient
            colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]}
            style={styles.headerLogoIcon}
          >
            <MaterialIcons name="movie" size={20} color="#FFF" />
          </LinearGradient>
          <View>
            <Text style={styles.headerTitle}>Friends & Social</Text>
            <Text style={styles.headerSubtitle}>Cine-Sync Live Network</Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.addFriendBtn}
            onPress={() => setShowAddModal(!showAddModal)}
            activeOpacity={0.8}
          >
            <MaterialIcons name="person-add" size={16} color={colors.CYAN_ACCENT} />
            <Text style={styles.addFriendBtnText}>Add</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconBellBtn} activeOpacity={0.8}>
            <MaterialIcons name="notifications" size={20} color={colors.TITLE_COLOR} />
            {friendRequests.length > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{friendRequests.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── ADD FRIEND SEARCH EXPANDABLE INPUT ─────────────────── */}
        {showAddModal && (
          <View style={styles.addFriendSearchBox}>
            <MaterialIcons name="search" size={20} color={colors.CYAN_ACCENT} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.addSearchInput}
              placeholder="Enter email or username to add..."
              placeholderTextColor={colors.MUTED_COLOR}
              value={searchEmail}
              onChangeText={setSearchEmail}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={styles.sendReqBtn}
              onPress={handleAddFriend}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.sendReqBtnText}>Send</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ── SECTION 1: WATCHING NOW CAROUSEL ──────────────────── */}
        {activeRooms.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWrap}>
                <Text style={styles.sectionTitle}>Watching Now</Text>
                <View style={styles.pulseLiveDot} />
                <View style={styles.onlineBadge}>
                  <Text style={styles.onlineBadgeText}>
                    {friendsList.filter(f => f?.status === 'online' || f?.status?.state === 'online').length} Online
                  </Text>
                </View>
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carouselContainer}
            >
              {activeRooms.map(item => {
                const hostName =
                  item.creator?.userName ||
                  item.creator?.name ||
                  (item.creator?.email ? item.creator.email.split('@')[0] : 'Host');
                const participantCount =
                  (item.participants?.length ||
                    (item.participants ? Object.keys(item.participants).length : 0)) + 1;
                const initial = hostName.charAt(0).toUpperCase() || 'H';
                const avatarBg = generateAvatarColor(hostName);

                const handleJoin = () => {
                  const currentUser = auth().currentUser;
                  const isCreator = item.creator?.email === currentUser?.email;
                  if (item.isStreaming) {
                    navigation.navigate('Streaming', {
                      roomId: item.roomId,
                      roomName: item.name,
                      streamUrl: item.streamUrl,
                    });
                  } else {
                    navigation.navigate('WaitingScreen', {
                      roomId: item.roomId,
                      roomName: item.name,
                      streamUrl: item.streamUrl,
                      isHost: isCreator,
                    });
                  }
                };

                return (
                  <View key={item.roomId || item.name} style={styles.carouselCard}>
                    {item.thumbnail ? (
                      <ImageBackground
                        source={{ uri: item.thumbnail }}
                        style={styles.carouselBanner}
                        imageStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
                      >
                        <LinearGradient
                          colors={['rgba(15, 15, 26, 0.2)', colors.SURFACE_COLOR]}
                          style={styles.carouselBannerGradient}
                        >
                          <View style={styles.carouselTopBadge}>
                            <View style={styles.pingDot} />
                            <Text style={styles.carouselTagText}>
                              {item.isStreaming ? 'LIVE SYNC' : 'READY'}
                            </Text>
                          </View>
                        </LinearGradient>
                      </ImageBackground>
                    ) : (
                      <LinearGradient
                        colors={['#1E1B4B', colors.SURFACE_COLOR]}
                        style={styles.carouselBanner}
                      >
                        <View style={styles.carouselBannerGradient}>
                          <View style={styles.carouselTopBadge}>
                            <View style={styles.pingDot} />
                            <Text style={styles.carouselTagText}>
                              {item.isStreaming ? 'LIVE SYNC' : 'READY'}
                            </Text>
                          </View>
                          <View style={styles.carouselFallbackIcon}>
                            <Ionicons name="film" size={24} color={colors.CYAN_ACCENT} />
                          </View>
                        </View>
                      </LinearGradient>
                    )}

                    <View style={styles.carouselCardBody}>
                      <View style={styles.carouselMetaRow}>
                        <View style={[styles.carouselMiniAvatar, { backgroundColor: avatarBg }]}>
                          <Text style={styles.carouselMiniAvatarText}>{initial}</Text>
                        </View>
                        <Text style={styles.carouselHostName} numberOfLines={1}>{hostName}</Text>
                        <Text style={styles.carouselRoomCode}>
                          {item.roomId ? String(item.roomId).substring(0, 7) : ''}
                        </Text>
                      </View>

                      <View style={styles.carouselMovieRow}>
                        <MaterialIcons name="movie" size={14} color={colors.PRIMARY_COLOR} style={{ marginRight: 4 }} />
                        <Text style={styles.carouselMovieText} numberOfLines={1}>
                          {item.name}
                        </Text>
                      </View>

                      <View style={styles.carouselSyncCountRow}>
                        <MaterialIcons name="groups" size={13} color="#93C5FD" style={{ marginRight: 4 }} />
                        <Text style={styles.carouselSyncCountText}>
                          {participantCount} {participantCount === 1 ? 'viewer' : 'viewers'}
                        </Text>
                      </View>

                      <TouchableOpacity
                        activeOpacity={0.85}
                        style={styles.quickJoinBtn}
                        onPress={handleJoin}
                      >
                        <LinearGradient
                          colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.quickJoinGradient}
                        >
                          <MaterialIcons name="bolt" size={16} color="#FFF" />
                          <Text style={styles.quickJoinText}>Quick Join</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── SECTION 3: SEGMENTED TABS CONTROL ─────────────────── */}
        <View style={styles.segmentedTabContainer}>
          <TouchableOpacity
            style={[styles.segTab, activeTab === 'friends' && styles.segTabActive]}
            onPress={() => setActiveTab('friends')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segTabText, activeTab === 'friends' && styles.segTabTextActive]}>
              All Friends
            </Text>
            <View style={styles.segCountBadge}>
              <Text style={styles.segCountText}>{friendsList.length}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segTab, activeTab === 'requests' && styles.segTabActive]}
            onPress={() => setActiveTab('requests')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segTabText, activeTab === 'requests' && styles.segTabTextActive]}>
              Requests
            </Text>
            {friendRequests.length > 0 && (
              <View style={styles.segCountBadgeRed}>
                <Text style={styles.segCountTextWhite}>{friendRequests.length}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segTab, activeTab === 'sent' && styles.segTabActive]}
            onPress={() => setActiveTab('sent')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segTabText, activeTab === 'sent' && styles.segTabTextActive]}>
              Sent
            </Text>
            <Text style={styles.segCountTextMuted}>{sentRequests.length}</Text>
          </TouchableOpacity>
        </View>

        {/* ── SECTION 4: FRIENDS & CONTACTS LIST ─────────────────── */}
        <View style={styles.listSectionHeader}>
          <Text style={styles.listSectionTitle}>
            {activeTab === 'friends'
              ? 'Active & Recent Contacts'
              : activeTab === 'requests'
              ? 'Pending Requests'
              : 'Sent Friend Requests'}
          </Text>
        </View>

        {/* TAB 1: FRIENDS LIST */}
        {activeTab === 'friends' && (
          friendsList.length > 0 ? (
            friendsList.map(item => {
              const isOnline = item?.status === 'online' || item?.status?.state === 'online';
              return (
                <View key={item?.userId || item?.email} style={styles.friendRowCard}>
                  <View style={styles.friendRowLeft}>
                    <View style={styles.friendAvatarBox}>
                      {isOnline && <PulsingRing />}
                      <View
                        style={[
                          styles.friendAvatar,
                          { backgroundColor: generateAvatarColor(item?.username || item?.email || '') },
                        ]}
                      >
                        <Text style={styles.avatarInitialText}>
                          {(item?.username || item?.email || '?')[0]?.toUpperCase()}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.friendOnlineDot,
                          { backgroundColor: isOnline ? colors.ACCEPT_GREEN : colors.MUTED_COLOR },
                        ]}
                      />
                    </View>

                    <View style={styles.friendRowText}>
                      <View style={styles.friendNameRow}>
                        <Text style={styles.friendNameText} numberOfLines={1}>
                          {item?.username || item?.email?.split('@')[0]}
                        </Text>
                      </View>
                      <Text style={styles.friendStatusSubtext}>
                        {isOnline ? '🟢 Online • Ready to watch' : 'Offline'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.friendRowActions}>
                    <TouchableOpacity
                      style={styles.inviteRowBtn}
                      activeOpacity={0.8}
                      onPress={() => Alert.alert('Invite Sent', `Invited ${item?.username} to your room!`)}
                    >
                      <MaterialIcons name="group-add" size={16} color={colors.PRIMARY_COLOR} />
                      <Text style={styles.inviteRowBtnText}>Invite</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.chatIconBtn}
                      activeOpacity={0.8}
                      onPress={() =>
                        navigation.navigate('Chat', {
                          username: item?.username || 'Chat',
                          userId: item?.userId,
                          avatar: item?.avatar,
                        })
                      }
                    >
                      <MaterialIcons name="chat" size={18} color={colors.TITLE_COLOR} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.removeIconBtn}
                      activeOpacity={0.8}
                      onPress={() => {
                        Alert.alert('Remove Friend', 'Remove this user from your crew?', [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Remove', style: 'destructive', onPress: () => removeFriend(item?.userId) },
                        ]);
                      }}
                    >
                      <MaterialIcons name="person-remove" size={16} color={colors.DELETE_RED_COLOR} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyBox}>
              <Ionicons name="people-outline" size={40} color={colors.FILM_GOLD} />
              <Text style={styles.emptyTitle}>No Friends Added Yet</Text>
              <Text style={styles.emptySub}>
                Tap the "+ Add" button in the header to find friends by email or username!
              </Text>
            </View>
          )
        )}

        {/* TAB 2: FRIEND REQUESTS */}
        {activeTab === 'requests' && (
          friendRequests.length > 0 ? (
            friendRequests.map(item => (
              <View key={item?.userId} style={styles.requestRowCard}>
                <View style={styles.friendRowLeft}>
                  <View
                    style={[
                      styles.friendAvatar,
                      { backgroundColor: generateAvatarColor(item?.username || '') },
                    ]}
                  >
                    <Text style={styles.avatarInitialText}>
                      {(item?.username || '?')[0]?.toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.friendNameText}>{item?.username}</Text>
                    <Text style={styles.friendStatusSubtext}>Wants to join your crew</Text>
                  </View>
                </View>

                <View style={styles.requestBtnRow}>
                  <TouchableOpacity
                    style={styles.acceptRequestBtn}
                    onPress={() => acceptFriendRequest(item?.userId)}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="check" size={16} color="#FFF" />
                    <Text style={styles.acceptRequestText}>Accept</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.declineRequestBtn}
                    onPress={() => declineFriendRequest(item?.userId)}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="close" size={16} color={colors.DELETE_RED_COLOR} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyBox}>
              <Ionicons name="mail-open-outline" size={40} color={colors.CYAN_ACCENT} />
              <Text style={styles.emptyTitle}>No Pending Requests</Text>
              <Text style={styles.emptySub}>You have no incoming friend requests right now.</Text>
            </View>
          )
        )}

        {/* TAB 3: SENT REQUESTS */}
        {activeTab === 'sent' && (
          sentRequests.length > 0 ? (
            sentRequests.map(item => (
              <View key={item?.userId} style={styles.requestRowCard}>
                <View style={styles.friendRowLeft}>
                  <View
                    style={[
                      styles.friendAvatar,
                      { backgroundColor: generateAvatarColor(item?.username || '') },
                    ]}
                  >
                    <Text style={styles.avatarInitialText}>
                      {(item?.username || '?')[0]?.toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.friendNameText}>{item?.username}</Text>
                    <Text style={styles.friendStatusSubtext}>Request Pending...</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.cancelRequestBtn}
                  onPress={() => cancelFriendRequest(item?.userId)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelRequestText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ))
          ) : (
            <View style={styles.emptyBox}>
              <Ionicons name="send-outline" size={40} color={colors.PURPLE_ACCENT} />
              <Text style={styles.emptyTitle}>No Sent Requests</Text>
              <Text style={styles.emptySub}>You haven't sent any friend requests recently.</Text>
            </View>
          )
        )}
      </ScrollView>
    </View>
  );
};

// ──────────────────────────────────────────────────────────────
//  Styles
// ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
  },
  scrollContent: {
    paddingBottom: 110,
  },

  // ── Header Bar ────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.BACKGROUND_COLOR,
    borderBottomWidth: 1,
    borderBottomColor: colors.BORDER_SUBTLE,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerLogoIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.TITLE_COLOR,
  },
  headerSubtitle: {
    fontSize: 11,
    color: colors.SUB_TITLE_COLOR,
    fontWeight: '500',
  },

  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addFriendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    gap: 4,
  },
  addFriendBtnText: {
    color: colors.CYAN_ACCENT,
    fontSize: 12,
    fontWeight: '700',
  },
  iconBellBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bellBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: colors.LIVE_RED,
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bellBadgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '800',
  },

  // ── Add Friend Search Box ─────────
  addFriendSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_COLOR,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 46,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
  },
  addSearchInput: {
    flex: 1,
    color: colors.TITLE_COLOR,
    fontSize: 13,
  },
  sendReqBtn: {
    backgroundColor: colors.PRIMARY_COLOR,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },
  sendReqBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Section Titles ────────────────
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 14,
    marginBottom: 10,
  },
  sectionTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.TITLE_COLOR,
  },
  pulseLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.LIVE_RED,
  },
  onlineBadge: {
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  onlineBadgeText: {
    color: colors.CYAN_ACCENT,
    fontSize: 11,
    fontWeight: '600',
  },
  viewAllText: {
    color: colors.CYAN_ACCENT,
    fontSize: 12,
    fontWeight: '600',
  },

  // ── Carousel ──────────────────────
  carouselContainer: {
    paddingLeft: 16,
    paddingRight: 8,
    gap: 12,
  },
  carouselCard: {
    width: 230,
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
    overflow: 'hidden',
  },
  carouselBanner: {
    width: '100%',
    height: 110,
  },
  carouselBannerGradient: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 10,
  },
  carouselTopBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(8, 8, 16, 0.8)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  pingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.ACCEPT_GREEN,
  },
  carouselTagText: {
    color: colors.TITLE_COLOR,
    fontSize: 10,
    fontWeight: '700',
  },
  carouselAvatarWrap: {
    position: 'relative',
    alignSelf: 'flex-start',
    marginBottom: -14,
  },
  carouselAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.ACCEPT_GREEN,
  },
  avatarOnlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.ACCEPT_GREEN,
    borderWidth: 1.5,
    borderColor: colors.SURFACE_COLOR,
  },

  carouselCardBody: {
    padding: 12,
    paddingTop: 16,
    gap: 6,
  },
  carouselMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  carouselMiniAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  carouselMiniAvatarText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },
  carouselFallbackIcon: {
    alignSelf: 'center',
    marginTop: 14,
    opacity: 0.7,
  },
  carouselSyncCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  carouselSyncCountText: {
    color: '#93C5FD',
    fontSize: 11,
    fontWeight: '600',
  },
  carouselHostName: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '700',
  },
  carouselRoomCode: {
    color: colors.CYAN_ACCENT,
    fontSize: 11,
    fontWeight: '600',
  },
  carouselMovieRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  carouselMovieText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    flex: 1,
  },
  quickJoinBtn: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 4,
  },
  quickJoinGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 4,
  },
  quickJoinText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Invite Callout Card ───────────
  inviteNotificationCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.3)',
  },
  inviteCardGradient: {
    padding: 14,
    gap: 10,
  },
  inviteHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.BORDER_SUBTLE,
    paddingBottom: 8,
  },
  inviteTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inviteCardTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '700',
  },
  inviteTimerTag: {
    backgroundColor: 'rgba(124, 58, 237, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  inviteTimerText: {
    color: colors.PURPLE_ACCENT,
    fontSize: 10,
    fontWeight: '800',
  },

  inviteBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inviterAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
  },
  inviteInfo: {
    flex: 1,
  },
  inviterText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 13,
  },
  inviterName: {
    color: colors.PRIMARY_COLOR,
    fontWeight: '700',
  },
  inviteMovieRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  inviteMovieText: {
    color: colors.TITLE_COLOR,
    fontSize: 12,
    fontWeight: '600',
  },
  inviteMetaText: {
    color: colors.MUTED_COLOR,
    fontSize: 11,
    marginTop: 2,
  },

  inviteActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  acceptInviteBtn: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  acceptInviteGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    gap: 6,
  },
  acceptInviteText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  declineInviteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingVertical: 9,
    borderRadius: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
  },
  declineInviteText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    fontWeight: '600',
  },

  // ── Segmented Control ─────────────
  segmentedTabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.SURFACE_COLOR,
    marginHorizontal: 16,
    marginTop: 18,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
  },
  segTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  segTabActive: {
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
  },
  segTabText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    fontWeight: '600',
  },
  segTabTextActive: {
    color: '#FFF',
    fontWeight: '700',
  },
  segCountBadge: {
    backgroundColor: 'rgba(0, 122, 255, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  segCountBadgeRed: {
    backgroundColor: colors.LIVE_RED,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  segCountText: {
    color: colors.PRIMARY_COLOR,
    fontSize: 10,
    fontWeight: '700',
  },
  segCountTextWhite: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
  segCountTextMuted: {
    color: colors.MUTED_COLOR,
    fontSize: 10,
    fontWeight: '600',
  },

  // ── Contact List ──────────────────
  listSectionHeader: {
    paddingHorizontal: 16,
    marginTop: 14,
    marginBottom: 8,
  },
  listSectionTitle: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  friendRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.SURFACE_COLOR,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
  },
  friendRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  friendAvatarBox: {
    position: 'relative',
  },
  pulsingRing: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.ACCEPT_GREEN,
  },
  friendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitialText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  friendOnlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.SURFACE_COLOR,
  },

  friendRowText: {
    flex: 1,
  },
  friendNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  friendNameText: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '700',
  },
  friendStatusSubtext: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    marginTop: 2,
  },

  friendRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inviteRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
    gap: 4,
  },
  inviteRowBtnText: {
    color: colors.PRIMARY_COLOR,
    fontSize: 12,
    fontWeight: '700',
  },
  chatIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Requests Rows
  requestRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.SURFACE_COLOR,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
  },
  requestBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  acceptRequestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.ACCEPT_GREEN,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  acceptRequestText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  declineRequestBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelRequestBtn: {
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
  },
  cancelRequestText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    fontWeight: '600',
  },

  // Empty State
  emptyBox: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 4,
  },
  emptySub: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});

export default FriendsScreen;