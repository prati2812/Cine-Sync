import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator } from 'react-native';
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
const Stack = createNativeStackNavigator();
import WaitingScreen from './src/screens/main/WaitingScreen';
import { AppState } from 'react-native';
import { getDatabase, ref, set, update, onValue, onDisconnect, serverTimestamp } from 'firebase/database';
const App = () => {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState(null);

  
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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
            <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="WaitingScreen" component={WaitingScreen} />
            <Stack.Screen name="Streaming" component={StreamingScreen} />
            <Stack.Screen name="Profile" component={UserProfileScreen} />
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

export default App;
