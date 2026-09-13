import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  StatusBar,
  TouchableWithoutFeedback,
  Keyboard,
  ScrollView,
  TextInput,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../../config/firebase';
import colors from '../../theme/Colors';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

const LoginScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);

  // Dynamic notch & status bar padding
  const safeTopPadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 12
  ) + 10;

  // Load remembered email on mount if Remember Me was enabled
  useEffect(() => {
    const loadRememberedCredentials = async () => {
      try {
        const savedRemember = await AsyncStorage.getItem('@remember_me');
        if (savedRemember === 'true') {
          setRememberMe(true);
          const savedEmail = await AsyncStorage.getItem('@remember_email');
          if (savedEmail) {
            setEmail(savedEmail);
          }
        }
      } catch (err) {
        console.warn('Error loading remembered email:', err);
      }
    };
    loadRememberedCredentials();
  }, []);

  const handleLogin = async () => {
    if (isLoading) return;

    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter email and password', [{ text: 'OK' }]);
      return;
    }

    setIsLoading(true);
    try {
      const userCredential = await auth().signInWithEmailAndPassword(
        email.trim(),
        password,
      );
      console.log('User signed in:', userCredential.user);

      // Persist or clear remembered email (does NOT save password for security)
      if (rememberMe) {
        await AsyncStorage.setItem('@remember_me', 'true');
        await AsyncStorage.setItem('@remember_email', email.trim());
      } else {
        await AsyncStorage.removeItem('@remember_me');
        await AsyncStorage.removeItem('@remember_email');
      }
    } catch (error) {
      console.log(error);
      let errorMessage = 'An error occurred during login';

      switch (error.code) {
        case 'auth/invalid-credential':
          errorMessage = 'Invalid email or password';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Invalid email address format';
          break;
        case 'auth/user-not-found':
          errorMessage = 'No account found with this email';
          break;
        case 'auth/wrong-password':
          errorMessage = 'Incorrect password';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Too many failed attempts. Please try again later';
          break;
      }

      Alert.alert('Login Failed', errorMessage, [{ text: 'OK' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBiometricAuth = () => {
    Alert.alert(
      'Biometric Unlock',
      'Quick biometric sign-in is enabled for registered devices.',
      [{ text: 'OK' }]
    );
  };

  const handleSocialAuth = provider => {
    Alert.alert(
      `${provider} Sign-In`,
      `Continue with ${provider} authentication.`,
      [{ text: 'OK' }]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar
        backgroundColor={colors.BACKGROUND_COLOR}
        barStyle="light-content"
        translucent
      />

      {/* Ambient Radial Top Glows */}
      <View style={styles.ambientTopGlow} pointerEvents="none">
        <LinearGradient
          colors={['rgba(124, 58, 237, 0.18)', 'rgba(0, 122, 255, 0.08)', 'transparent']}
          style={StyleSheet.absoluteFillObject}
        />
      </View>

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingTop: safeTopPadding, paddingBottom: Math.max(insets.bottom, 20) + 16 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {/* Centered Brand Presentation */}
            <Animated.View
              entering={FadeInDown.duration(600).delay(100)}
              style={styles.brandContainer}
            >
              {/* Glowing Gradient Movie Icon */}
              <View style={styles.logoWrap}>
                <LinearGradient
                  colors={[colors.PRIMARY_COLOR, '#5B3BF5', colors.PURPLE_ACCENT]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.logoGradient}
                >
                  <Ionicons name="film" size={26} color="#FFFFFF" />
                </LinearGradient>
              </View>

              {/* Cine-Sync Title & VIP Badge */}
              <View style={styles.brandTitleRow}>
                <Text style={styles.brandTitleWhite}>CINE</Text>
                <Text style={styles.brandTitleBlue}>-SYNC</Text>
              </View>
              <Text style={styles.vipTagText}>VIP SCREENING ACCESS</Text>

              {/* Welcome Headline */}
              <Text style={styles.welcomeTitle}>Welcome Back</Text>
              <Text style={styles.welcomeSubtext}>
                Sign in to join synchronized watch parties with friends
              </Text>
            </Animated.View>

            {/* Glassmorphic Form Card */}
            <Animated.View
              entering={FadeInDown.duration(600).delay(250)}
              style={styles.formCard}
            >
              {/* Email Input */}
              <View
                style={[
                  styles.glassInputBox,
                  isEmailFocused && styles.glassInputBoxFocused,
                ]}
              >
                <MaterialIcons
                  name="alternate-email"
                  size={20}
                  color={colors.CYAN_ACCENT}
                  style={styles.inputLeftIcon}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder="name@example.com"
                  placeholderTextColor="#64748B"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  onFocus={() => setIsEmailFocused(true)}
                  onBlur={() => setIsEmailFocused(false)}
                />
              </View>

              {/* Password Input */}
              <View
                style={[
                  styles.glassInputBox,
                  isPasswordFocused && styles.glassInputBoxFocused,
                ]}
              >
                <MaterialIcons
                  name="lock-outline"
                  size={20}
                  color={colors.PURPLE_ACCENT}
                  style={styles.inputLeftIcon}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter your password"
                  placeholderTextColor="#64748B"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setIsPasswordFocused(true)}
                  onBlur={() => setIsPasswordFocused(false)}
                />
                <TouchableOpacity
                  style={styles.eyeToggleBtn}
                  onPress={() => setShowPassword(!showPassword)}
                  activeOpacity={0.7}
                >
                  <MaterialIcons
                    name={showPassword ? 'visibility' : 'visibility-off'}
                    size={20}
                    color="#94A3B8"
                  />
                </TouchableOpacity>
              </View>

              {/* Remember Me & Forgot Password Row */}
              <View style={styles.rememberForgotRow}>
                <TouchableOpacity
                  style={styles.rememberMeBtn}
                  onPress={() => setRememberMe(!rememberMe)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkboxBox, rememberMe && styles.checkboxBoxChecked]}>
                    {rememberMe && <MaterialIcons name="check" size={13} color="#FFFFFF" />}
                  </View>
                  <Text style={styles.rememberMeText}>Remember me</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.forgotPassBtn}
                  onPress={() => navigation.navigate('ForgetPassword')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.forgotPassText}>Forgot Password?</Text>
                </TouchableOpacity>
              </View>

              {/* Primary Actions Row */}
              <View style={styles.actionButtonsRow}>
                {/* Primary CTA */}
                <TouchableOpacity
                  style={styles.primaryCtaBtn}
                  onPress={handleLogin}
                  disabled={isLoading}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.primaryCtaGradient}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Text style={styles.primaryCtaText}>Sign In to Screening</Text>
                        <MaterialIcons name="arrow-forward" size={18} color="#FFFFFF" />
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                {/* Biometric 1-tap Shortcut Button */}
                <TouchableOpacity
                  style={styles.biometricBtn}
                  onPress={handleBiometricAuth}
                  activeOpacity={0.75}
                >
                  <MaterialIcons name="fingerprint" size={26} color={colors.CYAN_ACCENT} />
                </TouchableOpacity>
              </View>
            </Animated.View>

            {/* Alternative Social Auth Divider */}
            <Animated.View
              entering={FadeInDown.duration(600).delay(350)}
              style={styles.socialAuthContainer}
            >
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR CONTINUE WITH</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Social Buttons (Google & Apple) */}
              <View style={styles.socialGrid}>
                <TouchableOpacity
                  style={styles.socialBtn}
                  activeOpacity={0.8}
                  onPress={() => handleSocialAuth('Google')}
                >
                  <MaterialIcons name="g-translate" size={18} color="#EA4335" />
                  <Text style={styles.socialBtnText}>Google</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.socialBtn}
                  activeOpacity={0.8}
                  onPress={() => handleSocialAuth('Apple')}
                >
                  <Ionicons name="logo-apple" size={18} color="#FFFFFF" />
                  <Text style={styles.socialBtnText}>Apple</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>

            {/* Footer Sign Up Link */}
            <Animated.View
              entering={FadeInDown.duration(600).delay(450)}
              style={styles.footerContainer}
            >
              <Text style={styles.footerText}>
                Don't have an account?{' '}
                <Text
                  style={styles.signUpLinkText}
                  onPress={() => navigation.navigate('SignUp')}
                >
                  Sign Up
                </Text>
              </Text>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
  },
  ambientTopGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 350,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  // Brand Presentation
  brandContainer: {
    alignItems: 'center',
    marginBottom: 26,
  },
  logoWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 8,
    marginBottom: 12,
  },
  logoGradient: {
    flex: 1,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  brandTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  brandTitleWhite: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 4,
  },
  brandTitleBlue: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.PRIMARY_COLOR,
    letterSpacing: 4,
  },
  vipTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.CYAN_ACCENT,
    letterSpacing: 2.5,
    marginBottom: 14,
  },
  welcomeTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  welcomeSubtext: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 18,
  },

  // Glass Form Card
  formCard: {
    gap: 14,
  },
  glassInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 54,
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  glassInputBoxFocused: {
    borderColor: colors.PRIMARY_COLOR,
    backgroundColor: colors.SURFACE_ELEVATED,
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  inputLeftIcon: {
    marginRight: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: '#F8FAFC',
    fontWeight: '500',
  },
  eyeToggleBtn: {
    padding: 6,
  },
  rememberForgotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
    marginTop: -2,
    marginBottom: 2,
  },
  rememberMeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: colors.PRIMARY_COLOR,
    borderColor: colors.PRIMARY_COLOR,
  },
  rememberMeText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  forgotPassBtn: {
    paddingVertical: 4,
  },
  forgotPassText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.CYAN_ACCENT,
  },

  // Action Buttons
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  primaryCtaBtn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryCtaGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  primaryCtaText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  biometricBtn: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.SURFACE_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.4)',
    shadowColor: colors.CYAN_ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },

  // Social Auth
  socialAuthContainer: {
    marginTop: 26,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  dividerText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: '#64748B',
    paddingHorizontal: 12,
  },
  socialGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  socialBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_COLOR,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  socialBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E2E8F0',
  },

  // Footer
  footerContainer: {
    alignItems: 'center',
    marginTop: 28,
  },
  footerText: {
    fontSize: 13,
    color: '#94A3B8',
  },
  signUpLinkText: {
    fontWeight: '700',
    color: colors.FILM_GOLD,
  },
});

export default LoginScreen;
