import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';

const UserContext = createContext(null);
const STORAGE_KEY = 'lookcheck_user_id';

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStoredUser();
  }, []);

  async function loadStoredUser() {
    try {
      const storedId = await AsyncStorage.getItem(STORAGE_KEY);
      if (storedId) {
        const fetchedUser = await api.getUser(storedId);
        setUser(fetchedUser);
      }
    } catch (err) {
      console.warn('Could not load stored user:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function createUser(profile) {
    const newUser = await api.createUser(profile);
    await AsyncStorage.setItem(STORAGE_KEY, String(newUser.id));
    setUser(newUser);
    return newUser;
  }

  async function refreshUser() {
    if (!user) return;
    const fresh = await api.getUser(user.id);
    setUser(fresh);
  }

  async function logout() {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }

  return (
    <UserContext.Provider value={{ user, loading, createUser, refreshUser, logout }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within a UserProvider');
  return ctx;
}
