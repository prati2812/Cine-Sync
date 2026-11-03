import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Animated,
  Modal,
  StatusBar,
  StyleSheet,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import LinearGradient from 'react-native-linear-gradient';
import { RTCView } from 'react-native-webrtc';
import colors from '../../theme/Colors';
import { callStyles, videoCallStyles } from './callStyles';

const CALL_REACTIONS = [
  { icon: 'favorite', label: 'Love', value: 'favorite', color: colors.LIVE_RED },
  { icon: 'whatshot', label: 'Fire', value: 'whatshot', color: colors.FILM_GOLD },
  { icon: 'thumb-up', label: 'Like', value: 'thumb-up', color: colors.CYAN_ACCENT },
  { icon: 'local-movies', label: 'Movie', value: 'local-movies', color: colors.PURPLE_ACCENT },
  { icon: 'rocket-launch', label: 'Hype', value: 'rocket-launch', color: colors.PRIMARY_COLOR },
];

const CallOverlayModal = ({
  callState,
  callType,
  callDuration,
  isMuted,
  isSpeaker,
  isCameraOff,
  localStream,
  remoteStream,
  startCall,
  answerCall,
  declineCall,
  endCall,
  toggleMute,
  toggleSpeaker,
  toggleCamera,
  switchCamera,
  formatDuration,
  otherUsername,
  otherAvatar,
  isCallMinimized,
  setIsCallMinimized,
  safeTopPadding,
  insets,
  onTriggerWatchParty,
  onSendReaction,
}) => {
  // Audio call pulse and ring animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ringAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (callState === 'calling' || callState === 'incoming') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        ])
      );
      pulse.start();

      const ring = Animated.loop(
        Animated.sequence([
          Animated.timing(ringAnim, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(ringAnim, { toValue: 0, duration: 1400, useNativeDriver: true }),
        ])
      );
      ring.start();

      return () => {
        pulse.stop();
        ring.stop();
        pulseAnim.setValue(1);
        ringAnim.setValue(0);
      };
    }
  }, [callState, pulseAnim, ringAnim]);

  // Equalizer visualizer bars
  const eqBars = useRef([
    new Animated.Value(6),
    new Animated.Value(14),
    new Animated.Value(8),
    new Animated.Value(20),
    new Animated.Value(10),
    new Animated.Value(16),
    new Animated.Value(7),
    new Animated.Value(18),
  ]).current;

  useEffect(() => {
    if (callState === 'connected') {
      const anims = eqBars.map((bar, i) => {
        const minH = 6 + (i % 3) * 3;
        const maxH = 20 + (i % 4) * 4;
        return Animated.loop(
          Animated.sequence([
            Animated.timing(bar, {
              toValue: maxH,
              duration: 380 + i * 80,
              useNativeDriver: false,
            }),
            Animated.timing(bar, {
              toValue: minH,
              duration: 380 + i * 80,
              useNativeDriver: false,
            }),
          ])
        );
      });
      anims.forEach((a) => a.start());
      return () => {
        anims.forEach((a) => a.stop());
      };
    }
  }, [callState, eqBars]);

  // ── 1. RENDER VIDEO CALL VIEW ──
  const renderVideoCallView = () => {
    const username = otherUsername;

    return (
      <View style={StyleSheet.absoluteFillObject}>
        {/* Fullscreen Remote Video Feed */}
        <View style={StyleSheet.absoluteFillObject}>
          {remoteStream ? (
            <RTCView
              streamURL={remoteStream.toURL()}
              style={videoCallStyles.fullscreenRemoteVideo}
              objectFit="cover"
              zOrder={0}
            />
          ) : (
            <View style={videoCallStyles.fullscreenWaitingWrap}>
              <LinearGradient
                colors={['#0F0F1A', '#080810', '#161625']}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={videoCallStyles.waitingAvatarWrap}>
                {otherAvatar ? (
                  <Image source={{ uri: otherAvatar }} style={videoCallStyles.waitingAvatarImage} />
                ) : (
                  <View style={videoCallStyles.waitingAvatarFallback}>
                    <Text style={videoCallStyles.waitingAvatarText}>
                      {username?.[0]?.toUpperCase() || 'C'}
                    </Text>
                  </View>
                )}
                <View style={videoCallStyles.waitingPulseDot} />
              </View>
              <Text style={videoCallStyles.waitingCallerName}>{username}</Text>
              <Text style={videoCallStyles.waitingCallStatus}>
                {callState === 'calling' ? 'Calling...' : 'Connecting video stream...'}
              </Text>
            </View>
          )}

          {/* Top Vignette Gradient */}
          <LinearGradient
            colors={['rgba(8, 8, 16, 0.92)', 'rgba(8, 8, 16, 0.45)', 'transparent']}
            style={videoCallStyles.topVignette}
            pointerEvents="none"
          />

          {/* Bottom Vignette Gradient */}
          <LinearGradient
            colors={['transparent', 'rgba(8, 8, 16, 0.6)', 'rgba(8, 8, 16, 0.95)']}
            style={videoCallStyles.bottomVignette}
            pointerEvents="none"
          />
        </View>

        {/* ── TOP BAR AREA: MINIMIZE, E2EE, SYNC CTA & TELEMETRY ── */}
        <View style={[videoCallStyles.topHeaderWrap, { paddingTop: safeTopPadding }]}>
          <View style={videoCallStyles.topActionRow}>
            <TouchableOpacity
              style={videoCallStyles.glassRoundBtn}
              onPress={() => setIsCallMinimized(true)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="keyboard-arrow-down" size={26} color="#FFF" />
            </TouchableOpacity>

            <View style={videoCallStyles.topRightActions}>
              <View style={videoCallStyles.e2eeBadge}>
                <MaterialIcons name="lock" size={12} color={colors.ACCEPT_GREEN} />
                <Text style={videoCallStyles.e2eeText}>E2EE</Text>
              </View>

              <TouchableOpacity
                style={videoCallStyles.syncScreeningBtn}
                activeOpacity={0.85}
                onPress={onTriggerWatchParty}
              >
                <LinearGradient
                  colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={videoCallStyles.syncScreeningGradient}
                >
                  <Text style={videoCallStyles.syncScreeningText}>Sync Screening</Text>
                  <MaterialIcons name="local-movies" size={14} color="#FFF" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>

          {/* Caller Profile Card & Telemetry Panel */}
          <View style={videoCallStyles.callerTelemetryCard}>
            <View style={videoCallStyles.callerTopRow}>
              <View style={videoCallStyles.callerNameGroup}>
                <Text style={videoCallStyles.callerNameText} numberOfLines={1}>
                  {username}
                </Text>
                <View style={videoCallStyles.hostMiniBadge}>
                  <Text style={videoCallStyles.hostMiniBadgeText}>HOST</Text>
                </View>
              </View>

              <View style={videoCallStyles.liveTimerPill}>
                <View
                  style={[
                    videoCallStyles.liveTimerRedDot,
                    callState === 'calling' && { backgroundColor: colors.PRIMARY_COLOR },
                  ]}
                />
                <Text style={videoCallStyles.liveTimerDigits}>
                  {callState === 'calling' ? 'Calling...' : formatDuration(callDuration)}
                </Text>
              </View>
            </View>

            <View style={videoCallStyles.telemetryBottomRow}>
              <View style={videoCallStyles.audioSpectrumGroup}>
                <View style={videoCallStyles.miniEqBars}>
                  <Animated.View
                    style={[videoCallStyles.miniEqBar, { height: eqBars[0], backgroundColor: colors.CYAN_ACCENT }]}
                  />
                  <Animated.View
                    style={[videoCallStyles.miniEqBar, { height: eqBars[3], backgroundColor: colors.PRIMARY_COLOR }]}
                  />
                  <Animated.View
                    style={[videoCallStyles.miniEqBar, { height: eqBars[5], backgroundColor: colors.PURPLE_ACCENT }]}
                  />
                </View>
                <Text style={videoCallStyles.connectedStatusText}>
                  {callState === 'calling' ? 'Ringing...' : 'Connected'}
                </Text>
              </View>

              <View style={videoCallStyles.webrtcTelemetry}>
                <Text style={videoCallStyles.telemetrySpecs}>1080p 60fps</Text>
                <Text style={videoCallStyles.telemetryDot}>•</Text>
                <Text style={videoCallStyles.latencyText}>14ms</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── FLOATING LOCAL CAMERA PIP ── */}
        <View style={[videoCallStyles.localPipCard, { top: safeTopPadding + 94 }]}>
          {localStream && !isCameraOff ? (
            <RTCView
              streamURL={localStream.toURL()}
              style={videoCallStyles.localPipVideo}
              objectFit="cover"
              mirror={true}
              zOrder={2}
            />
          ) : (
            <View style={videoCallStyles.cameraOffPlaceholder}>
              <MaterialIcons name="videocam-off" size={24} color={colors.SUB_TITLE_COLOR} />
              <Text style={videoCallStyles.camOffText}>Camera Off</Text>
            </View>
          )}

          <View style={videoCallStyles.youBadge}>
            <View style={videoCallStyles.youDot} />
            <Text style={videoCallStyles.youBadgeText}>You</Text>
          </View>

          {!isMuted && (
            <View style={videoCallStyles.localWavelets}>
              <View style={[videoCallStyles.localWaveBar, { height: 7 }]} />
              <View style={[videoCallStyles.localWaveBar, { height: 11 }]} />
            </View>
          )}

          <TouchableOpacity
            style={videoCallStyles.flipCameraBtn}
            onPress={switchCamera}
            activeOpacity={0.7}
          >
            <MaterialIcons name="flip-camera-ios" size={13} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* ── MID-OVERLAY: WATCH PARTY RIBBON & REACTIONS ── */}
        <View style={videoCallStyles.midOverlayArea}>
          <View style={videoCallStyles.watchPartyRibbon}>
            <LinearGradient
              colors={['rgba(8, 8, 16, 0.92)', 'rgba(21, 18, 46, 0.88)', 'rgba(8, 8, 16, 0.92)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={videoCallStyles.watchPartyRibbonInner}
            >
              <View style={videoCallStyles.ribbonLeft}>
                <View style={videoCallStyles.ribbonPopcornIcon}>
                  <MaterialIcons name="local-movies" size={18} color={colors.PURPLE_ACCENT} />
                </View>
                <View>
                  <View style={videoCallStyles.ribbonTitleRow}>
                    <Text style={videoCallStyles.ribbonTitle}>Sync Screening</Text>
                    <View style={videoCallStyles.fourKBadge}>
                      <Text style={videoCallStyles.fourKBadgeText}>LIVE</Text>
                    </View>
                  </View>
                  <Text style={videoCallStyles.ribbonSubtext}>Co-watch stream in real-time sync</Text>
                </View>
              </View>

              <TouchableOpacity
                style={videoCallStyles.ribbonStartBtn}
                activeOpacity={0.85}
                onPress={onTriggerWatchParty}
              >
                <Text style={videoCallStyles.ribbonStartBtnText}>Invite</Text>
                <MaterialIcons name="arrow-forward" size={12} color="#FFF" />
              </TouchableOpacity>
            </LinearGradient>
          </View>

          {/* Quick Floating Reactions Bar */}
          <View style={videoCallStyles.reactionsRow}>
            <View style={videoCallStyles.reactionsPill}>
              {CALL_REACTIONS.map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={videoCallStyles.reactionMiniBtn}
                  onPress={() => onSendReaction && onSendReaction(item.value)}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name={item.icon} size={18} color={item.color} />
                </TouchableOpacity>
              ))}
              <View style={videoCallStyles.reactionDivider} />
              <TouchableOpacity
                style={videoCallStyles.reactionPlusBtn}
                onPress={() => onSendReaction && onSendReaction('auto-awesome')}
                activeOpacity={0.7}
              >
                <MaterialIcons name="auto-awesome" size={14} color="#FFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── BOTTOM ACTION CONTROL ISLAND ── */}
        <View style={[videoCallStyles.bottomControlsWrap, { paddingBottom: Math.max(insets.bottom, 16) + 6 }]}>
          <View style={videoCallStyles.glassIslandDock}>
            <TouchableOpacity
              style={videoCallStyles.islandActionBtn}
              onPress={toggleMute}
              activeOpacity={0.75}
            >
              <View style={[videoCallStyles.islandCircleBtn, isMuted && videoCallStyles.islandCircleActiveRed]}>
                <MaterialIcons
                  name={isMuted ? 'mic-off' : 'mic'}
                  size={20}
                  color={isMuted ? colors.LIVE_RED : '#F1F5F9'}
                />
              </View>
              <Text style={[videoCallStyles.islandLabel, isMuted && { color: colors.LIVE_RED }]}>
                Mic
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={videoCallStyles.islandActionBtn}
              onPress={toggleCamera}
              activeOpacity={0.75}
            >
              <View style={[videoCallStyles.islandCircleBtn, isCameraOff && videoCallStyles.islandCircleActiveRed]}>
                <MaterialIcons
                  name={isCameraOff ? 'videocam-off' : 'videocam'}
                  size={20}
                  color={isCameraOff ? colors.LIVE_RED : '#F1F5F9'}
                />
              </View>
              <Text style={[videoCallStyles.islandLabel, isCameraOff && { color: colors.LIVE_RED }]}>
                Camera
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={videoCallStyles.islandActionBtn}
              onPress={toggleSpeaker}
              activeOpacity={0.75}
            >
              <View style={[videoCallStyles.islandCircleBtn, isSpeaker && videoCallStyles.islandCircleActiveBlue]}>
                <MaterialIcons
                  name={isSpeaker ? 'volume-up' : 'volume-down'}
                  size={20}
                  color={isSpeaker ? colors.CYAN_ACCENT : '#F1F5F9'}
                />
              </View>
              <Text style={[videoCallStyles.islandLabel, isSpeaker && { color: colors.CYAN_ACCENT }]}>
                Speaker
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={videoCallStyles.islandActionBtn}
              onPress={onTriggerWatchParty}
              activeOpacity={0.75}
            >
              <View style={[videoCallStyles.islandCircleBtn, videoCallStyles.islandCircleActivePurple]}>
                <MaterialIcons name="movie" size={20} color="#D8B4FE" />
              </View>
              <Text style={[videoCallStyles.islandLabel, { color: '#D8B4FE' }]}>Sync</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={videoCallStyles.islandActionBtn}
              onPress={() => endCall('ended')}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[colors.DELETE_RED_COLOR, '#DC2626']}
                style={videoCallStyles.islandLeaveBtn}
              >
                <MaterialIcons
                  name="call-end"
                  size={22}
                  color="#FFF"
                  style={{ transform: [{ rotate: '135deg' }] }}
                />
              </LinearGradient>
              <Text style={[videoCallStyles.islandLabel, { color: '#F87171', fontWeight: '700' }]}>
                Leave
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  // ── 2. RENDER AUDIO CALL VIEW ──
  const renderAudioCallView = () => {
    const username = otherUsername;
    const avatarUri = otherAvatar || null;
    const isVideo = callType === 'video';

    return (
      <View style={StyleSheet.absoluteFillObject}>
        <View style={callStyles.ambientTopGlow} pointerEvents="none">
          <LinearGradient
            colors={['rgba(124, 58, 237, 0.22)', 'rgba(0, 122, 255, 0.10)', 'transparent']}
            style={StyleSheet.absoluteFillObject}
          />
        </View>

        <View style={[callStyles.topBar, { paddingTop: safeTopPadding }]}>
          <TouchableOpacity
            style={callStyles.minimizeBtn}
            onPress={() => setIsCallMinimized(true)}
            activeOpacity={0.8}
          >
            <MaterialIcons name="keyboard-arrow-down" size={26} color="#CBD5E1" />
          </TouchableOpacity>

          <View style={callStyles.encryptionBadge}>
            <View style={callStyles.encPingWrap}>
              <View style={callStyles.encPingDot} />
            </View>
            <MaterialIcons name="lock" size={12} color={colors.ACCEPT_GREEN} />
            <Text style={callStyles.encryptionText}>End-to-End Encrypted</Text>
          </View>

          <View style={callStyles.hdAudioBadge}>
            <Text style={callStyles.hdBadgeText}>HD AUDIO</Text>
            <View style={callStyles.miniSoundWaves}>
              <View style={[callStyles.miniWaveBar, { height: 7 }]} />
              <View style={[callStyles.miniWaveBar, { height: 12 }]} />
              <View style={[callStyles.miniWaveBar, { height: 5 }]} />
            </View>
          </View>
        </View>

        <View style={callStyles.centerContent}>
          <View style={callStyles.avatarOrbitWrap}>
            <Animated.View
              style={[
                callStyles.pulseRingOuter,
                { transform: [{ scale: pulseAnim }], opacity: ringAnim },
              ]}
            />
            <Animated.View
              style={[
                callStyles.pulseRingInner,
                { transform: [{ scale: pulseAnim }] },
              ]}
            />

            <LinearGradient
              colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT, colors.CYAN_ACCENT]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={callStyles.avatarGradientRing}
            >
              <View style={callStyles.avatarFrameInner}>
                {avatarUri ? (
                  <Image style={callStyles.avatarImageLarge} source={{ uri: avatarUri }} />
                ) : (
                  <LinearGradient
                    colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]}
                    style={[callStyles.avatarImageLarge, { justifyContent: 'center', alignItems: 'center' }]}
                  >
                    <Text style={{ color: '#FFF', fontSize: 36, fontWeight: '800' }}>
                      {username?.charAt(0)?.toUpperCase() || 'U'}
                    </Text>
                  </LinearGradient>
                )}
                <View style={callStyles.headphoneBadge}>
                  <MaterialIcons name="headphones" size={13} color={colors.CYAN_ACCENT} />
                </View>
              </View>
            </LinearGradient>

            <View style={callStyles.statusPill}>
              <View
                style={[
                  callStyles.statusDot,
                  {
                    backgroundColor:
                      callState === 'connected' ? colors.ACCEPT_GREEN : colors.PRIMARY_COLOR,
                  },
                ]}
              />
              <Text style={callStyles.statusPillText}>
                {callState === 'calling'
                  ? 'Ringing...'
                  : callState === 'incoming'
                    ? 'Incoming Call'
                    : 'Connected'}
              </Text>
            </View>
          </View>

          <View style={callStyles.nameSection}>
            <View style={callStyles.nameRow}>
              <Text style={callStyles.callerNameTitle}>{username}</Text>
              <View style={callStyles.hostBadge}>
                <Text style={callStyles.hostBadgeText}>HOST</Text>
              </View>
            </View>
            <Text style={callStyles.callerSubtitle}>
              @{username} • Cine-Sync Room
            </Text>
          </View>

          {callState === 'connected' && (
            <View style={callStyles.equalizerPill}>
              <View style={callStyles.timerRow}>
                <View style={callStyles.timerDot} />
                <Text style={callStyles.timerText}>{formatDuration(callDuration)}</Text>
              </View>
              <View style={callStyles.equalizerDivider} />
              <View style={callStyles.equalizerBarsRow}>
                {eqBars.map((bar, i) => (
                  <Animated.View
                    key={i}
                    style={[
                      callStyles.eqBar,
                      {
                        height: bar,
                        backgroundColor:
                          i % 3 === 0
                            ? colors.CYAN_ACCENT
                            : i % 2 === 0
                              ? colors.PURPLE_ACCENT
                              : colors.PRIMARY_COLOR,
                      },
                    ]}
                  />
                ))}
              </View>
              <View style={callStyles.equalizerDivider} />
              <Text style={callStyles.opusTag}>96kbps Opus</Text>
            </View>
          )}

          <View style={callStyles.syncPartyCard}>
            <LinearGradient
              colors={['rgba(22, 22, 37, 0.88)', 'rgba(15, 15, 26, 0.95)']}
              style={callStyles.syncPartyInner}
            >
              <View style={callStyles.syncPartyLeft}>
                <View style={callStyles.popcornIconWrap}>
                  <MaterialIcons name="local-movies" size={20} color={colors.PURPLE_ACCENT} />
                </View>
                <View>
                  <View style={callStyles.syncTitleRow}>
                    <Text style={callStyles.syncPartyTitle}>Sync Movie Stream</Text>
                    <View style={callStyles.syncLiveDot} />
                  </View>
                  <Text style={callStyles.syncPartySubtitle}>Watch together in 4K sync</Text>
                </View>
              </View>

              <TouchableOpacity
                style={callStyles.syncInviteBtn}
                activeOpacity={0.85}
                onPress={onTriggerWatchParty}
              >
                <LinearGradient
                  colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={callStyles.syncInviteGradient}
                >
                  <Text style={callStyles.syncInviteBtnText}>Invite</Text>
                  <MaterialIcons name="arrow-forward" size={13} color="#FFF" />
                </LinearGradient>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        </View>

        {/* Bottom Call Controls Dock & Quick Actions */}
        <View style={[callStyles.bottomControlsWrap, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          {callState === 'connected' && (
            <View style={callStyles.reactionsShelf}>
              <Text style={callStyles.reactionsLabel}>Quick Send:</Text>
              {CALL_REACTIONS.map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={callStyles.reactionBtn}
                  onPress={() => onSendReaction && onSendReaction(item.value)}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name={item.icon} size={18} color={item.color} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={callStyles.glassDock}>
            {callState === 'incoming' ? (
              <View style={callStyles.incomingActionsRow}>
                <TouchableOpacity
                  style={callStyles.incomingActionBtn}
                  onPress={declineCall}
                  activeOpacity={0.8}
                >
                  <View style={[callStyles.circleActionBtn, callStyles.declineBtn]}>
                    <MaterialIcons name="call-end" size={28} color="#FFF" />
                  </View>
                  <Text style={callStyles.actionText}>Decline</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={callStyles.incomingActionBtn}
                  onPress={answerCall}
                  activeOpacity={0.8}
                >
                  <View style={[callStyles.circleActionBtn, callStyles.acceptBtn]}>
                    <MaterialIcons name={isVideo ? 'videocam' : 'call'} size={28} color="#FFF" />
                  </View>
                  <Text style={[callStyles.actionText, { color: colors.ACCEPT_GREEN }]}>Accept</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={callStyles.dockControlsRow}>
                <TouchableOpacity
                  style={[callStyles.dockBtn, isMuted && callStyles.dockBtnActiveRed]}
                  onPress={toggleMute}
                  activeOpacity={0.75}
                >
                  <MaterialIcons
                    name={isMuted ? 'mic-off' : 'mic'}
                    size={20}
                    color={isMuted ? colors.LIVE_RED : '#E2E8F0'}
                  />
                  <Text style={[callStyles.dockBtnText, isMuted && { color: colors.LIVE_RED }]}>
                    {isMuted ? 'Unmute' : 'Mute'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[callStyles.dockBtn, isSpeaker && callStyles.dockBtnActiveBlue]}
                  onPress={toggleSpeaker}
                  activeOpacity={0.75}
                >
                  <MaterialIcons
                    name={isSpeaker ? 'volume-up' : 'volume-down'}
                    size={20}
                    color={isSpeaker ? colors.CYAN_ACCENT : '#E2E8F0'}
                  />
                  <Text style={[callStyles.dockBtnText, isSpeaker && { color: colors.CYAN_ACCENT }]}>
                    Speaker
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={callStyles.endCallBtnWrap}
                  onPress={() => endCall('ended')}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={[colors.DELETE_RED_COLOR, '#DC2626']}
                    style={callStyles.endCallBtnGradient}
                  >
                    <MaterialIcons
                      name="call-end"
                      size={26}
                      color="#FFF"
                      style={{ transform: [{ rotate: '135deg' }] }}
                    />
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={callStyles.dockBtn}
                  onPress={() => {
                    if (callType === 'audio') {
                      startCall('video');
                    } else {
                      toggleCamera();
                    }
                  }}
                  activeOpacity={0.75}
                >
                  <MaterialIcons
                    name={isCameraOff ? 'videocam-off' : 'videocam'}
                    size={20}
                    color={isCameraOff ? colors.SUB_TITLE_COLOR : '#E2E8F0'}
                  />
                  <Text style={callStyles.dockBtnText}>Video</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={callStyles.dockBtn}
                  onPress={() => setIsCallMinimized(true)}
                  activeOpacity={0.75}
                >
                  <View style={callStyles.chatNotifyDot} />
                  <MaterialIcons name="chat-bubble-outline" size={19} color="#E2E8F0" />
                  <Text style={callStyles.dockBtnText}>Chat</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  const isVisible = callState !== 'idle' && !isCallMinimized;

  return (
    <>
      {/* ── Minimized Call Floating Banner ── */}
      {isCallMinimized && callState !== 'idle' && (
        <TouchableOpacity
          style={[callStyles.minimizedCallBanner, { top: safeTopPadding + 50 }]}
          activeOpacity={0.88}
          onPress={() => setIsCallMinimized(false)}
        >
          <LinearGradient
            colors={['#161625', '#0F0F1A']}
            style={callStyles.minimizedCallGradient}
          >
            <View style={callStyles.minimizedCallLeft}>
              <View
                style={[
                  callStyles.minimizedCallDot,
                  { backgroundColor: callState === 'connected' ? colors.ACCEPT_GREEN : colors.PRIMARY_COLOR },
                ]}
              />
              <Text style={callStyles.minimizedCallTitle} numberOfLines={1}>
                {otherUsername} • {callState === 'calling' ? 'Ringing...' : formatDuration(callDuration)}
              </Text>
            </View>
            <View style={callStyles.minimizedCallActions}>
              <TouchableOpacity
                style={callStyles.minimizedCallEndBtn}
                onPress={() => endCall('ended')}
              >
                <MaterialIcons name="call-end" size={16} color="#FFF" />
              </TouchableOpacity>
              <MaterialIcons name="fullscreen" size={20} color={colors.CYAN_ACCENT} />
            </View>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* ── Fullscreen Call Modal ── */}
      <Modal
        visible={isVisible}
        animationType="slide"
        transparent={false}
        statusBarTranslucent
        onRequestClose={() => {
          if (callState === 'connected' || callState === 'calling') {
            setIsCallMinimized(true);
          } else {
            endCall('ended');
          }
        }}
      >
        <StatusBar barStyle="light-content" backgroundColor="#080810" translucent />
        <View style={callStyles.callModalContainer}>
          {callType === 'video' ? renderVideoCallView() : renderAudioCallView()}
        </View>
      </Modal>
    </>
  );
};

export default React.memo(CallOverlayModal);

