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
  Dimensions,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import colors from '../../../theme/Colors';
import Header from '../../../components/Header';
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
          Animated.timing(pulseAnim, { toValue: 1.5, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(opacityAnim, { toValue: 0, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulseAnim, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(opacityAnim, { toValue: 0.6, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: 52, height: 52, borderRadius: 26,
        backgroundColor: colors.ACCEPT_GREEN,
        opacity: opacityAnim,
        transform: [{ scale: pulseAnim }],
      }}
    />
  );
};

// ──────────────────────────────────────────────────────────────
//  Empty State
// ──────────────────────────────────────────────────────────────
const EmptyStateAnimation = ({ icon, title, subtitle }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.3)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true }),
    ]).start();

    // Gentle continuous rotation for the icon
    Animated.loop(
      Animated.timing(rotateAnim, { toValue: 1, duration: 8000, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, []);

  const spin = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.emptyStateContainer}>
      <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }], alignItems: 'center' }}>
        <View style={styles.emptyIconWrapper}>
          <Animated.View style={{ transform: [{ rotate: spin }] }}>
            <Ionicons name="film-outline" size={48} color={colors.FILM_GOLD} />
          </Animated.View>
        </View>
        <Animated.Text style={[styles.emptyStateTitle, { opacity: fadeAnim }]}>
          {title}
        </Animated.Text>
        <Animated.Text style={[styles.emptyStateSub, { opacity: fadeAnim }]}>
          {subtitle}
        </Animated.Text>
      </Animated.View>
    </View>
  );
};

// ──────────────────────────────────────────────────────────────
//  Tab Badge Dot
// ──────────────────────────────────────────────────────────────
const BadgeDot = ({ count }) => {
  if (count === 0) return null;
  return (
    <View style={styles.badgeDot}>
      <Text style={styles.badgeDotText}>{count > 9 ? '9+' : count}</Text>
    </View>
  );
};

