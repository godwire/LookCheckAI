import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, ScrollView, ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';

import { useAuth } from '../context/AuthContext';
import { STYLE_OPTIONS } from '../config';
import { colors, space, radius, type } from '../theme';

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
      Alert.alert('Location is off', 'Outfits are matched to local weather. You can turn this on later in Settings.');
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
      Alert.alert('Location unavailable', err.message);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) return setError('Add a name so the app knows what to call you.');
    if (password.length < 8) return setError('Passwords need at least 8 characters.');

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
        <Text style={styles.mark}>LOOKCHECK</Text>
        <Text style={styles.title}>Set up your wardrobe</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />

        <Text style={[styles.label, styles.spaced]}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="At least 8 characters"
          placeholderTextColor={colors.textFaint}
          secureTextEntry
          autoCapitalize="none"
        />

        <Text style={[styles.label, styles.spaced]}>Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Heorhii"
          placeholderTextColor={colors.textFaint}
        />

        <Text style={[styles.label, styles.spaced]}>How you dress</Text>
        <View style={styles.chips}>
          {STYLE_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.chip, style === option && styles.chipActive]}
              onPress={() => setStyle(option)}
            >
              <Text style={[styles.chipText, style === option && styles.chipTextActive]}>
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.label, styles.spaced]}>Location</Text>
        <TouchableOpacity style={styles.locationButton} onPress={handleUseLocation}>
          <Text style={[styles.locationText, coords && styles.locationSet]}>
            {coords ? (city || 'Location saved') : 'Use my current location'}
          </Text>
          <Text style={styles.locationHint}>
            {coords ? 'Tap to update' : 'Used only to check today\u2019s weather'}
          </Text>
        </TouchableOpacity>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.primary, submitting && styles.disabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator color={colors.accentInk} />
            : <Text style={styles.primaryText}>Create account</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.link} onPress={() => navigation.goBack()}>
          <Text style={styles.linkText}>I already have an account</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.ink },
  container: { padding: space.xl, paddingTop: 80, paddingBottom: space.xxl },
  mark: { ...type.label, letterSpacing: 4, marginBottom: space.lg },
  title: { ...type.display, marginBottom: space.xxl },
  label: { ...type.label },
  spaced: { marginTop: space.xl },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: colors.lineStrong,
    paddingVertical: space.md,
    fontSize: 17,
    color: colors.text,
    marginTop: space.xs,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space.md },
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
  locationButton: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: space.lg,
    marginTop: space.md,
  },
  locationText: { color: colors.textMuted, fontSize: 15 },
  locationSet: { color: colors.text, fontWeight: '600' },
  locationHint: { color: colors.textFaint, fontSize: 12, marginTop: 4 },
  error: { color: colors.negative, fontSize: 14, marginTop: space.xl, lineHeight: 20 },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.lg,
    alignItems: 'center',
    marginTop: space.xxl,
    minHeight: 54,
    justifyContent: 'center',
  },
  disabled: { opacity: 0.6 },
  primaryText: { color: colors.accentInk, fontSize: 16, fontWeight: '700' },
  link: { alignItems: 'center', paddingVertical: space.lg },
  linkText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
});
