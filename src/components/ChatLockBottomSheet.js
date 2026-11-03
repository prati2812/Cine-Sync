import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
  Platform,
  ActivityIndicator,
  Easing,
  Dimensions,
  Keyboard,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import LinearGradient from 'react-native-linear-gradient';
import colors from '../theme/Colors';
import {
  hasChatLockPasscode,
  setChatLockPasscode,
  verifyChatLockPasscode,
} from '../functions/chatLockService';
import { auth } from '../config/firebase';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Cine-Sync Alphanumeric Chat Lock Bottom Sheet
 * Slide-up Bottom Sheet for passcode verification, setup, and removal.
 * Built with dynamic keyboard offset tracking so it never hides behind the keyboard.
 * Strictly adheres to Cine-Sync workspace guidelines: bottom sheet presentation,
 * squircle design, ambient top glow gradient, safe-area insets, and zero raw emojis.
 */
const ChatLockBottomSheet = ({
  visible,
  mode = 'unlock', // 'unlock' | 'setup' | 'remove'
  title,
  subtitle,
  userName,
  targetUserName,
  onSuccess,
  onClose,
  onCancel,
}) => {
  const insets = useSafeAreaInsets();
  const effectiveUserName = userName || targetUserName || 'Chat';

  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [isSecure, setIsSecure] = useState(true);
  const [isSecureConfirm, setIsSecureConfirm] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeMode, setActiveMode] = useState(mode);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const isClosingRef = useRef(false);
  const inputRef = useRef(null);
  const slideAnim = useRef(new Animated.Value(450)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const keyboardAnim = useRef(new Animated.Value(0)).current;

  // ── Track Keyboard Height Dynamically on Both Android & iOS ──
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const h = e?.endCoordinates?.height || 0;
      setIsKeyboardVisible(true);

      // On Android with translucent modal, the system navigation bar / gesture bar inset is NOT included
      // in the reported IME keyboard height. We add insets.bottom (or minimum 28px) plus an aesthetic cushion.
      const androidNavOffset = Platform.OS === 'android' ? Math.max(insets.bottom, 28) : 0;
      const targetHeight = h + androidNavOffset + 14;

      Animated.timing(keyboardAnim, {
        toValue: targetHeight,
        duration: Platform.OS === 'ios' ? (e?.duration || 250) : 180,
        easing: Platform.OS === 'ios' ? Easing.out(Easing.ease) : Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    });

    const hideSub = Keyboard.addListener(hideEvent, (e) => {
      setIsKeyboardVisible(false);

      Animated.timing(keyboardAnim, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? (e?.duration || 220) : 150,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [insets.bottom, keyboardAnim]);

  const triggerClose = (postCloseCallback) => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    Keyboard.dismiss();

    Animated.parallel([
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 450,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(keyboardAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: false,
      }),
    ]).start(() => {
      isClosingRef.current = false;
      const callback = onClose || onCancel;
      if (typeof callback === 'function') {
        callback();
      }
      if (typeof postCloseCallback === 'function') {
        postCloseCallback();
      }
    });
  };

  useEffect(() => {
    if (visible) {
      isClosingRef.current = false;
      setPasscode('');
      setConfirmPasscode('');
      setErrorMessage('');
      setIsLoading(false);

      // Check if user has set a passcode yet
      const currentUid = auth().currentUser?.uid;
      if (currentUid) {
        hasChatLockPasscode(currentUid).then((hasPin) => {
          if (!hasPin && mode !== 'setup') {
            setActiveMode('setup');
          } else {
            setActiveMode(mode);
          }
        });
      }

      // Reset & animate slide up
      backdropAnim.setValue(0);
      slideAnim.setValue(450);
      keyboardAnim.setValue(0);

      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 65,
          friction: 10,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Gently focus input once sheet has slid in
        const timer = setTimeout(() => {
          inputRef.current?.focus();
        }, 80);
        return () => clearTimeout(timer);
      });
    } else {
      slideAnim.setValue(450);
      backdropAnim.setValue(0);
      keyboardAnim.setValue(0);
    }
  }, [visible, mode, backdropAnim, keyboardAnim, slideAnim]);

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleAction = async () => {
    const currentUid = auth().currentUser?.uid;
    if (!currentUid) {
      setErrorMessage('User session expired. Please sign in again.');
      return;
    }

    const trimmed = passcode.trim();
    if (!trimmed) {
      setErrorMessage('Please enter your alphanumeric passcode.');
      triggerShake();
      return;
    }

    if (activeMode === 'setup') {
      if (trimmed.length < 3) {
        setErrorMessage('Passcode must be at least 3 characters.');
        triggerShake();
        return;
      }
      if (trimmed !== confirmPasscode.trim()) {
        setErrorMessage('Passcodes do not match. Please verify.');
        triggerShake();
        return;
      }

      setIsLoading(true);
      const saved = await setChatLockPasscode(currentUid, trimmed);
      setIsLoading(false);

      if (saved) {
        triggerClose(() => {
          if (onSuccess) onSuccess();
        });
      } else {
        setErrorMessage('Failed to save passcode. Please try again.');
        triggerShake();
      }
      return;
    }

    // Unlock or Remove Mode: Verify passcode
    setIsLoading(true);
    const isValid = await verifyChatLockPasscode(currentUid, trimmed);
    setIsLoading(false);

    if (isValid) {
      triggerClose(() => {
        if (onSuccess) onSuccess();
      });
    } else {
      setErrorMessage('Incorrect passcode. Please try again.');
      triggerShake();
    }
  };

  const getHeaderTitle = () => {
    if (title) return title;
    if (activeMode === 'setup') {
      return effectiveUserName ? `Lock @${effectiveUserName}` : 'Lock Conversation';
    }
    if (activeMode === 'remove') return `Unlock @${effectiveUserName}`;
    return effectiveUserName ? `Unlock @${effectiveUserName}` : 'Locked Private Chat';
  };

  const getHeaderSubtitle = () => {
    if (subtitle) return subtitle;
    if (activeMode === 'setup') {
      return effectiveUserName
        ? `Set an alphanumeric passcode to safeguard chat with @${effectiveUserName}.`
        : 'Set an alphanumeric passcode to safeguard your locked conversations.';
    }
    if (activeMode === 'remove') {
      return `Enter your passcode to remove @${effectiveUserName} from your locked vault.`;
    }
    return `Enter your alphanumeric passcode to access @${effectiveUserName}.`;
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => triggerClose()}
    >
      <View style={styles.sheetOverlay} pointerEvents="box-none">
        {/* Animated Dark Frosted Backdrop */}
        <TouchableWithoutFeedback onPress={() => triggerClose()}>
          <Animated.View
            style={[
              styles.backdrop,
              {
                opacity: backdropAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.88],
                }),
              },
            ]}
          />
        </TouchableWithoutFeedback>

        {/* Dynamic Keyboard-Lifting Container */}
        <Animated.View
          style={[
            styles.keyboardContainer,
            { marginBottom: keyboardAnim },
          ]}
          pointerEvents="box-none"
        >
          {/* Slide-Up Bottom Sheet Card */}
          <Animated.View
            style={[
              styles.sheetCard,
              {
                transform: [{ translateY: slideAnim }, { translateX: shakeAnim }],
                paddingBottom: isKeyboardVisible
                  ? 20
                  : Math.max(insets.bottom, 16) + 16,
              },
            ]}
          >
            {/* Top Atmospheric Ambient Glow Gradient */}
            <LinearGradient
              colors={['rgba(124, 58, 237, 0.20)', 'rgba(15, 15, 26, 0.95)', colors.SURFACE_COLOR]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 0.55 }}
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />

            {/* Draggable Handle Indicator Pill */}
            <View style={styles.dragIndicatorWrap}>
              <View style={styles.dragIndicator} />
            </View>

            {/* Close Button */}
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => triggerClose()}
              activeOpacity={0.75}
            >
              <MaterialIcons name="close" size={18} color="rgba(255, 255, 255, 0.7)" />
            </TouchableOpacity>

            {/* Scrollable Sheet Content to handle all screen heights without hiding */}
            <ScrollView
              style={styles.sheetScrollView}
              contentContainerStyle={styles.sheetScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              {/* Clean Lock/Unlock Icon (No Background Color) */}
              <View style={styles.iconEmblemWrap}>
                <MaterialIcons
                  name={activeMode === 'remove' ? 'lock-open' : 'lock'}
                  size={32}
                  color={activeMode === 'remove' ? colors.LIVE_RED : colors.FILM_GOLD}
                />
              </View>

              {/* Title & Subtitle */}
              <Text style={styles.titleText}>{getHeaderTitle()}</Text>
              <Text style={styles.subtitleText}>{getHeaderSubtitle()}</Text>

              {/* Passcode Input Box */}
              <View style={[styles.inputBox, errorMessage ? styles.inputBoxError : null]}>
                <MaterialIcons name="vpn-key" size={20} color={colors.CYAN_ACCENT} style={{ marginRight: 10 }} />
                <TextInput
                  ref={inputRef}
                  style={styles.inputField}
                  placeholder={activeMode === 'setup' ? 'Enter new passcode' : 'Enter passcode'}
                  placeholderTextColor="rgba(255, 255, 255, 0.4)"
                  secureTextEntry={isSecure}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={passcode}
                  onChangeText={(text) => {
                    setPasscode(text);
                    if (errorMessage) setErrorMessage('');
                  }}
                  onSubmitEditing={activeMode === 'setup' ? null : handleAction}
                  returnKeyType={activeMode === 'setup' ? 'next' : 'done'}
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setIsSecure(!isSecure)}
                  activeOpacity={0.7}
                >
                  <MaterialIcons
                    name={isSecure ? 'visibility' : 'visibility-off'}
                    size={18}
                    color="rgba(255, 255, 255, 0.6)"
                  />
                </TouchableOpacity>
              </View>

              {/* Confirm Passcode (Setup Mode) */}
              {activeMode === 'setup' && (
                <View style={[styles.inputBox, { marginTop: 10 }, errorMessage ? styles.inputBoxError : null]}>
                  <MaterialIcons name="verified-user" size={20} color={colors.ACCEPT_GREEN} style={{ marginRight: 10 }} />
                  <TextInput
                    style={styles.inputField}
                    placeholder="Confirm passcode"
                    placeholderTextColor="rgba(255, 255, 255, 0.4)"
                    secureTextEntry={isSecureConfirm}
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={confirmPasscode}
                    onChangeText={(text) => {
                      setConfirmPasscode(text);
                      if (errorMessage) setErrorMessage('');
                    }}
                    onSubmitEditing={handleAction}
                    returnKeyType="done"
                  />
                  <TouchableOpacity
                    style={styles.eyeBtn}
                    onPress={() => setIsSecureConfirm(!isSecureConfirm)}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons
                      name={isSecureConfirm ? 'visibility' : 'visibility-off'}
                      size={18}
                      color="rgba(255, 255, 255, 0.6)"
                    />
                  </TouchableOpacity>
                </View>
              )}

              {/* Error Row */}
              {Boolean(errorMessage) && (
                <View style={styles.errorRow}>
                  <MaterialIcons name="error-outline" size={14} color={colors.LIVE_RED} style={{ marginRight: 4 }} />
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              )}

              {/* Bottom Action Button (Full Width) */}
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={styles.confirmBtn}
                  onPress={handleAction}
                  disabled={isLoading}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={
                      activeMode === 'remove'
                        ? [colors.DELETE_RED_COLOR, '#B91C1C']
                        : [colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.confirmBtnGradient}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <>
                        <MaterialIcons
                          name={activeMode === 'remove' ? 'lock-open' : activeMode === 'setup' ? 'lock' : 'vpn-key'}
                          size={18}
                          color="#FFF"
                          style={{ marginRight: 8 }}
                        />
                        <Text style={styles.confirmBtnText}>
                          {activeMode === 'setup'
                            ? 'Lock Chat'
                            : activeMode === 'remove'
                            ? 'Unlock Conversation'
                            : title === 'Unlock Vault' || effectiveUserName === 'Vault'
                            ? 'Unlock Vault'
                            : 'Unlock'}
                        </Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  keyboardContainer: {
    width: '100%',
  },
  sheetCard: {
    backgroundColor: colors.SURFACE_COLOR,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 20,
    paddingTop: 10,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 25,
    maxHeight: SCREEN_HEIGHT * 0.88,
  },
  dragIndicatorWrap: {
    alignItems: 'center',
    paddingVertical: 4,
    marginBottom: 6,
    width: '100%',
  },
  dragIndicator: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  sheetScrollView: {
    width: '100%',
  },
  sheetScrollContent: {
    alignItems: 'center',
    paddingBottom: 4,
  },
  iconEmblemWrap: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  titleText: {
    color: colors.TITLE_COLOR,
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitleText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  inputBox: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 14,
    height: 48,
  },
  inputBoxError: {
    borderColor: colors.LIVE_RED,
  },
  inputField: {
    flex: 1,
    color: colors.TITLE_COLOR,
    fontSize: 15,
    paddingVertical: 0,
  },
  eyeBtn: {
    padding: 6,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 4,
  },
  errorText: {
    color: colors.LIVE_RED,
    fontSize: 12,
    fontWeight: '500',
  },
  actionsRow: {
    width: '100%',
    marginTop: 18,
    marginBottom: 6,
  },
  confirmBtn: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    overflow: 'hidden',
  },
  confirmBtnGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 16,
  },
  confirmBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});

export default ChatLockBottomSheet;
