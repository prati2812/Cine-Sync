import React, {useState} from 'react';
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
  withSpring,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {auth} from '../../config/firebase';
import {sendPasswordResetEmail} from 'firebase/auth';
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

const ForgetPasswordScreen = ({navigation}) => {
  const [email, setEmail] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Animation values
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


  // Function to check user existence
  const checkUserExists = async email => {
    try {
      const db = getDatabase();
      const usersRef = ref(db, 'users');
      const userQuery = query(usersRef, orderByChild('email'), equalTo(email));

      const snapshot = await get(userQuery);
      console.log('User snapshot:', snapshot.val());

      return snapshot.exists();
    } catch (error) {
      console.log('Error checking user:', error);
      return false;
    }
  };


  // Reset Password Handler
  const handleResetPassword = async () => {
    try {
      setIsLoading(true);
      if(email.trim().length === 0){
        Alert.alert('Error', 'Please enter your email address.');
        setIsLoading(false);
        return;
      }

      const userExists = await checkUserExists(email);

      if (userExists) {
        await sendPasswordResetEmail(auth, email)
          .then(() => {
            opacity.value = withTiming(0, {duration: 300});
            scale.value = withTiming(0.8, {duration: 300});

            // Show success animation
            setTimeout(() => {
              setIsSuccess(true);
              successOpacity.value = withSequence(
                withTiming(1, {duration: 300}),
                withSpring(1.1),
                withSpring(1),
              );
            }, 300);

            // Navigate back after delay
            setTimeout(() => {
              navigation.navigate('Login');
            }, 3000);
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <View style={styles.contentContainer}>
          {!isSuccess ? (
            <Animated.View style={[styles.formContent, formAnimatedStyle]}>
              <View style={styles.headerContainer}>
                <Icon
                  name="lock-open-outline"
                  size={48}
                  color="#007AFF"
                  style={styles.headerIcon}
                />
                <Text style={styles.title}>Forgot Password?</Text>
                <Text style={styles.subtitle}>
                  No worries! Enter your email and we'll send you reset
                  instructions.
                </Text>
              </View>

              <View style={styles.formContainer}>
                <CustomInput
                  label={"Email Address"}
                  leftIcon={"mail-outline"}
                  leftIconStyle={{color: colors.PRIMARY_COLOR}}
                  placeholder={"Enter your email"}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <TouchableOpacity
                  style={styles.button}
                  onPress={handleResetPassword}
                  activeOpacity={0.7}>
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
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.linkContainer}
                  onPress={() => navigation.navigate('Login')}>
                  <Icon
                    name="arrow-back-outline"
                    size={16}
                    color="#007AFF"
                    style={styles.backIcon}
                  />
                  <Text style={styles.link}>Back to Login</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          ) : (
            <Animated.View
              style={[styles.successContainer, successAnimatedStyle]}>
              <Icon name="checkmark-circle-outline" size={80} color="#4CAF50" />
              <Text style={styles.successTitle}>Check Your Email</Text>
              <Text style={styles.successText}>
                We've sent password reset instructions to your email address.
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
  formContainer: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#FFFFFF',
  },
  button: {
    backgroundColor: '#007AFF',
    height: 56,
    borderRadius: 12,
    flexDirection: 'row',
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
    color: '#007AFF',
    fontSize: 15,
    fontWeight: '500',
  },
  formContent: {
    width: '100%',
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

export default ForgetPasswordScreen;
