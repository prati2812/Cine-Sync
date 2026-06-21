import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  Vibration,
  Dimensions,
  StatusBar,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import colors from '../../theme/Colors';
import LinearGradient from 'react-native-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

const { width } = Dimensions.get('window');
const BUTTON_SIZE = width * 0.17;
const DOT_SIZE = width * 0.035;

const PINVerificationScreen = ({ onSuccess }) => {
  const [pin, setPin] = useState('');

  const handleNumberPress = number => {
    if (pin.length < 4) {
      Vibration.vibrate(30);
      setPin(prev => prev + number);
    }
  };

  const handleDelete = () => {
    Vibration.vibrate(40);
    setPin(prev => prev.slice(0, -1));
  };

  const verifyPIN = async () => {
    try {
      const storedPIN = await AsyncStorage.getItem('@app_lock_pin');
      if (pin === storedPIN) {
        Vibration.vibrate(50);
        onSuccess();
      } else {
        Vibration.vibrate([0, 50, 50, 50]); // Error vibrate
        Alert.alert('Error', 'Incorrect PIN');
        setPin('');
      }
    } catch (error) {
      console.error('Error verifying PIN:', error);
      Alert.alert('Error', 'Failed to verify PIN');
    }
  };

  useEffect(() => {
    if (pin.length === 4) {
      setTimeout(verifyPIN, 100);
    }
  }, [pin]);

  const renderPinDots = () => (
    <View style={styles.dotsContainer}>
      {[...Array(4)].map((_, index) => {
        const isFilled = pin.length > index;
        return (
          <View
            key={index}
            style={[
              styles.dot,
              isFilled && styles.dotFilled,
              isFilled && styles.dotGlow,
            ]}
          />
        );
      })}
    </View>
  );

  const NumberButton = ({ number, onPress }) => {
    return (
      <TouchableOpacity
        style={[
          styles.numberButton,
          number === '' && styles.emptyButton,
          typeof number !== 'string' && styles.deleteButton,
        ]}
        onPress={() => number && onPress(number)}
        disabled={!number}
        activeOpacity={0.7}>
        {typeof number === 'string' ? (
          <Text style={styles.numberText}>{number}</Text>
        ) : (
          number
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        backgroundColor={colors.BACKGROUND_COLOR}
        barStyle="light-content"
      />
      <View style={styles.content}>
        <Animated.View
          entering={FadeInDown.duration(800)}
          style={styles.headerContainer}>
          <LinearGradient
            colors={[colors.GRADIENT_START, colors.GRADIENT_END]}
            style={styles.iconContainer}>
            <MaterialIcons name="lock" size={32} color="#FFFFFF" />
          </LinearGradient>
          <Text style={styles.title}>Enter PIN</Text>
          <Text style={styles.subtitle}>Please enter your security PIN</Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(600).delay(200)}>
          {renderPinDots()}
        </Animated.View>

        <Animated.View
          entering={FadeInUp.duration(800).delay(400)}
          style={styles.numberPad}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0].map((num, index) => (
            <NumberButton
              key={index}
              number={num.toString()}
              onPress={handleNumberPress}
            />
          ))}
          <NumberButton
            number={
              <MaterialIcons
                name="backspace"
                size={24}
                color={colors.TITLE_COLOR}
              />
            }
            onPress={handleDelete}
          />
        </Animated.View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 60,
  },
  headerContainer: {
    alignItems: 'center',
    gap: 16,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.TITLE_COLOR,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 16,
    color: colors.SUB_TITLE_COLOR,
    textAlign: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 20,
    marginTop: -40,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 2,
    borderColor: colors.MUTED_COLOR,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: colors.PRIMARY_COLOR,
    borderColor: colors.PRIMARY_COLOR,
  },
  dotGlow: {
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 5,
  },
  numberPad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: '85%',
    gap: width * 0.05,
    paddingHorizontal: 10,
  },
  numberButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.CARD_COLOR,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  emptyButton: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  deleteButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  numberText: {
    fontSize: 26,
    color: colors.TITLE_COLOR,
    fontWeight: '700',
  },
});

export default PINVerificationScreen;