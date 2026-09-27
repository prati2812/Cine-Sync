import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  StatusBar,
  Share,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import LinearGradient from 'react-native-linear-gradient';
import { auth, database } from '../../../config/firebase';
import { showCineAlert } from '../../../components/CineAlert';
import { subscribeWatchlist } from '../../../services/video/WatchlistService';
import { getAllContinueWatching } from '../../../services/video/CineSyncEngine';
import colors from '../../../theme/Colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function getMonogram(name, email) {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (email && email.trim()) {
    return email.slice(0, 2).toUpperCase();
  }
  return 'CS';
}

const UserProfileScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const safeTopPadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 12
  ) + 8;

  // Current User & Profile Data
  const currentUser = auth().currentUser;
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Dynamic Metrics
  const [hostedRoomsCount, setHostedRoomsCount] = useState(0);
  const [joinedRoomsCount, setJoinedRoomsCount] = useState(0);
  const [watchlistItems, setWatchlistItems] = useState([]);
  const [continueWatchingItems, setContinueWatchingItems] = useState([]);
  const [recentContinueItem, setRecentContinueItem] = useState(null);

  // Edit Profile Modal
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);

  // ──────────────────────────────────────────────────────────────
  // 1. Fetch User Data & Rooms Metrics
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    const userRef = database().ref(`users/${currentUser.uid}`);
    const userSub = userRef.on('value', snapshot => {
      const data = snapshot.val();
      if (data) {
        setUserData(data);
        setEditUsername(data.username || currentUser.displayName || '');
      } else {
        setEditUsername(currentUser.displayName || currentUser.email?.split('@')[0] || '');
      }
      setLoading(false);
    });

    // Count user hosted rooms
    const userRoomsRef = database().ref(`user_rooms/${currentUser.uid}`);
    const userRoomsSub = userRoomsRef.on('value', snapshot => {
      const val = snapshot.val() || {};
      const count = Object.keys(val).length;
      setHostedRoomsCount(count);
    });

    // Count joined party rooms
    const allRoomsRef = database().ref('rooms').limitToLast(50);
    const allRoomsSub = allRoomsRef.on('value', snapshot => {
      const roomsObj = snapshot.val() || {};
      let joinedCount = 0;
      Object.values(roomsObj).forEach(room => {
        if (!room) return;
        const isParticipant =
          room.participants &&
          (room.participants[currentUser.uid] ||
            (Array.isArray(room.participants) &&
              room.participants.includes(currentUser.email)));
        if (isParticipant && room.creator?.uid !== currentUser.uid) {
          joinedCount += 1;
        }
      });
      setJoinedRoomsCount(joinedCount);
    });

    return () => {
      userRef.off('value', userSub);
      userRoomsRef.off('value', userRoomsSub);
      allRoomsRef.off('value', allRoomsSub);
    };
  }, [currentUser]);

  // ──────────────────────────────────────────────────────────────
  // 2. Subscribe to Watchlist & Continue Watching (Dynamic Data)
  // ──────────────────────────────────────────────────────────────
  const loadContinueWatchingData = useCallback(async () => {
    try {
      const continueItems = await getAllContinueWatching();
      setContinueWatchingItems(continueItems || []);
      if (continueItems && continueItems.length > 0) {
        setRecentContinueItem(continueItems[0]);
      } else {
        setRecentContinueItem(null);
      }
    } catch (e) {
      // silent catch
    }
  }, []);

  useEffect(() => {
    const unsubWatchlist = subscribeWatchlist(items => {
      setWatchlistItems(items || []);
    });

    loadContinueWatchingData();

    return () => {
      unsubWatchlist();
    };
  }, [loadContinueWatchingData]);

  // Refresh dynamic watch history when screen comes into focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadContinueWatchingData();
    });
    return unsubscribe;
  }, [navigation, loadContinueWatchingData]);

  // ──────────────────────────────────────────────────────────────
  // 3. User Identity & Formatted Values
  // ──────────────────────────────────────────────────────────────
  const usernameDisplay =
    userData?.username ||
    currentUser?.displayName ||
    currentUser?.email?.split('@')[0] ||
    'Cinephile';

  const emailDisplay = userData?.email || currentUser?.email || '';
  const monogram = getMonogram(usernameDisplay, emailDisplay);

  // Dynamic Joined Date string from original user account record
  const joinedDateStr = useMemo(() => {
    const rawDate = userData?.createdAt || currentUser?.metadata?.creationTime;
    if (!rawDate) return null;
    try {
      const d = new Date(rawDate);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return null;
    }
  }, [userData?.createdAt, currentUser?.metadata?.creationTime]);

  // Dynamically computed total stream duration from real watch sessions
  const dynamicStreamedTime = useMemo(() => {
    if (!continueWatchingItems || continueWatchingItems.length === 0) return '0m';
    const totalSeconds = continueWatchingItems.reduce((acc, it) => acc + (it.position || 0), 0);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes > 0 ? `${minutes}m` : ''}`.trim();
    }
    if (minutes > 0) {
      return `${minutes}m`;
    }
    return `${Math.round(totalSeconds)}s`;
  }, [continueWatchingItems]);

  // ──────────────────────────────────────────────────────────────
  // 4. Actions: Share, Edit, Resume, Sign Out
  // ──────────────────────────────────────────────────────────────
  const handleShareProfile = useCallback(async () => {
    const displayName =
      userData?.username ||
      currentUser?.displayName ||
      currentUser?.email?.split('@')[0] ||
      'Cinephile';
    try {
      await Share.share({
        title: `Cine-Sync Profile: ${displayName}`,
        message: `Watch movies in 4K Sync with me on Cine-Sync!\nHost: @${displayName}\nDownload Cine-Sync to join my private screening lounges!`,
      });
    } catch (err) {
      console.log('Share profile error:', err);
    }
  }, [userData, currentUser]);

  const handleOpenEditModal = () => {
    setEditUsername(
      userData?.username ||
        currentUser?.displayName ||
        currentUser?.email?.split('@')[0] ||
        ''
    );
    setIsEditModalVisible(true);
  };

  const handleSaveUsername = async () => {
    const trimmed = editUsername.trim();
    if (!trimmed) {
      showCineAlert({
        type: 'action',
        icon: 'error-outline',
        title: 'Invalid Name',
        message: 'Username cannot be blank.',
        confirmText: 'OK',
      });
      return;
    }

    try {
      setIsUpdatingUsername(true);
      if (currentUser) {
        await currentUser.updateProfile({ displayName: trimmed });
        await database().ref(`users/${currentUser.uid}`).update({
          username: trimmed,
        });
      }
      setIsEditModalVisible(false);
      showCineAlert({
        type: 'success',
        icon: 'check-circle',
        title: 'Profile Updated',
        message: `Your cinema username is now "@${trimmed}".`,
        confirmText: 'Great',
      });
    } catch (err) {
      showCineAlert({
        type: 'danger',
        icon: 'error-outline',
        title: 'Update Failed',
        message: err.message || 'Could not update username.',
        confirmText: 'OK',
      });
    } finally {
      setIsUpdatingUsername(false);
    }
  };

  const handleResumePlayback = () => {
    if (recentContinueItem) {
      const streamUrl =
        recentContinueItem.mediaKey && recentContinueItem.mediaKey.startsWith('http')
          ? recentContinueItem.mediaKey
          : null;
      const roomId =
        recentContinueItem.roomId ||
        (recentContinueItem.isSolo ? `solo_${Date.now()}` : recentContinueItem.mediaKey);

      navigation.navigate('Streaming', {
        roomId,
        streamUrl,
        isSolo: recentContinueItem.isSolo === true,
        roomName: recentContinueItem.title || 'Resumed Screening',
        initialPosition: recentContinueItem.position || 0,
        initialThumbnail: recentContinueItem.thumbnail || null,
        duration: recentContinueItem.duration || 0,
      });
    } else {
      navigation.navigate('Library');
    }
  };

  const handleSignOut = () => {
    showCineAlert({
      presentationStyle: 'bottomSheet',
      type: 'danger',
      icon: 'logout',
      title: 'Sign Out?',
      message: 'Are you sure you want to sign out of your Cine-Sync screening account?',
      cancelText: 'Stay Signed In',
      confirmText: 'Sign Out',
      onConfirm: async () => {
        try {
          await auth().signOut();
        } catch (error) {
          console.error(error);
        }
      },
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={colors.PRIMARY_COLOR} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Atmospheric Ambient Glow Gradient */}
      <LinearGradient
        colors={['rgba(124, 58, 237, 0.22)', 'rgba(0, 122, 255, 0.08)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.ambientTopGlow}
        pointerEvents="none"
      />

      {/* ── 1. HEADER BAR ── */}
      <View style={[styles.headerBar, { paddingTop: safeTopPadding }]}>
        {/* Brand Left */}
        <View style={styles.brandRow}>
          <LinearGradient
            colors={[colors.PRIMARY_COLOR_DARK, colors.PRIMARY_COLOR, colors.CYAN_ACCENT]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logoSquircle}
          >
            <MaterialIcons name="movie" size={19} color={colors.TITLE_COLOR} />
          </LinearGradient>
          <View style={styles.brandTextCol}>
            <View style={styles.brandTitleWrap}>
              <Text style={styles.brandTitleCine}>CINE </Text>
              <Text style={styles.brandTitleSync}>SYNC</Text>
            </View>
            <Text style={styles.brandSubtitle}>CINEMA LOUNGE</Text>
          </View>
        </View>

        {/* Action Buttons Right */}
        <View style={styles.headerActionsRow}>
          <TouchableOpacity
            style={styles.headerSquircleBtn}
            onPress={handleShareProfile}
            activeOpacity={0.8}
          >
            <MaterialIcons name="qr-code-2" size={19} color={colors.TITLE_COLOR} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerSquircleBtn}
            onPress={handleOpenEditModal}
            activeOpacity={0.8}
          >
            <MaterialIcons name="edit" size={18} color={colors.TITLE_COLOR} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── SCROLLABLE MAIN CONTENT ── */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 2. HERO PROFILE SECTION ── */}
        <View style={styles.heroSection}>
          {/* 96x96px Squircle Avatar (No circular frames) */}
          <View style={styles.avatarOuterWrapper}>
            <LinearGradient
              colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT, colors.CYAN_ACCENT]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatarGradientBorder}
            >
              <View style={styles.avatarInnerCore}>
                {/* Internal Ambient Sheen */}
                <LinearGradient
                  colors={['rgba(0, 122, 255, 0.20)', 'transparent', 'rgba(124, 58, 237, 0.25)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
                <Text style={styles.avatarMonogramText}>{monogram}</Text>
                {/* Subtle Ambient Film Watermark */}
                <MaterialIcons
                  name="videocam"
                  size={46}
                  color="rgba(255, 255, 255, 0.05)"
                  style={styles.avatarWatermark}
                />
              </View>
            </LinearGradient>

            {/* Squircle Online Green Status Dot */}
            <View style={styles.statusDotWrapper}>
              <View style={styles.statusDotInner} />
            </View>
          </View>

          {/* Identity Labels */}
          <View style={styles.identityWrapper}>
            <View style={styles.nameRow}>
              <Text style={styles.usernameText} numberOfLines={1}>
                {usernameDisplay}
              </Text>
              <MaterialIcons name="verified" size={17} color={colors.CYAN_ACCENT} />
            </View>
            {emailDisplay ? (
              <Text style={styles.emailText} numberOfLines={1}>
                {emailDisplay}
              </Text>
            ) : null}
          </View>

          {/* Dynamic Joined Date Badge */}
          {joinedDateStr ? (
            <View style={styles.joinedBadgePill}>
              <MaterialIcons name="calendar-today" size={13} color={colors.FILM_GOLD} />
              <Text style={styles.joinedBadgeText}>Joined {joinedDateStr}</Text>
            </View>
          ) : null}
        </View>

        {/* ── 3. CINEMA STATS MATRIX (2x2 Grid of Squircle Cards) ── */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>SCREENING METRICS</Text>
            <Text style={styles.sectionMetaLink}>All Time</Text>
          </View>

          <View style={styles.statsGrid}>
            {/* Card 1: Rooms Created / Hosted */}
            <View style={styles.statCard}>
              <View
                style={[
                  styles.statIconBox,
                  {
                    backgroundColor: 'rgba(255, 180, 0, 0.10)',
                    borderColor: 'rgba(255, 180, 0, 0.25)',
                  },
                ]}
              >
                <MaterialIcons name="movie-creation" size={20} color={colors.FILM_GOLD} />
              </View>
              <View style={styles.statTextCol}>
                <Text style={styles.statValue}>{hostedRoomsCount}</Text>
                <Text style={styles.statLabel}>Rooms Created</Text>
              </View>
            </View>

            {/* Card 2: Rooms Joined */}
            <View style={styles.statCard}>
              <View
                style={[
                  styles.statIconBox,
                  {
                    backgroundColor: 'rgba(0, 122, 255, 0.10)',
                    borderColor: 'rgba(0, 122, 255, 0.25)',
                  },
                ]}
              >
                <MaterialIcons name="groups" size={20} color={colors.PRIMARY_COLOR} />
              </View>
              <View style={styles.statTextCol}>
                <Text style={styles.statValue}>{joinedRoomsCount}</Text>
                <Text style={styles.statLabel}>Rooms Joined</Text>
              </View>
            </View>

            {/* Card 3: Watch Later */}
            <View style={styles.statCard}>
              <View
                style={[
                  styles.statIconBox,
                  {
                    backgroundColor: 'rgba(124, 58, 237, 0.10)',
                    borderColor: 'rgba(124, 58, 237, 0.25)',
                  },
                ]}
              >
                <MaterialIcons name="watch-later" size={20} color={colors.PURPLE_ACCENT} />
              </View>
              <View style={styles.statTextCol}>
                <Text style={styles.statValue}>{watchlistItems.length}</Text>
                <Text style={styles.statLabel}>Watch Later</Text>
              </View>
            </View>

            {/* Card 4: Stream Time (Dynamic Duration) */}
            <View style={styles.statCard}>
              <View
                style={[
                  styles.statIconBox,
                  {
                    backgroundColor: 'rgba(6, 182, 212, 0.10)',
                    borderColor: 'rgba(6, 182, 212, 0.25)',
                  },
                ]}
              >
                <MaterialIcons name="schedule" size={20} color={colors.CYAN_ACCENT} />
              </View>
              <View style={styles.statTextCol}>
                <Text style={styles.statValue}>{dynamicStreamedTime}</Text>
                <Text style={styles.statLabel}>Stream Time</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── 4. CINEMA SHORTCUTS RAIL (2-Card Quick Hub) ── */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>CINEMA SHORTCUTS</Text>
          </View>

          <View style={styles.shortcutsGrid}>
            {/* Card A: Watch Later Queue */}
            <TouchableOpacity
              style={styles.shortcutCard}
              onPress={() => navigation.navigate('Library')}
              activeOpacity={0.82}
            >
              <View style={styles.shortcutHeaderRow}>
                <View style={[styles.shortcutIconBox, { backgroundColor: colors.SURFACE_ELEVATED }]}>
                  <MaterialIcons name="video-library" size={16} color={colors.PRIMARY_COLOR} />
                </View>
                <View style={styles.shortcutActionPill}>
                  <MaterialIcons name="play-arrow" size={13} color={colors.CYAN_ACCENT} />
                </View>
              </View>
              <View style={styles.shortcutTextWrap}>
                <Text style={styles.shortcutTitle} numberOfLines={1}>
                  Watch Later Queue
                </Text>
                <View style={styles.shortcutSubRow}>
                  <Text style={styles.shortcutSubText}>
                    {watchlistItems.length} {watchlistItems.length === 1 ? 'item' : 'items'} saved
                  </Text>
                  <View style={styles.shortcutDot} />
                  <Text style={styles.shortcutStatusReady}>
                    {watchlistItems.length > 0 ? 'Ready' : 'Empty'}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* Card B: Playback History */}
            <TouchableOpacity
              style={styles.shortcutCard}
              onPress={handleResumePlayback}
              activeOpacity={0.82}
            >
              <View style={styles.shortcutHeaderRow}>
                <View style={[styles.shortcutIconBox, { backgroundColor: colors.SURFACE_ELEVATED }]}>
                  <MaterialIcons name="history" size={16} color={colors.PURPLE_ACCENT} />
                </View>
                <View style={styles.shortcutAutoBadge}>
                  <Text style={styles.shortcutAutoText}>Auto</Text>
                </View>
              </View>
              <View style={styles.shortcutTextWrap}>
                <Text style={styles.shortcutTitle} numberOfLines={1}>
                  Playback History
                </Text>
                <View style={styles.shortcutSubRow}>
                  <MaterialIcons name="replay" size={12} color={colors.FILM_GOLD} />
                  <Text style={styles.shortcutResumeText} numberOfLines={1}>
                    {recentContinueItem?.title || 'Browse Library'}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 5. PREFERENCES (Settings) ── */}
        <View style={styles.sectionWrap}>
          <View style={styles.groupContainer}>
            <Text style={styles.groupHeaderTitle}>PREFERENCES</Text>
            <View style={styles.groupedCard}>
              <TouchableOpacity
                style={styles.groupedRow}
                onPress={() => navigation.navigate('Settings')}
                activeOpacity={0.75}
              >
                <View style={styles.groupedRowLeft}>
                  <View style={styles.groupedRowIconBox}>
                    <MaterialIcons name="settings" size={18} color={colors.PRIMARY_COLOR} />
                  </View>
                  <Text style={styles.groupedRowLabel}>Settings</Text>
                </View>
                <View style={styles.groupedRowRight}>
                  <MaterialIcons name="chevron-right" size={20} color={colors.SUB_TITLE_COLOR} />
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── 6. BOTTOM DANGER AREA (Sign Out) ── */}
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={handleSignOut}
          activeOpacity={0.82}
        >
          <MaterialIcons name="logout" size={19} color={colors.DELETE_RED_COLOR} />
          <Text style={styles.signOutBtnText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── 7. EDIT USERNAME SQUIRCLE MODAL ── */}
      <Modal
        visible={isEditModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.editCard}>
            <View style={styles.editHeaderRow}>
              <View style={styles.editHeaderLeft}>
                <MaterialIcons name="edit" size={18} color={colors.CYAN_ACCENT} />
                <Text style={styles.editCardTitle}>Edit Cinema Profile</Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsEditModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="close" size={20} color={colors.SUB_TITLE_COLOR} />
              </TouchableOpacity>
            </View>

            <Text style={styles.editCardSub}>
              Choose a public username that friends will see in screening lounges.
            </Text>

            <TextInput
              style={styles.editTextInput}
              value={editUsername}
              onChangeText={setEditUsername}
              placeholder="Enter new username..."
              placeholderTextColor="rgba(255, 255, 255, 0.35)"
              autoCapitalize="none"
              maxLength={24}
            />

            <View style={styles.editActionsRow}>
              <TouchableOpacity
                style={styles.editCancelBtn}
                onPress={() => setIsEditModalVisible(false)}
                activeOpacity={0.75}
              >
                <Text style={styles.editCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.editSaveBtn}
                onPress={handleSaveUsername}
                disabled={isUpdatingUsername}
                activeOpacity={0.85}
              >
                {isUpdatingUsername ? (
                  <ActivityIndicator size="small" color={colors.TITLE_COLOR} />
                ) : (
                  <Text style={styles.editSaveText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

// ──────────────────────────────────────────────────────────────
//  Styles (Strict Cine-Sync Theme Tokens & Squircle Standards)
// ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  ambientTopGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 320,
    zIndex: 0,
  },

  // ── Header Bar ──
  headerBar: {
    paddingHorizontal: 18,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
    zIndex: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoSquircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.20)',
  },
  brandTextCol: {
    justifyContent: 'center',
  },
  brandTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandTitleCine: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.TITLE_COLOR,
    letterSpacing: 1.2,
  },
  brandTitleSync: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.CYAN_ACCENT,
    letterSpacing: 1.2,
  },
  brandSubtitle: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.SUB_TITLE_COLOR,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerSquircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Scroll Content ──
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 90,
    gap: 20,
  },

  // ── 2. Hero Profile Section ──
  heroSection: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 2,
  },
  avatarOuterWrapper: {
    position: 'relative',
    marginBottom: 14,
  },
  avatarGradientBorder: {
    padding: 2.5,
    borderRadius: 20,
    shadowColor: colors.PURPLE_ACCENT,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  avatarInnerCore: {
    width: 92,
    height: 92,
    borderRadius: 18,
    backgroundColor: colors.SURFACE_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  avatarMonogramText: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.TITLE_COLOR,
    letterSpacing: -0.5,
  },
  avatarWatermark: {
    position: 'absolute',
    bottom: -8,
    right: -8,
  },
  statusDotWrapper: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 5,
    backgroundColor: colors.BACKGROUND_COLOR,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDotInner: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.ACCEPT_GREEN,
  },
  identityWrapper: {
    alignItems: 'center',
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  usernameText: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.TITLE_COLOR,
    letterSpacing: -0.2,
  },
  emailText: {
    fontSize: 13,
    color: colors.SUB_TITLE_COLOR,
    fontWeight: '500',
  },
  joinedBadgePill: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 180, 0, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 0, 0.25)',
  },
  joinedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.FILM_GOLD,
    letterSpacing: 0.5,
  },

  // ── Sections & Headers ──
  sectionWrap: {
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.SUB_TITLE_COLOR,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  sectionMetaLink: {
    fontSize: 11,
    color: colors.CYAN_ACCENT,
    fontWeight: '600',
  },

  // ── 3. Stats Matrix ──
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    width: (SCREEN_WIDTH - 36 - 10) / 2,
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  statTextCol: {
    flex: 1,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.TITLE_COLOR,
    lineHeight: 22,
  },
  statLabel: {
    fontSize: 11,
    color: colors.SUB_TITLE_COLOR,
    fontWeight: '600',
  },

  // ── 4. Shortcuts Grid ──
  shortcutsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  shortcutCard: {
    flex: 1,
    height: 94,
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    padding: 12,
    justifyContent: 'space-between',
  },
  shortcutHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shortcutIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  shortcutActionPill: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: 'rgba(6, 182, 212, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutAutoBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  shortcutAutoText: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.7)',
    textTransform: 'uppercase',
  },
  shortcutTextWrap: {
    gap: 2,
  },
  shortcutTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.TITLE_COLOR,
  },
  shortcutSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  shortcutSubText: {
    fontSize: 10.5,
    color: colors.SUB_TITLE_COLOR,
  },
  shortcutDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.CYAN_ACCENT,
  },
  shortcutStatusReady: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.CYAN_ACCENT,
  },
  shortcutResumeText: {
    fontSize: 10.5,
    color: colors.FILM_GOLD,
    fontWeight: '600',
  },

  // ── 5. Grouped Settings Cards ──
  groupContainer: {
    gap: 6,
  },
  groupHeaderTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: colors.SUB_TITLE_COLOR,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    paddingHorizontal: 2,
  },
  groupedCard: {
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    overflow: 'hidden',
  },
  groupedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  groupedRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  groupedRowIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupedRowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.TITLE_COLOR,
    flex: 1,
  },
  groupedRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // ── 6. Sign Out Button ──
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderRadius: 16,
    paddingVertical: 14,
    marginTop: 6,
  },
  signOutBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.DELETE_RED_COLOR,
    letterSpacing: 0.3,
  },

  // ── 7. Edit Profile Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  editCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: 20,
    gap: 14,
  },
  editHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.TITLE_COLOR,
  },
  editCardSub: {
    fontSize: 12.5,
    color: colors.SUB_TITLE_COLOR,
    lineHeight: 18,
  },
  editTextInput: {
    height: 48,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    paddingHorizontal: 14,
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '600',
  },
  editActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  editCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.SUB_TITLE_COLOR,
  },
  editSaveBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.PRIMARY_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editSaveText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.TITLE_COLOR,
  },
});

export default UserProfileScreen;