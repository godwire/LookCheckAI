import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';

import { colors, space, radius, type, swatchColor, CATEGORY_LABELS } from '../theme';

/**
 * A garment row. Where there is a real product photo it leads; otherwise the
 * item's own colour stands in as a swatch tile, which keeps the list looking
 * like a wardrobe rather than a spreadsheet with missing images.
 */
export default function ClothingCard({ item, onPress, onDelete, compact = false }) {
  const swatch = swatchColor(item.color);

  return (
    <TouchableOpacity
      style={[styles.card, compact && styles.cardCompact]}
      onPress={onPress}
      activeOpacity={onPress ? 0.6 : 1}
      disabled={!onPress}
    >
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={styles.thumb} resizeMode="cover" />
      ) : (
        <View style={[styles.thumb, styles.swatchTile, { backgroundColor: swatch }]} />
      )}

      <View style={styles.info}>
        <Text style={styles.category}>{CATEGORY_LABELS[item.category] || item.category}</Text>
        <Text style={styles.title} numberOfLines={1}>{item.color}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {item.style} · warmth {item.warmth_level}/5
        </Text>
        {!compact && item.description ? (
          <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
        ) : null}
      </View>

      {onDelete && (
        <TouchableOpacity onPress={onDelete} style={styles.remove} hitSlop={10}>
          <Text style={styles.removeText}>✕</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.md,
    marginBottom: space.sm,
  },
  cardCompact: { backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: 0 },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    marginRight: space.md,
    backgroundColor: colors.surfaceHigh,
  },
  swatchTile: { borderWidth: 1, borderColor: colors.line },
  info: { flex: 1 },
  category: { ...type.label, fontSize: 9, letterSpacing: 1.2 },
  title: { ...type.heading, fontSize: 16, marginTop: 3, textTransform: 'capitalize' },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  description: { fontSize: 13, color: colors.textFaint, marginTop: space.xs, lineHeight: 18 },
  remove: { padding: space.sm },
  removeText: { color: colors.textFaint, fontSize: 15 },
});
