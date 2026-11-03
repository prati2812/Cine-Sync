import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
  TouchableOpacity,
  FlatList,
  StatusBar,
  Image,
  ImageBackground,
  Animated,
  Platform,
  PermissionsAndroid,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Modal,
  Dimensions,
  Alert,
  Linking,
  ScrollView,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import { auth, database } from '../../../config/firebase';
import { useAudioCall } from '../../../webRTC/useAudioCall';
import { RTCView } from 'react-native-webrtc';
import colors from '../../../theme/Colors';
import { uploadMediaBlob, resolveMediaUri, deleteMediaBlob } from '../../../functions/mediaService';
import { showCineAlert } from '../../../components/CineAlert';
import { getYouTubeThumbnailDetails } from '../../../functions';
import LinkPreviewCard, { extractFirstUrl } from '../../../components/LinkPreviewCard';
import ChatLockBottomSheet from '../../../components/ChatLockBottomSheet';
import ChatImageViewerModal from '../../../components/ChatImageViewerModal';
import { captureRef } from 'react-native-view-shot';
import {
  isChatLockedForUser,
  lockChatForUser,
  unlockChatForUser,
  hasChatLockPasscode,
  isSessionUnlocked,
  markSessionUnlocked,
} from '../../../functions/chatLockService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const isSameDay = (d1, d2) => {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
};

const getDateLabel = (date) => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(date, today)) {
    return 'Today';
  } else if (isSameDay(date, yesterday)) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
};

/**
 * Lightweight, zero-lag animated 3-dot typing indicator using useNativeDriver: true
 */
const AnimatedTypingDots = () => {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createAnim = (anim, delay) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: -5,
            duration: 280,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 280,
            useNativeDriver: true,
          }),
          Animated.delay(Math.max(0, 560 - delay)),
        ])
      );
    };

    const a1 = createAnim(dot1, 0);
    const a2 = createAnim(dot2, 140);
    const a3 = createAnim(dot3, 280);

    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.typingDotsRow}>
      <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot1 }] }]} />
      <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot2 }] }]} />
      <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot3 }] }]} />
    </View>
  );
};

/**
 * QuotedMessageReply Component
 * Displays the quoted message inside a bubble, with squircle image thumbnail
 * if the quoted message contains an image, and scrolls to that message on tap.
 */
