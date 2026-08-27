import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

import ClothingCard from './ClothingCard';
import ColorwayStrip from './ColorwayStrip';
import OutfitComposition from './OutfitComposition';
import { colors, space, radius, type } from '../theme';

/**
 * `onFeedback` is optional. When supplied, the rating is sent to the backend,
 * which demotes pieces from rejected outfits next time.
 */
export default function OutfitCard({ outfit, onFeedback }) {
  if (!outfit) return null;
  const items = outfit.items || [];

  if (items.length === 0) {
    return <Text style={styles.empty}>No pieces could be matched for this look.</Text>;
  }

  return (
    <View>
      <OutfitComposition items={items} />
      <ColorwayStrip items={items} />

      {outfit.reasoning ? (
        <View style={styles.note}>
          <View style={styles.rule} />
          <Text style={styles.noteText}>{outfit.reasoning}</Text>
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>The pieces</Text>
      {items.map((item) => (
        <ClothingCard key={item.id} item={item} compact />
      ))}

      {outfit.styling_tip ? (
        <View style={styles.tip}>
          <Text style={styles.tipLabel}>How to wear it</Text>
          <Text style={styles.tipText}>{outfit.styling_tip}</Text>
        </View>
      ) : null}

      {onFeedback ? (
        <View style={styles.feedback}>
          <Text style={styles.feedbackLabel}>Would you wear this?</Text>
          <View style={styles.feedbackButtons}>
            <TouchableOpacity
              style={[styles.vote, outfit.feedback === 'like' && styles.voteYes]}
              onPress={() => onFeedback('like')}
            >
              <Text style={[styles.voteText, outfit.feedback === 'like' && styles.voteTextYes]}>
                Yes
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.vote, outfit.feedback === 'dislike' && styles.voteNo]}
              onPress={() => onFeedback('dislike')}
            >
              <Text style={[styles.voteText, outfit.feedback === 'dislike' && styles.voteTextNo]}>
                Not today
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {outfit.generated_by === 'mock' ? (
        <Text style={styles.demo}>
          Matching runs on colour and style rules. Add an AI key on the server for written styling.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { ...type.bodyMuted, paddingVertical: space.xl, textAlign: 'center' },
  note: { flexDirection: 'row', marginBottom: space.xl },
  rule: { width: 2, backgroundColor: colors.accent, borderRadius: 1, marginRight: space.md },
  noteText: { ...type.body, flex: 1, fontSize: 16, lineHeight: 24 },
  sectionLabel: { ...type.label, marginBottom: space.md },
  tip: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
    padding: space.lg,
    marginTop: space.md,
  },
  tipLabel: { ...type.label, color: colors.accent, marginBottom: space.xs },
  tipText: { ...type.body, fontSize: 14, lineHeight: 21 },
  feedback: { marginTop: space.xl, paddingTop: space.lg, borderTopWidth: 1, borderTopColor: colors.line },
  feedbackLabel: { ...type.label, marginBottom: space.md },
  feedbackButtons: { flexDirection: 'row' },
  vote: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.pill,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.lg,
    marginRight: space.sm,
  },
  voteYes: { backgroundColor: colors.positive, borderColor: colors.positive },
  voteNo: { backgroundColor: colors.negative, borderColor: colors.negative },
  voteText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  voteTextYes: { color: colors.accentInk },
  voteTextNo: { color: colors.accentInk },
  demo: { fontSize: 12, color: colors.textFaint, marginTop: space.xl, lineHeight: 18 },
});
