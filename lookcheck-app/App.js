import React from 'react';
import { ActivityIndicator, Text, View, StyleSheet } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { colors, type } from './src/theme';
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

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.ink,
    card: colors.ink,
    text: colors.text,
    border: colors.line,
    primary: colors.accent,
  },
};

/**
 * Tab marks are typographic rather than pictorial: at this size a wordmark
 * reads faster than an icon, and it keeps the chrome in the same achromatic
 * register as the rest of the app.
 */
const TAB_MARKS = { Today: '—', Occasions: '◇', Wardrobe: '▤', Settings: '≡' };

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
        tabBarStyle: {
          backgroundColor: colors.ink,
          borderTopColor: colors.line,
          borderTopWidth: 1,
          height: 88,
          paddingTop: 10,
        },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 0.8,
          textTransform: 'uppercase',
        },
        tabBarIcon: ({ color }) => (
          <Text style={{ fontSize: 16, color, marginBottom: 2 }}>{TAB_MARKS[route.name]}</Text>
        ),
      })}
    >
      <Tab.Screen name="Today" component={TodayLookScreen} />
      <Tab.Screen name="Occasions" component={EventLookScreen} />
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
        <Text style={styles.splashMark}>LOOKCHECK</Text>
        <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      {user ? <MainTabs /> : <AuthFlow />}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <RootNavigator />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink },
  splashMark: { ...type.title, letterSpacing: 4, fontSize: 20 },
});