const QuotedMessageReply = ({
  replyTo,
  isMyMessage,
  onScrollToMessage,
  allMessages = [],
  currentUserId,
  fallbackUsername,
}) => {
  const [thumbUri, setThumbUri] = useState(replyTo?.imageUri || null);

  useEffect(() => {
    let isMounted = true;
    if (!replyTo) return;

    // 1. Direct image URI
    if (replyTo.imageUri) {
      setThumbUri(replyTo.imageUri);
      return;
    }

    // 2. Direct mediaId
    if (replyTo.mediaId) {
      resolveMediaUri(replyTo.mediaId)
        .then((resolved) => {
          if (isMounted && resolved) {
            setThumbUri(resolved);
          }
        })
        .catch((e) => console.warn('Quoted reply mediaId resolve error:', e));
      return;
    }

    // 3. Fallback: find original message from allMessages array in memory
    const originalMsg = allMessages?.find((m) => m.id === replyTo.id);
    if (originalMsg) {
      if (originalMsg.imageUri) {
        setThumbUri(originalMsg.imageUri);
      } else if (originalMsg.mediaId) {
        resolveMediaUri(originalMsg.mediaId)
          .then((resolved) => {
            if (isMounted && resolved) {
              setThumbUri(resolved);
            }
          })
          .catch((e) => console.warn('Quoted reply originalMsg resolve error:', e));
      }
    }

    return () => {
      isMounted = false;
    };
  }, [replyTo, allMessages]);

  if (!replyTo) return null;

  const isQuotedImage =
    replyTo.type === 'image' ||
    replyTo.type === 'photo' ||
    Boolean(thumbUri) ||
    Boolean(replyTo.mediaId) ||
    (replyTo.text && replyTo.text.includes('📷'));

  const senderLabel =
    replyTo.senderId === currentUserId
      ? 'You'
      : (replyTo.senderName || fallbackUsername || 'Friend');

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={() => onScrollToMessage && onScrollToMessage(replyTo.id)}
      style={[
        styles.quotedReplyWrap,
        isMyMessage ? styles.myQuotedReplyWrap : styles.theirQuotedReplyWrap,
      ]}
    >
      <View
        style={[
          styles.quotedReplyBar,
          isMyMessage ? styles.myQuotedReplyBar : styles.theirQuotedReplyBar,
        ]}
      />
      <View style={styles.quotedReplyContent}>
        <Text
          style={[styles.quotedReplyUser, isMyMessage && styles.quotedReplyUserMine]}
          numberOfLines={1}
        >
          {senderLabel}
        </Text>
        <Text
          style={[
            styles.quotedReplySnippet,
            isMyMessage && styles.quotedReplySnippetMine,
          ]}
          numberOfLines={1}
        >
          {replyTo.text || (isQuotedImage ? '📷 Photo' : 'Message')}
        </Text>
      </View>
      {thumbUri ? (
        <Image
          source={{ uri: thumbUri }}
          style={styles.quotedReplyThumbnail}
          resizeMode="cover"
        />
      ) : isQuotedImage ? (
        <View style={styles.quotedReplyThumbnailPlaceholder}>
          <MaterialIcons name="image" size={18} color="rgba(255, 255, 255, 0.5)" />
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

/**
 * Lightweight, decoupled image bubble that loads cached Base64 from local disk
 * or fetches from RTDB media_blobs on-demand to keep messages under 1KB.
 */
const ChatImageThumbnail = ({
  item,
  isMyMessage,
  onOpenFullscreen,
  onLongPress,
  onScrollToMessage,
  allMessages,
  currentUserId,
  otherUsername,
  isHighlighted,
}) => {
  const [resolvedUri, setResolvedUri] = useState(item.imageUri || null);
  const [loading, setLoading] = useState(!item.imageUri && Boolean(item.mediaId));
  const [aspectRatio, setAspectRatio] = useState(
    item.width && item.height ? item.width / item.height : 1
  );

  useEffect(() => {
    let isMounted = true;
    if (item.imageUri) {
      setResolvedUri(item.imageUri);
      setLoading(false);
      return;
    }

    if (item.mediaId) {
      setLoading(true);
      resolveMediaUri(item.mediaId, item.imageUri, !isMyMessage)
        .then((uri) => {
          if (isMounted) {
            setResolvedUri(uri);
            setLoading(false);
          }
        })
        .catch(() => {
          if (isMounted) setLoading(false);
        });
    } else {
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [item.mediaId, item.imageUri, isMyMessage]);

  // Dynamically calculate aspect ratio to avoid letterboxing or empty space
  useEffect(() => {
    if (resolvedUri && (!item.width || !item.height)) {
      Image.getSize(
        resolvedUri,
        (w, h) => {
          if (w && h) setAspectRatio(w / h);
        },
        () => { }
      );
    }
  }, [resolvedUri, item.width, item.height]);

  const cardWidth = Math.round(SCREEN_WIDTH * 0.70);
  const clampedRatio = Math.max(0.72, Math.min(aspectRatio || 1, 1.55));
  const dynamicHeight = Math.round(cardWidth / clampedRatio);
  const hasCaption = Boolean(item.caption);

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={() => {
        if (resolvedUri) {
          onOpenFullscreen(resolvedUri, item.caption, item);
        }
      }}
      onLongPress={() => onLongPress && onLongPress(item)}
      style={[
        styles.imageMessageCard,
        isMyMessage ? styles.myImageMessageCard : styles.theirImageMessageCard,
        { width: cardWidth },
        isHighlighted && styles.highlightedMessageBubble,
      ]}
    >
      {/* Quoted reply inside image card if present */}
      {item.replyTo && (
        <View style={styles.imageCardQuotedWrap}>
          <QuotedMessageReply
            replyTo={item.replyTo}
            isMyMessage={isMyMessage}
            onScrollToMessage={onScrollToMessage}
            allMessages={allMessages}
            currentUserId={currentUserId}
            fallbackUsername={otherUsername}
          />
        </View>
      )}

      {loading ? (
        <View style={{ width: cardWidth, height: dynamicHeight, position: 'relative', overflow: 'hidden' }}>
          {item.microThumb ? (
            <Image
              source={{ uri: item.microThumb }}
              style={[
                styles.imageThumbnail,
                {
                  width: cardWidth,
                  height: dynamicHeight,
                  borderBottomLeftRadius: hasCaption ? 0 : (!isMyMessage ? 4 : 15),
                  borderBottomRightRadius: hasCaption ? 0 : (isMyMessage ? 4 : 15),
                },
              ]}
              blurRadius={Platform.OS === 'ios' ? 12 : 2}
              resizeMode="cover"
            />
          ) : (
            <LinearGradient
              colors={['rgba(124, 58, 237, 0.22)', 'rgba(0, 122, 255, 0.15)', colors.SURFACE_ELEVATED]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.imageThumbnail,
                {
                  width: cardWidth,
                  height: dynamicHeight,
                  borderBottomLeftRadius: hasCaption ? 0 : (!isMyMessage ? 4 : 15),
                  borderBottomRightRadius: hasCaption ? 0 : (isMyMessage ? 4 : 15),
                },
              ]}
            />
          )}

          {/* WhatsApp-Style Centered Frosted Progress Circle */}
          <View style={styles.whatsappProgressOverlay}>
            <View style={styles.whatsappProgressCircle}>
              <ActivityIndicator size="small" color="#FFFFFF" />
            </View>
          </View>

          {/* Floating Timestamp */}
          {!hasCaption && (
            <View style={styles.imageFloatingTimestampPill}>
              <Text style={styles.imageFloatingTimestampText}>
                {new Date(item.timestamp || Date.now()).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          )}
        </View>
      ) : resolvedUri ? (
        <View style={{ width: cardWidth, height: dynamicHeight, position: 'relative' }}>
          <Image
            source={{ uri: resolvedUri }}
            style={[
              styles.imageThumbnail,
              {
                width: cardWidth,
                height: dynamicHeight,
                borderBottomLeftRadius: hasCaption ? 0 : (!isMyMessage ? 4 : 15),
                borderBottomRightRadius: hasCaption ? 0 : (isMyMessage ? 4 : 15),
              },
            ]}
            resizeMode="cover"
          />

          {/* When NO caption, render timestamp & status floating inside image (ZERO bottom space) */}
          {!hasCaption && (
            <View style={styles.imageFloatingTimestampPill}>
              <Text style={styles.imageFloatingTimestampText}>
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
                    color={item.seen || item.status === 'seen' ? colors.CYAN_ACCENT : '#FFFFFF'}
                    style={{ marginLeft: 3 }}
                  />
                </View>
              )}
            </View>
          )}
        </View>
      ) : (
        <View style={[styles.imagePlaceholder, { width: cardWidth, height: 140 }]}>
          <MaterialIcons name="broken-image" size={32} color="rgba(255, 255, 255, 0.4)" />
          <Text style={styles.imagePlaceholderText}>Photo unavailable</Text>
        </View>
      )}

      {/* When caption exists, render caption text & timestamp underneath image */}
      {hasCaption && (
        <View style={styles.imageCaptionSection}>
          <Text style={styles.imageCaptionText}>{item.caption}</Text>
          <View style={styles.imageCardFooter}>
            <Text style={styles.imageTimestamp}>
              {new Date(item.timestamp || Date.now()).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
            {isMyMessage && (
              <View style={styles.seenReceiptRow}>
                <MaterialIcons
                  name={item.seen || item.status === 'seen' ? 'done-all' : 'done'}
                  size={14}
                  color={item.seen || item.status === 'seen' ? colors.CYAN_ACCENT : 'rgba(255, 255, 255, 0.7)'}
                  style={{ marginLeft: 4 }}
                />
              </View>
            )}
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
};

/**
 * SwipeableMessageRow Component
 * Smooth swipe-to-reply gesture for any message bubble.
 */
const SwipeableMessageRow = ({ item, isMyMessage, onSwipeReply, children }) => {
  const swipeableRef = useRef(null);

  const renderLeftActions = (progress, dragX) => {
    const scale = dragX.interpolate({
      inputRange: [0, 35, 75],
      outputRange: [0.3, 0.85, 1.15],
      extrapolate: 'clamp',
    });
    const opacity = dragX.interpolate({
      inputRange: [0, 15, 40],
      outputRange: [0, 0.6, 1],
      extrapolate: 'clamp',
    });

    return (
      <View style={styles.swipeReplyActionBox}>
        <Animated.View style={[styles.swipeReplyIconWrap, { opacity, transform: [{ scale }] }]}>
          <MaterialIcons name="reply" size={20} color={colors.CYAN_ACCENT} />
        </Animated.View>
      </View>
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      friction={2}
      leftThreshold={35}
      overshootLeft={false}
      renderLeftActions={renderLeftActions}
      onSwipeableWillOpen={() => {
        if (onSwipeReply) {
          onSwipeReply(item);
        }
        setTimeout(() => {
          swipeableRef.current?.close();
        }, 80);
      }}
    >
      {children}
    </Swipeable>
  );
};

// ──────────────────────────────────────────────────────────────
//  Watch Party Invite Tile Component (Faded Card UI like FriendsScreen & HomeScreen)
// ──────────────────────────────────────────────────────────────
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
  }, [item.thumbnail, item.streamUrl, item.roomId, item.inviteStatus]);

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
        title: 'Watch Party RSVP’d! 🎟️',
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

const ChatScreen = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('');
  const [showAttachments, setShowAttachments] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatId, setChatId] = useState(route.params?.chatId || null);
  const [otherUserStatus, setOtherUserStatus] = useState('offline');
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [showMessageActionModal, setShowMessageActionModal] = useState(false);
  // Photo & Ephemeral View-Once states (Supports Multi-Select & Upload)
  const [selectedPhotos, setSelectedPhotos] = useState([]); // Array of { previewUri, uri, width, height, sourceType }
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [photoCaption, setPhotoCaption] = useState('');
  const [isViewOnce, setIsViewOnce] = useState(false);
  const [showPhotoPreviewModal, setShowPhotoPreviewModal] = useState(false);
  const [imageViewerState, setImageViewerState] = useState({
    visible: false,
    images: [],
    initialIndex: 0,
    isViewOnce: false,
    viewOnceMessage: null,
  });
  const [isSendingPhoto, setIsSendingPhoto] = useState(false);
  const [replyingToMessage, setReplyingToMessage] = useState(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const highlightTimeoutRef = useRef(null);
  const messageInputRef = useRef(null);
  const photoPreviewImageRef = useRef(null);

  // ── Chat List & Inverted Scroll Tracking References ──
  const flatListRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const scrollBottomBtnAnim = useRef(new Animated.Value(0)).current;

  // Inverted messages array: newest messages at index 0 (rendered at bottom of screen)
  const invertedMessages = useMemo(() => {
    return [...messages].reverse();
  }, [messages]);

  const updateScrollBottomVisibility = useCallback((show) => {
    setShowScrollBottomBtn((prev) => {
      if (prev !== show) {
        Animated.timing(scrollBottomBtnAnim, {
          toValue: show ? 1 : 0,
          duration: 180,
          useNativeDriver: true,
        }).start();
        return show;
      }
      return prev;
    });
  }, [scrollBottomBtnAnim]);

  const handleJumpToLatest = useCallback(() => {
    isAtBottomRef.current = true;
    updateScrollBottomVisibility(false);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [updateScrollBottomVisibility]);

  const handleScroll = useCallback((event) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    // In an inverted FlatList, offset 0 is physically at the bottom (latest messages)
    isAtBottomRef.current = offsetY <= 60;

    // Show jump-to-bottom button when scrolled up into history (offsetY > 250)
    if (offsetY > 250 && messages.length > 5) {
      updateScrollBottomVisibility(true);
    } else {
      updateScrollBottomVisibility(false);
    }
  }, [messages.length, updateScrollBottomVisibility]);

  // ── Keyboard Visibility & Height Handling (Android & iOS) ──
  const keyboardHeightAnim = useRef(new Animated.Value(0)).current;
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setIsKeyboardVisible(true);
      if (Platform.OS === 'android') {
        const h = e?.endCoordinates?.height || 0;
        // On Android with translucent status bar, system gesture/navigation bar inset
        // is not included in the reported IME keyboard height. We include insets.bottom
        // (min 28px) plus an aesthetic cushion to guarantee the input bar is completely clear.
        const androidNavOffset = Math.max(insets.bottom, 28);
        const targetHeight = h + androidNavOffset + 10;
        Animated.timing(keyboardHeightAnim, {
          toValue: targetHeight,
          duration: 150,
          useNativeDriver: false,
        }).start();
      }
      if (isAtBottomRef.current) {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      }
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
      if (Platform.OS === 'android') {
        Animated.timing(keyboardHeightAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: false,
        }).start();
      }
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardHeightAnim, insets.bottom]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  // Handler to scroll to quoted message and highlight it
  const handleScrollToMessage = useCallback(
    (targetId) => {
      if (!targetId || !invertedMessages || invertedMessages.length === 0) return;

      const targetIndex = invertedMessages.findIndex(
        (m) => m.id === targetId || m.key === targetId
      );

      if (targetIndex >= 0) {
        try {
          flatListRef.current?.scrollToIndex({
            index: targetIndex,
            animated: true,
            viewPosition: 0.5,
          });
        } catch (e) {
          flatListRef.current?.scrollToOffset({
            offset: targetIndex * 80,
            animated: true,
          });
        }

        setHighlightedMessageId(targetId);
        if (highlightTimeoutRef.current) {
          clearTimeout(highlightTimeoutRef.current);
        }
        highlightTimeoutRef.current = setTimeout(() => {
          setHighlightedMessageId(null);
        }, 1800);
      } else {
        Alert.alert('Message not found', 'The quoted message is not available in the current chat view.');
      }
    },
    [invertedMessages]
  );

  // Swipe to reply handler
  const handleInitiateReply = useCallback(
    (targetMessage) => {
      if (!targetMessage) return;
      const isImg = targetMessage.type === 'image' || targetMessage.type === 'photo';
      let imgUri = targetMessage.imageUri || null;

      setReplyingToMessage({
        id: targetMessage.id,
        text: targetMessage.text,
        type: targetMessage.type,
        senderId: targetMessage.senderId,
        senderName: targetMessage.senderId === auth().currentUser?.uid ? 'You' : otherUsername,
        caption: targetMessage.caption,
        imageUri: imgUri,
        mediaId: targetMessage.mediaId || null,
      });

      if (isImg && !imgUri && targetMessage.mediaId) {
        resolveMediaUri(targetMessage.mediaId)
          .then((resolved) => {
            if (resolved) {
              setReplyingToMessage((prev) =>
                prev && prev.id === targetMessage.id ? { ...prev, imageUri: resolved } : prev
              );
            }
          })
          .catch((err) => console.warn('Error resolving image in reply dock:', err));
      }

      setTimeout(() => {
        messageInputRef.current?.focus();
      }, 50);
    },
    [otherUsername]
  );

  // Collect all regular (non-viewOnce) photos in the current chat messages in chronological order
  const chatImages = useMemo(() => {
    return messages
      .filter(
        (m) =>
          (m.type === 'image' || m.type === 'photo') &&
          !m.viewOnce &&
          (m.imageUri || m.mediaId)
      )
      .map((m) => ({
        id: m.id || String(m.timestamp),
        messageId: m.id,
        mediaId: m.mediaId || null,
        uri: m.imageUri || null,
        caption: m.caption || '',
        timestamp: m.timestamp,
        senderId: m.senderId,
        isViewOnce: false,
      }));
  }, [messages]);
  const activeMessagesRef = useRef(null);
  const activeUserChatsRef = useRef(null);
  const activeStatusRef = useRef(null);
  const activeTypingRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isCurrentlyTypingRef = useRef(false);
  const markedSeenIdsRef = useRef(new Set());
  const pendingMessagesRef = useRef(new Map());
  const prevMessagesCountRef = useRef(0);
  const chatIdRef = useRef(chatId);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);

  // Chat Lock States (WhatsApp-style private vault lock)
  const [isChatLocked, setIsChatLocked] = useState(Boolean(route.params?.isLocked));
  const [isScreenUnlocked, setIsScreenUnlocked] = useState(
    Boolean(route.params?.isUnlocked || (otherUserId && isSessionUnlocked(otherUserId)))
  );
  const [chatLockModalVisible, setChatLockModalVisible] = useState(false);
  const [chatLockModalMode, setChatLockModalMode] = useState('unlock');

  // Verify chat lock status on mount
  useEffect(() => {
    if (isSelfChat || !otherUserId) {
      setIsScreenUnlocked(true);
      return;
    }
    const currentUid = auth().currentUser?.uid;
    if (!currentUid) return;

    isChatLockedForUser(currentUid, otherUserId).then((locked) => {
      setIsChatLocked(locked);
      if (locked) {
        const unlocked = Boolean(route.params?.isUnlocked || isSessionUnlocked(otherUserId));
        setIsScreenUnlocked(unlocked);
      } else {
        setIsScreenUnlocked(true);
      }
    });
  }, [otherUserId, isSelfChat, route.params?.isUnlocked]);

  const handleToggleChatLock = async () => {
    if (isSelfChat || !otherUserId) return;
    const currentUid = auth().currentUser?.uid;
    if (!currentUid) return;

    if (isChatLocked) {
      setChatLockModalMode('remove');
      setChatLockModalVisible(true);
    } else {
      setChatLockModalMode('setup');
      setChatLockModalVisible(true);
    }
  };

  useEffect(() => {
    chatIdRef.current = chatId;
    isAtBottomRef.current = true;
    prevMessagesCountRef.current = 0;
    setShowScrollBottomBtn(false);
    scrollBottomBtnAnim.setValue(0);
  }, [chatId, scrollBottomBtnAnim]);

  const otherUsername = route.params?.username || 'Chat';
  const otherUserId = route.params?.userId || route.params?.id || route.params?.friendId;
  const otherAvatar = route.params?.avatar || null;
  const isSelfChat = Boolean(
    route.params?.isSelfChat ||
    (otherUserId && otherUserId === auth().currentUser?.uid)
  );

  // Dynamic safe area top inset for Android & iOS notch protection
  const safeTopPadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 12
  ) + 8;

  // State for in-call minimize & equalizer frequency bars
  const [isCallMinimized, setIsCallMinimized] = useState(false);
  const eqBars = useRef([
    new Animated.Value(6),
    new Animated.Value(16),
    new Animated.Value(8),
    new Animated.Value(22),
    new Animated.Value(10),
    new Animated.Value(18),
    new Animated.Value(7),
  ]).current;

  // Animations for call UI & attachments
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ringAnim = useRef(new Animated.Value(0)).current;
  const attachAnim = useRef(new Animated.Value(0)).current;

  // Audio/Video call hook
  const {
    callState,
    callType,
    callDuration,
    isMuted,
    isSpeaker,
    isCameraOff,
    callError,
    localStream,
    remoteStream,
    startCall,
    answerCall,
    declineCall,
    endCall,
    listenIncoming,
    toggleMute,
    toggleSpeaker,
    toggleCamera,
    switchCamera,
    formatDuration,
  } = useAudioCall(chatId, otherUserId);

  const autoAnswerTriggeredRef = useRef(false);

  // Auto-answer incoming call if routed from GlobalIncomingCallNotifier Accept button
  useEffect(() => {
    if (route.params?.autoAnswer && callState === 'incoming' && !autoAnswerTriggeredRef.current) {
      autoAnswerTriggeredRef.current = true;
      console.log('[ChatScreen] Auto-answering call triggered from global incoming notification');
      answerCall();
    }
  }, [route.params?.autoAnswer, callState, answerCall]);

  // Reset minimize state when call ends
  useEffect(() => {
    if (callState === 'idle') {
      setIsCallMinimized(false);
      autoAnswerTriggeredRef.current = false;
    }
  }, [callState]);

  // Animated equalizer waves for live call audio
  useEffect(() => {
    if (callState === 'connected' || callState === 'calling') {
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
  }, [callState]);

  // Send quick reaction emoji during call
  const sendReaction = (emoji) => {
    if (!chatId) return;
    const currentUser = auth().currentUser;
    if (!currentUser) return;
    database().ref(`chats/${chatId}/messages`).push({
      text: emoji,
      senderId: currentUser.uid,
      timestamp: database.ServerValue.TIMESTAMP,
      type: 'text',
    });
  };

  // Initialize Chat & Presence
  useEffect(() => {
    initializeChat();
    setupUserPresence();
    if (!isSelfChat) {
      listenOtherUserStatus();
    }
    return () => {
      if (activeMessagesRef.current) {
        activeMessagesRef.current.off('value');
        activeMessagesRef.current = null;
      }
      if (activeUserChatsRef.current) {
        activeUserChatsRef.current.off('value');
        activeUserChatsRef.current = null;
      }
      if (activeStatusRef.current) {
        activeStatusRef.current.off('value');
        activeStatusRef.current = null;
      }
      if (activeTypingRef.current) {
        activeTypingRef.current.off('value');
        activeTypingRef.current = null;
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      const curUid = auth().currentUser?.uid;
      const curChatId = chatIdRef.current || route.params?.chatId;
      if (!isSelfChat && curChatId && curUid) {
        database().ref(`chats/${curChatId}/typing/${curUid}`).set(false);
      }
    };
  }, []);

  useEffect(() => {
    if (!chatId) return;
    const unsubscribe = listenIncoming();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [chatId, listenIncoming]);

  // Pulse animation for calls
  useEffect(() => {
    if (callState === 'calling' || callState === 'incoming') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.12, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        ])
      );
      pulse.start();

      const ring = Animated.loop(
        Animated.sequence([
          Animated.timing(ringAnim, { toValue: 1, duration: 1400, useNativeDriver: true }),
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
  }, [callState]);

  // Attachment panel animation
  useEffect(() => {
    Animated.spring(attachAnim, {
      toValue: showAttachments ? 1 : 0,
      tension: 65,
      friction: 10,
      useNativeDriver: true,
    }).start();
  }, [showAttachments]);

  const listenOtherUserStatus = () => {
    if (!otherUserId || isSelfChat) return;
    if (activeStatusRef.current) {
      activeStatusRef.current.off('value');
      activeStatusRef.current = null;
    }
    const statusRef = database().ref(`users/${otherUserId}/status`);
    activeStatusRef.current = statusRef;
    statusRef.on('value', (snapshot) => {
      const val = snapshot.val();
      const isOnline = val === 'online' || val?.state === 'online';
      setOtherUserStatus(isOnline ? 'online' : 'offline');
    });
  };

  const initializeChat = async () => {
    const currentUser = auth().currentUser;
    if (!currentUser || !otherUserId) return;

    if (route.params?.chatId) {
      setChatId(route.params.chatId);
      chatIdRef.current = route.params.chatId;
      listenToMessages(route.params.chatId);
      listenToTyping(route.params.chatId);
      return;
    }

    if (activeUserChatsRef.current) {
      activeUserChatsRef.current.off('value');
      activeUserChatsRef.current = null;
    }

    const userChatsRef = database().ref(`user_chats/${currentUser.uid}`);
    activeUserChatsRef.current = userChatsRef;
    userChatsRef.once('value').then((snapshot) => {
      const chats = snapshot.val();
      if (chats) {
        const existingChatId = Object.keys(chats).find(
          (key) => chats[key].otherUserId === otherUserId
        );
        if (existingChatId) {
          setChatId(existingChatId);
          chatIdRef.current = existingChatId;
          listenToMessages(existingChatId);
          listenToTyping(existingChatId);
          return;
        }
      }
      createNewChat(currentUser.uid, otherUserId);
    }).catch((err) => {
      console.warn('Error fetching user_chats:', err);
      createNewChat(currentUser.uid, otherUserId);
    });
  };

  const createNewChat = async (currentUserId, otherId) => {
    const db = database();
    const newChatRef = db.ref('chats').push();
    const newChatId = newChatRef.key;

    if (currentUserId === otherId) {
      await Promise.all([
        db.ref(`chats/${newChatId}/participants/${currentUserId}`).set(true),
        db.ref(`chats/${newChatId}/isSelfChat`).set(true),
        db.ref(`user_chats/${currentUserId}/${newChatId}`).set({
          otherUserId: currentUserId,
          isSelfChat: true,
          lastMessage: '',
          lastMessageTimestamp: database.ServerValue.TIMESTAMP,
        }),
      ]);
    } else {
      await Promise.all([
        db.ref(`chats/${newChatId}/participants/${currentUserId}`).set(true),
        db.ref(`chats/${newChatId}/participants/${otherId}`).set(true),
        db.ref(`user_chats/${currentUserId}/${newChatId}`).set({
          otherUserId: otherId,
          lastMessage: '',
          lastMessageTimestamp: database.ServerValue.TIMESTAMP,
        }),
        db.ref(`user_chats/${otherId}/${newChatId}`).set({
          otherUserId: currentUserId,
          lastMessage: '',
          lastMessageTimestamp: database.ServerValue.TIMESTAMP,
        }),
      ]);
    }

    setChatId(newChatId);
    chatIdRef.current = newChatId;
    listenToMessages(newChatId);
    listenToTyping(newChatId);
  };

  const listenToTyping = (activeChatId) => {
    if (!activeChatId || isSelfChat || !otherUserId) return;
    if (activeTypingRef.current) {
      activeTypingRef.current.off('value');
      activeTypingRef.current = null;
    }
    const typingRef = database().ref(`chats/${activeChatId}/typing/${otherUserId}`);
    activeTypingRef.current = typingRef;
    typingRef.on('value', (snapshot) => {
      const isTyping = Boolean(snapshot.val());
      setIsOtherUserTyping(isTyping);
      if (isTyping && isAtBottomRef.current) {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }
    });
  };

  const handleMessageTextChange = (text) => {
    setMessage(text);

    const effectiveChatId = chatId || chatIdRef.current || route.params?.chatId;
    if (isSelfChat || !effectiveChatId) return;
    const currentUid = auth().currentUser?.uid;
    if (!currentUid) return;

    if (text.trim().length > 0) {
      if (!isCurrentlyTypingRef.current) {
        isCurrentlyTypingRef.current = true;
        database().ref(`chats/${effectiveChatId}/typing/${currentUid}`).set(true);
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        isCurrentlyTypingRef.current = false;
        database().ref(`chats/${effectiveChatId}/typing/${currentUid}`).set(false);
      }, 2500);
    } else {
      if (isCurrentlyTypingRef.current) {
        isCurrentlyTypingRef.current = false;
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        database().ref(`chats/${effectiveChatId}/typing/${currentUid}`).set(false);
      }
    }
  };

  const listenToMessages = (activeChatId) => {
    if (!activeChatId) return;
    if (activeMessagesRef.current) {
      activeMessagesRef.current.off('value');
      activeMessagesRef.current = null;
    }
    markedSeenIdsRef.current.clear();
    const messagesRef = database().ref(`chats/${activeChatId}/messages`);
    activeMessagesRef.current = messagesRef;
    messagesRef.on('value', (snapshot) => {
      const data = snapshot.val();
      const currentUid = auth().currentUser?.uid;
      if (data) {
        const messagesList = Object.keys(data).map((id) => ({
          id,
          ...data[id],
        }));
        messagesList.sort((a, b) => a.timestamp - b.timestamp);

        // Reconcile pending optimistic messages (text, photos & images)
        if (pendingMessagesRef.current.size > 0 && currentUid) {
          pendingMessagesRef.current.forEach((pendingMsg, pId) => {
            const confirmed = messagesList.some(
              (m) =>
                m.senderId === currentUid &&
                (
                  (m.type === 'image' && pendingMsg.type === 'image') ||
                  (m.text && m.text === pendingMsg.text)
                ) &&
                Math.abs((m.timestamp || 0) - pendingMsg.timestamp) < 60000
            );
            if (confirmed) {
              pendingMessagesRef.current.delete(pId);
            }
          });
        }

        // ── 1. Filter out messages that current user deleted "For Me" ──
        const visibleMessages = messagesList.filter(
          (msg) => !(msg.deletedFor && currentUid && msg.deletedFor[currentUid])
        );

        // Merge any still-pending optimistic messages
        const stillPending = Array.from(pendingMessagesRef.current.values());
        const mergedMessages = [...visibleMessages, ...stillPending];
        setMessages(mergedMessages);

        // ── 2. Mark incoming unread messages as SEEN in an atomic batch (fixes write loop) ──
        if (currentUid && !isSelfChat) {
          const unreadIncoming = messagesList.filter(
            (msg) =>
              msg.senderId !== currentUid &&
              !msg.seen &&
              !msg.deletedForEveryone &&
              !markedSeenIdsRef.current.has(msg.id)
          );

          if (unreadIncoming.length > 0) {
            const batchUpdates = {};
            unreadIncoming.forEach((msg) => {
              markedSeenIdsRef.current.add(msg.id);
              batchUpdates[`chats/${activeChatId}/messages/${msg.id}/seen`] = true;
              batchUpdates[`chats/${activeChatId}/messages/${msg.id}/seenAt`] = database.ServerValue.TIMESTAMP;
              batchUpdates[`chats/${activeChatId}/messages/${msg.id}/status`] = 'seen';
            });
            batchUpdates[`user_chats/${currentUid}/${activeChatId}/unreadCount`] = 0;
            database().ref().update(batchUpdates).catch((err) => {
              console.warn('[ChatScreen] Error batch updating seen receipts:', err);
            });
          }
        }

        // Auto-scroll logic for inverted list: new messages smoothly scroll if user is at bottom
        if (mergedMessages.length > prevMessagesCountRef.current) {
          if (prevMessagesCountRef.current > 0 && isAtBottomRef.current) {
            flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
          }
        }
        prevMessagesCountRef.current = mergedMessages.length;
      } else {
        const stillPending = Array.from(pendingMessagesRef.current.values());
        setMessages(stillPending);
        prevMessagesCountRef.current = stillPending.length;
      }
    });
  };

  const sendMessage = async () => {
    const textToSend = message.trim();
    const effectiveChatId = chatId || chatIdRef.current || route.params?.chatId;
    if (!textToSend || !effectiveChatId) return;

    const db = database();
    const currentUser = auth().currentUser;
    if (!currentUser) return;

    // 1. Immediately clear input field & active reply
    setMessage('');
    const activeReply = replyingToMessage;
    setReplyingToMessage(null);

    // 2. Clear typing status in RTDB immediately
    if (!isSelfChat) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      isCurrentlyTypingRef.current = false;
      db.ref(`chats/${effectiveChatId}/typing/${currentUser.uid}`).set(false);
    }

    // 3. Create optimistic message & insert immediately into local state
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const optimisticMessage = {
      id: tempId,
      text: textToSend,
      senderId: currentUser.uid,
      timestamp: Date.now(),
      type: 'text',
      seen: isSelfChat ? true : false,
      status: 'sending',
      pending: true,
      ...(activeReply && {
        replyTo: {
          id: activeReply.id,
          senderId: activeReply.senderId,
          senderName: activeReply.senderId === currentUser.uid ? 'You' : otherUsername,
          text:
            activeReply.type === 'image' || activeReply.type === 'photo'
              ? (activeReply.caption ? `📷 ${activeReply.caption}` : '📷 Photo')
              : (activeReply.text || 'Message'),
          type: activeReply.type || 'text',
          mediaId: activeReply.mediaId || '',
          imageUri: activeReply.imageUri || '',
        },
      }),
    };

    pendingMessagesRef.current.set(tempId, optimisticMessage);
    setMessages((prev) => [...prev, optimisticMessage]);
    prevMessagesCountRef.current += 1;
    isAtBottomRef.current = true;
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });

    // 4. Send to Firebase RTDB asynchronously
    try {
      const newMessageRef = db.ref(`chats/${effectiveChatId}/messages`).push();
      const messageData = {
        text: textToSend,
        senderId: currentUser.uid,
        timestamp: database.ServerValue.TIMESTAMP,
        type: 'text',
        seen: isSelfChat ? true : false,
        status: isSelfChat ? 'seen' : 'sent',
        ...(activeReply && {
          replyTo: {
            id: activeReply.id,
            senderId: activeReply.senderId,
            senderName: activeReply.senderId === currentUser.uid ? 'You' : otherUsername,
            text:
              activeReply.type === 'image' || activeReply.type === 'photo'
                ? (activeReply.caption ? `📷 ${activeReply.caption}` : '📷 Photo')
                : (activeReply.text || 'Message'),
            type: activeReply.type || 'text',
            mediaId: activeReply.mediaId || '',
          },
        }),
      };
      await newMessageRef.set(messageData);

      // Update user_chats preview for both users
      const updates = {};
      updates[`user_chats/${currentUser.uid}/${effectiveChatId}/lastMessage`] = textToSend;
      updates[`user_chats/${currentUser.uid}/${effectiveChatId}/lastMessageTimestamp`] = database.ServerValue.TIMESTAMP;
      updates[`user_chats/${currentUser.uid}/${effectiveChatId}/lastSenderId`] = currentUser.uid;
      updates[`user_chats/${currentUser.uid}/${effectiveChatId}/unreadCount`] = 0;
      if (otherUserId && !isSelfChat) {
        updates[`user_chats/${otherUserId}/${effectiveChatId}/lastMessage`] = textToSend;
        updates[`user_chats/${otherUserId}/${effectiveChatId}/lastMessageTimestamp`] = database.ServerValue.TIMESTAMP;
        updates[`user_chats/${otherUserId}/${effectiveChatId}/lastSenderId`] = currentUser.uid;
        updates[`user_chats/${otherUserId}/${effectiveChatId}/unreadCount`] = database.ServerValue.increment(1);
      }
      await db.ref().update(updates);
      pendingMessagesRef.current.delete(tempId);
    } catch (error) {
      console.error('[ChatScreen] Error sending message:', error);
      pendingMessagesRef.current.delete(tempId);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, status: 'failed', pending: false } : m
        )
      );
    }
  };

  // Send Watch Party Invite inside Chat
  const sendWatchPartyInvite = async (roomData) => {
    const effectiveChatId = chatId || route.params?.chatId;
    if (!effectiveChatId) {
      console.warn('sendWatchPartyInvite: No active chatId found');
      return;
    }
    const db = database();
    const currentUser = auth().currentUser;
    if (!currentUser) return;

    // Resolve high quality thumbnail URL from YouTube or roomData (avoiding 4:3 hqdefault black bars)
    let resolvedThumbnail = '';
    if (roomData?.thumbnail && typeof roomData.thumbnail === 'string' && roomData.thumbnail.startsWith('http')) {
      resolvedThumbnail = roomData.thumbnail.replace('/hqdefault.jpg', '/maxresdefault.jpg');
    } else if (roomData?.streamUrl) {
      const details = getYouTubeThumbnailDetails(roomData.streamUrl);
      if (details) {
        resolvedThumbnail = details.maxresUrl || details.mqUrl || details.fallbackUrl || '';
      }
    }

    const inviteText = `Hey! Join my watch party for ${roomData?.name || 'a live screening'} 🍿`;
    const messageData = {
      text: inviteText,
      senderId: currentUser.uid,
      timestamp: database.ServerValue.TIMESTAMP,
      type: 'watch_party_invite',
      roomId: roomData?.roomId || '',
      roomName: roomData?.name || 'Watch Party',
      streamUrl: roomData?.streamUrl || '',
      thumbnail: resolvedThumbnail || '',
      isScheduled: !!roomData?.scheduledDate || !!roomData?.isScheduled,
      scheduledDate: roomData?.scheduledDate || null,
      inviteStatus: 'pending',
      seen: false,
      status: 'sent',
    };

    const newMessageRef = db.ref(`chats/${effectiveChatId}/messages`).push();
    await newMessageRef.set(messageData);

    const updates = {};
    updates[`user_chats/${currentUser.uid}/${effectiveChatId}/lastMessage`] = inviteText;
    updates[`user_chats/${currentUser.uid}/${effectiveChatId}/lastMessageTimestamp`] = database.ServerValue.TIMESTAMP;
    updates[`user_chats/${currentUser.uid}/${effectiveChatId}/lastSenderId`] = currentUser.uid;
    updates[`user_chats/${currentUser.uid}/${effectiveChatId}/unreadCount`] = 0;
    if (otherUserId && !isSelfChat) {
      updates[`user_chats/${otherUserId}/${effectiveChatId}/lastMessage`] = inviteText;
      updates[`user_chats/${otherUserId}/${effectiveChatId}/lastMessageTimestamp`] = database.ServerValue.TIMESTAMP;
      updates[`user_chats/${otherUserId}/${effectiveChatId}/lastSenderId`] = currentUser.uid;
      updates[`user_chats/${otherUserId}/${effectiveChatId}/unreadCount`] = database.ServerValue.increment(1);
    }
    await db.ref().update(updates);

    isAtBottomRef.current = true;
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const autoInviteSentRef = useRef(false);

  // Automatically send watch party invite if passed via navigation params (e.g. from FriendProfileScreen)
  useEffect(() => {
    if (route.params?.autoSendInvite && chatId && !autoInviteSentRef.current) {
      autoInviteSentRef.current = true;
      sendWatchPartyInvite(route.params.autoSendInvite);
    }
  }, [route.params?.autoSendInvite, chatId]);

  // Trigger watch party invite with real active rooms from RTDB
  const handleTriggerWatchPartyInvite = async () => {
    const currentUser = auth().currentUser;
    if (!currentUser) return;
    try {
      const snapshot = await database().ref('rooms').once('value');
      const val = snapshot.val();
      if (val) {
        // Collect rooms created by currentUser
        const myRooms = Object.values(val).filter(
          r => r && (r.creator?.email === currentUser?.email || r.creator?.uid === currentUser?.uid)
        );

        // Participated rooms where user is participant or host
        const participatedRooms = Object.values(val).filter(r => {
          if (!r || !r.name) return false;
          if (r.participants && typeof r.participants === 'object') {
            return Object.keys(r.participants).includes(currentUser.uid);
          }
          return false;
        });

        // Combine unique rooms
        const combined = [...myRooms];
        participatedRooms.forEach(pr => {
          if (!combined.some(r => r.roomId === pr.roomId)) {
            combined.push(pr);
          }
        });

        const availableRooms = combined.length > 0 ? combined : Object.values(val).filter(r => r && r.name);

        // Scenario 1: Exactly 1 room -> show single VIP ticket pass
        if (availableRooms.length === 1) {
          const targetRoom = availableRooms[0];
          showCineAlert({
            type: 'invite',
            title: 'Watch Party VIP Pass',
            message: `Dispatch real-time synchronized invitation to @${otherUsername}`,
            roomTicket: {
              name: targetRoom.name,
              roomId: targetRoom.roomId,
              isStreaming: targetRoom.isStreaming,
              streamUrl: targetRoom.streamUrl,
              thumbnail: targetRoom.thumbnail,
              scheduledDate: targetRoom.scheduledDate,
              isScheduled: targetRoom.isScheduled,
            },
            confirmText: 'Send Invite',
            cancelText: 'Dismiss',
            onConfirm: () => {
              sendWatchPartyInvite(targetRoom);
            },
          });
          return;
        }

        // Scenario 2: Multiple rooms -> open interactive room selector modal
        if (availableRooms.length > 1) {
          showCineAlert({
            type: 'invite',
            title: 'Select Watch Party Room',
            message: `Choose which room to invite @${otherUsername} to:`,
            roomList: availableRooms,
            confirmText: 'Send Invite',
            cancelText: 'Dismiss',
            onConfirm: (selectedRoom) => {
              const target = selectedRoom || availableRooms[0];
              sendWatchPartyInvite(target);
            },
          });
          return;
        }
      }

      // If no rooms exist, prompt user to create a room
      showCineAlert({
        type: 'action',
        icon: 'video-camera-front',
        title: 'No Active Watch Room',
        message: "You don't have an active watch party room yet. Would you like to create one now to stream together?",
        confirmText: 'Create Room',
        cancelText: 'Cancel',
        onConfirm: () => navigation.navigate('CreateRoom'),
      });
    } catch (err) {
      console.error('Error fetching rooms for invite:', err);
    }
  };

  // ── Long Press Message Action Handlers ──
  const handleMessageLongPress = (msg) => {
    Keyboard.dismiss();
    setSelectedMessage(msg);
    setShowMessageActionModal(true);
  };

  // Delete message for the current user only
  const handleDeleteForMe = async () => {
    if (!selectedMessage || !chatId) return;
    const currentUid = auth().currentUser?.uid;
    if (!currentUid) return;

    try {
      await database()
        .ref(`chats/${chatId}/messages/${selectedMessage.id}/deletedFor/${currentUid}`)
        .set(true);
      setShowMessageActionModal(false);
      setSelectedMessage(null);
    } catch (error) {
      console.error('[Chat] Delete for me error:', error);
      Alert.alert('Error', 'Could not delete message for you.');
    }
  };

  // Delete message for all participants in chat
  const handleDeleteForEveryone = async () => {
    if (!selectedMessage || !chatId) return;
    const currentUid = auth().currentUser?.uid;
    if (!currentUid || selectedMessage.senderId !== currentUid) return;

    showCineAlert({
      type: 'danger',
      icon: 'delete-forever',
      title: 'Delete for Everyone?',
      message: 'This message will be permanently deleted for all members in this chat.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          await database()
            .ref(`chats/${chatId}/messages/${selectedMessage.id}`)
            .update({
              deletedForEveryone: true,
              deletedAt: database.ServerValue.TIMESTAMP,
              text: 'This message was deleted',
            });

          // Also update lastMessage in user_chats if needed
          const updates = {};
          updates[`user_chats/${currentUid}/${chatId}/lastMessage`] = 'This message was deleted';
          if (otherUserId) {
            updates[`user_chats/${otherUserId}/${chatId}/lastMessage`] = 'This message was deleted';
          }
          await database().ref().update(updates);

          setShowMessageActionModal(false);
          setSelectedMessage(null);
        } catch (error) {
          console.error('[Chat] Delete for everyone error:', error);
          showCineAlert({
            type: 'danger',
            title: 'Delete Failed',
            message: 'Could not delete message for everyone. Please try again.',
          });
        }
      },
    });
  };

  const setupUserPresence = () => {
    if (!auth().currentUser) return;
    const db = database();
    const userStatusRef = db.ref(`users/${auth().currentUser.uid}/status`);
    userStatusRef.set('online');

    const connectedRef = db.ref('.info/connected');
    connectedRef.on('value', (snapshot) => {
      if (snapshot.val() === false) {
        userStatusRef.set('offline');
      } else {
        userStatusRef.set('online');
      }
    });
  };

  // ── PHOTO PICKING & EPHEMERAL VIEW-ONCE LOGIC (No Storage) ──

  // Request Android Camera Permission
  const requestCameraPermission = async () => {
    if (Platform.OS !== 'android') return true;
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
        {
          title: 'Camera Permission',
          message: 'Cine-Sync requires access to your camera to take and share photos.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn('Camera permission request error:', err);
      return false;
    }
  };

  // Launch Camera with base64 compression for direct RTDB transport
  const handlePickCamera = async () => {
    setShowAttachments(false);
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      Alert.alert('Permission Denied', 'Camera permission is required to capture photos.');
      return;
    }

    try {
      const result = await launchCamera({
        mediaType: 'photo',
        cameraType: 'back',
        quality: 1.0,
        includeBase64: true,
        saveToPhotos: false,
      });

      if (result.didCancel || !result.assets || result.assets.length === 0) return;
      const asset = result.assets[0];

      // Safety check for RTDB 10MB node size ceiling (~6.8MB raw file)
      const MAX_RAW_BYTES = 6.8 * 1024 * 1024;
      if (asset.fileSize && asset.fileSize > MAX_RAW_BYTES) {
        showCineAlert({
          title: 'Photo Too Large',
          message: 'Captured photo exceeds the 6.8MB uncompressed relay limit. Please take another shot.',
          type: 'warning',
        });
        return;
      }

      let base64String = asset.base64;
      if (!base64String && asset.uri) {
        try {
          base64String = await RNFS.readFile(asset.uri, 'base64');
        } catch (e) {
          console.warn('[RNFS] Camera base64 fallback error:', e);
        }
      }
      const dataUri = base64String
        ? `data:${asset.type || 'image/jpeg'};base64,${base64String}`
        : asset.uri;

      setSelectedPhotos([
        {
          previewUri: asset.uri || dataUri,
          uri: dataUri,
          width: asset.width || SCREEN_WIDTH,
          height: asset.height || SCREEN_HEIGHT,
          sourceType: 'Camera',
        },
      ]);
      setActivePhotoIndex(0);
      setIsViewOnce(false);
      setPhotoCaption('');
      setShowPhotoPreviewModal(true);
    } catch (err) {
      console.warn('launchCamera error:', err);
      Alert.alert('Camera Error', 'Could not access device camera.');
    }
  };

  // Launch Gallery with multi-select support (selectionLimit: 0) and 100% uncompressed quality
  const handlePickGallery = async () => {
    setShowAttachments(false);
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 0, // 0 allows selecting multiple images
        quality: 1.0, // 100% Uncompressed original quality
        includeBase64: true,
      });

      if (result.didCancel || !result.assets || result.assets.length === 0) return;

      // Filter out files exceeding RTDB relay threshold (6.8MB raw = ~9.2MB base64)
      const MAX_RAW_BYTES = 6.8 * 1024 * 1024;
      const validAssets = result.assets.filter((asset) => {
        if (asset.fileSize && asset.fileSize > MAX_RAW_BYTES) {
          showCineAlert({
            title: 'Photo Too Large',
            message: `"${asset.fileName || 'Photo'}" exceeds the 6.8MB uncompressed relay limit.`,
            type: 'warning',
          });
          return false;
        }
        return true;
      });

      if (validAssets.length === 0) return;

      const photoItems = await Promise.all(
        validAssets.map(async (asset) => {
          let base64String = asset.base64;
          if (!base64String && asset.uri) {
            try {
              base64String = await RNFS.readFile(asset.uri, 'base64');
            } catch (e) {
              console.warn('[RNFS] Gallery multi-base64 fallback error:', e);
            }
          }
          const dataUri = base64String
            ? `data:${asset.type || 'image/jpeg'};base64,${base64String}`
            : asset.uri;

          return {
            previewUri: asset.uri || dataUri,
            uri: dataUri,
            width: asset.width || SCREEN_WIDTH,
            height: asset.height || SCREEN_HEIGHT,
            sourceType: 'Gallery',
          };
        })
      );

      setSelectedPhotos(photoItems);
      setActivePhotoIndex(0);
      setIsViewOnce(false);
      setPhotoCaption('');
      setShowPhotoPreviewModal(true);
    } catch (err) {
      console.warn('launchImageLibrary error:', err);
      Alert.alert('Gallery Error', 'Could not open image gallery.');
    }
  };

  // Send photo(s) to chat (decoupled media_blobs in RTDB + local disk cache)
  const handleSendPhoto = async () => {
    const effectiveChatId = chatId || chatIdRef.current || route.params?.chatId;
    if (!selectedPhotos || selectedPhotos.length === 0 || !effectiveChatId || isSendingPhoto) return;
    const currentUser = auth().currentUser;
    if (!currentUser) return;

    setIsSendingPhoto(true);
    const photosToSend = [...selectedPhotos];
    const caption = photoCaption.trim();
    const sendAsViewOnce = isViewOnce && photosToSend.length === 1;
    const activeReply = replyingToMessage;

    // Capture tiny microThumb from active preview before closing modal (~200 bytes for instant blurry preview)
    let activeMicroThumb = '';
    try {
      if (photoPreviewImageRef.current) {
        activeMicroThumb = await Promise.race([
          captureRef(photoPreviewImageRef.current, {
            format: 'jpg',
            quality: 0.15,
            width: 28,
            height: 28,
            result: 'data-uri',
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('captureRef timeout')), 1000)),
        ]);
      }
    } catch (captureErr) {
      console.warn('[ChatScreen] microThumb capture warning:', captureErr);
    }

    // Dismiss preview modal immediately
    setShowPhotoPreviewModal(false);
    setSelectedPhotos([]);
    setActivePhotoIndex(0);
    setPhotoCaption('');
    setIsViewOnce(false);
    setReplyingToMessage(null);

    // Optimistically insert image message bubbles immediately for zero UI lag (instant feedback)
    const optimisticMessages = photosToSend.map((photo, i) => {
      const tempId = `temp_photo_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`;
      const optimisticMsg = {
        id: tempId,
        type: 'image',
        mediaId: '',
        imageUri: photo.previewUri || photo.uri, // Instant local preview on sender device
        caption: i === 0 ? caption : '',
        viewOnce: sendAsViewOnce,
        opened: false,
        senderId: currentUser.uid,
        timestamp: Date.now() + i,
        seen: isSelfChat ? true : false,
        status: isSelfChat ? 'seen' : 'sending',
        pending: true,
        width: Number(photo.width) || 800,
        height: Number(photo.height) || 800,
        microThumb: activeMicroThumb || photo.microThumb || '',
        ...(i === 0 &&
          activeReply && {
          replyTo: {
            id: activeReply.id || '',
            senderId: activeReply.senderId || '',
            senderName: activeReply.senderId === currentUser.uid ? 'You' : (otherUsername || 'User'),
            text:
              activeReply.type === 'image' || activeReply.type === 'photo'
                ? (activeReply.caption ? `📷 ${activeReply.caption}` : '📷 Photo')
                : (activeReply.text || 'Message'),
            type: activeReply.type || 'text',
            mediaId: activeReply.mediaId || '',
          },
        }),
      };
      pendingMessagesRef.current.set(tempId, optimisticMsg);
      return optimisticMsg;
    });

    setMessages((prev) => [...prev, ...optimisticMessages]);
    prevMessagesCountRef.current += optimisticMessages.length;
    isAtBottomRef.current = true;
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });

    try {
      const messagesRef = database().ref(`chats/${effectiveChatId}/messages`);

      for (let i = 0; i < photosToSend.length; i++) {
        const photo = photosToSend[i];
        const mediaId = await uploadMediaBlob(photo.uri, currentUser.uid);
        const newMsgRef = messagesRef.push();

        const messagePayload = {
          id: newMsgRef.key,
          type: 'image',
          mediaId: mediaId || '',
          imageUri: '', // Decoupled from message payload: keeps messages under 1KB
          caption: (i === 0 ? caption : '') || '', // First photo holds user caption
          viewOnce: Boolean(sendAsViewOnce),
          opened: false,
          senderId: currentUser.uid,
          timestamp: database.ServerValue.TIMESTAMP,
          seen: isSelfChat ? true : false,
          status: isSelfChat ? 'seen' : 'sent',
          width: Number(photo.width) || 800,
          height: Number(photo.height) || 800,
          microThumb: activeMicroThumb || photo.microThumb || '',
          ...(i === 0 &&
            activeReply && {
            replyTo: {
              id: activeReply.id || '',
              senderId: activeReply.senderId || '',
              senderName: activeReply.senderId === currentUser.uid ? 'You' : (otherUsername || 'User'),
              text:
                activeReply.type === 'image' || activeReply.type === 'photo'
                  ? (activeReply.caption ? `📷 ${activeReply.caption}` : '📷 Photo')
                  : (activeReply.text || 'Message'),
              type: activeReply.type || 'text',
              mediaId: activeReply.mediaId || '',
            },
          }),
        };

        await newMsgRef.set(messagePayload);
      }

      // Update user_chats preview for both users
      const previewText = sendAsViewOnce
        ? '📷 View-once photo'
        : photosToSend.length > 1
          ? `📷 ${photosToSend.length} Photos`
          : (caption ? `📷 ${caption}` : '📷 Photo');

      const updates = {};
      updates[`user_chats/${currentUser.uid}/${effectiveChatId}/lastMessage`] = previewText;
      updates[`user_chats/${currentUser.uid}/${effectiveChatId}/lastMessageTimestamp`] = database.ServerValue.TIMESTAMP;
      updates[`user_chats/${currentUser.uid}/${effectiveChatId}/lastSenderId`] = currentUser.uid;
      updates[`user_chats/${currentUser.uid}/${effectiveChatId}/unreadCount`] = 0;
      if (otherUserId && !isSelfChat) {
        updates[`user_chats/${otherUserId}/${effectiveChatId}/lastMessage`] = previewText;
        updates[`user_chats/${otherUserId}/${effectiveChatId}/lastMessageTimestamp`] = database.ServerValue.TIMESTAMP;
        updates[`user_chats/${otherUserId}/${effectiveChatId}/lastSenderId`] = currentUser.uid;
        updates[`user_chats/${otherUserId}/${effectiveChatId}/unreadCount`] = database.ServerValue.increment(photosToSend.length);
      }
      await database().ref().update(updates);
    } catch (error) {
      console.error('Error sending photo(s):', error);
      Alert.alert('Send Error', 'Failed to send photo(s). Please try again.');
    } finally {
      setIsSendingPhoto(false);
    }
  };

  // Handle tapping on a View-Once ephemeral photo
  const handleViewOncePhotoPress = async (item) => {
    const currentUid = auth().currentUser?.uid;
    const isMyMessage = item.senderId === currentUid;

    if (item.opened) {
      Alert.alert(
        'Photo Expired',
        'This view-once photo has already been opened and is no longer available.'
      );
      return;
    }

    if (isMyMessage) {
      Alert.alert(
        'View-Once Photo',
        'You sent this photo as view-once. It can only be opened once by the recipient.'
      );
      return;
    }

    if (!item.imageUri && !item.mediaId) {
      Alert.alert('Unavailable', 'This photo is no longer available.');
      return;
    }

    // Resolve media URI on-demand (checks local disk cache first, else fetches once from media_blobs)
    let uri = item.imageUri;
    if (item.mediaId) {
      uri = await resolveMediaUri(item.mediaId, item.imageUri, !isMyMessage);
    }

    if (!uri) {
      Alert.alert('Unavailable', 'This photo is no longer available or has expired.');
      return;
    }

    // Recipient opens the view-once photo
    setImageViewerState({
      visible: true,
      images: [
        {
          id: item.id,
          messageId: item.id,
          mediaId: item.mediaId || null,
          uri: uri,
          caption: item.caption || '',
          timestamp: item.timestamp,
          senderId: item.senderId,
          isViewOnce: true,
        },
      ],
      initialIndex: 0,
      isViewOnce: true,
      viewOnceMessage: item,
    });
  };

  // Open regular photo in fullscreen multi-image swipe gallery with zoom
  const handleOpenRegularPhoto = (resolvedUri, caption, item) => {
    const clickedId = item?.id;
    let targetIndex = chatImages.findIndex(
      (img) => img.id === clickedId || img.messageId === clickedId
    );

    let imagesList = [...chatImages];
    if (targetIndex >= 0) {
      imagesList[targetIndex] = {
        ...imagesList[targetIndex],
        uri: resolvedUri || imagesList[targetIndex].uri,
      };
    } else {
      const fallbackItem = {
        id: item?.id || String(Date.now()),
        messageId: item?.id,
        mediaId: item?.mediaId || null,
        uri: resolvedUri || item?.imageUri || null,
        caption: caption || item?.caption || '',
        timestamp: item?.timestamp || Date.now(),
        senderId: item?.senderId,
        isViewOnce: false,
      };
      imagesList = [fallbackItem];
      targetIndex = 0;
    }

    setImageViewerState({
      visible: true,
      images: imagesList,
      initialIndex: targetIndex,
      isViewOnce: false,
      viewOnceMessage: null,
    });
  };

  // Close fullscreen photo viewer (if view-once, marks opened, wipes imageUri, and purges blob)
  const handleCloseImageViewer = () => {
    if (imageViewerState.isViewOnce && imageViewerState.viewOnceMessage && chatId) {
      const msgId = imageViewerState.viewOnceMessage.id;
      const mediaId = imageViewerState.viewOnceMessage.mediaId;

      // Mark opened and clear references to enforce single viewing and save RTDB bandwidth
      database().ref(`chats/${chatId}/messages/${msgId}`).update({
        opened: true,
        openedAt: database.ServerValue.TIMESTAMP,
        imageUri: '',
        mediaId: '',
      }).catch((e) => console.warn('Error marking view-once opened:', e));

      // Purge heavy Base64 from RTDB and local disk cache to reclaim free quota
      if (mediaId) {
        deleteMediaBlob(mediaId).catch((e) => console.warn('Error deleting media blob:', e));
      }
    }

    setImageViewerState({
      visible: false,
      images: [],
      initialIndex: 0,
      isViewOnce: false,
      viewOnceMessage: null,
    });
  };

  // Render Message Item
  const renderMessage = ({ item, index }) => {
    const isMyMessage = item.senderId === auth().currentUser?.uid;
    const isHighlighted = highlightedMessageId === item.id;

    const dateSeparator = (() => {
      const currentMessageDate = new Date(item.timestamp || Date.now());
      // In an inverted FlatList, older messages in time are at higher indices (index + 1)
      const olderMessage = index < invertedMessages.length - 1 ? invertedMessages[index + 1] : null;
      const olderMessageDate = olderMessage ? new Date(olderMessage.timestamp || Date.now()) : null;

      if (!olderMessageDate || !isSameDay(currentMessageDate, olderMessageDate)) {
        return (
          <View style={styles.dateSeparator}>
            <Text style={styles.dateText}>{getDateLabel(currentMessageDate)}</Text>
          </View>
        );
      }
      return null;
    })();

    // ── DELETED FOR EVERYONE MESSAGE ──
    if (item.deletedForEveryone) {
      return (
        <View style={styles.messageOuterWrap}>
          {dateSeparator}
          <TouchableOpacity
            activeOpacity={0.8}
            onLongPress={() => handleMessageLongPress(item)}
            style={[
              styles.deletedBubbleContainer,
              isMyMessage ? styles.myDeletedBubble : styles.theirDeletedBubble,
            ]}
          >
            <MaterialIcons
              name="block"
              size={13}
              color={colors.SUB_TITLE_COLOR}
              style={{ marginRight: 6 }}
            />
            <Text style={styles.deletedBubbleText}>
              {isMyMessage ? 'You deleted this message' : 'This message was deleted'}
            </Text>
            <Text style={styles.deletedBubbleTime}>
              {new Date(item.timestamp || Date.now()).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    // ── CALL LOG MESSAGE TILE (WhatsApp Style) ──
    if (item.type === 'call') {
      const isCaller = item.callerId === auth().currentUser?.uid;
      const isVideo = item.callType === 'video';
      const isMissed =
        item.callStatus === 'missed' ||
        item.callStatus === 'declined' ||
        item.callStatus === 'cancelled';

      const mins = Math.floor((item.duration || 0) / 60);
      const secs = (item.duration || 0) % 60;
      const durationLabel = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

      let title = isVideo ? 'Video call' : 'Voice call';
      let subtitle = durationLabel;
      let iconName = isVideo ? 'videocam' : 'call';
      let iconColor = colors.ACCEPT_GREEN;
      let badgeBg = 'rgba(0, 200, 83, 0.15)';

      if (isMissed) {
        iconColor = colors.LIVE_RED;
        badgeBg = 'rgba(239, 68, 68, 0.15)';
        if (!isCaller) {
          title = isVideo ? 'Missed video call' : 'Missed voice call';
          subtitle = 'Tap to call back';
          iconName = isVideo ? 'videocam-off' : 'call-missed';
        } else {
          title = isVideo ? 'Video call' : 'Voice call';
          subtitle = item.callStatus === 'declined' ? 'Declined' : 'No answer';
          iconName = isVideo ? 'videocam' : 'call-made';
        }
      }

      return (
        <View style={styles.messageOuterWrap}>
          {dateSeparator}
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => {
              Alert.alert(
                isVideo ? 'Video Call' : 'Voice Call',
                `Call ${otherUsername}?`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Call',
                    onPress: () => startCall(isVideo ? 'video' : 'audio'),
                  },
                ]
              );
            }}
            onLongPress={() => handleMessageLongPress(item)}
            style={[
              styles.callTileCard,
              isMyMessage ? styles.myCallTileCard : styles.theirCallTileCard,
              isHighlighted && styles.highlightedMessageBubble,
            ]}
          >
            <View style={styles.callTileMainRow}>
              {/* Call Icon Badge */}
              <View style={[styles.callTileIconBadge, { backgroundColor: badgeBg }]}>
                <MaterialIcons name={iconName} size={22} color={iconColor} />
              </View>

              {/* Text Info */}
              <View style={styles.callTileTextCol}>
                <Text
                  style={[
                    styles.callTileTitle,
                    isMissed && !isCaller && { color: colors.LIVE_RED },
                  ]}
                  numberOfLines={1}
                >
                  {title}
                </Text>
                <Text
                  style={[
                    styles.callTileSubtitle,
                    isMissed && !isCaller && { color: colors.CYAN_ACCENT },
                  ]}
                  numberOfLines={1}
                >
                  {subtitle}
                </Text>
              </View>

              {/* Direct Call Back Button */}
              <TouchableOpacity
                style={styles.callTileCallbackBtn}
                onPress={() => startCall(isVideo ? 'video' : 'audio')}
                activeOpacity={0.7}
              >
                <MaterialIcons
                  name={isVideo ? 'videocam' : 'call'}
                  size={18}
                  color={colors.CYAN_ACCENT}
                />
              </TouchableOpacity>
            </View>

            {/* Footer with Timestamp & Seen Status */}
            <View style={styles.callTileFooter}>
              <Text style={styles.callTileTimestamp}>
                {new Date(item.timestamp || Date.now()).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
              {isMyMessage && (
                <View style={styles.seenReceiptRow}>
                  <MaterialIcons
                    name={item.seen || item.status === 'seen' ? 'done-all' : 'done'}
                    size={14}
                    color={item.seen || item.status === 'seen' ? colors.CYAN_ACCENT : 'rgba(255, 255, 255, 0.65)'}
                    style={{ marginLeft: 4 }}
                  />
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>
      );
    }

    // ── EMBEDDED WATCH PARTY INVITATION CARD IN CHAT ──
    if (item.type === 'watch_party_invite') {
      return (
        <WatchPartyInviteTile
          item={item}
          chatId={chatId}
          isMyMessage={isMyMessage}
          otherUsername={otherUsername}
          navigation={navigation}
          handleMessageLongPress={handleMessageLongPress}
          dateSeparator={dateSeparator}
          isHighlighted={isHighlighted}
        />
      );
    }

    // ── PHOTO / IMAGE MESSAGES (Regular & Ephemeral View-Once) ──
    if (item.type === 'image' || item.type === 'photo') {
      if (item.viewOnce) {
        // VIEW-ONCE (1x) EPHEMERAL MESSAGE BUBBLE
        const isOpened = Boolean(item.opened);
        return (
          <View style={styles.messageOuterWrap}>
            {dateSeparator}
            <SwipeableMessageRow item={item} isMyMessage={isMyMessage} onSwipeReply={handleInitiateReply}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => handleViewOncePhotoPress(item)}
                onLongPress={() => handleMessageLongPress(item)}
                style={[
                  styles.viewOnceBubble,
                  isMyMessage ? styles.myViewOnceBubble : styles.theirViewOnceBubble,
                  isOpened && styles.viewOnceBubbleOpened,
                  isHighlighted && styles.highlightedMessageBubble,
                ]}
              >
                <View style={styles.viewOnceContentRow}>
                  {/* 1x Badge Circle */}
                  <View
                    style={[
                      styles.viewOnceBadgeCircle,
                      isOpened
                        ? styles.viewOnceBadgeCircleOpened
                        : isMyMessage
                          ? styles.viewOnceBadgeCircleMy
                          : styles.viewOnceBadgeCircleTheir,
                    ]}
                  >
                    <Text
                      style={[
                        styles.viewOnceBadgeText,
                        isOpened && styles.viewOnceBadgeTextOpened,
                      ]}
                    >
                      1
                    </Text>
                  </View>

                  {/* Text Info */}
                  <View style={styles.viewOnceTextCol}>
                    <Text
                      style={[
                        styles.viewOnceTitle,
                        isOpened && styles.viewOnceTitleOpened,
                      ]}
                    >
                      {isOpened ? 'Opened' : 'Photo'}
                    </Text>
                    <Text style={styles.viewOnceSubtext} numberOfLines={1}>
                      {isOpened
                        ? 'Expired view-once photo'
                        : isMyMessage
                          ? 'View once'
                          : 'View once • Tap to open'}
                    </Text>
                  </View>

                  {/* Status / Lock Icon */}
                  <MaterialIcons
                    name={isOpened ? 'lock-outline' : (isMyMessage ? 'visibility-off' : 'photo-camera')}
                    size={18}
                    color={isOpened ? 'rgba(255, 255, 255, 0.35)' : (isMyMessage ? '#FFF' : colors.CYAN_ACCENT)}
                    style={{ marginLeft: 8 }}
                  />
                </View>

                {/* Timestamp & Seen Receipt */}
                <View style={styles.viewOnceFooter}>
                  <Text style={styles.viewOnceTimestamp}>
                    {new Date(item.timestamp || Date.now()).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                  {isMyMessage && (
                    <View style={styles.seenReceiptRow}>
                      <MaterialIcons
                        name={item.seen || item.status === 'seen' ? 'done-all' : 'done'}
                        size={14}
                        color={item.seen || item.status === 'seen' ? colors.CYAN_ACCENT : 'rgba(255, 255, 255, 0.65)'}
                        style={{ marginLeft: 4 }}
                      />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            </SwipeableMessageRow>
          </View>
        );
      }

      // REGULAR PHOTO MESSAGE BUBBLE
      return (
        <View style={styles.messageOuterWrap}>
          {dateSeparator}
          <SwipeableMessageRow item={item} isMyMessage={isMyMessage} onSwipeReply={handleInitiateReply}>
            <ChatImageThumbnail
              item={item}
              isMyMessage={isMyMessage}
              onOpenFullscreen={(uri, caption, photoItem) =>
                handleOpenRegularPhoto(uri, caption, photoItem || item)
              }
              onLongPress={handleMessageLongPress}
              onScrollToMessage={handleScrollToMessage}
              allMessages={messages}
              currentUserId={auth().currentUser?.uid}
              otherUsername={otherUsername}
              isHighlighted={isHighlighted}
            />
          </SwipeableMessageRow>
        </View>
      );
    }

    // ── REGULAR CHAT BUBBLES ──
    const extractedUrl = extractFirstUrl(item.text);

    const renderFormattedMessageText = (rawText, isMine) => {
      if (!rawText) return null;
      const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
      const parts = rawText.split(urlRegex);

      return (
        <Text style={[styles.messageText, isMine && { color: '#FFF' }]}>
          {parts.map((part, i) => {
            if (!part) return null;
            const isUrl = /(https?:\/\/[^\s]+|www\.[^\s]+)/i.test(part);
            if (isUrl) {
              const fullUrl = part.toLowerCase().startsWith('www.') ? 'https://' + part : part;
              return (
                <Text
                  key={i}
                  style={{
                    color: isMine ? '#93C5FD' : colors.CYAN_ACCENT,
                    textDecorationLine: 'underline',
                  }}
                  onPress={() => Linking.openURL(fullUrl)}
                >
                  {part}
                </Text>
              );
            }
            return part;
          })}
        </Text>
      );
    };

    return (
      <View style={styles.messageOuterWrap}>
        {dateSeparator}
        <SwipeableMessageRow item={item} isMyMessage={isMyMessage} onSwipeReply={handleInitiateReply}>
          <TouchableOpacity
            activeOpacity={0.85}
            onLongPress={() => handleMessageLongPress(item)}
            style={[
              styles.messageContainer,
              isMyMessage ? styles.myMessage : styles.theirMessage,
              Boolean(extractedUrl) && styles.linkMessageBubble,
              isHighlighted && styles.highlightedMessageBubble,
            ]}
          >
            {/* Quoted Reply Banner */}
            {item.replyTo && (
              <QuotedMessageReply
                replyTo={item.replyTo}
                isMyMessage={isMyMessage}
                onScrollToMessage={handleScrollToMessage}
                allMessages={messages}
                currentUserId={auth().currentUser?.uid}
                fallbackUsername={otherUsername}
              />
            )}

            {/* 1. Rich Link Preview on TOP (flush edge-to-edge) */}
            {Boolean(extractedUrl) && (
              <LinkPreviewCard
                url={extractedUrl}
                navigation={navigation}
                isMyMessage={isMyMessage}
                onLongPress={() => handleMessageLongPress(item)}
              />
            )}

            {/* 2. Message Text & Link at the BOTTOM below the preview */}
            <View style={extractedUrl ? styles.linkMessageTextWrap : null}>
              {renderFormattedMessageText(item.text, isMyMessage)}
            </View>

            {/* 3. Footer with timestamp & read receipts */}
            <View style={[styles.messageFooter, Boolean(extractedUrl) && styles.linkMessageFooter]}>
              <Text style={[styles.timestamp, isMyMessage && { color: 'rgba(255, 255, 255, 0.7)' }]}>
                {new Date(item.timestamp || Date.now()).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
              {/* Read / Seen Receipt Checks */}
              {isMyMessage && (
                item.status === 'sending' || item.pending ? (
                  <View style={styles.seenReceiptRow}>
                    <MaterialIcons
                      name="access-time"
                      size={12}
                      color="rgba(255, 255, 255, 0.55)"
                      style={{ marginLeft: 4 }}
                    />
                  </View>
                ) : item.status === 'failed' ? (
                  <View style={styles.seenReceiptRow}>
                    <MaterialIcons
                      name="error-outline"
                      size={13}
                      color={colors.LIVE_RED}
                      style={{ marginLeft: 4 }}
                    />
                  </View>
                ) : item.seen || item.status === 'seen' ? (
                  <View style={styles.seenReceiptRow}>
                    <MaterialIcons
                      name="done-all"
                      size={15}
                      color={colors.CYAN_ACCENT}
                      style={{ marginLeft: 4 }}
                    />
                  </View>
                ) : (
                  <View style={styles.seenReceiptRow}>
                    <MaterialIcons
                      name="done"
                      size={14}
                      color="rgba(255, 255, 255, 0.65)"
                      style={{ marginLeft: 4 }}
                    />
                  </View>
                )
              )}
            </View>
          </TouchableOpacity>
        </SwipeableMessageRow>
      </View>
    );
  };

  // ── RENDER MESSAGE ACTION MODAL (Delete / Info) ──
  const renderMessageActionModal = () => {
    if (!selectedMessage) return null;

    const currentUid = auth().currentUser?.uid;
    const isMyMessage = selectedMessage.senderId === currentUid;
    const isDeleted = selectedMessage.deletedForEveryone;

    return (
      <Modal
        visible={showMessageActionModal}
        transparent
        statusBarTranslucent
        animationType="slide"
        onRequestClose={() => {
          setShowMessageActionModal(false);
          setSelectedMessage(null);
        }}
      >
        <TouchableOpacity
          style={styles.actionModalBackdrop}
          activeOpacity={1}
          onPress={() => {
            setShowMessageActionModal(false);
            setSelectedMessage(null);
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[
              styles.actionModalSheet,
              { paddingBottom: Math.max(insets.bottom, 16) + 16 },
            ]}
          >
            {/* Ambient Top Glow Linear Gradient */}
            <View style={styles.sheetTopGlow} pointerEvents="none">
              <LinearGradient
                colors={['rgba(124, 58, 237, 0.16)', 'rgba(0, 122, 255, 0.08)', 'transparent']}
                style={StyleSheet.absoluteFillObject}
              />
            </View>

            {/* Draggable Handle Indicator */}
            <View style={styles.actionHandleBar} />

            {/* Header Row with Close (X) button */}
            <View style={styles.actionSheetHeaderRow}>
              <View style={styles.actionSheetTitleGroup}>
                <MaterialIcons name="more-horiz" size={20} color={colors.PRIMARY_COLOR} />
                <Text style={styles.actionSheetHeading}>Message Options</Text>
              </View>
              <TouchableOpacity
                style={styles.actionSheetCloseBtn}
                onPress={() => {
                  setShowMessageActionModal(false);
                  setSelectedMessage(null);
                }}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="close" size={18} color={colors.SUB_TITLE_COLOR} />
              </TouchableOpacity>
            </View>

            {/* Message Preview Snippet */}
            <View style={styles.actionPreviewWrap}>
              <View style={styles.actionSenderRow}>
                <Text style={styles.actionSenderLabel}>
                  {isMyMessage ? 'You' : otherUsername}
                </Text>
                <Text style={styles.actionTimestampLabel}>
                  {new Date(selectedMessage.timestamp || Date.now()).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
              <Text style={styles.actionPreviewText} numberOfLines={2}>
                {selectedMessage.text}
              </Text>
              {isMyMessage && !isDeleted && (
                <View style={styles.actionSeenStatusRow}>
                  <MaterialIcons
                    name={selectedMessage.seen ? 'done-all' : 'done'}
                    size={14}
                    color={selectedMessage.seen ? colors.CYAN_ACCENT : colors.MUTED_COLOR}
                  />
                  <Text
                    style={[
                      styles.actionSeenStatusText,
                      selectedMessage.seen && { color: colors.CYAN_ACCENT },
                    ]}
                  >
                    {selectedMessage.seen ? `Seen by ${otherUsername}` : 'Delivered (Not seen yet)'}
                  </Text>
                </View>
              )}
            </View>

            {/* Actions List */}
            <View style={styles.actionButtonsList}>
              {/* Delete for Me Button */}
              <TouchableOpacity
                style={styles.actionItemBtn}
                activeOpacity={0.75}
                onPress={handleDeleteForMe}
              >
                <View style={styles.actionIconWrap}>
                  <MaterialIcons name="delete-outline" size={20} color={colors.TITLE_COLOR} />
                </View>
                <View style={styles.actionItemTextGroup}>
                  <Text style={styles.actionItemTitle}>Delete for me</Text>
                  <Text style={styles.actionItemSubtitle}>Remove this message from your device</Text>
                </View>
              </TouchableOpacity>

              {/* Delete for Everyone Button (Only available if sender of message) */}
              {isMyMessage && !isDeleted && (
                <TouchableOpacity
                  style={styles.actionItemBtn}
                  activeOpacity={0.75}
                  onPress={handleDeleteForEveryone}
                >
                  <View style={[styles.actionIconWrap, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                    <MaterialIcons name="delete-forever" size={20} color={colors.LIVE_RED} />
                  </View>
                  <View style={styles.actionItemTextGroup}>
                    <Text style={[styles.actionItemTitle, { color: colors.LIVE_RED }]}>
                      Delete for everyone
                    </Text>
                    <Text style={styles.actionItemSubtitle}>
                      Remove message for all participants
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  };

  // Render Attachment Bottom Sheet Modal
  const renderAttachmentModal = () => {
    const attachments = [
      {
        icon: 'confirmation-number',
        color: colors.PURPLE_ACCENT,
        label: 'Watch Invite',
        badge: 'LIVE',
        badgeColor: colors.LIVE_RED,
        onPress: () => {
          setShowAttachments(false);
          setTimeout(() => {
            handleTriggerWatchPartyInvite();
          }, 300);
        },
      },
      {
        icon: 'camera-alt',
        color: colors.PRIMARY_COLOR,
        label: 'Camera',
        onPress: handlePickCamera,
      },
      {
        icon: 'photo-library',
        color: colors.CYAN_ACCENT,
        label: 'Photos',
        onPress: handlePickGallery,
      },
      {
        icon: 'mic',
        color: '#FF9500',
        label: 'Audio Note',
        onPress: () => {
          setShowAttachments(false);
          Alert.alert('Audio Note', 'Record voice message');
        },
      },
      {
        icon: 'location-on',
        color: colors.ACCEPT_GREEN,
        label: 'Location',
        onPress: () => {
          setShowAttachments(false);
          Alert.alert('Location', 'Share live location with friend');
        },
      },
      {
        icon: 'insert-drive-file',
        color: colors.FILM_GOLD,
        label: 'Document',
        onPress: () => {
          setShowAttachments(false);
          Alert.alert('Document', 'Attach document or file');
        },
      },
      {
        icon: 'person-add',
        color: '#EC4899',
        label: 'Contact',
        onPress: () => {
          setShowAttachments(false);
          Alert.alert('Contact Card', 'Share contact details');
        },
      },
      {
        icon: 'movie',
        color: '#8B5CF6',
        label: 'Movie Pick',
        badge: 'SYNC',
        badgeColor: colors.PRIMARY_COLOR,
        onPress: () => {
          setShowAttachments(false);
          setTimeout(() => {
            handleTriggerWatchPartyInvite();
          }, 300);
        },
      },
    ];

    return (
      <Modal
        visible={showAttachments}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAttachments(false)}
        statusBarTranslucent
      >
        <View style={styles.modalBackdrop}>
          {/* Backdrop overlay: tapping outside closes the bottom sheet */}
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setShowAttachments(false)}
          />

          {/* Bottom Sheet Card */}
          <View
            style={[
              styles.attachmentModalSheet,
              { paddingBottom: Math.max(insets.bottom, 16) + 10 },
            ]}
          >
            {/* Sheet handle bar indicator */}
            <View style={styles.modalHandleBar} />

            {/* Modal Header */}
            <View style={styles.attachmentPanelHeader}>
              <View style={styles.headerTitleCol}>
                <Text style={styles.attachmentPanelTitle}>Media & Attachments</Text>
                <Text style={styles.attachmentPanelSubtitle}>
                  Choose an option to share or host a Watch Party
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setShowAttachments(false)}
                activeOpacity={0.8}
              >
                <MaterialIcons name="close" size={18} color={colors.SUB_TITLE_COLOR} />
              </TouchableOpacity>
            </View>

            {/* Grid of Attachment Options (Guaranteed 4 items per row x 2 rows) */}
            <View style={styles.attachmentGrid}>
              {attachments.map((att, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.attachmentItem}
                  activeOpacity={0.75}
                  onPress={att.onPress}
                >
                  <View
                    style={[
                      styles.attachmentButtonCircle,
                      { backgroundColor: att.color + '18', borderColor: att.color + '4D' },
                    ]}
                  >
                    <MaterialIcons name={att.icon} size={25} color={att.color} />
                    {att.badge && (
                      <View style={[styles.itemBadge, { backgroundColor: att.badgeColor || colors.LIVE_RED }]}>
                        <Text style={styles.itemBadgeText}>{att.badge}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.attachmentLabelText} numberOfLines={1}>
                    {att.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  // ── 1. RENDER STITCH AI VIDEO CALL VIEW (Live Screening Call) ──
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

          {/* Top Vignette Gradient for Status Contrast */}
          <LinearGradient
            colors={['rgba(8, 8, 16, 0.92)', 'rgba(8, 8, 16, 0.45)', 'transparent']}
            style={videoCallStyles.topVignette}
            pointerEvents="none"
          />

          {/* Bottom Vignette Gradient for Controls Contrast */}
          <LinearGradient
            colors={['transparent', 'rgba(8, 8, 16, 0.6)', 'rgba(8, 8, 16, 0.95)']}
            style={videoCallStyles.bottomVignette}
            pointerEvents="none"
          />
        </View>

        {/* ── TOP BAR AREA: MINIMIZE, E2EE, SYNC CTA & TELEMETRY ── */}
        <View style={[videoCallStyles.topHeaderWrap, { paddingTop: safeTopPadding }]}>
          {/* Top Row: Minimize + E2EE + Sync Screening CTA */}
          <View style={videoCallStyles.topActionRow}>
            {/* Left: Minimize / Floating Window Button */}
            <TouchableOpacity
              style={videoCallStyles.glassRoundBtn}
              onPress={() => setIsCallMinimized(true)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="keyboard-arrow-down" size={26} color="#FFF" />
            </TouchableOpacity>

            {/* Right: E2EE Badge + Screening Sync CTA */}
            <View style={videoCallStyles.topRightActions}>
              {/* End-to-End Encryption Badge */}
              <View style={videoCallStyles.e2eeBadge}>
                <MaterialIcons name="lock" size={12} color={colors.ACCEPT_GREEN} />
                <Text style={videoCallStyles.e2eeText}>E2EE</Text>
              </View>

              {/* Watch Screening Action CTA */}
              <TouchableOpacity
                style={videoCallStyles.syncScreeningBtn}
                activeOpacity={0.85}
                onPress={handleTriggerWatchPartyInvite}
              >
                <LinearGradient
                  colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={videoCallStyles.syncScreeningGradient}
                >
                  <Text style={videoCallStyles.syncScreeningText}>Sync Screening</Text>
                  <Text style={{ fontSize: 13 }}>🎬</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>

          {/* Caller Profile Card & Telemetry Panel */}
          <View style={videoCallStyles.callerTelemetryCard}>
            {/* Top Row: Name, Host Badge, Call Duration Timer */}
            <View style={videoCallStyles.callerTopRow}>
              <View style={videoCallStyles.callerNameGroup}>
                <Text style={videoCallStyles.callerNameText} numberOfLines={1}>
                  {username}
                </Text>
                <View style={videoCallStyles.hostMiniBadge}>
                  <Text style={videoCallStyles.hostMiniBadgeText}>★ HOST</Text>
                </View>
              </View>

              {/* Live Call Timer Pill with Pulsing Red Dot */}
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

            {/* Bottom Row: Realtime Audio Spectrum & WebRTC Latency */}
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

              {/* WebRTC Latency Telemetry */}
              <View style={videoCallStyles.webrtcTelemetry}>
                <Text style={videoCallStyles.telemetrySpecs}>1080p 60fps</Text>
                <Text style={videoCallStyles.telemetryDot}>•</Text>
                <Text style={videoCallStyles.latencyText}>14ms</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── FLOATING LOCAL CAMERA PIP (Picture-in-Picture) ── */}
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

          {/* "You" Badge Indicator */}
          <View style={videoCallStyles.youBadge}>
            <View style={videoCallStyles.youDot} />
            <Text style={videoCallStyles.youBadgeText}>You</Text>
          </View>

          {/* Self Mic Speaking Wavelet Glow */}
          {!isMuted && (
            <View style={videoCallStyles.localWavelets}>
              <View style={[videoCallStyles.localWaveBar, { height: 7 }]} />
              <View style={[videoCallStyles.localWaveBar, { height: 11 }]} />
            </View>
          )}

          {/* Quick Camera Flip Overlay Icon */}
          <TouchableOpacity
            style={videoCallStyles.flipCameraBtn}
            onPress={switchCamera}
            activeOpacity={0.7}
          >
            <MaterialIcons name="flip-camera-ios" size={13} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* ── MID-OVERLAY: CINE-SYNC WATCH PARTY QUEUE & REACTIONS ── */}
        <View style={videoCallStyles.midOverlayArea}>
          {/* Cine-Sync Watch Party Queue Ribbon */}
          <View style={videoCallStyles.watchPartyRibbon}>
            <LinearGradient
              colors={['rgba(8, 8, 16, 0.92)', 'rgba(21, 18, 46, 0.88)', 'rgba(8, 8, 16, 0.92)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={videoCallStyles.watchPartyRibbonInner}
            >
              <View style={videoCallStyles.ribbonLeft}>
                <View style={videoCallStyles.ribbonPopcornIcon}>
                  <Text style={{ fontSize: 16 }}>🍿</Text>
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
                onPress={handleTriggerWatchPartyInvite}
              >
                <Text style={videoCallStyles.ribbonStartBtnText}>Invite</Text>
                <MaterialIcons name="arrow-forward" size={12} color="#FFF" />
              </TouchableOpacity>
            </LinearGradient>
          </View>

          {/* Quick Floating Reactions Bar */}
          <View style={videoCallStyles.reactionsRow}>
            <View style={videoCallStyles.reactionsPill}>
              {['🍿', '🔥', '🚀', '❤️', '👏'].map((emoji, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={videoCallStyles.reactionMiniBtn}
                  onPress={() => sendReaction(emoji)}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 17 }}>{emoji}</Text>
                </TouchableOpacity>
              ))}
              <View style={videoCallStyles.reactionDivider} />
              <TouchableOpacity
                style={videoCallStyles.reactionPlusBtn}
                onPress={() => sendReaction('🎉')}
                activeOpacity={0.7}
              >
                <Text style={videoCallStyles.reactionPlusText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── BOTTOM ACTION CONTROL ISLAND (Glass Capsule Dock) ── */}
        <View style={[videoCallStyles.bottomControlsWrap, { paddingBottom: Math.max(insets.bottom, 16) + 6 }]}>
          <View style={videoCallStyles.glassIslandDock}>
            {/* Mic Control */}
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

            {/* Video Camera Toggle */}
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

            {/* Audio Output Speaker */}
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

            {/* Cine Watch Mode Button */}
            <TouchableOpacity
              style={videoCallStyles.islandActionBtn}
              onPress={handleTriggerWatchPartyInvite}
              activeOpacity={0.75}
            >
              <View style={[videoCallStyles.islandCircleBtn, videoCallStyles.islandCircleActivePurple]}>
                <MaterialIcons name="movie" size={20} color="#D8B4FE" />
              </View>
              <Text style={[videoCallStyles.islandLabel, { color: '#D8B4FE' }]}>Sync</Text>
            </TouchableOpacity>

            {/* End Video Call Button */}
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

  // ── 2. RENDER STITCH AI AUDIO CALL VIEW ──
  const renderAudioCallView = () => {
    const username = otherUsername;
    const avatarUri = otherAvatar || null;
    const isVideo = callType === 'video';

    return (
      <View style={StyleSheet.absoluteFillObject}>
        {/* Ambient Top Glow matching LoginScreen */}
        <View style={callStyles.ambientTopGlow} pointerEvents="none">
          <LinearGradient
            colors={['rgba(124, 58, 237, 0.22)', 'rgba(0, 122, 255, 0.10)', 'transparent']}
            style={StyleSheet.absoluteFillObject}
          />
        </View>

        {/* Top Safe-Area Bar: Minimize + Encrypted + HD Audio */}
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

        {/* Central Profile Stage */}
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
                <Text style={callStyles.hostBadgeText}>★ HOST</Text>
              </View>
            </View>
            <Text style={callStyles.callerSubtitle}>
              @{username} • Cine-Sync Room
            </Text>
          </View>

          {/* Timer and Equalizer only displayed once call is connected/received */}
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
                  <Text style={{ fontSize: 18 }}>🍿</Text>
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
                onPress={handleTriggerWatchPartyInvite}
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
              {['❤️', '🔥', '👏', '🍿', '🚀'].map((emoji, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={callStyles.reactionBtn}
                  onPress={() => sendReaction(emoji)}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 17 }}>{emoji}</Text>
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

  // ── 3. UNIFIED CALL MODAL ──
  const renderCallModal = () => {
    const isVisible = callState !== 'idle' && !isCallMinimized;
    const isVideo = callType === 'video';

    return (
      <Modal visible={isVisible} animationType="fade" transparent={false} statusBarTranslucent>
        <View style={callStyles.container}>
          <StatusBar backgroundColor="transparent" barStyle="light-content" translucent />
          {isVideo && callState !== 'incoming' ? renderVideoCallView() : renderAudioCallView()}
        </View>
      </Modal>
    );
  };

  // ── PHOTO PREVIEW & SEND MODAL (Supports Multi-Photo & View-Once 1x Option) ──
  const renderPhotoPreviewModal = () => {
    if (!showPhotoPreviewModal || selectedPhotos.length === 0) return null;

    const currentPhoto = selectedPhotos[activePhotoIndex] || selectedPhotos[0];
    const previewUri = currentPhoto?.previewUri || currentPhoto?.uri;
    const isSinglePhoto = selectedPhotos.length === 1;

    return (
      <Modal
        visible={showPhotoPreviewModal}
        transparent={false}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (!isSendingPhoto) {
            setShowPhotoPreviewModal(false);
            setSelectedPhotos([]);
            setActivePhotoIndex(0);
            setPhotoCaption('');
            setIsViewOnce(false);
          }
        }}
      >
        <View style={styles.photoPreviewSafeContainer}>
          <StatusBar barStyle="light-content" backgroundColor={colors.BACKGROUND_COLOR} translucent />

          {/* Top Bar with safe notch padding */}
          <View style={[styles.photoPreviewHeader, { paddingTop: safeTopPadding }]}>
            <TouchableOpacity
              style={styles.photoPreviewHeaderBtn}
              onPress={() => {
                setShowPhotoPreviewModal(false);
                setSelectedPhotos([]);
                setActivePhotoIndex(0);
                setPhotoCaption('');
                setIsViewOnce(false);
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons name="close" size={24} color={colors.TITLE_COLOR} />
            </TouchableOpacity>

            <View style={styles.photoPreviewHeaderCenter}>
              <Text style={styles.photoPreviewHeaderTitle}>
                {isSinglePhoto
                  ? currentPhoto?.sourceType === 'Camera'
                    ? 'Camera Capture'
                    : 'Photo Preview'
                  : `${selectedPhotos.length} Photos Selected`}
              </Text>
              <View style={styles.photoPreviewTag}>
                <MaterialIcons
                  name={currentPhoto?.sourceType === 'Camera' ? 'photo-camera' : 'photo-library'}
                  size={12}
                  color={colors.CYAN_ACCENT}
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.photoPreviewHeaderSubtitle}>
                  {isSinglePhoto
                    ? currentPhoto?.sourceType === 'Camera'
                      ? 'Direct Capture'
                      : 'From Gallery'
                    : `Photo ${activePhotoIndex + 1} of ${selectedPhotos.length}`}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.photoPreviewHeaderBtn}
              onPress={() => {
                if (selectedPhotos.length <= 1) {
                  setSelectedPhotos([]);
                  setShowPhotoPreviewModal(false);
                  setActivePhotoIndex(0);
                  setPhotoCaption('');
                  setIsViewOnce(false);
                } else {
                  const updated = selectedPhotos.filter((_, i) => i !== activePhotoIndex);
                  setSelectedPhotos(updated);
                  setActivePhotoIndex(Math.max(0, Math.min(activePhotoIndex, updated.length - 1)));
                }
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons name="delete-outline" size={22} color={colors.LIVE_RED} />
            </TouchableOpacity>
          </View>

          {/* Photo Display Card */}
          <View style={styles.photoPreviewImageWrap}>
            {previewUri ? (
              <Image
                ref={photoPreviewImageRef}
                source={{ uri: previewUri }}
                style={styles.photoPreviewImage}
                resizeMode="contain"
              />
            ) : null}
            {isViewOnce && isSinglePhoto && (
              <View style={styles.viewOnceActiveWatermark}>
                <View style={styles.viewOnceWatermarkCircle}>
                  <Text style={styles.viewOnceWatermarkText}>1</Text>
                </View>
                <Text style={styles.viewOnceWatermarkLabel}>View-Once Active</Text>
              </View>
            )}
          </View>

          {/* Bottom Area with Thumbnails, View Once Toggle & Caption Dock */}
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
            style={[styles.photoPreviewBottomArea, { paddingBottom: Math.max(insets.bottom, 16) }]}
          >
            {/* Horizontal thumbnail selector for multi-image preview */}
            {!isSinglePhoto && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.multiPhotoThumbnailScroll}
                contentContainerStyle={styles.multiPhotoThumbnailContent}
              >
                {selectedPhotos.map((photoItem, pIdx) => {
                  const thumbUri = photoItem.previewUri || photoItem.uri;
                  const isActive = pIdx === activePhotoIndex;
                  return (
                    <TouchableOpacity
                      key={`preview_thumb_${pIdx}`}
                      style={[
                        styles.multiPhotoThumbWrap,
                        isActive && styles.multiPhotoThumbWrapActive,
                      ]}
                      onPress={() => setActivePhotoIndex(pIdx)}
                      activeOpacity={0.8}
                    >
                      <Image source={{ uri: thumbUri }} style={styles.multiPhotoThumbImage} resizeMode="cover" />
                      <TouchableOpacity
                        style={styles.multiPhotoRemoveBadge}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        onPress={() => {
                          const updated = selectedPhotos.filter((_, i) => i !== pIdx);
                          if (updated.length === 0) {
                            setShowPhotoPreviewModal(false);
                            setSelectedPhotos([]);
                          } else {
                            setSelectedPhotos(updated);
                            setActivePhotoIndex(Math.max(0, Math.min(activePhotoIndex, updated.length - 1)));
                          }
                        }}
                      >
                        <MaterialIcons name="close" size={10} color="#FFF" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* View Once (1x) Ephemeral Toggle Button - Enabled only for single photo */}
            {isSinglePhoto && (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setIsViewOnce(!isViewOnce)}
                style={[
                  styles.viewOnceToggleBtn,
                  isViewOnce ? styles.viewOnceToggleBtnActive : styles.viewOnceToggleBtnInactive,
                ]}
              >
                <View
                  style={[
                    styles.viewOnceCircleBadge,
                    isViewOnce ? styles.viewOnceCircleBadgeActive : styles.viewOnceCircleBadgeInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.viewOnceCircleText,
                      isViewOnce ? styles.viewOnceCircleTextActive : styles.viewOnceCircleTextInactive,
                    ]}
                  >
                    1
                  </Text>
                </View>

                <View style={styles.viewOnceToggleTextWrap}>
                  <Text
                    style={[
                      styles.viewOnceToggleTitle,
                      isViewOnce ? styles.viewOnceToggleTitleActive : styles.viewOnceToggleTitleInactive,
                    ]}
                  >
                    {isViewOnce ? 'View-Once Enabled' : 'Send as View Once (1x)'}
                  </Text>
                  <Text style={styles.viewOnceToggleSubtitle}>
                    {isViewOnce
                      ? 'Photo can only be opened once by recipient'
                      : 'Tap to make photo expire after one view'}
                  </Text>
                </View>

                <MaterialIcons
                  name={isViewOnce ? 'check-circle' : 'radio-button-unchecked'}
                  size={22}
                  color={isViewOnce ? colors.CYAN_ACCENT : colors.SUB_TITLE_COLOR}
                />
              </TouchableOpacity>
            )}

            {/* Caption Input & Send Action Row */}
            <View style={styles.photoCaptionRow}>
              <View style={styles.photoCaptionInputWrap}>
                <TextInput
                  style={styles.photoCaptionInput}
                  placeholder={isSinglePhoto ? 'Add a caption...' : 'Add a caption for photos...'}
                  placeholderTextColor={colors.MUTED_COLOR}
                  value={photoCaption}
                  onChangeText={setPhotoCaption}
                  multiline={false}
                  returnKeyType="send"
                  onSubmitEditing={handleSendPhoto}
                />
              </View>

              <TouchableOpacity
                style={styles.photoSendBtn}
                onPress={handleSendPhoto}
                activeOpacity={0.85}
                disabled={isSendingPhoto}
              >
                <LinearGradient
                  colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.photoSendGradient}
                >
                  {isSendingPhoto ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <View style={styles.photoSendBtnContent}>
                      {!isSinglePhoto && (
                        <View style={styles.sendPhotosCountBadge}>
                          <Text style={styles.sendPhotosCountText}>{selectedPhotos.length}</Text>
                        </View>
                      )}
                      <MaterialIcons name="send" size={20} color="#FFF" />
                    </View>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    );
  };

  // ── FULLSCREEN IMAGE VIEWER MODAL (Pinch-to-zoom & Swipe Gallery) ──
  const renderImageViewerModal = () => {
    if (!imageViewerState.visible) return null;

    return (
      <ChatImageViewerModal
        visible={imageViewerState.visible}
        images={imageViewerState.images}
        initialIndex={imageViewerState.initialIndex}
        onClose={handleCloseImageViewer}
        otherUsername={otherUsername}
        safeTopPadding={safeTopPadding}
        safeBottomPadding={Math.max(insets.bottom, 20)}
      />
    );
  };

  const renderEmptyChat = () => (
    <View style={[styles.emptyChatWrap, { transform: [{ scaleY: -1 }] }]}>
      <View style={[styles.emptyChatIconBox, isSelfChat && { borderColor: 'rgba(124, 58, 237, 0.4)' }]}>
        <LinearGradient
          colors={
            isSelfChat
              ? [colors.PURPLE_ACCENT, colors.PRIMARY_COLOR]
              : ['rgba(0, 122, 255, 0.25)', 'rgba(124, 58, 237, 0.25)']
          }
          style={styles.emptyChatIconGrad}
        >
          <MaterialIcons
            name={isSelfChat ? 'bookmark' : 'chat-bubble-outline'}
            size={30}
            color="#FFF"
          />
        </LinearGradient>
      </View>
      <Text style={styles.emptyChatTitle}>
        {isSelfChat ? 'Your Personal Space' : 'No messages yet'}
      </Text>
      <Text style={styles.emptyChatSubtext}>
        {isSelfChat
          ? 'Draft messages, save notes, or store stream links. Only you can see these messages.'
          : `Send a message to start conversing with ${otherUsername}.`}
      </Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <StatusBar backgroundColor={colors.BACKGROUND_COLOR} barStyle="light-content" translucent />

      {/* ── TOP 1-ON-1 DIRECT CHAT HEADER BAR ────────────────────── */}
      <View style={[styles.header, { paddingTop: safeTopPadding }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
          >
            <MaterialIcons name="arrow-back-ios-new" size={18} color={colors.TITLE_COLOR} />
          </TouchableOpacity>

          {/* User Avatar & Name with Status Indicator -> Clickable to FriendProfileScreen / ProfileScreen */}
          <TouchableOpacity
            style={styles.headerProfileBtn}
            activeOpacity={0.75}
            onPress={() => {
              if (isSelfChat) {
                navigation.navigate('Profile');
              } else {
                navigation.navigate('FriendProfile', {
                  userId: otherUserId,
                  username: otherUsername,
                  avatar: otherAvatar,
                  status: otherUserStatus,
                });
              }
            }}
          >
            <View style={styles.userAvatarWrap}>
              {isSelfChat ? (
                <LinearGradient
                  colors={[colors.PURPLE_ACCENT, colors.PRIMARY_COLOR]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.userAvatarFallback}
                >
                  <MaterialIcons name="bookmark" size={18} color="#FFF" />
                </LinearGradient>
              ) : otherAvatar ? (
                <Image source={{ uri: otherAvatar }} style={styles.userAvatarImage} />
              ) : (
                <View style={styles.userAvatarFallback}>
                  <Text style={styles.avatarInitial}>{otherUsername[0]?.toUpperCase()}</Text>
                </View>
              )}
              {!isSelfChat && (
                <View
                  style={[
                    styles.userOnlineDot,
                    { backgroundColor: otherUserStatus === 'online' ? colors.ACCEPT_GREEN : colors.MUTED_COLOR },
                  ]}
                />
              )}
            </View>

            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {otherUsername}
              </Text>
              <Text
                style={[
                  styles.headerSubtext,
                  isSelfChat
                    ? { color: colors.CYAN_ACCENT }
                    : isOtherUserTyping
                      ? { color: colors.CYAN_ACCENT, fontWeight: '700' }
                      : (otherUserStatus === 'online' && { color: colors.ACCEPT_GREEN }),
                ]}
              >
                {isSelfChat
                  ? 'Personal Notes & Media'
                  : isOtherUserTyping
                    ? 'typing...'
                    : (otherUserStatus === 'online' ? 'Online' : 'Offline')}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Right Action Icons: Lock Chat, Audio Call, Video Call, Watch Party Invite */}
        <View style={styles.headerRightActions}>
          {!isSelfChat && (
            <>
              {/* Chat Lock Button */}
              <TouchableOpacity
                style={[styles.headerActionBtn, isChatLocked && styles.headerActionBtnLocked]}
                onPress={handleToggleChatLock}
                activeOpacity={0.8}
              >
                <MaterialIcons
                  name={isChatLocked ? 'lock' : 'lock-outline'}
                  size={18}
                  color={isChatLocked ? colors.FILM_GOLD : colors.TITLE_COLOR}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.headerActionBtn}
                onPress={() => startCall('audio')}
                activeOpacity={0.8}
              >
                <MaterialIcons name="call" size={18} color={colors.TITLE_COLOR} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.headerActionBtn}
                onPress={() => startCall('video')}
                activeOpacity={0.8}
              >
                <MaterialIcons name="videocam" size={20} color={colors.TITLE_COLOR} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.headerInviteTicketBtn}
                onPress={handleTriggerWatchPartyInvite}
                activeOpacity={0.8}
              >
                <MaterialIcons name="confirmation-number" size={18} color={colors.PRIMARY_COLOR} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Floating In-Call Mini Bar (when call is active but minimized) */}
      {isCallMinimized && callState !== 'idle' && (
        <TouchableOpacity
          style={callStyles.minimizedCallBanner}
          activeOpacity={0.85}
          onPress={() => setIsCallMinimized(false)}
        >
          <View style={callStyles.minimizedLeft}>
            <View style={callStyles.minimizedDot} />
            <MaterialIcons
              name={callType === 'video' ? 'videocam' : 'call'}
              size={15}
              color={colors.ACCEPT_GREEN}
            />
            <Text style={callStyles.minimizedText}>
              {otherUsername} • {callState === 'calling' ? 'Ringing...' : formatDuration(callDuration)}
            </Text>
          </View>
          <View style={callStyles.minimizedRight}>
            <Text style={callStyles.minimizedReturnText}>Tap to Return</Text>
            <MaterialIcons name="open-in-full" size={13} color={colors.PRIMARY_COLOR} />
          </View>
        </TouchableOpacity>
      )}

      {/* ── CONDITIONAL: LOCKED CHAT SECURITY GUARD OR CHAT MESSAGES ── */}
      {isChatLocked && !isScreenUnlocked ? (
        <View style={styles.chatLockGuardOverlay}>
          <LinearGradient
            colors={['rgba(124, 58, 237, 0.25)', 'rgba(0, 122, 255, 0.10)', 'transparent']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />

          <View style={styles.lockGuardEmblem}>
            <LinearGradient
              colors={[colors.PURPLE_ACCENT, colors.PRIMARY_COLOR]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.lockGuardGradient}
            >
              <MaterialIcons name="lock" size={34} color={colors.FILM_GOLD} />
            </LinearGradient>
          </View>

          <Text style={styles.lockGuardTitle}>Conversation Locked</Text>
          <Text style={styles.lockGuardSubtitle}>
            This chat with @{otherUsername} is protected. Enter your alphanumeric passcode to view messages.
          </Text>

          <TouchableOpacity
            style={styles.lockGuardUnlockBtn}
            activeOpacity={0.85}
            onPress={() => {
              setChatLockModalMode('unlock');
              setChatLockModalVisible(true);
            }}
          >
            <LinearGradient
              colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.lockGuardUnlockGradient}
            >
              <MaterialIcons name="lock-open" size={18} color="#FFF" style={{ marginRight: 8 }} />
              <Text style={styles.lockGuardUnlockText}>Unlock Chat</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* ── CHAT MESSAGES STREAM ───────────────────────────────── */}
          <FlatList
            ref={flatListRef}
            data={invertedMessages}
            inverted
            renderItem={renderMessage}
            keyExtractor={(item) => item.id || `temp_${item.timestamp}`}
            style={styles.messagesList}
            contentContainerStyle={styles.messagesListPadding}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            ListEmptyComponent={renderEmptyChat}
            ListHeaderComponent={
              isOtherUserTyping && !isSelfChat ? (
                <View style={styles.typingIndicatorRow}>
                  <View style={styles.typingIndicatorBubble}>
                    <AnimatedTypingDots />
                    <Text style={styles.typingIndicatorLabel}>{otherUsername} is typing...</Text>
                  </View>
                </View>
              ) : null
            }
            initialNumToRender={20}
            maxToRenderPerBatch={15}
            windowSize={11}
            removeClippedSubviews={false}
            keyboardShouldPersistTaps="handled"
            onScroll={handleScroll}
            scrollEventThrottle={32}
            onScrollToIndexFailed={(info) => {
              const offset = info.averageItemLength
                ? info.averageItemLength * info.index
                : info.index * 80;
              flatListRef.current?.scrollToOffset({
                offset,
                animated: false,
              });
              setTimeout(() => {
                flatListRef.current?.scrollToIndex({
                  index: info.index,
                  animated: true,
                  viewPosition: 0.5,
                });
              }, 100);
            }}
          />

          {/* Attachment Bottom Sheet Modal */}
          {renderAttachmentModal()}

          {/* Message Action Sheet Modal (Delete for me / Delete for everyone) */}
          {renderMessageActionModal()}

          {/* Photo Preview & Send Modal (with View-Once 1x Option) */}
          {renderPhotoPreviewModal()}

          {/* Fullscreen Photo Lightbox Modal */}
          {renderImageViewerModal()}

          {/* Floating Jump to Latest Message Button */}
          {showScrollBottomBtn && (
            <Animated.View
              style={[
                styles.floatingScrollBottomWrap,
                {
                  opacity: scrollBottomBtnAnim,
                  transform: [
                    {
                      scale: scrollBottomBtnAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.75, 1],
                      }),
                    },
                  ],
                },
              ]}
              pointerEvents={showScrollBottomBtn ? 'auto' : 'none'}
            >
              <TouchableOpacity
                style={styles.floatingScrollBottomBtn}
                onPress={handleJumpToLatest}
                activeOpacity={0.82}
              >
                <MaterialIcons name="keyboard-arrow-down" size={24} color={colors.CYAN_ACCENT} />
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* ── FLOATING BOTTOM CHAT INPUT BAR ───────────────────────── */}
          <View
            style={[
              styles.bottomInputDock,
              {
                paddingBottom: isKeyboardVisible
                  ? 8
                  : Math.max(insets.bottom, 12),
              },
            ]}
          >
            {/* Replying to Message Preview Bar */}
            {replyingToMessage && (
              <View style={styles.replyDockBar}>
                <View style={styles.replyAccentIndicator} />
                <View style={styles.replyContentColumn}>
                  <View style={styles.replyHeaderLine}>
                    <MaterialIcons name="reply" size={14} color={colors.CYAN_ACCENT} style={{ marginRight: 4 }} />
                    <Text style={styles.replyTargetUserText}>
                      Replying to {replyingToMessage.senderId === auth().currentUser?.uid ? 'yourself' : otherUsername}
                    </Text>
                  </View>
                  <Text style={styles.replySnippetText} numberOfLines={1}>
                    {replyingToMessage.type === 'image' || replyingToMessage.type === 'photo'
                      ? (replyingToMessage.caption ? `📷 ${replyingToMessage.caption}` : '📷 Photo')
                      : (replyingToMessage.text || 'Message')}
                  </Text>
                </View>
                {Boolean(replyingToMessage.imageUri) && (
                  <Image
                    source={{ uri: replyingToMessage.imageUri }}
                    style={styles.replyDockThumbnail}
                    resizeMode="cover"
                  />
                )}
                <TouchableOpacity
                  style={styles.replyDismissButton}
                  onPress={() => setReplyingToMessage(null)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="close" size={18} color="rgba(255, 255, 255, 0.7)" />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.inputBarInner}>
              <TouchableOpacity
                style={[styles.attachBtn, showAttachments && styles.attachBtnActive]}
                onPress={() => {
                  Keyboard.dismiss();
                  setShowAttachments(!showAttachments);
                }}
                activeOpacity={0.8}
              >
                <MaterialIcons
                  name={showAttachments ? 'close' : 'add'}
                  size={22}
                  color={showAttachments ? colors.PRIMARY_COLOR : colors.TITLE_COLOR}
                />
              </TouchableOpacity>

              <View style={styles.inputContainer}>
                <TextInput
                  ref={messageInputRef}
                  style={styles.textInput}
                  placeholder={
                    replyingToMessage
                      ? 'Type your reply...'
                      : isSelfChat
                        ? 'Message yourself (Notes)...'
                        : 'Type a message...'
                  }
                  placeholderTextColor={colors.MUTED_COLOR}
                  value={message}
                  onChangeText={handleMessageTextChange}
                  multiline
                />
                {/* <TouchableOpacity style={styles.emojiBtn} activeOpacity={0.8}>
                  <MaterialIcons name="sentiment-satisfied" size={20} color={colors.SUB_TITLE_COLOR} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.micBtn} activeOpacity={0.8}>
                  <MaterialIcons name="mic" size={20} color={colors.CYAN_ACCENT} />
                </TouchableOpacity> */}
              </View>

              <TouchableOpacity
                style={styles.sendBtnWrap}
                onPress={sendMessage}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.sendBtnGradient}
                >
                  <MaterialIcons name="send" size={18} color="#FFF" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>

          {/* Android Keyboard Dynamic Spacer */}
          {Platform.OS === 'android' && (
            <Animated.View style={{ height: keyboardHeightAnim }} />
          )}
        </>
      )}

      {/* Call Modal */}
      {renderCallModal()}

      {/* Alphanumeric Chat Lock Bottom Sheet */}
      <ChatLockBottomSheet
        visible={chatLockModalVisible}
        mode={chatLockModalMode}
        userName={otherUsername}
        onSuccess={async () => {
          const currentUid = auth().currentUser?.uid;
          if (chatLockModalMode === 'setup') {
            if (currentUid && otherUserId) {
              const effectiveChatId = chatId || chatIdRef.current || route.params?.chatId;
              await lockChatForUser(currentUid, otherUserId, effectiveChatId);
              setIsChatLocked(true);
              setIsScreenUnlocked(true);
              markSessionUnlocked(otherUserId);
              showCineAlert({
                title: 'Chat Locked',
                message: `@${otherUsername} is now locked and protected with passcode.`,
                type: 'success',
              });
            }
          } else if (chatLockModalMode === 'remove') {
            if (currentUid && otherUserId) {
              const effectiveChatId = chatId || chatIdRef.current || route.params?.chatId;
              await unlockChatForUser(currentUid, otherUserId, effectiveChatId);
              setIsChatLocked(false);
              setIsScreenUnlocked(true);
              showCineAlert({
                title: 'Chat Unlocked',
                message: `@${otherUsername} is now unlocked and accessible from your main chats.`,
                type: 'success',
              });
            }
          } else {
            // Unlock mode
            setIsScreenUnlocked(true);
            if (otherUserId) markSessionUnlocked(otherUserId);
          }
          setChatLockModalVisible(false);
        }}
        onClose={() => setChatLockModalVisible(false)}
      />
    </KeyboardAvoidingView>
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

  // ── Header Bar ────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: colors.BACKGROUND_COLOR,
    borderBottomWidth: 1,
    borderBottomColor: colors.BORDER_SUBTLE,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarWrap: {
    position: 'relative',
  },
  userAvatarImage: {
    width: 38,
    height: 38,
    borderRadius: 12,
  },
  userAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.PRIMARY_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  userOnlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.BACKGROUND_COLOR,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 16,
    fontWeight: '800',
  },
  headerSubtext: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },

  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInviteTicketBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
  },
  headerActionBtnLocked: {
    borderColor: 'rgba(255, 180, 0, 0.4)',
    backgroundColor: 'rgba(255, 180, 0, 0.12)',
  },

  // ── Chat Lock Guard Overlay ────────
  chatLockGuardOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: colors.BACKGROUND_COLOR,
  },
  lockGuardEmblem: {
    width: 76,
    height: 76,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 0, 0.35)',
    shadowColor: colors.FILM_GOLD,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  lockGuardGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockGuardTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 8,
    textAlign: 'center',
  },
  lockGuardSubtitle: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 28,
  },
  lockGuardUnlockBtn: {
    width: '100%',
    maxWidth: 240,
    height: 48,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  lockGuardUnlockGradient: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  lockGuardUnlockText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ── Messages Stream ───────────────
  messagesList: {
    flex: 1,
  },
  messagesListPadding: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    paddingBottom: 12,
  },
  // ── Realtime Typing Indicator & Micro-Animation Dots ──
  typingDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.CYAN_ACCENT,
    marginHorizontal: 2.5,
  },
  typingIndicatorRow: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    alignItems: 'flex-start',
  },
  typingIndicatorBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.22)',
  },
  typingIndicatorLabel: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    fontWeight: '500',
  },
  emptyChatWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  emptyChatIconBox: {
    width: 64,
    height: 64,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  emptyChatIconGrad: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyChatTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyChatSubtext: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  dateSeparator: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    marginVertical: 14,
  },
  dateLine: {
    display: 'none',
  },
  dateText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  messageOuterWrap: {
    marginVertical: 4,
  },
  messageContainer: {
    maxWidth: '82%',
    padding: 12,
    borderRadius: 18,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: colors.PRIMARY_COLOR,
    borderBottomRightRadius: 4,
  },
  theirMessage: {
    alignSelf: 'flex-start',
    backgroundColor: colors.SURFACE_COLOR,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
  },
  messageText: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    lineHeight: 20,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  timestamp: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 10,
  },
  seenReceiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // ── Unified Link Preview Message Bubble (Edge-to-Edge, No Double Card) ──
  linkMessageBubble: {
    padding: 0,
    overflow: 'hidden',
    minWidth: 260,
    maxWidth: '85%',
  },
  linkMessageTextWrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  linkMessageFooter: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 0,
  },

  // ── Deleted Message Bubble Styles ──
  deletedBubbleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '82%',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  myDeletedBubble: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(22, 22, 37, 0.65)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  theirDeletedBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(15, 15, 26, 0.65)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  deletedBubbleText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 13,
    fontStyle: 'italic',
    flexShrink: 1,
  },
  deletedBubbleTime: {
    color: colors.MUTED_COLOR,
    fontSize: 9,
    marginLeft: 8,
  },

  // ── Message Action Modal (Delete / Options) Styles ──
  actionModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  actionModalSheet: {
    backgroundColor: colors.SURFACE_COLOR,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 18,
    paddingTop: 12,
    overflow: 'hidden',
  },
  actionHandleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  actionSheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  actionSheetTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionSheetHeading: {
    color: colors.TITLE_COLOR,
    fontSize: 15,
    fontWeight: '700',
  },
  actionSheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPreviewWrap: {
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
  },
  actionSenderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  actionSenderLabel: {
    color: colors.PRIMARY_COLOR,
    fontSize: 12,
    fontWeight: '700',
  },
  actionTimestampLabel: {
    color: colors.MUTED_COLOR,
    fontSize: 10,
  },
  actionPreviewText: {
    color: colors.TITLE_COLOR,
    fontSize: 13,
    lineHeight: 18,
  },
  actionSeenStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  actionSeenStatusText: {
    fontSize: 11,
    color: colors.MUTED_COLOR,
    fontWeight: '500',
  },
  actionButtonsList: {
    gap: 8,
  },
  actionItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  actionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  actionItemTextGroup: {
    flex: 1,
  },
  actionItemTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '600',
  },
  actionItemSubtitle: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    marginTop: 2,
  },

  // Embedded Watch Party Invite Tile (Faded Card UI matching FriendsScreen & HomeScreen)
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

  // ── ATTACHMENT BOTTOM SHEET MODAL ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 4, 10, 0.72)',
    justifyContent: 'flex-end',
  },
  attachmentModalSheet: {
    backgroundColor: colors.SURFACE_ELEVATED,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 8,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 24,
  },
  modalHandleBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  attachmentPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingHorizontal: 12,
  },
  headerTitleCol: {
    flex: 1,
    paddingRight: 8,
  },
  attachmentPanelTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  attachmentPanelSubtitle: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.SURFACE_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  attachmentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: 4,
  },
  attachmentItem: {
    width: '25%',
    alignItems: 'center',
    paddingVertical: 10,
  },
  attachmentButtonCircle: {
    width: 56,
    height: 56,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    position: 'relative',
  },
  itemBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  itemBadgeText: {
    color: '#FFF',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  attachmentLabelText: {
    color: colors.TITLE_COLOR,
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 7,
    textAlign: 'center',
    letterSpacing: 0.2,
  },

  // ── Floating Jump To Latest Button ──
  floatingScrollBottomWrap: {
    position: 'absolute',
    right: 16,
    bottom: 74,
    zIndex: 99,
    elevation: 8,
  },
  floatingScrollBottomBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_ELEVATED,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 6,
  },

  // ── Bottom Input Dock ─────────────
  bottomInputDock: {
    backgroundColor: colors.BACKGROUND_COLOR,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.BORDER_SUBTLE,
  },
  inputBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  attachBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachBtnActive: {
    backgroundColor: 'rgba(0, 122, 255, 0.2)',
    borderWidth: 1,
    borderColor: colors.PRIMARY_COLOR,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 20,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
  },
  textInput: {
    flex: 1,
    color: colors.TITLE_COLOR,
    fontSize: 14,
    paddingVertical: 0,
  },
  emojiBtn: {
    padding: 4,
  },
  micBtn: {
    padding: 4,
  },
  sendBtnWrap: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  sendBtnGradient: {
    width: 42,
    height: 42,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── VIEW-ONCE EPHEMERAL PHOTO MESSAGE BUBBLES ──
  viewOnceBubble: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    marginVertical: 4,
    maxWidth: SCREEN_WIDTH * 0.76,
    borderWidth: 1,
  },
  myViewOnceBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.PRIMARY_COLOR,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomRightRadius: 4,
  },
  theirViewOnceBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.SURFACE_ELEVATED,
    borderColor: 'rgba(6, 182, 212, 0.35)',
    borderBottomLeftRadius: 4,
  },
  viewOnceBubbleOpened: {
    backgroundColor: 'rgba(22, 22, 37, 0.75)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    opacity: 0.8,
  },
  viewOnceContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewOnceBadgeCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewOnceBadgeCircleMy: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderColor: '#FFFFFF',
  },
  viewOnceBadgeCircleTheir: {
    backgroundColor: 'rgba(6, 182, 212, 0.18)',
    borderColor: colors.CYAN_ACCENT,
  },
  viewOnceBadgeCircleOpened: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  viewOnceBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  viewOnceBadgeTextOpened: {
    color: colors.SUB_TITLE_COLOR,
  },
  viewOnceTextCol: {
    marginLeft: 10,
    flex: 1,
  },
  viewOnceTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  viewOnceTitleOpened: {
    color: colors.SUB_TITLE_COLOR,
  },
  viewOnceSubtext: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 11,
    marginTop: 2,
  },
  viewOnceFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 6,
  },
  viewOnceTimestamp: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.65)',
  },

  // ── CALL LOG MESSAGE TILE (WhatsApp Style) ──
  callTileCard: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    marginVertical: 4,
    minWidth: SCREEN_WIDTH * 0.62,
    maxWidth: SCREEN_WIDTH * 0.78,
    borderWidth: 1,
  },
  myCallTileCard: {
    alignSelf: 'flex-end',
    backgroundColor: colors.SURFACE_ELEVATED,
    borderColor: 'rgba(0, 122, 255, 0.28)',
    borderBottomRightRadius: 4,
  },
  theirCallTileCard: {
    alignSelf: 'flex-start',
    backgroundColor: colors.SURFACE_COLOR,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomLeftRadius: 4,
  },
  callTileMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  callTileIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  callTileTextCol: {
    flex: 1,
    justifyContent: 'center',
  },
  callTileTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  callTileSubtitle: {
    fontSize: 12,
    color: colors.SUB_TITLE_COLOR,
    fontWeight: '500',
  },
  callTileCallbackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.25)',
  },
  callTileFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 2,
  },
  callTileTimestamp: {
    fontSize: 10,
    color: colors.SUB_TITLE_COLOR,
  },

  // ── REGULAR IMAGE MESSAGE CARDS (SEAMLESS DISPLAY) ──
  imageMessageCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginVertical: 4,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  myImageMessageCard: {
    alignSelf: 'flex-end',
    backgroundColor: colors.SURFACE_ELEVATED,
    borderColor: 'rgba(0, 122, 255, 0.35)',
    borderBottomRightRadius: 4,
  },
  theirImageMessageCard: {
    alignSelf: 'flex-start',
    backgroundColor: colors.SURFACE_COLOR,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomLeftRadius: 4,
  },
  imageThumbnail: {
    backgroundColor: '#05050A',
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
  },
  imagePlaceholder: {
    backgroundColor: colors.SURFACE_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 15,
  },
  imagePlaceholderText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    marginTop: 6,
  },
  whatsappProgressOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  whatsappProgressCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15, 15, 26, 0.70)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.20)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  imageCaptionText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 18,
    marginBottom: 4,
  },
  imageCaptionSection: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  imageCardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingTop: 2,
  },
  imageTimestamp: {
    fontSize: 10,
    color: colors.SUB_TITLE_COLOR,
  },
  imageFloatingTimestampPill: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(8, 8, 16, 0.65)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  imageFloatingTimestampText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  imageCardQuotedWrap: {
    flexDirection: 'row',
    margin: 6,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },

  // ── SWIPE TO REPLY STYLES ──
  swipeReplyActionBox: {
    width: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  swipeReplyIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(6, 182, 212, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  replyDockBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    marginHorizontal: 10,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    paddingVertical: 6,
    paddingRight: 10,
    overflow: 'hidden',
  },
  replyAccentIndicator: {
    width: 4,
    alignSelf: 'stretch',
    backgroundColor: colors.CYAN_ACCENT,
  },
  replyContentColumn: {
    flex: 1,
    paddingHorizontal: 10,
  },
  replyHeaderLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  replyTargetUserText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.CYAN_ACCENT,
  },
  replySnippetText: {
    fontSize: 12,
    color: colors.TITLE_COLOR,
    opacity: 0.85,
  },
  replyDismissButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quotedReplyWrap: {
    flexDirection: 'row',
    borderRadius: 8,
    marginBottom: 6,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    alignItems: 'center',
  },
  myQuotedReplyWrap: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  theirQuotedReplyWrap: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  quotedReplyBar: {
    width: 3.5,
    alignSelf: 'stretch',
  },
  myQuotedReplyBar: {
    backgroundColor: '#FFFFFF',
  },
  theirQuotedReplyBar: {
    backgroundColor: colors.CYAN_ACCENT,
  },
  quotedReplyContent: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    justifyContent: 'center',
  },
  quotedReplyUser: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.CYAN_ACCENT,
    marginBottom: 1,
  },
  quotedReplyUserMine: {
    color: '#FFFFFF',
  },
  quotedReplySnippet: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  quotedReplySnippetMine: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
  quotedReplyThumbnail: {
    width: 42,
    height: 42,
    borderRadius: 6,
    marginRight: 4,
    marginVertical: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  quotedReplyThumbnailPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 6,
    marginRight: 4,
    marginVertical: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  replyDockThumbnail: {
    width: 38,
    height: 38,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  highlightedMessageBubble: {
    borderWidth: 1.5,
    borderColor: colors.CYAN_ACCENT,
    shadowColor: colors.CYAN_ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 10,
    elevation: 8,
  },

  // ── MULTI-PHOTO PREVIEW STYLES ──
  multiPhotoThumbnailScroll: {
    maxHeight: 64,
    marginVertical: 8,
    paddingHorizontal: 12,
  },
  multiPhotoThumbnailContent: {
    alignItems: 'center',
  },
  multiPhotoThumbWrap: {
    width: 52,
    height: 52,
    borderRadius: 10,
    marginRight: 8,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  multiPhotoThumbWrapActive: {
    borderColor: colors.CYAN_ACCENT,
    borderWidth: 2,
  },
  multiPhotoThumbImage: {
    width: '100%',
    height: '100%',
  },
  multiPhotoRemoveBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoSendBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendPhotosCountBadge: {
    backgroundColor: colors.CYAN_ACCENT,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginRight: 4,
  },
  sendPhotosCountText: {
    color: '#080810',
    fontSize: 11,
    fontWeight: '800',
  },

  // ── PHOTO PREVIEW MODAL ──
  photoPreviewSafeContainer: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
  },
  photoPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.BACKGROUND_COLOR,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  photoPreviewHeaderBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.SURFACE_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  photoPreviewHeaderCenter: {
    alignItems: 'center',
  },
  photoPreviewHeaderTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 16,
    fontWeight: '700',
  },
  photoPreviewTag: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  photoPreviewHeaderSubtitle: {
    color: colors.CYAN_ACCENT,
    fontSize: 12,
    fontWeight: '500',
  },
  photoPreviewImageWrap: {
    flex: 1,
    marginHorizontal: 14,
    marginVertical: 12,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#05050A',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  photoPreviewImage: {
    width: '100%',
    height: '100%',
  },
  viewOnceActiveWatermark: {
    position: 'absolute',
    top: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(8, 8, 16, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.CYAN_ACCENT,
  },
  viewOnceWatermarkCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.CYAN_ACCENT,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  viewOnceWatermarkText: {
    color: '#080810',
    fontSize: 11,
    fontWeight: '900',
  },
  viewOnceWatermarkLabel: {
    color: colors.CYAN_ACCENT,
    fontSize: 12,
    fontWeight: '700',
  },
  photoPreviewBottomArea: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.SURFACE_COLOR,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  viewOnceToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  viewOnceToggleBtnActive: {
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderColor: colors.CYAN_ACCENT,
  },
  viewOnceToggleBtnInactive: {
    backgroundColor: colors.SURFACE_ELEVATED,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  viewOnceCircleBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  viewOnceCircleBadgeActive: {
    backgroundColor: colors.CYAN_ACCENT,
    borderColor: colors.CYAN_ACCENT,
  },
  viewOnceCircleBadgeInactive: {
    backgroundColor: 'transparent',
    borderColor: colors.SUB_TITLE_COLOR,
  },
  viewOnceCircleText: {
    fontSize: 14,
    fontWeight: '900',
  },
  viewOnceCircleTextActive: {
    color: '#080810',
  },
  viewOnceCircleTextInactive: {
    color: colors.SUB_TITLE_COLOR,
  },
  viewOnceToggleTextWrap: {
    flex: 1,
    marginLeft: 12,
  },
  viewOnceToggleTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  viewOnceToggleTitleActive: {
    color: colors.CYAN_ACCENT,
  },
  viewOnceToggleTitleInactive: {
    color: colors.TITLE_COLOR,
  },
  viewOnceToggleSubtitle: {
    fontSize: 11,
    color: colors.SUB_TITLE_COLOR,
    marginTop: 2,
  },
  photoCaptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  photoCaptionInputWrap: {
    flex: 1,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginRight: 10,
  },
  photoCaptionInput: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    padding: 0,
  },
  photoSendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  photoSendGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── FULLSCREEN IMAGE VIEWER MODAL ──
  fullscreenSafeContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  fullscreenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    zIndex: 10,
  },
  fullscreenCloseBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenHeaderCenter: {
    flex: 1,
    alignItems: 'center',
  },
  fullscreenHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  fullscreenViewOnceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.CYAN_ACCENT,
  },
  fullscreenViewOnceCircleBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.CYAN_ACCENT,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  fullscreenViewOnceCircleText: {
    color: '#080810',
    fontSize: 12,
    fontWeight: '900',
  },
  fullscreenViewOnceBadgeText: {
    color: colors.CYAN_ACCENT,
    fontSize: 13,
    fontWeight: '700',
  },
  fullscreenImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  fullscreenFullImage: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
  fullscreenFooter: {
    paddingHorizontal: 16,
    zIndex: 10,
  },
  fullscreenViewOnceWarningPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 180, 0, 0.15)',
    borderWidth: 1,
    borderColor: colors.FILM_GOLD,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginBottom: 10,
  },
  fullscreenViewOnceWarningText: {
    color: colors.FILM_GOLD,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  fullscreenCaptionBox: {
    backgroundColor: 'rgba(15, 15, 26, 0.85)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  fullscreenCaptionText: {
    color: '#FFFFFF',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 19,
  },
});

