import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Animated,
  ScrollView,
  Dimensions,
  Easing,
  Alert,
} from 'react-native';
import { auth, database } from '../../../config/firebase';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import colors from '../../../theme/Colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ORBIT_SIZE = SCREEN_WIDTH * 0.78;

const AVATAR_COLORS = [
  colors.PRIMARY_COLOR,
  colors.PURPLE_ACCENT,
  colors.CYAN_ACCENT,
  colors.FILM_GOLD,
  colors.ACCEPT_GREEN,
  colors.LIVE_RED,
];

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// ──────────────────────────────────────────────────────────────
//  Pulsing Ring around the center play button
// ──────────────────────────────────────────────────────────────
const PulseRing = ({ delay = 0 }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const timeout = setTimeout(() => {
      Animated.loop(
        Animated.parallel([
          Animated.timing(scale, { toValue: 2.2, duration: 2000, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 2000, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ])
      ).start();
    }, delay);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <Animated.View
      style={[
        styles.pulseRing,
        { transform: [{ scale }], opacity },
      ]}
    />
  );
};

// ──────────────────────────────────────────────────────────────
//  Waiting Screen
// ──────────────────────────────────────────────────────────────
const WaitingScreen = ({ route, navigation }) => {
  const { roomId, roomName, streamUrl: routeStreamUrl } = route.params;
  const currentUser = auth().currentUser;

  const [participantProfiles, setParticipantProfiles] = useState([]);
  const [onlineStatuses, setOnlineStatuses] = useState({});
  const [isCreator, setIsCreator] = useState(false);
  const [resolvedStreamUrl, setResolvedStreamUrl] = useState(routeStreamUrl);
  const statusListenersRef = useRef([]);

  // Animations
  const rotationAnim = useRef(new Animated.Value(0)).current;
  const innerRotation = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const dotPulse = useRef(new Animated.Value(1)).current;

  // ── Fetch room data & resolve participant profiles ─────────
  useEffect(() => {
    const roomRef = database().ref(`rooms/${roomId}`);

    const onValueHandler = async snapshot => {
      const data = snapshot.val();
      if (!data) return;

      setIsCreator(currentUser?.uid === data.creator?.uid);
      if (data.streamUrl) setResolvedStreamUrl(data.streamUrl);

      // Navigate to streaming screen automatically if stream has started and user is not creator
      if (data.isStreaming && currentUser?.uid !== data.creator?.uid) {
        navigation.replace('Streaming', {
          roomId,
          roomName,
          streamUrl: data.streamUrl || resolvedStreamUrl,
        });
        return; // Stop processing further to avoid state updates on unmounted component
      }

      // Creator email + invited participant emails
      const allEmails = [
        data.creator?.email,
        ...(data.participants || []),
      ].filter(Boolean);
      const uniqueEmails = [...new Set(allEmails)];

      const profiles = [];

      for (let i = 0; i < uniqueEmails.length; i++) {
        const email = uniqueEmails[i];
        try {
          const userSnap = await database()
            .ref('users')
            .orderByChild('email')
            .equalTo(email)
            .once('value');

          if (userSnap.exists()) {
            const userKey = Object.keys(userSnap.val())[0];
            const userData = userSnap.val()[userKey];
            const name = userData.username || email.split('@')[0];
            profiles.push({
              id: userKey,
              uid: userKey,
              name,
              email,
              username: `@${name.toLowerCase().replace(/\s/g, '')}`,
              color: AVATAR_COLORS[i % AVATAR_COLORS.length],
              initial: getInitials(name),
              isHost: email === data.creator?.email,
            });
          }
        } catch (error) {
          console.log('Error fetching user profile:', error);
        }
      }

      setParticipantProfiles(profiles);
    };

    roomRef.on('value', onValueHandler);

    return () => roomRef.off('value', onValueHandler);
  }, [roomId, currentUser]);

  // ── Real-time status listeners for each participant ────────
  useEffect(() => {
    // Clean up previous listeners
    statusListenersRef.current.forEach(u => u());
    statusListenersRef.current = [];

    if (participantProfiles.length === 0) return;

    const db = database();

    participantProfiles.forEach(p => {
      if (!p.uid) return;
      // Listen at /status (supports both string "online" and object {state:"online"})
      const statusRef = db.ref(`users/${p.uid}/status`);
      const onValueHandler = snap => {
        const val = snap.val();
        const isOnline = val === 'online' || val?.state === 'online';
        setOnlineStatuses(prev => ({ ...prev, [p.uid]: isOnline }));
      };
      statusRef.on('value', onValueHandler);
      statusListenersRef.current.push({ ref: statusRef, handler: onValueHandler });
    });

    return () => {
      statusListenersRef.current.forEach(({ ref: r, handler }) => r.off('value', handler));
      statusListenersRef.current = [];
    };
  }, [participantProfiles]);

  // ── Combine profiles with live statuses ────────────────────
  const participants = participantProfiles.map(p => ({
    ...p,
    isOnline: onlineStatuses[p.uid] ?? false,
  }));

  const onlineCount = participants.filter(p => p.isOnline).length;
  const allOnline = participants.length > 0 && onlineCount === participants.length;

  // ── Animations ─────────────────────────────────────────────
  useEffect(() => {
    Animated.loop(
      Animated.timing(rotationAnim, { toValue: 1, duration: 12000, easing: Easing.linear, useNativeDriver: true })
    ).start();

    Animated.loop(
      Animated.timing(innerRotation, { toValue: 1, duration: 18000, easing: Easing.linear, useNativeDriver: true })
    ).start();

    Animated.timing(fadeAnim, { toValue: 1, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(dotPulse, { toValue: 0.4, duration: 800, useNativeDriver: true }),
        Animated.timing(dotPulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // ── Start Streaming (creator only) ─────────────────────────
  const startStreaming = async () => {
    if (isCreator) {
      const roomRef = database().ref(`rooms/${roomId}`);

      try {
        await roomRef.update({
          isStreaming: true
        });

        navigation.replace('Streaming', {
          roomId,
          roomName,
          streamUrl: resolvedStreamUrl,
        });
      } catch (error) {
        console.error("Error starting stream:", error);
        Alert.alert("Error", "Could not start the stream. Please try again.");
      }
    } else {
      Alert.alert(
        'Not Allowed',
        'Only the room creator can start the streaming.',
      );
    }
  };

  const outerSpin = rotationAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const innerSpin = innerRotation.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });

  // ── Participant dots on orbit ──────────────────────────────
  const renderOrbitDots = () => {
    const radius = ORBIT_SIZE / 2 - 28;
    return participants.map((p, i) => {
      const angle = (2 * Math.PI * i) / participants.length - Math.PI / 2;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);

      return (
        <View key={p.id} style={[styles.orbitDot, { transform: [{ translateX: x }, { translateY: y }] }]}>
          <View>
            <LinearGradient
              colors={[p.color, shiftColor(p.color)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.orbitDotGradient,
                !p.isOnline && styles.orbitDotOffline,
              ]}
            >
              <Text style={styles.orbitDotInitial}>{p.initial}</Text>
            </LinearGradient>
            <View
              style={[
                styles.orbitStatusDot,
                { backgroundColor: p.isOnline ? colors.ACCEPT_GREEN : colors.MUTED_COLOR },
              ]}
            />
          </View>
        </View>
      );
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* ── Header ─────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <MaterialIcons name="arrow-back-ios" size={20} color={colors.TITLE_COLOR} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name="film" size={18} color={colors.FILM_GOLD} />
          <Text style={styles.headerTitle}>{roomName || 'Waiting Room'}</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.liveIndicator}>
            <Animated.View style={[styles.liveDot, { opacity: dotPulse }]} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* ── Orbital Animation ─────────────────────────── */}
          <View style={styles.orbitSection}>
            {/* Outer dashed ring */}
            <Animated.View style={[styles.orbitRing, { transform: [{ rotate: outerSpin }] }]}>
              {[0, 1, 2, 3, 4, 5].map(i => (
                <View key={i} style={[styles.ringDot, {
                  transform: [
                    { rotate: `${i * 60}deg` },
                    { translateY: -(ORBIT_SIZE / 2) },
                  ],
                }]} />
              ))}
            </Animated.View>

            {/* Inner ring */}
            <Animated.View style={[styles.innerRing, { transform: [{ rotate: innerSpin }] }]} />

            {/* Participant dots (counter-rotated so they stay upright) */}
            <Animated.View style={[styles.orbitDotsContainer, { transform: [{ rotate: outerSpin }] }]}>
              {renderOrbitDots().map((dot, i) => (
                <Animated.View key={i} style={{ position: 'absolute', transform: [{ rotate: rotationAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] }) }] }}>
                  {dot}
                </Animated.View>
              ))}
            </Animated.View>

            {/* Center play button with pulse rings */}
            <View style={styles.centerArea}>
              <PulseRing delay={0} />
              <PulseRing delay={700} />
              <TouchableOpacity activeOpacity={0.85} onPress={startStreaming} style={styles.playBtnWrap}>
                <LinearGradient
                  colors={isCreator
                    ? [colors.GRADIENT_START, colors.GRADIENT_END]
                    : [colors.MUTED_COLOR, colors.MUTED_COLOR]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.playBtnGradient}
                >
                  <MaterialIcons
                    name={isCreator ? 'play-arrow' : 'lock'}
                    size={isCreator ? 38 : 28}
                    color="#FFF"
                  />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Status Tag + Waiting Text ─────────────────── */}
          <View style={styles.waitingSection}>
            {participants.length > 0 && (
              <View style={[
                styles.availabilityTag,
                { backgroundColor: allOnline ? 'rgba(0, 200, 83, 0.15)' : 'rgba(255, 180, 0, 0.15)' },
              ]}>
                <View style={[
                  styles.availabilityDot,
                  { backgroundColor: allOnline ? colors.ACCEPT_GREEN : colors.FILM_GOLD },
                ]} />
                <Text style={[
                  styles.availabilityText,
                  { color: allOnline ? colors.ACCEPT_GREEN : colors.FILM_GOLD },
                ]}>
                  {allOnline ? 'All Participants Available' : `${onlineCount}/${participants.length} Online`}
                </Text>
              </View>
            )}
            <Text style={styles.waitingTitle}>
              {allOnline ? 'Everyone is here!' : 'Waiting for everyone'}
            </Text>
            <Text style={styles.waitingSub}>
              {isCreator
                ? allOnline
                  ? 'All participants are online. Tap play to start!'
                  : 'Waiting for all participants to come online'
                : 'The screening will begin when the host starts'}
            </Text>
          </View>

          {/* ── Participants List ─────────────────────────── */}
          <View style={styles.listSection}>
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>Participants</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{participants.length}</Text>
              </View>
            </View>

            {participants.map((p, index) => (
              <View key={p.id} style={[styles.participantCard, index === participants.length - 1 && { marginBottom: 0 }]}>
                {/* Avatar with online indicator */}
                <View>
                  <LinearGradient
                    colors={[p.color, shiftColor(p.color)]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[
                      styles.participantAvatar,
                      !p.isOnline && styles.avatarOffline,
                    ]}
                  >
                    <Text style={styles.participantInitial}>{p.initial}</Text>
                  </LinearGradient>
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: p.isOnline ? colors.ACCEPT_GREEN : colors.MUTED_COLOR },
                    ]}
                  />
                </View>
                <View style={styles.participantInfo}>
                  <Text style={styles.participantName}>{p.name}</Text>
                  <Text style={styles.participantUsername}>
                    {p.username} · {p.isOnline ? 'Online' : 'Offline'}
                  </Text>
                </View>
                {p.isHost ? (
                  <View style={styles.hostBadge}>
                    <Ionicons name="star" size={10} color={colors.FILM_GOLD} />
                    <Text style={styles.hostBadgeText}>Host</Text>
                  </View>
                ) : (
                  <View style={[
                    styles.viewerBadge,
                    p.isOnline && styles.viewerBadgeOnline,
                  ]}>
                    <MaterialIcons
                      name="visibility"
                      size={12}
                      color={p.isOnline ? colors.CYAN_ACCENT : colors.MUTED_COLOR}
                    />
                    <Text style={[
                      styles.viewerBadgeText,
                      !p.isOnline && { color: colors.MUTED_COLOR },
                    ]}>Viewer</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
};

// Helper: slightly shift a hex color for gradient endpoint
function shiftColor(hex) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, ((num >> 16) & 255) + 40);
  const g = Math.min(255, ((num >> 8) & 255) + 20);
  const b = Math.min(255, (num & 255) + 60);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// ──────────────────────────────────────────────────────────────
//  Styles
// ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
  },

  // ── Header ────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.BORDER_SUBTLE,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 17,
    fontWeight: '700',
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.LIVE_RED_GLOW,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.LIVE_RED,
  },
  liveText: {
    color: colors.LIVE_RED,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // ── Scroll ────────────────────────
  scrollContent: {
    paddingBottom: 40,
  },

  // ── Orbit Section ─────────────────
  orbitSection: {
    width: ORBIT_SIZE,
    height: ORBIT_SIZE,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  orbitRing: {
    position: 'absolute',
    width: ORBIT_SIZE,
    height: ORBIT_SIZE,
    borderRadius: ORBIT_SIZE / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(124, 58, 237, 0.2)',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringDot: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.PURPLE_ACCENT,
    opacity: 0.5,
    alignSelf: 'center',
  },
  innerRing: {
    position: 'absolute',
    width: ORBIT_SIZE * 0.6,
    height: ORBIT_SIZE * 0.6,
    borderRadius: (ORBIT_SIZE * 0.6) / 2,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.12)',
    borderStyle: 'dashed',
  },
  orbitDotsContainer: {
    position: 'absolute',
    width: ORBIT_SIZE,
    height: ORBIT_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orbitDot: {
    position: 'absolute',
    alignItems: 'center',
  },
  orbitDotGradient: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  orbitDotOffline: {
    opacity: 0.5,
  },
  orbitDotInitial: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  orbitStatusDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.BACKGROUND_COLOR,
  },

  // ── Center Play ───────────────────
  centerArea: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 2,
    borderColor: colors.PRIMARY_COLOR,
  },
  playBtnWrap: {
    borderRadius: 35,
    overflow: 'hidden',
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  playBtnGradient: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Waiting Text ──────────────────
  waitingSection: {
    alignItems: 'center',
    marginTop: 28,
    paddingHorizontal: 40,
  },
  availabilityTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 7,
    marginBottom: 14,
  },
  availabilityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  availabilityText: {
    fontSize: 13,
    fontWeight: '700',
  },
  waitingTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  waitingSub: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Participants List ─────────────
  listSection: {
    marginTop: 28,
    paddingHorizontal: 20,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  listTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 16,
    fontWeight: '700',
  },
  countBadge: {
    backgroundColor: colors.PURPLE_GLOW,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  countBadgeText: {
    color: colors.PURPLE_ACCENT,
    fontSize: 11,
    fontWeight: '800',
  },
  participantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.CARD_COLOR,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  participantAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarOffline: {
    opacity: 0.5,
  },
  statusDot: {
    position: 'absolute',
    bottom: 0,
    right: 10,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.CARD_COLOR,
  },
  participantInitial: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  participantInfo: {
    flex: 1,
  },
  participantName: {
    color: colors.TITLE_COLOR,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  participantUsername: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    fontWeight: '500',
  },
  hostBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.FILM_GOLD_GLOW,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  hostBadgeText: {
    color: colors.FILM_GOLD,
    fontSize: 11,
    fontWeight: '800',
  },
  viewerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  viewerBadgeOnline: {
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
  },
  viewerBadgeText: {
    color: colors.CYAN_ACCENT,
    fontSize: 11,
    fontWeight: '700',
  },
});

export default WaitingScreen;
