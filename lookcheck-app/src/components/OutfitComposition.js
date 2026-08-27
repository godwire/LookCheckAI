import React, { useEffect, useMemo, useState } from 'react';
import { Text, Image, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { resolveImageUrl } from '../api/client';
import { colors, space, radius, type } from '../theme';

/**
 * The outfit laid out as it would be worn, without anyone wearing it.
 *
 * This is composition, not generation. Each piece is the user's own cut-out
 * photograph, moved and scaled but never redrawn - so what they see is what
 * they own, down to the print. A generated render would look slicker while
 * quietly inventing garments that are not in their wardrobe, which is the one
 * thing this app must not do.
 *
 * Two ideas make it read as an outfit rather than as a pile of clothes.
 *
 * First, everything is measured in centimetres. Each category has a nominal
 * garment size, the photograph is fitted into that box keeping its own
 * proportions, and a single scale factor converts the whole column to screen
 * space at the end. Sizing each piece to its own slice of the canvas instead
 * would put a jacket and a pair of trousers at unrelated scales, and no
 * arrangement of pieces at unrelated scales looks like an outfit.
 *
 * Second, the column is chained: each garment is placed just above where the
 * previous one ends, so a hem tucks behind a waistband and trouser legs
 * disappear into shoes - at whatever proportions the photographs happen to
 * have.
 *
 * Pieces without a cut-out are skipped: one rectangle of someone's bedroom
 * wall behind a jumper ruins the whole illusion.
 */

const CANVAS_RATIO = 0.78; // canvas width / canvas height

/**
 * Sizing by where garments join.
 *
 * The trick flat-lay photographers use is to lay pieces "in their natural
 * wear relationship": the hem of the top at the waist of the trousers, the
 * trouser hems on the shoes. What makes that read as one body is not the
 * absolute size of each piece - it is that the pieces meet.
 *
 * So the backend measures, for every cut-out, how wide the garment is at its
 * top edge and at its bottom edge. Only the top is given a size here;
 * everything below is scaled so its opening matches the hem above it. A pair
 * of baggy trousers is then automatically wider than a pair of skinny ones,
 * because its waist is a smaller share of its own width - no garment types,
 * no thresholds, no table of centimetres to keep tuning.
 */

// The one free parameter: how much of the canvas the top spans.
const TOP_WIDTH = 0.42;

// Categories that have a place in the layout. Anything else in the outfit is
// listed below the picture but not drawn into it.
const COMPOSABLE = ['top', 'bottom', 'outerwear', 'footwear'];

// A pair of shoes sits roughly as wide as the two trouser hems together.
const SHOE_TO_HEM = 1.05;

// An outer layer is cut a little fuller than what goes under it.
const OUTERWEAR_TO_TOP = 1.18;

// Used when a garment's joins could not be measured.
const DEFAULT_JOINS = { top: 1, bottom: 1 };

function joinsOf(item) {
  if (!item || !item.cutout_joins) return DEFAULT_JOINS;
  try {
    const parsed =
      typeof item.cutout_joins === 'string'
        ? JSON.parse(item.cutout_joins)
        : item.cutout_joins;
    const top = Number(parsed.top);
    const bottom = Number(parsed.bottom);
    return {
      top: top > 0.05 && top <= 1 ? top : 1,
      bottom: bottom > 0.05 && bottom <= 1 ? bottom : 1,
    };
  } catch (e) {
    return DEFAULT_JOINS;
  }
}

// How far each garment rides up under the one above it, as a share of that
// piece's height.
const OVERLAP_SHARE = 0.07;

// Share of the canvas height the whole figure may occupy.
const FILL = 0.94;

const COLUMN = ['top', 'bottom', 'footwear'];

function computeLayout(items, aspects) {
  const byCategory = {};
  items.forEach((item) => {
    if (aspects[item.id]) byCategory[item.category] = item;
  });

  const top = byCategory.top;
  const bottom = byCategory.bottom;
  const shoes = byCategory.footwear;
  if (!top && !bottom) return [];

  // Widths chain downwards from the top: each opening matches the hem above.
  const widths = {};
  if (top) widths.top = TOP_WIDTH;

  if (bottom) {
    const hemAbove = top ? widths.top * joinsOf(top).bottom : TOP_WIDTH * 0.7;
    widths.bottom = hemAbove / joinsOf(bottom).top;
  }

  if (shoes) {
    const hemAbove = bottom
      ? widths.bottom * joinsOf(bottom).bottom
      : TOP_WIDTH * 0.6;
    widths.footwear = hemAbove * SHOE_TO_HEM;
  }

  // Height follows from each garment's own proportions.
  const heights = {};
  COLUMN.forEach((category) => {
    const item = byCategory[category];
    if (item && widths[category]) {
      heights[category] = (widths[category] * CANVAS_RATIO) / aspects[item.id];
    }
  });

  const stacked = COLUMN.filter((category) => heights[category]);
  if (stacked.length === 0) return [];

  // Overlap is a share of the piece above, so it scales with the outfit.
  const overlapOf = (category) => {
    const above = COLUMN[COLUMN.indexOf(category) - 1];
    return above && heights[above] ? heights[above] * OVERLAP_SHARE : 0;
  };

  const rawTotal =
    stacked.reduce((sum, category) => sum + heights[category], 0) -
    stacked.reduce((sum, category) => sum + overlapOf(category), 0);

  const scale = rawTotal > FILL ? FILL / rawTotal : 1;
  const placed = [];
  let y = (1 - rawTotal * scale) / 2;

  const centre = byCategory.outerwear ? 0.58 : 0.5;

  stacked.forEach((category, index) => {
    const width = widths[category] * scale;
    const height = heights[category] * scale;
    if (index > 0) y -= overlapOf(category) * scale;
    placed.push({
      item: byCategory[category],
      left: centre - width / 2,
      top: y,
      width,
      height,
      rotate: '0deg',
      z: index + 2,
    });
    y += height;
  });

  // The outer layer hangs open behind the shoulder, the way a jacket falls.
  const coat = byCategory.outerwear;
  const torso = placed.find((entry) => entry.item.category === 'top') || placed[0];
  if (coat && torso && aspects[coat.id]) {
    const width = torso.width * OUTERWEAR_TO_TOP;
    const height = (width * CANVAS_RATIO) / aspects[coat.id];
    placed.unshift({
      item: coat,
      left: Math.max(0.01, torso.left - width * 0.46),
      top: torso.top - height * 0.04,
      width,
      height,
      rotate: '-8deg',
      z: 1,
    });
  }

  return placed;
}

export default function OutfitComposition({ items, style }) {
  const wearable = useMemo(
    () => (items || []).filter((item) => item.cutout_url && COMPOSABLE.includes(item.category)),
    [items]
  );

  const [aspects, setAspects] = useState({});

  // Cut-outs are stored trimmed to the garment, so their pixel dimensions are
  // the garment's own proportions. A padded square would measure 1:1 for
  // everything and every piece would come out the same shape.
  useEffect(() => {
    let cancelled = false;
    wearable.forEach((item) => {
      Image.getSize(
        resolveImageUrl(item.cutout_url),
        (width, height) => {
          if (!cancelled && height > 0) {
            setAspects((current) => ({ ...current, [item.id]: width / height }));
          }
        },
        () => {}
      );
    });
    return () => { cancelled = true; };
  }, [wearable]);

  const placed = useMemo(() => computeLayout(wearable, aspects), [wearable, aspects]);

  // Below three pieces this reads as scattered clothing rather than an outfit,
  // and until the sizes are measured there is nothing to lay out.
  if (wearable.length < 3 || placed.length < 3) return null;

  return (
    <Animated.View style={[styles.canvas, style]} entering={FadeIn.duration(280)}>
      {placed.map((entry) => (
        <Image
          key={entry.item.id}
          source={{ uri: resolveImageUrl(entry.item.cutout_url) }}
          resizeMode="contain"
          style={{
            position: 'absolute',
            left: `${entry.left * 100}%`,
            top: `${entry.top * 100}%`,
            width: `${entry.width * 100}%`,
            height: `${entry.height * 100}%`,
            transform: [{ rotate: entry.rotate }],
            zIndex: entry.z,
          }}
        />
      ))}
      <Text style={styles.caption}>The look, laid out</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    width: '100%',
    aspectRatio: CANVAS_RATIO,
    // Clothes are photographed against white in every catalogue for a reason:
    // a black coat on a near-black card is invisible. The interface stays
    // dark; the garments sit on paper, as they do on a wardrobe tile.
    backgroundColor: colors.tile,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    marginBottom: space.xl,
  },
  caption: {
    ...type.label,
    color: colors.textFaint,
    position: 'absolute',
    left: space.lg,
    bottom: space.md,
    zIndex: 10,
  },
});