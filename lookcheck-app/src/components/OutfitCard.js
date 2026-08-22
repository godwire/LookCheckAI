import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import ClothingCard from './ClothingCard';

/**
 * `onFeedback` is optional. When provided, like/dislike buttons appear and the
 * rating is sent to the backend, which lowers the priority of items from
 * rejected outfits next time.
 *
 * Note: this component no longer renders its own ScrollView. It is always
 * placed inside a scrolling parent, and nesting scroll views broke scrolling
 * on Android.
 */
export default function OutfitCard({ outfit, onFeedback }) {
  if (!outfit) return null;

  const items = outfit.items || [];

  return (
    <View style={styles.container}>
      {outfit.reasoning ? <Text style={styles.reasoning}>{outfit.reasoning}</Text> : null}

      {items.length === 0 ? (
        <Text style={styles.empty}>No items could be selected for this look.</Text>
      ) : (
        items.map((item) => <ClothingCard key={item.id} item={item} />)
      )}

      {outfit.styling_tip ? (
        <View style={styles.tipBox}>
          <Text style={styles.tipLabel}>💡 Styling tip</Text>
          <Text style={styles.tipText}>{outfit.styling_tip}</Text>
        </View>
      ) : null}

      {onFeedback && items.length > 0 ? (
        <View style={styles.feedbackRow}>
          <Text style={styles.feedbackLabel}>Does this work for you?</Text>
          <View style={styles.feedbackButtons}>
            <TouchableOpacity
              style={[styles.feedbackButton, outfit.feedback === 'like' && styles.likeActive]}
              onPress={() => onFeedback('like')}
            >
              <Text style={styles.feedbackIcon}>👍</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.feedbackButton, outfit.feedback === 'dislike' && styles.dislikeActive]}
              onPress={() => onFeedback('dislike')}
            >
              <Text style={styles.feedbackIcon}>👎</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {outfit.generated_by === 'mock' ? (
        <Text style={styles.demoNote}>
          Demo mode: outfits are assembled by weather rules. Add an AI key on the server for
          personalised styling.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 8 },
  reasoning: { fontSize: 15, color: '#333', fontStyle: 'italic', marginBottom: 16, lineHeight: 21 },
  empty: { color: '#888', fontSize: 14, paddingVertical: 20, textAlign: 'center' },
  tipBox: { backgroundColor: '#fff8e1', borderRadius: 12, padding: 12, marginTop: 8 },
  tipLabel: { fontWeight: '700', marginBottom: 4, color: '#8a6d00' },
  tipText: { color: '#5a5a5a', fontSize: 13 },
  feedbackRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#eee',
  },
  feedbackLabel: { color: '#666', fontSize: 14 },
  feedbackButtons: { flexDirection: 'row' },
  feedbackButton: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 20,
    paddingVertical: 8, paddingHorizontal: 16, marginLeft: 8,
  },
  likeActive: { backgroundColor: '#e8f5e9', borderColor: '#66bb6a' },
  dislikeActive: { backgroundColor: '#fdecea', borderColor: '#ef9a9a' },
  feedbackIcon: { fontSize: 18 },
  demoNote: { fontSize: 12, color: '#aaa', marginTop: 16, lineHeight: 17 },
});
