import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  TextInput,
  Modal,
  StatusBar,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import LinearGradient from 'react-native-linear-gradient';
import colors from '../../theme/Colors';

const PhotoPreviewModal = ({
  visible,
  selectedPhotos,
  activePhotoIndex,
  setActivePhotoIndex,
  setSelectedPhotos,
  photoCaption,
  setPhotoCaption,
  isViewOnce,
  setIsViewOnce,
  isSendingPhoto,
  onClose,
  onSend,
  safeTopPadding,
  insets,
}) => {
  if (!visible || !selectedPhotos || selectedPhotos.length === 0) return null;

  const currentPhoto = selectedPhotos[activePhotoIndex] || selectedPhotos[0];
  const previewUri = currentPhoto?.previewUri || currentPhoto?.uri;
  const isSinglePhoto = selectedPhotos.length === 1;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!isSendingPhoto) {
          onClose();
        }
      }}
    >
      <View style={styles.photoPreviewSafeContainer}>
        <StatusBar barStyle="light-content" backgroundColor={colors.BACKGROUND_COLOR} translucent />

        {/* Top Bar with safe notch padding */}
        <View style={[styles.photoPreviewHeader, { paddingTop: safeTopPadding }]}>
          <TouchableOpacity
            style={styles.photoPreviewHeaderBtn}
            onPress={onClose}
            activeOpacity={0.8}
            disabled={isSendingPhoto}
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
                onClose();
              } else {
                const updated = selectedPhotos.filter((_, i) => i !== activePhotoIndex);
                setSelectedPhotos(updated);
                setActivePhotoIndex(Math.max(0, Math.min(activePhotoIndex, updated.length - 1)));
              }
            }}
            activeOpacity={0.8}
            disabled={isSendingPhoto}
          >
            <MaterialIcons name="delete-outline" size={22} color={colors.LIVE_RED} />
          </TouchableOpacity>
        </View>

        {/* Photo Display Card */}
        <View style={styles.photoPreviewImageWrap}>
          {previewUri ? (
            <Image
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
                          onClose();
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

          {/* View Once (1x) Ephemeral Toggle Button */}
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
                onSubmitEditing={onSend}
              />
            </View>

            <TouchableOpacity
              style={styles.photoSendBtn}
              onPress={onSend}
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

const styles = StyleSheet.create({
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
});

export default React.memo(PhotoPreviewModal);

