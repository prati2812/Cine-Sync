import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  SafeAreaView,
  Alert,
  Vibration,
  Animated,
  Dimensions,
  StatusBar
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');
const BUTTON_SIZE = width * 0.17;
const DOT_SIZE = width * 0.032;

const SetupPINScreen = ({ navigation }) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);

  // Add new animated values
  const [dotScales] = useState([...Array(4)].map(() => new Animated.Value(1)));
  const [shakeAnimation] = useState(new Animated.Value(0));

  useEffect(() => {
    // Check if PIN is complete and move to confirmation
    if (pin.length === 4 && !isConfirming) {
      Vibration.vibrate(50);
      setIsConfirming(true);
    }
    
    // Check if confirmation PIN is complete
    if (confirmPin.length === 4) {
      Vibration.vibrate(50);
      handlePinComplete();
    }
  }, [pin, confirmPin]);

  const animateDot = (index) => {
    Animated.sequence([
      Animated.spring(dotScales[index], {
        toValue: 1.3,
        useNativeDriver: true,
        speed: 20,
      }),
      Animated.spring(dotScales[index], {
        toValue: 1,
        useNativeDriver: true,
        speed: 20,
      }),
    ]).start();
  };

  const shakeError = () => {
    Animated.sequence([
      Animated.timing(shakeAnimation, {
        toValue: 10,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: -10,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: 10,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleNumberPress = (number) => {
    if (!isConfirming && pin.length < 4) {
      Animated.sequence([
        Animated.timing(dotScales[pin.length], {
          toValue: 1.3,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(dotScales[pin.length], {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start();
      setPin(prev => {
        animateDot(prev.length);
        return prev + number;
      });
    } else if (isConfirming && confirmPin.length < 4) {
      Animated.sequence([
        Animated.timing(dotScales[confirmPin.length], {
          toValue: 1.3,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(dotScales[confirmPin.length], {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start();
      setConfirmPin(prev => {
        animateDot(prev.length);
        return prev + number;
      });
    }
  };

  const handleDelete = () => {
    if (!isConfirming) {
      setPin(prev => prev.slice(0, -1));
    } else {
      setConfirmPin(prev => prev.slice(0, -1));
    }
  };

  const resetPinSetup = () => {
    setPin('');
    setConfirmPin('');
    setIsConfirming(false);
  };

  const handlePinComplete = async () => {
    if (pin === confirmPin) {
      try {
        await AsyncStorage.setItem('@app_lock_pin', pin);
        Vibration.vibrate([100, 100, 100]);
        Alert.alert(
          'Success', 
          'PIN setup successful', 
          [
            {
              text: 'OK',
              onPress: () => navigation.goBack()
            }
          ]
        );
      } catch (error) {
        console.error('Error saving PIN:', error);
        Alert.alert('Error', 'Failed to save PIN');
        resetPinSetup();
      }
    } else {
      Vibration.vibrate([100, 200, 100]);
      Alert.alert(
        'Error', 
        'PINs do not match. Please try again.',
        [
          {
            text: 'OK',
            onPress: resetPinSetup
          }
        ]
      );
    }
  };

  const renderPinDots = () => {
    const currentPin = !isConfirming ? pin : confirmPin;
    return (
      <Animated.View 
        style={[
          styles.dotsContainer,
          { transform: [{ translateX: shakeAnimation }] }
        ]}
      >
        {[...Array(4)].map((_, index) => (
          <Animated.View
            key={index}
            style={[
              styles.dot,
              currentPin.length > index && styles.dotFilled,
              { transform: [{ scale: dotScales[index] }] }
            ]}
          />
        ))}
      </Animated.View>
    );
  };

  const NumberButton = ({ number, onPress }) => {
    return (
      <TouchableOpacity
        style={[
          styles.numberButton, 
          number === '' && styles.emptyButton,
          typeof number !== 'string' && styles.deleteButton
        ]}
        onPress={() => number && onPress(number)}
        disabled={!number}
        activeOpacity={0.7}
      >
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
      <StatusBar barStyle="light-content" />
      <View style={styles.content}>
        <View style={styles.headerContainer}>
          <View style={styles.iconContainer}>
            <MaterialIcons name="lock-outline" size={28} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>
            {!isConfirming ? 'Create PIN' : 'Confirm PIN'}
          </Text>
          <Text style={styles.subtitle}>
            {!isConfirming 
              ? 'Choose a secure 4-digit PIN to protect your app' 
              : 'Enter the same PIN again to confirm'}
          </Text>
        </View>

        {renderPinDots()}

        <View style={styles.numberPad}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0].map((num, index) => (
            <NumberButton
              key={index}
              number={num.toString()}
              onPress={handleNumberPress}
            />
          ))}
          <NumberButton
            number={
              <MaterialIcons name="backspace" size={22} color="#FFFFFF" />
            }
            onPress={handleDelete}
          />
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 50,
  },
  headerContainer: {
    alignItems: 'center',
    gap: 12,
  },
  iconContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  title: {
    fontSize: 26,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 15,
    color: '#AAAAAA',
    textAlign: 'center',
    maxWidth: '80%',
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 16,
    marginTop: -20,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    backgroundColor: 'transparent'
  },
  dotFilled: {
    backgroundColor: '#FFFFFF',
  },
  numberPad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: '80%',
    gap: width * 0.05,
    paddingHorizontal: 20,
  },
  numberButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  emptyButton: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  deleteButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  numberText: {
    fontSize: 24,
    color: '#FFFFFF',
    fontWeight: '500',
  },
});

export default SetupPINScreen; 