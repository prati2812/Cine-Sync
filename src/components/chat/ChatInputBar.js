import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import colors from '../../theme/Colors';

const ChatInputBar = ({
  message,
  onChangeMessage,
  onSend,
  showAttachments,
  onToggleAttachments,
  replyingToMessage,
  onDismissReply,
  otherUsername,
  currentUserId,
  isSelfChat,
  isKeyboardVisible,
  messageInputRef,
}) => {
  const insets = useSafeAreaInsets();

  const isMyReplyTarget = replyingToMessage?.senderId === currentUserId;

  return (
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
              <MaterialIcons name="reply" size={14} color={colors.CYAN_ACCENT} style={styles.replyIcon} />
              <Text style={styles.replyTargetUserText}>
                Replying to {isMyReplyTarget ? 'yourself' : otherUsername}
              </Text>
            </View>
            <Text style={styles.replySnippetText} numberOfLines={1}>
              {replyingToMessage.type === 'image' || replyingToMessage.type === 'photo'
                ? (replyingToMessage.caption ? replyingToMessage.caption : 'Photo')
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
            onPress={onDismissReply}
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
            onToggleAttachments();
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
            onChangeText={onChangeMessage}
            multiline
          />
        </View>

        <TouchableOpacity
          style={styles.sendBtnWrap}
          onPress={onSend}
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
  );
};

const styles = StyleSheet.create({
  bottomInputDock: {
    backgroundColor: colors.BACKGROUND_COLOR,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.BORDER_SUBTLE,
  },
  replyDockBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    marginHorizontal: 4,
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
  replyIcon: {
    marginRight: 4,
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
  replyDockThumbnail: {
    width: 38,
    height: 38,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  replyDismissButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  attachBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
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
    borderRadius: 14,
    paddingHorizontal: 12,
    minHeight: 42,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
  },
  textInput: {
    flex: 1,
    color: colors.TITLE_COLOR,
    fontSize: 14,
    paddingVertical: 6,
  },
  sendBtnWrap: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  sendBtnGradient: {
    width: 42,
    height: 42,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default React.memo(ChatInputBar);

