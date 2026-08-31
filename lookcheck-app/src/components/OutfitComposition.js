import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
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
 * Sizing works by where garments join. The trick flat-lay photographers use
 * is to lay pieces "in their natural wear relationship": the hem of the top
 * at the waist of the trousers, the trouser hems on the shoes. What makes
 * that read as one body is not the absolute size of each piece - it is that
 * the pieces meet. So the backend measures how wide each cut-out is at its
 * top and bottom edge, only the top is given a size here, and everything
 * below is scaled so its opening matches the hem above it.
 *
 * Pieces without a cut-out are skipped: one rectangle of someone's bedroom
 * wall behind a jumper ruins the whole illusion.
 */

const CANVAS_RATIO = 0.78; // canvas width / canvas height

/**
 * The layout readout under the picture. Useful while tuning the composition,
 * and the first thing to turn off before recording anything anyone else will
 * see - a demo with a debug panel in it reads as unfinished.
 */
const SHOW_LAYOUT_DEBUG = false;

// The one free parameter: how much of the canvas the top spans.
const TOP_WIDTH = 0.42;

// Categories that have a place in the layout.
const COMPOSABLE = ['top', 'bottom', 'outerwear', 'footwear', 'accessory'];

/**
 * A pair of shoes is about as wide as a person's shoulders are across, give
 * or take - and crucially it does not change with the trousers above it.
 * Sizing shoes from the trouser hems made them grow with every wide-leg pair,
 * which is why they came out oversized.
 */
const SHOE_TO_TOP = 0.75;

// An outer layer is cut a little fuller than what goes under it.
const OUTERWEAR_TO_TOP = 1.18;

// How far a base layer spreads relative to the piece over it, and how far
// down it starts - enough for a collar above and a hem below to show.
const BASE_LAYER_SPREAD = 1.1;
const BASE_LAYER_DROP = 0.1;

/**
 * A garment worn next to the skin, as opposed to one worn over it. Nothing
 * in the data says "t-shirt" or "sweatshirt", but warmth already does: a
 * base layer is light, a mid layer is not. Using what is there beats asking
 * for a wardrobe to be re-tagged.
 */
const BASE_LAYER_MAX_WARMTH = 2;

/**
 * Used when a garment's joins were never measured - anything added before
 * the measurement existed, or a photograph the cut-out failed on.
 *
 * These are not 1:1. Falling back to "the whole width" would make a waist as
 * wide as the hem above it and a pair of shoes as wide as the trouser legs,
 * so every piece would come out the same width - which looks far more broken
 * than a rough guess.
 */
const DEFAULT_JOINS = {
  top: { top: 0.95, bottom: 0.72, top_offset: 0, bottom_offset: 0 },
  outerwear: { top: 0.92, bottom: 0.80, top_offset: 0, bottom_offset: 0 },
  bottom: { top: 0.86, bottom: 0.84, top_offset: 0, bottom_offset: 0 },
  footwear: { top: 1, bottom: 1, top_offset: 0, bottom_offset: 0 },
  accessory: { top: 1, bottom: 1, top_offset: 0, bottom_offset: 0 },
};

function joinsOf(item) {
  const fallback = (item && DEFAULT_JOINS[item.category]) || { top: 1, bottom: 1 };
  if (!item || !item.cutout_joins) return fallback;
  try {
    const parsed =
      typeof item.cutout_joins === 'string'
        ? JSON.parse(item.cutout_joins)
        : item.cutout_joins;
    const top = Number(parsed.top);
    const bottom = Number(parsed.bottom);
    const offset = (value) => (Number.isFinite(value) ? Math.max(-0.3, Math.min(0.3, value)) : 0);
    return {
      top: top > 0.05 && top <= 1 ? top : fallback.top,
      bottom: bottom > 0.05 && bottom <= 1 ? bottom : fallback.bottom,
      top_offset: offset(Number(parsed.top_offset)),
      bottom_offset: offset(Number(parsed.bottom_offset)),
    };
  } catch (e) {
    return fallback;
  }
}

// Space left between pieces, as a share of the canvas height.
const GAP = 0.035;

// Share of the canvas height the whole figure may occupy.
const FILL = 0.94;

const COLUMN = ['top', 'bottom', 'footwear'];

