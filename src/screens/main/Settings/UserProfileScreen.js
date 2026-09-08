import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { auth, database } from '../../../config/firebase';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import LinearGradient from 'react-native-linear-gradient';
import Header from '../../../components/Header';
import colors from '../../../theme/Colors';

const UserProfileScreen = ({ navigation }) => {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth().onAuthStateChanged(user => {
      if (user) {
        const userRef = database().ref('users/' + user.uid);
        userRef.on('value', snapshot => {
          const data = snapshot.val();
          if (data) {
            setUserData(data);
          }
          setLoading(false);
        });
      }
    });
    return unsubscribe;
  }, []);

  const handleSignOut = async () => {
    try {
      await auth().signOut();
    } catch (error) {
      console.error(error);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={colors.PRIMARY_COLOR} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <Header showLogo borderBottom={false} />

      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}>
        <View style={styles.profileSection}>
          {/* Avatar */}
          <LinearGradient
            colors={[colors.GRADIENT_START, colors.GRADIENT_END]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatarGradient}>
            <Text style={styles.avatarText}>
              {userData?.username
                ? userData.username[0].toUpperCase()
                : '?'}
            </Text>
          </LinearGradient>

          <Text style={styles.usernameText}>{userData?.username}</Text>
          <Text style={styles.emailText}>{userData?.email}</Text>
          <Text style={styles.joinedText}>
            Joined{' '}
            {new Date(userData?.createdAt).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </Text>

          {/* Stats */}
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>0</Text>
              <Text style={styles.statLabel}>Rooms Created</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>0</Text>
              <Text style={styles.statLabel}>Rooms Joined</Text>
            </View>
          </View>

          {/* Menu Items */}
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate('Settings')}
            activeOpacity={0.8}>
            <View style={styles.menuIconWrap}>
              <MaterialIcons name="settings" size={20} color={colors.TITLE_COLOR} />
            </View>
            <Text style={styles.menuItemText}>Settings</Text>
            <MaterialIcons
              name="chevron-right"
              size={22}
              color={colors.MUTED_COLOR}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate('HelpAndSupport')}
            activeOpacity={0.8}>
            <View style={[styles.menuIconWrap, { backgroundColor: 'rgba(0, 200, 83, 0.12)' }]}>
              <MaterialIcons name="help" size={20} color={colors.ACCEPT_GREEN} />
            </View>
            <Text style={styles.menuItemText}>Help & Support</Text>
            <MaterialIcons
              name="chevron-right"
              size={22}
              color={colors.MUTED_COLOR}
            />
          </TouchableOpacity>

          {/* Sign Out */}
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOut}
            activeOpacity={0.8}>
            <MaterialIcons name="logout" size={20} color={colors.DELETE_RED_COLOR} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  profileSection: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
  },

  // Avatar
  avatarGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 16,
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 10,
  },
  avatarText: {
    fontSize: 40,
    color: '#FFF',
    fontWeight: '700',
  },
  usernameText: {
    fontSize: 24,
    color: colors.TITLE_COLOR,
    fontWeight: '700',
    marginBottom: 6,
  },
  emailText: {
    fontSize: 14,
    color: colors.SUB_TITLE_COLOR,
    marginBottom: 6,
  },
  joinedText: {
    fontSize: 13,
    color: colors.MUTED_COLOR,
    marginBottom: 24,
  },

  // Stats
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.CARD_COLOR,
    borderRadius: 18,
    padding: 20,
    marginBottom: 28,
    width: '100%',
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  divider: {
    width: 1,
    backgroundColor: colors.INPUTBOX_BORDER_COLOR,
    marginHorizontal: 16,
  },
  statNumber: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.TITLE_COLOR,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: colors.SUB_TITLE_COLOR,
    fontWeight: '500',
  },

  // Menu Items
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.CARD_COLOR,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    width: '100%',
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  menuIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 122, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  menuItemText: {
    flex: 1,
    fontSize: 16,
    color: colors.TITLE_COLOR,
    fontWeight: '500',
  },

  // Sign Out
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.08)',
    borderRadius: 16,
    padding: 16,
    marginTop: 'auto',
    marginBottom: 32,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.15)',
    gap: 14,
  },
  signOutText: {
    fontSize: 16,
    color: colors.DELETE_RED_COLOR,
    fontWeight: '600',
  },
});

export default UserProfileScreen;