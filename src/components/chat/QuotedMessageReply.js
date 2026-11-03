import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import colors from '../../theme/Colors';
import { resolveMediaUri } from '../../functions/mediaService';

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
    (replyTo.text && replyTo.text.includes('Photo'));

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
          {replyTo.text || (isQuotedImage ? 'Photo' : 'Message')}
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

const styles = StyleSheet.create({
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
});

export default React.memo(QuotedMessageReply);

