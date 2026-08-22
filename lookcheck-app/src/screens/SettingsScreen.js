import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Switch,
} from 'react-native';
import * as Location from 'expo-location';

import { useAuth } from '../context/AuthContext';
import { STYLE_OPTIONS } from '../config';

export default function SettingsScreen() {
  const { user, updateProfile, updateLocation, setAiConsent, signOut, deleteAccount } = useAuth();
  const [updating, setUpdating] = useState(false);

  async function handleChangeLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Location access is required to update your location.');
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

      await updateLocation({
        city,
        lat: position.coords.latitude,
        lon: position.coords.longitude,
      });
      Alert.alert('Location updated', city || 'Location saved');
    } catch (err) {
      Alert.alert('Could not update location', err.message);
    } finally {
      setUpdating(false);
    }
  }

  async function handleChangeStyle(style) {
    try {
      await updateProfile({ style_preference: style });
    } catch (err) {
      Alert.alert('Could not update style', err.message);
    }
  }

  async function handleToggleConsent(granted) {
    try {
      await setAiConsent(granted);
    } catch (err) {
      Alert.alert('Could not save your choice', err.message);
    }
  }

  function confirmSignOut() {
    Alert.alert('Sign out', 'You can sign back in at any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  }

  /**
   * Both stores require account deletion to be available inside the app, not
   * just as a link to a website. This removes the account and everything
   * attached to it on the server.
   */
  function confirmDeleteAccount() {
    Alert.alert(
      'Delete account',
      'This permanently deletes your account, your wardrobe and your outfit history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
            } catch (err) {
              Alert.alert('Could not delete account', err.message);
            }
          },
        },
      ]
    );
  }

  if (!user) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Settings</Text>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Account</Text>
        <Text style={styles.value}>{user.name}</Text>
        <Text style={styles.muted}>{user.email}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Style preference</Text>
        <View style={styles.chipRow}>
          {STYLE_OPTIONS.map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.chip, user.style_preference === s && styles.chipActive]}
              onPress={() => handleChangeStyle(s)}
            >
              <Text
                style={[styles.chipText, user.style_preference === s && styles.chipTextActive]}
              >
                {s}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Location</Text>
        <Text style={styles.value}>{user.city || 'Not set'}</Text>
        <TouchableOpacity style={styles.button} onPress={handleChangeLocation} disabled={updating}>
          <Text style={styles.buttonText}>
            {updating ? 'Updating...' : 'Update to current location'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <View style={styles.switchRow}>
          <View style={styles.switchLabel}>
            <Text style={styles.sectionLabel}>AI analysis</Text>
            <Text style={styles.muted}>
              Allow photos and product links to be sent to an external AI provider so clothing can
              be recognised automatically. Outfit suggestions work without this.
            </Text>
          </View>
          <Switch value={!!user.ai_consent_at} onValueChange={handleToggleConsent} />
        </View>
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={confirmSignOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.deleteButton} onPress={confirmDeleteAccount}>
        <Text style={styles.deleteText}>Delete my account</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  heading: { fontSize: 28, fontWeight: '800', marginBottom: 24 },
  section: { marginBottom: 24, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 16 },
  sectionLabel: { fontSize: 12, color: '#888', textTransform: 'uppercase', marginBottom: 4 },
  value: { fontSize: 17, fontWeight: '600', color: '#1a1a1a' },
  muted: { fontSize: 13, color: '#888', marginTop: 4, lineHeight: 18 },
  button: { marginTop: 12, alignSelf: 'flex-start' },
  buttonText: { color: '#1a1a1a', fontWeight: '700', textDecorationLine: 'underline' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  chip: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 20,
    paddingVertical: 8, paddingHorizontal: 14, marginRight: 8, marginBottom: 8,
  },
  chipActive: { backgroundColor: '#1a1a1a', borderColor: '#1a1a1a' },
  chipText: { color: '#333' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  switchRow: { flexDirection: 'row', alignItems: 'flex-start' },
  switchLabel: { flex: 1, paddingRight: 16 },
  signOutButton: { marginTop: 8, alignItems: 'center', padding: 14 },
  signOutText: { color: '#1a1a1a', fontWeight: '600' },
  deleteButton: { marginTop: 4, alignItems: 'center', padding: 14 },
  deleteText: { color: '#c44', fontWeight: '600' },
});
