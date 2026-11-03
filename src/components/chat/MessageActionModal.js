import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import LinearGradient from 'react-native-linear-gradient';
import colors from '../../theme/Colors';

const MessageActionModal = ({
  visible,
  selectedMessage,
  currentUserId,
  otherUsername,
  onClose,
  onDeleteForMe,
  onDeleteForEveryone,
  onReply,
  onCopy,
  insets,
}) => {
  if (!selectedMessage) return null;

  const isMyMessage = selectedMessage.senderId === currentUserId;
  const isDeleted = selectedMessage.deletedForEveryone;

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.actionModalBackdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[
            styles.actionModalSheet,
            { paddingBottom: Math.max(insets?.bottom || 0, 16) + 16 },
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
              onPress={onClose}
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
              {selectedMessage.text || (selectedMessage.caption ? selectedMessage.caption : (selectedMessage.imageUri || selectedMessage.mediaId ? 'Photo' : ''))}
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
            {/* Reply Button */}
            {onReply && !isDeleted && (
              <TouchableOpacity
                style={styles.actionItemBtn}
                activeOpacity={0.75}
                onPress={() => {
                  onReply(selectedMessage);
                  onClose();
                }}
              >
                <View style={styles.actionIconWrap}>
                  <MaterialIcons name="reply" size={20} color={colors.CYAN_ACCENT} />
                </View>
                <View style={styles.actionItemTextGroup}>
                  <Text style={styles.actionItemTitle}>Reply</Text>
                  <Text style={styles.actionItemSubtitle}>Quote this message in your response</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Copy Text Button */}
            {onCopy && Boolean(selectedMessage.text) && !isDeleted && (
              <TouchableOpacity
                style={styles.actionItemBtn}
                activeOpacity={0.75}
                onPress={() => {
                  onCopy(selectedMessage.text);
                  onClose();
                }}
              >
                <View style={styles.actionIconWrap}>
                  <MaterialIcons name="content-copy" size={20} color={colors.PRIMARY_COLOR} />
                </View>
                <View style={styles.actionItemTextGroup}>
                  <Text style={styles.actionItemTitle}>Copy Text</Text>
                  <Text style={styles.actionItemSubtitle}>Copy message to clipboard</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Delete for Me Button */}
            <TouchableOpacity
              style={styles.actionItemBtn}
              activeOpacity={0.75}
              onPress={onDeleteForMe}
            >
              <View style={styles.actionIconWrap}>
                <MaterialIcons name="delete-outline" size={20} color={colors.TITLE_COLOR} />
              </View>
              <View style={styles.actionItemTextGroup}>
                <Text style={styles.actionItemTitle}>Delete for me</Text>
                <Text style={styles.actionItemSubtitle}>Remove this message from your device</Text>
              </View>
            </TouchableOpacity>

            {/* Delete for Everyone Button */}
            {isMyMessage && !isDeleted && (
              <TouchableOpacity
                style={styles.actionItemBtn}
                activeOpacity={0.75}
                onPress={onDeleteForEveryone}
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

const styles = StyleSheet.create({
  actionModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  actionModalSheet: {
    backgroundColor: colors.SURFACE_COLOR,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 18,
    paddingTop: 12,
    overflow: 'hidden',
  },
  sheetTopGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
  },
  actionHandleBar: {
    width: 38,
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
});

export default React.memo(MessageActionModal);

