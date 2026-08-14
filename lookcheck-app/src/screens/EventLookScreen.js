import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { useUser } from '../context/UserContext';
import { api } from '../api/client';
import OutfitCard from '../components/OutfitCard';

const EVENT_ICONS = {
  Work: '💼',
  Date: '💕',
  Sport: '🏃',
  Party: '🎉',
  Casual: '👟',
};

export default function EventLookScreen() {
  const { user } = useUser();
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [outfit, setOutfit] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getEvents().then(setEvents).catch((err) => Alert.alert('Error', err.message));
  }, []);

  async function handleSelectEvent(eventName) {
    setSelectedEvent(eventName);
    setOutfit(null);
    setLoading(true);
    try {
      const result = await api.getOutfitForEvent(user.id, eventName);
      setOutfit(result);
    } catch (err) {
      Alert.alert('Could not generate outfit', err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!user) return null;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.heading}>Dress for an Event</Text>
      <Text style={styles.subheading}>What are you getting ready for?</Text>

      <View style={styles.eventGrid}>
        {events.map((event) => (
          <TouchableOpacity
            key={event.id}
            style={[styles.eventChip, selectedEvent === event.name && styles.eventChipActive]}
            onPress={() => handleSelectEvent(event.name)}
          >
            <Text style={styles.eventIcon}>{EVENT_ICONS[event.name] || '✨'}</Text>
            <Text
              style={[styles.eventText, selectedEvent === event.name && styles.eventTextActive]}
            >
              {event.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1a1a1a" />
        </View>
      )}

      {outfit && !loading && (
        <View style={styles.outfitSection}>
          <OutfitCard outfit={outfit} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20, paddingTop: 60 },
  heading: { fontSize: 28, fontWeight: '800' },
  subheading: { fontSize: 14, color: '#888', marginBottom: 20 },
  eventGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  eventChip: {
    width: '31%', aspectRatio: 1, borderRadius: 14, borderWidth: 1, borderColor: '#ddd',
    alignItems: 'center', justifyContent: 'center', marginRight: '2%', marginBottom: 10,
  },
  eventChipActive: { backgroundColor: '#1a1a1a', borderColor: '#1a1a1a' },
  eventIcon: { fontSize: 26, marginBottom: 6 },
  eventText: { fontSize: 12, fontWeight: '600', color: '#333' },
  eventTextActive: { color: '#fff' },
  centered: { paddingVertical: 30, alignItems: 'center' },
  outfitSection: { minHeight: 300 },
});
