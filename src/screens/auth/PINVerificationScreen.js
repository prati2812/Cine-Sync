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
  StatusBar
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');
const BUTTON_SIZE = width * 0.17;
const DOT_SIZE = width * 0.032;
const BLUR_HASH = 'L05#Q+}[M{xv0LRPxuoe01WB~BNH';

const PINVerificationScreen = ({ onSuccess }) => {
  const [pin, setPin] = useState('');

  const handleNumberPress = (number) => {
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
      verifyPIN();
    }
  }, [pin]);

  const renderPinDots = () => (
    <View style={styles.dotsContainer}>
      {[...Array(4)].map((_, index) => (
        <View
          key={index}
          style={[
            styles.dot,
            pin.length > index && styles.dotFilled
          ]}
        />
      ))}
    </View>
  );

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
            <MaterialIcons name="lock" size={28} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>Enter PIN</Text>
          <Text style={styles.subtitle}>
            Please enter your security PIN
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

export default PINVerificationScreen; 