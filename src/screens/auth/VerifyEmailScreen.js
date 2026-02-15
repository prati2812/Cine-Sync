import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import {auth} from '../../config/firebase';
import {sendEmailVerification, onAuthStateChanged} from 'firebase/auth';

const VerifyEmailScreen = ({onSuccess}) => {
  const [email, setEmail] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [timer, setTimer] = useState(30);

  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const successOpacity = useSharedValue(0);

  const formAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{scale: scale.value}],
    opacity: opacity.value,
  }));

  const successAnimatedStyle = useAnimatedStyle(() => ({
    opacity: successOpacity.value,
    transform: [{scale: successOpacity.value}],
  }));

  useEffect(() => {
    if (!canResend) {
      const countdown = setInterval(() => {
        setTimer(prev => {
          if (prev <= 1) {
            clearInterval(countdown);
            setCanResend(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(countdown); // Cleanup interval on unmount
    }
  }, [canResend]);

  useEffect(() => {
    const interval = setInterval(async () => {
      await auth.currentUser.reload();
      console.log('Email Verified:', auth.currentUser.emailVerified);

      if (auth.currentUser.emailVerified) {
        onSuccess();
        clearInterval(interval);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleResendEmail = async () => {
    setIsLoading(true);
    try {
      await sendEmailVerification(auth.currentUser);
      Alert.alert('Verification Email Sent', 'Please check your inbox.');
      setCanResend(false);
      setTimer(30); // Reset timer to 30 seconds
    } catch (error) {
      console.log('Error sending verification email:', error);
      Alert.alert('Error', 'Failed to send verification email.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <View style={styles.contentContainer}>
          {!isSuccess ? (
            <Animated.View style={[styles.formContent, formAnimatedStyle]}>
              <View style={styles.headerContainer}>
                <Icon
                  name="mail-outline"
                  size={48}
                  color="#007AFF"
                  style={styles.headerIcon}
                />
                <Text style={styles.title}>Verify Your Email</Text>
                <Text style={styles.subtitle}>
                  A verification link has been sent to your email. Please check
                  your inbox and follow the instructions to verify your account.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.resendButton}
                onPress={handleResendEmail}
                disabled={!canResend}
                activeOpacity={0.8}>
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.resendButtonText}>
                    {canResend
                      ? 'Resend Verification Email'
                      : `Wait ${timer}s to resend`}
                  </Text>
                )}
              </TouchableOpacity>
            </Animated.View>
          ) : (
            <Animated.View
              style={[styles.successContainer, successAnimatedStyle]}>
              <Icon name="checkmark-circle-outline" size={80} color="#4CAF50" />
              <Text style={styles.successTitle}>Check Your Email</Text>
              <Text style={styles.successText}>
                We've sent a verification link to your email address.
              </Text>
            </Animated.View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  keyboardView: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  headerIcon: {
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#888888',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  formContent: {
    width: '100%',
  },
  button: {
    backgroundColor: '#007AFF',
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    shadowColor: '#007AFF',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  resendButton: {
    backgroundColor: '#FF3B30',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  resendButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  successContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 20,
    marginBottom: 12,
    textAlign: 'center',
  },
  successText: {
    fontSize: 16,
    color: '#888888',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
});

export default VerifyEmailScreen;
