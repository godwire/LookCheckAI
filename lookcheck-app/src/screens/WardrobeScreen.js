import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { api } from '../api/client';
import ClothingCard from '../components/ClothingCard';

export default function WardrobeScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadWardrobe = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.getWardrobe());
    } catch (err) {
      Alert.alert('Could not load wardrobe', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadWardrobe();
    }, [loadWardrobe])
  );

  function confirmDelete(item) {
    Alert.alert(
      'Remove item',
      `Remove the ${item.color.toLowerCase()} ${item.category} from your wardrobe?`,
      [
        { text: 'Cancel', style: 'cancel' },
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
      Alert.alert('Could not delete item', err.message);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.heading}>My Wardrobe</Text>
          {items.length > 0 && (
            <Text style={styles.count}>
              {items.length} {items.length === 1 ? 'item' : 'items'}
            </Text>
          )}
        </View>
        <TouchableOpacity style={styles.addButton} onPress={() => navigation.navigate('AddItem')}>
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {items.length === 0 && !loading ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Your wardrobe is empty.</Text>
          <Text style={styles.emptySubtext}>
            Tap "+ Add" to photograph an item or paste a product link.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <ClothingCard item={item} onDelete={() => confirmDelete(item)} />
          )}
          onRefresh={loadWardrobe}
          refreshing={loading}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20, paddingTop: 60 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 20,
  },
  heading: { fontSize: 28, fontWeight: '800' },
  count: { fontSize: 13, color: '#888', marginTop: 2 },
  addButton: {
    backgroundColor: '#1a1a1a', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16,
  },
  addButtonText: { color: '#fff', fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#333' },
  emptySubtext: {
    fontSize: 13, color: '#888', marginTop: 6, textAlign: 'center', paddingHorizontal: 40,
  },
  list: { paddingBottom: 20 },
});
