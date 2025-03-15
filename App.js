import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator, TouchableOpacity, StyleSheet, Text } from 'react-native';
import LoginScreen from './src/screens/auth/LoginScreen';
import SignUpScreen from './src/screens/auth/SignUpScreen';
import ForgetPasswordScreen from './src/screens/auth/ForgetPasswordScreen';
import HomeScreen from './src/screens/main/HomeScreen';
import StreamingScreen from './src/screens/main/StreamingScreen';
import UserProfileScreen from './src/screens/main/UserProfileScreen';
import { auth } from './src/config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import Config from 'react-native-config';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import WaitingScreen from './src/screens/main/WaitingScreen';
import { AppState } from 'react-native';
import { getDatabase, ref, set, update, onValue, onDisconnect, serverTimestamp } from 'firebase/database';
import FriendsScreen from './src/screens/main/FriendsScreen';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Animated, { 
  useAnimatedStyle, 
  withSpring, 
  withTiming,
  interpolate
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Ionicons';
import SettingsScreen from './src/screens/main/SettingsScreen';
import ChatScreen from './src/screens/main/ChatScreen';
import CreateRoomScreen from './src/screens/main/CreateRoomScreen';
import HelpAndSupportScreen from './src/screens/main/HelpAndSupportScreen';
import SetupPINScreen from './src/screens/main/SetupPINScreen';
import PINVerificationScreen from './src/screens/auth/PINVerificationScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';


const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const App = () => {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState(null);
  const [isPINRequired, setIsPINRequired] = useState(false);
  const [isPINVerified, setIsPINVerified] = useState(false);

  
  const updateUserStatus = (status) => {
    if (user) {
      const db = getDatabase();
      const userStatusRef = ref(db, `users/${user.uid}/status`);
      update(userStatusRef, {
        state: status,
        last_changed: serverTimestamp(),
      });
    }
  };

  // Check if PIN is required
  useEffect(() => {
    const checkPIN = async () => {
      try {
        const pin = await AsyncStorage.getItem('@app_lock_pin');
        setIsPINRequired(!!pin);
      } catch (error) {
        console.error('Error checking PIN:', error);
      }
    };
    checkPIN();
  }, []);

  // Handle user state changes
  function handleAuthStateChanged(user) {
    setUser(user);
    if (initializing) setInitializing(false);

    if (user) {
      const db = getDatabase();
      const userStatusRef = ref(db, `users/${user.uid}/status`);
      const connectedRef = ref(db, '.info/connected');
      onValue(connectedRef, (snapshot) => {
        if (snapshot.val() === false) {
          return;
        }
        onDisconnect(userStatusRef).update({
          state: 'offline',
          last_changed: serverTimestamp(),
        }).then(() => {
          update(userStatusRef, {
            state: 'online',
            last_changed: serverTimestamp(),
          });
        });
      });
    }
  }

  useEffect(() => {
    const checkAuthState = async () => {
      try {
        const unsubscribe = onAuthStateChanged(auth, handleAuthStateChanged);
        return unsubscribe;
      } catch (error) {
        console.error("Auth state check error:", error);
        
        setInitializing(false);
      }
    };

    checkAuthState();
  }, []);

  useEffect(() => {
    const handleAppStateChange = (nextAppState) => {
      if (nextAppState === 'active') {
        updateUserStatus('online');
      } else {
        updateUserStatus('offline');
      }
    };
    
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [user]);


  if (initializing) {
    return (
      <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Show PIN verification screen if required and not verified
  if (user && isPINRequired && !isPINVerified) {
    return <PINVerificationScreen onSuccess={() => setIsPINVerified(true)} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
            <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="WaitingScreen" component={WaitingScreen} />
            <Stack.Screen name="Streaming" component={StreamingScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="CreateRoom" component={CreateRoomScreen} />
            <Stack.Screen name="HelpAndSupport" component={HelpAndSupportScreen} />
            <Stack.Screen 
              name="SetupPIN" 
              component={SetupPINScreen}
              options={{ headerShown: false }}
            />
            </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="SignUp" component={SignUpScreen} />
            <Stack.Screen name="ForgetPassword" component={ForgetPasswordScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
    </GestureHandlerRootView>
  );
};

function MainTabs() {
  return (
    <Tab.Navigator 
      tabBar={props => <CustomTabBar {...props} />}
      screenOptions={{ 
        headerShown: false,
      }}
    >
      <Tab.Screen 
        name="HomeTab" 
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused }) => (
            <Icon 
              name={focused ? "home" : "home-outline"} 
              size={24} 
              color={focused ? '#007AFF' : '#8E8E93'} 
            />
          ),
        }}
      />
      <Tab.Screen 
        name="Friends" 
        component={FriendsScreen}
        options={{
          tabBarLabel: 'Friends',
          tabBarIcon: ({ focused }) => (
            <Icon 
              name={focused ? "people" : "people-outline"} 
              size={24} 
              color={focused ? '#007AFF' : '#8E8E93'} 
            />
          ),
        }} />
       <Tab.Screen 
        name="Profile" 
        component={UserProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ focused }) => (
            <Icon 
              name={focused ? "person" : "person-outline"} 
              size={24} 
              color={focused ? '#007AFF' : '#8E8E93'} 
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// Update the CustomTabBar component
const CustomTabBar = ({ state, descriptors, navigation }) => {
  return (
    <View style={styles.tabBarContainer}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = options.tabBarLabel || route.name;
        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const animatedIconStyle = useAnimatedStyle(() => {
          return {
            transform: [
              {
                scale: withSpring(isFocused ? 1.2 : 1, {
                  mass: 1,
                  damping: 15,
                  stiffness: 200,
                })
              }
            ],
            opacity: withSpring(isFocused ? 1 : 0.7)
          };
        });

        return (
          <TouchableOpacity
            key={index}
            onPress={onPress}
            style={[
              styles.tabButton,
              isFocused && styles.tabButtonFocused
            ]}
            activeOpacity={0.7}
          >
            <Animated.View style={animatedIconStyle}>
              {options.tabBarIcon({ focused: isFocused })}
            </Animated.View>
            <Text style={[
              styles.tabText,
              isFocused && styles.tabTextFocused
            ]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

// Update the styles
const styles = StyleSheet.create({
  tabBarContainer: {
    paddingTop:5,
    flexDirection: 'row',
    height: 80,
    backgroundColor: '#1C1C1E',
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
    paddingBottom: 20,
    paddingHorizontal: 8,
  },
  tabButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 10,
    padding:5,
  },
  tabButtonFocused: {
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    borderRadius: 16,
    marginHorizontal: 4,
  },
  tabText: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
  },
  tabTextFocused: {
    color: '#007AFF',
    fontWeight: '600',
  },
});

export default App;
