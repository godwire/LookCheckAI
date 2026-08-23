import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { colors, space, type } from '../theme';

const CONDITION_GLYPHS = {
  Clear: '○',
  Clouds: '◍',
  Rain: '≋',
  Drizzle: '⋮',
  Thunderstorm: '⚡',
  Snow: '✻',
  Mist: '≈',
};

/**
 * Weather as a masthead rather than a widget: the temperature is the largest
 * number on the screen, because it is the fact that decides what you wear.
 */
export default function WeatherBadge({ weather, city }) {
  if (!weather) return null;

  return (
    <View style={styles.container}>
      <View style={styles.readout}>
        <Text style={styles.temp}>{Math.round(weather.temp_c)}</Text>
        <Text style={styles.degree}>°C</Text>
      </View>

      <View style={styles.detail}>
        <Text style={styles.glyph}>{CONDITION_GLYPHS[weather.condition] || '◌'}</Text>
        <View style={styles.detailText}>
          <Text style={styles.condition} numberOfLines={1}>{weather.description}</Text>
          <Text style={styles.feels}>
            Feels {Math.round(weather.feels_like_c)}°{city ? ` · ${city}` : ''}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: space.lg,
    marginBottom: space.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  readout: { flexDirection: 'row', alignItems: 'flex-start' },
  temp: { ...type.numeral },
  degree: { fontSize: 15, color: colors.textMuted, marginTop: 10, marginLeft: 2 },
  detail: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, marginLeft: space.lg },
  glyph: { fontSize: 20, color: colors.accent, marginRight: space.sm },
  detailText: { flexShrink: 1 },
  condition: {
    fontSize: 14,
    color: colors.text,
    textTransform: 'lowercase',
    textAlign: 'right',
  },
  feels: { fontSize: 12, color: colors.textFaint, marginTop: 2, textAlign: 'right' },
});