// ── CALL MODAL & IN-CALL STYLES (Stitch AI Design) ───────────
const callStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
  },

  // ── Ambient Background matching LoginScreen ──
  ambientTopGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 380,
  },

  // ── Video Stream Views ──
  remoteVideo: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  remoteVideoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlaceholderText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 14,
    marginTop: 10,
  },
  localVideoWrapper: {
    position: 'absolute',
    right: 16,
    width: 105,
    height: 145,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.PRIMARY_COLOR,
    zIndex: 20,
  },
  localVideo: {
    width: '100%',
    height: '100%',
  },
  switchCameraBtn: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    padding: 4,
  },

  // ── Top Bar ──
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  minimizeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  encryptionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 6,
  },
  encPingWrap: {
    width: 8,
    height: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  encPingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.ACCEPT_GREEN,
  },
  encryptionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  hdAudioBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.35)',
    gap: 5,
  },
  hdBadgeText: {
    color: colors.CYAN_ACCENT,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  hdAudioText: {
    color: colors.CYAN_ACCENT,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  miniSoundWaves: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 12,
  },
  miniWaveBar: {
    width: 2.5,
    backgroundColor: colors.CYAN_ACCENT,
    borderRadius: 2,
  },

  // ── Central Profile Stage ──
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    zIndex: 5,
  },
  avatarOrbitWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  pulseRingOuter: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.35)',
  },
  pulseRingInner: {
    position: 'absolute',
    width: 156,
    height: 156,
    borderRadius: 78,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.4)',
  },
  avatarGradientRing: {
    width: 138,
    height: 138,
    borderRadius: 69,
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarFrameInner: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: colors.CARD_COLOR,
    borderWidth: 2,
    borderColor: colors.BACKGROUND_COLOR,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImageLarge: {
    width: 130,
    height: 130,
    borderRadius: 65,
  },
  headphoneBadge: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusPill: {
    position: 'absolute',
    bottom: -12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    color: '#F1F5F9',
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Name & Badges ──
  nameSection: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  callerNameTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  hostBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 180, 0, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 0, 0.5)',
  },
  hostBadgeText: {
    color: colors.FILM_GOLD,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  callerSubtitle: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },

  // ── Equalizer & Timer ──
  equalizerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(22, 22, 37, 0.88)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    gap: 10,
    marginBottom: 16,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.PRIMARY_COLOR,
  },
  timerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  equalizerDivider: {
    width: 1,
    height: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  equalizerBarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 26,
  },
  eqBar: {
    width: 3,
    borderRadius: 2,
  },
  opusTag: {
    color: colors.CYAN_ACCENT,
    fontSize: 11,
    fontWeight: '600',
  },

  // ── Watch Party Card ──
  syncPartyCard: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginTop: 4,
  },
  syncPartyInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  syncPartyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  popcornIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(124, 58, 237, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  syncPartyTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 13,
    fontWeight: '700',
  },
  syncLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.PRIMARY_COLOR,
  },
  syncPartySubtitle: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    marginTop: 1,
  },
  syncInviteBtn: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  syncInviteGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    gap: 4,
  },
  syncInviteBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Bottom Call Controls Dock ──
  bottomControlsWrap: {
    paddingHorizontal: 16,
    alignItems: 'center',
    zIndex: 10,
  },
  reactionsShelf: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 8,
    marginBottom: 12,
  },
  reactionsLabel: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '600',
    marginRight: 2,
  },
  reactionBtn: {
    padding: 3,
  },
  glassDock: {
    width: '100%',
    backgroundColor: 'rgba(19, 19, 31, 0.85)',
    borderRadius: 28,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 16,
  },
  dockControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dockBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
    position: 'relative',
  },
  dockBtnActiveRed: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: colors.LIVE_RED,
  },
  dockBtnActiveBlue: {
    backgroundColor: 'rgba(0, 122, 255, 0.2)',
    borderColor: colors.PRIMARY_COLOR,
  },
  dockBtnText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 10,
    fontWeight: '600',
  },
  chatNotifyDot: {
    position: 'absolute',
    top: 5,
    right: 7,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.PURPLE_ACCENT,
  },
  endCallBtnWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    overflow: 'hidden',
    shadowColor: colors.LIVE_RED,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  endCallBtnGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Incoming Call State ──
  incomingActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 8,
  },
  incomingActionBtn: {
    alignItems: 'center',
    gap: 6,
  },
  circleActionBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  declineBtn: {
    backgroundColor: colors.DELETE_RED_COLOR,
  },
  acceptBtn: {
    backgroundColor: colors.ACCEPT_GREEN,
  },
  actionText: {
    color: colors.TITLE_COLOR,
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Floating Minimized Call Banner ──
  minimizedCallBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.SURFACE_ELEVATED,
    marginHorizontal: 12,
    marginTop: 6,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.PRIMARY_COLOR + '55',
  },
  minimizedLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  minimizedDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.ACCEPT_GREEN,
  },
  minimizedText: {
    color: colors.TITLE_COLOR,
    fontSize: 12,
    fontWeight: '700',
  },
  minimizedRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  minimizedReturnText: {
    color: colors.PRIMARY_COLOR,
    fontSize: 11,
    fontWeight: '700',
  },
});

