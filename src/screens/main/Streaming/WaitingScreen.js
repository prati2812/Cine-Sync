import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Dimensions,
  Alert,
  ImageBackground,
  Share,
  Animated,
  Easing,
  StatusBar,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, database } from '../../../config/firebase';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import colors from '../../../theme/Colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

const WaitingScreen = ({ route, navigation }) => {
  const { roomId, roomName, streamUrl: routeStreamUrl, thumbnail: routeThumbnail } = route?.params || {};
  const currentUser = auth().currentUser;
  const insets = useSafeAreaInsets();

  const [roomData, setRoomData] = useState(null);
  const [participantProfiles, setParticipantProfiles] = useState([]);
  const [onlineStatuses, setOnlineStatuses] = useState({});
  const [isCreator, setIsCreator] = useState(false);
  const [resolvedStreamUrl, setResolvedStreamUrl] = useState(routeStreamUrl);
  const [userMicMuted, setUserMicMuted] = useState({});
  const [isHostReady, setIsHostReady] = useState(true);
  const [isMicTesting, setIsMicTesting] = useState(false);
  const [isPlayingChime, setIsPlayingChime] = useState(false);
  const [eqHeights, setEqHeights] = useState([8, 12, 20, 16, 8, 18, 12, 6]);

  // Animations
  const spinValue = useRef(new Animated.Value(0)).current;
  const pulseValue = useRef(new Animated.Value(1)).current;
  const statusListenersRef = useRef([]);

  // Loop Spinner & Pulse
  useEffect(() => {
    Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 4000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseValue, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  // Animate EQ Bars
  useEffect(() => {
    const interval = setInterval(() => {
      setEqHeights(
        Array.from({ length: 8 }, () => Math.floor(Math.random() * 16) + 4)
      );
    }, 180);
    return () => clearInterval(interval);
  }, []);

  // Fetch Room & Participants
  useEffect(() => {
    const roomRef = database().ref(`rooms/${roomId}`);

    const onValueHandler = async snapshot => {
      const data = snapshot.val();
      if (!data) return;
      setRoomData(data);

      setIsCreator(currentUser?.uid === data.creator?.uid);
      if (data.streamUrl) setResolvedStreamUrl(data.streamUrl);

      // Auto-navigate non-creators when stream starts
      if (data.isStreaming && currentUser?.uid !== data.creator?.uid) {
        navigation.replace('Streaming', {
          roomId,
          roomName,
          streamUrl: data.streamUrl || resolvedStreamUrl,
        });
        return;
      }

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

  // Real-time status listeners
  useEffect(() => {
    statusListenersRef.current.forEach(u => u());
    statusListenersRef.current = [];

    if (participantProfiles.length === 0) return;

    const db = database();

    participantProfiles.forEach(p => {
      if (!p.uid) return;
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

  const participants = participantProfiles.map(p => ({
    ...p,
    isOnline: onlineStatuses[p.uid] ?? false,
  }));

  const onlineCount = participants.filter(p => p.isOnline).length;
  const progressPercent = participants.length > 0
    ? Math.round((onlineCount / participants.length) * 100)
    : 0;

  // Spin interpolation
  const spinDegree = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Start Streaming Handler
  const startStreaming = async () => {
    if (isCreator) {
      const roomRef = database().ref(`rooms/${roomId}`);
      try {
        await roomRef.update({
          isStreaming: true,
        });

        navigation.replace('Streaming', {
          roomId,
          roomName,
          streamUrl: resolvedStreamUrl,
        });
      } catch (error) {
        console.error('Error starting stream:', error);
        Alert.alert('Error', 'Could not start the stream. Please try again.');
      }
    } else {
      Alert.alert('Not Allowed', 'Only the room creator can start the stream.');
    }
  };

  // Navigate to Room Details & Sharing
  const handleShareRoom = () => {
    navigation.navigate('StreamInfo', {
      roomId,
      roomName,
      streamUrl: resolvedStreamUrl || streamUrl,
    });
  };

  // Toggle Mute Handler
  const toggleMic = (uid) => {
    setUserMicMuted(prev => ({ ...prev, [uid]: !prev[uid] }));
  };

  // Hardware Test Actions
  const handleTestMic = () => {
    setIsMicTesting(true);
    setTimeout(() => setIsMicTesting(false), 1500);
  };

  const handlePlayChime = () => {
    setIsPlayingChime(true);
    setTimeout(() => setIsPlayingChime(false), 1500);
  };

  // Calculate dynamic top inset padding for Android & iOS notch safety
  const safeTopPadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 12
  ) + 8;

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={colors.BACKGROUND_COLOR} barStyle="light-content" translucent />

      {/* ── TOP HEADER ─────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: safeTopPadding }]}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <MaterialIcons name="arrow-back" size={22} color={colors.TITLE_COLOR} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerTitleWrap}
          onPress={handleShareRoom}
          activeOpacity={0.8}
        >
          <Text style={styles.headerTitle}>Room #{roomId}</Text>
          <View style={styles.headerStatusTag}>
            <View style={styles.statusPingDot} />
            <Text style={styles.statusTagText}>
              {isCreator ? 'Host Control' : 'Waiting for Host'}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerBtn}
          onPress={handleShareRoom}
          activeOpacity={0.8}
        >
          <MaterialIcons name="ios-share" size={20} color={colors.PRIMARY_COLOR} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── HERO STREAM PREVIEW CARD ───────────────────────────── */}
        <View style={styles.heroCard}>
          {(roomData?.thumbnail || routeThumbnail) ? (
            <ImageBackground
              source={{ uri: roomData?.thumbnail || routeThumbnail }}
              style={styles.heroBgImage}
              imageStyle={{ borderTopLeftRadius: 20, borderTopRightRadius: 20 }}
            >
              <LinearGradient
                colors={['transparent', colors.SURFACE_COLOR]}
                style={styles.heroOverlay}
              >
                {/* Spinner Center */}
                <View style={styles.loaderCenter}>
                  <Animated.View
                    style={[
                      styles.loaderRing,
                      { transform: [{ scale: pulseValue }] },
                    ]}
                  />
                  <View style={styles.loaderIconBox}>
                    <Animated.View style={{ transform: [{ rotate: spinDegree }] }}>
                      <MaterialIcons name="sync" size={26} color={colors.CYAN_ACCENT} />
                    </Animated.View>
                  </View>
                </View>

                <Text style={styles.heroLoaderText}>
                  {isCreator
                    ? 'Ready to Launch Stream...'
                    : 'Waiting for Host to Launch Stream...'}
                </Text>
                <Text style={styles.heroSubText}>
                  Synchronized 4K streaming buffer ready
                </Text>
              </LinearGradient>
            </ImageBackground>
          ) : (
            <View style={[styles.heroBgImage, { backgroundColor: '#131326' }]}>
              <LinearGradient
                colors={['#1E1B4B', colors.SURFACE_COLOR]}
                style={styles.heroOverlay}
              >
                {/* Spinner Center */}
                <View style={styles.loaderCenter}>
                  <Animated.View
                    style={[
                      styles.loaderRing,
                      { transform: [{ scale: pulseValue }] },
                    ]}
                  />
                  <View style={styles.loaderIconBox}>
                    <Animated.View style={{ transform: [{ rotate: spinDegree }] }}>
                      <MaterialIcons name="sync" size={26} color={colors.CYAN_ACCENT} />
                    </Animated.View>
                  </View>
                </View>

                <Text style={styles.heroLoaderText}>
                  {isCreator
                    ? 'Ready to Launch Stream...'
                    : 'Waiting for Host to Launch Stream...'}
                </Text>
                <Text style={styles.heroSubText}>
                  Synchronized 4K streaming buffer ready
                </Text>
              </LinearGradient>
            </View>
          )}

          {/* Details Section */}
          <View style={styles.heroDetails}>
            <Text style={styles.movieTitle}>
              {roomName || 'Watch Party Room'}
            </Text>

            <View style={styles.tagRow}>
              <View style={styles.tagPill}>
                <Text style={styles.tagTextSecondary}>Live Sync</Text>
              </View>
              <View style={styles.tagPill}>
                <MaterialIcons name="hd" size={14} color={colors.CYAN_ACCENT} style={{ marginRight: 3 }} />
                <Text style={styles.tagTextCyan}>4K Ultra HD</Text>
              </View>
              <View style={styles.tagPill}>
                <MaterialIcons name="surround-sound" size={14} color={colors.PURPLE_ACCENT} style={{ marginRight: 3 }} />
                <Text style={styles.tagTextPurple}>Spatial Audio</Text>
              </View>
            </View>

            {/* Host Info Box */}
            <View style={styles.hostBox}>
              <View style={styles.hostLeft}>
                <View style={styles.hostAvatarCircle}>
                  <Ionicons name="person" size={20} color="#FFF" />
                </View>
                <View>
                  <Text style={styles.hostRoleText}>Stream Leader</Text>
                  <Text style={styles.hostNameText}>
                    {isCreator ? `@${currentUser?.email?.split('@')[0]}` : 'Room Host'}
                  </Text>
                </View>
              </View>
              <View style={styles.hostVipTag}>
                <MaterialIcons name="grade" size={13} color={colors.FILM_GOLD} style={{ marginRight: 3 }} />
                <Text style={styles.hostVipText}>Host VIP</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── PARTICIPANTS STATUS GRID ──────────────────────────── */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleWrap}>
              <Text style={styles.sectionTitle}>Participants Ready</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>
                  {onlineCount} / {participants.length}
                </Text>
              </View>
            </View>
            <Text style={styles.progressPercentText}>{progressPercent}% Locked In</Text>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${Math.max(progressPercent, 5)}%` },
              ]}
            />
          </View>

          {/* Participant Cards */}
          <View style={styles.participantList}>
            {participants.map((p) => {
              const isMuted = userMicMuted[p.uid] ?? false;
              return (
                <View key={p.id} style={styles.participantCard}>
                  <View style={styles.participantLeft}>
                    <View style={styles.avatarWrap}>
                      <LinearGradient
                        colors={[p.color, colors.PURPLE_ACCENT]}
                        style={styles.avatarGradient}
                      >
                        <Text style={styles.avatarInitial}>{p.initial}</Text>
                      </LinearGradient>
                      <View
                        style={[
                          styles.onlineDot,
                          { backgroundColor: p.isOnline ? colors.ACCEPT_GREEN : colors.MUTED_COLOR },
                        ]}
                      />
                    </View>

                    <View>
                      <View style={styles.nameRow}>
                        <Text style={styles.participantName}>{p.name}</Text>
                        {p.isHost && <Text style={styles.crownIcon}>👑</Text>}
                      </View>
                      <View style={styles.statusRow}>
                        <View
                          style={[
                            styles.statusPill,
                            { backgroundColor: p.isOnline ? colors.ACCEPT_GREEN_GLOW : colors.FILM_GOLD_GLOW },
                          ]}
                        >
                          <MaterialIcons
                            name={p.isOnline ? 'check' : 'hourglass-empty'}
                            size={12}
                            color={p.isOnline ? colors.ACCEPT_GREEN : colors.FILM_GOLD}
                          />
                          <Text
                            style={[
                              styles.statusPillText,
                              { color: p.isOnline ? colors.ACCEPT_GREEN : colors.FILM_GOLD },
                            ]}
                          >
                            {p.isOnline ? 'Ready' : 'Connecting'}
                          </Text>
                        </View>
                        <Text style={styles.participantSubtext}>
                          {p.isHost ? 'Host Ready' : p.isOnline ? 'Device Synced' : '42ms'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Mic Toggle Button */}
                  <TouchableOpacity
                    style={[
                      styles.micBtn,
                      isMuted && styles.micBtnMuted,
                    ]}
                    onPress={() => toggleMic(p.uid)}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons
                      name={isMuted ? 'mic-off' : 'mic'}
                      size={18}
                      color={isMuted ? colors.DELETE_RED_COLOR : colors.CYAN_ACCENT}
                    />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </View>

        {/* ── AUDIO & VIDEO HARDWARE SETUP ─────────────────────── */}
        <View style={styles.hardwareCard}>
          <View style={styles.hardwareHeader}>
            <View style={styles.sectionTitleWrap}>
              <MaterialIcons name="tune" size={20} color={colors.PRIMARY_COLOR} style={{ marginRight: 6 }} />
              <Text style={styles.sectionTitle}>Audio & Video Setup</Text>
            </View>
            <View style={styles.fidelityTag}>
              <Text style={styles.fidelityText}>High Fidelity</Text>
            </View>
          </View>

          {/* Input Device Box */}
          <View style={styles.deviceBox}>
            <View style={styles.deviceTop}>
              <View style={styles.deviceInfoLeft}>
                <View style={styles.deviceIconCircle}>
                  <Ionicons name="headset" size={18} color={colors.PRIMARY_COLOR} />
                </View>
                <View>
                  <Text style={styles.deviceLabel}>INPUT DEVICE</Text>
                  <Text style={styles.deviceName}>AirPods Pro (Active)</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.testActionBtn, isMicTesting && styles.testActionActive]}
                onPress={handleTestMic}
                activeOpacity={0.8}
              >
                <Text style={styles.testActionText}>
                  {isMicTesting ? 'Testing...' : 'Test Mic'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* EQ Level Indicator */}
            <View style={styles.eqRow}>
              <Text style={styles.eqLabel}>Mic Input Level</Text>
              <View style={styles.eqBarsContainer}>
                {eqHeights.map((h, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.eqBar,
                      { height: h, backgroundColor: idx % 2 === 0 ? colors.PRIMARY_COLOR : colors.CYAN_ACCENT },
                    ]}
                  />
                ))}
              </View>
            </View>
          </View>

          {/* Sound Output Box */}
          <View style={styles.deviceBox}>
            <View style={styles.deviceTop}>
              <View style={styles.deviceInfoLeft}>
                <View style={styles.deviceIconCircleCyan}>
                  <MaterialIcons name="speaker-group" size={18} color={colors.CYAN_ACCENT} />
                </View>
                <View>
                  <Text style={styles.deviceLabel}>SOUND OUTPUT</Text>
                  <Text style={styles.deviceName}>Stereo Sound: Synced</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.chimeBtn, isPlayingChime && styles.chimeBtnActive]}
                onPress={handlePlayChime}
                activeOpacity={0.8}
              >
                <Text style={styles.chimeBtnText}>
                  {isPlayingChime ? '🔊 Playing...' : '🔔 Play Test Chime'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── BOTTOM DOCK ACTIONS ───────────────────────────────── */}
        <View style={styles.bottomDock}>
          {isCreator ? (
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.launchBtnWrap}
              onPress={startStreaming}
            >
              <LinearGradient
                colors={[colors.GRADIENT_START, colors.GRADIENT_END]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.launchBtnGradient}
              >
                <MaterialIcons name="rocket-launch" size={22} color="#FFF" />
                <Text style={styles.launchBtnText}>
                  Start Watch Party for Everyone
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <View style={styles.guestWaitingBox}>
              <MaterialIcons name="sync" size={20} color={colors.CYAN_ACCENT} style={{ marginRight: 6 }} />
              <Text style={styles.guestWaitingText}>
                Waiting for the host to launch stream...
              </Text>
            </View>
          )}

          <View style={styles.secondaryActionRow}>
            <TouchableOpacity
              style={[
                styles.readyToggleBtn,
                isHostReady ? styles.readyActive : styles.readyInactive,
              ]}
              onPress={() => setIsHostReady(!isHostReady)}
              activeOpacity={0.8}
            >
              <MaterialIcons
                name={isHostReady ? 'check-circle' : 'pause-circle'}
                size={18}
                color={isHostReady ? colors.ACCEPT_GREEN : colors.SUB_TITLE_COLOR}
              />
              <Text
                style={[
                  styles.readyToggleText,
                  { color: isHostReady ? colors.ACCEPT_GREEN : colors.TITLE_COLOR },
                ]}
              >
                {isHostReady ? "I'm Ready" : 'Not Ready'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.leaveLobbyBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.8}
            >
              <MaterialIcons name="logout" size={18} color={colors.DELETE_RED_COLOR} />
              <Text style={styles.leaveLobbyText}>Leave Lobby</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

// ──────────────────────────────────────────────────────────────
//  Styles
// ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },

  // ── Header ────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.BACKGROUND_COLOR,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleWrap: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.TITLE_COLOR,
  },
  headerStatusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 2,
    gap: 4,
  },
  statusPingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.CYAN_ACCENT,
  },
  statusTagText: {
    color: colors.CYAN_ACCENT,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // ── Hero Preview Card ─────────────
  heroCard: {
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 20,
    overflow: 'hidden',
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
  },
  heroBgImage: {
    width: '100%',
    height: 200,
  },
  heroOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  loaderCenter: {
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  loaderRing: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(6, 182, 212, 0.25)',
  },
  loaderIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroLoaderText: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  heroSubText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    marginTop: 2,
  },

  heroDetails: {
    padding: 16,
    gap: 10,
  },
  movieTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 20,
    fontWeight: '800',
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tagTextSecondary: {
    color: colors.TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '600',
  },
  tagTextCyan: {
    color: colors.CYAN_ACCENT,
    fontSize: 11,
    fontWeight: '600',
  },
  tagTextPurple: {
    color: colors.PURPLE_ACCENT,
    fontSize: 11,
    fontWeight: '600',
  },

  hostBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.BACKGROUND_COLOR,
    padding: 12,
    borderRadius: 14,
    marginTop: 4,
  },
  hostLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hostAvatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.PRIMARY_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hostRoleText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
  },
  hostNameText: {
    color: colors.TITLE_COLOR,
    fontSize: 13,
    fontWeight: '700',
  },
  hostVipTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.FILM_GOLD_GLOW,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  hostVipText: {
    color: colors.FILM_GOLD,
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Participants Grid ─────────────
  sectionContainer: {
    marginTop: 18,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 16,
    fontWeight: '800',
  },
  countBadge: {
    backgroundColor: colors.PURPLE_ACCENT,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  progressPercentText: {
    color: colors.CYAN_ACCENT,
    fontSize: 12,
    fontWeight: '600',
  },

  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.SURFACE_ELEVATED,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.PRIMARY_COLOR,
    borderRadius: 3,
  },

  participantList: {
    gap: 8,
    marginTop: 4,
  },
  participantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.SURFACE_COLOR,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
  },
  participantLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarGradient: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.SURFACE_COLOR,
  },

  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  participantName: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '700',
  },
  crownIcon: {
    fontSize: 12,
  },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  participantSubtext: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
  },

  micBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micBtnMuted: {
    backgroundColor: colors.DECLINE_RED_GLOW,
  },

  // ── Hardware Setup ────────────────
  hardwareCard: {
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 20,
    padding: 16,
    marginTop: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
  },
  hardwareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fidelityTag: {
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  fidelityText: {
    color: colors.CYAN_ACCENT,
    fontSize: 11,
    fontWeight: '600',
  },

  deviceBox: {
    backgroundColor: colors.BACKGROUND_COLOR,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  deviceTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deviceInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  deviceIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.PRIMARY_GLOW,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deviceIconCircleCyan: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(6, 182, 212, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deviceLabel: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  deviceName: {
    color: colors.TITLE_COLOR,
    fontSize: 13,
    fontWeight: '700',
  },

  testActionBtn: {
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  testActionActive: {
    backgroundColor: colors.PRIMARY_COLOR,
  },
  testActionText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },

  eqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.SURFACE_ELEVATED,
    paddingTop: 8,
  },
  eqLabel: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
  },
  eqBarsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 20,
  },
  eqBar: {
    width: 4,
    borderRadius: 2,
  },

  chimeBtn: {
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  chimeBtnActive: {
    backgroundColor: colors.CYAN_ACCENT,
  },
  chimeBtnText: {
    color: colors.CYAN_ACCENT,
    fontSize: 12,
    fontWeight: '600',
  },

  // ── Bottom Dock ───────────────────
  bottomDock: {
    marginTop: 20,
    gap: 12,
  },
  launchBtnWrap: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  launchBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  launchBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },

  guestWaitingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingVertical: 14,
    borderRadius: 20,
  },
  guestWaitingText: {
    color: colors.CYAN_ACCENT,
    fontSize: 14,
    fontWeight: '700',
  },

  secondaryActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  readyToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 20,
    gap: 6,
  },
  readyActive: {
    backgroundColor: colors.ACCEPT_GREEN_GLOW,
  },
  readyInactive: {
    backgroundColor: colors.SURFACE_ELEVATED,
  },
  readyToggleText: {
    fontSize: 13,
    fontWeight: '700',
  },

  leaveLobbyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingVertical: 12,
    borderRadius: 20,
    gap: 6,
  },
  leaveLobbyText: {
    color: colors.DELETE_RED_COLOR,
    fontSize: 13,
    fontWeight: '700',
  },
});

export default WaitingScreen;
