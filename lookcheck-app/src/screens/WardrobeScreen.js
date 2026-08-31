import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, LayoutAnimation } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { api } from '../api/client';
import ClothingCard from '../components/ClothingCard';
import { colors, space, radius, type, CATEGORY_LABELS } from '../theme';

const FILTERS = ['all', 'top', 'bottom', 'outerwear', 'footwear', 'accessory'];

const CHIP_HEIGHT = 34;
const FILTER_ROW_HEIGHT = CHIP_HEIGHT + space.lg;

export default function WardrobeScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

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

  const counts = useMemo(() => {
    const map = {};
    items.forEach((item) => { map[item.category] = (map[item.category] || 0) + 1; });
    return map;
  }, [items]);

  const availableFilters = useMemo(
    () => FILTERS.filter((value) => value === 'all' || counts[value]),
    [counts]
  );

  // If the last item of the active category is removed, that filter disappears
  // from the row - fall back to "everything" instead of showing a dead screen.
  const activeFilter = availableFilters.includes(filter) ? filter : 'all';

  const visible = useMemo(
    () => (activeFilter === 'all' ? items : items.filter((i) => i.category === activeFilter)),
    [items, activeFilter]
  );

  // One card open at a time: two open panels turn the list into a wall of text
  // and lose the comparison the wardrobe is for.
  function toggle(itemId) {
    setExpandedId((current) => (current === itemId ? null : itemId));
  }

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
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(null);
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
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.ghost} onPress={() => navigation.navigate('Looks')}>
            <Text style={styles.ghostText}>Looks</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.add} onPress={() => navigation.navigate('AddItem')}>
            <Text style={styles.addText}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/*
        The filter row sits in a fixed-height container. Without it the row is
        free to shrink once the list below fills the screen, which clipped the
        chips. The row also bleeds past the screen padding so chips scroll off
        the edge rather than stopping short of it.
      */}
      {items.length > 0 && (
        <View style={styles.filterRow}>
          <FlatList
            horizontal
            data={availableFilters}
            keyExtractor={(value) => value}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterContent}
            renderItem={({ item: value }) => {
              const selected = activeFilter === value;
              return (
                <TouchableOpacity
                  style={[styles.chip, selected && styles.chipActive]}
                  onPress={() => { setExpandedId(null); setFilter(value); }}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                    {value === 'all' ? 'Everything' : CATEGORY_LABELS[value]}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>
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
          style={styles.list}
          data={visible}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <ClothingCard
              item={item}
              expanded={expandedId === item.id}
              onToggle={() => toggle(item.id)}
              onEdit={() => navigation.navigate('EditItem', { item })}
              onDelete={() => confirmDelete(item)}
            />
          )}
          onRefresh={loadWardrobe}
          refreshing={loading}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink, paddingTop: 72 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: space.xl,
  },
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
  headerActions: { flexDirection: 'row', alignItems: 'center', marginBottom: space.xs },
  ghost: { paddingVertical: space.sm, paddingHorizontal: space.md, marginRight: space.xs },
  ghostText: { color: colors.textMuted, fontWeight: '600', fontSize: 14 },

  filterRow: {
    height: FILTER_ROW_HEIGHT,
    flexGrow: 0,
    flexShrink: 0,
    justifyContent: 'center',
    marginTop: space.lg,
  },
  filterContent: { alignItems: 'center', paddingHorizontal: space.xl },
  chip: {
    height: CHIP_HEIGHT,
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    marginRight: space.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipActive: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { color: colors.textMuted, fontSize: 13 },
  chipTextActive: { color: colors.ink, fontWeight: '700' },

  list: { flex: 1 },
  listContent: {
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.xxxl,
  },
  empty: { paddingTop: space.xxxl, paddingHorizontal: space.xl },
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