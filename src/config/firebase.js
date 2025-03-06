import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import config from 'react-native-config';

const firebaseConfig = {
  apiKey:"AIzaSyCxBAaNNiK1g5KiObdIwLqJnWav5fJsRRs",
  authDomain:"nightwatcher-89f6e.firebaseapp.com",
  databaseURL:"https://nightwatcher-89f6e-default-rtdb.firebaseio.com",
  projectId:"nightwatcher-89f6e",
  storageBucket:"nightwatcher-89f6e.firebasestorage.app",
  messagingSenderId:"719989061898",
  appId:"1:719989061898:web:3932f5e005a28764a1e2f3",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth with persistence
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});

const database = getDatabase(app);

export { app, auth, database }; 