import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ImageBackground,
  StyleSheet,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import colors from '../../theme/Colors';
import { database } from '../../config/firebase';
import { getYouTubeThumbnailDetails } from '../../functions';
import { showCineAlert } from '../CineAlert';

/**
 * Watch Party Invite Tile Component (Faded Card UI like FriendsScreen & HomeScreen)
 */
const WatchPartyInviteTile = ({
  item,
  chatId,
  isMyMessage,
  otherUsername,
  navigation,
  handleMessageLongPress,
  dateSeparator,
  isHighlighted,
}) => {
  const cleanThumbUrl = (uri) => {
    if (!uri || typeof uri !== 'string') return uri;
    if (uri.includes('/hqdefault.jpg')) {
      return uri.replace('/hqdefault.jpg', '/maxresdefault.jpg');
    }
    return uri;
  };

  const getCandidateThumbnail = () => {
    if (item.thumbnail && typeof item.thumbnail === 'string' && item.thumbnail.startsWith('http')) {
      return cleanThumbUrl(item.thumbnail);
    }
    const effectiveStream = item.streamUrl;
    if (effectiveStream) {
      const details = getYouTubeThumbnailDetails(effectiveStream);
      if (details) {
        return details.maxresUrl || details.mqUrl || details.fallbackUrl || null;
      }
    }
    return null;
  };

  const [thumbUri, setThumbUri] = useState(getCandidateThumbnail);
  const [streamUrl, setStreamUrl] = useState(item.streamUrl || '');
  const [roomName, setRoomName] = useState(item.roomName || 'Watch Party');
  const [scheduledDate, setScheduledDate] = useState(
    item.scheduledDate || item.scheduledAt || null
  );
  const [inviteStatus, setInviteStatus] = useState(item.inviteStatus || 'pending');
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const currentThumb =
      (item.thumbnail && typeof item.thumbnail === 'string' && item.thumbnail.startsWith('http'))
        ? cleanThumbUrl(item.thumbnail)
        : null;
    const currentDetails = getYouTubeThumbnailDetails(item.streamUrl);
    const resolvedUrl = currentThumb || currentDetails?.maxresUrl || currentDetails?.mqUrl || currentDetails?.fallbackUrl || null;

    if (resolvedUrl) {
      setThumbUri(resolvedUrl);
      setHasError(false);
    }
    if (item.inviteStatus && item.inviteStatus !== inviteStatus) {
      setInviteStatus(item.inviteStatus);
    }

    if (item.roomId) {
      // Query RTDB to lookup live room metadata and streamUrl/thumbnail/scheduledDate
      database()
        .ref(`rooms/${item.roomId}`)
        .once('value')
        .then(snapshot => {
          if (!isMounted) return;
          const r = snapshot.val();
          if (r) {
            if (r.name && !item.roomName) setRoomName(r.name);
            if (r.streamUrl && !item.streamUrl) setStreamUrl(r.streamUrl);
            if (r.scheduledDate || r.scheduledAt) {
              setScheduledDate(r.scheduledDate || r.scheduledAt);
            }
            if (r.thumbnail && typeof r.thumbnail === 'string' && r.thumbnail.startsWith('http')) {
              setThumbUri(cleanThumbUrl(r.thumbnail));
              setHasError(false);
            } else if (r.streamUrl) {
              const details = getYouTubeThumbnailDetails(r.streamUrl);
              if (details) {
                setThumbUri(details.maxresUrl || details.mqUrl || details.fallbackUrl || null);
                setHasError(false);
              }
            }
          }
        })
        .catch(() => { });
    }

    return () => {
      isMounted = false;
    };
  }, [item.thumbnail, item.streamUrl, item.roomId, item.inviteStatus, item.roomName, inviteStatus]);

  const handleImageError = () => {
    const effectiveStream = streamUrl || item.streamUrl;
    if (effectiveStream) {
      const details = getYouTubeThumbnailDetails(effectiveStream);
      if (details?.mqUrl && thumbUri !== details.mqUrl) {
        setThumbUri(details.mqUrl);
        return;
      }
      if (details?.fallbackUrl && thumbUri !== details.fallbackUrl) {
        setThumbUri(details.fallbackUrl);
        return;
      }
    }
    if (typeof thumbUri === 'string' && thumbUri.includes('maxresdefault.jpg')) {
      setThumbUri(thumbUri.replace('maxresdefault.jpg', 'mqdefault.jpg'));
      return;
    }
    setHasError(true);
  };

  const showImage = !!thumbUri && !hasError;

  const isFuture = (() => {
    if (!scheduledDate) return false;
    const t = new Date(scheduledDate).getTime();
    return !isNaN(t) && t > Date.now();
  })();

  const formatScheduledTime = (dateVal) => {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    return (
      d.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }) +
      ' • ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
  };

  // Receiver Action (Accept & Join or RSVP)
  const handleReceiverAction = async () => {
    if (!item.roomId) {
      navigation.navigate('HomeScreen');
      return;
    }

    // Persist accepted status to RTDB
    if (chatId && item.id && inviteStatus !== 'accepted') {
      setInviteStatus('accepted');
      try {
        await database().ref(`chats/${chatId}/messages/${item.id}`).update({
          inviteStatus: 'accepted',
          acceptedAt: database.ServerValue.TIMESTAMP,
        });
      } catch (e) {
        console.warn('Could not update inviteStatus:', e);
      }
    }

    if (isFuture) {
      showCineAlert({
        type: 'success',
        title: 'Watch Party RSVP’d',
        message: `You accepted ${otherUsername}'s invitation for "${roomName || 'Watch Party'}" scheduled for ${formatScheduledTime(scheduledDate)}. You will be notified when the room goes live!`,
        confirmText: 'Enter Lobby Now',
        cancelText: 'Done',
        onConfirm: () => {
          navigation.navigate('WaitingScreen', {
            roomId: item.roomId,
            roomName: roomName || item.roomName || 'Watch Party',
            streamUrl: streamUrl || item.streamUrl || '',
            scheduledDate: scheduledDate || '',
          });
        },
      });
    } else {
      navigation.navigate('WaitingScreen', {
        roomId: item.roomId,
        roomName: roomName || item.roomName || 'Watch Party',
        streamUrl: streamUrl || item.streamUrl || '',
      });
    }
  };

  // Sender Action (Host Access to Room)
  const handleSenderAction = () => {
    if (item.roomId) {
      navigation.navigate('WaitingScreen', {
        roomId: item.roomId,
        roomName: roomName || item.roomName || 'Watch Party',
        streamUrl: streamUrl || item.streamUrl || '',
        isHost: true,
        scheduledDate: scheduledDate || '',
      });
    } else {
      navigation.navigate('HomeScreen');
    }
  };

  const cardContent = (
    <LinearGradient
      colors={
        showImage
          ? [
            'rgba(8, 8, 16, 0.04)',
            'rgba(8, 8, 16, 0.35)',
            'rgba(8, 8, 16, 0.78)',
            'rgba(15, 15, 26, 0.95)',
            colors.SURFACE_COLOR,
          ]
          : ['#1E1B4B', colors.SURFACE_COLOR]
      }
      locations={showImage ? [0, 0.22, 0.46, 0.72, 0.96] : undefined}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.inviteCardFadeGradient}
    >
      {/* Top Header Badge Row */}
      <View style={styles.inviteTopBadgeRow}>
        {isFuture ? (
          <View style={styles.scheduledBadge}>
            <MaterialIcons name="event" size={11} color={colors.FILM_GOLD} />
            <Text style={styles.scheduledBadgeText}>SCHEDULED</Text>
          </View>
        ) : item?.isStreaming ? (
          <View style={styles.liveSyncBadge}>
            <View
              style={[
                styles.livePingDot,
                { backgroundColor: colors.LIVE_RED },
              ]}
            />
            <Text style={styles.liveSyncText}>LIVE SYNC</Text>
          </View>
        ) : null}

        {showImage ? (
          <View style={isFuture ? styles.scheduledHdrTag : styles.hdrTag}>
            <Text style={isFuture ? styles.scheduledHdrText : styles.hdrText}>
              {isFuture ? 'VIP RSVP' : 'SYNC'}
            </Text>
          </View>
        ) : (
          <View style={styles.carouselFallbackIconWrap}>
            <Ionicons name="film" size={18} color={colors.CYAN_ACCENT} />
          </View>
        )}
      </View>

      {/* Direct Content Area directly on bottom gradient overlay (No Inner Card) */}
      <View style={styles.inviteDirectContent}>
        <View style={styles.inviteMetaRow}>
          <Text style={[styles.inviteCategory, isFuture && { color: colors.FILM_GOLD }]}>
            {isMyMessage ? 'OUTGOING INVITATION' : 'INCOMING INVITATION'}
          </Text>
          {item.roomId ? (
            <Text style={styles.inviteRoomCode}>
              #{String(item.roomId).substring(0, 8)}
            </Text>
          ) : null}
        </View>

        <View style={styles.inviteMovieRow}>
          <MaterialIcons
            name="movie"
            size={14}
            color={colors.PRIMARY_COLOR}
            style={styles.inviteMovieIcon}
          />
          <Text style={styles.inviteMovieTitle} numberOfLines={1}>
            {roomName || item.roomName || 'Watch Party'}
          </Text>
        </View>

        <Text style={styles.inviteSubtext} numberOfLines={1}>
          {isMyMessage
            ? `You invited @${otherUsername}`
            : `@${otherUsername} invited you to watch together`}
        </Text>

        {/* Scheduled Date Indicator */}
        {scheduledDate ? (
          <View style={styles.scheduledPill}>
            <MaterialIcons name="schedule" size={12} color={colors.FILM_GOLD} />
            <Text style={styles.scheduledPillText}>{formatScheduledTime(scheduledDate)}</Text>
          </View>
        ) : null}

        {/* Action Area: SENDER vs RECEIVER */}
        {isMyMessage ? (
          // ── SENDER VIEW: Cannot "Accept" their own invite ──
          <View style={styles.senderActionContainer}>
            <View style={styles.senderStatusRow}>
              <MaterialIcons
                name={inviteStatus === 'accepted' ? 'check-circle' : 'send'}
                size={12}
                color={inviteStatus === 'accepted' ? colors.ACCEPT_GREEN : colors.CYAN_ACCENT}
              />
              <Text
                style={[
                  styles.senderStatusText,
                  inviteStatus === 'accepted' && { color: colors.ACCEPT_GREEN, fontWeight: '700' },
                ]}
              >
                {inviteStatus === 'accepted'
                  ? `@${otherUsername} accepted!`
                  : 'Invitation Sent • Awaiting reply'}
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.joinPartyCtaBtn}
              onPress={handleSenderAction}
            >
              <LinearGradient
                colors={[colors.SURFACE_ELEVATED, colors.SURFACE_COLOR]}
                style={[
                  styles.joinPartyGradient,
                  { borderWidth: 1, borderColor: colors.INPUTBOX_BORDER_COLOR },
                ]}
              >
                <MaterialIcons name="meeting-room" size={15} color={colors.CYAN_ACCENT} />
                <Text style={[styles.joinPartyText, { color: colors.TITLE_COLOR }]}>
                  {isFuture ? 'Open Scheduled Room' : 'Enter Watch Room'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          // ── RECEIVER VIEW: Can Accept & Join, or RSVP for future ──
          <View style={styles.receiverActionContainer}>
            {inviteStatus === 'accepted' && (
              <View style={styles.receiverAcceptedRow}>
                <MaterialIcons name="check-circle" size={12} color={colors.ACCEPT_GREEN} />
                <Text style={styles.receiverAcceptedText}>You accepted this invite</Text>
              </View>
            )}

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.joinPartyCtaBtn}
              onPress={handleReceiverAction}
            >
              <LinearGradient
                colors={
                  inviteStatus === 'accepted'
                    ? [colors.ACCEPT_GREEN, '#059669']
                    : [colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.joinPartyGradient}
              >
                <MaterialIcons
                  name={
                    inviteStatus === 'accepted'
                      ? 'play-arrow'
                      : isFuture
                        ? 'event-available'
                        : 'bolt'
                  }
                  size={15}
                  color="#FFF"
                />
                <Text style={styles.joinPartyText}>
                  {inviteStatus === 'accepted'
                    ? isFuture
                      ? 'View Room Lobby'
                      : 'Join Room Now'
                    : isFuture
                      ? 'Accept & RSVP'
                      : 'Accept & Join Party'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* Footer Inside: Timestamp & Status ticks */}
        <View style={styles.messageFooterInside}>
          <Text style={styles.timestampInside}>
            {new Date(item.timestamp || Date.now()).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
          {isMyMessage && (
            <View style={styles.seenReceiptRow}>
              <MaterialIcons
                name={item.seen || item.status === 'seen' ? 'done-all' : 'done'}
                size={13}
                color={item.seen || item.status === 'seen' ? colors.CYAN_ACCENT : 'rgba(255, 255, 255, 0.6)'}
                style={{ marginLeft: 4 }}
              />
            </View>
          )}
        </View>
      </View>
    </LinearGradient>
  );

  return (
    <View style={styles.messageOuterWrap}>
      {dateSeparator}
      <TouchableOpacity
        activeOpacity={0.92}
        onLongPress={() => handleMessageLongPress && handleMessageLongPress(item)}
        style={[
          styles.inviteCardTile,
          isMyMessage ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' },
          isHighlighted && styles.highlightedMessageBubble,
        ]}
      >
        {showImage ? (
          <ImageBackground
            source={{ uri: thumbUri }}
            style={styles.inviteFadedCardBg}
            imageStyle={styles.inviteFadedCardImage}
            resizeMode="cover"
            onError={handleImageError}
          >
            {cardContent}
          </ImageBackground>
        ) : (
          <View style={styles.inviteFadedCardBg}>
            {cardContent}
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  messageOuterWrap: {
    marginVertical: 4,
  },
  inviteCardTile: {
    width: 280,
    minHeight: 280,
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
    overflow: 'hidden',
    marginVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  highlightedMessageBubble: {
    borderWidth: 1.5,
    borderColor: colors.CYAN_ACCENT,
    shadowColor: colors.CYAN_ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 8,
  },
  inviteFadedCardBg: {
    width: '100%',
    minHeight: 280,
    backgroundColor: colors.SURFACE_COLOR,
  },
  inviteFadedCardImage: {
    borderRadius: 18,
  },
  inviteCardFadeGradient: {
    flex: 1,
    minHeight: 280,
    justifyContent: 'space-between',
    paddingTop: 12,
  },
  inviteTopBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    width: '100%',
  },
  carouselFallbackIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  liveSyncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(8, 8, 16, 0.82)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    gap: 4,
  },
  livePingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.ACCEPT_GREEN,
  },
  liveSyncText: {
    color: colors.TITLE_COLOR,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  hdrTag: {
    backgroundColor: 'rgba(0, 122, 255, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.4)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  hdrText: {
    color: colors.PRIMARY_COLOR,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  scheduledHdrTag: {
    backgroundColor: 'rgba(255, 180, 0, 0.20)',
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 0, 0.45)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  scheduledHdrText: {
    color: colors.FILM_GOLD,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  scheduledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 180, 0, 0.20)',
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 0, 0.45)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  scheduledBadgeText: {
    color: colors.FILM_GOLD,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  inviteDirectContent: {
    gap: 4,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  inviteMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inviteCategory: {
    color: colors.CYAN_ACCENT,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  inviteRoomCode: {
    color: colors.MUTED_COLOR,
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: 0.5,
  },
  inviteMovieRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  inviteMovieIcon: {
    marginRight: 2,
  },
  inviteMovieTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  inviteSubtext: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '500',
  },
  scheduledPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 180, 0, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 0, 0.35)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
    gap: 5,
    marginTop: 2,
    marginBottom: 2,
  },
  scheduledPillText: {
    color: colors.FILM_GOLD,
    fontSize: 11,
    fontWeight: '700',
  },
  senderActionContainer: {
    marginTop: 4,
  },
  senderStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  senderStatusText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '600',
  },
  receiverActionContainer: {
    marginTop: 2,
  },
  receiverAcceptedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  receiverAcceptedText: {
    color: colors.ACCEPT_GREEN,
    fontSize: 11,
    fontWeight: '700',
  },
  joinPartyCtaBtn: {
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 4,
  },
  joinPartyGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 6,
  },
  joinPartyText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  messageFooterInside: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: 4,
  },
  timestampInside: {
    color: colors.MUTED_COLOR,
    fontSize: 10,
  },
  seenReceiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export default React.memo(WatchPartyInviteTile);

