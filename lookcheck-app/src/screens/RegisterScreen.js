import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, ScrollView, ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';

import { useAuth } from '../context/AuthContext';
import { STYLE_OPTIONS } from '../config';

export default function RegisterScreen({ navigation }) {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [style, setStyle] = useState('Casual');
  const [city, setCity] = useState('');
  const [coords, setCoords] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleUseLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission needed',
        'Location access lets us suggest weather-appropriate outfits. You can also set it later in Settings.'
      );
      return;
    }

    try {
      const position = await Location.getCurrentPositionAsync({});
      setCoords({ lat: position.coords.latitude, lon: position.coords.longitude });

      const places = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      if (places.length > 0) setCity(places[0].city || places[0].region || '');
    } catch (err) {
      Alert.alert('Could not get your location', err.message);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError('Please tell us what to call you.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setSubmitting(true);
    try {
      await signUp({
        email: email.trim(),
        password,
        name: name.trim(),
        style_preference: style,
        city: city || null,
        lat: coords?.lat ?? null,
        lon: coords?.lon ?? null,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>Your daily AI stylist. Let's set up your profile.</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="At least 8 characters"
          secureTextEntry
          autoCapitalize="none"
          textContentType="newPassword"
        />

        <Text style={styles.label}>What's your name?</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Heorhii"
        />

        <Text style={styles.label}>Preferred style</Text>
        <View style={styles.chipRow}>
          {STYLE_OPTIONS.map((s) => (
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

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.primaryButton, submitting && styles.disabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Let's go</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkButton} onPress={() => navigation.goBack()}>
          <Text style={styles.linkText}>I already have an account</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 24, paddingTop: 70, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 4 },
  subtitle: { fontSize: 15, color: '#666', marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8, marginTop: 20 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 16 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 20,
    paddingVertical: 8, paddingHorizontal: 16, marginRight: 8, marginBottom: 8,
  },
  chipActive: { backgroundColor: '#1a1a1a', borderColor: '#1a1a1a' },
  chipText: { color: '#333' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  locationButton: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, alignItems: 'center',
  },
  locationButtonText: { fontSize: 15, color: '#333' },
  errorBox: { backgroundColor: '#fee', borderRadius: 10, padding: 12, marginTop: 20 },
  errorText: { color: '#a33', fontSize: 14 },
  primaryButton: {
    backgroundColor: '#1a1a1a', borderRadius: 10, padding: 16,
    alignItems: 'center', marginTop: 32, minHeight: 54, justifyContent: 'center',
  },
  disabled: { opacity: 0.6 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  linkButton: { alignItems: 'center', padding: 16 },
  linkText: { color: '#1a1a1a', fontWeight: '600' },
});
