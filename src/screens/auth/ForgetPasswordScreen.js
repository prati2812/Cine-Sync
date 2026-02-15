import React, { useState } from 'react';
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
  withSpring,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  FadeInDown,
} from 'react-native-reanimated';
import { auth } from '../../config/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import {
  getDatabase,
  ref,
  get,
  query,
  orderByChild,
  equalTo,
} from 'firebase/database';
import CustomInput from '../../components/UI/CustomInput';
import colors from '../../theme/Colors';
import LinearGradient from 'react-native-linear-gradient';

const ForgetPasswordScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Animation values
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const successOpacity = useSharedValue(0);

  const formAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const successAnimatedStyle = useAnimatedStyle(() => ({
    opacity: successOpacity.value,
    transform: [{ scale: successOpacity.value }],
  }));

  const checkUserExists = async email => {
    try {
      const db = getDatabase();
      const usersRef = ref(db, 'users');
      const userQuery = query(usersRef, orderByChild('email'), equalTo(email));

      const snapshot = await get(userQuery);
      return snapshot.exists();
    } catch (error) {
      console.log('Error checking user:', error);
      return false;
    }
  };

  const handleResetPassword = async () => {
    try {
      setIsLoading(true);
      if (email.trim().length === 0) {
        Alert.alert('Error', 'Please enter your email address.');
        setIsLoading(false);
        return;
      }

      const userExists = await checkUserExists(email);

      if (userExists) {
        await sendPasswordResetEmail(auth, email)
          .then(() => {
            opacity.value = withTiming(0, { duration: 300 });
            scale.value = withTiming(0.8, { duration: 300 });

            setTimeout(() => {
              setIsSuccess(true);
              successOpacity.value = withSequence(
                withTiming(1, { duration: 300 }),
                withSpring(1.1),
                withSpring(1),
              );
            }, 300);

            setTimeout(() => {
              navigation.navigate('Login');
            }, 4000);
          })
          .catch(error => {
            console.log('Error sending password reset email:', error);
            setIsLoading(false);
          });
      } else {
        Alert.alert(
          'User Not Found',
          'This user is not registered in the app.',
        );
        setIsLoading(false);
      }
    } catch (error) {
      console.log(error);
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
          {!isSuccess ? (
            <Animated.View
              entering={FadeInDown.duration(800)}
              style={[styles.formContent, formAnimatedStyle]}>
              <View style={styles.headerContainer}>
                <LinearGradient
                  colors={[colors.GRADIENT_START, colors.GRADIENT_END]}
                  style={styles.iconCircle}>
                  <Icon name="lock-open-outline" size={32} color="#FFFFFF" />
                </LinearGradient>
                <Text style={styles.title}>Forgot Password?</Text>
                <Text style={styles.subtitle}>
                  No worries! Enter your email and we'll send you reset
                  instructions.
                </Text>
              </View>

              <View style={styles.formCard}>
                <CustomInput
                  label={'Email Address'}
                  leftIcon={'mail-outline'}
                  placeholder={'Enter your email'}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  iconColor={colors.PRIMARY_COLOR}
                />

                <TouchableOpacity
                  onPress={handleResetPassword}
                  activeOpacity={0.8}>
                  <LinearGradient
                    colors={[colors.GRADIENT_START, colors.GRADIENT_END]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.button}>
                    {isLoading ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Text style={styles.buttonText}>Send Instructions</Text>
                        <Icon
                          name="arrow-forward"
                          size={20}
                          color="#FFFFFF"
                          style={styles.buttonIcon}
                        />
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.linkContainer}
                  onPress={() => navigation.navigate('Login')}>
                  <Icon
                    name="arrow-back-outline"
                    size={18}
                    color={colors.PRIMARY_COLOR}
                    style={styles.backIcon}
                  />
                  <Text style={styles.link}>Back to Login</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          ) : (
            <Animated.View
              style={[styles.successContainer, successAnimatedStyle]}>
              <Icon
                name="checkmark-circle-outline"
                size={80}
                color={colors.ACCEPT_GREEN}
              />
              <Text style={styles.successTitle}>Check Your Email</Text>
              <Text style={styles.successText}>
                We've sent password reset instructions to your email address.
              </Text>
              <Text style={styles.redirectText}>Redirecting to Login...</Text>
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
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
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
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: colors.SUB_TITLE_COLOR,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  formCard: {
    backgroundColor: colors.CARD_COLOR,
    borderRadius: 24,
    padding: 24,
    width: '100%',
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  formContent: {
    width: '100%',
  },
  button: {
    height: 56,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginRight: 8,
  },
  buttonIcon: {
    marginLeft: 4,
  },
  linkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  backIcon: {
    marginRight: 6,
  },
  link: {
    color: colors.PRIMARY_COLOR,
    fontSize: 15,
    fontWeight: '700',
  },
  successContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  successTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.TITLE_COLOR,
    marginTop: 20,
    marginBottom: 12,
    textAlign: 'center',
  },
  successText: {
    fontSize: 16,
    color: colors.SUB_TITLE_COLOR,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  redirectText: {
    fontSize: 14,
    color: colors.MUTED_COLOR,
    marginTop: 30,
    fontStyle: 'italic',
  },
});

export default ForgetPasswordScreen;
