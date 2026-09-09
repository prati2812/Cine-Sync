import React from 'react';
import { Provider } from 'react-redux';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { store } from './src/store/store';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <SafeAreaProvider initialWindowMetrics={initialWindowMetrics}>
      <Provider store={store}>
        <AppNavigator />
      </Provider>
    </SafeAreaProvider>
  );
}

