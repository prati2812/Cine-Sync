import React, { useState, useEffect } from 'react';
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
  StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  FadeInDown,
} from 'react-native-reanimated';
import { auth } from '../../config/firebase';
import colors from '../../theme/Colors';
import LinearGradient from 'react-native-linear-gradient';

const VerifyEmailScreen = ({ onSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [timer, setTimer] = useState(30);

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
      return () => clearInterval(countdown);
    }
  }, [canResend]);

  useEffect(() => {
    const interval = setInterval(async () => {
      await auth().currentUser?.reload();
      if (auth().currentUser?.emailVerified) {
        onSuccess();
        clearInterval(interval);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleResendEmail = async () => {
    setIsLoading(true);
    try {
      await auth().currentUser?.sendEmailVerification();
      Alert.alert('Verification Email Sent', 'Please check your inbox.');
      setCanResend(false);
      setTimer(30);
    } catch (error) {
      console.log('Error sending verification email:', error);
      Alert.alert('Error', 'Failed to send verification email.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        backgroundColor={colors.STATUSBAR_BG_COLOR}
        barStyle="light-content"
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <View style={styles.contentContainer}>
          <Animated.View
            entering={FadeInDown.duration(800)}
            style={styles.formContent}>
            <View style={styles.headerContainer}>
              <LinearGradient
                colors={[colors.GRADIENT_START, colors.GRADIENT_END]}
                style={styles.iconCircle}>
                <Icon name="mail-outline" size={40} color="#FFFFFF" />
              </LinearGradient>
              <Text style={styles.title}>Verify Your Email</Text>
              <View style={styles.infoCard}>
                <Text style={styles.subtitle}>
                  A verification link has been sent to your email. Please check
                  your inbox and follow the instructions to verify your account.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleResendEmail}
              disabled={!canResend || isLoading}
              activeOpacity={0.8}>
              <LinearGradient
                colors={
                  canResend
                    ? [colors.GRADIENT_START, colors.GRADIENT_END]
                    : [colors.DISABLED_BUTTON_COLOR, colors.DISABLED_BUTTON_COLOR]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[
                  styles.resendButton,
                  (!canResend || isLoading) && styles.buttonDisabled,
                ]}>
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.resendButtonText}>
                    {canResend
                      ? 'Resend Verification Email'
                      : `Wait ${timer}s to resend`}
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
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
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.TITLE_COLOR,
    marginBottom: 20,
    textAlign: 'center',
  },
  infoCard: {
    backgroundColor: colors.SURFACE_GLASS,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  subtitle: {
    fontSize: 16,
    color: colors.SUB_TITLE_COLOR,
    textAlign: 'center',
    lineHeight: 24,
  },
  formContent: {
    width: '100%',
  },
  resendButton: {
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  resendButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});

export default VerifyEmailScreen;
