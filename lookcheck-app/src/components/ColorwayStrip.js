import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { colors, space, radius, type, swatchColor, CATEGORY_LABELS } from '../theme';

/**
 * The colourway strip.
 *
 * An outfit is, at bottom, a combination of colours - so the app shows it as
 * one: a row of pigment blocks in the order you put the clothes on, labelled
 * by what each piece is. It borrows the language of a fabric swatch card,
 * and it lets you judge whether a look hangs together before reading a single
 * word about it.
 *
 * The blocks are weighted by garment area rather than split evenly, because
 * that is closer to how an outfit actually reads: a coat dominates, a pair of
 * shoes does not.
 */

const WEIGHTS = { outerwear: 3, top: 2.4, bottom: 2.4, footwear: 1.2, accessory: 0.8 };
const ORDER = ['outerwear', 'top', 'bottom', 'footwear', 'accessory'];

export default function ColorwayStrip({ items, height = 92 }) {
  if (!items || items.length === 0) return null;

  const ordered = [...items].sort(
    (a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category)
  );

  return (
    <View style={styles.wrapper}>
      <View style={[styles.strip, { height }]}>
        {ordered.map((item) => (
          <View
            key={item.id}
            style={[
              styles.block,
              { flex: WEIGHTS[item.category] || 1, backgroundColor: swatchColor(item.color) },
            ]}
          />
        ))}
      </View>

      <View style={styles.legend}>
        {ordered.map((item) => (
          <View key={item.id} style={[styles.legendCell, { flex: WEIGHTS[item.category] || 1 }]}>
            <Text style={styles.legendLabel} numberOfLines={1}>
              {CATEGORY_LABELS[item.category] || item.category}
            </Text>
            <Text style={styles.legendColor} numberOfLines={1}>
              {item.color}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: space.xl },
  strip: {
    flexDirection: 'row',
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
  },
  block: { height: '100%' },
  legend: { flexDirection: 'row', marginTop: space.sm },
  legendCell: { paddingRight: space.sm },
  legendLabel: { ...type.label, fontSize: 9, letterSpacing: 1 },
  legendColor: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    textTransform: 'lowercase',
  },
});
