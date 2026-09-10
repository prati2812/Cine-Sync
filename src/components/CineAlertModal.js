import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Easing,
  Dimensions,
  TextInput,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import colors from '../theme/Colors';
import { registerAlertListener, unregisterAlertListener } from './CineAlert';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Isolated TextInput to avoid parent re-renders & autofill flicker on keystrokes ──
const SheetTextInput = ({ initialValue, placeholder, onChangeValue, onSubmit }) => {
  const [text, setText] = useState(initialValue || '');
  const inputRef = useRef(null);

  useEffect(() => {
    // Focus gently once on mount without re-triggering on state updates
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  const handleChange = (val) => {
    setText(val);
    onChangeValue(val);
  };

  return (
    <TextInput
      ref={inputRef}
      style={styles.sheetInput}
      value={text}
      onChangeText={handleChange}
      placeholder={placeholder}
      placeholderTextColor={colors.MUTED_COLOR}
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      autoComplete="off"
      textContentType="none"
      importantForAutofill="no"
      keyboardType="default"
      returnKeyType="send"
      onSubmitEditing={onSubmit}
    />
  );
};

const CineAlertModal = () => {
  const insets = useSafeAreaInsets();
  const [alertConfig, setAlertConfig] = useState(null);
  const inputValueRef = useRef('');
  const selectedRoomRef = useRef(null);
  const [selectedRoomId, setSelectedRoomId] = useState(null);

  // Animations
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(350)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    registerAlertListener((config) => {
      if (config) {
        inputValueRef.current = config.initialValue || '';
        if (config.roomList && config.roomList.length > 0) {
          const initialRoom = config.roomList[0];
          selectedRoomRef.current = initialRoom;
          setSelectedRoomId(initialRoom?.roomId);
        } else {
          selectedRoomRef.current = null;
          setSelectedRoomId(null);
        }
        setAlertConfig(config);
      } else {
        closeAlert();
      }
    });

    return () => {
      unregisterAlertListener();
    };
  }, []);

  useEffect(() => {
    if (alertConfig) {
      const isBottomSheet = alertConfig.presentationStyle !== 'center';

      // Reset values
      backdropAnim.setValue(0);
      slideAnim.setValue(isBottomSheet ? 350 : 0);
      scaleAnim.setValue(isBottomSheet ? 1 : 0.88);

      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        isBottomSheet
          ? Animated.spring(slideAnim, {
              toValue: 0,
              tension: 65,
              friction: 10,
              useNativeDriver: true,
            })
          : Animated.spring(scaleAnim, {
              toValue: 1,
              tension: 70,
              friction: 8,
              useNativeDriver: true,
            }),
      ]).start();
    }
  }, [alertConfig]);

  const closeAlert = (callback) => {
    const isBottomSheet = alertConfig?.presentationStyle !== 'center';
    const submittedValue = (alertConfig?.roomList && alertConfig.roomList.length > 0)
      ? (selectedRoomRef.current || alertConfig.roomList[0])
      : inputValueRef.current;

    Animated.parallel([
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
      isBottomSheet
        ? Animated.timing(slideAnim, {
            toValue: 350,
            duration: 200,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          })
        : Animated.timing(scaleAnim, {
            toValue: 0.85,
            duration: 160,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
    ]).start(() => {
      setAlertConfig(null);
      inputValueRef.current = '';
      selectedRoomRef.current = null;
      setSelectedRoomId(null);
      if (typeof callback === 'function') {
        callback(submittedValue);
      }
    });
  };

  if (!alertConfig) return null;

  const {
    type = 'info',
    title,
    message,
    icon,
    confirmText = 'OK',
    cancelText,
    onConfirm,
    onCancel,
    presentationStyle = 'bottomSheet',
    roomTicket,
    roomList,
    showInput = type === 'add_friend',
    inputPlaceholder = 'Enter @username or email...',
  } = alertConfig;

  const isBottomSheet = presentationStyle !== 'center';

  // Variant theme mapping
  const getTheme = () => {
    switch (type) {
      case 'danger':
        return {
          iconName: icon || 'person-remove',
          iconColor: colors.DELETE_RED_COLOR,
          iconBg: colors.SURFACE_ELEVATED,
          iconBorder: 'rgba(239, 68, 68, 0.40)',
          glowShadow: colors.DECLINE_RED_GLOW,
          btnGradient: [colors.DELETE_RED_COLOR, '#B91C1C'],
          btnTextColor: '#FFFFFF',
          btnIcon: 'delete-outline',
        };
      case 'add_friend':
        return {
          iconName: icon || 'check-circle-outline',
          iconColor: colors.ACCEPT_GREEN,
          iconBg: colors.SURFACE_ELEVATED,
          iconBorder: 'rgba(0, 200, 83, 0.40)',
          glowShadow: colors.ACCEPT_GREEN_GLOW,
          btnGradient: [colors.PRIMARY_COLOR, colors.CYAN_ACCENT],
          btnTextColor: '#FFFFFF',
          btnIcon: 'person-add',
        };
      case 'invite':
      case 'room':
        return {
          iconName: icon || 'confirmation-number',
          iconColor: colors.FILM_GOLD,
          iconBg: colors.SURFACE_ELEVATED,
          iconBorder: 'rgba(255, 180, 0, 0.45)',
          glowShadow: colors.FILM_GOLD_GLOW,
          // High-contrast clean electric blue to cyan gradient (matching Image 2)
          btnGradient: [colors.PRIMARY_COLOR, colors.CYAN_ACCENT],
          btnTextColor: '#FFFFFF',
          btnIcon: 'send',
        };
      case 'action':
        return {
          iconName: icon || 'movie',
          iconColor: colors.CYAN_ACCENT,
          iconBg: colors.SURFACE_ELEVATED,
          iconBorder: 'rgba(6, 182, 212, 0.35)',
          glowShadow: 'rgba(6, 182, 212, 0.3)',
          btnGradient: [colors.PRIMARY_COLOR, colors.CYAN_ACCENT],
          btnTextColor: '#FFFFFF',
          btnIcon: 'sparkles',
        };
      case 'success':
        return {
          iconName: icon || 'check-circle',
          iconColor: colors.ACCEPT_GREEN,
          iconBg: colors.SURFACE_ELEVATED,
          iconBorder: 'rgba(0, 200, 83, 0.40)',
          glowShadow: colors.ACCEPT_GREEN_GLOW,
          btnGradient: [colors.ACCEPT_GREEN, '#059669'],
          btnTextColor: '#FFFFFF',
          btnIcon: 'done',
        };
      case 'warning':
        return {
          iconName: icon || 'warning-amber',
          iconColor: colors.FILM_GOLD,
          iconBg: colors.SURFACE_ELEVATED,
          iconBorder: 'rgba(255, 180, 0, 0.35)',
          glowShadow: colors.FILM_GOLD_GLOW,
          btnGradient: [colors.PRIMARY_COLOR, colors.CYAN_ACCENT],
          btnTextColor: '#FFFFFF',
          btnIcon: null,
        };
      case 'info':
      default:
        return {
          iconName: icon || 'info-outline',
          iconColor: colors.PRIMARY_COLOR,
          iconBg: colors.SURFACE_ELEVATED,
          iconBorder: 'rgba(0, 122, 255, 0.35)',
          glowShadow: colors.PRIMARY_GLOW,
          btnGradient: [colors.PRIMARY_COLOR, colors.CYAN_ACCENT],
          btnTextColor: '#FFFFFF',
          btnIcon: null,
        };
    }
  };

  const theme = getTheme();

  const handleConfirmPress = () => {
    closeAlert(() => {
      if (typeof onConfirm === 'function') {
        if (alertConfig?.roomList && alertConfig.roomList.length > 0) {
          onConfirm(selectedRoomRef.current || alertConfig.roomList[0]);
        } else {
          onConfirm(inputValueRef.current);
        }
      }
    });
  };

  const handleCancelPress = () => {
    closeAlert(onCancel);
  };

  return (
    <Modal
      transparent
      visible={!!alertConfig}
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleCancelPress}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        {/* Animated Dark Frosted Backdrop */}
        <TouchableWithoutFeedback onPress={handleCancelPress}>
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

        {/* Content Container (Bottom Sheet or Centered Card) */}
        <View
          style={[
            styles.containerPlacement,
            isBottomSheet ? styles.bottomSheetPlacement : styles.centerPlacement,
          ]}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              styles.cardBase,
              isBottomSheet ? styles.bottomSheetCard : styles.centerCard,
              isBottomSheet
                ? { transform: [{ translateY: slideAnim }] }
                : {
                    transform: [{ scale: scaleAnim }],
                    opacity: backdropAnim,
                  },
              { paddingBottom: isBottomSheet ? Math.max(insets.bottom, 16) + 16 : 24 },
            ]}
          >
            {/* Top Atmospheric Purple/Midnight Gradient Sheen */}
            <LinearGradient
              colors={['rgba(124, 58, 237, 0.16)', 'rgba(15, 15, 26, 0.95)', colors.SURFACE_COLOR]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 0.6 }}
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />

            {/* Bottom Sheet Drag Indicator Handle */}
            {isBottomSheet && (
              <View style={styles.dragIndicatorWrap}>
                <View style={styles.dragIndicator} />
              </View>
            )}

            {/* Glowing Squircle Icon Badge (Matching Image 2) */}
            <View
              style={[
                styles.iconBadge,
                {
                  backgroundColor: theme.iconBg,
                  borderColor: theme.iconBorder,
                  shadowColor: theme.glowShadow,
                },
              ]}
            >
              <MaterialIcons name={theme.iconName} size={28} color={theme.iconColor} />
            </View>

            {/* Title */}
            <Text style={styles.titleText}>{title}</Text>

            {/* Message / Description */}
            {Boolean(message) && <Text style={styles.messageText}>{message}</Text>}

            {/* ── OPTIONAL TEXT INPUT (Isolated, no parent re-render & no autofill flicker) ── */}
            {showInput && (
              <View style={styles.inputContainer}>
                <SheetTextInput
                  initialValue={alertConfig.initialValue || ''}
                  placeholder={inputPlaceholder}
                  onChangeValue={(val) => {
                    inputValueRef.current = val;
                  }}
                  onSubmit={handleConfirmPress}
                />
              </View>
            )}

            {/* ── CINEMATIC WATCH PARTY VIP PASS TICKET CARD (Single Room) ── */}
            {Boolean(roomTicket && (!roomList || roomList.length === 0)) && (
              <View style={styles.ticketCard}>
                {/* Ticket Top Row: Code, Title & LIVE badge */}
                <View style={styles.ticketHeaderRow}>
                  <View style={styles.ticketHeaderLeft}>
                    <Text style={styles.ticketTagText}>
                      ROOM TICKET #{String(roomTicket.roomId || '4829').substring(0, 8).toUpperCase()}
                    </Text>
                    <Text style={styles.ticketMovieTitle} numberOfLines={1}>
                      {roomTicket.name || 'Watch Party'}
                    </Text>
                  </View>

                  <View style={styles.ticketBadgeWrap}>
                    <View style={styles.ticketLiveDot} />
                    <Text style={styles.ticketLiveBadgeText}>
                      {roomTicket.isStreaming ? 'LIVE' : 'SYNC'}
                    </Text>
                  </View>
                </View>

                {/* Ticket Divider */}
                <View style={styles.ticketDivider} />

                {/* Ticket Bottom Row: Audio Sync & Auto-Join */}
                <View style={styles.ticketFooterRow}>
                  <View style={styles.ticketFooterLeft}>
                    <MaterialIcons name="album" size={14} color={colors.CYAN_ACCENT} />
                    <Text style={styles.ticketSyncText}>Dolby Atmos Sync</Text>
                  </View>
                  <Text style={styles.ticketAutoJoinText}>1-Tap Auto Join</Text>
                </View>
              </View>
            )}

            {/* ── MULTIPLE WATCH PARTY ROOM SELECTOR ── */}
            {Boolean(roomList && roomList.length > 0) && (
              <View style={styles.roomListContainer}>
                <ScrollView
                  style={styles.roomListScroll}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                >
                  {roomList.map((room, index) => {
                    const isSelected =
                      selectedRoomId === room.roomId ||
                      (!selectedRoomId && index === 0);
                    return (
                      <TouchableOpacity
                        key={room.roomId || index}
                        style={[
                          styles.selectableRoomCard,
                          isSelected && styles.selectableRoomCardActive,
                        ]}
                        onPress={() => {
                          setSelectedRoomId(room.roomId);
                          selectedRoomRef.current = room;
                        }}
                        activeOpacity={0.8}
                      >
                        <View style={styles.selectableRoomHeader}>
                          <View style={styles.selectableRoomInfo}>
                            <Text
                              style={[
                                styles.selectableRoomTag,
                                isSelected && { color: colors.FILM_GOLD },
                              ]}
                            >
                              ROOM #{String(room.roomId || 'VIP').substring(0, 8).toUpperCase()}
                            </Text>
                            <Text style={styles.selectableRoomTitle} numberOfLines={1}>
                              {room.name || 'Watch Party'}
                            </Text>
                          </View>

                          <View style={styles.selectableRoomRight}>
                            <View style={styles.ticketBadgeWrap}>
                              <View
                                style={[
                                  styles.ticketLiveDot,
                                  !room.isStreaming && { backgroundColor: colors.CYAN_ACCENT },
                                ]}
                              />
                              <Text
                                style={[
                                  styles.ticketLiveBadgeText,
                                  !room.isStreaming && { color: colors.CYAN_ACCENT },
                                ]}
                              >
                                {room.isStreaming ? 'LIVE' : 'SYNC'}
                              </Text>
                            </View>

                            <View
                              style={[
                                styles.roomRadioOuter,
                                isSelected && styles.roomRadioOuterActive,
                              ]}
                            >
                              {isSelected && <View style={styles.roomRadioInner} />}
                            </View>
                          </View>
                        </View>

                        <View style={styles.selectableRoomFooter}>
                          <View style={styles.selectableFooterLeft}>
                            <MaterialIcons name="album" size={12} color={colors.CYAN_ACCENT} />
                            <Text style={styles.selectableRoomSub}>
                              {room.streamUrl ? 'Dolby Atmos Sync' : 'Ready to Stream'}
                            </Text>
                          </View>
                          {isSelected && (
                            <Text style={styles.selectedBadgeText}>SELECTED</Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Button Actions (Two Column Grid with High Contrast) */}
            <View style={styles.buttonRow}>
              {Boolean(cancelText) && (
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={handleCancelPress}
                  activeOpacity={0.75}
                >
                  <Text style={styles.cancelBtnText}>{cancelText}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.confirmBtn, !cancelText && { flex: 1 }]}
                onPress={handleConfirmPress}
                activeOpacity={0.82}
              >
                <LinearGradient
                  colors={theme.btnGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.confirmGradient}
                >
                  {theme.btnIcon && (
                    <MaterialIcons
                      name={theme.btnIcon}
                      size={17}
                      color={theme.btnTextColor}
                      style={{ marginRight: 6 }}
                    />
                  )}
                  <Text style={[styles.confirmBtnText, { color: theme.btnTextColor }]}>
                    {confirmText}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#080810',
  },
  containerPlacement: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomSheetPlacement: {
    justifyContent: 'flex-end',
    width: '100%',
  },
  centerPlacement: {
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  cardBase: {
    width: '100%',
    backgroundColor: colors.SURFACE_COLOR,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 16,
  },
  bottomSheetCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingHorizontal: 22,
    paddingTop: 12,
    borderBottomWidth: 0,
  },
  centerCard: {
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 24,
    maxWidth: 360,
  },
  dragIndicatorWrap: {
    width: '100%',
    alignItems: 'center',
    paddingBottom: 16,
  },
  dragIndicator: {
    width: 44,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },

  // ── Squircle Icon Badge (16px radius, matching Image 2) ───
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    marginBottom: 14,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 6,
  },

  // ── Typography ────────────────────────────────────────────
  titleText: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.TITLE_COLOR,
    textAlign: 'center',
    letterSpacing: -0.2,
    marginBottom: 6,
    paddingHorizontal: 8,
  },
  messageText: {
    fontSize: 13,
    color: colors.SUB_TITLE_COLOR,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 18,
    paddingHorizontal: 12,
  },

  // ── Text Input Container ──────────────────────────────────
  inputContainer: {
    width: '100%',
    marginBottom: 18,
  },
  sheetInput: {
    width: '100%',
    height: 48,
    backgroundColor: colors.SURFACE_COLOR,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 16,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 16,
  },

  // ── Cinema Ticket Mockup Card (Clean, without circular artifact) ──
  ticketCard: {
    width: '100%',
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 0, 0.35)',
    padding: 14,
    marginBottom: 20,
    overflow: 'hidden',
  },
  ticketHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
  },
  ticketHeaderLeft: {
    flex: 1,
    marginRight: 8,
  },
  ticketTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.FILM_GOLD,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  ticketMovieTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.TITLE_COLOR,
    letterSpacing: -0.1,
  },
  ticketBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: `${colors.LIVE_RED}22`,
    borderWidth: 1,
    borderColor: `${colors.LIVE_RED}40`,
  },
  ticketLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.LIVE_RED,
  },
  ticketLiveBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.LIVE_RED,
    letterSpacing: 0.5,
  },
  ticketDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    marginVertical: 4,
  },
  ticketFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  ticketFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  ticketSyncText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '500',
  },
  ticketAutoJoinText: {
    fontSize: 11,
    color: colors.FILM_GOLD,
    fontWeight: '700',
  },

  // ── Multiple Room List Selector ───────────────────────────
  roomListContainer: {
    width: '100%',
    maxHeight: 250,
    marginBottom: 16,
  },
  roomListScroll: {
    width: '100%',
  },
  selectableRoomCard: {
    width: '100%',
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 12,
    marginBottom: 8,
  },
  selectableRoomCardActive: {
    borderColor: colors.PRIMARY_COLOR,
    backgroundColor: 'rgba(0, 122, 255, 0.10)',
  },
  selectableRoomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  selectableRoomInfo: {
    flex: 1,
    marginRight: 10,
  },
  selectableRoomTag: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.CYAN_ACCENT,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  selectableRoomTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.TITLE_COLOR,
  },
  selectableRoomRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roomRadioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomRadioOuterActive: {
    borderColor: colors.PRIMARY_COLOR,
  },
  roomRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.PRIMARY_COLOR,
  },
  selectableRoomFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  selectableFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  selectableRoomSub: {
    fontSize: 11,
    color: colors.SUB_TITLE_COLOR,
    fontWeight: '500',
  },
  selectedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.CYAN_ACCENT,
    letterSpacing: 0.5,
  },

  // ── Button Actions (Clean Squircle buttons with high contrast) ──
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 16,
    backgroundColor: colors.SURFACE_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.TITLE_COLOR,
  },
  confirmBtn: {
    flex: 1,
    height: 46,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },
  confirmGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  confirmBtnText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});

export default CineAlertModal;
