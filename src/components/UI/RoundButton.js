import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '../../theme/Colors'; 

const RoundButton = ({
  title = 'Button',
  onPress,
  isLoading = false,
  iconName = null,
  iconPosition = 'left', // 'left' | 'right'
  disabled = false,
  backgroundColor = colors.PRIMARY_COLOR,
  textColor = colors.TITLE_COLOR,
  borderColor = null,
  borderWidth = 0,
  radius = 50,
  height = 50,
  width = '100%',
  fontSize = 16,
  style,
  textStyle,
  iconSize = 20,
  activeOpacity = 0.8,
}) => {
  const isDisabled = isLoading || disabled;

  return (
    <TouchableOpacity
      style={[
        styles.button,
        {
          backgroundColor: isDisabled
            ? colors.DISABLED_BUTTON_COLOR || "#004999"
            : backgroundColor,
          borderColor: borderColor || backgroundColor,
          borderWidth,
          borderRadius: radius,
          height,
          width,
          opacity: isDisabled ? 0.8 : 1,
        },
        style,
      ]}
      onPress={onPress}
      activeOpacity={activeOpacity}
      disabled={isDisabled}>
      {isLoading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <View style={styles.contentContainer}>
          {iconName && iconPosition === 'left' && (
            <Icon
              name={iconName}
              size={iconSize}
              color={textColor}
              style={{ marginRight: 8 }}
            />
          )}
          <Text style={[styles.text, { color: textColor, fontSize }, textStyle]}>
            {title}
          </Text>
          {iconName && iconPosition === 'right' && (
            <Icon
              name={iconName}
              size={iconSize}
              color={textColor}
              style={{ marginLeft: 8 }}
            />
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.PRIMARY_COLOR,
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: colors.TITLE_COLOR,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default RoundButton;
