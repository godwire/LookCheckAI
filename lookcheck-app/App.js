import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, Text, View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import TodayLookScreen from './src/screens/TodayLookScreen';
import EventLookScreen from './src/screens/EventLookScreen';
import WardrobeScreen from './src/screens/WardrobeScreen';
import AddItemScreen from './src/screens/AddItemScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const WardrobeStack = createNativeStackNavigator();
const AuthStack = createNativeStackNavigator();

const TAB_ICONS = {
  Today: '☀️',
  Events: '🎉',
  Wardrobe: '👗',
  Settings: '⚙️',
};

function WardrobeStackScreen() {
  return (
    <WardrobeStack.Navigator screenOptions={{ headerShown: false }}>
      <WardrobeStack.Screen name="WardrobeList" component={WardrobeScreen} />
      <WardrobeStack.Screen name="AddItem" component={AddItemScreen} />
    </WardrobeStack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: () => <Text style={{ fontSize: 20 }}>{TAB_ICONS[route.name]}</Text>,
        tabBarActiveTintColor: '#1a1a1a',
        tabBarInactiveTintColor: '#aaa',
      })}
    >
      <Tab.Screen name="Today" component={TodayLookScreen} />
      <Tab.Screen name="Events" component={EventLookScreen} />
      <Tab.Screen name="Wardrobe" component={WardrobeStackScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

function AuthFlow() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.splash}>
        <Text style={styles.splashTitle}>👗 LookCheck AI</Text>
        <ActivityIndicator size="large" color="#1a1a1a" style={{ marginTop: 16 }} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {user ? <MainTabs /> : <AuthFlow />}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  splashTitle: { fontSize: 26, fontWeight: '800' },
});
