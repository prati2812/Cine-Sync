import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Linking,
  Platform,
  StatusBar,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import LinearGradient from 'react-native-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, database } from '../../../config/firebase';
import { showCineAlert } from '../../../components/CineAlert';
import colors from '../../../theme/Colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const QUALITY_OPTIONS = ['4K UHD Dolby', '1080p Cine60', '720p Mobile Sync', 'Auto adaptive'];
const BUFFER_OPTIONS = ['Aggressive (Low Latency)', 'Balanced (2.5s window)', 'Deep Cache (High Jitter)'];

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

const SquircleSwitch = ({ value, onValueChange, activeColor = colors.ACCEPT_GREEN }) => (
  <TouchableOpacity
    style={[
      styles.squircleSwitchWrap,
      value ? styles.squircleSwitchOn : styles.squircleSwitchOff,
      value && {
        backgroundColor: 'rgba(0, 200, 83, 0.18)',
        borderColor: 'rgba(0, 200, 83, 0.45)',
      },
    ]}
    onPress={() => onValueChange(!value)}
    activeOpacity={0.8}
  >
    <View
      style={[
        styles.squircleSwitchThumb,
        value ? styles.thumbOn : styles.thumbOff,
        value && { backgroundColor: activeColor },
      ]}
    >
      {value && <MaterialIcons name="check" size={10} color="#080810" />}
    </View>
  </TouchableOpacity>
);

const SettingsScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const safeTopPadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 12
  ) + 8;
  const safeBottomPadding = Math.max(insets.bottom, 24);

  const currentUser = auth().currentUser;

  // Profile & Username
  const [userData, setUserData] = useState(null);
  const [username, setUsername] = useState(currentUser?.displayName || '');
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [editUsernameInput, setEditUsernameInput] = useState('');
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);

  // Group 1: Streaming & Playback
  const [qualityIdx, setQualityIdx] = useState(0);
  const [bufferIdx, setBufferIdx] = useState(0);
  const [audioSyncEngine, setAudioSyncEngine] = useState(true);

  // Group 2: Notifications & Social
  const [partyInvites, setPartyInvites] = useState(true);
  const [friendScreeningAlerts, setFriendScreeningAlerts] = useState(true);
  const [dndDuringMovie, setDndDuringMovie] = useState(true);

  // Group 3: Vault & Security
  const [appLock, setAppLock] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  // Group 4: Storage
  const [cacheSize, setCacheSize] = useState('184 MB');
  const [isClearingCache, setIsClearingCache] = useState(false);

  // ──────────────────────────────────────────────────────────────
  // 1. Initial Load & Listeners
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;

    const userRef = database().ref(`users/${currentUser.uid}`);
    const userSub = userRef.on('value', snapshot => {
      const data = snapshot.val();
      if (data) {
        setUserData(data);
        if (data.username) {
          setUsername(data.username);
        }
      }
    });

    const checkAppLock = async () => {
      try {
        const pin = await AsyncStorage.getItem('@app_lock_pin');
        setAppLock(Boolean(pin));
      } catch (error) {
        console.error('Error checking app lock:', error);
      }
    };

    checkAppLock();

    return () => {
      userRef.off('value', userSub);
    };
  }, [currentUser]);

  // Refresh PIN on screen focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', async () => {
      try {
        const pin = await AsyncStorage.getItem('@app_lock_pin');
        setAppLock(Boolean(pin));
      } catch (error) {
        console.error('Error checking app lock:', error);
      }
    });
    return unsubscribe;
  }, [navigation]);

  const usernameDisplay =
    username ||
    userData?.username ||
    currentUser?.displayName ||
    currentUser?.email?.split('@')[0] ||
    'Cinephile';

  const emailDisplay = currentUser?.email || 'cinema@cinesync.app';
  const monogram = getMonogram(usernameDisplay, emailDisplay);

  // ──────────────────────────────────────────────────────────────
  // 2. Action Handlers
  // ──────────────────────────────────────────────────────────────
  const handleToggleEditUsername = () => {
    if (!isEditingUsername) {
      setEditUsernameInput(usernameDisplay);
      setIsEditingUsername(true);
    } else {
      setIsEditingUsername(false);
    }
  };

  const handleSaveUsername = async () => {
    const trimmed = editUsernameInput.trim();
    if (!trimmed) {
      showCineAlert({
        type: 'action',
        icon: 'error-outline',
        title: 'Invalid Name',
        message: 'Username cannot be empty.',
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
      setUsername(trimmed);
      setIsEditingUsername(false);
      showCineAlert({
        type: 'success',
        icon: 'check-circle',
        title: 'Username Updated',
        message: `Your cinema handle is now "@${trimmed}".`,
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

  const handleCycleQuality = () => {
    const nextIdx = (qualityIdx + 1) % QUALITY_OPTIONS.length;
    setQualityIdx(nextIdx);
    showCineAlert({
      type: 'action',
      icon: 'high-quality',
      title: 'Stream Quality Updated',
      message: `Default playback quality set to "${QUALITY_OPTIONS[nextIdx]}".`,
      confirmText: 'OK',
    });
  };

  const handleCycleBuffer = () => {
    const nextIdx = (bufferIdx + 1) % BUFFER_OPTIONS.length;
    setBufferIdx(nextIdx);
    showCineAlert({
      type: 'action',
      icon: 'speed',
      title: 'Buffer Window Updated',
      message: `Sync pre-fetch window set to "${BUFFER_OPTIONS[nextIdx]}".`,
      confirmText: 'OK',
    });
  };

  const handleAppLockToggle = () => {
    if (!appLock) {
      navigation.navigate('SetupPIN');
    } else {
      showCineAlert({
        type: 'danger',
        icon: 'lock-open',
        title: 'Disable App PIN Lock?',
        message: 'This will remove PIN security verification upon launching Cine-Sync.',
        cancelText: 'Keep PIN',
        confirmText: 'Disable PIN',
        onConfirm: async () => {
          try {
            await AsyncStorage.removeItem('@app_lock_pin');
            setAppLock(false);
            showCineAlert({
              type: 'success',
              icon: 'check-circle',
              title: 'PIN Removed',
              message: 'App PIN lock has been disabled.',
              confirmText: 'OK',
            });
          } catch (error) {
            showCineAlert({
              type: 'danger',
              icon: 'error-outline',
              title: 'Error',
              message: 'Failed to disable app lock.',
              confirmText: 'OK',
            });
          }
        },
      });
    }
  };

  const handleResetPassword = async () => {
    if (!currentUser || !currentUser.email) {
      showCineAlert({
        type: 'danger',
        icon: 'error-outline',
        title: 'Email Required',
        message: 'No email found for current user session.',
        confirmText: 'OK',
      });
      return;
    }

    try {
      await auth().sendPasswordResetEmail(currentUser.email);
      showCineAlert({
        type: 'success',
        icon: 'mark-email-read',
        title: 'Recovery Link Sent',
        message: `Password reset instructions sent to ${currentUser.email}.`,
        confirmText: 'Check Inbox',
      });
    } catch (error) {
      showCineAlert({
        type: 'danger',
        icon: 'error-outline',
        title: 'Reset Failed',
        message: error.message || 'Could not send recovery email.',
        confirmText: 'OK',
      });
    }
  };

  const handleClearStreamCache = async () => {
    setIsClearingCache(true);
    setTimeout(() => {
      setCacheSize('0 MB');
      setIsClearingCache(false);
      showCineAlert({
        type: 'success',
        icon: 'auto-delete',
        title: 'Cache Flushed',
        message: 'Temporary video stream buffers and peer tokens cleared.',
        confirmText: 'Done',
      });
    }, 600);
  };

  const handleResetDefaults = () => {
    showCineAlert({
      type: 'danger',
      icon: 'restart-alt',
      title: 'Reset All Settings?',
      message: 'Revert all streaming, notification, and buffer preferences to factory defaults?',
      cancelText: 'Cancel',
      confirmText: 'Reset Defaults',
      onConfirm: () => {
        setQualityIdx(0);
        setBufferIdx(0);
        setAudioSyncEngine(true);
        setPartyInvites(true);
        setFriendScreeningAlerts(true);
        setDndDuringMovie(true);
        setBiometricEnabled(false);
        showCineAlert({
          type: 'success',
          icon: 'check-circle',
          title: 'Settings Restored',
          message: 'All cinema preferences have been reset to factory defaults.',
          confirmText: 'OK',
        });
      },
    });
  };

  const handleDeleteAccount = () => {
    showCineAlert({
      presentationStyle: 'bottomSheet',
      type: 'danger',
      icon: 'delete-forever',
      title: 'Delete Cinema Account?',
      message: 'Permanently purge your Cine-Sync profile, VIP badges, and synced lounge history? This cannot be undone.',
      cancelText: 'Keep Account',
      confirmText: 'Delete Permanently',
      onConfirm: async () => {
        try {
          if (currentUser) {
            await database().ref(`users/${currentUser.uid}`).remove();
            await currentUser.delete();
          }
        } catch (error) {
          if (error.code === 'auth/requires-recent-login') {
            showCineAlert({
              type: 'action',
              icon: 'lock',
              title: 'Re-authentication Required',
              message: 'Please log out and log in again before permanently deleting your account.',
              confirmText: 'OK',
            });
          } else {
            showCineAlert({
              type: 'danger',
              icon: 'error-outline',
              title: 'Deletion Failed',
              message: error.message || 'Could not delete account.',
              confirmText: 'OK',
            });
          }
        }
      },
    });
  };

  const handleOpenUrl = useCallback(async (url, title) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        showCineAlert({
          type: 'action',
          icon: 'info',
          title,
          message: `Opening: ${url}`,
          confirmText: 'OK',
        });
      }
    } catch {
      showCineAlert({
        type: 'action',
        icon: 'info',
        title,
        message: `Opening: ${url}`,
        confirmText: 'OK',
      });
    }
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Atmospheric Top Ambient Glow Sheen */}
      <LinearGradient
        colors={['rgba(124, 58, 237, 0.20)', 'rgba(0, 122, 255, 0.08)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.ambientTopGlow}
        pointerEvents="none"
      />

      {/* ── 1. HEADER BAR ── */}
      <View style={[styles.headerBar, { paddingTop: safeTopPadding }]}>
        <View style={styles.headerLeftCol}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.75}
          >
            <MaterialIcons name="arrow-back" size={20} color={colors.TITLE_COLOR} />
          </TouchableOpacity>
          <Text style={styles.headerTitleText}>APP SETTINGS</Text>
        </View>

        <View style={styles.headerRightCol}>
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={handleResetDefaults}
            activeOpacity={0.75}
          >
            <MaterialIcons name="restart-alt" size={20} color={colors.SUB_TITLE_COLOR} />
          </TouchableOpacity>
          <View style={styles.headerAvatarSquircle}>
            <Text style={styles.headerAvatarText}>{monogram}</Text>
          </View>
        </View>
      </View>

      {/* ── SCROLLABLE SETTINGS CONTENT ── */}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: safeBottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 2. MINI CINEMA PROFILE BANNER ── */}
        <View style={styles.profileBannerCard}>
          <View style={styles.profileRow}>
            {/* 64x64px Squircle Monogram Avatar with Gradient Border */}
            <View style={styles.avatarWrapper}>
              <LinearGradient
                colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT, colors.CYAN_ACCENT]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatarGradientBorder}
              >
                <View style={styles.avatarInnerCore}>
                  <Text style={styles.avatarMonogramText}>{monogram}</Text>
                </View>
              </LinearGradient>
              {/* Online Green Squircle Dot */}
              <View style={styles.onlineDotWrapper}>
                <View style={styles.onlineDotInner} />
              </View>
            </View>

            {/* User Info Col */}
            <View style={styles.profileInfoCol}>
              <View style={styles.nameRow}>
                <Text style={styles.usernameText} numberOfLines={1}>
                  {usernameDisplay}
                </Text>
                <MaterialIcons name="verified" size={16} color={colors.CYAN_ACCENT} />
              </View>
              <Text style={styles.emailText} numberOfLines={1}>
                {emailDisplay}
              </Text>

              {/* Badges Row */}
              <View style={styles.profileBadgesRow}>
                <View style={styles.goldPassPill}>
                  <MaterialIcons name="stars" size={13} color={colors.FILM_GOLD} />
                  <Text style={styles.goldPassText}>Cinema Gold Pass</Text>
                </View>
                <TouchableOpacity
                  style={styles.editHandleBtn}
                  onPress={handleToggleEditUsername}
                  activeOpacity={0.75}
                >
                  <MaterialIcons name="edit" size={12} color={colors.TITLE_COLOR} />
                  <Text style={styles.editHandleText}>
                    {isEditingUsername ? 'Close' : 'Edit'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Inline Edit Username Drawer */}
          {isEditingUsername && (
            <View style={styles.editDrawerWrap}>
              <TextInput
                style={styles.editDrawerInput}
                value={editUsernameInput}
                onChangeText={setEditUsernameInput}
                placeholder="Enter handle..."
                placeholderTextColor="rgba(255, 255, 255, 0.40)"
                autoCapitalize="none"
                maxLength={24}
              />
              <TouchableOpacity
                style={styles.editDrawerSaveBtn}
                onPress={handleSaveUsername}
                disabled={isUpdatingUsername}
                activeOpacity={0.8}
              >
                {isUpdatingUsername ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.editDrawerSaveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── 3. GROUP 1: STREAMING & PLAYBACK PREFERENCES ── */}
        <View style={styles.groupSection}>
          <View style={styles.groupHeaderRow}>
            <MaterialIcons name="tune" size={16} color={colors.CYAN_ACCENT} />
            <Text style={styles.groupHeaderText}>Streaming & Playback Preferences</Text>
          </View>

          <View style={styles.groupedCard}>
            {/* Row 1: Playback Quality */}
            <TouchableOpacity
              style={styles.groupedRow}
              onPress={handleCycleQuality}
              activeOpacity={0.75}
            >
              <View style={styles.groupedRowLeft}>
                <View style={[styles.iconBox, { backgroundColor: 'rgba(6, 182, 212, 0.12)' }]}>
                  <MaterialIcons name="high-quality" size={20} color={colors.CYAN_ACCENT} />
                </View>
                <View style={styles.groupedTextCol}>
                  <Text style={styles.groupedRowTitle}>Playback Quality</Text>
                  <Text style={styles.groupedRowSub}>Select streaming resolution</Text>
                </View>
              </View>
              <View style={styles.groupedRowRight}>
                <View style={[styles.valPill, { backgroundColor: colors.SURFACE_ELEVATED }]}>
                  <Text style={[styles.valPillText, { color: colors.CYAN_ACCENT }]}>
                    {QUALITY_OPTIONS[qualityIdx]}
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={18} color="rgba(255, 255, 255, 0.35)" />
              </View>
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            {/* Row 2: Buffer Pre-fetch */}
            <TouchableOpacity
              style={styles.groupedRow}
              onPress={handleCycleBuffer}
              activeOpacity={0.75}
            >
              <View style={styles.groupedRowLeft}>
                <View style={[styles.iconBox, { backgroundColor: 'rgba(0, 122, 255, 0.12)' }]}>
                  <MaterialIcons name="speed" size={20} color={colors.PRIMARY_COLOR} />
                </View>
                <View style={styles.groupedTextCol}>
                  <Text style={styles.groupedRowTitle}>Buffer Pre-fetch</Text>
                  <Text style={styles.groupedRowSub}>Dynamic sync cache window</Text>
                </View>
              </View>
              <View style={styles.groupedRowRight}>
                <View style={[styles.valPill, { backgroundColor: colors.SURFACE_ELEVATED }]}>
                  <Text style={[styles.valPillText, { color: colors.PRIMARY_COLOR }]}>
                    {BUFFER_OPTIONS[bufferIdx]}
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={18} color="rgba(255, 255, 255, 0.35)" />
              </View>
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            {/* Row 3: Audio Sync Engine */}
            <View style={styles.groupedRow}>
              <View style={styles.groupedRowLeft}>
                <View style={[styles.iconBox, { backgroundColor: 'rgba(124, 58, 237, 0.14)' }]}>
                  <MaterialIcons name="sync" size={20} color={colors.PURPLE_ACCENT} />
                </View>
                <View style={styles.groupedTextCol}>
                  <Text style={styles.groupedRowTitle}>Audio Sync Engine</Text>
                  <Text style={styles.groupedRowSub}>Hardware-accelerated sub-50ms peer lock</Text>
                </View>
              </View>
              <SquircleSwitch
                value={audioSyncEngine}
                onValueChange={setAudioSyncEngine}
              />
            </View>
          </View>
        </View>

        {/* ── 4. GROUP 2: NOTIFICATIONS & SOCIAL ── */}
        <View style={styles.groupSection}>
          <View style={styles.groupHeaderRow}>
            <MaterialIcons name="notifications" size={16} color={colors.PURPLE_ACCENT} />
            <Text style={styles.groupHeaderText}>Notifications & Social</Text>
          </View>

          <View style={styles.groupedCard}>
            {/* Row 1: Party Invitations */}
            <View style={styles.groupedRow}>
              <View style={styles.groupedRowLeft}>
                <View style={[styles.iconBox, { backgroundColor: 'rgba(255, 180, 0, 0.12)' }]}>
                  <MaterialIcons name="notifications-active" size={20} color={colors.FILM_GOLD} />
                </View>
                <View style={styles.groupedTextCol}>
                  <Text style={styles.groupedRowTitle}>Party Invitations</Text>
                  <Text style={styles.groupedRowSub}>Allow VIP lounge room invites</Text>
                </View>
              </View>
              <SquircleSwitch
                value={partyInvites}
                onValueChange={setPartyInvites}
              />
            </View>

            <View style={styles.rowDivider} />

            {/* Row 2: Friend Screening Alerts */}
            <View style={styles.groupedRow}>
              <View style={styles.groupedRowLeft}>
                <View style={[styles.iconBox, { backgroundColor: 'rgba(6, 182, 212, 0.12)' }]}>
                  <MaterialIcons name="group" size={20} color={colors.CYAN_ACCENT} />
                </View>
                <View style={styles.groupedTextCol}>
                  <Text style={styles.groupedRowTitle}>Friend Screening Alerts</Text>
                  <Text style={styles.groupedRowSub}>Alert when crew starts watching</Text>
                </View>
              </View>
              <SquircleSwitch
                value={friendScreeningAlerts}
                onValueChange={setFriendScreeningAlerts}
              />
            </View>

            <View style={styles.rowDivider} />

            {/* Row 3: Do Not Disturb during Movie */}
            <View style={styles.groupedRow}>
              <View style={styles.groupedRowLeft}>
                <View style={[styles.iconBox, { backgroundColor: 'rgba(124, 58, 237, 0.14)' }]}>
                  <MaterialIcons name="do-not-disturb-on" size={20} color={colors.PURPLE_ACCENT} />
                </View>
                <View style={styles.groupedTextCol}>
                  <Text style={styles.groupedRowTitle}>Do Not Disturb during Movie</Text>
                  <Text style={styles.groupedRowSub}>Mute alerts while in synced screening</Text>
                </View>
              </View>
              <SquircleSwitch
                value={dndDuringMovie}
                onValueChange={setDndDuringMovie}
              />
            </View>
          </View>
        </View>

        {/* ── 5. GROUP 3: VAULT & PRIVACY SECURITY ── */}
        <View style={styles.groupSection}>
          <View style={styles.groupHeaderRow}>
            <MaterialIcons name="shield" size={16} color={colors.ACCEPT_GREEN} />
            <Text style={styles.groupHeaderText}>Vault & Privacy Security</Text>
          </View>

          <View style={styles.groupedCard}>
            {/* Row 1: App PIN Lock */}
            <View style={styles.groupedRow}>
              <View style={styles.groupedRowLeft}>
                <View style={[styles.iconBox, { backgroundColor: 'rgba(0, 200, 83, 0.14)' }]}>
                  <MaterialIcons name="pin" size={20} color={colors.ACCEPT_GREEN} />
                </View>
                <View style={styles.groupedTextCol}>
                  <View style={styles.statusLabelRow}>
                    <Text style={styles.groupedRowTitle}>App PIN Lock</Text>
                    <View
                      style={[
                        styles.activePill,
                        appLock
                          ? { backgroundColor: 'rgba(0, 200, 83, 0.12)' }
                          : { backgroundColor: 'rgba(255, 255, 255, 0.08)' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.activePillText,
                          appLock
                            ? { color: colors.ACCEPT_GREEN }
                            : { color: colors.SUB_TITLE_COLOR },
                        ]}
                      >
                        {appLock ? '4-Digit Active' : 'Disabled'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.groupedRowSub}>Require PIN upon launching app</Text>
                </View>
              </View>
              <SquircleSwitch
                value={appLock}
                onValueChange={handleAppLockToggle}
              />
            </View>

            <View style={styles.rowDivider} />

            {/* Row 2: Biometric Authentication */}
            <View style={styles.groupedRow}>
              <View style={styles.groupedRowLeft}>
                <View style={[styles.iconBox, { backgroundColor: 'rgba(6, 182, 212, 0.12)' }]}>
                  <MaterialIcons name="fingerprint" size={20} color={colors.CYAN_ACCENT} />
                </View>
                <View style={styles.groupedTextCol}>
                  <Text style={styles.groupedRowTitle}>Biometric Face/Fingerprint</Text>
                  <Text style={styles.groupedRowSub}>Fast Face ID & Touch authentication</Text>
                </View>
              </View>
              <SquircleSwitch
                value={biometricEnabled}
                onValueChange={setBiometricEnabled}
              />
            </View>

            <View style={styles.rowDivider} />

            {/* Row 3: Reset Account Password */}
            <TouchableOpacity
              style={styles.groupedRow}
              onPress={handleResetPassword}
              activeOpacity={0.75}
            >
              <View style={styles.groupedRowLeft}>
                <View style={[styles.iconBox, { backgroundColor: 'rgba(0, 122, 255, 0.12)' }]}>
                  <MaterialIcons name="lock-reset" size={20} color={colors.PRIMARY_COLOR} />
                </View>
                <View style={styles.groupedTextCol}>
                  <Text style={styles.groupedRowTitle}>Reset Account Password</Text>
                  <Text style={styles.groupedRowSub}>Send security recovery email</Text>
                </View>
              </View>
              <View style={styles.groupedRowRight}>
                <Text style={styles.updateActionText}>Update</Text>
                <MaterialIcons name="chevron-right" size={18} color="rgba(255, 255, 255, 0.35)" />
              </View>
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            {/* Row 4: Blocked Cinephiles */}
            <TouchableOpacity
              style={styles.groupedRow}
              onPress={() => {
                showCineAlert({
                  type: 'action',
                  icon: 'block',
                  title: 'Blocked Cinephiles',
                  message: 'No blocked users on your blacklist.',
                  confirmText: 'OK',
                });
              }}
              activeOpacity={0.75}
            >
              <View style={styles.groupedRowLeft}>
                <View style={[styles.iconBox, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                  <MaterialIcons name="block" size={20} color={colors.DELETE_RED_COLOR} />
                </View>
                <View style={styles.groupedTextCol}>
                  <Text style={styles.groupedRowTitle}>Blocked Cinephiles</Text>
                  <Text style={styles.groupedRowSub}>Restricted accounts & room joins</Text>
                </View>
              </View>
              <View style={styles.groupedRowRight}>
                <View style={[styles.valPill, { backgroundColor: colors.SURFACE_ELEVATED }]}>
                  <Text style={[styles.valPillText, { color: colors.SUB_TITLE_COLOR }]}>
                    0 blocked
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={18} color="rgba(255, 255, 255, 0.35)" />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 6. GROUP 4: STORAGE & ABOUT ── */}
        <View style={styles.groupSection}>
          <View style={styles.groupHeaderRow}>
            <MaterialIcons name="storage" size={16} color={colors.FILM_GOLD} />
            <Text style={styles.groupHeaderText}>Storage & About</Text>
          </View>

          <View style={styles.groupedCard}>
            {/* Row 1: Clear Stream Cache */}
            <View style={styles.groupedRow}>
              <View style={styles.groupedRowLeft}>
                <View style={[styles.iconBox, { backgroundColor: 'rgba(255, 180, 0, 0.12)' }]}>
                  <MaterialIcons name="cleaning-services" size={20} color={colors.FILM_GOLD} />
                </View>
                <View style={styles.groupedTextCol}>
                  <Text style={styles.groupedRowTitle}>Clear Stream Cache</Text>
                  <Text style={styles.groupedRowSub}>Temporary video buffer</Text>
                </View>
              </View>
              <View style={styles.groupedRowRight}>
                <Text style={styles.cacheSizeText}>{cacheSize}</Text>
                <TouchableOpacity
                  style={styles.clearBtn}
                  onPress={handleClearStreamCache}
                  disabled={isClearingCache || cacheSize === '0 MB'}
                  activeOpacity={0.75}
                >
                  <Text style={styles.clearBtnText}>
                    {isClearingCache ? '...' : 'Clear'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.rowDivider} />

            {/* Row 2: Help & Support */}
            <TouchableOpacity
              style={styles.groupedRow}
              onPress={() => navigation.navigate('HelpAndSupport')}
              activeOpacity={0.75}
            >
              <View style={styles.groupedRowLeft}>
                <View style={[styles.iconBox, { backgroundColor: 'rgba(255, 180, 0, 0.14)' }]}>
                  <MaterialIcons name="support-agent" size={20} color={colors.FILM_GOLD} />
                </View>
                <View style={styles.groupedTextCol}>
                  <Text style={styles.groupedRowTitle}>Help & Support</Text>
                  <Text style={styles.groupedRowSub}>FAQs, troubleshooting & 24/7 concierge</Text>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={18} color="rgba(255, 255, 255, 0.35)" />
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            {/* Row 3: Terms of Service */}
            <TouchableOpacity
              style={styles.groupedRow}
              onPress={() => handleOpenUrl('https://cinesync.app/terms', 'Terms of Service')}
              activeOpacity={0.75}
            >
              <View style={styles.groupedRowLeft}>
                <View style={[styles.iconBox, { backgroundColor: colors.SURFACE_ELEVATED }]}>
                  <MaterialIcons name="description" size={20} color={colors.SUB_TITLE_COLOR} />
                </View>
                <Text style={styles.groupedRowTitle}>Terms of Service</Text>
              </View>
              <MaterialIcons name="chevron-right" size={18} color="rgba(255, 255, 255, 0.35)" />
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            {/* Row 3: Privacy Policy */}
            <TouchableOpacity
              style={styles.groupedRow}
              onPress={() => handleOpenUrl('https://cinesync.app/privacy', 'Privacy Policy')}
              activeOpacity={0.75}
            >
              <View style={styles.groupedRowLeft}>
                <View style={[styles.iconBox, { backgroundColor: 'rgba(124, 58, 237, 0.14)' }]}>
                  <MaterialIcons name="privacy-tip" size={20} color={colors.PURPLE_ACCENT} />
                </View>
                <Text style={styles.groupedRowTitle}>Privacy Policy</Text>
              </View>
              <MaterialIcons name="chevron-right" size={18} color="rgba(255, 255, 255, 0.35)" />
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            {/* Row 4: App Build & Telemetry */}
            <View style={styles.groupedRow}>
              <View style={styles.groupedRowLeft}>
                <View style={[styles.iconBox, { backgroundColor: 'rgba(6, 182, 212, 0.12)' }]}>
                  <MaterialIcons name="terminal" size={20} color={colors.CYAN_ACCENT} />
                </View>
                <Text style={styles.groupedRowTitle}>App Build & Telemetry</Text>
              </View>
              <Text style={styles.buildText}>v2.4 (Build 891)</Text>
            </View>
          </View>
        </View>

        {/* ── 7. DANGER ZONE ── */}
        <TouchableOpacity
          style={styles.deleteAccountBtn}
          onPress={handleDeleteAccount}
          activeOpacity={0.82}
        >
          <MaterialIcons name="delete-forever" size={22} color={colors.DELETE_RED_COLOR} />
          <Text style={styles.deleteAccountText}>Delete Cinema Account</Text>
        </TouchableOpacity>
      </ScrollView>
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
  ambientTopGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
    zIndex: 0,
  },

  // ── Header Bar ──
  headerBar: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
    zIndex: 10,
  },
  headerLeftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.TITLE_COLOR,
    letterSpacing: 0.5,
  },
  headerRightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resetBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarSquircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.PRIMARY_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  // ── Scroll Content ──
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 18,
  },

  // ── Mini Profile Banner ──
  profileBannerCard: {
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    padding: 14,
    gap: 10,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatarGradientBorder: {
    padding: 2,
    borderRadius: 16,
  },
  avatarInnerCore: {
    width: 58,
    height: 58,
    borderRadius: 14,
    backgroundColor: colors.SURFACE_ELEVATED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarMonogramText: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.TITLE_COLOR,
  },
  onlineDotWrapper: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 5,
    backgroundColor: colors.SURFACE_COLOR,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineDotInner: {
    width: '100%',
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.ACCEPT_GREEN,
  },
  profileInfoCol: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  usernameText: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.TITLE_COLOR,
  },
  emailText: {
    fontSize: 12,
    color: colors.SUB_TITLE_COLOR,
    fontWeight: '500',
  },
  profileBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  goldPassPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 180, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 0, 0.28)',
  },
  goldPassText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.FILM_GOLD,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  editHandleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  editHandleText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.TITLE_COLOR,
  },

  // Inline Edit Username Drawer
  editDrawerWrap: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  editDrawerInput: {
    flex: 1,
    height: 40,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    paddingHorizontal: 12,
    color: colors.TITLE_COLOR,
    fontSize: 13,
    fontWeight: '600',
  },
  editDrawerSaveBtn: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: colors.PRIMARY_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editDrawerSaveText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── Grouped Settings Cards ──
  groupSection: {
    gap: 6,
  },
  groupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
  },
  groupHeaderText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.SUB_TITLE_COLOR,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
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
    paddingVertical: 13,
  },
  groupedRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    paddingRight: 10,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupedTextCol: {
    flex: 1,
    gap: 2,
  },
  groupedRowTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.TITLE_COLOR,
  },
  groupedRowSub: {
    fontSize: 11,
    color: colors.SUB_TITLE_COLOR,
  },
  groupedRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  valPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  valPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  activePillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  updateActionText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.PRIMARY_COLOR,
  },
  rowDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    marginHorizontal: 14,
  },
  cacheSizeText: {
    fontSize: 12,
    color: colors.SUB_TITLE_COLOR,
    fontWeight: '600',
  },
  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  clearBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.TITLE_COLOR,
  },
  buildText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.SUB_TITLE_COLOR,
    letterSpacing: 0.5,
  },

  // Squircle Switch
  squircleSwitchWrap: {
    width: 44,
    height: 24,
    borderRadius: 8,
    padding: 2,
    justifyContent: 'center',
    borderWidth: 1,
  },
  squircleSwitchOn: {
    backgroundColor: 'rgba(0, 200, 83, 0.20)',
    borderColor: 'rgba(0, 200, 83, 0.50)',
    alignItems: 'flex-end',
  },
  squircleSwitchOff: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'flex-start',
  },
  squircleSwitchThumb: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbOn: {
    backgroundColor: colors.ACCEPT_GREEN,
  },
  thumbOff: {
    backgroundColor: 'rgba(255, 255, 255, 0.40)',
  },

  // ── Danger Zone ──
  deleteAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderRadius: 16,
    paddingVertical: 14,
    marginTop: 4,
  },
  deleteAccountText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.DELETE_RED_COLOR,
    letterSpacing: 0.3,
  },
});

export default SettingsScreen;