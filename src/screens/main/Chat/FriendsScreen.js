import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Animated,
  Easing,
  ScrollView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import colors from '../../../theme/Colors';
import { auth, database } from '../../../config/firebase';
import { showCineAlert } from '../../../components/CineAlert';

// ──────────────────────────────────────────────────────────────
//  Format Chat Time (WhatsApp-style: 10:45 AM, Yesterday, Day, Date)
// ──────────────────────────────────────────────────────────────
const formatChatTime = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return 'Yesterday';
  }

  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 7 && diffDays > 0) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[date.getDay()];
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

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
  const [activeTab, setActiveTab] = useState('friends'); // 'friends', 'requests', 'sent'
  const [isLoading, setIsLoading] = useState(false);
  const [friendRequests, setFriendRequests] = useState([]);
  const [friendsList, setFriendsList] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [chatsData, setChatsData] = useState({});

  // Dynamic safe area top inset for Android & iOS notch protection
  const safeTopPadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 12
  ) + 8;

  // Auto-switch back to 'friends' tab if the active tab runs out of data
  useEffect(() => {
    if (activeTab === 'requests' && friendRequests.length === 0) {
      setActiveTab('friends');
    } else if (activeTab === 'sent' && sentRequests.length === 0) {
      setActiveTab('friends');
    }
  }, [activeTab, friendRequests.length, sentRequests.length]);

  // ── Realtime Listeners & Focus Refresh ─────────────────────
  useEffect(() => {
    let cleanupFns = [];

    const attachAll = (user) => {
      cleanupFns.forEach(fn => typeof fn === 'function' && fn());
      cleanupFns = [];

      if (!user) {
        setFriendsList([]);
        setFriendRequests([]);
        setSentRequests([]);
        setChatsData({});
        return;
      }

      const unsubReq = getFriendRequests(user);
      const unsubSent = getFriendSentRequests(user);
      const unsubFriends = getFriends(user);
      const unsubChats = getUserChats(user);

      if (typeof unsubReq === 'function') cleanupFns.push(unsubReq);
      if (typeof unsubSent === 'function') cleanupFns.push(unsubSent);
      if (typeof unsubFriends === 'function') cleanupFns.push(unsubFriends);
      if (typeof unsubChats === 'function') cleanupFns.push(unsubChats);
    };

    const current = auth().currentUser;
    if (current) {
      attachAll(current);
    }

    const authUnsub = auth().onAuthStateChanged((user) => {
      attachAll(user);
    });

    return () => {
      authUnsub();
      cleanupFns.forEach(fn => typeof fn === 'function' && fn());
    };
  }, []);

  // Quick refresh whenever screen gains focus
  useFocusEffect(
    useCallback(() => {
      const user = auth().currentUser;
      if (!user) return;
      const db = database();

      // Refresh user_chats previews and unread counts
      db.ref(`user_chats/${user.uid}`).once('value').then((snap) => {
        const chatsVal = snap.val();
        if (chatsVal && typeof chatsVal === 'object') {
          const map = {};
          Object.keys(chatsVal).forEach((chatId) => {
            const chat = chatsVal[chatId];
            if (chat && chat.otherUserId) {
              map[chat.otherUserId] = {
                chatId,
                ...chat,
                unreadCount: typeof chat.unreadCount === 'number' ? chat.unreadCount : 0,
              };
            }
          });
          setChatsData(map);
        }
      }).catch(e => console.warn('Focus user_chats error:', e));

      db.ref(`user_friend_requests/${user.uid}`).once('value').then(async (snap) => {
        const val = snap.val();
        if (val && typeof val === 'object') {
          const userDetails = await Promise.all(
            Object.keys(val).map(uid => getUserFriendDetails(uid))
          );
          setSentRequests(userDetails.filter(Boolean));
        } else {
          setSentRequests([]);
        }
      }).catch(e => console.warn('Focus sent requests error:', e));

      db.ref(`friend_requests/${user.uid}`).once('value').then(async (snap) => {
        const val = snap.val();
        if (val && typeof val === 'object') {
          const userDetails = await Promise.all(
            Object.keys(val).map(uid => getUserFriendDetails(uid))
          );
          setFriendRequests(userDetails.filter(Boolean));
        } else {
          setFriendRequests([]);
        }
      }).catch(e => console.warn('Focus friend requests error:', e));
    }, [])
  );

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
  const getFriendRequests = (currentUser) => {
    const user = currentUser || auth().currentUser;
    if (!user) return () => {};
    const db = database();
    const friendRequestsRef = db.ref(`friend_requests/${user.uid}`);
    const callback = friendRequestsRef.on(
      'value',
      async (snapshot) => {
        try {
          const requestsData = snapshot.val();
          if (!requestsData || typeof requestsData !== 'object') {
            setFriendRequests([]);
            return;
          }
          const userIds = Object.keys(requestsData);
          const userDetails = await Promise.all(
            userIds.map(uid => getUserFriendDetails(uid))
          );
          setFriendRequests(userDetails.filter(Boolean));
        } catch (err) {
          console.error('Error in friendRequests listener:', err);
        }
      },
      (error) => {
        console.warn('friendRequests listener error:', error);
      }
    );
    return () => friendRequestsRef.off('value', callback);
  };

  const getFriendSentRequests = (currentUser) => {
    const user = currentUser || auth().currentUser;
    if (!user) return () => {};
    const db = database();
    const friendSentRequestRef = db.ref(`user_friend_requests/${user.uid}`);
    const callback = friendSentRequestRef.on(
      'value',
      async (snapshot) => {
        try {
          const requestsData = snapshot.val();
          if (!requestsData || typeof requestsData !== 'object') {
            setSentRequests([]);
            return;
          }
          const userIds = Object.keys(requestsData);
          const userDetails = await Promise.all(
            userIds.map(uid => getUserFriendDetails(uid))
          );
          setSentRequests(userDetails.filter(Boolean));
        } catch (err) {
          console.error('Error in sentRequests listener:', err);
        }
      },
      (error) => {
        console.warn('sentRequests listener error:', error);
      }
    );
    return () => friendSentRequestRef.off('value', callback);
  };

  const getFriends = (currentUser) => {
    const user = currentUser || auth().currentUser;
    if (!user) return () => {};
    const db = database();
    const friendsRef = db.ref(`friends/${user.uid}`);
    let childUnsubs = [];

    const callback = friendsRef.on(
      'value',
      (snapshot) => {
        const friends = snapshot.val();
        if (!friends || typeof friends !== 'object') {
          setFriendsList([]);
          return;
        }
        childUnsubs.forEach(fn => fn());
        childUnsubs = [];

        const friendIds = Object.keys(friends);
        friendIds.forEach((friendId) => {
          const userRef = db.ref(`users/${friendId}`);
          const userCallback = userRef.on('value', (userSnapshot) => {
            const val = userSnapshot.val();
            if (val) {
              const friendDetails = {
                ...val,
                userId: val.userId || val.id || friendId,
                username: val.username || val.displayName || (val.email ? val.email.split('@')[0] : 'Friend'),
              };
              setFriendsList((currentList) => {
                const newList = currentList.filter(f => (f.userId || f.id) !== friendId);
                return [...newList, friendDetails];
              });
            }
          });
          childUnsubs.push(() => userRef.off('value', userCallback));
        });
      },
      (error) => {
        console.warn('friends listener error:', error);
      }
    );

    return () => {
      friendsRef.off('value', callback);
      childUnsubs.forEach(fn => fn());
    };
  };

  const getUserChats = (currentUser) => {
    const user = currentUser || auth().currentUser;
    if (!user) return () => {};
    const db = database();
    const userChatsRef = db.ref(`user_chats/${user.uid}`);

    const callback = userChatsRef.on(
      'value',
      (snapshot) => {
        try {
          const chatsVal = snapshot.val();
          if (!chatsVal || typeof chatsVal !== 'object') {
            setChatsData({});
            return;
          }

          const map = {};
          Object.keys(chatsVal).forEach((chatId) => {
            const chat = chatsVal[chatId];
            if (!chat) return;
            const otherUid = chat.otherUserId;
            if (otherUid) {
              const unreadCount = typeof chat.unreadCount === 'number' ? chat.unreadCount : undefined;

              // Backwards-compatibility: If unreadCount is undefined, count unseen messages once
              if (unreadCount === undefined && chatId) {
                db.ref(`chats/${chatId}/messages`).once('value').then((msgSnap) => {
                  const msgs = msgSnap.val();
                  if (msgs && typeof msgs === 'object') {
                    let unseen = 0;
                    Object.keys(msgs).forEach((mId) => {
                      const m = msgs[mId];
                      if (m && m.senderId !== user.uid && !m.seen && !m.deletedForEveryone) {
                        unseen++;
                      }
                    });
                    if (unseen > 0) {
                      db.ref(`user_chats/${user.uid}/${chatId}/unreadCount`).set(unseen);
                    }
                  }
                }).catch(() => {});
              }

              map[otherUid] = {
                chatId,
                ...chat,
                unreadCount: typeof unreadCount === 'number' ? unreadCount : 0,
              };
            }
          });
          setChatsData(map);
        } catch (e) {
          console.warn('user_chats listener error:', e);
        }
      },
      (error) => {
        console.warn('user_chats listener error:', error);
      }
    );

    return () => {
      userChatsRef.off('value', callback);
    };
  };

  const acceptFriendRequest = async (userId) => {
    try {
      const db = database();
      const user = auth().currentUser;
      if (!user || !userId) return;
      const friendRequestRef = db.ref(`friend_requests/${user.uid}/${userId}`);
      const snapshot = await friendRequestRef.once('value');
      if (snapshot.val()) {
        await friendRequestRef.remove();
        await db.ref(`friends/${user.uid}/${userId}`).set(true);
        await db.ref(`friends/${userId}/${user.uid}`).set(true);
        await db.ref(`user_friend_requests/${userId}/${user.uid}`).remove();
        setFriendRequests(prev => prev.filter(r => (r.userId || r.uid) !== userId));
      }
    } catch (error) {
      console.error('Error accepting friend request:', error);
    }
  };

  const declineFriendRequest = async (userId) => {
    try {
      const db = database();
      const user = auth().currentUser;
      if (!user || !userId) return;
      await db.ref(`friend_requests/${user.uid}/${userId}`).remove();
      setFriendRequests(prev => prev.filter(r => (r.userId || r.uid) !== userId));
    } catch (error) {
      console.error('Error declining friend request:', error);
    }
  };

  const getUserFriendDetails = async (userId) => {
    try {
      const db = database();
      const snapshot = await db.ref(`users/${userId}`).once('value');
      const val = snapshot.val();
      if (val) {
        return {
          ...val,
          userId: val.userId || val.uid || val.id || userId,
          username: val.username || val.displayName || (val.email ? val.email.split('@')[0] : 'Crew Member'),
          email: val.email || '',
        };
      }
      return {
        userId,
        username: 'Crew Member',
        email: '',
      };
    } catch (e) {
      console.warn('getUserFriendDetails error for', userId, e);
      return {
        userId,
        username: 'Crew Member',
        email: '',
      };
    }
  };

  const isFriendIsOrNot = async (userId) => {
    const db = database();
    const user = auth().currentUser;
    if (!user || !userId) return false;
    const snapshot = await db.ref(`friends/${user.uid}/${userId}`).once('value');
    return snapshot.val();
  };

  const removeFriend = async (userId) => {
    const db = database();
    const user = auth().currentUser;
    if (!user || !userId) return;
    await db.ref(`friends/${user.uid}/${userId}`).remove();
    await db.ref(`friends/${userId}/${user.uid}`).remove();
  };

  const cancelFriendRequest = async (userId) => {
    try {
      const db = database();
      const user = auth().currentUser;
      if (!user || !userId) return;
      await db.ref(`friend_requests/${userId}/${user.uid}`).remove();
      await db.ref(`user_friend_requests/${user.uid}/${userId}`).remove();
      setSentRequests(prev => prev.filter(r => (r.userId || r.uid) !== userId));
    } catch (error) {
      console.error('Error cancelling friend request:', error);
    }
  };

  const checkUserExists = async (emailOrUsername) => {
    try {
      setIsLoading(true);
      const db = database();
      const cleanTerm = (emailOrUsername || '').trim().replace(/^@/, '').trim();
      const queryKey = cleanTerm.includes('@') ? 'email' : 'username';
      const userQuery = db.ref('users').orderByChild(queryKey).equalTo(cleanTerm);
      const snapshot = await userQuery.once('value');
      let newVal = snapshot.val();

      // Case-insensitive fallback if exact match failed
      if (!newVal) {
        const allSnap = await db.ref('users').once('value');
        const allUsers = allSnap.val() || {};
        const matchedEntry = Object.entries(allUsers).find(([uid, u]) =>
          (u?.username || '').trim().toLowerCase() === cleanTerm.toLowerCase() ||
          (u?.email || '').trim().toLowerCase() === cleanTerm.toLowerCase()
        );
        if (matchedEntry) {
          const [uid, userObj] = matchedEntry;
          newVal = { [uid]: { ...userObj, userId: userObj?.userId || userObj?.uid || uid } };
        }
      }

      setIsLoading(false);
      if (newVal) {
        const [uid, userObj] = Object.entries(newVal)[0];
        return {
          ...userObj,
          userId: userObj?.userId || userObj?.uid || uid,
        };
      }
      return false;
    } catch (error) {
      console.warn('checkUserExists error:', error);
      setIsLoading(false);
      return false;
    }
  };

  const openAddCrewMemberSheet = () => {
    showCineAlert({
      type: 'add_friend',
      icon: 'check-circle-outline',
      title: 'Add Crew Member',
      message: 'Enter username or email to link instant synchronized watch permissions.',
      inputPlaceholder: '@david_cho or user@email.com',
      confirmText: 'Send Request',
      cancelText: 'Cancel',
      onConfirm: async (inputQuery) => {
        await handleAddFriendDirect(inputQuery);
      },
    });
  };

  const handleAddFriendDirect = async (inputQuery) => {
    try {
      const rawInput = (inputQuery || '').trim();
      if (!rawInput) {
        showCineAlert({
          type: 'warning',
          title: 'Input Required',
          message: 'Please enter a valid email or username to search.',
          confirmText: 'Got It',
        });
        return;
      }
      const cleanSearch = rawInput.replace(/^@/, '').trim();
      const tempUser = auth().currentUser;
      if (!tempUser) {
        showCineAlert({
          type: 'warning',
          title: 'Authentication Required',
          message: 'Please sign in to send friend requests.',
          confirmText: 'OK',
        });
        return;
      }

      if (
        tempUser?.email?.trim().toLowerCase() === cleanSearch.toLowerCase() ||
        tempUser?.displayName?.trim().toLowerCase() === cleanSearch.toLowerCase()
      ) {
        showCineAlert({
          type: 'info',
          title: 'Oops!',
          message: "You can't add yourself as a friend.",
          confirmText: 'OK',
        });
        return;
      }

      const userExists = await checkUserExists(cleanSearch);
      const targetUserId = userExists?.userId || userExists?.uid || userExists?.id;

      if (userExists && targetUserId) {
        if (targetUserId === tempUser.uid) {
          showCineAlert({
            type: 'info',
            title: 'Oops!',
            message: "You can't add yourself as a friend.",
            confirmText: 'OK',
          });
          return;
        }

        const isFriend = await isFriendIsOrNot(targetUserId);
        if (isFriend) {
          showCineAlert({
            type: 'info',
            title: 'Already Friends',
            message: `${userExists.username || cleanSearch} is already in your crew!`,
            confirmText: 'OK',
          });
          return;
        }

        const db = database();

        // Check if user already sent a pending request to this person
        const sentSnap = await db.ref(`user_friend_requests/${tempUser.uid}/${targetUserId}`).once('value');
        if (sentSnap.exists() && sentSnap.val()) {
          showCineAlert({
            type: 'info',
            title: 'Request Pending',
            message: `You have already sent a friend request to ${userExists.username || cleanSearch}. Waiting for their response!`,
            confirmText: 'Got It',
          });
          return;
        }

        // Check if the other person already sent current user a request (auto-connect!)
        const incomingSnap = await db.ref(`friend_requests/${tempUser.uid}/${targetUserId}`).once('value');
        if (incomingSnap.exists() && incomingSnap.val()) {
          await acceptFriendRequest(targetUserId);
          showCineAlert({
            type: 'success',
            icon: 'check-circle-outline',
            title: 'Connected!',
            message: `${userExists.username || cleanSearch} had already invited you! You are now friends.`,
            confirmText: 'Great',
          });
          return;
        }

        // Send friend request to both incoming & outgoing nodes
        await db.ref(`friend_requests/${targetUserId}/${tempUser.uid}`).set(true);
        await db.ref(`user_friend_requests/${tempUser.uid}/${targetUserId}`).set(true);

        // Optimistically update sent requests state immediately
        setSentRequests((prev) => {
          const exists = prev.some(r => (r.userId || r.uid) === targetUserId);
          if (exists) return prev;
          return [
            ...prev,
            {
              userId: targetUserId,
              username: userExists.username || cleanSearch,
              email: userExists.email || '',
              ...userExists,
            },
          ];
        });

        showCineAlert({
          type: 'success',
          icon: 'check-circle-outline',
          title: 'Request Sent',
          message: `Friend request sent to ${userExists.username || cleanSearch}!`,
          confirmText: 'Great',
        });
      } else {
        showCineAlert({
          type: 'danger',
          icon: 'person-off',
          title: 'User Not Found',
          message: `No user found for "${cleanSearch}". Make sure they have registered an account on Cine-Sync.`,
          confirmText: 'OK',
        });
      }
    } catch (error) {
      console.error('Error in handleAddFriendDirect:', error);
      showCineAlert({
        type: 'danger',
        icon: 'error-outline',
        title: 'Request Failed',
        message: error?.message || 'Failed to send friend request. Please check your network and try again.',
        confirmText: 'OK',
      });
    }
  };

  // ── Sorted Friends (WhatsApp Style: Unread conversations first, then newest message, then alphabetical) ──
  const sortedFriends = useMemo(() => {
    if (!friendsList || friendsList.length === 0) return [];

    return [...friendsList].sort((a, b) => {
      const aId = a.userId || a.id;
      const bId = b.userId || b.id;
      const chatA = chatsData[aId];
      const chatB = chatsData[bId];

      const aUnread = chatA?.unreadCount || 0;
      const bUnread = chatB?.unreadCount || 0;

      // 1. Unread conversations bubble to the top
      if (aUnread > 0 && bUnread === 0) return -1;
      if (bUnread > 0 && aUnread === 0) return 1;

      // 2. Sort by newest message timestamp
      const aTime = chatA?.lastMessageTimestamp || 0;
      const bTime = chatB?.lastMessageTimestamp || 0;
      if (aTime !== bTime) {
        return bTime - aTime;
      }

      // 3. Alphabetical fallback
      const nameA = (a.username || a.email || '').toLowerCase();
      const nameB = (b.username || b.email || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [friendsList, chatsData]);

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={colors.BACKGROUND_COLOR} barStyle="light-content" translucent />

      {/* ── HEADER BAR ─────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: safeTopPadding }]}>
        <View style={styles.headerLeft}>
          <LinearGradient
            colors={['#0080FF', '#7C3AED']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerLogoIcon}
          >
            <Ionicons name="film" size={19} color="#FFF" />
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
            onPress={openAddCrewMemberSheet}
            activeOpacity={0.8}
          >
            <MaterialIcons name="person-add" size={16} color={colors.CYAN_ACCENT} />
            <Text style={styles.addFriendBtnText}>Add</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconBellBtn}
            activeOpacity={0.8}
            onPress={() => {
              if (friendRequests.length > 0) {
                setActiveTab('requests');
              }
            }}
          >
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

        {/* ── SECTION 3: SEGMENTED TABS CONTROL (Only visible when Requests or Sent has data) ── */}
        {(friendRequests.length > 0 || sentRequests.length > 0) && (
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

            {friendRequests.length > 0 && (
              <TouchableOpacity
                style={[styles.segTab, activeTab === 'requests' && styles.segTabActive]}
                onPress={() => setActiveTab('requests')}
                activeOpacity={0.8}
              >
                <Text style={[styles.segTabText, activeTab === 'requests' && styles.segTabTextActive]}>
                  Requests
                </Text>
                <View style={styles.segCountBadgeRed}>
                  <Text style={styles.segCountTextWhite}>{friendRequests.length}</Text>
                </View>
              </TouchableOpacity>
            )}

            {sentRequests.length > 0 && (
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
            )}
          </View>
        )}

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
          <>
            {/* ── PINNED SELF CHAT (Message Yourself / Personal Notes) ── */}
            <TouchableOpacity
              style={styles.selfChatCard}
              activeOpacity={0.78}
              onPress={() => {
                const currentUser = auth().currentUser;
                const myName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'You';
                navigation.navigate('Chat', {
                  username: `${myName} (You)`,
                  userId: currentUser?.uid,
                  avatar: currentUser?.photoURL || null,
                  isSelfChat: true,
                });
              }}
            >
              <View style={styles.friendRowLeft}>
                <View style={styles.selfChatAvatarWrap}>
                  <LinearGradient
                    colors={[colors.PURPLE_ACCENT, colors.PRIMARY_COLOR]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.selfChatAvatar}
                  >
                    <MaterialIcons name="bookmark" size={22} color="#FFF" />
                  </LinearGradient>
                  <View style={styles.selfChatBadge}>
                    <MaterialIcons name="person" size={10} color="#FFF" />
                  </View>
                </View>

                <View style={styles.friendRowText}>
                  <View style={styles.friendNameRow}>
                    <Text style={styles.friendNameText} numberOfLines={1}>
                      {(auth().currentUser?.displayName || auth().currentUser?.email?.split('@')[0] || 'You')} (You)
                    </Text>
                    <View style={styles.selfTag}>
                      <Text style={styles.selfTagText}>Personal</Text>
                    </View>
                  </View>
                  <Text style={styles.selfChatSubtext} numberOfLines={1}>
                    Message yourself • Saved notes & media
                  </Text>
                </View>
              </View>

              <MaterialIcons name="chat" size={18} color={colors.PURPLE_ACCENT} />
            </TouchableOpacity>

            {sortedFriends.length > 0 ? (
              sortedFriends.map(item => {
                const friendId = item?.userId || item?.id;
                const isOnline = item?.status === 'online' || item?.status?.state === 'online';
                const chat = chatsData[friendId];
                const unreadCount = (chat && typeof chat.unreadCount === 'number') ? chat.unreadCount : 0;
                const hasUnread = unreadCount > 0;
                const lastMessage = chat?.lastMessage;
                const lastTimestamp = chat?.lastMessageTimestamp;
                const currentUid = auth().currentUser?.uid;
                const isSentByMe = Boolean(chat?.lastSenderId && currentUid && chat.lastSenderId === currentUid);

                return (
                  <TouchableOpacity
                    key={friendId || item?.email}
                    style={[
                      styles.friendRowCard,
                      hasUnread && styles.friendRowCardUnread,
                    ]}
                    activeOpacity={0.75}
                    onPress={() =>
                      navigation.navigate('Chat', {
                        username: item?.username || item?.email?.split('@')[0],
                        userId: friendId,
                        avatar: item?.avatar,
                        chatId: chat?.chatId,
                      })
                    }
                  >
                    <View style={styles.friendRowLeft}>
                      {/* Click profile icon -> navigate to FriendProfileScreen */}
                      <TouchableOpacity
                        style={styles.friendAvatarBox}
                        activeOpacity={0.75}
                        onPress={() =>
                          navigation.navigate('FriendProfile', {
                            username: item?.username || item?.email?.split('@')[0],
                            userId: friendId,
                            avatar: item?.avatar,
                            status: item?.status,
                          })
                        }
                      >
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
                      </TouchableOpacity>

                      <View style={styles.friendRowText}>
                        {/* Top row: Friend Name + Formatted Timestamp */}
                        <View style={styles.friendTopRow}>
                          <Text
                            style={[
                              styles.friendNameText,
                              hasUnread && styles.friendNameTextUnread,
                            ]}
                            numberOfLines={1}
                          >
                            {item?.username || item?.email?.split('@')[0]}
                          </Text>
                          {Boolean(lastTimestamp) && (
                            <Text
                              style={[
                                styles.friendTimeText,
                                hasUnread && styles.friendTimeTextUnread,
                              ]}
                              numberOfLines={1}
                            >
                              {formatChatTime(lastTimestamp)}
                            </Text>
                          )}
                        </View>

                        {/* Bottom row: Clean Message Snippet + WhatsApp Unread Count Badge */}
                        <View style={styles.friendBottomRow}>
                          <Text
                            style={[
                              styles.friendStatusSubtext,
                              hasUnread && styles.friendStatusSubtextUnread,
                            ]}
                            numberOfLines={1}
                          >
                            {lastMessage
                              ? lastMessage
                              : isOnline
                                ? 'Online • Ready to chat'
                                : 'Offline'}
                          </Text>

                          {hasUnread && (
                            <View style={styles.unreadCounterBadge}>
                              <Text style={styles.unreadCounterText}>
                                {unreadCount > 99 ? '99+' : unreadCount}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={styles.emptyBox}>
                <Ionicons name="people-outline" size={40} color={colors.FILM_GOLD} />
                <Text style={styles.emptyTitle}>No Friends Added Yet</Text>
                <Text style={styles.emptySub}>
                  Connect with crew members to stream movies in real-time sync!
                </Text>
                <TouchableOpacity
                  style={styles.emptyAddBtn}
                  onPress={openAddCrewMemberSheet}
                  activeOpacity={0.82}
                >
                  <MaterialIcons name="person-add" size={16} color="#FFF" style={{ marginRight: 6 }} />
                  <Text style={styles.emptyAddBtnText}>Add Crew Member</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}


        {/* TAB 2: FRIEND REQUESTS */}
        {activeTab === 'requests' && (
          friendRequests.length > 0 ? (
            friendRequests.map((item, index) => {
              const displayName = item?.username || (item?.email ? item.email.split('@')[0] : 'Crew Member');
              const targetUid = item?.userId || item?.uid || item?.id;
              return (
                <View key={targetUid || `req_${index}`} style={styles.requestRowCard}>
                  <View style={styles.friendRowLeft}>
                    <View
                      style={[
                        styles.friendAvatar,
                        { backgroundColor: generateAvatarColor(displayName) },
                      ]}
                    >
                      <Text style={styles.avatarInitialText}>
                        {(displayName || '?')[0]?.toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.friendNameText} numberOfLines={1}>{displayName}</Text>
                      <Text style={styles.friendStatusSubtext} numberOfLines={1}>
                        {item?.email ? item.email : 'Wants to join your crew'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.requestBtnRow}>
                    <TouchableOpacity
                      style={styles.acceptRequestBtn}
                      onPress={() => acceptFriendRequest(targetUid)}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons name="check" size={16} color="#FFF" />
                      <Text style={styles.acceptRequestText}>Accept</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.declineRequestBtn}
                      onPress={() => declineFriendRequest(targetUid)}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons name="close" size={16} color={colors.DELETE_RED_COLOR} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
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
            sentRequests.map((item, index) => {
              const displayName = item?.username || (item?.email ? item.email.split('@')[0] : 'Crew Member');
              const targetUid = item?.userId || item?.uid || item?.id;
              return (
                <View key={targetUid || `sent_${index}`} style={styles.requestRowCard}>
                  <View style={styles.friendRowLeft}>
                    <View
                      style={[
                        styles.friendAvatar,
                        { backgroundColor: generateAvatarColor(displayName) },
                      ]}
                    >
                      <Text style={styles.avatarInitialText}>
                        {(displayName || '?')[0]?.toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.friendNameText} numberOfLines={1}>{displayName}</Text>
                      <Text style={styles.friendStatusSubtext} numberOfLines={1}>
                        {item?.email ? `${item.email} • Pending` : 'Request Pending...'}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.cancelRequestBtn}
                    onPress={() => cancelFriendRequest(targetUid)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.cancelRequestText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              );
            })
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
    paddingBottom: 10,
    backgroundColor: 'rgba(8, 8, 16, 0.88)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  headerLogoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.TITLE_COLOR,
    letterSpacing: 1.5,
  },
  headerSubtitle: {
    fontSize: 10,
    color: colors.SUB_TITLE_COLOR,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addFriendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    backgroundColor: '#0E0E18',
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
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
    borderRadius: 10,
    backgroundColor: '#0E0E18',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
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

  // ── Self Chat Card ────────────────
  selfChatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.SURFACE_ELEVATED,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.28)',
  },
  selfChatAvatarWrap: {
    position: 'relative',
  },
  selfChatAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selfChatBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: colors.PURPLE_ACCENT,
    width: 16,
    height: 16,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selfTag: {
    backgroundColor: 'rgba(124, 58, 237, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    marginLeft: 6,
  },
  selfTagText: {
    color: colors.PURPLE_ACCENT,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  selfChatSubtext: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    marginTop: 2,
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
    borderRadius: 16,
    backgroundColor: colors.ACCEPT_GREEN,
  },
  friendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
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
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.SURFACE_COLOR,
  },

  friendRowCardUnread: {
    borderColor: 'rgba(0, 200, 83, 0.35)',
    borderLeftWidth: 3.5,
    borderLeftColor: colors.ACCEPT_GREEN,
    backgroundColor: 'rgba(0, 200, 83, 0.04)',
  },
  friendRowText: {
    flex: 1,
    justifyContent: 'center',
  },
  friendTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  friendNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  friendNameText: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  friendNameTextUnread: {
    fontWeight: '800',
    color: '#FFF',
  },
  friendTimeText: {
    fontSize: 11,
    color: colors.MUTED_COLOR,
    fontWeight: '500',
  },
  friendTimeTextUnread: {
    color: colors.ACCEPT_GREEN,
    fontWeight: '700',
  },
  friendBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  friendStatusSubtext: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11.5,
    flex: 1,
  },
  friendStatusSubtextUnread: {
    color: colors.TITLE_COLOR,
    fontWeight: '700',
  },
  unreadCounterBadge: {
    backgroundColor: colors.ACCEPT_GREEN,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  unreadCounterText: {
    color: '#080810',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 14,
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
    borderRadius: 10,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
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
    borderRadius: 10,
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
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.PRIMARY_COLOR,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    marginTop: 14,
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyAddBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

export default FriendsScreen;