/**
 * How wide a top's hem is, as a share of the garment's total width.
 *
 * The measurement alone cannot be trusted here. A horizontal slice near the
 * bottom of a jacket crosses sleeve, body and sleeve, so it reports the full
 * width - which would make the trousers below it wider than the jacket above.
 * A vest with no sleeves reports something far narrower. So the measured
 * value is kept, but held inside the range a real hem can occupy.
 *
 * The trousers' own waist measurement is not clamped: the top edge of a pair
 * of trousers is genuinely the waist, with nothing else in the way, and it is
 * what tells a baggy pair from a skinny one.
 */
const HEM_SHARE_RANGE = [0.45, 0.69];

function hemShareOf(item) {
  const [low, high] = HEM_SHARE_RANGE;
  return Math.max(low, Math.min(high, joinsOf(item).bottom));
}

/**
 * Where an accessory belongs on a body.
 *
 * Nothing records what kind of accessory a piece is, but its description
 * usually says so plainly, so the words are matched against the places an
 * accessory can sit. `width` is a share of the top's width.
 */
const ACCESSORY_ANCHORS = [
  { at: 'head', width: 0.62, words: ['hat', 'cap', 'beanie', 'headband', 'sunglasses', 'glasses'] },
  { at: 'neck', width: 0.34, words: ['necklace', 'chain', 'pendant', 'choker', 'scarf', 'tie', 'bandana'] },
  { at: 'wrist', width: 0.20, words: ['watch', 'bracelet', 'cuff', 'bangle'] },
  { at: 'hand', width: 0.10, words: ['ring', 'signet'] },
  { at: 'waist', width: 0.72, words: ['belt', 'buckle'] },
  { at: 'side', width: 0.42, words: ['bag', 'purse', 'tote', 'backpack', 'satchel', 'pouch'] },
];

const DEFAULT_ANCHOR = { at: 'neck', width: 0.30 };

function anchorFor(item) {
  const text = `${item.description || ''} ${item.color || ''}`.toLowerCase();
  return (
    ACCESSORY_ANCHORS.find((anchor) => anchor.words.some((word) => text.includes(word))) ||
    DEFAULT_ANCHOR
  );
}

/**
 * Turns an anchor into a position, using the pieces already laid out. An
 * accessory has no seam of its own to align to - it hangs off the body, and
 * the body here is the column of clothes.
 */
function placeAccessory(anchor, width, height, torso, waistSeam) {
  const centred = 0.5 - width / 2;

  switch (anchor.at) {
    case 'head':
      return { left: centred, top: torso.top - height * 1.05 };
    case 'neck':
      // Over the collar, on whatever the outermost top layer is.
      return { left: centred, top: torso.top + torso.height * 0.03 };
    case 'wrist':
      // At the end of a sleeve, to the side of the torso.
      return { left: torso.left - width * 0.4, top: torso.top + torso.height * 0.62 };
    case 'hand':
      return { left: torso.left - width * 1.2, top: torso.top + torso.height * 0.84 };
    case 'waist':
      return { left: centred, top: waistSeam - height / 2 };
    case 'side':
      return {
        left: Math.min(0.98 - width, torso.left + torso.width * 0.9),
        top: torso.top + torso.height * 0.5,
      };
    default:
      return { left: centred, top: torso.top + torso.height * 0.03 };
  }
}

