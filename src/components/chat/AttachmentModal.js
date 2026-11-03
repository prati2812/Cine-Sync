import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import colors from '../../theme/Colors';

const AttachmentModal = ({
  visible,
  onClose,
  onWatchPartyInvite,
  onCamera,
  onGallery,
  onAudioNote,
  onLocation,
  onDocument,
  onContact,
}) => {
  const insets = useSafeAreaInsets();

  const attachments = [
    {
      icon: 'confirmation-number',
      color: colors.PURPLE_ACCENT,
      label: 'Watch Invite',
      badge: 'LIVE',
      badgeColor: colors.LIVE_RED,
      onPress: () => {
        onClose();
        setTimeout(() => {
          onWatchPartyInvite?.();
        }, 300);
      },
    },
    {
      icon: 'camera-alt',
      color: colors.PRIMARY_COLOR,
      label: 'Camera',
      onPress: () => {
        onClose();
        onCamera?.();
      },
    },
    {
      icon: 'photo-library',
      color: colors.CYAN_ACCENT,
      label: 'Photos',
      onPress: () => {
        onClose();
        onGallery?.();
      },
    },
    {
      icon: 'mic',
      color: colors.FILM_GOLD,
      label: 'Audio Note',
      onPress: () => {
        onClose();
        onAudioNote?.();
      },
    },
    {
      icon: 'location-on',
      color: colors.ACCEPT_GREEN,
      label: 'Location',
      onPress: () => {
        onClose();
        onLocation?.();
      },
    },
    {
      icon: 'insert-drive-file',
      color: colors.FILM_GOLD,
      label: 'Document',
      onPress: () => {
        onClose();
        onDocument?.();
      },
    },
    {
      icon: 'person-add',
      color: colors.PURPLE_ACCENT,
      label: 'Contact',
      onPress: () => {
        onClose();
        onContact?.();
      },
    },
    {
      icon: 'movie',
      color: colors.PRIMARY_COLOR,
      label: 'Movie Pick',
      badge: 'SYNC',
      badgeColor: colors.PRIMARY_COLOR,
      onPress: () => {
        onClose();
        setTimeout(() => {
          onWatchPartyInvite?.();
        }, 300);
      },
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.modalBackdrop}>
        {/* Backdrop overlay: tapping outside closes the bottom sheet */}
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />

        {/* Bottom Sheet Card */}
        <View
          style={[
            styles.attachmentModalSheet,
            { paddingBottom: Math.max(insets.bottom, 16) + 12 },
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
              onPress={onClose}
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
                    styles.attachmentButtonSquare,
                    { backgroundColor: att.color + '18', borderColor: att.color + '4D' },
                  ]}
                >
                  <MaterialIcons name={att.icon} size={24} color={att.color} />
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

const styles = StyleSheet.create({
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
    borderRadius: 10,
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
  attachmentButtonSquare: {
    width: 54,
    height: 54,
    borderRadius: 16,
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
    letterSpacing: 0.2,
  },
  attachmentLabelText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    marginTop: 6,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default React.memo(AttachmentModal);

