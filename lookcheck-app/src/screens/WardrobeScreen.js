import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useUser } from '../context/UserContext';
import { api } from '../api/client';
import ClothingCard from '../components/ClothingCard';

export default function WardrobeScreen({ navigation }) {
  const { user } = useUser();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadWardrobe = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const wardrobe = await api.getWardrobe(user.id);
      setItems(wardrobe);
    } catch (err) {
      Alert.alert('Could not load wardrobe', err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadWardrobe();
    }, [loadWardrobe])
  );

  async function handleDelete(itemId) {
    try {
      await api.deleteWardrobeItem(user.id, itemId);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch (err) {
      Alert.alert('Could not delete item', err.message);
    }
  }

  if (!user) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>My Wardrobe</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('AddItem')}
        >
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
            <ClothingCard item={item} onDelete={() => handleDelete(item.id)} />
          )}
          onRefresh={loadWardrobe}
          refreshing={loading}
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
  addButton: { backgroundColor: '#1a1a1a', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16 },
  addButtonText: { color: '#fff', fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#333' },
  emptySubtext: { fontSize: 13, color: '#888', marginTop: 6, textAlign: 'center', paddingHorizontal: 40 },
});
