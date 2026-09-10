import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Platform,
  StatusBar,
  Vibration,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, database } from '../config/firebase';
import colors from '../theme/Colors';
import { navigationRef, navigate } from '../navigation/navigationRef';

/**
 * GlobalIncomingCallNotifier
 *
 * Heads-up app-wide incoming call notification banner (like WhatsApp / iOS CallKit).
 * Listens to `user_calls/${currentUserId}/incoming` in Firebase RTDB while app is in foreground.
 * Allows answering directly (with auto-answer), opening the chat, or declining the call from any screen.
 */
const GlobalIncomingCallNotifier = ({ currentUser = null }) => {
  const insets = useSafeAreaInsets();
  const [incomingCall, setIncomingCall] = useState(null);
  const incomingCallRef = useRef(null);

  // Dynamic notch & safe top calculation
  const safeTopPadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 12
  ) + 8;

  const slideAnim = useRef(new Animated.Value(-160)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const isVibratingRef = useRef(false);

  // Start rhythmic phone call vibration pattern
  const startVibration = useCallback(() => {
    if (!isVibratingRef.current) {
      isVibratingRef.current = true;
      // Pattern: wait 0ms, vibrate 600ms, wait 1200ms (repeating)
      Vibration.vibrate([0, 600, 1200], true);
    }
  }, []);

  // Stop vibration
  const stopVibration = useCallback(() => {
    if (isVibratingRef.current) {
      isVibratingRef.current = false;
      Vibration.cancel();
    }
  }, []);

  // Animate banner appearance
  const showBanner = useCallback(() => {
    slideAnim.setValue(-160);
    Animated.spring(slideAnim, {
      toValue: 0,
      tension: 65,
      friction: 9,
      useNativeDriver: true,
    }).start();
  }, [slideAnim]);

  // Animate banner dismissal
  const hideBanner = useCallback((callback) => {
    Animated.timing(slideAnim, {
      toValue: -180,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      stopVibration();
      incomingCallRef.current = null;
      setIncomingCall(null);
      if (typeof callback === 'function') callback();
    });
  }, [slideAnim, stopVibration]);

  // Keep incomingCallRef in sync
  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  // Pulsing ring animation for Accept button and caller avatar
  useEffect(() => {
    if (incomingCall) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.12, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => {
        pulse.stop();
        pulseAnim.setValue(1);
      };
    }
  }, [incomingCall, pulseAnim]);

  // Main listener for user_calls/${userId}/incoming
  useEffect(() => {
    let activeIncomingRef = null;
    let activeEndedRef = null;

    const setupListener = (targetUid) => {
      if (!targetUid) return;

      console.log('[GlobalIncomingCall] Attaching incoming call listener on user_calls/' + targetUid + '/incoming');
      const incomingRef = database().ref(`user_calls/${targetUid}/incoming`);
      activeIncomingRef = incomingRef;

      incomingRef.on('value', (snapshot) => {
        const callData = snapshot.val();
        console.log('[GlobalIncomingCall] RTDB event on user_calls/' + targetUid + '/incoming:', callData);

        if (!callData) {
          if (incomingCallRef.current) {
            hideBanner();
          }
          return;
        }

        // Ignore dead zombie calls from ancient sessions (> 2.5 minutes ago)
        if (callData.timestamp && Math.abs(Date.now() - callData.timestamp) > 150000) {
          console.log('[GlobalIncomingCall] Ignoring stale call from previous session:', callData.timestamp);
          return;
        }

        // If user is ALREADY inside ChatScreen for this exact chat, suppress the floating banner
        if (navigationRef.isReady()) {
          const currentRoute = navigationRef.getCurrentRoute();
          if (
            currentRoute?.name === 'Chat' &&
            (currentRoute?.params?.chatId === callData.chatId ||
              currentRoute?.params?.userId === callData.callerId)
          ) {
            console.log('[GlobalIncomingCall] User already inside ChatScreen for this call; suppressing banner');
            return;
          }
        }

        // Show the heads-up banner and vibrate
        incomingCallRef.current = callData;
        setIncomingCall(callData);
        showBanner();
        startVibration();

        // Listen for caller hangup/cancelled signal in chats/${chatId}/call/ended
        if (callData.chatId) {
          if (activeEndedRef) {
            activeEndedRef.off();
          }
          const endedRef = database().ref(`chats/${callData.chatId}/call/ended`);
          activeEndedRef = endedRef;

          endedRef.on('value', (endedSnap) => {
            const endedData = endedSnap.val();
            if (endedData) {
              console.log('[GlobalIncomingCall] Caller ended or cancelled call while ringing:', endedData);
              incomingRef.remove().catch(() => {});
              hideBanner();
            }
          });
        }
      });
    };

    const initialUid = currentUser?.uid || auth().currentUser?.uid;
    if (initialUid) {
      setupListener(initialUid);
    }

    const unsubAuth = auth().onAuthStateChanged((authU) => {
      if (authU && authU.uid !== initialUid) {
        if (activeIncomingRef) activeIncomingRef.off();
        if (activeEndedRef) activeEndedRef.off();
        setupListener(authU.uid);
      }
    });

    return () => {
      unsubAuth();
      if (activeIncomingRef) activeIncomingRef.off();
      if (activeEndedRef) activeEndedRef.off();
      stopVibration();
    };
  }, [currentUser, hideBanner, showBanner, startVibration, stopVibration]);

  // Action: Decline Call
  const handleDecline = async () => {
    const current = incomingCallRef.current;
    if (!current) return;
    const uid = currentUser?.uid || auth().currentUser?.uid;
    const { chatId } = current;

    stopVibration();

    try {
      // Signal caller that call was declined
      if (chatId && uid) {
        await database().ref(`chats/${chatId}/call/ended`).set({
          by: uid,
          reason: 'declined',
          timestamp: database.ServerValue.TIMESTAMP,
        });
      }

      // Remove incoming record
      if (uid) {
        await database().ref(`user_calls/${uid}/incoming`).remove();
      }
    } catch (e) {
      console.warn('[GlobalIncomingCall] Error during decline:', e);
    }

    hideBanner();
  };

  // Action: Accept Call (Direct Pickup)
  const handleAccept = async () => {
    const current = incomingCallRef.current;
    if (!current) return;
    const uid = currentUser?.uid || auth().currentUser?.uid;
    const callSnapshot = { ...current };

    stopVibration();

    // Clean up incoming node
    if (uid) {
      database().ref(`user_calls/${uid}/incoming`).remove().catch(() => {});
    }

    hideBanner(() => {
      // Navigate directly into ChatScreen with autoAnswer flag
      navigate('Chat', {
        chatId: callSnapshot.chatId,
        userId: callSnapshot.callerId,
        username: callSnapshot.callerName || 'Friend',
        avatar: callSnapshot.callerAvatar || null,
        callType: callSnapshot.callType || 'audio',
        autoAnswer: true,
      });
    });
  };

  // Action: Tap banner body (navigate into ChatScreen to view incoming call UI)
  const handleBannerPress = () => {
    const current = incomingCallRef.current;
    if (!current) return;
    const callSnapshot = { ...current };

    stopVibration();

    hideBanner(() => {
      navigate('Chat', {
        chatId: callSnapshot.chatId,
        userId: callSnapshot.callerId,
        username: callSnapshot.callerName || 'Friend',
        avatar: callSnapshot.callerAvatar || null,
        callType: callSnapshot.callType || 'audio',
        autoAnswer: false,
      });
    });
  };

  if (!incomingCall) return null;

  const isVideo = incomingCall.callType === 'video';
  const callerName = incomingCall.callerName || 'Friend';
  const initial = callerName.charAt(0).toUpperCase();

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.overlayContainer,
        {
          top: safeTopPadding,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={handleBannerPress}
        style={styles.cardContainer}
      >
        {/* Caller Avatar with pulsing halo */}
        <View style={styles.avatarWrapper}>
          <Animated.View
            style={[
              styles.avatarHalo,
              {
                borderColor: isVideo ? colors.FILM_GOLD : colors.CYAN_ACCENT,
                transform: [{ scale: pulseAnim }],
              },
            ]}
          />
          {incomingCall.callerAvatar ? (
            <Image
              source={{ uri: incomingCall.callerAvatar }}
              style={styles.avatarImage}
            />
          ) : (
            <View
              style={[
                styles.avatarFallback,
                isVideo ? styles.avatarFallbackVideo : styles.avatarFallbackAudio,
              ]}
            >
              <Text style={styles.avatarInitial}>{initial}</Text>
            </View>
          )}
        </View>

        {/* Caller Name & Call Details */}
        <View style={styles.infoCol}>
          <Text style={styles.callerName} numberOfLines={1}>
            {callerName}
          </Text>
          <View style={styles.badgeRow}>
            <MaterialIcons
              name={isVideo ? 'videocam' : 'phone-in-talk'}
              size={14}
              color={isVideo ? colors.FILM_GOLD : colors.CYAN_ACCENT}
              style={styles.badgeIcon}
            />
            <Text
              style={[
                styles.callTypeLabel,
                { color: isVideo ? colors.FILM_GOLD : colors.CYAN_ACCENT },
              ]}
            >
              {isVideo ? 'Incoming Video Call' : 'Incoming Voice Call'}
            </Text>
          </View>
          <Text style={styles.ringingSubtitle}>Ringing...</Text>
        </View>

        {/* Action Buttons: Decline (Red) & Accept (Green) */}
        <View style={styles.actionsRow}>
          {/* Decline Button */}
          <TouchableOpacity
            style={[styles.circleBtn, styles.declineBtn]}
            onPress={handleDecline}
            activeOpacity={0.75}
            accessibilityLabel="Decline Call"
          >
            <MaterialIcons name="call-end" size={20} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Accept Button */}
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              style={[styles.circleBtn, styles.acceptBtn]}
              onPress={handleAccept}
              activeOpacity={0.75}
              accessibilityLabel="Accept Call"
            >
              <MaterialIcons
                name={isVideo ? 'videocam' : 'call'}
                size={20}
                color="#FFFFFF"
              />
            </TouchableOpacity>
          </Animated.View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlayContainer: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 999999,
    elevation: 999999,
    alignItems: 'center',
  },
  cardContainer: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  avatarWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    position: 'relative',
  },
  avatarHalo: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    opacity: 0.8,
  },
  avatarImage: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  avatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarFallbackVideo: {
    backgroundColor: '#B45309',
  },
  avatarFallbackAudio: {
    backgroundColor: colors.PRIMARY_COLOR,
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  infoCol: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 8,
  },
  callerName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 1,
  },
  badgeIcon: {
    marginRight: 4,
  },
  callTypeLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  ringingSubtitle: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11,
    fontWeight: '500',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  circleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 6,
  },
  declineBtn: {
    backgroundColor: colors.LIVE_RED || '#EF4444',
  },
  acceptBtn: {
    backgroundColor: colors.ACCEPT_GREEN || '#00C853',
  },
});

export default GlobalIncomingCallNotifier;
