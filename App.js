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
const Stack = createNativeStackNavigator();

const App = () => {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState(null);

  // Handle user state changes
  function handleAuthStateChanged(user) {
    setUser(user);
    if (initializing) setInitializing(false);
  }

  useEffect(() => {
    // Check if there's a stored user session when the app starts
    const checkAuthState = async () => {
      try {
        // Subscribe to auth state changes
        const unsubscribe = onAuthStateChanged(auth, handleAuthStateChanged);
        return unsubscribe;
      } catch (error) {
        console.error("Auth state check error:", error);
        setInitializing(false);
      }
    };

    checkAuthState();
  }, []);

  if (initializing) {
    return (
      <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
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
  );
};

export default App;
