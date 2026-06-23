import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Logo1 from './Logo1';
import colors from '../theme/Colors';

const Header = ({
  title,
  subtitle,
  showLogo = false,
  leftIcon,
  leftIconColor = colors.FILM_GOLD,
  onLeftPress,
  rightComponent,
  borderBottom = true,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.headerContainer,
        { paddingTop: Math.max(insets.top, 12) }, // Ensure at least 12px padding even if insets.top is 0
        borderBottom && styles.borderBottom,
      ]}
    >
      <View style={styles.headerContent}>
        {showLogo ? (
          <Logo1 size="small" />
        ) : (
          <View style={styles.headerLeft}>
            {leftIcon && (
              <TouchableOpacity
                activeOpacity={onLeftPress ? 0.7 : 1}
                onPress={onLeftPress}
                disabled={!onLeftPress}
                style={styles.headerIconWrap}
              >
                <Ionicons name={leftIcon} size={22} color={leftIconColor} />
              </TouchableOpacity>
            )}
            <View>
              {title && <Text style={styles.headerTitle}>{title}</Text>}
              {subtitle && <Text style={styles.headerSub}>{subtitle}</Text>}
            </View>
          </View>
        )}
        {rightComponent && (
          <View style={styles.headerRight}>{rightComponent}</View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: colors.BACKGROUND_COLOR,
    width: '100%',
    marginTop: 12,
  },
  borderBottom: {
    borderBottomWidth: 1,
    borderBottomColor: colors.BORDER_SUBTLE,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
  },
  headerIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.FILM_GOLD_GLOW,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.TITLE_COLOR,
    letterSpacing: 0.5,
  },
  headerSub: {
    fontSize: 13,
    color: colors.SUB_TITLE_COLOR,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export default Header;
