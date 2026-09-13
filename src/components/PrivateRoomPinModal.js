import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Animated,
  Easing,
  Platform,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import colors from '../theme/Colors';

const PrivateRoomPinModal = ({ visible, room, onClose, onSuccess }) => {
  const insets = useSafeAreaInsets();
  const [pinInput, setPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef(null);

  // Animations
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const sheetSlideAnim = useRef(new Animated.Value(200)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setPinInput('');
      setErrorMsg('');
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(sheetSlideAnim, {
          toValue: 0,
          duration: 250,
          easing: Easing.out(Easing.back(1.05)),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setTimeout(() => inputRef.current?.focus(), 150);
      });
    } else {
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(sheetSlideAnim, {
          toValue: 200,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 4, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleVerifyPin = () => {
    if (!room) return;
    const entered = pinInput.trim();
    if (entered.length < 4) {
      setErrorMsg('Please enter the 4-digit PIN');
      triggerShake();
      return;
    }

    if (String(room.pin) === entered) {
      setErrorMsg('');
      onClose();
      onSuccess(room);
    } else {
      setErrorMsg('Incorrect 4-digit PIN. Please try again.');
      triggerShake();
      setPinInput('');
      inputRef.current?.focus();
    }
  };

  const handlePinChange = text => {
    const numeric = text.replace(/[^0-9]/g, '').slice(0, 4);
    setPinInput(numeric);
    if (errorMsg) setErrorMsg('');
    if (numeric.length === 4) {
      // Auto verify when 4th digit is entered
      setTimeout(() => {
        if (!room) return;
        if (String(room.pin) === numeric) {
          setErrorMsg('');
          onClose();
          onSuccess(room);
        } else {
          setErrorMsg('Incorrect 4-digit PIN. Please try again.');
          triggerShake();
          setPinInput('');
          inputRef.current?.focus();
        }
      }, 120);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      transparent
      statusBarTranslucent
      animationType="none"
      visible={visible}
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardAvoid}
          >
            <TouchableWithoutFeedback>
              <Animated.View
                style={[
                  styles.sheetContainer,
                  {
                    transform: [{ translateY: sheetSlideAnim }, { translateX: shakeAnim }],
                    paddingBottom: Math.max(insets.bottom, 16) + 12,
                  },
                ]}
              >
                {/* Ambient Top Glow Linear Gradient */}
                <View style={styles.sheetTopGlow} pointerEvents="none">
                  <LinearGradient
                    colors={['rgba(255, 180, 0, 0.15)', 'rgba(124, 58, 237, 0.08)', 'transparent']}
                    style={StyleSheet.absoluteFillObject}
                  />
                </View>

                {/* Handle Bar */}
                <View style={styles.dragPill} />

                {/* Header */}
                <View style={styles.sheetHeader}>
                  <View style={styles.sheetIconBox}>
                    <MaterialIcons name="lock" size={20} color={colors.FILM_GOLD} />
                  </View>
                  <View style={styles.sheetHeaderTextCol}>
                    <Text style={styles.sheetTitle}>Private Screening</Text>
                    <Text style={styles.sheetSubtitle}>Enter the 4-digit PIN to unlock</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.closeBtnBox}
                    onPress={onClose}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialIcons name="close" size={18} color={colors.SUB_TITLE_COLOR} />
                  </TouchableOpacity>
                </View>

                {/* Room Info Banner */}
                {room && (
                  <View style={styles.roomBanner}>
                    {room.thumbnail ? (
                      <Image source={{ uri: room.thumbnail }} style={styles.roomThumb} />
                    ) : (
                      <View style={styles.roomThumbFallback}>
                        <MaterialIcons name="theaters" size={18} color={colors.FILM_GOLD} />
                      </View>
                    )}
                    <View style={styles.roomBannerTextCol}>
                      <Text style={styles.roomNameText} numberOfLines={1}>
                        {room.name || 'Private Screening'}
                      </Text>
                      <Text style={styles.roomHostText} numberOfLines={1}>
                        Hosted by {room.creator?.userName || room.creator?.email || 'Host'}
                      </Text>
                    </View>
                  </View>
                )}

                {/* 4-Digit PIN Boxes */}
                <TouchableOpacity
                  activeOpacity={1}
                  style={styles.digitBoxesRow}
                  onPress={() => inputRef.current?.focus()}
                >
                  {[0, 1, 2, 3].map(index => {
                    const digit = pinInput[index];
                    const isCurrent = index === pinInput.length;
                    return (
                      <View
                        key={index}
                        style={[
                          styles.digitBox,
                          isCurrent && styles.digitBoxActive,
                          digit && styles.digitBoxFilled,
                        ]}
                      >
                        {digit ? (
                          <Text style={styles.digitText}>{digit}</Text>
                        ) : isCurrent ? (
                          <View style={styles.cursorLine} />
                        ) : (
                          <Text style={styles.pinDash}>–</Text>
                        )}
                      </View>
                    );
                  })}
                </TouchableOpacity>

                {/* Hidden Input for Keyboard */}
                <TextInput
                  ref={inputRef}
                  style={styles.hiddenInput}
                  value={pinInput}
                  onChangeText={handlePinChange}
                  keyboardType="number-pad"
                  maxLength={4}
                  autoFocus
                />

                {/* Error Banner */}
                {errorMsg.length > 0 && (
                  <View style={styles.errorBanner}>
                    <MaterialIcons name="error-outline" size={14} color={colors.LIVE_RED} />
                    <Text style={styles.errorText}>{errorMsg}</Text>
                  </View>
                )}

                {/* Actions */}
                <TouchableOpacity
                  style={[styles.unlockBtn, pinInput.length < 4 && styles.unlockBtnDisabled]}
                  onPress={handleVerifyPin}
                  activeOpacity={0.88}
                  disabled={pinInput.length < 4}
                >
                  <LinearGradient
                    colors={
                      pinInput.length === 4
                        ? [colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]
                        : [colors.SURFACE_ELEVATED, colors.SURFACE_ELEVATED]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.unlockGradient}
                  >
                    <MaterialIcons
                      name="vpn-key"
                      size={18}
                      color={pinInput.length === 4 ? colors.TITLE_COLOR : colors.MUTED_COLOR}
                    />
                    <Text
                      style={[
                        styles.unlockBtnText,
                        pinInput.length < 4 && { color: colors.MUTED_COLOR },
                      ]}
                    >
                      Unlock & Enter Room
                    </Text>
                    <MaterialIcons
                      name="arrow-forward"
                      size={16}
                      color={pinInput.length === 4 ? colors.TITLE_COLOR : colors.MUTED_COLOR}
                    />
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 4, 10, 0.85)',
    justifyContent: 'flex-end',
  },
  keyboardAvoid: {
    width: '100%',
  },
  sheetContainer: {
    backgroundColor: colors.SURFACE_COLOR,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  sheetTopGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 160,
  },
  dragPill: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 180, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 0, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sheetHeaderTextCol: {
    flex: 1,
  },
  sheetTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  sheetSubtitle: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    marginTop: 2,
  },
  closeBtnBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  roomBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 16,
    gap: 12,
  },
  roomThumb: {
    width: 52,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.SURFACE_COLOR,
  },
  roomThumbFallback: {
    width: 52,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 180, 0, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomBannerTextCol: {
    flex: 1,
  },
  roomNameText: {
    color: colors.TITLE_COLOR,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  roomHostText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
  },
  digitBoxesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginVertical: 12,
  },
  digitBox: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  digitBoxActive: {
    borderColor: colors.FILM_GOLD,
    borderWidth: 1.5,
    backgroundColor: colors.SURFACE_ELEVATED,
    ...(Platform.OS === 'ios' && {
      shadowColor: colors.FILM_GOLD,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
    }),
  },
  digitBoxFilled: {
    borderColor: 'rgba(255, 180, 0, 0.4)',
  },
  cursorLine: {
    width: 2,
    height: 22,
    backgroundColor: colors.FILM_GOLD,
    borderRadius: 1,
  },
  digitText: {
    color: colors.TITLE_COLOR,
    fontSize: 22,
    fontWeight: '800',
  },
  pinDash: {
    color: colors.MUTED_COLOR,
    fontSize: 18,
    fontWeight: '700',
  },
  hiddenInput: {
    position: 'absolute',
    left: -9999,
    top: -9999,
    width: 0,
    height: 0,
    opacity: 0,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  errorText: {
    color: colors.LIVE_RED,
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  unlockBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 8,
  },
  unlockBtnDisabled: {
    opacity: 0.6,
  },
  unlockGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  unlockBtnText: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});

export default PrivateRoomPinModal;
