import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, ScrollView,
} from 'react-native';
import * as Location from 'expo-location';
import { useUser } from '../context/UserContext';

const STYLES = ['Casual', 'Streetwear', 'Business', 'Minimalist', 'Sport', 'Formal'];

export default function OnboardingScreen() {
  const { createUser } = useUser();
  const [name, setName] = useState('');
  const [style, setStyle] = useState('Casual');
  const [city, setCity] = useState('');
  const [coords, setCoords] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleUseLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Location access lets us suggest weather-appropriate outfits.');
      return;
    }
    const position = await Location.getCurrentPositionAsync({});
    setCoords({ lat: position.coords.latitude, lon: position.coords.longitude });

    const places = await Location.reverseGeocodeAsync({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });
    if (places.length > 0) setCity(places[0].city || places[0].region || '');
  }

  async function handleSubmit() {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please tell us what to call you.');
      return;
    }
    setSubmitting(true);
    try {
      await createUser({
        name: name.trim(),
        style_preference: style,
        city: city || null,
        lat: coords?.lat ?? null,
        lon: coords?.lon ?? null,
      });
    } catch (err) {
      Alert.alert('Something went wrong', err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>👗 LookCheck AI</Text>
        <Text style={styles.subtitle}>Your daily AI stylist. Let's set up your profile.</Text>

        <Text style={styles.label}>What's your name?</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Heorhii"
        />

        <Text style={styles.label}>Preferred style</Text>
        <View style={styles.chipRow}>
          {STYLES.map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.chip, style === s && styles.chipActive]}
              onPress={() => setStyle(s)}
            >
              <Text style={[styles.chipText, style === s && styles.chipTextActive]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Location (for weather-based suggestions)</Text>
        <TouchableOpacity style={styles.locationButton} onPress={handleUseLocation}>
          <Text style={styles.locationButtonText}>
            {coords ? `📍 ${city || 'Location set'}` : '📍 Use my current location'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Text style={styles.submitButtonText}>
            {submitting ? 'Setting up...' : "Let's go"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 24, paddingTop: 60 },
  title: { fontSize: 30, fontWeight: '800', marginBottom: 4 },
  subtitle: { fontSize: 15, color: '#666', marginBottom: 32 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8, marginTop: 20 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    padding: 14, fontSize: 16,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 20,
    paddingVertical: 8, paddingHorizontal: 16, marginRight: 8, marginBottom: 8,
  },
  chipActive: { backgroundColor: '#1a1a1a', borderColor: '#1a1a1a' },
  chipText: { color: '#333' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  locationButton: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    padding: 14, alignItems: 'center',
  },
  locationButtonText: { fontSize: 15, color: '#333' },
  submitButton: {
    backgroundColor: '#1a1a1a', borderRadius: 10,
    padding: 16, alignItems: 'center', marginTop: 40,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
