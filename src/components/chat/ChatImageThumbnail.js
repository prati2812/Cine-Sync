import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Dimensions,
  Platform,
  ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import colors from '../../theme/Colors';
import { resolveMediaUri } from '../../functions/mediaService';
import QuotedMessageReply from './QuotedMessageReply';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

const styles = StyleSheet.create({
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
  highlightedMessageBubble: {
    borderWidth: 1.5,
    borderColor: colors.CYAN_ACCENT,
    shadowColor: colors.CYAN_ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 8,
  },
  imageCardQuotedWrap: {
    flexDirection: 'row',
    margin: 6,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
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
  seenReceiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export default React.memo(ChatImageThumbnail);

