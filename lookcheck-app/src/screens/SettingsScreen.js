import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Switch,
} from 'react-native';
import * as Location from 'expo-location';

import { useAuth } from '../context/AuthContext';
import { STYLE_OPTIONS } from '../config';
import { colors, space, radius, type } from '../theme';

export default function SettingsScreen() {
  const { user, updateProfile, updateLocation, setAiConsent, signOut, deleteAccount } = useAuth();
  const [updating, setUpdating] = useState(false);

  async function handleChangeLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Location is off', 'Turn on location access to match outfits to local weather.');
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
      await updateLocation({ city, lat: position.coords.latitude, lon: position.coords.longitude });
    } catch (err) {
      Alert.alert('Location not updated', err.message);
    } finally {
      setUpdating(false);
    }
  }

  async function handleChangeStyle(style) {
    try {
      await updateProfile({ style_preference: style });
    } catch (err) {
      Alert.alert('Style not updated', err.message);
    }
  }

  async function handleToggleConsent(granted) {
    try {
      await setAiConsent(granted);
    } catch (err) {
      Alert.alert('Choice not saved', err.message);
    }
  }

  function confirmSignOut() {
    Alert.alert('Sign out?', 'Your wardrobe stays on your account.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  }

  /**
   * Both stores require account deletion to be available inside the app, not
   * only as a link to a website.
   */
  function confirmDeleteAccount() {
    Alert.alert(
      'Delete your account?',
      'Your account, wardrobe and outfit history are removed for good. This cannot be undone.',
      [
        { text: 'Keep my account', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
            } catch (err) {
              Alert.alert('Not deleted', err.message);
            }
          },
        },
      ]
    );
  }

  if (!user) return null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>{user.email}</Text>
      <Text style={styles.display}>{user.name}</Text>

      <Text style={styles.sectionLabel}>How you dress</Text>
      <View style={styles.chips}>
        {STYLE_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option}
            style={[styles.chip, user.style_preference === option && styles.chipActive]}
            onPress={() => handleChangeStyle(option)}
          >
            <Text
              style={[styles.chipText, user.style_preference === option && styles.chipTextActive]}
            >
              {option}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.divider} />

      <Text style={styles.sectionLabel}>Location</Text>
      <Text style={styles.value}>{user.city || 'Not set'}</Text>
      <TouchableOpacity onPress={handleChangeLocation} disabled={updating}>
        <Text style={styles.action}>
          {updating ? 'Updating…' : 'Use my current location'}
        </Text>
      </TouchableOpacity>

      <View style={styles.divider} />

      <View style={styles.switchRow}>
        <View style={styles.switchText}>
          <Text style={styles.sectionLabel}>AI recognition</Text>
          <Text style={styles.help}>
            Sends photos and shop links to an external AI provider so garments are recognised
            automatically. Outfit matching works without it.
          </Text>
        </View>
        <Switch
          value={!!user.ai_consent_at}
          onValueChange={handleToggleConsent}
          trackColor={{ false: colors.lineStrong, true: colors.accent }}
          thumbColor={colors.text}
        />
      </View>

      <View style={styles.divider} />

      <TouchableOpacity style={styles.footerAction} onPress={confirmSignOut}>
        <Text style={styles.signOut}>Sign out</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.footerAction} onPress={confirmDeleteAccount}>
        <Text style={styles.delete}>Delete my account</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  content: { padding: space.xl, paddingTop: 72, paddingBottom: space.xxxl },
  eyebrow: { ...type.label, marginBottom: space.sm },
  display: { ...type.display, marginBottom: space.xxl },
  sectionLabel: { ...type.label, marginBottom: space.sm },
  value: { ...type.heading, fontSize: 17, fontWeight: '600' },
  action: { color: colors.accent, fontSize: 14, fontWeight: '600', marginTop: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.pill,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    marginRight: space.sm,
    marginBottom: space.sm,
  },
  chipActive: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { color: colors.textMuted, fontSize: 14 },
  chipTextActive: { color: colors.ink, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: space.xl },
  switchRow: { flexDirection: 'row', alignItems: 'flex-start' },
  switchText: { flex: 1, paddingRight: space.lg },
  help: { ...type.small, fontSize: 13, lineHeight: 19 },
  footerAction: { paddingVertical: space.md },
  signOut: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  delete: { color: colors.negative, fontSize: 15, fontWeight: '600' },
});
