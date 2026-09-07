import React from 'react';
import { ActivityIndicator, Text, View, StyleSheet } from 'react-native';

import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { StatusBar } from 'expo-status-bar';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { AuthProvider, useAuth } from './src/context/AuthContext';

import { colors, type } from './src/theme';

import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';

import TodayLookScreen from './src/screens/TodayLookScreen';
import EventLookScreen from './src/screens/EventLookScreen';
import WardrobeScreen from './src/screens/WardrobeScreen';

import AddItemScreen from './src/screens/AddItemScreen';
import EditItemScreen from './src/screens/EditItemScreen';

import LooksScreen from './src/screens/LooksScreen';
import LookBuilderScreen from './src/screens/LookBuilderScreen';

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

const TAB_ICONS = {
  Today: {
    active: 'home-variant',
    inactive: 'home-variant-outline',
  },
  Occasions: {
    active: 'calendar-blank',
    inactive: 'calendar-blank-outline',
  },
  Wardrobe: {
    active: 'tshirt-crew',
    inactive: 'tshirt-crew-outline',
  },
  Settings: {
    active: 'cog',
    inactive: 'cog-outline',
  },
};

function WardrobeStackScreen() {
  return (
    <WardrobeStack.Navigator screenOptions={{ headerShown: false }}>
      <WardrobeStack.Screen
        name="WardrobeList"
        component={WardrobeScreen}
      />

      <WardrobeStack.Screen
        name="AddItem"
        component={AddItemScreen}
      />

      <WardrobeStack.Screen
        name="EditItem"
        component={EditItemScreen}
      />

      <WardrobeStack.Screen
        name="Looks"
        component={LooksScreen}
      />

      <WardrobeStack.Screen
        name="LookBuilder"
        component={LookBuilderScreen}
      />
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

          height: 84,

          paddingTop: 7,
          paddingBottom: 6,
        },

        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textFaint,

        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.3,
          textTransform: 'none',
          marginTop: 1,
        },

        tabBarIconStyle: {
          marginBottom: 0,
        },

        tabBarItemStyle: {
          paddingVertical: 2,
        },

        tabBarIcon: ({ focused, color }) => {
          const icons = TAB_ICONS[route.name];

          return (
            <MaterialCommunityIcons
              name={focused ? icons.active : icons.inactive}
              size={22}
              color={color}
            />
          );
        },
      })}
    >
      <Tab.Screen
        name="Today"
        component={TodayLookScreen}
      />

      <Tab.Screen
        name="Occasions"
        component={EventLookScreen}
      />

      <Tab.Screen
        name="Wardrobe"
        component={WardrobeStackScreen}
      />

      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
      />
    </Tab.Navigator>
  );
}

function AuthFlow() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen
        name="Login"
        component={LoginScreen}
      />

      <AuthStack.Screen
        name="Register"
        component={RegisterScreen}
      />
    </AuthStack.Navigator>
  );
}

function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.splash}>
        <Text style={styles.splashMark}>
          LOOKCHECK
        </Text>

        <ActivityIndicator
          color={colors.accent}
          style={{ marginTop: 20 }}
        />
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
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
  },

  splashMark: {
    ...type.title,
    letterSpacing: 4,
    fontSize: 20,
  },
});