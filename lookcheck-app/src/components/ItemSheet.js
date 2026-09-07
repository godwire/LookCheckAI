import React from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  Pressable,
  TouchableOpacity,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
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

/**
 * The detail panel of a garment, lifted out of the row card.
 *
 * In the row view a card can afford to open in place. In the tile views a
 * cell is too narrow for that, so the same facts and the same two actions
 * are shown in a sheet over the grid - the wardrobe stays behind it, and
 * dismissing returns to exactly the scroll position the tap started from.
 */
export default function ItemSheet({
  item,
  onClose,
  onEdit,
  onDelete,
}) {
  const uri = item ? resolveImageUrl(item.image_url) : null;

  return (
    <Modal
      visible={!!item}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {item ? (
        <View style={styles.root}>
          <Animated.View
            style={StyleSheet.absoluteFill}
            entering={FadeIn.duration(160)}
            exiting={FadeOut.duration(120)}
          >
            <Pressable style={styles.backdrop} onPress={onClose} />
          </Animated.View>

          <Animated.View
            style={styles.sheet}
            entering={SlideInDown.duration(240)}
          >
            <View style={styles.grip} />

            <ScrollView
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <View style={styles.frame}>
                {uri ? (
                  <Image source={{ uri }} style={styles.image} resizeMode="contain" />
                ) : (
                  <View style={[styles.swatch, { backgroundColor: swatchColor(item.color) }]} />
                )}
              </View>

              <Text style={styles.category}>
                {CATEGORY_LABELS[item.category] || item.category}
              </Text>

              <Text style={styles.title} numberOfLines={2}>
                {item.color}
              </Text>

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
                <TouchableOpacity
                  style={styles.action}
                  onPress={onEdit}
                  activeOpacity={0.8}
                >
                  <Text style={styles.actionText}>Edit</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.action, styles.actionLast]}
                  onPress={onDelete}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.actionText, styles.actionTextDanger]}>Remove</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      ) : null}
    </Modal>
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
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },

  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
  },

  sheet: {
    maxHeight: '86%',

    backgroundColor: colors.surface,

    borderTopLeftRadius: radius.lg + 6,
    borderTopRightRadius: radius.lg + 6,

    borderTopWidth: 1,
    borderColor: colors.lineStrong,

    paddingTop: space.sm,
  },

  grip: {
    width: 38,
    height: 4,

    borderRadius: radius.pill,

    backgroundColor: colors.lineStrong,

    alignSelf: 'center',

    marginBottom: space.md,
  },

  content: {
    paddingHorizontal: space.xl,
    paddingBottom: space.xxxl,
  },

  frame: {
    width: '100%',
    aspectRatio: 1,

    borderRadius: radius.md,

    backgroundColor: colors.tile,

    overflow: 'hidden',

    alignItems: 'center',
    justifyContent: 'center',
  },

  image: {
    width: '100%',
    height: '100%',
  },

  swatch: {
    width: '55%',
    height: '55%',

    borderRadius: radius.md,
  },

  category: {
    ...type.label,

    fontSize: 10,

    marginTop: space.lg,
  },

  title: {
    ...type.title,

    marginTop: space.xs,

    textTransform: 'capitalize',
  },

  description: {
    ...type.body,

    fontSize: 14,

    marginTop: space.md,
  },

  facts: {
    marginTop: space.lg,
    marginBottom: space.lg,
  },

  fact: {
    flexDirection: 'row',
    justifyContent: 'space-between',

    paddingVertical: space.xs + 2,

    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },

  factLabel: {
    ...type.label,
    fontSize: 10,
  },

  factValue: {
    fontSize: 13,

    color: colors.text,

    flexShrink: 1,

    textAlign: 'right',

    marginLeft: space.md,
  },

  actions: {
    flexDirection: 'row',
  },

  action: {
    flex: 1,

    borderWidth: 1,
    borderColor: colors.lineStrong,

    borderRadius: radius.pill,

    paddingVertical: space.md - 2,

    alignItems: 'center',

    marginRight: space.sm,
  },

  actionLast: {
    marginRight: 0,
  },

  actionText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
  },

  actionTextDanger: {
    color: colors.negative,
  },
});