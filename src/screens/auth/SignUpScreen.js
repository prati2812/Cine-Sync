import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
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
} from 'react-native';
import Logo from '../../components/Logo';
import Icon from 'react-native-vector-icons/Ionicons';
import {auth} from '../../config/firebase';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
} from 'firebase/auth';
import {getDatabase, ref, set} from 'firebase/database';
import colors from '../../theme/Colors';
import CustomInput from '../../components/UI/CustomInput';

const SignUpScreen = ({navigation}) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSignUp = async () => {
    console.log('Creating user account...', auth, email, password);
    setIsLoading(true);
    if (!username || !email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      setIsLoading(false);
      return;
    }

    try {
      // Create user with email and password
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );

      await sendEmailVerification(userCredential.user);

      const db = getDatabase();

      // Create user data object
      const userData = {
        username: username,
        email: email,
        userId: userCredential.user.uid,
        createdAt: new Date().toISOString(),
      };

      // Store user data in Realtime Database
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
        Alert.alert('Errorrrr', error.message);
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
            contentContainerStyle={{flexGrow: 1, paddingBottom: 15}}
            showsVerticalScrollIndicator={false}>
            <View style={styles.contentContainer}>
              <View style={styles.headerContainer}>
                <Logo size="large" />
                <Text style={styles.title}>Create Account</Text>
                <Text style={styles.subtitle}>
                  Join the community of movie enthusiasts
                </Text>
              </View>

              <View style={styles.formContainer}>
                <CustomInput
                  label={'Username'}
                  leftIcon={'person-outline'}
                  placeholder="Choose a username"
                  value={username}
                  onChangeText={setUsername}
                />

                <CustomInput
                  label={'Email'}
                  leftIcon={'mail-outline'}
                  placeholder="Enter your email"
                  value={email}
                  onChangeText={setEmail}
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
                />

                <TouchableOpacity
                  style={[styles.button, isLoading && styles.buttonDisabled]}
                  onPress={handleSignUp}
                  disabled={isLoading}
                  activeOpacity={0.8}>
                  {isLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.buttonText}>Create Account</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.linkContainer}
                  onPress={() => navigation.navigate('Login')}>
                  <Text style={styles.linkText}>Already have an account? </Text>
                  <Text style={styles.link}>Login</Text>
                </TouchableOpacity>
              </View>
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
    marginBottom: 30,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.TITLE_COLOR,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: colors.SUB_TITLE_COLOR,
    maxWidth: '80%',
  },
  formContainer: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.TITLE_COLOR,
    marginBottom: 8,
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.INPUTBOX_BG_COLOR,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    color: colors.TITLE_COLOR,
  },
  button: {
    backgroundColor: colors.PRIMARY_COLOR,
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 32,
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    color: colors.TITLE_COLOR,
    fontSize: 16,
    fontWeight: '600',
  },
  linkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  linkText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 14,
  },
  link: {
    color: colors.PRIMARY_COLOR,
    fontSize: 14,
    fontWeight: '500',
  },
});

export default SignUpScreen;
