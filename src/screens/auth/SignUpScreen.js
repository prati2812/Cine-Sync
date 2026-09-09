import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StatusBar,
  TouchableWithoutFeedback,
  Keyboard,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, database } from '../../config/firebase';
import colors from '../../theme/Colors';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

const SignUpScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // Focus states
  const [focusedField, setFocusedField] = useState(null);

  // Dynamic notch & status bar padding
  const safeTopPadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 12
  ) + 8;

  // Password Strength Calculation (0 - 4)
  const getPasswordStrength = pass => {
    if (!pass) return 0;
    let score = 0;
    if (pass.length >= 6) score += 1;
    if (pass.length >= 8) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;
    return score;
  };

  const strength = getPasswordStrength(password);
  const passwordsMatch =
    confirmPassword.length > 0 && password === confirmPassword;

  const handleSignUp = async () => {
    if (isLoading) return;

    if (!username.trim() || !email.trim() || !password.trim()) {
      Alert.alert('Incomplete Form', 'Please complete all required fields.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Passwords do not match. Please verify.');
      return;
    }

    if (!agreedToTerms) {
      Alert.alert('Terms Required', 'Please agree to the Cine-Sync Terms of Screening.');
      return;
    }

    setIsLoading(true);
    try {
      const userCredential = await auth().createUserWithEmailAndPassword(
        email.trim(),
        password,
      );

      await userCredential.user.sendEmailVerification();

      const userData = {
        username: username.trim(),
        email: email.trim(),
        userId: userCredential.user.uid,
        createdAt: new Date().toISOString(),
      };

      await database().ref(`users/${userCredential.user.uid}`).set(userData);
      console.log('User account created & registered in RTDB!');
    } catch (error) {
      console.log('SignUp Error:', error);
      if (error.code === 'auth/email-already-in-use') {
        Alert.alert('Email In Use', 'That email address is already registered.');
      } else if (error.code === 'auth/invalid-email') {
        Alert.alert('Invalid Email', 'Please provide a valid email address.');
      } else if (error.code === 'auth/weak-password') {
        Alert.alert('Weak Password', 'Password must be at least 6 characters.');
      } else {
        Alert.alert('Registration Failed', error.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar
        backgroundColor={colors.BACKGROUND_COLOR}
        barStyle="light-content"
        translucent
      />

      {/* Ambient Radial Top Glows - exact match to LoginScreen */}
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
          {/* Header Navigation Bar */}
          <View style={[styles.headerBar, { paddingTop: safeTopPadding }]}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.75}
            >
              <MaterialIcons name="chevron-left" size={24} color="#CBD5E1" />
            </TouchableOpacity>

            {/* Mini Live VIP Lounge Badge */}
            <View style={styles.vipBadge}>
              <View style={styles.livePulseDot} />
              <Text style={styles.vipBadgeText}>VIP Screening Access</Text>
            </View>

            <View style={{ width: 40 }} />
          </View>

          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(insets.bottom, 20) + 20 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {/* Header Section */}
            <Animated.View
              entering={FadeInDown.duration(600).delay(100)}
              style={styles.headerSection}
            >
              <View style={styles.startBadge}>
                <MaterialIcons name="auto-awesome" size={13} color={colors.FILM_GOLD} />
                <Text style={styles.startBadgeText}>START STREAMING</Text>
              </View>

              <Text style={styles.pageTitle}>Create VIP Account</Text>
              <Text style={styles.pageSubtext}>
                Watch movies in perfect real-time sync with spatial audio
              </Text>
            </Animated.View>

            {/* Form Fields */}
            <Animated.View
              entering={FadeInDown.duration(600).delay(250)}
              style={styles.formContainer}
            >
              {/* 1. Username Field */}
              <View
                style={[
                  styles.glassInputBox,
                  focusedField === 'username' && styles.glassInputBoxFocused,
                ]}
              >
                <MaterialIcons
                  name="person-outline"
                  size={20}
                  color={colors.CYAN_ACCENT}
                  style={styles.inputLeftIcon}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder="Choose cinema handle (e.g. NolanFan)"
                  placeholderTextColor="#64748B"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  onFocus={() => setFocusedField('username')}
                  onBlur={() => setFocusedField(null)}
                />
                {username.trim().length >= 3 && (
                  <View style={styles.availabilityBadge}>
                    <MaterialIcons name="check-circle" size={12} color={colors.ACCEPT_GREEN} />
                    <Text style={styles.availabilityText}>Available</Text>
                  </View>
                )}
              </View>

              {/* 2. Email Field */}
              <View
                style={[
                  styles.glassInputBox,
                  focusedField === 'email' && styles.glassInputBoxFocused,
                ]}
              >
                <MaterialIcons
                  name="mail-outline"
                  size={20}
                  color={colors.PRIMARY_COLOR}
                  style={styles.inputLeftIcon}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter your email address"
                  placeholderTextColor="#64748B"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>

              {/* 3. Password Field with Strength Meter */}
              <View>
                <View
                  style={[
                    styles.glassInputBox,
                    focusedField === 'password' && styles.glassInputBoxFocused,
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
                    placeholder="Create master password"
                    placeholderTextColor="#64748B"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    activeOpacity={0.7}
                    style={styles.eyeBtn}
                  >
                    <MaterialIcons
                      name={showPassword ? 'visibility' : 'visibility-off'}
                      size={20}
                      color="#94A3B8"
                    />
                  </TouchableOpacity>
                </View>

                {/* Password Strength Meter Bar */}
                {password.length > 0 && (
                  <View style={styles.strengthWrap}>
                    <View style={styles.strengthBarRow}>
                      {[1, 2, 3, 4].map(idx => {
                        const isFilled = strength >= idx;
                        let barColor = colors.DELETE_RED_COLOR;
                        if (strength === 2) barColor = colors.FILM_GOLD;
                        if (strength >= 3) barColor = colors.ACCEPT_GREEN;

                        return (
                          <View
                            key={idx}
                            style={[
                              styles.strengthSegment,
                              isFilled
                                ? { backgroundColor: barColor }
                                : { backgroundColor: 'rgba(255, 255, 255, 0.08)' },
                            ]}
                          />
                        );
                      })}
                    </View>
                    <View style={styles.strengthLabelRow}>
                      <Text
                        style={[
                          styles.strengthText,
                          {
                            color:
                              strength >= 3
                                ? colors.ACCEPT_GREEN
                                : strength === 2
                                ? colors.FILM_GOLD
                                : colors.DELETE_RED_COLOR,
                          },
                        ]}
                      >
                        {strength >= 4
                          ? 'Very Strong'
                          : strength === 3
                          ? 'Strong Password'
                          : strength === 2
                          ? 'Medium'
                          : 'Weak'}
                      </Text>
                      <Text style={styles.strengthTip}>8+ chars, numbers & symbol</Text>
                    </View>
                  </View>
                )}
              </View>

              {/* 4. Confirm Password Field */}
              <View
                style={[
                  styles.glassInputBox,
                  focusedField === 'confirm' && styles.glassInputBoxFocused,
                ]}
              >
                <MaterialIcons
                  name="check-circle-outline"
                  size={20}
                  color={colors.ACCEPT_GREEN}
                  style={styles.inputLeftIcon}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder="Confirm your password"
                  placeholderTextColor="#64748B"
                  secureTextEntry={!showPassword}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  onFocus={() => setFocusedField('confirm')}
                  onBlur={() => setFocusedField(null)}
                />
                {passwordsMatch && (
                  <View style={styles.matchedBadge}>
                    <MaterialIcons name="done-all" size={14} color={colors.ACCEPT_GREEN} />
                    <Text style={styles.matchedText}>Matched</Text>
                  </View>
                )}
              </View>

              {/* Terms Checkbox */}
              <TouchableOpacity
                style={styles.termsRow}
                onPress={() => setAgreedToTerms(!agreedToTerms)}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.checkboxBox,
                    agreedToTerms && styles.checkboxBoxChecked,
                  ]}
                >
                  {agreedToTerms && (
                    <MaterialIcons name="check" size={14} color="#FFFFFF" />
                  )}
                </View>
                <Text style={styles.termsText}>
                  I agree to Cine-Sync{' '}
                  <Text style={styles.termsLink}>Terms of Screening</Text> &{' '}
                  <Text style={styles.termsLink}>Community Guidelines</Text>
                </Text>
              </TouchableOpacity>

              {/* Primary Action CTA */}
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleSignUp}
                disabled={isLoading}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={[colors.PURPLE_ACCENT, '#5939E6', colors.PRIMARY_COLOR]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.submitGradient}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <MaterialIcons name="local-activity" size={20} color="#FFFFFF" />
                      <Text style={styles.submitText}>Create Account & Enter Lounge</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>

            {/* Footer */}
            <Animated.View
              entering={FadeInDown.duration(600).delay(350)}
              style={styles.footerWrap}
            >
              <Text style={styles.footerText}>
                Already have a VIP ticket?{' '}
                <Text
                  style={styles.logInLink}
                  onPress={() => navigation.navigate('Login')}
                >
                  Log In
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

  // Header Nav
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
    zIndex: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  livePulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.ACCEPT_GREEN,
  },
  vipBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#CBD5E1',
  },

  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 10,
  },

  // Header Section
  headerSection: {
    marginBottom: 20,
  },
  startBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 180, 0, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 0, 0.3)',
    marginBottom: 10,
  },
  startBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.FILM_GOLD,
    letterSpacing: 1,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  pageSubtext: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
  },

  // Form Container
  formContainer: {
    gap: 13,
  },
  glassInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  glassInputBoxFocused: {
    borderColor: colors.PURPLE_ACCENT,
    backgroundColor: colors.SURFACE_ELEVATED,
    shadowColor: colors.PURPLE_ACCENT,
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
  availabilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 200, 83, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 200, 83, 0.3)',
  },
  availabilityText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.ACCEPT_GREEN,
  },
  eyeBtn: {
    padding: 6,
  },

  // Strength Bar
  strengthWrap: {
    marginTop: 6,
    paddingHorizontal: 4,
  },
  strengthBarRow: {
    flexDirection: 'row',
    gap: 6,
    height: 4,
    marginBottom: 6,
  },
  strengthSegment: {
    flex: 1,
    borderRadius: 2,
  },
  strengthLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  strengthText: {
    fontSize: 11,
    fontWeight: '700',
  },
  strengthTip: {
    fontSize: 11,
    color: '#64748B',
  },

  // Match Badge
  matchedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  matchedText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.ACCEPT_GREEN,
  },

  // Terms Checkbox
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingTop: 4,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  checkboxBoxChecked: {
    backgroundColor: colors.PURPLE_ACCENT,
    borderColor: colors.PURPLE_ACCENT,
  },
  termsText: {
    flex: 1,
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 17,
  },
  termsLink: {
    color: colors.CYAN_ACCENT,
    textDecorationLine: 'underline',
  },

  // Submit Button
  submitBtn: {
    height: 52,
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 8,
    shadowColor: colors.PURPLE_ACCENT,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  submitGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  submitText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  // Footer
  footerWrap: {
    alignItems: 'center',
    marginTop: 22,
  },
  footerText: {
    fontSize: 13,
    color: '#94A3B8',
  },
  logInLink: {
    fontWeight: '700',
    color: colors.CYAN_ACCENT,
  },
});

export default SignUpScreen;
