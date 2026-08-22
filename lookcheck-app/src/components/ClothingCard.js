import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';

const CATEGORY_ICONS = {
  top: '👕',
  bottom: '👖',
  outerwear: '🧥',
  footwear: '👟',
  accessory: '🧢',
};

export default function ClothingCard({ item, onPress, onDelete }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      {/* Items added from a product link carry a real photo. Everything else
          falls back to the category icon. */}
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={styles.thumbnail} resizeMode="cover" />
      ) : (
        <Text style={styles.icon}>{CATEGORY_ICONS[item.category] || '👗'}</Text>
      )}

      <View style={styles.info}>
        <Text style={styles.title}>
          {item.color} {item.category}
        </Text>
        <Text style={styles.subtitle}>{item.style} · warmth {item.warmth_level}/5</Text>
        {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
      </View>

      {onDelete && (
        <TouchableOpacity onPress={onDelete} style={styles.deleteButton}>
          <Text style={styles.deleteText}>✕</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  icon: { fontSize: 32, marginRight: 12, width: 52, textAlign: 'center' },
  thumbnail: { width: 52, height: 52, borderRadius: 8, marginRight: 12, backgroundColor: '#f2f2f2' },
  info: { flex: 1 },
  title: { fontSize: 16, fontWeight: '600', textTransform: 'capitalize', color: '#1a1a1a' },
  subtitle: { fontSize: 13, color: '#888', marginTop: 2 },
  description: { fontSize: 13, color: '#555', marginTop: 4 },
  deleteButton: { padding: 8 },
  deleteText: { color: '#c44', fontSize: 16 },
});