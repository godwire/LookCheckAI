import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';

import { UserProvider, useUser } from './src/context/UserContext';
import OnboardingScreen from './src/screens/OnboardingScreen';
import TodayLookScreen from './src/screens/TodayLookScreen';
import EventLookScreen from './src/screens/EventLookScreen';
import WardrobeScreen from './src/screens/WardrobeScreen';
import AddItemScreen from './src/screens/AddItemScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const WardrobeStack = createNativeStackNavigator();

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

function RootNavigator() {
  const { user, loading } = useUser();

  if (loading) return null; // could show a splash screen here

  return (
    <NavigationContainer>
      {user ? <MainTabs /> : <OnboardingScreen />}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <UserProvider>
      <RootNavigator />
    </UserProvider>
  );
}
