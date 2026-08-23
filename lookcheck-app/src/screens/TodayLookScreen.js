import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, ScrollView, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import WeatherBadge from '../components/WeatherBadge';
import OutfitCard from '../components/OutfitCard';
import { colors, space, radius, type } from '../theme';

const DATE_FORMAT = { weekday: 'long', day: 'numeric', month: 'long' };

export default function TodayLookScreen({ navigation }) {
  const { user } = useAuth();
  const [outfit, setOutfit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState(null);
  const loadedOnce = useRef(false);

  /**
   * GET returns the look already generated today, so this is cheap and stable.
   * An earlier version called the generate endpoint on every screen focus,
   * which changed the outfit each time you switched tabs.
   */
  const loadOutfit = useCallback(async () => {
    setError(null);
    try {
      setOutfit(await api.getOutfitToday());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      loadedOnce.current = true;
    }
  }, []);

  useEffect(() => { loadOutfit(); }, [loadOutfit]);

  useFocusEffect(
    useCallback(() => {
      if (loadedOnce.current) loadOutfit();
    }, [loadOutfit])
  );

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      setOutfit(await api.regenerateOutfitToday());
    } catch (err) {
      Alert.alert('No other look available', err.message);
    } finally {
      setRegenerating(false);
    }
  }

  async function handleFeedback(rating) {
    if (!outfit?.outfit_id) return;
    const previous = outfit.feedback;
    setOutfit((current) => ({ ...current, feedback: rating }));
    try {
      await api.sendOutfitFeedback(outfit.outfit_id, rating);
    } catch (err) {
      setOutfit((current) => ({ ...current, feedback: previous }));
      Alert.alert('Rating not saved', err.message);
    }
  }

  const emptyWardrobe = error && error.toLowerCase().includes('wardrobe is empty');
  const today = new Date().toLocaleDateString('en-GB', DATE_FORMAT);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={loading && !!outfit}
          onRefresh={loadOutfit}
          tintColor={colors.textMuted}
        />
      }
    >
      <Text style={styles.eyebrow}>{today}</Text>
      <Text style={styles.display}>Today{'\u2019'}s look</Text>

      {outfit?.weather && <WeatherBadge weather={outfit.weather} city={user?.city} />}

      {loading && !outfit && (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Matching your wardrobe</Text>
        </View>
      )}

      {emptyWardrobe && (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing to work with yet</Text>
          <Text style={styles.emptyBody}>
            Add a few pieces and the app will start putting looks together.
          </Text>
          <TouchableOpacity style={styles.primary} onPress={() => navigation.navigate('Wardrobe')}>
            <Text style={styles.primaryText}>Add your first piece</Text>
          </TouchableOpacity>
        </View>
      )}

      {error && !emptyWardrobe && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={loadOutfit} style={styles.retry}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      )}

      {outfit && !error && <OutfitCard outfit={outfit} onFeedback={handleFeedback} />}

      {outfit && !error && (
        <TouchableOpacity
          style={styles.secondary}
          onPress={handleRegenerate}
          disabled={regenerating}
        >
          {regenerating
            ? <ActivityIndicator color={colors.textMuted} />
            : <Text style={styles.secondaryText}>Show me another look</Text>}
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  content: { padding: space.xl, paddingTop: 72, paddingBottom: space.xxxl },
  eyebrow: { ...type.label, marginBottom: space.sm },
  display: { ...type.display, marginBottom: space.xl },
  centered: { alignItems: 'center', paddingVertical: space.xxxl },
  loadingText: { ...type.small, marginTop: space.md },
  empty: { paddingVertical: space.xxl },
  emptyTitle: { ...type.heading, marginBottom: space.sm },
  emptyBody: { ...type.bodyMuted, marginBottom: space.xl },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.lg,
    alignItems: 'center',
  },
  primaryText: { color: colors.accentInk, fontWeight: '700', fontSize: 15 },
  errorBox: {
    backgroundColor: colors.surface,
    borderLeftWidth: 2,
    borderLeftColor: colors.negative,
    borderRadius: radius.md,
    padding: space.lg,
  },
  errorText: { ...type.body, fontSize: 14 },
  retry: { marginTop: space.md },
  retryText: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  secondary: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.pill,
    paddingVertical: space.lg,
    alignItems: 'center',
    marginTop: space.xxl,
    minHeight: 52,
    justifyContent: 'center',
  },
  secondaryText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
});
