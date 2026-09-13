import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
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
import { getYouTubeThumbnailDetails } from '../../../functions';

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

// ──────────────────────────────────────────────────────────────
//  Safe Clipboard Helper
// ──────────────────────────────────────────────────────────────
const copyTextSafely = async (text) => {
  try {
    let ClipboardModule = null;
    try {
      ClipboardModule = require('@react-native-clipboard/clipboard').default;
    } catch (err) {
      // Module not linked
    }
    if (ClipboardModule && typeof ClipboardModule.setString === 'function') {
      ClipboardModule.setString(text);
      return true;
    }
  } catch (e) {
    console.warn('Clipboard setString warning:', e);
  }
  return false;
};

// ──────────────────────────────────────────────────────────────
//  Waiting Hero Preview (Cinematic 16:9 Widescreen)
// ──────────────────────────────────────────────────────────────
const WaitingHeroPreview = ({ streamUrl, thumbnail, children }) => {
  const thumbDetails = getYouTubeThumbnailDetails(streamUrl);
  const maxresUrl = thumbDetails?.maxresUrl || null;
  const fallbackUri = thumbDetails?.fallbackUrl || null;
  const initialUri =
    thumbnail && typeof thumbnail === 'string' && thumbnail.startsWith('http')
      ? thumbnail
      : maxresUrl;

  const [imgUri, setImgUri] = useState(initialUri);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const nextUri =
      thumbnail && typeof thumbnail === 'string' && thumbnail.startsWith('http')
        ? thumbnail
        : maxresUrl;
    setImgUri(nextUri);
    setHasError(false);
  }, [maxresUrl, thumbnail]);

  if (imgUri && !hasError) {
    return (
      <ImageBackground
        source={{ uri: imgUri }}
        style={styles.heroBgImage}
        imageStyle={styles.heroBgImageRadius}
        onError={() => {
          if (fallbackUri && imgUri !== fallbackUri) {
            setImgUri(fallbackUri);
          } else {
            setHasError(true);
          }
        }}
      >
        <LinearGradient
          colors={[
            'rgba(8, 8, 16, 0.55)',
            'rgba(8, 8, 16, 0.2)',
            'rgba(8, 8, 16, 0.75)',
            colors.SURFACE_COLOR,
          ]}
          locations={[0, 0.35, 0.75, 1]}
          style={styles.heroGradientOverlay}
        >
          {children}
        </LinearGradient>
      </ImageBackground>
    );
  }

  return (
    <View style={[styles.heroBgImage, { backgroundColor: colors.SURFACE_ELEVATED }]}>
      <LinearGradient
        colors={[
          'rgba(124, 58, 237, 0.35)',
          'rgba(8, 8, 16, 0.3)',
          'rgba(8, 8, 16, 0.8)',
          colors.SURFACE_COLOR,
        ]}
        locations={[0, 0.35, 0.75, 1]}
        style={styles.heroGradientOverlay}
      >
        {children}
      </LinearGradient>
    </View>
  );
};

