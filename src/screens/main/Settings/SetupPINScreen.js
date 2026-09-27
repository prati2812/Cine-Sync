import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Vibration,
  Animated,
  Dimensions,
  StatusBar,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import LinearGradient from 'react-native-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showCineAlert } from '../../../components/CineAlert';
import colors from '../../../theme/Colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SetupPINScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const safeTopPadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 12
  ) + 8;
  const safeBottomPadding = Math.max(insets.bottom, 20);

  // Flow State
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [isMismatch, setIsMismatch] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Animations
  const dotScales = useRef([...Array(4)].map(() => new Animated.Value(1))).current;
  const shakeAnimation = useRef(new Animated.Value(0)).current;

  const currentPin = !isConfirming ? pin : confirmPin;

  // ──────────────────────────────────────────────────────────────
  // Animation Triggers
  // ──────────────────────────────────────────────────────────────
  const animateDot = useCallback((index) => {
    if (dotScales[index]) {
      Animated.sequence([
        Animated.spring(dotScales[index], {
          toValue: 1.18,
          useNativeDriver: true,
          speed: 25,
          bounciness: 8,
        }),
        Animated.spring(dotScales[index], {
          toValue: 1,
          useNativeDriver: true,
          speed: 25,
          bounciness: 4,
        }),
      ]).start();
    }
  }, [dotScales]);

  const shakeError = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnimation, {
        toValue: 10,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: -10,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: 10,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: 0,
        duration: 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, [shakeAnimation]);

  // ──────────────────────────────────────────────────────────────
  // Completion Logic
  // ──────────────────────────────────────────────────────────────
  const handlePinComplete = useCallback(async (verifiedConfirmPin) => {
    if (pin === verifiedConfirmPin) {
      try {
        setIsSuccess(true);
        Vibration.vibrate([80, 80, 80]);
        await AsyncStorage.setItem('@app_lock_pin', pin);

        setTimeout(() => {
          showCineAlert({
            type: 'success',
            icon: 'lock',
            title: 'App Lock Secured',
            message: 'Your 4-digit App PIN has been enabled. Cine-Sync will now require this PIN on launch.',
            confirmText: 'Done',
            onConfirm: () => {
              navigation.goBack();
            },
          });
        }, 300);
      } catch (error) {
        showCineAlert({
          type: 'danger',
          icon: 'error-outline',
          title: 'Error Saving PIN',
          message: error.message || 'Could not save PIN to local keychain.',
          confirmText: 'Retry',
          onConfirm: () => {
            setPin('');
            setConfirmPin('');
            setIsConfirming(false);
          },
        });
      }
    } else {
      Vibration.vibrate([100, 200, 100]);
      setIsMismatch(true);
      shakeError();

      setTimeout(() => {
        setConfirmPin('');
        setIsMismatch(false);
      }, 900);
    }
  }, [pin, shakeError, navigation]);

  useEffect(() => {
    if (pin.length === 4 && !isConfirming) {
      Vibration.vibrate(40);
      setTimeout(() => {
        setIsConfirming(true);
      }, 200);
    }
  }, [pin, isConfirming]);

  useEffect(() => {
    if (isConfirming && confirmPin.length === 4) {
      Vibration.vibrate(40);
      setTimeout(() => {
        handlePinComplete(confirmPin);
      }, 150);
    }
  }, [confirmPin, isConfirming, handlePinComplete]);

  // ──────────────────────────────────────────────────────────────
  // Keypad Actions
  // ──────────────────────────────────────────────────────────────
  const handleNumberPress = (digit) => {
    if (isMismatch || isSuccess) return;

    if (!isConfirming) {
      if (pin.length < 4) {
        animateDot(pin.length);
        setPin((prev) => prev + digit);
      }
    } else {
      if (confirmPin.length < 4) {
        animateDot(confirmPin.length);
        setConfirmPin((prev) => prev + digit);
      }
    }
  };

  const handleBackspace = () => {
    if (isMismatch || isSuccess) return;

    if (!isConfirming) {
      setPin((prev) => prev.slice(0, -1));
    } else {
      setConfirmPin((prev) => prev.slice(0, -1));
    }
  };

  const handleBiometricPress = () => {
    Vibration.vibrate(40);
    showCineAlert({
      type: 'action',
      icon: 'fingerprint',
      title: 'Biometric Passkey',
      message: 'Biometric authentication (Face ID / Fingerprint) can be used alongside this app lock PIN.',
      confirmText: 'OK',
    });
  };

  // ──────────────────────────────────────────────────────────────
  // Dynamic Headings & Subtitles for App Lock
  // ──────────────────────────────────────────────────────────────
  const titleText = isMismatch
    ? 'PIN Mismatch'
    : isSuccess
    ? 'App Lock Secured'
    : !isConfirming
    ? 'Create App PIN'
    : 'Confirm App PIN';

  const subtitleText = isMismatch
    ? 'The PINs did not match. Please re-enter.'
    : isSuccess
    ? 'Your 4-digit App PIN has been enabled successfully!'
    : !isConfirming
    ? 'Choose a 4-digit security PIN to lock and protect Cine-Sync on your device.'
    : 'Re-enter the 4 digits to confirm your app lock PIN.';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Atmospheric Top Ambient Glow Sheen */}
      <LinearGradient
        colors={['rgba(124, 58, 237, 0.24)', 'rgba(0, 122, 255, 0.10)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.ambientTopGlow}
        pointerEvents="none"
      />

      {/* ── 1. HEADER BAR ── */}
      <View style={[styles.headerBar, { paddingTop: safeTopPadding }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.75}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons name="arrow-back-ios-new" size={20} color={colors.TITLE_COLOR} />
        </TouchableOpacity>

        <Text style={styles.headerTitleText} numberOfLines={1}>
          App Lock PIN Setup
        </Text>

        <View style={styles.headerSpacer} />
      </View>

      {/* ── MAIN CONTENT ── */}
      <View style={[styles.contentContainer, { paddingBottom: safeBottomPadding }]}>
        {/* Progress Pill Track */}
        <View style={styles.progressTrackContainer}>
          <View style={styles.progressLabelRow}>
            <Text style={styles.stepLabelText}>
              {!isConfirming ? 'STEP 1 OF 2: CREATE APP PIN' : 'STEP 2 OF 2: CONFIRM APP PIN'}
            </Text>
            <Text style={styles.stepCountText}>{!isConfirming ? '1/2' : '2/2'}</Text>
          </View>
          <View style={styles.progressBarBg}>
            <LinearGradient
              colors={[colors.PRIMARY_COLOR, colors.CYAN_ACCENT]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.progressSegActive}
            />
            {isConfirming ? (
              <LinearGradient
                colors={[colors.CYAN_ACCENT, colors.PURPLE_ACCENT]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.progressSegActive}
              />
            ) : (
              <View style={styles.progressSegInactive} />
            )}
          </View>
        </View>

        {/* Hero Vault Emblem Capsule */}
        <View style={styles.vaultCapsuleWrapper}>
          <LinearGradient
            colors={
              isMismatch
                ? [colors.DELETE_RED_COLOR, 'rgba(239, 68, 68, 0.4)']
                : isSuccess
                ? [colors.ACCEPT_GREEN, colors.CYAN_ACCENT]
                : isConfirming
                ? [colors.CYAN_ACCENT, colors.PURPLE_ACCENT]
                : [colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.vaultCapsuleBorder}
          >
            <View style={styles.vaultCapsuleCore}>
              <MaterialIcons
                name={
                  isMismatch
                    ? 'error-outline'
                    : isSuccess
                    ? 'lock-open'
                    : isConfirming
                    ? 'verified'
                    : 'lock'
                }
                size={34}
                color={
                  isMismatch
                    ? colors.DELETE_RED_COLOR
                    : isSuccess
                    ? colors.ACCEPT_GREEN
                    : isConfirming
                    ? colors.CYAN_ACCENT
                    : colors.PRIMARY_COLOR
                }
              />
            </View>
          </LinearGradient>
        </View>

        {/* Title & Description */}
        <View style={styles.titleTextWrapper}>
          <Text
            style={[
              styles.screenTitle,
              isMismatch && { color: colors.DELETE_RED_COLOR },
              isSuccess && { color: colors.ACCEPT_GREEN },
            ]}
          >
            {titleText}
          </Text>
          <Text style={styles.screenSubtitle}>{subtitleText}</Text>
        </View>

        {/* 4-Pod PIN Display Array (Strict Squircles, No Black Box Artifacts) */}
        <Animated.View
          style={[
            styles.podsRow,
            { transform: [{ translateX: shakeAnimation }] },
          ]}
        >
          {[0, 1, 2, 3].map((index) => {
            const isFilled = currentPin.length > index;

            return (
              <Animated.View
                key={index}
                style={[
                  styles.pinPod,
                  isFilled && styles.pinPodFilled,
                  isMismatch && styles.pinPodMismatch,
                  { transform: [{ scale: dotScales[index] }] },
                ]}
              >
                {isFilled ? (
                  <View style={styles.podFilledDot} />
                ) : (
                  <View style={styles.podDash} />
                )}
              </Animated.View>
            );
          })}
        </Animated.View>

        {/* Tactile Haptic Keypad Matrix (Squircles 16px, Clean Digits Only) */}
        <View style={styles.keypadGrid}>
          {/* Row 1 */}
          <KeypadButton digit="1" onPress={handleNumberPress} />
          <KeypadButton digit="2" onPress={handleNumberPress} />
          <KeypadButton digit="3" onPress={handleNumberPress} />

          {/* Row 2 */}
          <KeypadButton digit="4" onPress={handleNumberPress} />
          <KeypadButton digit="5" onPress={handleNumberPress} />
          <KeypadButton digit="6" onPress={handleNumberPress} />

          {/* Row 3 */}
          <KeypadButton digit="7" onPress={handleNumberPress} />
          <KeypadButton digit="8" onPress={handleNumberPress} />
          <KeypadButton digit="9" onPress={handleNumberPress} />

          {/* Row 4 */}
          <TouchableOpacity
            style={[styles.keypadBtn, styles.specialKeypadBtn]}
            onPress={handleBiometricPress}
            activeOpacity={0.7}
          >
            <MaterialIcons name="fingerprint" size={26} color={colors.CYAN_ACCENT} />
          </TouchableOpacity>

          <KeypadButton digit="0" onPress={handleNumberPress} />

          <TouchableOpacity
            style={[styles.keypadBtn, styles.specialKeypadBtn]}
            onPress={handleBackspace}
            activeOpacity={0.7}
          >
            <MaterialIcons name="backspace" size={22} color={colors.DELETE_RED_COLOR} />
          </TouchableOpacity>
        </View>

        {/* Reassurance Hardware Badge Footer */}
        <View style={styles.hardwareBadgeRow}>
          <MaterialIcons name="verified-user" size={17} color={colors.FILM_GOLD} />
          <Text style={styles.hardwareBadgeText}>
            Protected locally inside your secure enclave & hardware keystore.
          </Text>
        </View>
      </View>
    </View>
  );
};

// ──────────────────────────────────────────────────────────────
// Keypad Button Component (Clean Numbers Only, No ABC/DEF)
// ──────────────────────────────────────────────────────────────
const KeypadButton = ({ digit, onPress }) => (
  <TouchableOpacity
    style={styles.keypadBtn}
    onPress={() => onPress(digit)}
    activeOpacity={0.75}
  >
    <Text style={styles.keypadDigitText}>{digit}</Text>
  </TouchableOpacity>
);

// ──────────────────────────────────────────────────────────────
// Styles (Strict Cine-Sync Theme Tokens & Squircle Standards)
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
    height: 320,
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
    fontSize: 15,
    fontWeight: '800',
    color: colors.TITLE_COLOR,
    letterSpacing: -0.2,
    flex: 1,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  headerSpacer: {
    width: 38,
    height: 38,
  },

  // ── Main Content Container ──
  contentContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
  },

  // Progress Pill Track
  progressTrackContainer: {
    width: '100%',
    maxWidth: 290,
    gap: 6,
  },
  progressLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepLabelText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: colors.CYAN_ACCENT,
    letterSpacing: 0.8,
  },
  stepCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.SUB_TITLE_COLOR,
  },
  progressBarBg: {
    height: 6,
    borderRadius: 4,
    backgroundColor: colors.SURFACE_ELEVATED,
    flexDirection: 'row',
    gap: 6,
    overflow: 'hidden',
  },
  progressSegActive: {
    flex: 1,
    height: '100%',
    borderRadius: 4,
  },
  progressSegInactive: {
    flex: 1,
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.SURFACE_ELEVATED,
  },

  // Hero Vault Capsule
  vaultCapsuleWrapper: {
    marginTop: 4,
    marginBottom: 4,
  },
  vaultCapsuleBorder: {
    padding: 2,
    borderRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: colors.PRIMARY_COLOR,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
    }),
  },
  vaultCapsuleCore: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: colors.SURFACE_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Title & Subtitle
  titleTextWrapper: {
    alignItems: 'center',
    gap: 4,
    maxWidth: 320,
    paddingHorizontal: 8,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.TITLE_COLOR,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  screenSubtitle: {
    fontSize: 12.5,
    color: colors.SUB_TITLE_COLOR,
    textAlign: 'center',
    lineHeight: 18,
  },

  // 4-Pod PIN Array (Zero black box shadow artifact)
  podsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginVertical: 4,
  },
  pinPod: {
    width: 52,
    height: 60,
    borderRadius: 14,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1.5,
    borderColor: colors.BORDER_SUBTLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinPodFilled: {
    borderColor: colors.PRIMARY_COLOR,
    backgroundColor: colors.SURFACE_ELEVATED,
    ...Platform.select({
      ios: {
        shadowColor: colors.PRIMARY_COLOR,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 10,
      },
    }),
  },
  pinPodMismatch: {
    borderColor: colors.DELETE_RED_COLOR,
    backgroundColor: colors.SURFACE_ELEVATED,
  },
  podDash: {
    width: 12,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  podFilledDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
  },

  // Keypad Grid (Clean Digits Only)
  keypadGrid: {
    width: '100%',
    maxWidth: 290,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  keypadBtn: {
    width: (290 - 20) / 3,
    height: 62,
    borderRadius: 16,
    backgroundColor: colors.SURFACE_COLOR,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  specialKeypadBtn: {
    backgroundColor: colors.SURFACE_ELEVATED,
  },
  keypadDigitText: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.TITLE_COLOR,
    textAlign: 'center',
  },

  // Reassurance Footer
  hardwareBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_COLOR,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    maxWidth: 320,
    marginTop: 4,
  },
  hardwareBadgeText: {
    fontSize: 11,
    color: colors.SUB_TITLE_COLOR,
    fontWeight: '500',
    flex: 1,
    lineHeight: 15,
  },
});

export default SetupPINScreen;