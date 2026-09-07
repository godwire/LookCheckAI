import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
} from 'react-native';

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import {
  colors,
  space,
  radius,
} from '../theme';

const FILTER_ICONS = {
  all: 'view-grid-outline',
  top: 'tshirt-crew-outline',
  bottom: 'human-male',
  outerwear: 'hanger',
  footwear: 'shoe-sneaker',
  accessory: 'bag-personal-outline',
};

export default function WardrobeFilterChip({
  value,
  label,
  selected,
  onPress,
}) {
  const iconName = FILTER_ICONS[value] || 'tag-outline';

  return (
    <TouchableOpacity
      style={[
        styles.chip,
        selected && styles.chipActive,
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <MaterialCommunityIcons
        name={iconName}
        size={16}
        color={
          selected
            ? colors.text
            : colors.textMuted
        }
      />

      <Text
        style={[
          styles.text,
          selected && styles.textActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 36,

    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',

    paddingHorizontal: 13,

    borderRadius: radius.pill,

    backgroundColor: colors.surface,

    borderWidth: 1,
    borderColor: colors.line,

    marginRight: space.sm,
  },

  chipActive: {
    backgroundColor: colors.surfaceHigh,
    borderColor: colors.lineStrong,
  },

  text: {
    marginLeft: 7,

    color: colors.textMuted,

    fontSize: 12,
    fontWeight: '600',
  },

  textActive: {
    color: colors.text,
  },
});