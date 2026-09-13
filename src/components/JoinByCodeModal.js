import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Easing,
  TextInput,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Clipboard from '@react-native-clipboard/clipboard';
import { database } from '../config/firebase';
import colors from '../theme/Colors';

const CODE_LENGTH = 6;

const JoinByCodeModal = ({ visible, onClose, onJoinRoom }) => {
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [pendingPrivateRoom, setPendingPrivateRoom] = useState(null);

  const inputRef = useRef(null);
  const pinRef = useRef(null);

  // Native Driver Animations
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(300)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Trigger shake animation on error
  const triggerShake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  // Handle open/close transitions
  useEffect(() => {
    if (visible) {
      setCode('');
      setPinInput('');
      setErrorMsg('');
      setPendingPrivateRoom(null);

      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 250,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.back(1.1)),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setTimeout(() => inputRef.current?.focus(), 150);
      });
    } else {
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 300,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, backdropAnim, slideAnim]);

  // Clean code input
  const handleCodeChange = (text) => {
    setErrorMsg('');
    const sanitized = text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (sanitized.length <= CODE_LENGTH) {
      setCode(sanitized);
      if (sanitized.length === CODE_LENGTH) {
        verifyAndJoin(sanitized);
      }
    }
  };

  // Paste from clipboard
  const handlePaste = async () => {
    try {
      const clipboardText = await Clipboard.getString();
      if (clipboardText) {
        const sanitized = clipboardText.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        if (sanitized.length > 0) {
          const nextCode = sanitized.slice(0, CODE_LENGTH);
          setCode(nextCode);
          if (nextCode.length >= 4) {
            verifyAndJoin(nextCode);
          }
        }
      }
    } catch (err) {
      console.warn('Paste failed:', err);
    }
  };

  // Room verification against Firebase
  const verifyAndJoin = async (targetCode = code) => {
    const cleanCode = (targetCode || '').trim().toUpperCase();
    if (cleanCode.length < 3) {
      setErrorMsg('Please enter a valid room code.');
      triggerShake();
      return;
    }

    setIsVerifying(true);
    setErrorMsg('');

    try {
      const db = database();

      // 1. Direct O(1) key match
      let directSnap = await db.ref(`rooms/${cleanCode}`).once('value');
      let roomData = directSnap.exists() ? directSnap.val() : null;

      // 2. Direct with 'room_' prefix
      if (!roomData) {
        const prefixSnap = await db.ref(`rooms/room_${cleanCode}`).once('value');
        if (prefixSnap.exists()) roomData = prefixSnap.val();
      }

      // 3. Fallback search (by pin, short ID, or name)
      if (!roomData) {
        const allRoomsSnap = await db.ref('rooms').once('value');
        const allRooms = allRoomsSnap.val();
        if (allRooms) {
          const roomList = Object.values(allRooms);
          roomData = roomList.find((r) => {
            if (!r) return false;
            const rId = (r.roomId || '').toUpperCase();
            const rName = (r.name || '').toUpperCase();
            const rPin = (r.pin || '').toUpperCase();
            return (
              rId === cleanCode ||
              rId.endsWith(cleanCode) ||
              rPin === cleanCode ||
              rName === cleanCode
            );
          });
        }
      }

      if (!roomData) {
        setIsVerifying(false);
        setErrorMsg(`Room "${cleanCode}" not found or has expired.`);
        triggerShake();
        return;
      }

      // Check capacity
      const participantsCount = Array.isArray(roomData.participants)
        ? roomData.participants.length
        : roomData.participants
        ? Object.keys(roomData.participants).length
        : 0;

      if (roomData.maxCapacity && participantsCount >= roomData.maxCapacity) {
        setIsVerifying(false);
        setErrorMsg(`Room is full (${participantsCount}/${roomData.maxCapacity} participants).`);
        triggerShake();
        return;
      }

      // Private Room PIN Check
      if (roomData.isPrivate && roomData.pin) {
        setIsVerifying(false);
        setPendingPrivateRoom(roomData);
        setTimeout(() => pinRef.current?.focus(), 200);
        return;
      }

      // Success: Close and navigate
      setIsVerifying(false);
      onClose();
      onJoinRoom(roomData);
    } catch (error) {
      console.error('Error verifying room code:', error);
      setIsVerifying(false);
      setErrorMsg('Network error. Unable to verify room parity.');
      triggerShake();
    }
  };

  // Verify PIN for private room
  const handleVerifyPin = () => {
    if (!pendingPrivateRoom) return;
    if (pinInput.trim() === String(pendingPrivateRoom.pin)) {
      const targetRoom = pendingPrivateRoom;
      setPendingPrivateRoom(null);
      onClose();
      onJoinRoom(targetRoom);
    } else {
      setErrorMsg('Incorrect 4-digit PIN. Please try again.');
      triggerShake();
      setPinInput('');
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
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <Animated.View
                style={[
                  styles.sheetContainer,
                  {
                    paddingBottom: Math.max(insets.bottom, 16) + 16,
                    transform: [{ translateY: slideAnim }],
                  },
                ]}
              >
                {/* Ambient Top Glow in Sheet */}
                <View style={styles.sheetTopGlow} pointerEvents="none">
                  <LinearGradient
                    colors={['rgba(6, 182, 212, 0.2)', 'rgba(0, 122, 255, 0.08)', 'transparent']}
                    style={StyleSheet.absoluteFillObject}
                  />
                </View>

                {/* Top Drag Indicator */}
                <View style={styles.dragPill} />

                {/* Header */}
                <View style={styles.sheetHeader}>
                  <View style={styles.sheetIconBox}>
                    <MaterialIcons
                      name={pendingPrivateRoom ? 'lock' : 'tag'}
                      size={22}
                      color={pendingPrivateRoom ? colors.FILM_GOLD : colors.CYAN_ACCENT}
                    />
                  </View>
                  <View style={styles.sheetHeaderTextCol}>
                    <Text style={styles.sheetTitle}>
                      {pendingPrivateRoom ? 'Private Room PIN' : 'Join Screening'}
                    </Text>
                    <Text style={styles.sheetSubtitle}>
                      {pendingPrivateRoom
                        ? `Enter 4-digit PIN for "${pendingPrivateRoom.name}"`
                        : 'Enter 6-character room code to sync buffer'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.closeBtnBox}
                    onPress={onClose}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="close" size={20} color={colors.SUB_TITLE_COLOR} />
                  </TouchableOpacity>
                </View>

                {/* ── CODE ENTRY MODE ── */}
                {!pendingPrivateRoom ? (
                  <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
                    {/* Hidden Real Input */}
                    <TextInput
                      ref={inputRef}
                      value={code}
                      onChangeText={handleCodeChange}
                      maxLength={CODE_LENGTH}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      spellCheck={false}
                      keyboardType="default"
                      returnKeyType="done"
                      underlineColorAndroid="transparent"
                      selectionColor="transparent"
                      caretHidden={true}
                      onSubmitEditing={() => verifyAndJoin(code)}
                      style={styles.hiddenInput}
                    />

                    {/* 6 Segmented Digit Boxes */}
                    <TouchableOpacity
                      activeOpacity={1}
                      onPress={() => inputRef.current?.focus()}
                      style={styles.digitBoxesRow}
                    >
                      {Array.from({ length: CODE_LENGTH }).map((_, i) => {
                        const char = code[i] || '';
                        const isCurrent = i === code.length;
                        return (
                          <View
                            key={i}
                            style={[
                              styles.digitBox,
                              isCurrent && styles.digitBoxActive,
                              char && styles.digitBoxFilled,
                            ]}
                          >
                            {char ? (
                              <Text style={styles.digitChar}>{char}</Text>
                            ) : isCurrent ? (
                              <View style={styles.cursorLine} />
                            ) : (
                              <Text style={styles.digitDot}>•</Text>
                            )}
                          </View>
                        );
                      })}
                    </TouchableOpacity>

                    {/* Quick Paste & Clear helpers */}
                    <View style={styles.quickActionsRow}>
                      <TouchableOpacity
                        style={styles.pasteActionBtn}
                        onPress={handlePaste}
                        activeOpacity={0.75}
                      >
                        <MaterialIcons name="content-paste" size={15} color={colors.CYAN_ACCENT} />
                        <Text style={styles.pasteActionText}>Paste Code</Text>
                      </TouchableOpacity>

                      {code.length > 0 && (
                        <TouchableOpacity
                          style={styles.clearActionBtn}
                          onPress={() => setCode('')}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.clearActionText}>Clear</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </Animated.View>
                ) : (
                  /* ── PRIVATE PIN ENTRY MODE ── */
                  <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
                    <TextInput
                      ref={pinRef}
                      value={pinInput}
                      onChangeText={(val) => {
                        setErrorMsg('');
                        const cleaned = val.replace(/[^0-9]/g, '');
                        if (cleaned.length <= 4) setPinInput(cleaned);
                      }}
                      maxLength={4}
                      keyboardType="number-pad"
                      returnKeyType="done"
                      underlineColorAndroid="transparent"
                      selectionColor="transparent"
                      caretHidden={true}
                      onSubmitEditing={handleVerifyPin}
                      style={styles.hiddenInput}
                    />

                    <TouchableOpacity
                      activeOpacity={1}
                      onPress={() => pinRef.current?.focus()}
                      style={styles.pinBoxesRow}
                    >
                      {Array.from({ length: 4 }).map((_, i) => {
                        const digit = pinInput[i] || '';
                        const isCurrent = i === pinInput.length;
                        return (
                          <View
                            key={i}
                            style={[
                              styles.pinBox,
                              isCurrent && styles.pinBoxActive,
                              digit && styles.pinBoxFilled,
                            ]}
                          >
                            {digit ? (
                              <Text style={styles.pinChar}>•</Text>
                            ) : isCurrent ? (
                              <View style={styles.cursorLineGold} />
                            ) : (
                              <Text style={styles.pinDash}>-</Text>
                            )}
                          </View>
                        );
                      })}
                    </TouchableOpacity>
                  </Animated.View>
                )}

                {/* Error feedback banner */}
                {!!errorMsg && (
                  <View style={styles.errorBanner}>
                    <MaterialIcons name="error-outline" size={16} color={colors.DELETE_RED_COLOR} />
                    <Text style={styles.errorBannerText}>{errorMsg}</Text>
                  </View>
                )}

                {/* Submit Action CTA */}
                <TouchableOpacity
                  style={[
                    styles.submitCtaBtn,
                    (!code && !pinInput) && styles.submitCtaBtnDisabled,
                  ]}
                  activeOpacity={0.85}
                  disabled={isVerifying || (!code && !pinInput)}
                  onPress={pendingPrivateRoom ? handleVerifyPin : () => verifyAndJoin(code)}
                >
                  <LinearGradient
                    colors={
                      pendingPrivateRoom
                        ? [colors.FILM_GOLD, '#D97706']
                        : [colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.submitCtaGradient}
                  >
                    {isVerifying ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons
                          name={pendingPrivateRoom ? 'key-outline' : 'sparkles'}
                          size={18}
                          color="#FFFFFF"
                        />
                        <Text style={styles.submitCtaText}>
                          {pendingPrivateRoom ? 'Unlock & Enter Room' : 'Sync & Join Party'}
                        </Text>
                      </>
                    )}
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
    height: 180,
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
    marginBottom: 20,
  },
  sheetIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sheetHeaderTextCol: {
    flex: 1,
  },
  sheetTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
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
  hiddenInput: {
    position: 'absolute',
    left: -9999,
    top: -9999,
    width: 0,
    height: 0,
    opacity: 0,
  },
  digitBoxesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginVertical: 10,
  },
  digitBox: {
    flex: 1,
    height: 54,
    borderRadius: 14,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  digitBoxActive: {
    borderColor: colors.CYAN_ACCENT,
    borderWidth: 1.5,
    backgroundColor: colors.SURFACE_ELEVATED,
    ...(Platform.OS === 'ios' && {
      shadowColor: colors.CYAN_ACCENT,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.5,
      shadowRadius: 8,
    }),
  },
  digitBoxFilled: {
    borderColor: 'rgba(0, 122, 255, 0.4)',
  },
  cursorLine: {
    width: 2,
    height: 24,
    backgroundColor: colors.CYAN_ACCENT,
    borderRadius: 1,
  },
  cursorLineGold: {
    width: 2,
    height: 24,
    backgroundColor: colors.FILM_GOLD,
    borderRadius: 1,
  },
  digitDot: {
    color: colors.MUTED_COLOR,
    fontSize: 18,
    fontWeight: '800',
  },
  pinDash: {
    color: colors.MUTED_COLOR,
    fontSize: 18,
    fontWeight: '700',
  },
  digitChar: {
    color: colors.TITLE_COLOR,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1,
    backgroundColor: 'transparent',
    includeFontPadding: false,
  },
  quickActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  pasteActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 6,
  },
  pasteActionText: {
    color: colors.CYAN_ACCENT,
    fontSize: 12,
    fontWeight: '700',
  },
  clearActionText: {
    color: colors.MUTED_COLOR,
    fontSize: 12,
    fontWeight: '600',
  },
  pinBoxesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    marginVertical: 14,
  },
  pinBox: {
    width: 60,
    height: 60,
    borderRadius: 14,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 0, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinBoxActive: {
    borderColor: colors.FILM_GOLD,
    borderWidth: 1.5,
    backgroundColor: colors.SURFACE_ELEVATED,
    ...(Platform.OS === 'ios' && {
      shadowColor: colors.FILM_GOLD,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.5,
      shadowRadius: 8,
    }),
  },
  pinBoxFilled: {
    borderColor: colors.FILM_GOLD,
  },
  pinChar: {
    color: colors.TITLE_COLOR,
    fontSize: 24,
    fontWeight: '800',
    backgroundColor: 'transparent',
    includeFontPadding: false,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
    gap: 8,
  },
  errorBannerText: {
    color: colors.DELETE_RED_COLOR,
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  submitCtaBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 18,
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  submitCtaBtnDisabled: {
    opacity: 0.5,
    shadowOpacity: 0,
  },
  submitCtaGradient: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  submitCtaText: {
    color: colors.TITLE_COLOR,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
});

export default JoinByCodeModal;
