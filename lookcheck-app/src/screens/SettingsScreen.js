import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import * as Location from 'expo-location';
import { useUser } from '../context/UserContext';
import { api } from '../api/client';

const STYLES = ['Casual', 'Streetwear', 'Business', 'Minimalist', 'Sport', 'Formal'];

export default function SettingsScreen() {
  const { user, refreshUser, logout } = useUser();
  const [updating, setUpdating] = useState(false);

  async function handleChangeLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Location access is required.');
      return;
    }
    setUpdating(true);
    try {
      const position = await Location.getCurrentPositionAsync({});
      const places = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      const city = places[0]?.city || places[0]?.region || null;

      await api.updateLocation(user.id, {
        city,
        lat: position.coords.latitude,
        lon: position.coords.longitude,
      });
      await refreshUser();
      Alert.alert('Location updated', city || 'Location saved');
    } catch (err) {
      Alert.alert('Could not update location', err.message);
    } finally {
      setUpdating(false);
    }
  }

  if (!user) return null;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.heading}>Settings</Text>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Name</Text>
        <Text style={styles.value}>{user.name}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Style preference</Text>
        <Text style={styles.value}>{user.style_preference}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Location</Text>
        <Text style={styles.value}>{user.city || 'Not set'}</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={handleChangeLocation}
          disabled={updating}
        >
          <Text style={styles.buttonText}>
            {updating ? 'Updating...' : 'Update to current location'}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Reset profile</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20, paddingTop: 60 },
  heading: { fontSize: 28, fontWeight: '800', marginBottom: 24 },
  section: { marginBottom: 24, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 16 },
  sectionLabel: { fontSize: 12, color: '#888', textTransform: 'uppercase', marginBottom: 4 },
  value: { fontSize: 17, fontWeight: '600', color: '#1a1a1a' },
  button: { marginTop: 12, alignSelf: 'flex-start' },
  buttonText: { color: '#1a1a1a', fontWeight: '700', textDecorationLine: 'underline' },
  logoutButton: { marginTop: 20, alignItems: 'center', padding: 14 },
  logoutText: { color: '#c44', fontWeight: '600' },
});
