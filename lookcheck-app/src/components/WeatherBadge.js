import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const CONDITION_ICONS = {
  Clear: '☀️',
  Clouds: '☁️',
  Rain: '🌧️',
  Drizzle: '🌦️',
  Thunderstorm: '⛈️',
  Snow: '❄️',
  Mist: '🌫️',
};

export default function WeatherBadge({ weather }) {
  if (!weather) return null;
  const icon = CONDITION_ICONS[weather.condition] || '🌤️';

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>{icon}</Text>
      <View>
        <Text style={styles.temp}>{Math.round(weather.temp_c)}°C</Text>
        <Text style={styles.description}>
          {weather.description} · feels like {Math.round(weather.feels_like_c)}°C
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eef4ff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  icon: { fontSize: 36, marginRight: 12 },
  temp: { fontSize: 22, fontWeight: '700', color: '#1a1a1a' },
  description: { fontSize: 13, color: '#666', textTransform: 'capitalize' },
});
