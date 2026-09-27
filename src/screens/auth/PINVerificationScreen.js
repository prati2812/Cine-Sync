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
import { showCineAlert } from '../../components/CineAlert';
import colors from '../../theme/Colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PINVerificationScreen = ({ onSuccess, navigation, onBack }) => {
  const canGoBack = Boolean(onBack || navigation?.canGoBack?.());
  const insets = useSafeAreaInsets();
  const safeTopPadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 12
  ) + 8;
  const safeBottomPadding = Math.max(insets.bottom, 20);

  const [pin, setPin] = useState('');
  const [isMismatch, setIsMismatch] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const dotScales = useRef([...Array(4)].map(() => new Animated.Value(1))).current;
  const shakeAnimation = useRef(new Animated.Value(0)).current;

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

  const verifyPIN = useCallback(async (enteredPin) => {
    try {
      const storedPIN = await AsyncStorage.getItem('@app_lock_pin');
      if (enteredPin === storedPIN) {
        setIsSuccess(true);
        Vibration.vibrate(50);
        setTimeout(() => {
          if (onSuccess) {
            onSuccess();
          }
        }, 250);
      } else {
        Vibration.vibrate([100, 200, 100]);
        setIsMismatch(true);
        shakeError();
        setTimeout(() => {
          setPin('');
          setIsMismatch(false);
        }, 800);
      }
    } catch (error) {
      console.error('Error verifying PIN:', error);
      showCineAlert({
        type: 'danger',
        icon: 'error-outline',
        title: 'Verification Error',
        message: 'Could not verify App PIN.',
        confirmText: 'Retry',
        onConfirm: () => setPin(''),
      });
    }
  }, [onSuccess, shakeError]);

  useEffect(() => {
    if (pin.length === 4) {
      setTimeout(() => {
        verifyPIN(pin);
      }, 100);
    }
  }, [pin, verifyPIN]);

  const handleNumberPress = (digit) => {
    if (isMismatch || isSuccess) return;
    if (pin.length < 4) {
      animateDot(pin.length);
      setPin((prev) => prev + digit);
    }
  };

  const handleDelete = () => {
    if (isMismatch || isSuccess) return;
    setPin((prev) => prev.slice(0, -1));
  };

  const handleBiometricPress = () => {
    Vibration.vibrate(40);
    showCineAlert({
      type: 'action',
      icon: 'fingerprint',
      title: 'Biometric Unlock',
      message: 'Biometric Face ID / Fingerprint passkey can unlock Cine-Sync when enabled in Settings.',
      confirmText: 'OK',
    });
  };

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
      <View
        style={[
          styles.headerBar,
          { paddingTop: safeTopPadding },
          !canGoBack && styles.headerBarCentered,
        ]}
      >
        {canGoBack && (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={onBack || (() => navigation.goBack())}
            activeOpacity={0.75}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons name="arrow-back-ios-new" size={20} color={colors.TITLE_COLOR} />
          </TouchableOpacity>
        )}

        <View style={styles.headerBrand}>
          <LinearGradient
            colors={[colors.PRIMARY_COLOR_DARK, colors.PRIMARY_COLOR, colors.CYAN_ACCENT]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logoSquircle}
          >
            <MaterialIcons name="movie" size={18} color="#FFFFFF" />
          </LinearGradient>
          <Text style={styles.headerBrandTitle}>CINE-SYNC</Text>
        </View>

        {canGoBack ? <View style={styles.headerSpacer} /> : null}
      </View>

      {/* ── MAIN CONTENT ── */}
      <View style={[styles.contentContainer, { paddingBottom: safeBottomPadding }]}>
        {/* Hero Vault Capsule */}
        <View style={styles.vaultCapsuleWrapper}>
          <LinearGradient
            colors={
              isMismatch
                ? [colors.DELETE_RED_COLOR, 'rgba(239, 68, 68, 0.4)']
                : isSuccess
                ? [colors.ACCEPT_GREEN, colors.CYAN_ACCENT]
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
                    : 'lock'
                }
                size={34}
                color={
                  isMismatch
                    ? colors.DELETE_RED_COLOR
                    : isSuccess
                    ? colors.ACCEPT_GREEN
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
            {isMismatch
              ? 'Incorrect PIN'
              : isSuccess
              ? 'Access Granted'
              : 'Enter App PIN'}
          </Text>
          <Text style={styles.screenSubtitle}>
            {isMismatch
              ? 'Please try again.'
              : isSuccess
              ? 'Decrypting local vault...'
              : 'Please enter your 4-digit security PIN to unlock Cine-Sync.'}
          </Text>
        </View>

        {/* 4-Pod PIN Display Array (No black box artifacts) */}
        <Animated.View
          style={[
            styles.podsRow,
            { transform: [{ translateX: shakeAnimation }] },
          ]}
        >
          {[0, 1, 2, 3].map((index) => {
            const isFilled = pin.length > index;

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

        {/* Tactile Keypad (Clean Digits Only) */}
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
            onPress={handleDelete}
            activeOpacity={0.7}
          >
            <MaterialIcons name="backspace" size={22} color={colors.DELETE_RED_COLOR} />
          </TouchableOpacity>
        </View>

        {/* Hardware Reassurance Badge */}
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
// Keypad Button (Clean Digits Only)
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
// Styles
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

  // Header Bar
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
  headerBarCentered: {
    justifyContent: 'center',
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
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoSquircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBrandTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.TITLE_COLOR,
    letterSpacing: 1.2,
  },
  headerSpacer: {
    width: 38,
    height: 38,
  },

  // Main Content
  contentContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
  },

  // Vault Capsule
  vaultCapsuleWrapper: {
    marginTop: 8,
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
    gap: 6,
    maxWidth: 320,
    paddingHorizontal: 8,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.TITLE_COLOR,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  screenSubtitle: {
    fontSize: 13,
    color: colors.SUB_TITLE_COLOR,
    textAlign: 'center',
    lineHeight: 18,
  },

  // 4-Pod PIN Display (Clean, Zero black box artifact)
  podsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginVertical: 8,
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

  // Keypad
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

  // Footer Reassurance
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

export default PINVerificationScreen;