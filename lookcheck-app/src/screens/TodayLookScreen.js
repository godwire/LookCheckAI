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

export default function TodayLookScreen({ navigation }) {
  const { user } = useAuth();
  const [outfit, setOutfit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState(null);
  const loadedOnce = useRef(false);

  /**
   * GET returns the look already generated today, so this is cheap and stable.
   * The previous version called the generate endpoint on every screen focus,
   * which produced a different outfit each time you switched tabs and burned
   * an AI call doing it.
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

  useEffect(() => {
    loadOutfit();
  }, [loadOutfit]);

  // Refresh when returning to the tab, but only after the first load, and
  // only to pick up wardrobe changes - never to generate a new outfit.
  useFocusEffect(
    useCallback(() => {
      if (loadedOnce.current) loadOutfit();
    }, [loadOutfit])
  );

  async function handleRegenerate() {
    setRegenerating(true);
    setError(null);
    try {
      setOutfit(await api.regenerateOutfitToday());
    } catch (err) {
      Alert.alert('Could not suggest another look', err.message);
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
      Alert.alert('Could not save your feedback', err.message);
    }
  }

  const emptyWardrobe = error && error.toLowerCase().includes('wardrobe is empty');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading && !!outfit} onRefresh={loadOutfit} />}
    >
      <Text style={styles.greeting}>Hi {user?.name} 👋</Text>
      <Text style={styles.heading}>Today's Look</Text>

      {outfit?.weather && <WeatherBadge weather={outfit.weather} />}

      {loading && !outfit && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1a1a1a" />
          <Text style={styles.loadingText}>Styling your outfit...</Text>
        </View>
      )}

      {emptyWardrobe && (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>Your wardrobe is empty</Text>
          <Text style={styles.emptyText}>
            Add a few items and we'll put together a look for today.
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate('Wardrobe')}
          >
            <Text style={styles.primaryButtonText}>Add clothes</Text>
          </TouchableOpacity>
        </View>
      )}

      {error && !emptyWardrobe && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={loadOutfit} style={styles.retryButton}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      )}

      {outfit && !error && <OutfitCard outfit={outfit} onFeedback={handleFeedback} />}

      {outfit && !error && (
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={handleRegenerate}
          disabled={regenerating}
        >
          {regenerating ? (
            <ActivityIndicator color="#555" />
          ) : (
            <Text style={styles.refreshButtonText}>🔄 Suggest something else</Text>
          )}
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  greeting: { fontSize: 15, color: '#888' },
  heading: { fontSize: 28, fontWeight: '800', marginBottom: 16 },
  centered: { alignItems: 'center', paddingVertical: 40 },
  loadingText: { marginTop: 12, color: '#888' },
  errorBox: { backgroundColor: '#fee', borderRadius: 12, padding: 16, marginTop: 8 },
  errorText: { color: '#a33' },
  retryButton: { marginTop: 10 },
  retryText: { color: '#1a1a1a', fontWeight: '700' },
  emptyBox: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#333' },
  emptyText: { fontSize: 14, color: '#888', marginTop: 8, textAlign: 'center', paddingHorizontal: 20 },
  primaryButton: {
    backgroundColor: '#1a1a1a', borderRadius: 10,
    paddingVertical: 14, paddingHorizontal: 28, marginTop: 20,
  },
  primaryButtonText: { color: '#fff', fontWeight: '700' },
  refreshButton: { alignItems: 'center', paddingVertical: 16, marginTop: 8, minHeight: 52 },
  refreshButtonText: { color: '#555', fontSize: 14 },
});
