/**
 * Authentication state for the whole app.
 *
 * Replaces the old UserContext, which stored a bare user id in AsyncStorage -
 * that meant reinstalling the app lost the wardrobe, and anyone could read
 * anyone else's data by guessing an id. Now we persist a signed token and the
 * backend resolves the account from it.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { api, setAuthToken, setUnauthorizedHandler } from '../api/client';

const AuthContext = createContext(null);
const TOKEN_KEY = 'lookcheck_token';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(async () => {
    setAuthToken(null);
    setUser(null);
    await AsyncStorage.removeItem(TOKEN_KEY);
  }, []);

  // A 401 from any request means the token is gone or expired - drop straight
  // back to the sign-in screen instead of showing broken screens.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAuthToken(null);
      setUser(null);
      AsyncStorage.removeItem(TOKEN_KEY);
    });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const storedToken = await AsyncStorage.getItem(TOKEN_KEY);
        if (storedToken) {
          setAuthToken(storedToken);
          setUser(await api.getMe());
        }
      } catch (err) {
        setAuthToken(null);
        await AsyncStorage.removeItem(TOKEN_KEY);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function persistSession({ user: nextUser, token }) {
    setAuthToken(token);
    await AsyncStorage.setItem(TOKEN_KEY, token);
    setUser(nextUser);
    return nextUser;
  }

  async function signIn(email, password) {
    return persistSession(await api.login(email, password));
  }

  async function signUp(profile) {
    return persistSession(await api.register(profile));
  }

  async function refreshUser() {
    const fresh = await api.getMe();
    setUser(fresh);
    return fresh;
  }

  async function updateProfile(data) {
    setUser(await api.updateProfile(data));
  }

  async function updateLocation(data) {
    setUser(await api.updateLocation(data));
  }

  async function setAiConsent(granted) {
    setUser(await api.setAiConsent(granted));
  }

  async function deleteAccount() {
    await api.deleteAccount();
    await signOut();
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signUp,
        signOut,
        refreshUser,
        updateProfile,
        updateLocation,
        setAiConsent,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
