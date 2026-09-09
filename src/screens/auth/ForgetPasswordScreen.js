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
  TextInput,
  TouchableWithoutFeedback,
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
  Modal,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import Animated, {
  FadeInDown,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { auth, database } from '../../config/firebase';
import colors from '../../theme/Colors';

const ForgetPasswordScreen = ({ navigation }) => {
  const contextInsets = useContext(SafeAreaInsetsContext);
  const insets = contextInsets || {
    top: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 20,
    bottom: 0,
    left: 0,
    right: 0,
  };

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isLinkSent, setIsLinkSent] = useState(false);
  const [showSuccessSheet, setShowSuccessSheet] = useState(false);
  const [timer, setTimer] = useState(45);
  const [canResend, setCanResend] = useState(false);

  // Concentric ring animations
  const pulseRingScale = useSharedValue(1);
  const pulseRingOpacity = useSharedValue(0.35);

  useEffect(() => {
    pulseRingScale.value = withRepeat(
      withTiming(1.22, { duration: 2400, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    pulseRingOpacity.value = withRepeat(
      withTiming(0.12, { duration: 2400, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animatedRingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseRingScale.value }],
    opacity: pulseRingOpacity.value,
  }));

  // Resend Countdown - runs immediately on mount and resets after resend
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

  const checkUserExists = async targetEmail => {
    try {
      const snapshot = await database()
        .ref('users')
        .orderByChild('email')
        .equalTo(targetEmail.toLowerCase())
        .once('value');
      return snapshot.exists();
    } catch {
      return true; // Fallback to let Firebase Auth attempt reset
    }
  };

  const handleResetPassword = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      Alert.alert('Email Required', 'Please enter your registered email address.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    try {
      const exists = await checkUserExists(trimmedEmail);
      if (!exists) {
        Alert.alert('User Not Found', 'No VIP account registered with this email address.');
        setIsLoading(false);
        return;
      }

      await auth().sendPasswordResetEmail(trimmedEmail);
      setIsLinkSent(true);
      setCanResend(false);
      setTimer(45);
      setShowSuccessSheet(true);
    } catch (error) {
      console.log('Password reset error:', error);
      Alert.alert(
        'Reset Request Failed',
        error?.message || 'Unable to send password reset email. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismissAndNavigate = () => {
    setShowSuccessSheet(false);
    navigation.navigate('Login');
  };

  const handleResend = () => {
    if (!canResend || isLoading) return;
    handleResetPassword();
  };

  const safeTopPadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 12
  ) + 8;

  const formattedTimer = timer < 10 ? `00:0${timer}` : `00:${timer}`;

  return (
    <View style={styles.container}>
      <StatusBar
        backgroundColor={colors.BACKGROUND_COLOR}
        barStyle="light-content"
        translucent
      />

      {/* Ambient Radial Top Glow - exact match to LoginScreen */}
      <View style={styles.ambientTopGlow} pointerEvents="none">
        <LinearGradient
          colors={['rgba(124, 58, 237, 0.18)', 'rgba(0, 122, 255, 0.08)', 'transparent']}
          style={StyleSheet.absoluteFillObject}
        />
      </View>

      {/* Top Header Bar */}
      <View style={[styles.headerBar, { paddingTop: safeTopPadding }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go Back">
          <Ionicons name="chevron-back" size={20} color={colors.TITLE_COLOR} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Access Recovery</Text>

        <View style={styles.securityBadge}>
          <MaterialIcons
            name="verified-user"
            size={18}
            color={colors.PRIMARY_COLOR}
          />
        </View>
      </View>

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}>
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(insets.bottom, 20) + 16 },
            ]}
            showsVerticalScrollIndicator={false}>
            
            {/* Central Visual Stage: Concentric Pulsing Rings & Holographic Badge */}
            <Animated.View
              entering={FadeInDown.duration(600).delay(100)}
              style={styles.centralStageContainer}>
              {/* Outer Pulsing Ring 1 (#007AFF) */}
              <Animated.View style={[styles.ringOuter, animatedRingStyle]} />

              {/* Inner Concentric Ring 2 (#06B6D4) */}
              <View style={styles.ringInner} />

              {/* Central 80x80 Glassmorphic Badge */}
              <View style={styles.badgeGlass}>
                {/* 3D Holographic Inner Core */}
                <LinearGradient
                  colors={[colors.PRIMARY_COLOR, colors.CYAN_ACCENT]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.coreGradient}>
                  <MaterialIcons name="lock" size={28} color="#FFFFFF" />
                  <MaterialIcons
                    name="auto-awesome"
                    size={15}
                    color="#ACE4FF"
                    style={styles.sparkleIcon}
                  />
                </LinearGradient>
              </View>
            </Animated.View>

            {/* Typography Header & Explanatory Copy */}
            <Animated.View
              entering={FadeInDown.duration(600).delay(200)}
              style={styles.textContainer}>
              <Text style={styles.mainTitle}>Reset Your Password</Text>
              <Text style={styles.subText}>
                Enter the email associated with your VIP account and we will send a
                recovery token with sync reset instructions.
              </Text>
            </Animated.View>

            {/* Form Section */}
            <Animated.View
              entering={FadeInDown.duration(600).delay(300)}
              style={styles.formContainer}>
              {/* Email Input Container */}
              <View
                style={[
                  styles.inputBox,
                  isEmailFocused && styles.inputBoxFocused,
                ]}>
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color={isEmailFocused ? colors.PRIMARY_COLOR : colors.SUB_TITLE_COLOR}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder="registered@email.com"
                  placeholderTextColor={colors.MUTED_COLOR}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                  onFocus={() => setIsEmailFocused(true)}
                  onBlur={() => setIsEmailFocused(false)}
                />
              </View>

              {/* Primary Action Button */}
              <TouchableOpacity
                onPress={handleResetPassword}
                disabled={isLoading}
                activeOpacity={0.85}
                style={styles.submitButtonWrapper}>
                <LinearGradient
                  colors={[colors.PRIMARY_COLOR, colors.CYAN_ACCENT]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.submitButton}>
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={styles.submitButtonText}>
                        {isLinkSent ? 'Link Sent' : 'Send Recovery Link'}
                      </Text>
                      <Ionicons
                        name={isLinkSent ? 'checkmark-done' : 'send'}
                        size={17}
                        color="#FFFFFF"
                        style={styles.sendIcon}
                      />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              {/* Dynamic Live Sent Alert Notice */}
              {isLinkSent && (
                <Animated.View
                  entering={FadeInUp.duration(400)}
                  style={styles.successNotice}>
                  <View style={styles.successNoticeHeader}>
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={colors.CYAN_ACCENT}
                    />
                    <Text style={styles.successNoticeTitle}>
                      Recovery link dispatched!
                    </Text>
                  </View>
                  <Text style={styles.successNoticeSubtitle}>
                    Check your inbox or spam folder. Redirecting to Sign In...
                  </Text>
                </Animated.View>
              )}

              {/* Resend Timer Capsule Pill */}
              <View style={styles.timerCapsuleWrapper}>
                <TouchableOpacity
                  onPress={handleResend}
                  disabled={!canResend || isLoading}
                  activeOpacity={0.7}
                  style={styles.timerCapsule}>
                  <Ionicons
                    name="time-outline"
                    size={14}
                    color={colors.SUB_TITLE_COLOR}
                  />
                  <Text style={styles.timerLabel}>Resend available in</Text>
                  <Text
                    style={[
                      styles.timerValue,
                      canResend && styles.timerValueActive,
                    ]}>
                    {canResend ? 'Now' : formattedTimer}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Return Link */}
              <TouchableOpacity
                onPress={() => navigation.navigate('Login')}
                activeOpacity={0.7}
                style={styles.returnLink}>
                <Ionicons
                  name="arrow-back"
                  size={16}
                  color={colors.SUB_TITLE_COLOR}
                />
                <Text style={styles.returnLinkText}>Return to Sign In</Text>
              </TouchableOpacity>
            </Animated.View>

            {/* Bottom Subtle Brand Stamp */}
            <View style={styles.footerStamp}>
              <Text style={styles.footerStampText}>CINE-SYNC VIP PLATFORM</Text>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>

      {/* Recovery Sent Bottom Sheet Popup Modal */}
      <Modal
        visible={showSuccessSheet}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={handleDismissAndNavigate}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdropTouch}
            activeOpacity={1}
            onPress={handleDismissAndNavigate}
          />
          <View
            style={[
              styles.sheetContent,
              { paddingBottom: Math.max(insets.bottom, 24) + 12 },
            ]}>
            {/* Sheet Handle */}
            <View style={styles.sheetHandle} />

            {/* Glowing Icon */}
            <View style={styles.sheetIconWrapper}>
              <LinearGradient
                colors={['rgba(0, 122, 255, 0.25)', 'rgba(6, 182, 212, 0.2)']}
                style={styles.sheetIconCircle}>
                <Ionicons
                  name="checkmark-circle"
                  size={46}
                  color={colors.CYAN_ACCENT}
                />
              </LinearGradient>
            </View>

            {/* Title & Details */}
            <Text style={styles.sheetTitle}>Recovery Link Dispatched</Text>
            <Text style={styles.sheetSubtitle}>
              A password reset link has been sent to{' '}
              <Text style={styles.sheetEmailHighlight}>{email.trim()}</Text>.
              {'\n'}Please check your inbox or spam folder.
            </Text>

            {/* Primary Dismiss Button */}
            <TouchableOpacity
              onPress={handleDismissAndNavigate}
              activeOpacity={0.85}
              style={styles.sheetButtonWrapper}>
              <LinearGradient
                colors={[colors.PRIMARY_COLOR, colors.CYAN_ACCENT]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.sheetButton}>
                <Text style={styles.sheetButtonText}>Okay</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
  },
  // Ambient radial top glow
  ambientTopGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 380,
  },
  // Top Header Bar
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.TITLE_COLOR,
    letterSpacing: 0.5,
  },
  securityBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  // Central Visual Stage
  centralStageContainer: {
    width: 130,
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
    position: 'relative',
  },
  ringOuter: {
    position: 'absolute',
    width: 124,
    height: 124,
    borderRadius: 62,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.35)',
    backgroundColor: 'rgba(0, 122, 255, 0.08)',
  },
  ringInner: {
    position: 'absolute',
    width: 106,
    height: 106,
    borderRadius: 53,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.4)',
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
  },
  badgeGlass: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.SURFACE_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 10,
  },
  coreGradient: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  sparkleIcon: {
    position: 'absolute',
    top: -2,
    right: -2,
  },
  // Typography
  textContainer: {
    alignItems: 'center',
    marginBottom: 26,
    paddingHorizontal: 12,
  },
  mainTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.TITLE_COLOR,
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  subText: {
    fontSize: 14,
    color: colors.SUB_TITLE_COLOR,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
  },
  // Form Section
  formContainer: {
    width: '100%',
    maxWidth: 330,
    gap: 16,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 54,
    borderRadius: 16,
    backgroundColor: colors.SURFACE_COLOR,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    paddingHorizontal: 16,
  },
  inputBoxFocused: {
    borderColor: colors.PRIMARY_COLOR,
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  inputIcon: {
    marginRight: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: colors.TITLE_COLOR,
    paddingVertical: 0,
  },
  submitButtonWrapper: {
    width: '100%',
    borderRadius: 14,
    shadowColor: colors.CYAN_ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  submitButton: {
    height: 50,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  sendIcon: {
    transform: [{ rotate: '-12deg' }],
  },
  // Success Notice
  successNotice: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  successNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  successNoticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.TITLE_COLOR,
  },
  successNoticeSubtitle: {
    fontSize: 11,
    color: colors.SUB_TITLE_COLOR,
    textAlign: 'center',
  },
  // Resend Timer Capsule
  timerCapsuleWrapper: {
    alignItems: 'center',
    marginTop: 4,
  },
  timerCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  timerLabel: {
    fontSize: 12,
    color: colors.SUB_TITLE_COLOR,
  },
  timerValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.CYAN_ACCENT,
    letterSpacing: 0.5,
  },
  timerValueActive: {
    textDecorationLine: 'underline',
  },
  // Return Link
  returnLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
  },
  returnLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.SUB_TITLE_COLOR,
  },
  // Footer Stamp
  footerStamp: {
    marginTop: 32,
    alignItems: 'center',
  },
  footerStampText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.MUTED_COLOR,
    letterSpacing: 1.5,
  },
  // Bottom Sheet Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalBackdropTouch: {
    flex: 1,
  },
  sheetContent: {
    backgroundColor: colors.SURFACE_COLOR,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 14,
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  sheetHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginBottom: 20,
  },
  sheetIconWrapper: {
    marginBottom: 16,
  },
  sheetIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.TITLE_COLOR,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  sheetSubtitle: {
    fontSize: 14,
    color: colors.SUB_TITLE_COLOR,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    paddingHorizontal: 12,
  },
  sheetEmailHighlight: {
    color: colors.CYAN_ACCENT,
    fontWeight: '700',
  },
  sheetButtonWrapper: {
    width: '100%',
    borderRadius: 14,
    shadowColor: colors.CYAN_ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  sheetButton: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
});

export default ForgetPasswordScreen;
