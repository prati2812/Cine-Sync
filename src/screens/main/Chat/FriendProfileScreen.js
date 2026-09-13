import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Animated,
  Easing,
  Alert,
  Platform,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import colors from '../../../theme/Colors';
import { auth, database } from '../../../config/firebase';
import { showCineAlert } from '../../../components/CineAlert';

// ─────────────────────────────────────────────────────────────
//  Pulsing Online Glow Ring (centered around 84x84 avatar)
// ─────────────────────────────────────────────────────────────
const OnlineRing = () => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacAnim = useRef(new Animated.Value(0.75)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scaleAnim, {
            toValue: 1.18,
            duration: 1200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(opacAnim, {
            toValue: 0,
            duration: 1200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scaleAnim, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(opacAnim, { toValue: 0.75, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      style={[
        styles.onlineRing,
        { transform: [{ scale: scaleAnim }], opacity: opacAnim },
      ]}
    />
  );
};

// ─────────────────────────────────────────────────────────────
//  FriendProfileScreen
// ─────────────────────────────────────────────────────────────
const FriendProfileScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const safeTopPadding =
    Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 12) + 8;

  // Initial params passed from navigation
  const { username: initialUsername, userId: initialUserId, avatar: initialAvatar, status: initialStatus } =
    route?.params || {};

  // ── Live Profile Data from Firebase RTDB ──────────────────
  const [profileData, setProfileData] = useState(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [recentRooms, setRecentRooms] = useState([]);

  useEffect(() => {
    let userRef = null;

    const setupUserListener = async () => {
      const db = database();
      let resolvedUid = initialUserId;

      // If userId wasn't passed directly, find by username
      if (!resolvedUid && initialUsername) {
        try {
          const snapshot = await db
            .ref('users')
            .orderByChild('username')
            .equalTo(initialUsername)
            .once('value');
          const val = snapshot.val();
          if (val) {
            const firstKey = Object.keys(val)[0];
            resolvedUid = firstKey;
          }
        } catch (err) {
          console.warn('[FriendProfile] Error querying user by username:', err);
        }
      }

      if (resolvedUid) {
        userRef = db.ref(`users/${resolvedUid}`);
        userRef.on('value', snapshot => {
          const val = snapshot.val();
          if (val) {
            setProfileData({
              ...val,
              userId: val.userId || resolvedUid,
            });
          }
          setIsLoadingProfile(false);
        });
      } else {
        setIsLoadingProfile(false);
      }
    };

    setupUserListener();

    return () => {
      if (userRef) userRef.off('value');
    };
  }, [initialUserId, initialUsername]);

  // Derived user information
  const targetUserId = profileData?.userId || initialUserId;
  const displayUsername = profileData?.username || initialUsername || 'Unknown User';
  const displayEmail = profileData?.email || '';
  const displayAvatar = profileData?.avatar || initialAvatar;
  const userStatusObj = profileData?.status;
  const isOnline =
    userStatusObj?.state === 'online' ||
    userStatusObj === 'online' ||
    initialStatus === 'online' ||
    initialStatus?.state === 'online';

  const initial = (displayUsername || '?')[0]?.toUpperCase();

  // Dynamic "Member since" text from createdAt timestamp
  const memberSinceText = useMemo(() => {
    const rawDate = profileData?.createdAt;
    if (!rawDate) return 'Active Member';
    try {
      const d = new Date(rawDate);
      if (isNaN(d.getTime())) return 'Active Member';
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `Member since ${months[d.getMonth()]} ${d.getFullYear()}`;
    } catch {
      return 'Active Member';
    }
  }, [profileData?.createdAt]);

  // ── Recent Rooms (Live from Firebase) ─────────────────────
  useEffect(() => {
    if (!targetUserId) return;
    const currentUser = auth().currentUser;
    const roomsRef = database().ref('rooms');
    const onValue = snapshot => {
      const val = snapshot.val();
      if (!val) {
        setRecentRooms([]);
        return;
      }
      const participated = Object.values(val).filter(r => {
        if (!r) return false;
        const isTargetHost = r.creator?.uid === targetUserId || r.creator?.userId === targetUserId;
        const isTargetParticipant =
          (r.participants && typeof r.participants === 'object' && Object.keys(r.participants).includes(targetUserId)) ||
          (Array.isArray(r.participants) && profileData?.email && r.participants.includes(profileData.email));

        if (!isTargetHost && !isTargetParticipant) return false;

        // Privacy rule: If room is private, only show if visiting user is host or invited participant
        if (r.isPrivate) {
          const isVisitorHost = r.creator?.uid === currentUser?.uid || r.creator?.email === currentUser?.email;
          const isVisitorParticipant =
            (Array.isArray(r.participants) && currentUser?.email && r.participants.includes(currentUser.email)) ||
            (r.participants && typeof r.participants === 'object' && currentUser?.uid && Object.keys(r.participants).includes(currentUser.uid));
          return isVisitorHost || isVisitorParticipant;
        }

        return true;
      });
      setRecentRooms(participated.slice(0, 3));
    };
    roomsRef.on('value', onValue);
    return () => roomsRef.off('value', onValue);
  }, [targetUserId, profileData?.email]);

  // ── Actions ───────────────────────────────────────────────
  const handleMessage = () => {
    navigation.navigate('Chat', {
      username: displayUsername,
      userId: targetUserId,
      avatar: displayAvatar,
    });
  };

  const handleAudioCall = () => {
    navigation.navigate('Chat', {
      username: displayUsername,
      userId: targetUserId,
      avatar: displayAvatar,
      autoCall: true,
    });
  };

  // Watch Party / Room Invite
  const handleInvite = async () => {
    const currentUser = auth().currentUser;
    if (!currentUser) return;
    try {
      const snapshot = await database().ref('rooms').once('value');
      const val = snapshot.val();
      if (val) {
        // Collect rooms created by currentUser
        const myRooms = Object.values(val).filter(
          r => r && (r.creator?.email === currentUser?.email || r.creator?.uid === currentUser?.uid)
        );

        // Participated rooms where user is participant or host
        const participatedRooms = Object.values(val).filter(r => {
          if (!r || !r.name) return false;
          if (r.participants && typeof r.participants === 'object') {
            return Object.keys(r.participants).includes(currentUser.uid);
          }
          return false;
        });

        // Combine unique rooms
        const combined = [...myRooms];
        participatedRooms.forEach(pr => {
          if (!combined.some(r => r.roomId === pr.roomId)) {
            combined.push(pr);
          }
        });

        const availableRooms = combined.length > 0 ? combined : Object.values(val).filter(r => r && r.name);

        // Scenario 1: Exactly 1 room -> show single ticket pass
        if (availableRooms.length === 1) {
          const targetRoom = availableRooms[0];
          showCineAlert({
            type: 'invite',
            title: 'Watch Party VIP Pass',
            message: `Dispatch real-time synchronized invitation to ${displayUsername}`,
            roomTicket: {
              name: targetRoom.name,
              roomId: targetRoom.roomId,
              isStreaming: targetRoom.isStreaming,
              streamUrl: targetRoom.streamUrl,
              thumbnail: targetRoom.thumbnail,
              scheduledDate: targetRoom.scheduledDate,
              isScheduled: targetRoom.isScheduled,
            },
            confirmText: 'Send Invite',
            cancelText: 'Dismiss',
            onConfirm: () => {
              navigation.navigate('Chat', {
                username: displayUsername,
                userId: targetUserId,
                avatar: displayAvatar,
                autoSendInvite: targetRoom,
              });
            },
          });
          return;
        }

        // Scenario 2: Multiple rooms -> open interactive room selector model
        if (availableRooms.length > 1) {
          showCineAlert({
            type: 'invite',
            title: 'Select Watch Party Room',
            message: `Choose which room to invite ${displayUsername} to:`,
            roomList: availableRooms,
            confirmText: 'Send Invite',
            cancelText: 'Dismiss',
            onConfirm: (selectedRoom) => {
              const target = selectedRoom || availableRooms[0];
              navigation.navigate('Chat', {
                username: displayUsername,
                userId: targetUserId,
                avatar: displayAvatar,
                autoSendInvite: target,
              });
            },
          });
          return;
        }
      }

      // If no rooms exist, offer to create a room
      showCineAlert({
        type: 'action',
        icon: 'video-camera-front',
        title: 'No Active Watch Room',
        message: `You don't have an active watch room right now. Would you like to create one to watch together with ${displayUsername}?`,
        confirmText: 'Create Room',
        cancelText: 'Dismiss',
        onConfirm: () => navigation.navigate('CreateRoom'),
      });
    } catch (e) {
      console.error('Error handling watch party invite:', e);
    }
  };

  const handleRemoveFriend = () => {
    showCineAlert({
      type: 'danger',
      icon: 'person-remove',
      title: 'Remove from Crew?',
      message: `${displayUsername} will lose instant watch party invitations, synchronized playback permissions, and private room chats.`,
      confirmText: 'Remove',
      cancelText: 'Cancel & Keep',
      onConfirm: async () => {
        try {
          const currentUser = auth().currentUser;
          if (!currentUser || !targetUserId) return;
          await database().ref(`friends/${currentUser.uid}/${targetUserId}`).remove();
          await database().ref(`friends/${targetUserId}/${currentUser.uid}`).remove();
          navigation.goBack();
        } catch (e) {
          showCineAlert({
            type: 'danger',
            title: 'Error',
            message: 'Failed to remove friend. Please try again.',
            confirmText: 'OK',
          });
        }
      },
    });
  };

  return (
    <View style={styles.root}>
      <StatusBar
        backgroundColor={colors.BACKGROUND_COLOR}
        barStyle="light-content"
        translucent
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HERO SECTION: Smooth Ambient Glow matching LoginScreen ── */}
        <View style={[styles.hero, { paddingTop: safeTopPadding }]}>
          {/* Authentic ambient gradient like LoginScreen */}
          <LinearGradient
            colors={['rgba(124, 58, 237, 0.22)', 'rgba(0, 122, 255, 0.10)', 'transparent']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />

          {/* Top Navigation Bar */}
          <View style={styles.heroNav}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.8}
            >
              <MaterialIcons name="arrow-back-ios-new" size={18} color={colors.TITLE_COLOR} />
            </TouchableOpacity>

            <View style={styles.heroNavRight}>
              <View style={styles.crewMemberBadge}>
                <Text style={styles.crewMemberText}>Crew Member</Text>
              </View>
              <TouchableOpacity
                style={styles.moreBtn}
                activeOpacity={0.8}
                onPress={handleRemoveFriend}
              >
                <MaterialIcons name="more-horiz" size={22} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Avatar, Username & Online Status */}
          <View style={styles.heroCenter}>
            {/* 84x84 Avatar with firmly anchored micro-badge indicator */}
            <View style={styles.avatarWrapper}>
              {isOnline && <OnlineRing />}
              <LinearGradient
                colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT, colors.CYAN_ACCENT]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatarGradientRing}
              >
                <View style={styles.avatarInner}>
                  {displayAvatar ? (
                    <Image source={{ uri: displayAvatar }} style={styles.avatarImage} />
                  ) : (
                    <Text style={styles.avatarInitial}>{initial}</Text>
                  )}
                </View>
              </LinearGradient>

              {/* Online micro-badge indicator firmly positioned on bottom-right avatar border */}
              <View style={styles.onlineMicroOuter}>
                <View
                  style={[
                    styles.onlineMicroDot,
                    {
                      backgroundColor: isOnline ? colors.ACCEPT_GREEN : colors.MUTED_COLOR,
                    },
                  ]}
                />
              </View>
            </View>

            {/* Username */}
            <View style={styles.nameRow}>
              <Text style={styles.usernameText} numberOfLines={1}>
                {displayUsername}
              </Text>
              <MaterialIcons
                name="verified"
                size={18}
                color={colors.PRIMARY_COLOR}
                style={{ marginLeft: 5 }}
              />
            </View>

            {/* Handle / Email */}
            <Text style={styles.handleText} numberOfLines={1}>
              @{displayUsername.toLowerCase().replace(/\s/g, '_')}
              {displayEmail ? ` · ${displayEmail}` : ''}
            </Text>

            {/* Status Pill Indicator */}
            <View style={styles.statusPill}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isOnline ? colors.ACCEPT_GREEN : colors.MUTED_COLOR },
                ]}
              />
              <Text style={styles.statusPillText}>
                {isOnline ? '🟢 Online · Ready to watch' : 'Offline'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── MAIN CONTENT ─────────────────────────────────── */}
        <View style={styles.body}>

          {/* ── 3 Primary Action Buttons ── */}
          <View style={styles.ctaRow}>
            {/* 1. Message */}
            <TouchableOpacity
              style={styles.ctaBtn}
              onPress={handleMessage}
              activeOpacity={0.82}
            >
              <LinearGradient
                colors={[colors.PRIMARY_COLOR, '#0051B3']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.ctaBtnGradient}
              >
                <MaterialIcons name="chat-bubble" size={22} color="#FFF" />
                <Text style={styles.ctaBtnLabel}>Message</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* 2. Audio Call */}
            <TouchableOpacity
              style={styles.ctaBtn}
              onPress={handleAudioCall}
              activeOpacity={0.82}
            >
              <LinearGradient
                colors={[colors.CYAN_ACCENT, '#0891B2']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.ctaBtnGradient}
              >
                <MaterialIcons name="call" size={22} color="#FFF" />
                <Text style={styles.ctaBtnLabel}>Audio Call</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* 3. Watch Party Invite */}
            <TouchableOpacity
              style={styles.ctaBtn}
              onPress={handleInvite}
              activeOpacity={0.82}
            >
              <LinearGradient
                colors={[colors.PURPLE_ACCENT, '#6D28D9']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.ctaBtnGradient}
              >
                <MaterialIcons name="confirmation-number" size={22} color="#FFF" />
                <Text style={styles.ctaBtnLabel}>Invite</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* ── Stats Row ── */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <MaterialIcons name="group" size={17} color={colors.PURPLE_ACCENT} />
              <Text style={styles.statText}>
                {recentRooms.length} {recentRooms.length === 1 ? 'mutual room' : 'mutual rooms'}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <MaterialIcons name="event-available" size={17} color={colors.CYAN_ACCENT} />
              <Text style={styles.statText}>{memberSinceText}</Text>
            </View>
          </View>

          {/* ── Recent Activity ── */}
          <View style={styles.activitySection}>
            <View style={styles.activityHeader}>
              <View style={styles.activityTitleRow}>
                <MaterialIcons name="movie" size={17} color={colors.PRIMARY_COLOR} style={{ marginRight: 5 }} />
                <Text style={styles.activityTitle}>RECENT ACTIVITY</Text>
              </View>
              <Text style={styles.activitySubtitle}>Last 3 Rooms</Text>
            </View>

            {recentRooms.length > 0 ? (
              recentRooms.map((room, idx) => (
                <RoomCard key={room.roomId || idx} room={room} navigation={navigation} />
              ))
            ) : (
              <PlaceholderRoomCard
                title="No recent rooms"
                sub="This user hasn't joined any watch rooms yet"
                iconName="theaters"
                iconColor={colors.MUTED_COLOR}
              />
            )}
          </View>

          {/* ── Danger Zone ── */}
          <View style={styles.dangerZone}>
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={handleRemoveFriend}
              activeOpacity={0.8}
            >
              <MaterialIcons name="person-remove" size={16} color={colors.DELETE_RED_COLOR} style={{ marginRight: 6 }} />
              <Text style={styles.removeBtnText}>Remove from Crew</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────
