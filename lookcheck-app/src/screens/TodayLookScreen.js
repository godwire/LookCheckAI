import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useUser } from '../context/UserContext';
import { api } from '../api/client';
import WeatherBadge from '../components/WeatherBadge';
import OutfitCard from '../components/OutfitCard';

export default function TodayLookScreen() {
  const { user } = useUser();
  const [outfit, setOutfit] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadOutfit = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.getOutfitToday(user.id);
      setOutfit(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadOutfit();
    }, [loadOutfit])
  );

  if (!user) return null;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={loadOutfit} />}
    >
      <Text style={styles.greeting}>Hi {user.name} 👋</Text>
      <Text style={styles.heading}>Today's Look</Text>

      {outfit?.weather && <WeatherBadge weather={outfit.weather} />}

      {loading && !outfit && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1a1a1a" />
          <Text style={styles.loadingText}>Styling your outfit...</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={loadOutfit} style={styles.retryButton}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      )}

      {outfit && !error && <OutfitCard outfit={outfit} />}

      {outfit && (
        <TouchableOpacity style={styles.refreshButton} onPress={loadOutfit}>
          <Text style={styles.refreshButtonText}>🔄 Suggest something else</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20, paddingTop: 60 },
  greeting: { fontSize: 15, color: '#888' },
  heading: { fontSize: 28, fontWeight: '800', marginBottom: 16 },
  centered: { alignItems: 'center', paddingVertical: 40 },
  loadingText: { marginTop: 12, color: '#888' },
  errorBox: { backgroundColor: '#fee', borderRadius: 12, padding: 16, marginTop: 8 },
  errorText: { color: '#a33' },
  retryButton: { marginTop: 10 },
  retryText: { color: '#1a1a1a', fontWeight: '700' },
  refreshButton: { alignItems: 'center', paddingVertical: 16, marginTop: 8 },
  refreshButtonText: { color: '#555', fontSize: 14 },
});
