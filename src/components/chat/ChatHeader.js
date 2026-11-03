import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import colors from '../../theme/Colors';

const ChatHeader = ({
  navigation,
  otherUserId,
  otherUsername,
  otherAvatar,
  otherUserStatus,
  isSelfChat,
  isOtherUserTyping,
  isChatLocked,
  onToggleChatLock,
  onStartCall,
  onTriggerWatchPartyInvite,
}) => {
  const insets = useSafeAreaInsets();
  const safeTopPadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 12,
  ) + 8;

  const handleProfilePress = () => {
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
  };

  return (
    <View style={[styles.header, { paddingTop: safeTopPadding }]}>
      <View style={styles.headerLeft}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <MaterialIcons name="arrow-back-ios-new" size={18} color={colors.TITLE_COLOR} />
        </TouchableOpacity>

        {/* User Avatar & Name with Status Indicator */}
        <TouchableOpacity
          style={styles.headerProfileBtn}
          activeOpacity={0.75}
          onPress={handleProfilePress}
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
                <Text style={styles.avatarInitial}>{otherUsername?.[0]?.toUpperCase()}</Text>
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
                isSelfChat && styles.subtextSelfChat,
                !isSelfChat && isOtherUserTyping && styles.subtextTyping,
                !isSelfChat && !isOtherUserTyping && otherUserStatus === 'online' && styles.subtextOnline,
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

      {/* Right Action Icons */}
      <View style={styles.headerRightActions}>
        {!isSelfChat && (
          <>
            {/* Chat Lock Button */}
            <TouchableOpacity
              style={[styles.headerActionBtn, isChatLocked && styles.headerActionBtnLocked]}
              onPress={onToggleChatLock}
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
              onPress={() => onStartCall?.('audio')}
              activeOpacity={0.8}
            >
              <MaterialIcons name="call" size={18} color={colors.TITLE_COLOR} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => onStartCall?.('video')}
              activeOpacity={0.8}
            >
              <MaterialIcons name="videocam" size={20} color={colors.TITLE_COLOR} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerInviteTicketBtn}
              onPress={onTriggerWatchPartyInvite}
              activeOpacity={0.8}
            >
              <MaterialIcons name="confirmation-number" size={18} color={colors.PRIMARY_COLOR} />
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
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
  subtextSelfChat: {
    color: colors.CYAN_ACCENT,
  },
  subtextTyping: {
    color: colors.CYAN_ACCENT,
    fontWeight: '700',
  },
  subtextOnline: {
    color: colors.ACCEPT_GREEN,
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
});

export default React.memo(ChatHeader);