function computeLayout(items, aspects) {
  const byCategory = {};
  const tops = [];
  const accessories = [];

  items.forEach((item) => {
    if (!aspects[item.id]) return;
    if (item.category === 'top') tops.push(item);
    else if (item.category === 'accessory') accessories.push(item);
    else byCategory[item.category] = item;
  });

  // Lightest first: that is the order the clothes go on, and the order they
  // have to be drawn in for the outer one to sit over the inner.
  tops.sort((a, b) => (a.warmth_level || 3) - (b.warmth_level || 3));
  const baseLayer =
    tops.length > 1 && (tops[0].warmth_level || 3) <= BASE_LAYER_MAX_WARMTH ? tops[0] : null;
  const top = baseLayer ? tops[tops.length - 1] : tops[0];
  if (top) byCategory.top = top;

  const bottom = byCategory.bottom;
  const shoes = byCategory.footwear;
  if (!top && !bottom) return [];

  // Widths chain downwards from the top: each opening matches the hem above.
  const widths = {};
  if (top) widths.top = TOP_WIDTH;

  if (bottom) {
    const hemAbove = top ? widths.top * hemShareOf(top) : TOP_WIDTH * 0.7;
    widths.bottom = hemAbove / joinsOf(bottom).top;
  }

  if (shoes) {
    widths.footwear = TOP_WIDTH * SHOE_TO_TOP;
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

  const rawTotal =
    stacked.reduce((sum, category) => sum + heights[category], 0) +
    GAP * (stacked.length - 1);

  const scale = rawTotal > FILL ? FILL / rawTotal : 1;
  const placed = [];
  let y = (1 - rawTotal * scale) / 2;

  stacked.forEach((category, index) => {
    const width = widths[category] * scale;
    const height = heights[category] * scale;
    if (index > 0) y += GAP * scale;

    // Aligned by the seam rather than by the bounding box: a garment is
    // centred on the edge that joins it to its neighbour, so a pair of
    // trousers whose legs hang to one side still has its waist on the axis.
    const joins = joinsOf(byCategory[category]);
    const seam = index === 0 ? joins.bottom_offset : joins.top_offset;

    placed.push({
      item: byCategory[category],
      left: 0.5 - width / 2 - seam * width,
      top: y,
      width,
      height,
      rotate: '0deg',
      z: (index + 2) * 10,
    });
    y += height;
  });

  const torso = placed.find((entry) => entry.item.category === 'top') || placed[0];

  // The outer layer sits behind the top, on the same axis: an offset jacket
  // would pull the whole figure off centre, which is the one thing a
  // symmetrical layout cannot afford.
  const coat = byCategory.outerwear;
  if (coat && torso && aspects[coat.id]) {
    const width = torso.width * OUTERWEAR_TO_TOP;
    const height = (width * CANVAS_RATIO) / aspects[coat.id];
    placed.push({
      item: coat,
      left: 0.5 - width / 2,
      top: torso.top - (height - torso.height) / 2,
      width,
      height,
      rotate: '0deg',
      z: 5,
    });
  }

  // A base layer sits under the piece over it, spread a little wider and
  // dropped a little lower, so a collar shows above and a hem below. Without
  // that the two tops would simply hide one another.
  if (baseLayer && torso && aspects[baseLayer.id]) {
    const width = torso.width * BASE_LAYER_SPREAD;
    const height = (width * CANVAS_RATIO) / aspects[baseLayer.id];
    placed.push({
      item: baseLayer,
      left: 0.5 - width / 2,
      top: torso.top + torso.height * BASE_LAYER_DROP,
      width,
      height,
      rotate: '0deg',
      z: torso.z - 1,
    });
  }

  // Accessories go on last, where they would sit on a person.
  const bottomEntry = placed.find((entry) => entry.item.category === 'bottom');
  const waistSeam = bottomEntry ? bottomEntry.top : (torso ? torso.top + torso.height : 0.5);

  if (torso) {
    accessories.forEach((item) => {
      const anchor = anchorFor(item);
      const width = torso.width * anchor.width;
      const height = (width * CANVAS_RATIO) / aspects[item.id];
      const spot = placeAccessory(anchor, width, height, torso, waistSeam);
      placed.push({
        item,
        left: spot.left,
        top: spot.top,
        width,
        height,
        rotate: '0deg',
        z: 90,
      });
    });
  }

  // Drawn back to front.
  placed.sort((a, b) => a.z - b.z);
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
    <>
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

      {/* Development only: every number the layout worked from, so a bad
          result can be read off the screen instead of guessed at. */}
      {__DEV__ && SHOW_LAYOUT_DEBUG && (
        <View style={styles.debug}>
          <Text style={styles.debugTitle}>layout · dev only</Text>
          {placed.map((entry) => (
            <Text key={entry.item.id} style={styles.debugRow}>
              {entry.item.category}
              {entry.item.category === 'accessory' ? ` @${anchorFor(entry.item).at}` : ''}
              {'  w '}{entry.width.toFixed(2)} h {entry.height.toFixed(2)}
              {'  y '}{entry.top.toFixed(2)} z {entry.z}
            </Text>
          ))}
        </View>
      )}
    </>
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
  debug: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.md,
    marginTop: -space.md,
    marginBottom: space.xl,
  },
  debugTitle: { ...type.label, fontSize: 9, marginBottom: space.xs },
  debugRow: { color: colors.textMuted, fontSize: 10, lineHeight: 15 },
  caption: {
    ...type.label,
    color: colors.textFaint,
    position: 'absolute',
    left: space.lg,
    bottom: space.md,
    zIndex: 10,
  },
});