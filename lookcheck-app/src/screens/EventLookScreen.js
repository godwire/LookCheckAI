import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Alert,
} from 'react-native';

import { api } from '../api/client';
import OutfitCard from '../components/OutfitCard';
import { colors, space, radius, type } from '../theme';

const OCCASION_NOTES = {
  Work: 'Smart, quiet, nothing that shouts',
  Date: 'A little more effort than usual',
  Sport: 'Built to move',
  Party: 'The one piece people remember',
  Casual: 'Comfortable, still considered',
};

export default function EventLookScreen() {
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [outfit, setOutfit] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getEvents().then(setEvents).catch((err) => Alert.alert('Occasions unavailable', err.message));
  }, []);

  async function handleSelect(eventName) {
    setSelected(eventName);
    setOutfit(null);
    setLoading(true);
    try {
      setOutfit(await api.getOutfitForEvent(eventName));
    } catch (err) {
      Alert.alert('No look for this occasion', err.message);
    } finally {
      setLoading(false);
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

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>Dress for</Text>
      <Text style={styles.display}>An occasion</Text>

      <View style={styles.list}>
        {events.map((event) => {
          const active = selected === event.name;
          return (
            <TouchableOpacity
              key={event.id}
              style={[styles.row, active && styles.rowActive]}
              onPress={() => handleSelect(event.name)}
              disabled={loading}
            >
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, active && styles.rowTitleActive]}>{event.name}</Text>
                <Text style={styles.rowNote}>{OCCASION_NOTES[event.name] || event.dress_code_description}</Text>
              </View>
              <Text style={[styles.chevron, active && styles.chevronActive]}>→</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading && (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Putting a look together</Text>
        </View>
      )}

      {outfit && !loading && (
        <View style={styles.result}>
          <OutfitCard outfit={outfit} onFeedback={handleFeedback} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  content: { padding: space.xl, paddingTop: 72, paddingBottom: space.xxxl },
  eyebrow: { ...type.label, marginBottom: space.sm },
  display: { ...type.display, marginBottom: space.xl },
  list: { borderTopWidth: 1, borderTopColor: colors.line },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowActive: { borderBottomColor: colors.accent },
  rowText: { flex: 1, paddingRight: space.md },
  rowTitle: { ...type.heading, fontSize: 20 },
  rowTitleActive: { color: colors.accent },
  rowNote: { ...type.small, fontSize: 13, marginTop: 3 },
  chevron: { color: colors.textFaint, fontSize: 18 },
  chevronActive: { color: colors.accent },
  centered: { alignItems: 'center', paddingVertical: space.xxl },
  loadingText: { ...type.small, marginTop: space.md },
  result: { marginTop: space.xxl },
});
