import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import ClothingCard from './ClothingCard';

export default function OutfitCard({ outfit }) {
  if (!outfit) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.reasoning}>{outfit.reasoning}</Text>

      <ScrollView style={styles.itemsList}>
        {outfit.items.map((item) => (
          <ClothingCard key={item.id} item={item} />
        ))}
      </ScrollView>

      {outfit.styling_tip ? (
        <View style={styles.tipBox}>
          <Text style={styles.tipLabel}>💡 Styling tip</Text>
          <Text style={styles.tipText}>{outfit.styling_tip}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  reasoning: {
    fontSize: 15,
    color: '#333',
    fontStyle: 'italic',
    marginBottom: 16,
    lineHeight: 21,
  },
  itemsList: { flex: 1 },
  tipBox: {
    backgroundColor: '#fff8e1',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  tipLabel: { fontWeight: '700', marginBottom: 4, color: '#8a6d00' },
  tipText: { color: '#5a5a5a', fontSize: 13 },
});
