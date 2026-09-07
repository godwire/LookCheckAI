import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { colors, space, radius } from '../theme';

/**
 * How the wardrobe is laid out.
 *
 * The three modes are the mobile reading of a file browser: a detailed row,
 * a large tile, a small tile. Nothing is hidden in one that is visible in
 * another - only the density changes, so switching never costs information,
 * it just trades detail for how much fits on screen.
 */
export const VIEW_MODES = {
  list: {
    columns: 1,
    icon: 'view-list',
    iconInactive: 'view-list-outline',
    label: 'Rows',
  },

  grid: {
    columns: 2,
    icon: 'view-grid',
    iconInactive: 'view-grid-outline',
    label: 'Tiles',
  },

  dense: {
    columns: 3,
    icon: 'view-comfy',
    iconInactive: 'view-comfy-outline',
    label: 'Small tiles',
  },
};

export const VIEW_ORDER = ['list', 'grid', 'dense'];

export const DEFAULT_VIEW_MODE = 'list';

export default function WardrobeViewSwitcher({ mode, onChange }) {
  return (
    <View style={styles.group}>
      {VIEW_ORDER.map((value) => {
        const config = VIEW_MODES[value];
        const selected = mode === value;

        return (
          <Pressable
            key={value}
            style={[styles.button, selected && styles.buttonActive]}
            onPress={() => onChange(value)}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={config.label}
            accessibilityState={{ selected }}
          >
            <MaterialCommunityIcons
              name={selected ? config.icon : config.iconInactive}
              size={17}
              color={selected ? colors.text : colors.textFaint}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    alignItems: 'center',

    height: 36,

    padding: 3,

    borderRadius: radius.pill,

    backgroundColor: colors.surface,

    borderWidth: 1,
    borderColor: colors.line,
  },

  button: {
    width: 34,
    height: 28,

    alignItems: 'center',
    justifyContent: 'center',

    borderRadius: radius.pill,
  },

  buttonActive: {
    backgroundColor: colors.surfaceHigh,
  },
});