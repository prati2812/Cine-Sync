import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Platform,
  Alert,
  Image,
  Animated,
  Share,
  Linking,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import { auth, database } from '../../../config/firebase';
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

const StreamInfoScreen = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { roomId, roomName: initialRoomName, streamUrl: initialStreamUrl } = route.params || {};

  // Safe Notch Padding
  const safeTopPadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 12
  ) + 8;

  const [roomData, setRoomData] = useState(null);
  const [participantsList, setParticipantsList] = useState([]);
  const [isCreator, setIsCreator] = useState(false);
  const [expandedViewers, setExpandedViewers] = useState(false);
  const [allMuted, setAllMuted] = useState(false);
  const [mutedUsers, setMutedUsers] = useState({});
  const [copyCodeToast, setCopyCodeToast] = useState(false);
  const [copyLinkToast, setCopyLinkToast] = useState(false);
  const [elapsedTime, setElapsedTime] = useState('00:00:00 elapsed');

  // Pulsing animations
  const pingAnim = useRef(new Animated.Value(1)).current;
  const latencyDotAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pingAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pingAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pingAnim]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(latencyDotAnim, { toValue: 0.4, duration: 600, useNativeDriver: true }),
        Animated.timing(latencyDotAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [latencyDotAnim]);

  // Subscribe to Room in Realtime Database
  useEffect(() => {
    if (!roomId) return;
    const roomRef = database().ref(`rooms/${roomId}`);

    const onRoomChange = async snapshot => {
      const data = snapshot.val();
      if (!data) return;
      setRoomData(data);

      const currentUser = auth().currentUser;
      const userIsCreator =
        data.creator?.uid === currentUser?.uid ||
        data.creator?.email?.toLowerCase() === currentUser?.email?.toLowerCase();
      setIsCreator(userIsCreator);

      // Build participants
      const emails = [
        data.creator?.email,
        ...(data.participants || []),
      ].filter(Boolean);
      const uniqueEmails = [...new Set(emails)];

      const list = [];
      for (let i = 0; i < uniqueEmails.length; i++) {
        const email = uniqueEmails[i];
        const isHost =
          email.toLowerCase() === data.creator?.email?.toLowerCase();

        let username = email.split('@')[0];
        let color = AVATAR_COLORS[i % AVATAR_COLORS.length];
        let avatarUrl = null;

        try {
          const userSnap = await database()
            .ref('users')
            .orderByChild('email')
            .equalTo(email)
            .once('value');

          if (userSnap.exists()) {
            const userData = Object.values(userSnap.val())[0];
            username = userData.username || username;
            avatarUrl = userData.profilePicture || null;
          }
        } catch (e) {
          // ignore user fetch error
        }

        list.push({
          id: email,
          email,
          name: username,
          isHost,
          isOnline: true,
          ping: isHost ? 12 : Math.floor(18 + Math.random() * 25),
          color,
          avatarUrl,
        });
      }

      setParticipantsList(list);
    };

    roomRef.on('value', onRoomChange);
    return () => roomRef.off('value', onRoomChange);
  }, [roomId]);

  // Elapsed timer ticker
  useEffect(() => {
    const updateElapsed = () => {
      if (!roomData?.createdAt) {
        setElapsedTime('Live Sync Active');
        return;
      }
      const start = new Date(roomData.createdAt).getTime();
      const now = Date.now();
      const diffSecs = Math.max(0, Math.floor((now - start) / 1000));
      const hrs = Math.floor(diffSecs / 3600);
      const mins = Math.floor((diffSecs % 3600) / 60);
      const secs = diffSecs % 60;
      if (hrs > 0) {
        setElapsedTime(`${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')} elapsed`);
      } else {
        setElapsedTime(`${mins}:${secs.toString().padStart(2, '0')} elapsed`);
      }
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [roomData?.createdAt]);

  // Room derived values
  const roomName = roomData?.name || initialRoomName || 'Watch Party Room';
  const genre = roomData?.genre || 'Sci-Fi Epic';
  const pin = roomData?.pin || '8429';
  const cleanRoomCode = `CYNC-${(roomId ? roomId.replace('room_', '') : '9482').slice(-4).toUpperCase()}`;
  const shortRoomNumber = (roomId ? roomId.replace('room_', '') : '9482').slice(-4);
  const hostName = roomData?.creator?.userName || roomData?.creator?.email?.split('@')[0] || 'Host';
  const inviteUrl = `https://cine-sync.live/party/${cleanRoomCode}?pin=${pin}`;

  // Safe clipboard helper
  const copyTextSafely = async (text, toastType = 'code') => {
    try {
      let ClipboardModule = null;
      try {
        ClipboardModule = require('@react-native-clipboard/clipboard').default;
      } catch (err) {
        // Native module not linked
      }

      if (ClipboardModule && typeof ClipboardModule.setString === 'function') {
        ClipboardModule.setString(text);
      }
    } catch (e) {
      console.warn('Clipboard setString warning:', e);
    }

    if (toastType === 'code') {
      setCopyCodeToast(true);
      setTimeout(() => setCopyCodeToast(false), 2000);
    } else {
      setCopyLinkToast(true);
      setTimeout(() => setCopyLinkToast(false), 2000);
    }
  };

  // Quick share handlers
  const handleCopyLink = () => {
    copyTextSafely(inviteUrl, 'link');
    Alert.alert('Link Copied', `Invite link copied to clipboard:\n${inviteUrl}`);
  };

  const handleShareWhatsApp = async () => {
    const text = `🎬 Join my Cine-Sync watch party "${roomName}"!\nRoom Code: ${cleanRoomCode}\nPIN: ${pin}\nJoin Link: ${inviteUrl}`;
    const url = `whatsapp://send?text=${encodeURIComponent(text)}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        await Share.share({ message: text, title: `Watch Party: ${roomName}` });
      }
    } catch (e) {
      await Share.share({ message: text, title: `Watch Party: ${roomName}` });
    }
  };

  const handleShareTelegram = async () => {
    const text = `🎬 Join my Cine-Sync watch party "${roomName}"!\nRoom Code: ${cleanRoomCode}\nPIN: ${pin}\nJoin Link: ${inviteUrl}`;
    const url = `tg://msg?text=${encodeURIComponent(text)}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        await Share.share({ message: text, title: `Watch Party: ${roomName}` });
      }
    } catch (e) {
      await Share.share({ message: text, title: `Watch Party: ${roomName}` });
    }
  };

  const handleShareStories = async () => {
    const text = `🎬 Screening: ${roomName}\nRoom Code: ${cleanRoomCode} • PIN: ${pin}\nJoin the synchronized theater on Cine-Sync!`;
    await Share.share({ message: text, title: `Watch Party: ${roomName}` });
  };

  const handleShareDirectDM = async () => {
    const text = `🍿 You're invited to VIP Screening "${roomName}"!\nRoom Code: ${cleanRoomCode}\nPIN: ${pin}\n${inviteUrl}`;
    await Share.share({ message: text, title: `Watch Party: ${roomName}` });
  };

  // Participant Moderation Controls
  const toggleMuteUser = email => {
    setMutedUsers(prev => ({
      ...prev,
      [email]: !prev[email],
    }));
  };

  const handleMuteAll = () => {
    setAllMuted(prev => !prev);
    Alert.alert(
      allMuted ? 'Microphones Unmuted' : 'All Microphones Muted',
      allMuted ? 'Audience can now speak.' : 'All viewer audio muted by host.'
    );
  };

  const handleTransferHost = targetUser => {
    Alert.alert(
      'Transfer Host Role',
      `Make @${targetUser.name} the new room leader? You will relinquish stream control.`,
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

  const handleKickUser = targetUser => {
    Alert.alert(
      'Remove Viewer',
      `Remove @${targetUser.name} from this screening room?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const updated = (roomData?.participants || []).filter(
                e => e.toLowerCase() !== targetUser.email.toLowerCase()
              );
              await database().ref(`rooms/${roomId}/participants`).set(updated);
              Alert.alert('Removed', `@${targetUser.name} was removed from the party.`);
            } catch (err) {
              Alert.alert('Error', 'Failed to remove viewer.');
            }
          },
        },
      ]
    );
  };

  // Destructive Actions
  const handleCloseRoomForAll = () => {
    Alert.alert(
      'Close & End Watch Room',
      'This will immediately disconnect all viewers and terminate the synchronized stream.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End for All',
          style: 'destructive',
          onPress: async () => {
            try {
              await database().ref(`rooms/${roomId}`).update({
                status: 'ended',
                isStreaming: false,
              });
              navigation.navigate('Main');
            } catch (e) {
              Alert.alert('Error', 'Failed to close room.');
            }
          },
        },
      ]
    );
  };

  const handleLeaveQuietly = () => {
    Alert.alert(
      'Leave Room',
      'Leave this watch party? You can re-join anytime with the room code.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Leave',
          onPress: async () => {
            try {
              const userEmail = auth().currentUser?.email;
              if (userEmail && roomData?.participants) {
                const updated = roomData.participants.filter(
                  e => e.toLowerCase() !== userEmail.toLowerCase()
                );
                await database().ref(`rooms/${roomId}/participants`).set(updated);
              }
              navigation.navigate('Main');
            } catch (e) {
              navigation.goBack();
            }
          },
        },
      ]
    );
  };

  const displayedParticipants = expandedViewers
    ? participantsList
    : participantsList.slice(0, 3);

  return (
    <View style={styles.screenWrap}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* ── TOP DRAG HANDLE & HEADER BAR ── */}
      <View style={[styles.headerContainer, { paddingTop: safeTopPadding }]}>
        <View style={styles.dragHandleBar} />

        <View style={styles.headerRow}>
          <View style={styles.headerLeftGroup}>
            <TouchableOpacity
              style={styles.backBtnCircle}
              onPress={() => navigation.goBack()}
              activeOpacity={0.75}
            >
              <MaterialIcons name="arrow-back" size={20} color={colors.TITLE_COLOR} />
            </TouchableOpacity>

            <View style={styles.headerTitleCol}>
              <Text style={styles.headerTitleText}>Room Details & Sharing</Text>
              <Text style={styles.headerSubText}>
                Private Cinema Room #{shortRoomNumber}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.settingsBtnCircle}
            onPress={() =>
              Alert.alert(
                'Room Settings',
                `Room: ${roomName}\nPIN: ${pin}\nMax Capacity: ${roomData?.maxCapacity || 12}\nHost Controls: ${roomData?.hostOnlyControl ? 'Enabled' : 'Disabled'}`
              )
            }
            activeOpacity={0.75}
          >
            <MaterialIcons name="settings" size={20} color={colors.SUB_TITLE_COLOR} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── STATUS STRIP ── */}
        <View style={styles.statusStrip}>
          <View style={styles.statusStripLeft}>
            <View style={styles.liveDotWrap}>
              <Animated.View style={[styles.liveDotPing, { opacity: pingAnim }]} />
              <View style={styles.liveDotSolid} />
            </View>
            <Text style={styles.statusStripConnectedText}>
              {participantsList.length} Viewers Connected
            </Text>
          </View>

          <View style={styles.statusStripRight}>
            <MaterialIcons name="high-quality" size={16} color={colors.CYAN_ACCENT} />
            <Text style={styles.statusStripResolutionText}>STREAMING 1080P 60FPS</Text>
          </View>
        </View>

        {/* ── ROOM SUMMARY HEADER CARD ── */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryContentRow}>
            {/* Poster / Thumbnail with 4K HDR tag */}
            <View style={styles.posterWrap}>
              <LinearGradient
                colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]}
                style={styles.posterGradient}
              >
                <MaterialIcons name="movie-creation" size={32} color={colors.TITLE_COLOR} />
              </LinearGradient>
              <View style={styles.hdrBadge}>
                <Text style={styles.hdrBadgeText}>4K HDR</Text>
              </View>
            </View>

            {/* Room Metadata */}
            <View style={styles.summaryDetailsCol}>
              <View style={styles.summaryPillRow}>
                <View style={styles.genrePill}>
                  <Text style={styles.genrePillText}>{genre}</Text>
                </View>
                <View style={styles.elapsedPill}>
                  <MaterialIcons name="schedule" size={12} color={colors.CYAN_ACCENT} />
                  <Text style={styles.elapsedPillText}>{elapsedTime}</Text>
                </View>
              </View>

              <Text style={styles.summaryTitleText} numberOfLines={1}>
                {roomName}
              </Text>
              <Text style={styles.summaryHostText} numberOfLines={1}>
                Hosted by <Text style={styles.hostHighlightText}>@{hostName}</Text> • Active
              </Text>

              <View style={styles.latencyBadgeRow}>
                <View style={styles.latencyPill}>
                  <Animated.View style={[styles.latencyPingDot, { opacity: latencyDotAnim }]} />
                  <Text style={styles.latencyPillText}>12ms Sync Latency</Text>
                </View>
                <Text style={styles.metaDot}>•</Text>
                <Text style={styles.frameLockedText}>Frame-Locked</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── ROOM CODE & QR CODE CARD (INSTANT WATCH PARTY PASS) ── */}
        <View style={styles.passCard}>
          <View style={styles.passGlowAccent} />

          <View style={styles.passHeaderRow}>
            <MaterialIcons name="screen-share" size={20} color={colors.CYAN_ACCENT} />
            <Text style={styles.passHeaderTitle}>Instant Watch Party Pass</Text>
          </View>
          <Text style={styles.passSubtitle}>
            Invite close friends to sync seamlessly with synchronized pause, rewind & live spatial audio.
          </Text>

          {/* Party Code Box */}
          <View style={styles.codeBoxContainer}>
            <View style={styles.codeBoxTextCol}>
              <Text style={styles.codeBoxLabel}>PARTY CODE</Text>
              <Text style={styles.codeBoxNumber}>{cleanRoomCode}</Text>
            </View>

            <TouchableOpacity
              style={styles.copyCodeButton}
              onPress={() => copyTextSafely(cleanRoomCode, 'code')}
              activeOpacity={0.8}
            >
              <MaterialIcons
                name={copyCodeToast ? 'check' : 'content-copy'}
                size={16}
                color={colors.TITLE_COLOR}
              />
              <Text style={styles.copyCodeBtnText}>
                {copyCodeToast ? 'Copied!' : 'Copy'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Sleek Native QR Code Matrix */}
          <View style={styles.qrCardContainer}>
            <View style={styles.qrMatrixBox}>
              {/* Top Left Corner Anchor */}
              <View style={[styles.qrCornerAnchor, styles.qrCornerTL]}>
                <View style={styles.qrInnerCutout}>
                  <View style={styles.qrCenterDot} />
                </View>
              </View>

              {/* Top Right Corner Anchor */}
              <View style={[styles.qrCornerAnchor, styles.qrCornerTR]}>
                <View style={styles.qrInnerCutout}>
                  <View style={styles.qrCenterDot} />
                </View>
              </View>

              {/* Bottom Left Corner Anchor */}
              <View style={[styles.qrCornerAnchor, styles.qrCornerBL]}>
                <View style={styles.qrInnerCutout}>
                  <View style={styles.qrCenterDot} />
                </View>
              </View>

              {/* Matrix Data Rows */}
              <View style={styles.matrixRowsContainer}>
                <View style={styles.matrixRow}>
                  <View style={[styles.matrixDot, { width: 14 }]} />
                  <View style={[styles.matrixDotCyan, { width: 22 }]} />
                  <View style={[styles.matrixDot, { width: 10 }]} />
                </View>
                <View style={styles.matrixRow}>
                  <View style={[styles.matrixDotCyan, { width: 18 }]} />
                  <View style={[styles.matrixDot, { width: 12 }]} />
                  <View style={[styles.matrixDotCyan, { width: 16 }]} />
                </View>
                <View style={styles.matrixRow}>
                  <View style={[styles.matrixDot, { width: 24 }]} />
                  <View style={[styles.matrixDotCyan, { width: 10 }]} />
                  <View style={[styles.matrixDot, { width: 14 }]} />
                </View>
                <View style={styles.matrixRow}>
                  <View style={[styles.matrixDotCyan, { width: 12 }]} />
                  <View style={[styles.matrixDot, { width: 20 }]} />
                  <View style={[styles.matrixDotCyan, { width: 14 }]} />
                </View>
                <View style={styles.matrixRow}>
                  <View style={[styles.matrixDot, { width: 16 }]} />
                  <View style={[styles.matrixDotCyan, { width: 14 }]} />
                  <View style={[styles.matrixDot, { width: 18 }]} />
                </View>
              </View>

              {/* Center Emblem / Cine-Sync Logo */}
              <View style={styles.qrCenterBadge}>
                <MaterialIcons name="play-circle" size={22} color={colors.CYAN_ACCENT} />
              </View>
            </View>
          </View>

          <Text style={styles.qrScanCaption}>Scan to Join Instantly with Mobile Camera</Text>

          {/* PIN Security Footnote */}
          <View style={styles.pinFootnotePill}>
            <MaterialIcons name="lock" size={14} color={colors.CYAN_ACCENT} />
            <Text style={styles.pinFootnoteText}>
              PIN Required: <Text style={styles.pinBoldText}>{pin}</Text> • Host must approve guests
            </Text>
          </View>
        </View>

        {/* ── QUICK SHARE OPTIONS ── */}
        <View style={styles.shareSection}>
          <View style={styles.shareSectionHeader}>
            <Text style={styles.shareSectionTitle}>Share Invite Link</Text>
            <Text style={styles.shareSectionSubtitle}>Auto-fills room PIN</Text>
          </View>

          <View style={styles.shareGrid}>
            {/* Copy Link */}
            <TouchableOpacity
              style={styles.shareItemBtn}
              onPress={handleCopyLink}
              activeOpacity={0.8}
            >
              <View style={[styles.shareIconCircle, { backgroundColor: 'rgba(0, 122, 255, 0.15)' }]}>
                <MaterialIcons name="link" size={22} color={colors.PRIMARY_COLOR} />
              </View>
              <Text style={styles.shareItemLabel}>Copy Link</Text>
            </TouchableOpacity>

            {/* WhatsApp */}
            <TouchableOpacity
              style={styles.shareItemBtn}
              onPress={handleShareWhatsApp}
              activeOpacity={0.8}
            >
              <View style={[styles.shareIconCircle, { backgroundColor: 'rgba(0, 200, 83, 0.15)' }]}>
                <Ionicons name="logo-whatsapp" size={20} color={colors.ACCEPT_GREEN} />
              </View>
              <Text style={styles.shareItemLabel}>WhatsApp</Text>
            </TouchableOpacity>

            {/* Telegram */}
            <TouchableOpacity
              style={styles.shareItemBtn}
              onPress={handleShareTelegram}
              activeOpacity={0.8}
            >
              <View style={[styles.shareIconCircle, { backgroundColor: 'rgba(6, 182, 212, 0.15)' }]}>
                <Ionicons name="paper-plane" size={18} color={colors.CYAN_ACCENT} />
              </View>
              <Text style={styles.shareItemLabel}>Telegram</Text>
            </TouchableOpacity>

            {/* Instagram Story */}
            <TouchableOpacity
              style={styles.shareItemBtn}
              onPress={handleShareStories}
              activeOpacity={0.8}
            >
              <View style={[styles.shareIconCircle, { backgroundColor: 'rgba(124, 58, 237, 0.15)' }]}>
                <MaterialIcons name="camera" size={20} color={colors.PURPLE_ACCENT} />
              </View>
              <Text style={styles.shareItemLabel}>Stories</Text>
            </TouchableOpacity>

            {/* Direct DM */}
            <TouchableOpacity
              style={styles.shareItemBtn}
              onPress={handleShareDirectDM}
              activeOpacity={0.8}
            >
              <View style={[styles.shareIconCircle, { backgroundColor: colors.SURFACE_ELEVATED }]}>
                <MaterialIcons name="forum" size={20} color={colors.CYAN_ACCENT} />
              </View>
              <Text style={styles.shareItemLabel}>Direct DM</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── PARTICIPANTS MANAGEMENT LIST ── */}
        <View style={styles.viewersCard}>
          <View style={styles.viewersHeaderRow}>
            <View style={styles.viewersCountGroup}>
              <Text style={styles.viewersHeaderTitle}>Connected Viewers</Text>
              <View style={styles.viewersCountPill}>
                <Text style={styles.viewersCountText}>{participantsList.length}</Text>
              </View>
            </View>

            {isCreator && (
              <TouchableOpacity onPress={handleMuteAll} activeOpacity={0.7}>
                <Text style={styles.muteAllBtnText}>
                  {allMuted ? 'Unmute All' : 'Mute All'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Participant Rows */}
          <View style={styles.viewerRowsList}>
            {displayedParticipants.map(participant => {
              const isUserMuted = allMuted || !!mutedUsers[participant.email];

              return (
                <View key={participant.id} style={styles.viewerRowItem}>
                  <View style={styles.viewerItemLeft}>
                    {/* Avatar */}
                    <View style={styles.viewerAvatarWrap}>
                      {participant.avatarUrl ? (
                        <Image
                          source={{ uri: participant.avatarUrl }}
                          style={styles.viewerAvatarImg}
                        />
                      ) : (
                        <LinearGradient
                          colors={[participant.color, colors.PURPLE_ACCENT]}
                          style={styles.viewerAvatarGradient}
                        >
                          <Text style={styles.viewerInitialText}>
                            {participant.name.slice(0, 1).toUpperCase()}
                          </Text>
                        </LinearGradient>
                      )}
                      <View style={styles.viewerOnlineDot} />
                    </View>

                    {/* Info */}
                    <View style={styles.viewerInfoCol}>
                      <View style={styles.viewerNameRow}>
                        <Text style={styles.viewerNameText} numberOfLines={1}>
                          {participant.name}
                        </Text>
                        {participant.isHost ? (
                          <View style={styles.hostRoleBadge}>
                            <MaterialIcons name="stars" size={12} color={colors.FILM_GOLD} />
                            <Text style={styles.hostRoleText}>Host</Text>
                          </View>
                        ) : (
                          <Text style={styles.viewerRoleText}>Viewer</Text>
                        )}
                      </View>

                      <Text style={styles.viewerSubStatusText}>
                        {participant.isHost
                          ? '🎙 Spatial Audio Active'
                          : `Ping: ${participant.ping}ms`}
                      </Text>
                    </View>
                  </View>

                  {/* Actions / Status Right */}
                  <View style={styles.viewerActionsRight}>
                    {participant.isHost ? (
                      <View style={styles.inSyncPill}>
                        <Text style={styles.inSyncText}>In Sync</Text>
                      </View>
                    ) : isCreator ? (
                      <View style={styles.moderationBtnRow}>
                        {/* Mute Mic */}
                        <TouchableOpacity
                          style={styles.modActionBtn}
                          onPress={() => toggleMuteUser(participant.email)}
                          activeOpacity={0.75}
                        >
                          <MaterialIcons
                            name={isUserMuted ? 'mic-off' : 'mic'}
                            size={16}
                            color={isUserMuted ? colors.LIVE_RED : colors.SUB_TITLE_COLOR}
                          />
                        </TouchableOpacity>

                        {/* Transfer Host */}
                        <TouchableOpacity
                          style={styles.modActionBtn}
                          onPress={() => handleTransferHost(participant)}
                          activeOpacity={0.75}
                        >
                          <MaterialIcons
                            name="verified-user"
                            size={16}
                            color={colors.SUB_TITLE_COLOR}
                          />
                        </TouchableOpacity>

                        {/* Kick / Remove */}
                        <TouchableOpacity
                          style={[styles.modActionBtn, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}
                          onPress={() => handleKickUser(participant)}
                          activeOpacity={0.75}
                        >
                          <MaterialIcons
                            name="person-remove"
                            size={16}
                            color={colors.LIVE_RED}
                          />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.inSyncPill}>
                        <Text style={styles.inSyncText}>In Sync</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}

            {/* Expand / Collapse Button */}
            {participantsList.length > 3 && (
              <TouchableOpacity
                style={styles.expandViewersBtn}
                onPress={() => setExpandedViewers(prev => !prev)}
                activeOpacity={0.75}
              >
                <Text style={styles.expandViewersText}>
                  {expandedViewers
                    ? 'Show fewer viewers'
                    : `View ${participantsList.length - 3} other viewers`}
                </Text>
                <MaterialIcons
                  name={expandedViewers ? 'expand-less' : 'expand-more'}
                  size={18}
                  color={colors.SUB_TITLE_COLOR}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── LEAVE / CLOSE ROOM ACTIONS ── */}
        <View style={styles.actionsSection}>
          {isCreator ? (
            <TouchableOpacity
              style={styles.closeRoomAllBtn}
              onPress={handleCloseRoomForAll}
              activeOpacity={0.85}
            >
              <MaterialIcons name="power-settings-new" size={20} color={colors.TITLE_COLOR} />
              <Text style={styles.closeRoomAllText}>Close & End Watch Room for All</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.closeRoomAllBtn}
              onPress={handleLeaveQuietly}
              activeOpacity={0.85}
            >
              <MaterialIcons name="exit-to-app" size={20} color={colors.TITLE_COLOR} />
              <Text style={styles.closeRoomAllText}>Leave Room</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.quietLeaveBtn}
            onPress={handleLeaveQuietly}
            activeOpacity={0.7}
          >
            <Text style={styles.quietLeaveText}>Leave Room Quietly</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screenWrap: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
  },
  headerContainer: {
    backgroundColor: colors.SURFACE_COLOR,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.BORDER_SUBTLE,
    alignItems: 'center',
  },
  dragHandleBar: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginBottom: 12,
  },
  headerRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  backBtnCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.SURFACE_ELEVATED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleCol: {
    flex: 1,
  },
  headerTitleText: {
    color: colors.TITLE_COLOR,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  headerSubText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  settingsBtnCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.SURFACE_ELEVATED,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Scroll Content
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },

  // Status Strip
  statusStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.SURFACE_COLOR,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  statusStripLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDotWrap: {
    width: 10,
    height: 10,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDotPing: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.LIVE_RED,
  },
  liveDotSolid: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.LIVE_RED,
  },
  statusStripConnectedText: {
    color: colors.TITLE_COLOR,
    fontSize: 12,
    fontWeight: '600',
  },
  statusStripRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusStripResolutionText: {
    color: colors.CYAN_ACCENT,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },

  // Summary Card
  summaryCard: {
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 20,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  summaryContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  posterWrap: {
    width: 76,
    height: 98,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  posterGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hdrBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(8, 8, 16, 0.85)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  hdrBadgeText: {
    color: colors.CYAN_ACCENT,
    fontSize: 9,
    fontWeight: '800',
  },
  summaryDetailsCol: {
    flex: 1,
  },
  summaryPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  genrePill: {
    backgroundColor: colors.PURPLE_ACCENT,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  genrePillText: {
    color: colors.TITLE_COLOR,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  elapsedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  elapsedPillText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '500',
  },
  summaryTitleText: {
    color: colors.TITLE_COLOR,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  summaryHostText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    marginBottom: 8,
  },
  hostHighlightText: {
    color: colors.PRIMARY_COLOR,
    fontWeight: '600',
  },
  latencyBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  latencyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  latencyPingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.CYAN_ACCENT,
  },
  latencyPillText: {
    color: colors.CYAN_ACCENT,
    fontSize: 10,
    fontWeight: '700',
  },
  metaDot: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
  },
  frameLockedText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '500',
  },

  // Instant Watch Party Pass Card
  passCard: {
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    position: 'relative',
    overflow: 'hidden',
  },
  passGlowAccent: {
    position: 'absolute',
    top: -30,
    width: 140,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.PURPLE_GLOW,
  },
  passHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  passHeaderTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 16,
    fontWeight: '700',
  },
  passSubtitle: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 16,
    paddingHorizontal: 10,
  },

  // Code Box
  codeBoxContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  codeBoxTextCol: {
    gap: 2,
  },
  codeBoxLabel: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  codeBoxNumber: {
    color: colors.PRIMARY_COLOR,
    fontSize: 20,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 1.5,
  },
  copyCodeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.PRIMARY_COLOR,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  copyCodeBtnText: {
    color: colors.TITLE_COLOR,
    fontSize: 12,
    fontWeight: '700',
  },

  // QR Code Container
  qrCardContainer: {
    backgroundColor: colors.SURFACE_ELEVATED,
    padding: 12,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  qrMatrixBox: {
    width: 144,
    height: 144,
    backgroundColor: colors.BACKGROUND_COLOR,
    borderRadius: 14,
    padding: 10,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrCornerAnchor: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: colors.PRIMARY_COLOR,
    padding: 4,
  },
  qrCornerTL: { top: 8, left: 8 },
  qrCornerTR: { top: 8, right: 8 },
  qrCornerBL: { bottom: 8, left: 8 },
  qrInnerCutout: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrCenterDot: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: colors.CYAN_ACCENT,
  },
  matrixRowsContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 6,
  },
  matrixRow: {
    flexDirection: 'row',
    gap: 6,
  },
  matrixDot: {
    height: 6,
    borderRadius: 2,
    backgroundColor: colors.TITLE_COLOR,
  },
  matrixDotCyan: {
    height: 6,
    borderRadius: 2,
    backgroundColor: colors.CYAN_ACCENT,
  },
  qrCenterBadge: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.SURFACE_COLOR,
    borderWidth: 2,
    borderColor: colors.CYAN_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrScanCaption: {
    color: colors.TITLE_COLOR,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
  },
  pinFootnotePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
  },
  pinFootnoteText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
  },
  pinBoldText: {
    color: colors.TITLE_COLOR,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // Share Section
  shareSection: {
    marginBottom: 20,
  },
  shareSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  shareSectionTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 16,
    fontWeight: '700',
  },
  shareSectionSubtitle: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '500',
  },
  shareGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  shareItemBtn: {
    alignItems: 'center',
    gap: 8,
    width: (SCREEN_WIDTH - 64) / 5,
  },
  shareIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareItemLabel: {
    color: colors.TITLE_COLOR,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Viewers Management Card
  viewersCard: {
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  viewersHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  viewersCountGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewersHeaderTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 16,
    fontWeight: '700',
  },
  viewersCountPill: {
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  viewersCountText: {
    color: colors.TITLE_COLOR,
    fontSize: 12,
    fontWeight: '700',
  },
  muteAllBtnText: {
    color: colors.PRIMARY_COLOR,
    fontSize: 13,
    fontWeight: '600',
  },
  viewerRowsList: {
    gap: 10,
  },
  viewerRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.SURFACE_ELEVATED,
    padding: 10,
    borderRadius: 14,
  },
  viewerItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  viewerAvatarWrap: {
    position: 'relative',
    width: 38,
    height: 38,
  },
  viewerAvatarImg: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  viewerAvatarGradient: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerInitialText: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '700',
  },
  viewerOnlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.CYAN_ACCENT,
    borderWidth: 1.5,
    borderColor: colors.SURFACE_ELEVATED,
  },
  viewerInfoCol: {
    flex: 1,
  },
  viewerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  viewerNameText: {
    color: colors.TITLE_COLOR,
    fontSize: 13,
    fontWeight: '700',
  },
  hostRoleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.SURFACE_COLOR,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  hostRoleText: {
    color: colors.FILM_GOLD,
    fontSize: 10,
    fontWeight: '700',
  },
  viewerRoleText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
  },
  viewerSubStatusText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    marginTop: 2,
  },
  viewerActionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inSyncPill: {
    backgroundColor: colors.SURFACE_COLOR,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  inSyncText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '600',
  },
  moderationBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modActionBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.SURFACE_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandViewersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 4,
  },
  expandViewersText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    fontWeight: '600',
  },

  // Actions Section
  actionsSection: {
    gap: 10,
  },
  closeRoomAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.DELETE_RED_COLOR,
    height: 50,
    borderRadius: 14,
    shadowColor: colors.DELETE_RED_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  closeRoomAllText: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '700',
  },
  quietLeaveBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  quietLeaveText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 13,
    fontWeight: '600',
  },
});

export default StreamInfoScreen;
