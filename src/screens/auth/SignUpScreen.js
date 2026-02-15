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
  StatusBar,
  TouchableWithoutFeedback,
  Keyboard,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import Logo from '../../components/Logo';
import { auth } from '../../config/firebase';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
} from 'firebase/auth';
import { getDatabase, ref, set } from 'firebase/database';
import colors from '../../theme/Colors';
import CustomInput from '../../components/UI/CustomInput';
import LinearGradient from 'react-native-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

const SignUpScreen = ({ navigation }) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSignUp = async () => {
    setIsLoading(true);
    if (!username || !email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      setIsLoading(false);
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );

      await sendEmailVerification(userCredential.user);

      const db = getDatabase();
      const userData = {
        username: username,
        email: email,
        userId: userCredential.user.uid,
        createdAt: new Date().toISOString(),
      };

      await set(ref(db, 'users/' + userCredential.user.uid), userData);

      console.log('User account created & signed in!');
      setIsLoading(false);
    } catch (error) {
      setIsLoading(false);
      if (error.code === 'auth/email-already-in-use') {
        Alert.alert('Error', 'That email address is already in use!');
      } else if (error.code === 'auth/invalid-email') {
        Alert.alert('Error', 'That email address is invalid!');
      } else if (error.code === 'auth/weak-password') {
        Alert.alert('Error', 'Password should be at least 6 characters');
      } else {
        Alert.alert('Error', error.message);
      }
      console.log('New Error', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        backgroundColor={colors.STATUSBAR_BG_COLOR}
        barStyle="light-content"
      />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            showsVerticalScrollIndicator={false}>
            <View style={styles.contentContainer}>
              <Animated.View
                entering={FadeInDown.duration(800).delay(200)}
                style={styles.headerContainer}>
                <Logo size="large" />
                <Text style={styles.title}>Create Account</Text>
                <Text style={styles.subtitle}>
                  Join the community of movie enthusiasts
                </Text>
              </Animated.View>

              <Animated.View
                entering={FadeInDown.duration(800).delay(400)}
                style={styles.formCard}>
                <View style={styles.formContainer}>
                  <CustomInput
                    label={'Username'}
                    leftIcon={'person-outline'}
                    placeholder="Choose a username"
                    value={username}
                    onChangeText={setUsername}
                    iconColor={colors.PRIMARY_COLOR}
                  />

                  <CustomInput
                    label={'Email'}
                    leftIcon={'mail-outline'}
                    placeholder="Enter your email"
                    value={email}
                    onChangeText={setEmail}
                    iconColor={colors.PRIMARY_COLOR}
                  />

                  <CustomInput
                    label="Password"
                    leftIcon="lock-closed-outline"
                    rightIcon={showPassword ? 'eye-outline' : 'eye-off-outline'}
                    placeholder="Enter password"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    onRightIconPress={() => setShowPassword(!showPassword)}
                    iconColor={colors.PRIMARY_COLOR}
                  />

                  <TouchableOpacity
                    onPress={handleSignUp}
                    disabled={isLoading}
                    activeOpacity={0.8}>
                    <LinearGradient
                      colors={[colors.GRADIENT_START, colors.GRADIENT_END]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[
                        styles.button,
                        isLoading && styles.buttonDisabled,
                      ]}>
                      {isLoading ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.buttonText}>Create Account</Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.linkContainer}
                    onPress={() => navigation.navigate('Login')}>
                    <Text style={styles.linkText}>Already have an account? </Text>
                    <Text style={styles.link}>Login</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
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
    marginBottom: 40,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.TITLE_COLOR,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: colors.SUB_TITLE_COLOR,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 22,
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
  formContainer: {
    width: '100%',
  },
  button: {
    padding: 18,
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
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  linkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  linkText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 15,
  },
  link: {
    color: colors.PRIMARY_COLOR,
    fontSize: 15,
    fontWeight: '700',
  },
});

export default SignUpScreen;
