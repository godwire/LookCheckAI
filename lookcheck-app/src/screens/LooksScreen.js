import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { api } from '../api/client';
import ColorwayStrip from '../components/ColorwayStrip';
import { colors, space, radius, type } from '../theme';

/**
 * Looks the user put together themselves, as opposed to the ones the app
 * suggests. A look is shown by its palette rather than by a list of names:
 * the colourway is what you recognise an outfit by at a glance.
 */
export default function LooksScreen() {
  const navigation = useNavigation();
  const [looks, setLooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [wearing, setWearing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLooks(await api.getLooks());
    } catch (err) {
      Alert.alert('Looks unavailable', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleWear(look) {
    setWearing(look.id);
    try {
      await api.wearLook(look.id);
      navigation.navigate('Today');
    } catch (err) {
      Alert.alert('Could not wear this look', err.message);
    } finally {
      setWearing(null);
    }
  }

  function confirmDelete(look) {
    Alert.alert('Delete this look?', `"${look.name}" will be removed. Your clothes stay.`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const snapshot = looks;
          setLooks((prev) => prev.filter((l) => l.id !== look.id));
          try {
            await api.deleteLook(look.id);
          } catch (err) {
            setLooks(snapshot);
            Alert.alert('Not deleted', err.message);
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={styles.back}>← Wardrobe</Text>
          </TouchableOpacity>
          <Text style={styles.display}>My looks</Text>
        </View>
        <TouchableOpacity
          style={styles.add}
          onPress={() => navigation.navigate('LookBuilder', {})}
        >
          <Text style={styles.addText}>New</Text>
        </TouchableOpacity>
      </View>

      {looks.length === 0 && !loading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No looks saved yet</Text>
          <Text style={styles.emptyBody}>
            Put together a combination you like and keep it. You can wear it in one tap on
            any morning you don't feel like deciding.
          </Text>
          <TouchableOpacity
            style={styles.primary}
            onPress={() => navigation.navigate('LookBuilder', {})}
          >
            <Text style={styles.primaryText}>Build a look</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={looks}
          keyExtractor={(look) => String(look.id)}
          onRefresh={load}
          refreshing={loading}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          renderItem={({ item: look }) => (
            <Animated.View
              style={styles.card}
              entering={FadeIn.duration(200)}
              layout={LinearTransition.springify().damping(20)}
            >
              <TouchableOpacity
                onPress={() => navigation.navigate('LookBuilder', { look })}
                activeOpacity={0.7}
              >
                <View style={styles.cardHead}>
                  <View style={styles.cardText}>
                    <Text style={styles.name}>{look.name}</Text>
                    <Text style={styles.meta}>
                      {look.items.length} pieces
                      {look.occasion ? ` · ${look.occasion}` : ''}
                      {look.last_worn ? ` · worn ${look.last_worn}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </View>

                <ColorwayStrip items={look.items} height={64} />

                {look.note ? <Text style={styles.note}>{look.note}</Text> : null}
              </TouchableOpacity>

              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.action, styles.wear]}
                  onPress={() => handleWear(look)}
                  disabled={wearing === look.id}
                >
                  <Text style={styles.wearText}>
                    {wearing === look.id ? 'Setting…' : 'Wear today'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.action} onPress={() => confirmDelete(look)}>
                  <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}
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
    marginBottom: space.lg,
  },
  back: { color: colors.textMuted, fontSize: 15, marginBottom: space.sm },
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

  list: { paddingHorizontal: space.xl, paddingBottom: space.xxxl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
    marginBottom: space.md,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md },
  cardText: { flex: 1 },
  name: { ...type.heading, fontSize: 17 },
  meta: { ...type.small, fontSize: 12, marginTop: 3 },
  chevron: { color: colors.textFaint, fontSize: 20 },
  note: { ...type.small, fontSize: 13, marginTop: -space.md, marginBottom: space.md },
  actions: { flexDirection: 'row' },
  action: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.pill,
    paddingVertical: space.md - 2,
    alignItems: 'center',
    marginRight: space.sm,
  },
  wear: { backgroundColor: colors.accent, borderColor: colors.accent, marginRight: space.sm },
  wearText: { color: colors.accentInk, fontWeight: '700', fontSize: 14 },
  deleteText: { color: colors.negative, fontWeight: '700', fontSize: 14 },

  empty: { paddingHorizontal: space.xl, paddingTop: space.xxl },
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