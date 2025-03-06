import React, { useState } from 'react';
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
  ActivityIndicator
} from 'react-native';
import Logo from '../../components/Logo';
import Icon from 'react-native-vector-icons/Ionicons';
import { auth } from '../../config/firebase';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { getDatabase, ref, set } from 'firebase/database';


const SignUpScreen = ({ navigation }) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
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
      console.log("New Error",error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
         backgroundColor="#121212"
         barStyle="light-content"
       />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}> 
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
      <ScrollView
        contentContainerStyle={{flexGrow: 1, paddingBottom:15}}
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
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Username</Text>
              <View style={styles.inputWrapper}>
                <Icon name="person-outline" size={20} color="#666666" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Choose a username"
                  placeholderTextColor="#666666"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputWrapper}>
                <Icon name="mail-outline" size={20} color="#666666" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your email"
                  placeholderTextColor="#666666"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrapper}>
                <Icon name="lock-closed-outline" size={20} color="#666666" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Create a password"
                  placeholderTextColor="#666666"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
              </View>
            </View>

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
    marginBottom: 30,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#888888',
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
    color: '#FFFFFF',
    marginBottom: 8,
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333333',
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    color: '#FFFFFF',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 32,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  linkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  linkText: {
    color: '#888888',
    fontSize: 14,
  },
  link: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default SignUpScreen; 