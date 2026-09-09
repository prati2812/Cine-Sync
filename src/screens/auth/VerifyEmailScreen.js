import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
  StatusBar,
  Linking,
  ScrollView,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { auth, database } from '../../config/firebase';
import colors from '../../theme/Colors';

const VerifyEmailScreen = ({ onSuccess, navigation }) => {
  const contextInsets = useContext(SafeAreaInsetsContext);
  const insets = contextInsets || {
    top: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 20,
    bottom: 0,
    left: 0,
    right: 0,
  };

  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [timer, setTimer] = useState(32);
  const [activeRoom, setActiveRoom] = useState(null);

  const currentUser = auth().currentUser;

  // Pulse animation for green status indicators
  const pulseOpacity = useSharedValue(1);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withTiming(0.3, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    pulseScale.value = withRepeat(
      withTiming(1.3, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animatedPulseDotStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
    transform: [{ scale: pulseScale.value }],
  }));

  // Resend countdown timer
  useEffect(() => {
    if (!canResend) {
      const countdown = setInterval(() => {
        setTimer(prev => {
          if (prev <= 1) {
            clearInterval(countdown);
            setCanResend(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(countdown);
    }
  }, [canResend]);

  // Auto-polling for email verification status
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        await auth().currentUser?.reload();
        if (auth().currentUser?.emailVerified) {
          if (onSuccess) onSuccess();
          clearInterval(interval);
        }
      } catch (err) {
        // Silently catch background reload errors
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [onSuccess]);

  // Dynamic live screening room from Firebase Realtime Database
  useEffect(() => {
    const roomsRef = database().ref('rooms');
    const onRoomsValue = roomsRef.limitToFirst(1).on('value', snapshot => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const keys = Object.keys(data);
        if (keys.length > 0) {
          const firstRoom = data[keys[0]];
          setActiveRoom(firstRoom);
          return;
        }
      }
      setActiveRoom(null);
    });

    return () => roomsRef.off('value', onRoomsValue);
  }, []);

  // Helper to mask email (e.g. da***@cinema.com)
  const getMaskedEmail = () => {
    const email = currentUser?.email || 'user@cinema.com';
    const atIndex = email.indexOf('@');
    if (atIndex <= 0) return email;
    const name = email.slice(0, atIndex);
    const domain = email.slice(atIndex);
    const visiblePrefix = name.slice(0, Math.min(2, name.length));
    return `${visiblePrefix}***${domain}`;
  };

  const handleOpenMailApp = async () => {
    try {
      if (Platform.OS === 'ios') {
        const canOpen = await Linking.canOpenURL('message:');
        if (canOpen) {
          await Linking.openURL('message:');
          return;
        }
      }
      await Linking.openURL('mailto:');
    } catch {
      Alert.alert(
        'Mail Client',
        'Please check your mail app to verify your email address.'
      );
    }
  };

  const handleManualCheck = async () => {
    setIsChecking(true);
    try {
      await auth().currentUser?.reload();
      if (auth().currentUser?.emailVerified) {
        if (onSuccess) onSuccess();
      } else {
        Alert.alert(
          'Not Verified Yet',
          'We haven\'t detected the verification yet. Please open the link received in your inbox.'
        );
      }
    } catch (e) {
      console.log('Error checking verification status:', e);
      Alert.alert('Status Check', 'Could not refresh verification status. Please try again.');
    } finally {
      setIsChecking(false);
    }
  };

  const handleResendEmail = async () => {
    if (!canResend || isLoading) return;
    setIsLoading(true);
    try {
      await auth().currentUser?.sendEmailVerification();
      Alert.alert('Verification Sent', 'A new verification link has been sent to your email.');
      setCanResend(false);
      setTimer(32);
    } catch (error) {
      console.log('Error sending verification email:', error);
      Alert.alert('Resend Failed', error?.message || 'Failed to send verification email.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoBack = () => {
    Alert.alert(
      'Leave Verification',
      'Do you want to sign out and return to the login screen?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await auth().signOut();
              if (navigation?.goBack) navigation.goBack();
            } catch (err) {
              console.log('Sign out error:', err);
            }
          },
        },
      ]
    );
  };

  const handleChangeEmail = () => {
    Alert.alert(
      'Change Email',
      'Do you want to sign out to register or sign in with another email address?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out & Change',
          onPress: async () => {
            try {
              await auth().signOut();
              if (navigation?.navigate) {
                navigation.navigate('SignUp');
              }
            } catch (err) {
              console.log('Sign out error:', err);
            }
          },
        },
      ]
    );
  };

  const safeTopPadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 12
  ) + 8;

  const participantsCount = activeRoom?.participants
    ? Object.keys(activeRoom.participants).length
    : 0;

  return (
    <View style={styles.container}>
      <StatusBar
        backgroundColor={colors.BACKGROUND_COLOR}
        barStyle="light-content"
        translucent
      />

      {/* Ambient Radial Top Glows - exact match to LoginScreen */}
      <View style={styles.ambientTopGlow} pointerEvents="none">
        <LinearGradient
          colors={['rgba(124, 58, 237, 0.18)', 'rgba(0, 122, 255, 0.08)', 'transparent']}
          style={StyleSheet.absoluteFillObject}
        />
      </View>

      {/* Top Header Bar */}
      <View style={[styles.headerBar, { paddingTop: safeTopPadding }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleGoBack}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Go Back">
            <Ionicons name="arrow-back" size={22} color={colors.TITLE_COLOR} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Security & Biometrics
          </Text>
        </View>

        <View style={styles.avatarCircle}>
          <Ionicons name="person" size={16} color={colors.TITLE_COLOR} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) + 16 },
        ]}
        showsVerticalScrollIndicator={false}>
        
        {/* Shield Icon Showcase */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(100)}
          style={styles.shieldPod}>
          <View style={styles.shieldGlowBehind} />
          <View style={styles.shieldCard}>
            <View style={styles.shieldHighlightLine} />
            <MaterialIcons
              name="verified-user"
              size={36}
              color={colors.ACCEPT_GREEN}
            />
          </View>
        </Animated.View>

        {/* Security Tier Indicator Badge */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(200)}
          style={styles.badgeContainer}>
          <View style={styles.badgePulseWrapper}>
            <Animated.View style={[styles.badgePulseRing, animatedPulseDotStyle]} />
            <View style={styles.badgeDot} />
          </View>
          <Text style={styles.badgeText}>Firebase Magic Link Sent</Text>
        </Animated.View>

        {/* Title & Masked Email Destination */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(300)}
          style={styles.textContainer}>
          <Text style={styles.mainTitle}>Check Your Inbox</Text>
          <Text style={styles.subText}>
            We sent a verification link to{' '}
            <Text style={styles.highlightedEmail}>{getMaskedEmail()}</Text>
          </Text>
        </Animated.View>

        {/* Magic Link Info Section */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(400)}
          style={styles.infoCard}>
          <View style={styles.infoIconWrapper}>
            <LinearGradient
              colors={[colors.PRIMARY_GLOW_STRONG, colors.PURPLE_GLOW]}
              style={styles.infoIconBox}>
              <MaterialIcons
                name="mark-email-unread"
                size={32}
                color={colors.CYAN_ACCENT}
              />
            </LinearGradient>
            <View style={styles.infoActiveBadge}>
              <Animated.View style={[styles.infoActiveBadgeRing, animatedPulseDotStyle]} />
              <View style={styles.infoActiveBadgeDot} />
            </View>
          </View>
          <Text style={styles.infoCardDescription}>
            Tap the magic link in your email to instantly verify and unlock your{' '}
            <Text style={styles.infoCardHighlight}>VIP Screening room</Text>.
          </Text>
        </Animated.View>

        {/* Quick Feedback Status Tip */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(500)}
          style={styles.statusFeedbackRow}>
          <View style={styles.statusPulseWrapper}>
            <Animated.View style={[styles.statusPulseRing, animatedPulseDotStyle]} />
            <View style={styles.statusDot} />
          </View>
          <Text style={styles.statusFeedbackText}>
            Checking verification status automatically...
          </Text>
        </Animated.View>

        {/* Primary Action: Open Mail App */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(600)}
          style={styles.actionContainer}>
          <TouchableOpacity
            onPress={handleOpenMailApp}
            activeOpacity={0.85}
            style={styles.primaryBtnWrapper}>
            <LinearGradient
              colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryButton}>
              <Ionicons name="mail" size={20} color={colors.TITLE_COLOR} />
              <Text style={styles.primaryButtonText}>Open Mail App</Text>
              <Ionicons
                name="open-outline"
                size={18}
                color={colors.TITLE_COLOR}
                style={styles.openIcon}
              />
            </LinearGradient>
          </TouchableOpacity>

          {/* Secondary Manual Verification Check */}
          <TouchableOpacity
            onPress={handleManualCheck}
            disabled={isChecking}
            activeOpacity={0.7}
            style={styles.manualCheckButton}>
            {isChecking ? (
              <ActivityIndicator size="small" color={colors.PRIMARY_COLOR} />
            ) : (
              <Text style={styles.manualCheckText}>I've Verified My Email</Text>
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* Resend Flow & Cooldown Mechanism */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(700)}
          style={styles.resendSection}>
          <View style={styles.resendRow}>
            <Text style={styles.resendLabel}>Didn't receive email?</Text>
            <TouchableOpacity
              onPress={handleResendEmail}
              disabled={!canResend || isLoading}
              activeOpacity={0.7}>
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.CYAN_ACCENT} />
              ) : (
                <Text
                  style={[
                    styles.resendAction,
                    !canResend && styles.resendActionDisabled,
                  ]}>
                  {canResend ? 'Resend Code' : `Resend in ${timer}s`}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Quick Change Alternative */}
          <TouchableOpacity
            onPress={handleChangeEmail}
            activeOpacity={0.7}
            style={styles.changeEmailButton}>
            <Text style={styles.changeEmailLabel}>Wrong email address?</Text>
            <Text style={styles.changeEmailAction}>Change email</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Theater Room Visual Cue / Dynamic Atmosphere Card */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(800)}
          style={styles.theaterCard}>
          <View style={styles.theaterCardLeft}>
            <View style={styles.theaterIconBox}>
              <MaterialIcons
                name="theaters"
                size={22}
                color={colors.PRIMARY_COLOR}
              />
            </View>
            <View style={styles.theaterTextColumn}>
              <Text style={styles.theaterHallBadge}>Live Screening Hall</Text>
              <Text style={styles.theaterTitle} numberOfLines={1}>
                {activeRoom?.movieTitle || activeRoom?.title || 'Cine-Sync Premiere Lounge'}
              </Text>
            </View>
          </View>

          <View style={styles.theaterCountBadge}>
            <MaterialIcons
              name="group"
              size={15}
              color={colors.CYAN_ACCENT}
            />
            <Text style={styles.theaterCountText}>
              {participantsCount > 0
                ? `${participantsCount} In Lounge`
                : 'VIP Lounge Ready'}
            </Text>
          </View>
        </Animated.View>

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
  },
  // Ambient radial top glow - identical to LoginScreen
  ambientTopGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 380,
  },
  // Seamless transparent header
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.TITLE_COLOR,
    letterSpacing: -0.2,
    maxWidth: 220,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(124, 58, 237, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    alignItems: 'center',
  },
  // Shield Pod
  shieldPod: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    marginTop: 8,
  },
  shieldGlowBehind: {
    position: 'absolute',
    width: 82,
    height: 82,
    borderRadius: 22,
    backgroundColor: colors.ACCEPT_GREEN_GLOW,
  },
  shieldCard: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: colors.SURFACE_ELEVATED,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    shadowColor: colors.ACCEPT_GREEN,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 8,
    overflow: 'hidden',
  },
  shieldHighlightLine: {
    position: 'absolute',
    top: 0,
    left: 8,
    right: 8,
    height: 1,
    backgroundColor: colors.CYAN_ACCENT,
    opacity: 0.5,
  },
  // Indicator badge
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_COLOR,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    gap: 8,
    marginBottom: 18,
  },
  badgePulseWrapper: {
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgePulseRing: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.ACCEPT_GREEN,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.ACCEPT_GREEN,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.ACCEPT_GREEN,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  // Text
  textContainer: {
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 12,
  },
  mainTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.TITLE_COLOR,
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  subText: {
    fontSize: 15,
    color: colors.TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  highlightedEmail: {
    color: colors.CYAN_ACCENT,
    fontWeight: '700',
  },
  // Info Section (no card background)
  infoCard: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  infoIconWrapper: {
    position: 'relative',
    marginBottom: 14,
  },
  infoIconBox: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  infoActiveBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoActiveBadgeRing: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.ACCEPT_GREEN,
  },
  infoActiveBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.ACCEPT_GREEN,
  },
  infoCardDescription: {
    fontSize: 14,
    color: colors.SUB_TITLE_COLOR,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 290,
  },
  infoCardHighlight: {
    color: colors.CYAN_ACCENT,
    fontWeight: '600',
  },
  // Status feedback row
  statusFeedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 22,
  },
  statusPulseWrapper: {
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPulseRing: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.ACCEPT_GREEN,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.ACCEPT_GREEN,
  },
  statusFeedbackText: {
    fontSize: 13,
    color: colors.SUB_TITLE_COLOR,
  },
  // Action Buttons
  actionContainer: {
    width: '100%',
    marginBottom: 24,
    gap: 12,
  },
  primaryBtnWrapper: {
    width: '100%',
    borderRadius: 16,
    shadowColor: colors.PURPLE_ACCENT,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 8,
  },
  primaryButton: {
    height: 54,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.TITLE_COLOR,
    letterSpacing: 0.2,
  },
  openIcon: {
    opacity: 0.85,
    marginLeft: 2,
  },
  manualCheckButton: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualCheckText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.PRIMARY_COLOR,
    letterSpacing: 0.1,
  },
  // Resend & Change email
  resendSection: {
    alignItems: 'center',
    gap: 14,
    width: '100%',
    marginBottom: 28,
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resendLabel: {
    fontSize: 14,
    color: colors.SUB_TITLE_COLOR,
  },
  resendAction: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.CYAN_ACCENT,
  },
  resendActionDisabled: {
    color: colors.MUTED_COLOR,
  },
  changeEmailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.SURFACE_GLASS,
  },
  changeEmailLabel: {
    fontSize: 13,
    color: colors.MUTED_COLOR,
  },
  changeEmailAction: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.CYAN_ACCENT,
    textDecorationLine: 'underline',
  },
  // Atmosphere card
  theaterCard: {
    width: '100%',
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  theaterCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  theaterIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_ELEVATED,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  theaterTextColumn: {
    flex: 1,
    minWidth: 0,
  },
  theaterHallBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.CYAN_ACCENT,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  theaterTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.TITLE_COLOR,
    marginTop: 2,
  },
  theaterCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  theaterCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.TITLE_COLOR,
  },
});

export default VerifyEmailScreen;
