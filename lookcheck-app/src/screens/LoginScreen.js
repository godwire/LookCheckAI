import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';

import { useAuth } from '../context/AuthContext';
import { API_BASE_URL, API_SOURCE } from '../config';
import { colors, space, radius, type } from '../theme';

export default function LoginScreen({ navigation }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password to continue.');
      return;
    }
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
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
        <Text style={styles.display}>What you{'\n'}already own,{'\n'}worn better.</Text>

        <View style={styles.form}>
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
            textContentType="emailAddress"
          />

          <Text style={[styles.label, styles.labelSpaced]}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.textFaint}
            secureTextEntry
            autoCapitalize="none"
            textContentType="password"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.primary, submitting && styles.disabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color={colors.accentInk} />
              : <Text style={styles.primaryText}>Sign in</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.link} onPress={() => navigation.navigate('Register')}>
            <Text style={styles.linkText}>Create an account</Text>
          </TouchableOpacity>
        </View>

        {__DEV__ && <Text style={styles.debug}>{API_BASE_URL} · {API_SOURCE}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.ink },
  container: { padding: space.xl, paddingTop: 100, paddingBottom: space.xxl },
  mark: { ...type.label, letterSpacing: 4, marginBottom: space.xl },
  display: { ...type.display, fontSize: 38, lineHeight: 42 },
  form: { marginTop: space.xxxl },
  label: { ...type.label },
  labelSpaced: { marginTop: space.xl },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: colors.lineStrong,
    paddingVertical: space.md,
    fontSize: 17,
    color: colors.text,
    marginTop: space.xs,
  },
  error: { color: colors.negative, fontSize: 14, marginTop: space.lg, lineHeight: 20 },
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
  primaryText: { color: colors.accentInk, fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  link: { alignItems: 'center', paddingVertical: space.lg },
  linkText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  debug: { textAlign: 'center', color: colors.textFaint, fontSize: 10, marginTop: space.xl },
});
