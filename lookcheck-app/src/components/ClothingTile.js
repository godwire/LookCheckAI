import React from 'react';
import { View, Text, Image, StyleSheet, Pressable } from 'react-native';
import Animated, {
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { resolveImageUrl } from '../api/client';
import { colors, space, radius, type, swatchColor, CATEGORY_LABELS } from '../theme';

/**
 * A garment as a tile.
 *
 * The row card in `ClothingCard` opens in place because there is horizontal
 * room for it. A tile has none, so a tap opens the detail sheet instead -
 * the garment stays the largest thing in the cell and the caption carries
 * only what a picture cannot say.
 *
 * Tiles arrive from the backend already normalised - one garment, centred on
 * a white square - so the image is rendered with `contain`, never cropped.
 */
export default function ClothingTile({
  item,
  width,
  dense = false,
  onPress,
}) {
  const uri = resolveImageUrl(item.image_url);
  const pressed = useSharedValue(0);

  const tileStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.025 }],
  }));

  return (
    <Animated.View
      style={[{ width }, tileStyle]}
      layout={LinearTransition.springify().damping(20).stiffness(160)}
    >
      <Pressable
        onPress={onPress}
        onPressIn={() => { pressed.value = withTiming(1, { duration: 90 }); }}
        onPressOut={() => { pressed.value = withTiming(0, { duration: 140 }); }}
        accessibilityRole="button"
        accessibilityLabel={`${item.color} ${CATEGORY_LABELS[item.category] || item.category}`}
      >
        <View style={[styles.frame, { height: width }, dense && styles.frameDense]}>
          {uri ? (
            <Image source={{ uri }} style={styles.image} resizeMode="contain" />
          ) : (
            <View style={[styles.swatch, { backgroundColor: swatchColor(item.color) }]} />
          )}
        </View>

        <Text
          style={[styles.title, dense && styles.titleDense]}
          numberOfLines={1}
        >
          {item.color}
        </Text>

        <Text
          style={[styles.meta, dense && styles.metaDense]}
          numberOfLines={1}
        >
          {dense
            ? CATEGORY_LABELS[item.category] || item.category
            : `${CATEGORY_LABELS[item.category] || item.category} · ${item.style}`}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',

    borderRadius: radius.md,

    backgroundColor: colors.tile,

    borderWidth: 1,
    borderColor: colors.line,

    overflow: 'hidden',

    alignItems: 'center',
    justifyContent: 'center',
  },

  frameDense: {
    borderRadius: radius.sm,
  },

  image: {
    width: '100%',
    height: '100%',
  },

  swatch: {
    width: '62%',
    height: '62%',

    borderRadius: radius.sm,
  },

  title: {
    ...type.heading,

    fontSize: 14,

    marginTop: space.sm,

    textTransform: 'capitalize',
  },

  titleDense: {
    fontSize: 12,

    marginTop: space.xs + 2,
  },

  meta: {
    fontSize: 11,

    color: colors.textMuted,

    marginTop: 1,
  },

  metaDense: {
    fontSize: 10,
  },
});