// ──────────────────────────────────────────────────────────────
//  Friends Screen
// ──────────────────────────────────────────────────────────────
const FriendsScreen = ({ navigation }) => {
  const [searchEmail, setSearchEmail] = useState('');
  const [activeTab, setActiveTab] = useState('friends');
  const [isLoading, setIsLoading] = useState(false);
  const [friendRequests, setFriendRequests] = useState([]);
  const [friendsList, setFriendsList] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [searchFocused, setSearchFocused] = useState(false);

  // Tab indicator animation
  const tabIndicator = useRef(new Animated.Value(0)).current;

  const TAB_MAP = { friends: 0, requests: 1, sent: 2 };

  const switchTab = (tab) => {
    setActiveTab(tab);
    Animated.spring(tabIndicator, {
      toValue: TAB_MAP[tab],
      friction: 8,
      tension: 60,
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    getFriendRequests();
    getFriendSentRequests();
    const unsubscribe = getFriends();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // ── Avatar helpers ──────────────────────────────────────────
  const generateAvatarColor = (str) => {
    const palette = [colors.PRIMARY_COLOR, '#FF2D55', '#5856D6', colors.ACCEPT_GREEN, colors.FILM_GOLD];
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return palette[Math.abs(hash) % palette.length];
  };

  // ── Firebase logic (unchanged) ─────────────────────────────
  const getFriendRequests = async () => {
    const db = database();
    const user = auth().currentUser;
    const friendRequestsRef = db.ref(`friend_requests/${user?.uid}`);
    const callback = friendRequestsRef.on('value', async (snapshot) => {
      const friendRequests = snapshot.val();
      if (!friendRequests) { setFriendRequests([]); return; }
      let userDetails = [];
      for (let request in friendRequests) {
        let friendUserDetails = await getUserFriendDetails(request);
        userDetails.push(friendUserDetails);
      }
      setFriendRequests(userDetails);
    });
    return () => friendRequestsRef.off('value', callback);
  };

  const getFriendSentRequests = async () => {
    const db = database();
    const user = auth().currentUser;
    const friendSentRequestRef = db.ref(`user_friend_requests/${user?.uid}`);
    const callback = friendSentRequestRef.on('value', async (snapshot) => {
      const friendSentRequests = snapshot.val();
      if (!friendSentRequests) { setSentRequests([]); return; }
      let userDetails = [];
      for (let request in friendSentRequests) {
        let friendUserDetails = await getUserFriendDetails(request);
        userDetails.push(friendUserDetails);
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
      if (!friends) { setFriendsList([]); return; }
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
      if (!user) throw new Error('No authenticated user');
      const friendRequestRef = db.ref(`friend_requests/${user.uid}/${userId}`);
      const snapshot = await friendRequestRef.once('value');
      const friendRequest = snapshot.val();
      if (friendRequest) {
        await friendRequestRef.remove();
        await db.ref(`friends/${user.uid}/${userId}`).set(true);
        await db.ref(`friends/${userId}/${user.uid}`).set(true);
        await db.ref(`user_friend_requests/${userId}/${user.uid}`).remove();
      }
    } catch (error) {
      console.error('Error accepting friend request:', error.message);
    }
  };

  const declineFriendRequest = async (userId) => {
    const db = database();
    const user = auth().currentUser;
    const friendRequestRef = db.ref(`friend_requests/${user.uid}/${userId}`);
    const snapshot = await friendRequestRef.once('value');
    const friendRequest = snapshot.val();
    if (friendRequest) {
      await friendRequestRef.remove();
    }
  };

  const getUserFriendDetails = async (userId) => {
    const db = database();
    const userRef = db.ref(`users/${userId}`);
    const snapshot = await userRef.once('value');
    return snapshot.val();
  };

  const isFriendIsOrNot = async (userId) => {
    const db = database();
    const user = auth().currentUser;
    const userRef = db.ref(`friends/${user.uid}/${userId}`);
    const snapshot = await userRef.once('value');
    return snapshot.val();
  };

  const removeFriend = async (userId) => {
    const db = database();
    const user = auth().currentUser;
    const friendRef = db.ref(`friends/${user.uid}/${userId}`);
    const friendRef2 = db.ref(`friends/${userId}/${user.uid}`);
    await friendRef.remove();
    await friendRef2.remove();
  };

  const cancelFriendRequest = async (userId) => {
    const db = database();
    const user = auth().currentUser;
    const friendRequestRef = db.ref(`friend_requests/${user?.uid}/${userId}`);
    const userFriendRequestRef = db.ref(`user_friend_requests/${user?.uid}/${userId}`);
    await friendRequestRef.remove();
    await userFriendRequestRef.remove();
  };

  const checkUserExists = async (email) => {
    try {
      setIsLoading(true);
      const db = database();
      const userQuery = db.ref('users').orderByChild('email').equalTo(email);
      const snapshot = await userQuery.once('value');
      let newVal = await snapshot.val();
      return Object.values(newVal)[0];
    } catch (error) {
      setIsLoading(false);
      return false;
    }
  };

  const handleAddFriend = async () => {
    const tempUser = auth().currentUser;
    if (tempUser.email !== searchEmail) {
      const userExists = await checkUserExists(searchEmail);
      if (userExists && userExists.userId !== null) {
        const isFriend = await isFriendIsOrNot(userExists?.userId);
        if (isFriend) {
          Alert.alert('Already Friends', 'This user is already in your crew!');
          setIsLoading(false);
          return;
        } else {
          const db = database();
          const user = auth().currentUser;
          if (user.uid) {
            const friendRequestRef = db.ref(`friend_requests/${userExists?.userId}/${user?.uid}`);
            const userFriendRequestRef = db.ref(`user_friend_requests/${user?.uid}/${userExists?.userId}`);
            await friendRequestRef.set(true);
            await userFriendRequestRef.set(true);
            setSearchEmail('');
            setIsLoading(false);
          }
        }
      } else {
        Alert.alert('Not Found', 'No user found with that email address');
        setIsLoading(false);
        return;
      }
    } else {
      Alert.alert('Oops!', "You can't add yourself as a friend");
      setIsLoading(false);
      return;
    }
  };

  // ── Render Items ───────────────────────────────────────────
  const renderFriend = ({ item }) => {
    const isOnline = item?.status === 'online' || item?.status?.state === 'online';
    return (
      <View style={styles.friendCard}>
        {/* Film-strip accent */}
        <LinearGradient
          colors={[colors.PRIMARY_COLOR, '#5856D6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.cardAccentStrip}
        />
        <View style={styles.friendInner}>
          <View style={styles.friendInfo}>
            {/* Avatar with online pulse */}
            <View style={styles.avatarWrapper}>
              {isOnline && <PulsingRing />}
              <View style={[
                styles.avatarContainer,
                { backgroundColor: generateAvatarColor(item?.username || '') },
                isOnline && styles.avatarOnlineBorder,
              ]}>
                <Text style={styles.avatarText}>
                  {(item?.username || '')[0]?.toUpperCase() || '?'}
                </Text>
              </View>
            </View>
            <View style={styles.friendTextBlock}>
              <Text style={styles.friendName} numberOfLines={1}>{item?.username || 'Unknown'}</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: isOnline ? colors.ACCEPT_GREEN : colors.MUTED_COLOR }]} />
                <Text style={[styles.statusLabel, isOnline && { color: colors.ACCEPT_GREEN }]}>
                  {isOnline ? 'Online' : 'Offline'}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.friendActions}>
            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.chatBtn}
              onPress={() => navigation.navigate('Chat', {
                username: item?.username || 'New Chat',
                userId: item?.userId,
                avatar: item?.avatar,
              })}
            >
              <LinearGradient
                colors={[colors.PRIMARY_COLOR, '#5856D6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.chatBtnGradient}
              >
                <MaterialIcons name="chat-bubble" size={18} color="#FFF" />
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.removeBtn}
              onPress={() => {
                Alert.alert('Remove Friend', 'Remove this person from your crew?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: () => removeFriend(item?.userId) },
                ]);
              }}
            >
              <MaterialIcons name="person-remove" size={18} color={colors.DELETE_RED_COLOR} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const renderFriendRequest = ({ item }) => (
    <View style={styles.requestCard}>
      <View style={styles.requestTop}>
        <View style={[styles.avatarContainer, { backgroundColor: generateAvatarColor(item?.email || '') }]}>
          <Text style={styles.avatarText}>{item?.username?.[0]?.toUpperCase()}</Text>
        </View>
        <View style={styles.requestTextBlock}>
          <Text style={styles.requestName}>{item?.username}</Text>
          <Text style={styles.requestSub}>wants to join your crew</Text>
        </View>
      </View>
      <View style={styles.requestActions}>
        <TouchableOpacity activeOpacity={0.8} style={styles.acceptBtnWrap} onPress={() => acceptFriendRequest(item?.userId)}>
          <LinearGradient
            colors={[colors.ACCEPT_GREEN, '#00E676']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.acceptBtnGradient}
          >
            <MaterialIcons name="check" size={18} color="#FFF" />
            <Text style={styles.acceptBtnText}>Accept</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.7} style={styles.declineBtn} onPress={() => declineFriendRequest(item?.userId)}>
          <MaterialIcons name="close" size={18} color={colors.DELETE_RED_COLOR} />
          <Text style={styles.declineBtnText}>Decline</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderSentRequest = ({ item }) => (
    <View style={styles.requestCard}>
      <View style={styles.requestTop}>
        <View style={[styles.avatarContainer, { backgroundColor: generateAvatarColor(item?.email || '') }]}>
          <Text style={styles.avatarText}>{item?.username?.[0]?.toUpperCase()}</Text>
        </View>
        <View style={styles.requestTextBlock}>
          <Text style={styles.requestName}>{item?.username}</Text>
          <View style={styles.pendingBadge}>
            <Ionicons name="time-outline" size={12} color={colors.FILM_GOLD} />
            <Text style={styles.pendingBadgeText}>Pending</Text>
          </View>
        </View>
      </View>
      <TouchableOpacity
        activeOpacity={0.7}
        style={styles.cancelBtn}
        onPress={() => {
          Alert.alert('Cancel Request', 'Cancel this friend request?', [
            { text: 'No', style: 'cancel' },
            { text: 'Yes', style: 'destructive', onPress: () => cancelFriendRequest(item?.userId) },
          ]);
        }}
      >
        <MaterialIcons name="close" size={18} color={colors.DELETE_RED_COLOR} />
        <Text style={styles.cancelBtnText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Tab bar metrics ────────────────────────────────────────
  const TAB_WIDTH = (SCREEN_WIDTH - 48) / 3; // 24px padding each side
  const indicatorTranslateX = tabIndicator.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0, TAB_WIDTH, TAB_WIDTH * 2],
  });

  // ── Main Render ────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={colors.BACKGROUND_COLOR} barStyle="light-content" />

      {/* ── Header ─────────────────────────────────────────── */}
      <Header
        title="My Crew"
        subtitle={`${friendsList.length} ${friendsList.length === 1 ? 'friend' : 'friends'} connected`}
        leftIcon="film"
      />

      {/* ── Search + Add ──────────────────────────────────── */}
      <View style={styles.searchRow}>
        <View style={[styles.searchBox, searchFocused && styles.searchBoxFocused]}>
          <MaterialIcons name="search" size={20} color={searchFocused ? colors.PRIMARY_COLOR : colors.MUTED_COLOR} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by email..."
            placeholderTextColor={colors.MUTED_COLOR}
            value={searchEmail}
            onChangeText={setSearchEmail}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>
        <TouchableOpacity activeOpacity={0.8} onPress={handleAddFriend} style={styles.addBtnWrap}>
          <LinearGradient
            colors={[colors.PRIMARY_COLOR, '#5856D6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.addBtnGradient}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <MaterialIcons name="person-add" size={22} color="#FFF" />
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* ── Tabs ──────────────────────────────────────────── */}
      <View style={styles.tabBar}>
        {/* Animated indicator */}
        <Animated.View style={[styles.tabIndicator, { width: TAB_WIDTH, transform: [{ translateX: indicatorTranslateX }] }]}>
          <LinearGradient
            colors={[colors.PRIMARY_COLOR, '#5856D6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.tabIndicatorGradient}
          />
        </Animated.View>

        {[
          { key: 'friends', label: 'Friends', count: friendsList.length },
          { key: 'requests', label: 'Requests', count: friendRequests.length },
          { key: 'sent', label: 'Sent', count: sentRequests.length },
        ].map(tab => (
          <TouchableOpacity
            key={tab.key}
            activeOpacity={0.7}
            style={styles.tab}
            onPress={() => switchTab(tab.key)}
          >
            <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
              {tab.label}
            </Text>
            {tab.count > 0 && activeTab !== tab.key && <BadgeDot count={tab.count} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Content ───────────────────────────────────────── */}
      <View style={styles.content}>
        {activeTab === 'friends' ? (
          friendsList.length > 0 ? (
            <FlatList
              data={friendsList}
              renderItem={renderFriend}
              keyExtractor={(item) => item.userId}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listPadding}
            />
          ) : (
            <EmptyStateAnimation icon="people" title="No crew members yet" subtitle="Search by email and invite friends to watch movies together" />
          )
        ) : activeTab === 'requests' ? (
          friendRequests.length > 0 ? (
            <FlatList
              data={friendRequests}
              renderItem={renderFriendRequest}
              keyExtractor={(item) => item.userId}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listPadding}
            />
          ) : (
            <EmptyStateAnimation icon="person-add" title="No incoming requests" subtitle="When someone adds you, they'll appear here" />
          )
        ) : (
          sentRequests.length > 0 ? (
            <FlatList
              data={sentRequests}
              renderItem={renderSentRequest}
              keyExtractor={(item) => item.userId}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listPadding}
            />
          ) : (
            <EmptyStateAnimation icon="send" title="No sent requests" subtitle="Invite friends to your crew and watch together" />
          )
        )}
      </View>
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



  // ── Search ────────────────────────
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1.5,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
  },
  searchBoxFocused: {
    borderColor: colors.BORDER_ACTIVE,
    backgroundColor: colors.CARD_COLOR,
  },
  searchInput: {
    flex: 1,
    color: colors.TITLE_COLOR,
    marginLeft: 10,
    fontSize: 15,
    fontWeight: '400',
  },
  addBtnWrap: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  addBtnGradient: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
  },

  // ── Tabs ──────────────────────────
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 6,
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 16,
    padding: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  tabIndicator: {
    position: 'absolute',
    top: 4,
    left: 4,
    bottom: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  tabIndicatorGradient: {
    flex: 1,
    borderRadius: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    zIndex: 1,
    gap: 6,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.SUB_TITLE_COLOR,
  },
  tabLabelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  badgeDot: {
    backgroundColor: colors.FILM_GOLD,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeDotText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '800',
  },

  // ── Content ───────────────────────
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  listPadding: {
    paddingBottom: 24,
    paddingTop: 4,
  },

  // ── Friend Card ───────────────────
  friendCard: {
    backgroundColor: colors.CARD_COLOR,
    borderRadius: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  cardAccentStrip: {
    width: 4,
  },
  friendInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  friendInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarWrapper: {
    width: 52,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarOnlineBorder: {
    borderWidth: 2,
    borderColor: colors.ACCEPT_GREEN,
  },
  avatarText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  friendTextBlock: {
    flex: 1,
  },
  friendName: {
    color: colors.TITLE_COLOR,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.MUTED_COLOR,
  },
  friendActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  chatBtnGradient: {
    width: 40,
    height: 40,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.DECLINE_RED_GLOW,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.2)',
  },

  // ── Request / Sent Cards ──────────
  requestCard: {
    backgroundColor: colors.CARD_COLOR,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  requestTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  requestTextBlock: {
    marginLeft: 12,
    flex: 1,
  },
  requestName: {
    color: colors.TITLE_COLOR,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 3,
  },
  requestSub: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 13,
    fontWeight: '500',
  },
  requestActions: {
    flexDirection: 'row',
    gap: 10,
  },
  acceptBtnWrap: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  acceptBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 12,
    gap: 6,
  },
  acceptBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  declineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: colors.DECLINE_RED_GLOW,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.2)',
  },
  declineBtnText: {
    color: colors.DELETE_RED_COLOR,
    fontWeight: '700',
    fontSize: 14,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.FILM_GOLD_GLOW,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  pendingBadgeText: {
    color: colors.FILM_GOLD,
    fontSize: 11,
    fontWeight: '700',
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.DECLINE_RED_GLOW,
    borderRadius: 12,
    paddingVertical: 11,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.2)',
  },
  cancelBtnText: {
    color: colors.DELETE_RED_COLOR,
    fontWeight: '700',
    fontSize: 14,
  },

  // ── Empty State ───────────────────
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIconWrapper: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.FILM_GOLD_GLOW,
  },
  emptyStateTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyStateSub: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default FriendsScreen;