// ──────────────────────────────────────────────────────────────
//  Main WaitingScreen Component (Option A - The Cinema Lounge)
// ──────────────────────────────────────────────────────────────
const WaitingScreen = ({ route, navigation }) => {
  const {
    roomId,
    roomName: initialRoomName,
    streamUrl: routeStreamUrl,
    thumbnail: routeThumbnail,
  } = route?.params || {};

  const currentUser = auth().currentUser;
  const insets = useSafeAreaInsets();

  // State
  const [roomData, setRoomData] = useState(null);
  const [participantProfiles, setParticipantProfiles] = useState([]);
  const [onlineStatuses, setOnlineStatuses] = useState({});
  const [isCreator, setIsCreator] = useState(false);
  const [resolvedStreamUrl, setResolvedStreamUrl] = useState(routeStreamUrl);
  const [userMicMuted, setUserMicMuted] = useState({});
  const [isGuestReady, setIsGuestReady] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const statusListenersRef = useRef([]);

  // Subtle live pulse indicator
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.25,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  // Fetch Room & Participants
  useEffect(() => {
    if (!roomId) return;
    const roomRef = database().ref(`rooms/${roomId}`);

    const onValueHandler = async (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      setRoomData(data);

      const creatorMatches = currentUser?.uid === data.creator?.uid;
      setIsCreator(creatorMatches);
      if (data.streamUrl) setResolvedStreamUrl(data.streamUrl);

      // Auto-navigate non-creators when stream starts
      if (data.isStreaming && !creatorMatches) {
        navigation.replace('Streaming', {
          roomId,
          roomName: data.name || initialRoomName || 'Cinema Stream',
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
  }, [roomId, currentUser, initialRoomName, resolvedStreamUrl, navigation]);

  // Real-time user online statuses
  useEffect(() => {
    statusListenersRef.current.forEach((u) => u());
    statusListenersRef.current = [];

    if (participantProfiles.length === 0) return;

    const db = database();
    participantProfiles.forEach((p) => {
      if (!p.uid) return;
      const statusRef = db.ref(`users/${p.uid}/status`);
      const onValueHandler = (snap) => {
        const val = snap.val();
        const isOnline = val === 'online' || val?.state === 'online';
        setOnlineStatuses((prev) => ({ ...prev, [p.uid]: isOnline }));
      };
      statusRef.on('value', onValueHandler);
      statusListenersRef.current.push({ ref: statusRef, handler: onValueHandler });
    });

    return () => {
      statusListenersRef.current.forEach(({ ref: r, handler }) => r.off('value', handler));
      statusListenersRef.current = [];
    };
  }, [participantProfiles]);

  const participants = participantProfiles.map((p) => ({
    ...p,
    isOnline: onlineStatuses[p.uid] ?? false,
  }));

  const onlineCount = participants.filter((p) => p.isOnline).length;
  const totalCount = Math.max(participants.length, 1);
  const progressPercent = Math.round((onlineCount / totalCount) * 100);

  // Derived Values
  const displayName = roomData?.name || initialRoomName || 'Screening Lounge';
  const cleanRoomCode = roomId ? roomId.replace('room_', '') : '0000';
  const shortRoomCode = cleanRoomCode.slice(-6).toUpperCase();
  const roomPin = roomData?.pin || null;
  const isPrivate = !!roomData?.isPrivate;

  // Actions
  const handleLaunchScreening = async () => {
    if (!isCreator) {
      Alert.alert('Host Only', 'Only the room creator can launch the screening room.');
      return;
    }

    const roomRef = database().ref(`rooms/${roomId}`);
    try {
      await roomRef.update({
        isStreaming: true,
      });

      navigation.replace('Streaming', {
        roomId,
        roomName: displayName,
        streamUrl: resolvedStreamUrl || routeStreamUrl,
      });
    } catch (error) {
      console.error('Error launching stream:', error);
      Alert.alert('Error', 'Could not start the screening room. Please try again.');
    }
  };

  const handleShareRoom = async () => {
    const pinText = isPrivate && roomPin ? `\nAccess PIN: ${roomPin}` : '';
    const shareMessage = `🎬 Join my Cine-Sync Watch Party "${displayName}"!\nRoom Code: #${cleanRoomCode}${pinText}\nLaunch Cine-Sync to watch together in live sync!`;

    try {
      await Share.share({
        title: `Cine-Sync: ${displayName}`,
        message: shareMessage,
      });
    } catch (error) {
      console.log('Share error:', error);
    }
  };

  const handleCopyCode = async () => {
    const success = await copyTextSafely(cleanRoomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
    if (!success) {
      Alert.alert('Room Code', cleanRoomCode);
    }
  };

  const handleCopyPin = async () => {
    if (!roomPin) return;
    const success = await copyTextSafely(roomPin);
    setCopiedPin(true);
    setTimeout(() => setCopiedPin(false), 2000);
    if (!success) {
      Alert.alert('Access PIN', roomPin);
    }
  };

  // Inline Host Moderation
  const handleParticipantPress = (p) => {
    if (!isCreator || p.isHost) return;

    Alert.alert(
      `Manage @${p.name}`,
      `Audience Member • ${p.isOnline ? 'Online' : 'Connecting'}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Make Host',
          onPress: () => handleTransferHost(p),
        },
        {
          text: 'Remove from Lounge',
          style: 'destructive',
          onPress: () => handleRemoveParticipant(p),
        },
      ]
    );
  };

  const handleTransferHost = (targetUser) => {
    Alert.alert(
      'Transfer Host Role',
      `Make @${targetUser.name} the new room leader? You will relinquish stream launch control.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Transfer',
          style: 'destructive',
          onPress: async () => {
            try {
              await database().ref(`rooms/${roomId}/creator`).update({
                email: targetUser.email,
                userName: targetUser.name,
                uid: targetUser.uid,
              });
              Alert.alert('Host Transferred', `@${targetUser.name} is now the host.`);
            } catch (err) {
              Alert.alert('Error', 'Failed to transfer host privilege.');
            }
          },
        },
      ]
    );
  };

  const handleRemoveParticipant = (targetUser) => {
    Alert.alert(
      'Remove Viewer',
      `Remove @${targetUser.name} from this screening lounge?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const updated = (roomData?.participants || []).filter(
                (e) => e.toLowerCase() !== targetUser.email.toLowerCase()
              );
              await database().ref(`rooms/${roomId}/participants`).set(updated);
            } catch (err) {
              Alert.alert('Error', 'Failed to remove viewer.');
            }
          },
        },
      ]
    );
  };

  const handleLeaveLounge = () => {
    Alert.alert(
      'Leave Lounge?',
      isCreator
        ? 'As the host, leaving will exit the lounge. Other viewers can remain in the lobby until you return.'
        : 'Are you sure you want to leave this screening room?',
      [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => navigation.goBack() },
      ]
    );
  };

  const toggleMic = (uid) => {
    setUserMicMuted((prev) => ({ ...prev, [uid]: !prev[uid] }));
  };

  // Safe area paddings
  const safeTopPadding =
    Math.max(
      insets.top,
      Platform.OS === 'android' ? StatusBar.currentHeight || 28 : 12
    ) + 8;
  const safeBottomPadding = Math.max(insets.bottom, 16);

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={colors.BACKGROUND_COLOR} barStyle="light-content" translucent />

      {/* Ambient Top Glow */}
      <View style={styles.ambientTopGlow} pointerEvents="none">
        <LinearGradient
          colors={['rgba(124, 58, 237, 0.16)', 'rgba(0, 122, 255, 0.08)', 'transparent']}
          style={StyleSheet.absoluteFillObject}
        />
      </View>

      {/* ── TOP HEADER ─────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: safeTopPadding }]}>
        <TouchableOpacity
          style={styles.headerSquareBtn}
          onPress={handleLeaveLounge}
          activeOpacity={0.8}
        >
          <MaterialIcons name="arrow-back" size={22} color={colors.TITLE_COLOR} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerScreenTitle} numberOfLines={1}>
            {displayName}
          </Text>
          <View style={styles.headerSubRow}>
            <View style={styles.roomCodeBadge}>
              <Text style={styles.roomCodeBadgeText}>#{shortRoomCode}</Text>
            </View>
            <View style={styles.headerStatusPill}>
              <Animated.View
                style={[
                  styles.headerStatusDot,
                  {
                    transform: [{ scale: pulseAnim }],
                    backgroundColor: isCreator ? colors.CYAN_ACCENT : colors.ACCEPT_GREEN,
                  },
                ]}
              />
              <Text style={styles.headerStatusText}>
                {isCreator ? 'Host Control' : 'Waiting in Lobby'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.headerRightActions}>
          <TouchableOpacity
            style={styles.headerSquareBtn}
            onPress={handleShareRoom}
            activeOpacity={0.8}
          >
            <MaterialIcons name="share" size={20} color={colors.PRIMARY_COLOR} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── SCROLLABLE LOUNGE CONTENT ───────────────────────────── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: safeBottomPadding + 180 },
        ]}
      >
        {/* ── CINEMATIC HERO CARD (Spacious & Clean) ─────────────── */}
        <View style={styles.heroCard}>
          <WaitingHeroPreview
            streamUrl={roomData?.streamUrl || routeStreamUrl}
            thumbnail={roomData?.thumbnail || routeThumbnail}
          >
            {/* Top Floating Badges */}
            <View style={styles.heroTopBadges}>
              <View style={styles.liveLoungeBadge}>
                <Animated.View
                  style={[
                    styles.liveIndicatorDot,
                    { transform: [{ scale: pulseAnim }] },
                  ]}
                />
                <Text style={styles.liveLoungeText}>LIVE LOUNGE</Text>
              </View>

              <View
                style={[
                  styles.roomTierBadge,
                  isPrivate ? styles.roomTierPrivate : styles.roomTierPublic,
                ]}
              >
                <MaterialIcons
                  name={isPrivate ? 'lock' : 'public'}
                  size={12}
                  color={isPrivate ? colors.FILM_GOLD : colors.CYAN_ACCENT}
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={[
                    styles.roomTierText,
                    { color: isPrivate ? colors.FILM_GOLD : colors.CYAN_ACCENT },
                  ]}
                >
                  {isPrivate ? 'VIP PRIVATE' : 'OPEN THEATER'}
                </Text>
              </View>
            </View>

            {/* Bottom Floating Corner Pill */}
            <View style={styles.heroBottomRow}>
              <View style={styles.syncStatusPill}>
                <MaterialIcons name="sync" size={12} color={colors.ACCEPT_GREEN} style={{ marginRight: 4 }} />
                <Text style={styles.syncStatusText}>Live Synced</Text>
              </View>
            </View>
          </WaitingHeroPreview>

          {/* Details Section Below Poster (Uncluttered) */}
          <View style={styles.heroDetails}>
            <Text style={styles.heroMovieTitle} numberOfLines={2}>
              {displayName}
            </Text>

            <View style={styles.heroMetaRow}>
              {roomData?.genre ? (
                <View style={styles.genreBadge}>
                  <MaterialIcons
                    name="movie-filter"
                    size={13}
                    color={colors.FILM_GOLD}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.genreBadgeText}>{roomData.genre}</Text>
                </View>
              ) : null}

              <View style={styles.syncMetaPill}>
                <MaterialIcons
                  name="check-circle"
                  size={13}
                  color={colors.CYAN_ACCENT}
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.syncMetaText}>Ready to Screen</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── SCREENING PASS & INVITE CARD (Replaces fake hardware) ── */}
        <View style={styles.passCard}>
          <View style={styles.passCardHeader}>
            <View style={styles.passHeaderTitleWrap}>
              <MaterialIcons
                name="confirmation-number"
                size={18}
                color={colors.FILM_GOLD}
                style={{ marginRight: 8 }}
              />
              <Text style={styles.passHeaderTitle}>Screening Access & Passes</Text>
            </View>
            <View style={styles.passSecurityBadge}>
              <MaterialIcons name="verified-user" size={12} color={colors.ACCEPT_GREEN} style={{ marginRight: 4 }} />
              <Text style={styles.passSecurityText}>Secure Buffer</Text>
            </View>
          </View>

          {/* Pass Details Grid */}
          <View style={styles.passGrid}>
            {/* Room Code Tile */}
            <View style={styles.passTile}>
              <Text style={styles.passTileLabel}>ROOM CODE</Text>
              <View style={styles.passTileContentRow}>
                <Text style={styles.passTileValue}>#{cleanRoomCode}</Text>
                <TouchableOpacity
                  style={[styles.tileCopyBtn, copiedCode && styles.tileCopyBtnActive]}
                  onPress={handleCopyCode}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={copiedCode ? 'checkmark-circle' : 'copy-outline'}
                    size={16}
                    color={copiedCode ? colors.ACCEPT_GREEN : colors.CYAN_ACCENT}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* PIN Code Tile (If Private) */}
            {isPrivate && roomPin ? (
              <View style={styles.passTile}>
                <Text style={styles.passTileLabel}>ACCESS PIN</Text>
                <View style={styles.passTileContentRow}>
                  <Text style={[styles.passTileValue, styles.pinValueText]}>{roomPin}</Text>
                  <TouchableOpacity
                    style={[styles.tileCopyBtn, copiedPin && styles.tileCopyBtnActive]}
                    onPress={handleCopyPin}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={copiedPin ? 'checkmark-circle' : 'copy-outline'}
                      size={16}
                      color={copiedPin ? colors.ACCEPT_GREEN : colors.FILM_GOLD}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.passTile}>
                <Text style={styles.passTileLabel}>ROOM POLICY</Text>
                <View style={styles.passTileContentRow}>
                  <Text style={[styles.passTileValue, { color: colors.ACCEPT_GREEN }]}>
                    Open Access
                  </Text>
                  <MaterialIcons name="lock-open" size={16} color={colors.ACCEPT_GREEN} />
                </View>
              </View>
            )}
          </View>

          {/* Quick Share / Invite Action */}
          <TouchableOpacity
            style={styles.inviteShareAction}
            onPress={handleShareRoom}
            activeOpacity={0.8}
          >
            <View style={styles.inviteActionLeft}>
              <View style={styles.inviteIconSquircle}>
                <MaterialIcons name="person-add-alt-1" size={18} color={colors.PRIMARY_COLOR} />
              </View>
              <View>
                <Text style={styles.inviteActionTitle}>Invite Friends to Lounge</Text>
                <Text style={styles.inviteActionSub}>Share room code & instant access link</Text>
              </View>
            </View>
            <MaterialIcons name="arrow-forward-ios" size={14} color={colors.SUB_TITLE_COLOR} />
          </TouchableOpacity>
        </View>

        {/* ── PARTICIPANTS READY SECTION ────────────────────────── */}
        <View style={styles.participantsSection}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>Participants Ready</Text>
              <View style={styles.countPill}>
                <Text style={styles.countPillText}>
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
                { width: `${Math.max(progressPercent, 6)}%` },
              ]}
            />
          </View>

          {/* Participants List */}
          <View style={styles.participantList}>
            {participants.map((p) => {
              const isMuted = userMicMuted[p.uid] ?? false;
              const canModerate = isCreator && !p.isHost;

              return (
                <TouchableOpacity
                  key={p.id || p.uid || p.email}
                  style={styles.participantCard}
                  onPress={() => handleParticipantPress(p)}
                  activeOpacity={canModerate ? 0.75 : 1}
                >
                  <View style={styles.participantLeft}>
                    <View style={styles.avatarWrap}>
                      <LinearGradient
                        colors={[p.color, colors.PURPLE_ACCENT]}
                        style={styles.avatarSquircle}
                      >
                        <Text style={styles.avatarInitialText}>{p.initial}</Text>
                      </LinearGradient>
                      <View
                        style={[
                          styles.avatarStatusPip,
                          { backgroundColor: p.isOnline ? colors.ACCEPT_GREEN : colors.MUTED_COLOR },
                        ]}
                      />
                    </View>

                    <View style={styles.participantMeta}>
                      <View style={styles.nameRow}>
                        <Text style={styles.participantName} numberOfLines={1}>
                          {p.name}
                        </Text>
                        {p.isHost && (
                          <View style={styles.hostCrownBadge}>
                            <MaterialIcons
                              name="workspace-premium"
                              size={12}
                              color={colors.FILM_GOLD}
                              style={{ marginRight: 2 }}
                            />
                            <Text style={styles.hostCrownText}>HOST</Text>
                          </View>
                        )}
                        {canModerate && (
                          <View style={styles.manageDotBadge}>
                            <MaterialIcons name="more-vert" size={14} color={colors.SUB_TITLE_COLOR} />
                          </View>
                        )}
                      </View>

                      <View style={styles.participantSubRow}>
                        <View
                          style={[
                            styles.userStatusPill,
                            {
                              backgroundColor: p.isOnline
                                ? colors.ACCEPT_GREEN_GLOW
                                : colors.FILM_GOLD_GLOW,
                            },
                          ]}
                        >
                          <MaterialIcons
                            name={p.isOnline ? 'check-circle' : 'hourglass-top'}
                            size={11}
                            color={p.isOnline ? colors.ACCEPT_GREEN : colors.FILM_GOLD}
                          />
                          <Text
                            style={[
                              styles.userStatusPillText,
                              { color: p.isOnline ? colors.ACCEPT_GREEN : colors.FILM_GOLD },
                            ]}
                          >
                            {p.isOnline ? 'Ready' : 'Connecting'}
                          </Text>
                        </View>
                        <Text style={styles.connectionSyncLabel}>
                          {p.isHost ? 'Host Ready' : p.isOnline ? 'Device Synced' : 'Syncing'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Mic Toggle Button */}
                  <TouchableOpacity
                    style={[styles.micBtn, isMuted && styles.micBtnMuted]}
                    onPress={() => toggleMic(p.uid)}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons
                      name={isMuted ? 'mic-off' : 'mic'}
                      size={18}
                      color={isMuted ? colors.DELETE_RED_COLOR : colors.CYAN_ACCENT}
                    />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Bottom clearance so full content scrolls past the floating dock */}
        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ── STICKY BOTTOM FLOATING CTA DOCK ─────────────────────── */}
      <View style={[styles.bottomStickyDock, { paddingBottom: safeBottomPadding }]}>
        {isCreator ? (
          <TouchableOpacity
            activeOpacity={0.88}
            style={styles.primaryLaunchBtn}
            onPress={handleLaunchScreening}
          >
            <LinearGradient
              colors={[colors.GRADIENT_START, colors.GRADIENT_END]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryLaunchGradient}
            >
              <MaterialIcons name="play-arrow" size={24} color="#FFF" style={{ marginRight: 6 }} />
              <View style={styles.launchBtnTexts}>
                <Text style={styles.primaryLaunchTitle}>Launch Screening for Everyone</Text>
                <Text style={styles.primaryLaunchSub}>Start synchronized 4K stream</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <View style={styles.guestStatusContainer}>
            <View style={styles.guestWaitingPill}>
              <Animated.View
                style={[
                  styles.guestWaitingDot,
                  { transform: [{ scale: pulseAnim }] },
                ]}
              />
              <Text style={styles.guestWaitingText}>
                Waiting for the host to launch stream...
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.guestReadyToggle,
                isGuestReady ? styles.guestReadyActive : styles.guestReadyInactive,
              ]}
              onPress={() => setIsGuestReady(!isGuestReady)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={isGuestReady ? 'checkmark-circle' : 'radio-button-off'}
                size={20}
                color={isGuestReady ? colors.ACCEPT_GREEN : colors.SUB_TITLE_COLOR}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.guestReadyToggleText,
                  { color: isGuestReady ? colors.ACCEPT_GREEN : colors.TITLE_COLOR },
                ]}
              >
                {isGuestReady ? "I'm Ready to Watch" : 'Set Status to Ready'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Exit Lounge Action */}
        <TouchableOpacity
          style={styles.leaveLoungeLink}
          onPress={handleLeaveLounge}
          activeOpacity={0.75}
        >
          <MaterialIcons
            name="logout"
            size={15}
            color={colors.DELETE_RED_COLOR}
            style={{ marginRight: 6 }}
          />
          <Text style={styles.leaveBtnText}>Leave Lounge</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ──────────────────────────────────────────────────────────────
//  Styles (Strict Cine-Sync Theme & Squircle Standards)
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
    height: 380,
  },

  // ── Top Header ────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  headerSquareBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerScreenTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.TITLE_COLOR,
    letterSpacing: 0.2,
  },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  roomCodeBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  roomCodeBadgeText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 10,
    fontWeight: '700',
  },
  headerStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  headerStatusText: {
    color: colors.TEXT_SECONDARY,
    fontSize: 10,
    fontWeight: '700',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // ── Scroll Content ────────────────
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },

  // ── Hero Card ─────────────────────
  heroCard: {
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
  },
  heroBgImage: {
    width: '100%',
    height: 250,
    justifyContent: 'space-between',
  },
  heroBgImageRadius: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  heroGradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: 14,
  },
  heroTopBadges: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  liveLoungeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(8, 8, 16, 0.75)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 200, 83, 0.3)',
    gap: 5,
  },
  liveIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.ACCEPT_GREEN,
  },
  liveLoungeText: {
    color: colors.ACCEPT_GREEN,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  roomTierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  roomTierPrivate: {
    backgroundColor: 'rgba(255, 180, 0, 0.15)',
    borderColor: 'rgba(255, 180, 0, 0.35)',
  },
  roomTierPublic: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderColor: 'rgba(6, 182, 212, 0.35)',
  },
  roomTierText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  heroBottomRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  syncStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(8, 8, 16, 0.75)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  syncStatusText: {
    color: colors.ACCEPT_GREEN,
    fontSize: 10,
    fontWeight: '700',
  },

  heroDetails: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  heroMovieTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
    lineHeight: 23,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  genreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 180, 0, 0.12)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 0, 0.25)',
  },
  genreBadgeText: {
    color: colors.FILM_GOLD,
    fontSize: 11,
    fontWeight: '700',
  },
  syncMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  syncMetaText: {
    color: colors.TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '600',
  },

  // ── Pass & Access Card ────────────
  passCard: {
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 18,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
    gap: 12,
  },
  passCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  passHeaderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passHeaderTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '800',
  },
  passSecurityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 200, 83, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  passSecurityText: {
    color: colors.ACCEPT_GREEN,
    fontSize: 10,
    fontWeight: '700',
  },

  passGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  passTile: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  passTileLabel: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  passTileContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  passTileValue: {
    color: colors.TITLE_COLOR,
    fontSize: 13,
    fontWeight: '800',
  },
  pinValueText: {
    color: colors.FILM_GOLD,
    letterSpacing: 1.5,
  },
  tileCopyBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileCopyBtnActive: {
    backgroundColor: colors.ACCEPT_GREEN_GLOW,
  },

  inviteShareAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.18)',
  },
  inviteActionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inviteIconSquircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.PRIMARY_GLOW,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteActionTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 13,
    fontWeight: '700',
  },
  inviteActionSub: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    marginTop: 2,
  },

  // ── Participants Ready Section ────
  participantsSection: {
    marginTop: 18,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 15,
    fontWeight: '800',
  },
  countPill: {
    backgroundColor: colors.PURPLE_ACCENT,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  countPillText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },
  progressPercentText: {
    color: colors.CYAN_ACCENT,
    fontSize: 12,
    fontWeight: '700',
  },

  progressBarTrack: {
    height: 5,
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
  },
  participantLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarSquircle: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitialText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
  },
  avatarStatusPip: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    borderWidth: 2,
    borderColor: colors.SURFACE_COLOR,
  },

  participantMeta: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  participantName: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '700',
  },
  hostCrownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.FILM_GOLD_GLOW,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 0, 0.3)',
  },
  hostCrownText: {
    color: colors.FILM_GOLD,
    fontSize: 9,
    fontWeight: '800',
  },
  manageDotBadge: {
    paddingHorizontal: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },

  participantSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  userStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  userStatusPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  connectionSyncLabel: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
  },

  micBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micBtnMuted: {
    backgroundColor: colors.DECLINE_RED_GLOW,
  },

  // ── Sticky Bottom Floating CTA Dock ──
  bottomStickyDock: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(8, 8, 16, 0.96)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },

  // Host Launch CTA
  primaryLaunchBtn: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  primaryLaunchGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  launchBtnTexts: {
    alignItems: 'center',
  },
  primaryLaunchTitle: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  primaryLaunchSub: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },

  // Guest Waiting & Ready Controls
  guestStatusContainer: {
    gap: 8,
  },
  guestWaitingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.2)',
    gap: 8,
  },
  guestWaitingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.CYAN_ACCENT,
  },
  guestWaitingText: {
    color: colors.CYAN_ACCENT,
    fontSize: 12,
    fontWeight: '700',
  },
  guestReadyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  guestReadyActive: {
    backgroundColor: colors.ACCEPT_GREEN_GLOW,
    borderColor: 'rgba(0, 200, 83, 0.3)',
  },
  guestReadyInactive: {
    backgroundColor: colors.SURFACE_ELEVATED,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  guestReadyToggleText: {
    fontSize: 13,
    fontWeight: '700',
  },

  // Secondary Bottom Exit Link
  leaveLoungeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginTop: 4,
  },
  leaveBtnText: {
    color: colors.DELETE_RED_COLOR,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

export default WaitingScreen;
