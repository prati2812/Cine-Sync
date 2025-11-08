import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  SafeAreaView, 
  ScrollView,
  TextInput,
  Alert,
  Switch,
  Image,
  Dimensions
} from 'react-native';
import { auth } from '../../../config/firebase';
import { 
  updateProfile, 
  updatePassword, 
  deleteUser, 
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail
} from 'firebase/auth';
import { getDatabase, ref, update } from 'firebase/database';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

const SettingsScreen = ({ navigation }) => {
  const [username, setUsername] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [appLock, setAppLock] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  useEffect(() => {
    const currentUser = auth.currentUser;
    console.log(currentUser);
    
    if (currentUser?.username) {
      setUsername(currentUser.username);
    }

    const checkAppLock = async () => {
      try {
        const pin = await AsyncStorage.getItem('@app_lock_pin');
        setAppLock(!!pin);
      } catch (error) {
        console.error('Error checking app lock:', error);
      }
    };

    checkAppLock();
  }, []);

  const handleUpdateUsername = async () => {
    if (!username.trim()) {
      Alert.alert('Error', 'Username cannot be empty');
      return;
    }

    try {
      const user = auth.currentUser;
      const db = getDatabase();
      
      // Update in Firebase Auth
      await updateProfile(user, {
        displayName: username
      });

      // Update in Realtime Database
      await update(ref(db, `users/${user.uid}`), {
        username: username
      });

      Alert.alert('Success', 'Username updated successfully');
      setIsEditing(false);
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const handleResetPassword = async () => {
    try {
      const user = auth.currentUser;
      await sendPasswordResetEmail(auth, user.email);
      Alert.alert(
        'Success', 
        'Password reset email sent. Please check your inbox.'
      );
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const handleDeleteAccount = async () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const user = auth.currentUser;
              await deleteUser(user);
              // Navigation will be handled by the auth state listener in App.js
            } catch (error) {
              if (error.code === 'auth/requires-recent-login') {
                Alert.alert(
                  'Re-authentication Required',
                  'Please log out and log in again to delete your account.'
                );
              } else {
                Alert.alert('Error', error.message);
              }
            }
          },
        },
      ]
    );
  };

  const handleAppLockToggle = async () => {
    if (!appLock) {
      navigation.navigate('SetupPIN');
    } else {
      Alert.alert(
        'Disable App Lock',
        'Are you sure you want to disable app lock?',
        [
          {
            text: 'Cancel',
            style: 'cancel'
          },
          {
            text: 'Disable',
            style: 'destructive',
            onPress: async () => {
              try {
                await AsyncStorage.removeItem('@app_lock_pin');
                setAppLock(false);
              } catch (error) {
                Alert.alert('Error', 'Failed to disable app lock');
              }
            }
          }
        ]
      );
    }
  };

  // Add a focus effect to check PIN status when screen is focused
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', async () => {
      try {
        const pin = await AsyncStorage.getItem('@app_lock_pin');
        setAppLock(!!pin);
      } catch (error) {
        console.error('Error checking app lock:', error);
      }
    });

    return unsubscribe;
  }, [navigation]);

  const SettingRow = ({ label, value, onPress, icon, isLast }) => (
    <TouchableOpacity 
      style={[styles.settingRow, !isLast && styles.settingRowBorder]} 
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.settingRowLeft}>
        <View style={styles.iconContainer}>
          <MaterialIcons name={icon} size={22} color="#FFFFFF" />
        </View>
        <Text style={styles.settingLabel}>{label}</Text>
      </View>
      {typeof value === 'boolean' ? (
        <Switch
          value={value}
          onValueChange={onPress}
          trackColor={{ false: '#767577', true: '#81b0ff' }}
          thumbColor={value ? '#007AFF' : '#f4f3f4'}
        />
      ) : (
        <View style={styles.settingRowRight}>
          {value && <Text style={styles.settingValue}>{value}</Text>}
          <MaterialIcons name="chevron-right" size={20} color="#666666" />
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>
              {username ? username[0].toUpperCase() : 'U'}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            {isEditing ? (
              <Animated.View 
                entering={FadeIn}
                exiting={FadeOut}
                style={styles.editContainer}
              >
                <TextInput
                  style={styles.input}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Enter new username"
                  placeholderTextColor="#666666"
                />
                <TouchableOpacity 
                  style={styles.saveButton}
                  onPress={handleUpdateUsername}
                >
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
              </Animated.View>
            ) : (
              <TouchableOpacity 
                style={styles.usernameContainer} 
                onPress={() => setIsEditing(true)}
              >
                <Text style={styles.username}>
                  {username || auth.currentUser?.email.split('@')[0]}
                </Text>
                <MaterialIcons name="edit" size={20} color="#007AFF" />
              </TouchableOpacity>
            )}
            <Text style={styles.email}>{auth.currentUser?.email}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Settings</Text>
          <View style={styles.sectionContent}>
            <SettingRow
              label="Push Notifications"
              value={notifications}
              onPress={() => setNotifications(!notifications)}
              icon="notifications"
            />
            <SettingRow
              label="Dark Mode"
              value={darkMode}
              onPress={() => setDarkMode(!darkMode)}
              icon="brightness-4"
            />
            <SettingRow
              label="App Lock"
              value={appLock}
              onPress={handleAppLockToggle}
              icon="lock"
              isLast
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>
          <View style={styles.sectionContent}>
            <SettingRow
              label="Reset Password"
              onPress={handleResetPassword}
              icon="lock-reset"
            />
            <SettingRow
              label="Privacy Settings"
              onPress={() => {/* Handle privacy settings */}}
              icon="security"
            />
            <SettingRow
              label="Blocked Users"
              onPress={() => {/* Handle blocked users */}}
              icon="block"
              isLast
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.sectionContent}>
            <SettingRow
              label="App Version"
              value="1.0.0"
              icon="info"
              onPress={() => {}}
            />
            <SettingRow
              label="Terms of Service"
              icon="description"
              onPress={() => {}}
            />
            <SettingRow
              label="Privacy Policy"
              icon="privacy-tip"
              onPress={() => {}}
              isLast
            />
          </View>
        </View>

        <TouchableOpacity 
          style={styles.deleteButton}
          onPress={handleDeleteAccount}
        >
          <MaterialIcons name="delete-forever" size={24} color="#FF3B30" />
          <Text style={styles.deleteButtonText}>Delete Account</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#333333',
    shadowColor: '#007AFF',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  avatarContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 16,
  },
  usernameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  username: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  email: {
    fontSize: 14,
    color: '#666666',
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sectionContent: {
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#333333',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  settingRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  settingRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#007AFF20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  settingRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingValue: {
    fontSize: 16,
    color: '#666666',
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 40,
    backgroundColor: '#333333',
    borderRadius: 8,
    paddingHorizontal: 12,
    color: '#FFFFFF',
    marginRight: 12,
  },
  editContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  saveButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF3B3015',
    borderRadius: 20,
    padding: 18,
    marginBottom: 32,
    gap: 10,
    borderWidth: 1,
    borderColor: '#FF3B3030',
  },
  deleteButtonText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default SettingsScreen; 