//  Room Card (live data)
// ─────────────────────────────────────────────────────────────
const RoomCard = ({ room, navigation }) => {
  const isLive = !!room?.isStreaming;
  const title = room?.name || 'Sync Room';
  const viewers =
    (room?.participants?.length ||
      (room?.participants ? Object.keys(room.participants).length : 0)) + 1;

  const handleJoin = () => {
    if (isLive) {
      navigation.navigate('Streaming', {
        roomId: room.roomId,
        roomName: room.name,
        streamUrl: room.streamUrl,
      });
    } else {
      navigation.navigate('WaitingScreen', {
        roomId: room.roomId,
        roomName: room.name,
        streamUrl: room.streamUrl,
        isHost: false,
      });
    }
  };

  return (
    <View style={styles.roomCard}>
      <View style={styles.roomCardLeft}>
        <View style={[styles.roomCardIcon, isLive && { borderColor: `${colors.LIVE_RED}50` }]}>
          <MaterialIcons
            name={isLive ? 'play-circle' : 'local-movies'}
            size={22}
            color={isLive ? colors.LIVE_RED : colors.PURPLE_ACCENT}
          />
          {isLive && <View style={styles.liveRedDot} />}
        </View>
        <View style={styles.roomCardMeta}>
          <View style={styles.roomCardTitleRow}>
            <Text style={styles.roomCardTitle} numberOfLines={1}>{title}</Text>
            {isLive && (
              <View style={styles.liveBadge}>
                <Text style={styles.liveBadgeText}>LIVE</Text>
              </View>
            )}
          </View>
          <Text style={styles.roomCardSub}>
            {isLive ? `${viewers} viewers · Room #${String(room.roomId || '').substring(0, 6)}` : 'Completed'}
          </Text>
        </View>
      </View>
      <TouchableOpacity style={styles.joinIconBtn} onPress={handleJoin} activeOpacity={0.8}>
        <MaterialIcons name="login" size={18} color={isLive ? colors.PRIMARY_COLOR : 'rgba(255,255,255,0.3)'} />
      </TouchableOpacity>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────
//  Placeholder Room Card
// ─────────────────────────────────────────────────────────────
const PlaceholderRoomCard = ({ title, sub, iconName, iconColor }) => (
  <View style={[styles.roomCard, { opacity: 0.6 }]}>
    <View style={styles.roomCardLeft}>
      <View style={styles.roomCardIcon}>
        <MaterialIcons name={iconName} size={22} color={iconColor} />
      </View>
      <View>
        <Text style={styles.roomCardTitle}>{title}</Text>
        <Text style={styles.roomCardSub}>{sub}</Text>
      </View>
    </View>
  </View>
);

// ─────────────────────────────────────────────────────────────
//  Styles
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },

  // ── Hero Section (Background matching LoginScreen) ────────
  hero: {
    position: 'relative',
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    backgroundColor: colors.BACKGROUND_COLOR,
  },
  heroNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    zIndex: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  heroNavRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  crewMemberBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: `${colors.CYAN_ACCENT}18`,
    borderWidth: 1,
    borderColor: `${colors.CYAN_ACCENT}33`,
  },
  crewMemberText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.CYAN_ACCENT,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  moreBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCenter: {
    alignItems: 'center',
    marginTop: 6,
    zIndex: 10,
  },

  // ── Squircle Avatar & Online Dot ─────────────────────────
  avatarWrapper: {
    position: 'relative',
    marginBottom: 14,
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineRing: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: colors.ACCEPT_GREEN,
    shadowColor: colors.ACCEPT_GREEN,
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  avatarGradientRing: {
    width: 84,
    height: 84,
    borderRadius: 22,
    padding: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: '100%',
    height: '100%',
    borderRadius: 19,
    backgroundColor: '#131322',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 19,
  },
  avatarInitial: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.TITLE_COLOR,
    letterSpacing: 1,
  },
  onlineMicroOuter: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 7,
    backgroundColor: colors.BACKGROUND_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.BACKGROUND_COLOR,
    zIndex: 10,
    elevation: 4,
  },
  onlineMicroDot: {
    width: 12,
    height: 12,
    borderRadius: 4,
  },

  // ── Name & Status ─────────────────────────────────────────
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  usernameText: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.TITLE_COLOR,
    letterSpacing: -0.3,
  },
  handleText: {
    fontSize: 12,
    color: colors.SUB_TITLE_COLOR,
    fontWeight: '500',
    marginBottom: 10,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: `${colors.CYAN_ACCENT}18`,
    borderWidth: 1,
    borderColor: `${colors.CYAN_ACCENT}30`,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.CYAN_ACCENT,
    letterSpacing: 0.3,
  },

  // ── Body ──────────────────────────────────────────────────
  body: {
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 20,
  },

  // ── CTA Buttons ───────────────────────────────────────────
  ctaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  ctaBtn: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  ctaBtnGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    gap: 4,
  },
  ctaBtnLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
    marginTop: 2,
  },

  // ── Stats Row ─────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: 'rgba(22, 22, 37, 0.70)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    fontSize: 12,
    color: colors.SUB_TITLE_COLOR,
    fontWeight: '500',
  },
  statDivider: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },

  // ── Recent Activity ───────────────────────────────────────
  activitySection: {
    gap: 10,
  },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  activityTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activityTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.9)',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  activitySubtitle: {
    fontSize: 11,
    color: colors.SUB_TITLE_COLOR,
    fontWeight: '500',
  },

  // ── Room Card ─────────────────────────────────────────────
  roomCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.SURFACE_COLOR,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  roomCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  roomCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  liveRedDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.LIVE_RED,
  },
  roomCardMeta: {
    flex: 1,
  },
  roomCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  roomCardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.TITLE_COLOR,
    flex: 1,
  },
  liveBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: `${colors.LIVE_RED}30`,
    borderWidth: 1,
    borderColor: `${colors.LIVE_RED}50`,
  },
  liveBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.LIVE_RED,
    letterSpacing: 0.5,
  },
  roomCardSub: {
    fontSize: 11,
    color: colors.SUB_TITLE_COLOR,
    marginTop: 2,
  },
  joinIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Danger Zone ───────────────────────────────────────────
  dangerZone: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  removeBtnText: {
    fontSize: 12,
    color: colors.DELETE_RED_COLOR,
    fontWeight: '600',
  },
});

export default FriendProfileScreen;
