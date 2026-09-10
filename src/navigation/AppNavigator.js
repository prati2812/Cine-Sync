import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, AppState } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// import { getDatabase, ref, update, onDisconnect, onValue, serverTimestamp, get } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useDispatch } from 'react-redux';
import { setUser, clearUser, updateStatus } from '../store/slices/user/userSlice';
import { auth, database } from '../config/firebase';

import LoginScreen from '../screens/auth/LoginScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import ForgetPasswordScreen from '../screens/auth/ForgetPasswordScreen';
import VerifyEmailScreen from '../screens/auth/VerifyEmailScreen';
import PINVerificationScreen from '../screens/auth/PINVerificationScreen';
import WaitingScreen from '../screens/main/Streaming/WaitingScreen';
import StreamingScreen from '../screens/main/Streaming/StreamingScreen';
import SettingsScreen from '../screens/main/Settings/SettingsScreen';
import ChatScreen from '../screens/main/Chat/ChatScreen';
import CreateRoomScreen from '../screens/main/Streaming/CreateRoomScreen';
import HelpAndSupportScreen from '../screens/main/Settings/HelpAndSupportScreen';
import SetupPINScreen from '../screens/main/Settings/SetupPINScreen';
import StreamInfoScreen from '../screens/main/Streaming/StreamInfoScreen';
import MainTabs from './MainTabs';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { navigationRef } from './navigationRef';
import GlobalIncomingCallNotifier from '../components/GlobalIncomingCallNotifier';

const Stack = createNativeStackNavigator();

const AppNavigator = () => {
  const [initializing, setInitializing] = useState(true);
  const [user, setLocalUser] = useState(null);
  const [isPINRequired, setIsPINRequired] = useState(false);
  const [isPINVerified, setIsPINVerified] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const dispatch = useDispatch();

  const updateUserStatus = async (status) => {
    if (!user) return;

    await database()
      .ref(`users/${user.uid}/status`)
      .update({
        state: status,
        last_changed: database.ServerValue.TIMESTAMP,
      });
  };

  useEffect(() => {
    const checkPIN = async () => {
      const pin = await AsyncStorage.getItem('@app_lock_pin');
      setIsPINRequired(!!pin);
    };
    checkPIN();
  }, []);

  const handleAuthStateChanged = async authUser => {
    setLocalUser(authUser);
    if (initializing) setInitializing(false);

    if (authUser) {
      try {
        const userStatusRef = database().ref(
          `users/${authUser.uid}/status`
        );
       
        database()
          .ref('.info/connected')
          .on('value', snapshot => {
            if (!snapshot.val()) return;

            userStatusRef
              .onDisconnect()
              .update({
                state: 'offline',
                last_changed: database.ServerValue.TIMESTAMP,
              })
              .then(() => {
                userStatusRef.update({
                  state: 'online',
                  last_changed: database.ServerValue.TIMESTAMP,
                });
              });
          });


        const snapshot = await database()
          .ref(`users/${authUser.uid}`)
          .once('value');


        if (snapshot.exists()) {
          const userData = snapshot.val();
          dispatch(setUser(userData));
        } else {
          console.log('User data not found in database.');
        }
      } catch (error) {
        console.log('Error checking email verification:', error);
      }
    }
  };

  useEffect(() => {
    const unsubscribe = auth().onAuthStateChanged(handleAuthStateChanged);
    return unsubscribe;
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') updateUserStatus('online');
      else updateUserStatus('offline');
    });
    return () => sub.remove();
  }, [user]);

  if (initializing)
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );

  if (user && isPINRequired && !isPINVerified)
    return <PINVerificationScreen onSuccess={() => setIsPINVerified(true)} />;

  if (user && !user.emailVerified && !isEmailVerified)
    return <VerifyEmailScreen onSuccess={() => setIsEmailVerified(true)} />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <NavigationContainer ref={navigationRef}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {user ? (
              <>
                <Stack.Screen name="MainTabs" component={MainTabs} />
                <Stack.Screen name="WaitingScreen" component={WaitingScreen} />
                <Stack.Screen name="Streaming" component={StreamingScreen} />
                <Stack.Screen name="StreamInfo" component={StreamInfoScreen} />
                <Stack.Screen name="Settings" component={SettingsScreen} />
                <Stack.Screen name="Chat" component={ChatScreen} />
                <Stack.Screen name="CreateRoom" component={CreateRoomScreen} />
                <Stack.Screen
                  name="HelpAndSupport"
                  component={HelpAndSupportScreen}
                />
                <Stack.Screen name="SetupPIN" component={SetupPINScreen} />
              </>
            ) : (
              <>
                <Stack.Screen name="Login" component={LoginScreen} />
                <Stack.Screen name="SignUp" component={SignUpScreen} />
                <Stack.Screen
                  name="ForgetPassword"
                  component={ForgetPasswordScreen}
                />
              </>
            )}
          </Stack.Navigator>
        </NavigationContainer>
        {user && <GlobalIncomingCallNotifier currentUser={user} />}
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
};

export default AppNavigator;
