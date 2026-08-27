import React from 'react';
import { View, Text, Image, StyleSheet, Pressable, TouchableOpacity } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { resolveImageUrl } from '../api/client';
import { colors, space, radius, type, swatchColor, CATEGORY_LABELS } from '../theme';

const WARMTH_NOTES = {
  1: 'Height of summer',
  2: 'Warm days',
  3: 'Mild, in between',
  4: 'Cold weather',
  5: 'Deep winter',
};

const SPRING = { damping: 18, stiffness: 180, mass: 0.6 };

/**
 * A garment row that opens.
 *
 * Tapping the card reveals its detail panel in place rather than pushing a
 * screen: the wardrobe stays where it was, so comparing two pieces is two
 * taps. The height change runs through a layout transition, so the rows below
 * slide instead of jumping.
 *
 * Tiles arrive from the backend already normalised - one garment, centred on
 * a white square - so the image is rendered with `contain`, never cropped.
 */
export default function ClothingCard({
  item,
  expanded = false,
  onToggle,
  onEdit,
  onDelete,
  compact = false,
}) {
  const uri = resolveImageUrl(item.image_url);
  const pressed = useSharedValue(0);
  const open = useSharedValue(expanded ? 1 : 0);

  React.useEffect(() => {
    open.value = withSpring(expanded ? 1 : 0, SPRING);
  }, [expanded, open]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.015 }],
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${open.value * 90}deg` }],
    opacity: 0.4 + open.value * 0.6,
  }));

  const tileStyle = useAnimatedStyle(() => ({
    width: withSpring(expanded ? 88 : 64, SPRING),
    height: withSpring(expanded ? 88 : 64, SPRING),
  }));

  const thumbnail = uri ? (
    <Image source={{ uri }} style={styles.image} resizeMode="contain" />
  ) : (
    <View style={[styles.swatch, { backgroundColor: swatchColor(item.color) }]} />
  );

  if (compact) {
    return (
      <View style={styles.compactRow}>
        <View style={[styles.tile, styles.tileCompact]}>{thumbnail}</View>
        <View style={styles.info}>
          <Text style={styles.category}>{CATEGORY_LABELS[item.category] || item.category}</Text>
          <Text style={styles.title} numberOfLines={1}>{item.color}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {item.style} · warmth {item.warmth_level}/5
          </Text>
        </View>
      </View>
    );
  }

  return (
    <Animated.View layout={LinearTransition.springify().damping(20).stiffness(160)}>
      <Animated.View style={[styles.card, cardStyle, expanded && styles.cardOpen]}>
        <Pressable
          style={styles.head}
          onPress={onToggle}
          onPressIn={() => { pressed.value = withTiming(1, { duration: 90 }); }}
          onPressOut={() => { pressed.value = withTiming(0, { duration: 140 }); }}
        >
          <Animated.View style={[styles.tile, tileStyle]}>{thumbnail}</Animated.View>

          <View style={styles.info}>
            <Text style={styles.category}>{CATEGORY_LABELS[item.category] || item.category}</Text>
            <Text style={styles.title} numberOfLines={1}>{item.color}</Text>
            <Text style={styles.meta} numberOfLines={1}>
              {item.style} · warmth {item.warmth_level}/5
            </Text>
          </View>

          <Animated.Text style={[styles.chevron, chevronStyle]}>›</Animated.Text>
        </Pressable>

        {expanded && (
          <Animated.View
            style={styles.details}
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(120)}
          >
            {item.description ? (
              <Text style={styles.description}>{item.description}</Text>
            ) : null}

            <View style={styles.facts}>
              <Fact label="Category" value={CATEGORY_LABELS[item.category] || item.category} />
              <Fact label="Style" value={item.style} />
              <Fact
                label="Warmth"
                value={`${item.warmth_level}/5 · ${WARMTH_NOTES[item.warmth_level] || ''}`}
              />
              {item.source_link ? <Fact label="From" value={hostOf(item.source_link)} /> : null}
            </View>

            <View style={styles.actions}>
              <TouchableOpacity style={styles.action} onPress={onEdit}>
                <Text style={styles.actionText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.action, styles.actionLast]} onPress={onDelete}>
                <Text style={[styles.actionText, styles.actionTextDanger]}>Remove</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
      </Animated.View>
    </Animated.View>
  );
}

function Fact({ label, value }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function hostOf(url) {
  const parts = String(url).split('/');
  return parts.length > 2 ? parts[2] : url;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: space.sm,
    overflow: 'hidden',
  },
  cardOpen: { borderColor: colors.lineStrong },
  head: { flexDirection: 'row', alignItems: 'center', padding: space.md },
  compactRow: { flexDirection: 'row', alignItems: 'center', marginBottom: space.sm },
  tile: {
    width: 64,
    height: 64,
    borderRadius: radius.sm,
    marginRight: space.md,
    backgroundColor: colors.tile,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileCompact: { width: 56, height: 56 },
  image: { width: '100%', height: '100%' },
  swatch: { width: '70%', height: '70%', borderRadius: radius.sm },
  info: { flex: 1 },
  category: { ...type.label, fontSize: 9, letterSpacing: 1.2 },
  title: { ...type.heading, fontSize: 16, marginTop: 3, textTransform: 'capitalize' },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  chevron: { color: colors.textMuted, fontSize: 22, paddingHorizontal: space.sm },

  details: {
    paddingHorizontal: space.md,
    paddingBottom: space.md,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  description: { ...type.body, fontSize: 14, marginBottom: space.md },
  facts: { marginBottom: space.md },
  fact: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.xs + 2 },
  factLabel: { ...type.label, fontSize: 10 },
  factValue: { fontSize: 13, color: colors.text, flexShrink: 1, textAlign: 'right', marginLeft: space.md },
  actions: { flexDirection: 'row' },
  action: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.pill,
    paddingVertical: space.md - 2,
    alignItems: 'center',
    marginRight: space.sm,
  },
  actionLast: { marginRight: 0 },
  actionText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  actionTextDanger: { color: colors.negative },
});
