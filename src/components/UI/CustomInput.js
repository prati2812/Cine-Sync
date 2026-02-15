import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '../../theme/Colors';

const CustomInput = ({
  // ----- Basic Props -----
  label,
  placeholder = 'Enter text',
  value,
  defaultValue = '',
  onChangeText,
  keyboardType = 'default',
  autoCapitalize = 'none',
  secureTextEntry = false,

  // ----- Dynamic Icons -----
  leftIcon,                // e.g. "mail-outline"
  rightIcon,               // e.g. "eye-outline"
  onLeftIconPress,         // optional left icon press handler
  onRightIconPress,        // optional right icon press handler
  iconColor = '#666666',
  iconSize = 20,

  // ----- Styling -----
  containerStyle,
  labelStyle,
  inputWrapperStyle,
  inputStyle,
  leftIconStyle,
  rightIconStyle,

  // ----- Error / Helper Text -----
  errorText,
  helperText,
  errorColor = '#ff4d4f',

  // ----- Dynamic Colors -----
  themeColors = {
    TITLE_COLOR: colors.TITLE_COLOR,
    INPUTBOX_BG_COLOR: colors.INPUTBOX_BG_COLOR,
    INPUTBOX_BORDER_COLOR: colors.INPUTBOX_BORDER_COLOR,
  },
}) => {
  // ✅ Component handles its own state if parent doesn’t provide one
  const [internalValue, setInternalValue] = useState(defaultValue);

  const handleChange = (text) => {
    if (onChangeText) onChangeText(text);
    else setInternalValue(text);
  };

  const currentValue = value !== undefined ? value : internalValue;

  const styles = createStyles(themeColors, errorColor, !!errorText);

  return (
    <View style={[styles.container, containerStyle]}>
      {/* Label */}
      {label && <Text style={[styles.label, labelStyle]}>{label}</Text>}

      {/* Input Wrapper */}
      <View style={[styles.inputWrapper, inputWrapperStyle]}>
        {/* Left Icon (Optional with Press) */}
        {leftIcon && (
          <TouchableOpacity
            disabled={!onLeftIconPress}
            onPress={onLeftIconPress}>
            <Icon
              name={leftIcon}
              size={iconSize}
              color={iconColor}
              style={[styles.leftIcon, leftIconStyle]}
            />
          </TouchableOpacity>
        )}

        {/* Text Input */}
        <TextInput
          style={[styles.input, inputStyle]}
          placeholder={placeholder}
          placeholderTextColor="#666666"
          value={currentValue}
          onChangeText={handleChange}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          secureTextEntry={secureTextEntry}
        />

        {/* Right Icon (Optional with Press) */}
        {rightIcon && (
          <TouchableOpacity
            disabled={!onRightIconPress}
            onPress={onRightIconPress}>
            <Icon
              name={rightIcon}
              size={iconSize}
              color={iconColor}
              style={[styles.rightIcon, rightIconStyle]}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Helper / Error Text */}
      {errorText ? (
        <Text style={[styles.helperText, { color: errorColor }]}>
          {errorText}
        </Text>
      ) : helperText ? (
        <Text style={[styles.helperText, { color: '#999' }]}>
          {helperText}
        </Text>
      ) : null}
    </View>
  );
};

const createStyles = (themeColors, errorColor, hasError) =>
  StyleSheet.create({
    container: {
      marginBottom: 24,
    },
    label: {
      fontSize: 15,
      fontWeight: '600',
      color: themeColors.TITLE_COLOR,
      marginBottom: 8,
      marginLeft: 4,
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: themeColors.INPUTBOX_BG_COLOR,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: hasError
        ? errorColor
        : themeColors.INPUTBOX_BORDER_COLOR,
      paddingHorizontal: 16,
    },
    leftIcon: {
      marginRight: 12,
    },
    rightIcon: {
      marginLeft: 12,
    },
    input: {
      flex: 1,
      padding: 16,
      fontSize: 16,
      color: themeColors.TITLE_COLOR,
    },
    helperText: {
      marginTop: 6,
      marginLeft: 4,
      fontSize: 13,
    },
  });

export default CustomInput;
