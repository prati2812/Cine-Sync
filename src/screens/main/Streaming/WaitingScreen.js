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
} from 'react-native';
import { getDatabase, ref, onValue } from 'firebase/database';
import { auth } from '../../../config/firebase';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import colors from '../../../theme/Colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ORBIT_SIZE = SCREEN_WIDTH * 0.78;

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
  const { roomId, roomName, streamUrl } = route.params;
  const [participants, setParticipants] = useState([]);
  const [isStreamingAllowed, setIsStreamingAllowed] = useState(false);
  const currentUser = auth.currentUser;

  // Animations
  const rotationAnim = useRef(new Animated.Value(0)).current;
  const innerRotation = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const dotPulse = useRef(new Animated.Value(1)).current;

  const mockParticipants = [
    { id: 1, name: 'John Doe', username: '@johndoe', color: colors.PRIMARY_COLOR, initial: 'JD', isHost: true },
    { id: 2, name: 'Jane Smith', username: '@janesmith', color: colors.PURPLE_ACCENT, initial: 'JS' },
    { id: 3, name: 'Mike Johnson', username: '@mikej', color: colors.CYAN_ACCENT, initial: 'MJ' },
  ];

  useEffect(() => {
    const db = getDatabase();
    const roomRef = ref(db, `rooms/${roomId}/participants`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setParticipants(data);
        setIsStreamingAllowed(data.includes(currentUser.email));
      }
    });
    return () => unsubscribe();
  }, [roomId, currentUser]);

  useEffect(() => {
    // Outer orbit rotation
    Animated.loop(
      Animated.timing(rotationAnim, { toValue: 1, duration: 12000, easing: Easing.linear, useNativeDriver: true })
    ).start();

    // Inner orbit rotation (reverse)
    Animated.loop(
      Animated.timing(innerRotation, { toValue: 1, duration: 18000, easing: Easing.linear, useNativeDriver: true })
    ).start();

    // Fade in
    Animated.timing(fadeAnim, { toValue: 1, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();

    // Waiting dots pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(dotPulse, { toValue: 0.4, duration: 800, useNativeDriver: true }),
        Animated.timing(dotPulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const startStreaming = () => {
    if (currentUser.email !== participants[0]) {
      navigation.navigate('Streaming', { roomId, roomName, streamUrl });
    } else {
      alert('Only the room creator can start the streaming.');
    }
  };

  const outerSpin = rotationAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const innerSpin = innerRotation.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });

  // ── Participant dots on orbit ─────────────────────────────
  const renderOrbitDots = () => {
    const radius = ORBIT_SIZE / 2 - 28;
    return mockParticipants.map((p, i) => {
      const angle = (2 * Math.PI * i) / mockParticipants.length - Math.PI / 2;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);

      return (
        <View key={p.id} style={[styles.orbitDot, { transform: [{ translateX: x }, { translateY: y }] }]}>
          <LinearGradient
            colors={[p.color, shiftColor(p.color)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.orbitDotGradient}
          >
            <Text style={styles.orbitDotInitial}>{p.initial}</Text>
          </LinearGradient>
          <View style={styles.orbitDotLabel}>
            <Text style={styles.orbitDotLabelText}>{p.username}</Text>
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
              {/* Decorative dots on the ring */}
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
                  colors={[colors.GRADIENT_START, colors.GRADIENT_END]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.playBtnGradient}
                >
                  <MaterialIcons name="play-arrow" size={38} color="#FFF" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Waiting Text ──────────────────────────────── */}
          <View style={styles.waitingSection}>
            <Text style={styles.waitingTitle}>Waiting for everyone</Text>
            <Text style={styles.waitingSub}>The screening will begin when the host starts</Text>
          </View>

          {/* ── Participants List ─────────────────────────── */}
          <View style={styles.listSection}>
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>Participants</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{mockParticipants.length}</Text>
              </View>
            </View>

            {mockParticipants.map((p, index) => (
              <View key={p.id} style={[styles.participantCard, index === mockParticipants.length - 1 && { marginBottom: 0 }]}>
                <LinearGradient
                  colors={[p.color, shiftColor(p.color)]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.participantAvatar}
                >
                  <Text style={styles.participantInitial}>{p.initial}</Text>
                </LinearGradient>
                <View style={styles.participantInfo}>
                  <Text style={styles.participantName}>{p.name}</Text>
                  <Text style={styles.participantUsername}>{p.username}</Text>
                </View>
                {p.isHost ? (
                  <View style={styles.hostBadge}>
                    <Ionicons name="star" size={10} color={colors.FILM_GOLD} />
                    <Text style={styles.hostBadgeText}>Host</Text>
                  </View>
                ) : (
                  <View style={styles.viewerBadge}>
                    <MaterialIcons name="visibility" size={12} color={colors.CYAN_ACCENT} />
                    <Text style={styles.viewerBadgeText}>Viewer</Text>
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
  orbitDotInitial: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  orbitDotLabel: {
    position: 'absolute',
    bottom: -22,
    backgroundColor: 'rgba(15, 15, 26, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  orbitDotLabelText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 10,
    fontWeight: '600',
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
  viewerBadgeText: {
    color: colors.CYAN_ACCENT,
    fontSize: 11,
    fontWeight: '700',
  },
});

export default WaitingScreen;