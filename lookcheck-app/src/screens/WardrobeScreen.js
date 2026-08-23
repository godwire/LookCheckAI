import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { api } from '../api/client';
import ClothingCard from '../components/ClothingCard';
import { colors, space, radius, type, CATEGORY_LABELS } from '../theme';

const FILTERS = ['all', 'top', 'bottom', 'outerwear', 'footwear', 'accessory'];

export default function WardrobeScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');

  const loadWardrobe = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.getWardrobe());
    } catch (err) {
      Alert.alert('Wardrobe unavailable', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadWardrobe(); }, [loadWardrobe]));

  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter((i) => i.category === filter)),
    [items, filter]
  );

  const counts = useMemo(() => {
    const map = {};
    items.forEach((item) => { map[item.category] = (map[item.category] || 0) + 1; });
    return map;
  }, [items]);

  function confirmDelete(item) {
    Alert.alert(
      'Remove this piece?',
      `${item.color} ${item.category} will be removed from your wardrobe.`,
      [
        { text: 'Keep', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => handleDelete(item.id) },
      ]
    );
  }

  async function handleDelete(itemId) {
    const snapshot = items;
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    try {
      await api.deleteWardrobeItem(itemId);
    } catch (err) {
      setItems(snapshot);
      Alert.alert('Not removed', err.message);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>
            {items.length} {items.length === 1 ? 'piece' : 'pieces'}
          </Text>
          <Text style={styles.display}>Wardrobe</Text>
        </View>
        <TouchableOpacity style={styles.add} onPress={() => navigation.navigate('AddItem')}>
          <Text style={styles.addText}>Add</Text>
        </TouchableOpacity>
      </View>

      {items.length > 0 && (
        <FlatList
          horizontal
          data={FILTERS.filter((f) => f === 'all' || counts[f])}
          keyExtractor={(f) => f}
          showsHorizontalScrollIndicator={false}
          style={styles.filters}
          contentContainerStyle={styles.filtersContent}
          renderItem={({ item: value }) => (
            <TouchableOpacity
              style={[styles.filter, filter === value && styles.filterActive]}
              onPress={() => setFilter(value)}
            >
              <Text style={[styles.filterText, filter === value && styles.filterTextActive]}>
                {value === 'all' ? 'Everything' : CATEGORY_LABELS[value]}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}

      {items.length === 0 && !loading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Your wardrobe is empty</Text>
          <Text style={styles.emptyBody}>
            Photograph a piece, paste a shop link, or type the details in yourself.
          </Text>
          <TouchableOpacity style={styles.primary} onPress={() => navigation.navigate('AddItem')}>
            <Text style={styles.primaryText}>Add a piece</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <ClothingCard item={item} onDelete={() => confirmDelete(item)} />
          )}
          onRefresh={loadWardrobe}
          refreshing={loading}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink, paddingHorizontal: space.xl, paddingTop: 72 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  eyebrow: { ...type.label, marginBottom: space.sm },
  display: { ...type.display },
  add: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.pill,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    marginBottom: space.xs,
  },
  addText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  filters: { flexGrow: 0, marginTop: space.lg, marginBottom: space.md },
  filtersContent: { paddingRight: space.xl },
  filter: {
    borderRadius: radius.pill,
    paddingVertical: space.xs + 2,
    paddingHorizontal: space.md,
    marginRight: space.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  filterActive: { backgroundColor: colors.text, borderColor: colors.text },
  filterText: { color: colors.textMuted, fontSize: 13 },
  filterTextActive: { color: colors.ink, fontWeight: '700' },
  list: { paddingTop: space.sm, paddingBottom: space.xxxl },
  empty: { paddingTop: space.xxxl },
  emptyTitle: { ...type.heading, marginBottom: space.sm },
  emptyBody: { ...type.bodyMuted, marginBottom: space.xl },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.lg,
    alignItems: 'center',
  },
  primaryText: { color: colors.accentInk, fontWeight: '700', fontSize: 15 },
});
