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
  Dimensions,
} from 'react-native';
import { auth } from '../../../config/firebase';
import {
  updateProfile,
  updatePassword,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { getDatabase, ref, update } from 'firebase/database';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import LinearGradient from 'react-native-linear-gradient';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import colors from '../../../theme/Colors';

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

      await updateProfile(user, { displayName: username });
      await update(ref(db, `users/${user.uid}`), { username: username });

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
        'Password reset email sent. Please check your inbox.',
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
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const user = auth.currentUser;
              await deleteUser(user);
            } catch (error) {
              if (error.code === 'auth/requires-recent-login') {
                Alert.alert(
                  'Re-authentication Required',
                  'Please log out and log in again to delete your account.',
                );
              } else {
                Alert.alert('Error', error.message);
              }
            }
          },
        },
      ],
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
          { text: 'Cancel', style: 'cancel' },
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
            },
          },
        ],
      );
    }
  };

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

  // ── Setting Row Component ─────────────────────────────────
  const SettingRow = ({ label, value, onPress, icon, iconColor, isLast }) => (
    <TouchableOpacity
      style={[styles.settingRow, !isLast && styles.settingRowBorder]}
      onPress={onPress}
      activeOpacity={0.7}>
      <View style={styles.settingRowLeft}>
        <View style={[styles.iconContainer, iconColor && { backgroundColor: iconColor + '18' }]}>
          <MaterialIcons
            name={icon}
            size={20}
            color={iconColor || colors.PRIMARY_COLOR}
          />
        </View>
        <Text style={styles.settingLabel}>{label}</Text>
      </View>
      {typeof value === 'boolean' ? (
        <Switch
          value={value}
          onValueChange={onPress}
          trackColor={{ false: colors.MUTED_COLOR, true: colors.GRADIENT_START + '80' }}
          thumbColor={value ? colors.PRIMARY_COLOR : colors.SUB_TITLE_COLOR}
        />
      ) : (
        <View style={styles.settingRowRight}>
          {value && <Text style={styles.settingValue}>{value}</Text>}
          <MaterialIcons
            name="chevron-right"
            size={20}
            color={colors.MUTED_COLOR}
          />
        </View>
      )}
    </TouchableOpacity>
  );

  // ── Render ──────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}>
          <MaterialIcons
            name="arrow-back-ios"
            size={18}
            color={colors.TITLE_COLOR}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <LinearGradient
            colors={[colors.GRADIENT_START, colors.GRADIENT_END]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatarContainer}>
            <Text style={styles.avatarText}>
              {username ? username[0].toUpperCase() : 'U'}
            </Text>
          </LinearGradient>
          <View style={styles.profileInfo}>
            {isEditing ? (
              <Animated.View
                entering={FadeIn}
                exiting={FadeOut}
                style={styles.editContainer}>
                <TextInput
                  style={styles.input}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Enter new username"
                  placeholderTextColor={colors.MUTED_COLOR}
                />
                <TouchableOpacity onPress={handleUpdateUsername}>
                  <LinearGradient
                    colors={[colors.GRADIENT_START, colors.GRADIENT_END]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.saveButton}>
                    <Text style={styles.saveButtonText}>Save</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            ) : (
              <TouchableOpacity
                style={styles.usernameContainer}
                onPress={() => setIsEditing(true)}>
                <Text style={styles.username}>
                  {username || auth.currentUser?.email.split('@')[0]}
                </Text>
                <MaterialIcons
                  name="edit"
                  size={18}
                  color={colors.FILM_GOLD}
                />
              </TouchableOpacity>
            )}
            <Text style={styles.email}>{auth.currentUser?.email}</Text>
          </View>
        </View>

        {/* App Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Settings</Text>
          <View style={styles.sectionContent}>
            <SettingRow
              label="Push Notifications"
              value={notifications}
              onPress={() => setNotifications(!notifications)}
              icon="notifications"
              iconColor={colors.FILM_GOLD}
            />
            <SettingRow
              label="Dark Mode"
              value={darkMode}
              onPress={() => setDarkMode(!darkMode)}
              icon="brightness-4"
              iconColor={colors.PURPLE_ACCENT}
            />
            <SettingRow
              label="App Lock"
              value={appLock}
              onPress={handleAppLockToggle}
              icon="lock"
              iconColor={colors.CYAN_ACCENT}
              isLast
            />
          </View>
        </View>

        {/* Security */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>
          <View style={styles.sectionContent}>
            <SettingRow
              label="Reset Password"
              onPress={handleResetPassword}
              icon="lock-reset"
              iconColor={colors.PRIMARY_COLOR}
            />
            <SettingRow
              label="Privacy Settings"
              onPress={() => { }}
              icon="security"
              iconColor={colors.ACCEPT_GREEN}
            />
            <SettingRow
              label="Blocked Users"
              onPress={() => { }}
              icon="block"
              iconColor={colors.DELETE_RED_COLOR}
              isLast
            />
          </View>
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.sectionContent}>
            <SettingRow
              label="App Version"
              value="1.0.0"
              icon="info"
              iconColor={colors.CYAN_ACCENT}
              onPress={() => { }}
            />
            <SettingRow
              label="Terms of Service"
              icon="description"
              iconColor={colors.SUB_TITLE_COLOR}
              onPress={() => { }}
            />
            <SettingRow
              label="Privacy Policy"
              icon="privacy-tip"
              iconColor={colors.PURPLE_ACCENT}
              onPress={() => { }}
              isLast
            />
          </View>
        </View>

        {/* Delete */}
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDeleteAccount}
          activeOpacity={0.8}>
          <MaterialIcons
            name="delete-forever"
            size={22}
            color={colors.DELETE_RED_COLOR}
          />
          <Text style={styles.deleteButtonText}>Delete Account</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.BORDER_SUBTLE,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.TITLE_COLOR,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },

  content: {
    flex: 1,
    padding: 16,
  },

  // Profile Card
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.CARD_COLOR,
    borderRadius: 20,
    padding: 18,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  avatarContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFF',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 14,
  },
  usernameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  username: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.TITLE_COLOR,
  },
  email: {
    fontSize: 13,
    color: colors.SUB_TITLE_COLOR,
    marginTop: 3,
  },

  // Sections
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.PRIMARY_COLOR,
    marginBottom: 10,
    paddingHorizontal: 4,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  sectionContent: {
    backgroundColor: colors.CARD_COLOR,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    overflow: 'hidden',
  },

  // Setting Row
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  settingRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.BORDER_SUBTLE,
  },
  settingRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  settingLabel: {
    fontSize: 15,
    color: colors.TITLE_COLOR,
    fontWeight: '500',
  },
  settingRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingValue: {
    fontSize: 14,
    color: colors.MUTED_COLOR,
    marginRight: 6,
  },

  // Edit
  input: {
    flex: 1,
    height: 38,
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 10,
    paddingHorizontal: 12,
    color: colors.TITLE_COLOR,
    marginRight: 10,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
    fontSize: 14,
  },
  editContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  saveButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 13,
  },

  // Delete
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.08)',
    borderRadius: 18,
    padding: 16,
    marginBottom: 32,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.15)',
  },
  deleteButtonText: {
    color: colors.DELETE_RED_COLOR,
    fontSize: 15,
    fontWeight: '600',
  },
});

export default SettingsScreen;