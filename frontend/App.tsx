import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar, SafeAreaView, StyleSheet, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from './src/context/AuthContext';
import { RideProvider } from './src/context/RideContext';
import { NotificationProvider } from './src/context/NotificationContext';
import RootNavigator from './src/navigation/RootNavigator';
import { Colors } from './src/constants/colors';

export default function App() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={styles.container}>
        <StatusBar
          barStyle={Platform.OS === 'ios' ? 'dark-content' : 'light-content'}
          backgroundColor={Colors.background}
          translucent={Platform.OS === 'android'}
        />
        <NavigationContainer>
          <AuthProvider>
            <NotificationProvider>
              <RideProvider>
                <RootNavigator />
              </RideProvider>
            </NotificationProvider>
          </AuthProvider>
        </NavigationContainer>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