// ── VIDEO CALL SCREEN STYLES (Stitch AI Live Screening Design) ──
const videoCallStyles = StyleSheet.create({
  fullscreenRemoteVideo: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    backgroundColor: colors.BACKGROUND_COLOR,
  },
  fullscreenWaitingWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.BACKGROUND_COLOR,
  },
  waitingAvatarWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: colors.PRIMARY_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  waitingAvatarImage: {
    width: 114,
    height: 114,
    borderRadius: 57,
  },
  waitingAvatarFallback: {
    width: 114,
    height: 114,
    borderRadius: 57,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waitingAvatarText: {
    fontSize: 44,
    fontWeight: '700',
    color: colors.TITLE_COLOR,
  },
  waitingPulseDot: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.ACCEPT_GREEN,
    borderWidth: 3,
    borderColor: colors.BACKGROUND_COLOR,
  },
  waitingCallerName: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.TITLE_COLOR,
    marginBottom: 6,
  },
  waitingCallStatus: {
    fontSize: 14,
    color: colors.CYAN_ACCENT,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  topVignette: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  bottomVignette: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 290,
  },
  topHeaderWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    zIndex: 30,
  },
  topActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  glassRoundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  e2eeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(15, 15, 26, 0.75)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  e2eeText: {
    color: colors.ACCEPT_GREEN,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  syncScreeningBtn: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  syncScreeningGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
  },
  syncScreeningText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Caller Profile Card & Telemetry Panel ──
  callerTelemetryCard: {
    backgroundColor: 'rgba(15, 15, 26, 0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 9,
    maxWidth: 250,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  callerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  callerNameGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  callerNameText: {
    color: colors.TITLE_COLOR,
    fontSize: 13.5,
    fontWeight: '700',
    maxWidth: 120,
  },
  hostMiniBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 180, 0, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 0, 0.35)',
  },
  hostMiniBadgeText: {
    color: colors.FILM_GOLD,
    fontSize: 9,
    fontWeight: '800',
  },
  liveTimerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  liveTimerRedDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.LIVE_RED,
  },
  liveTimerDigits: {
    color: '#E2E8F0',
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  telemetryBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  audioSpectrumGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  miniEqBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 14,
    width: 16,
  },
  miniEqBar: {
    width: 2.5,
    borderRadius: 1.5,
  },
  connectedStatusText: {
    color: colors.ACCEPT_GREEN,
    fontSize: 10,
    fontWeight: '600',
  },
  webrtcTelemetry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  telemetrySpecs: {
    color: colors.CYAN_ACCENT,
    fontSize: 10,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  telemetryDot: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 10,
  },
  latencyText: {
    color: colors.ACCEPT_GREEN,
    fontSize: 10,
    fontWeight: '600',
  },

  // ── Floating Local Camera PiP Window ──
  localPipCard: {
    position: 'absolute',
    right: 16,
    width: 104,
    height: 148,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(0, 122, 255, 0.65)',
    zIndex: 35,
    backgroundColor: colors.SURFACE_COLOR,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 20,
  },
  localPipVideo: {
    width: '100%',
    height: '100%',
  },
  cameraOffPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_COLOR,
    gap: 4,
  },
  camOffText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 9,
    fontWeight: '600',
  },
  youBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  youDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.ACCEPT_GREEN,
  },
  youBadgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '700',
  },
  localWavelets: {
    position: 'absolute',
    bottom: 6,
    left: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 12,
  },
  localWaveBar: {
    width: 2,
    borderRadius: 1,
    backgroundColor: colors.CYAN_ACCENT,
  },
  flipCameraBtn: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Mid-Overlay Area: Queue Ribbon & Reactions ──
  midOverlayArea: {
    position: 'absolute',
    bottom: 96,
    left: 14,
    right: 14,
    zIndex: 30,
    gap: 8,
  },
  watchPartyRibbon: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.35)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 18,
    elevation: 12,
  },
  watchPartyRibbonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  ribbonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  ribbonPopcornIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: 'rgba(124, 58, 237, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ribbonTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ribbonTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 12.5,
    fontWeight: '700',
  },
  fourKBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(6, 182, 212, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.35)',
  },
  fourKBadgeText: {
    color: colors.CYAN_ACCENT,
    fontSize: 8.5,
    fontWeight: '800',
  },
  ribbonSubtext: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 10.5,
    marginTop: 1,
  },
  ribbonStartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  ribbonStartBtnText: {
    color: '#E9D5FF',
    fontSize: 11,
    fontWeight: '700',
  },
  reactionsRow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(15, 15, 26, 0.78)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  reactionMiniBtn: {
    padding: 2,
  },
  reactionDivider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  reactionPlusBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reactionPlusText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Bottom Action Control Island (Glass Capsule Dock) ──
  bottomControlsWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    zIndex: 40,
  },
  glassIslandDock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(8, 8, 16, 0.84)',
    borderRadius: 32,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.7,
    shadowRadius: 24,
    elevation: 20,
  },
  islandActionBtn: {
    alignItems: 'center',
    gap: 4,
  },
  islandCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  islandCircleActiveRed: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    borderColor: colors.LIVE_RED,
  },
  islandCircleActiveBlue: {
    backgroundColor: 'rgba(0, 122, 255, 0.25)',
    borderColor: colors.PRIMARY_COLOR,
  },
  islandCircleActivePurple: {
    backgroundColor: 'rgba(124, 58, 237, 0.25)',
    borderColor: 'rgba(124, 58, 237, 0.8)',
  },
  islandLeaveBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.LIVE_RED,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
  },
  islandLabel: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 10,
    fontWeight: '600',
  },
});

export default ChatScreen;