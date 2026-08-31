import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Image, ActivityIndicator, Alert, ScrollView, FlatList,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { api, resolveImageUrl } from '../api/client';
import OutfitComposition from '../components/OutfitComposition';
import { CLOTHING_CATEGORIES } from '../config';
import { colors, space, radius, type, swatchColor, CATEGORY_LABELS } from '../theme';

/**
 * Building a look by hand.
 *
 * The composition sits at the top and updates as pieces are tapped, so the
 * combination is judged by looking at it rather than by reading a list of
 * names - which is the whole reason the composition exists.
 *
 * Selection is a set, not one slot per category: two tops is a t-shirt under
 * a jumper, and that is a normal thing to want.
 */
export default function LookBuilderScreen({ route, navigation }) {
  const existing = route.params?.look || null;

  const [wardrobe, setWardrobe] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(existing?.name || '');
  const [note, setNote] = useState(existing?.note || '');
  const [selected, setSelected] = useState(
    () => new Set((existing?.items || []).map((item) => item.id))
  );

  useEffect(() => {
    api.getWardrobe()
      .then(setWardrobe)
      .catch((err) => Alert.alert('Wardrobe unavailable', err.message))
      .finally(() => setLoading(false));
  }, []);

  const byCategory = useMemo(() => {
    const map = {};
    wardrobe.forEach((item) => {
      (map[item.category] = map[item.category] || []).push(item);
    });
    return map;
  }, [wardrobe]);

  // Worn order, so the preview layers them the way they go on.
  const chosen = useMemo(() => {
    const order = ['top', 'bottom', 'outerwear', 'footwear', 'accessory'];
    return wardrobe
      .filter((item) => selected.has(item.id))
      .sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
  }, [wardrobe, selected]);

  function toggle(itemId) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Name it', 'Give the look a name so you can find it later.');
      return;
    }
    if (chosen.length < 2) {
      Alert.alert('Add another piece', 'A look needs at least two pieces.');
      return;
    }

    setSaving(true);
    const payload = {
      name: name.trim(),
      note: note.trim() || null,
      item_ids: chosen.map((item) => item.id),
    };

    try {
      if (existing) await api.updateLook(existing.id, payload);
      else await api.createLook(payload);
      navigation.goBack();
    } catch (err) {
      Alert.alert('Not saved', err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
        <Text style={styles.back}>← My looks</Text>
      </TouchableOpacity>
      <Text style={styles.display}>{existing ? 'Edit look' : 'Build a look'}</Text>

      {chosen.length >= 3 ? (
        <OutfitComposition items={chosen} />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>
            {chosen.length === 0
              ? 'Pick pieces below and they appear here'
              : 'Add a piece or two more to see the look'}
          </Text>
        </View>
      )}

      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Weekend uniform"
        placeholderTextColor={colors.textFaint}
      />

      <Text style={[styles.label, styles.spaced]}>Note</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={note}
        onChangeText={setNote}
        placeholder="Anything to remember about wearing it"
        placeholderTextColor={colors.textFaint}
        multiline
      />

      {CLOTHING_CATEGORIES.map((category) => {
        const items = byCategory[category];
        if (!items || items.length === 0) return null;
        return (
          <View key={category} style={styles.section}>
            <Text style={styles.label}>{CATEGORY_LABELS[category]}</Text>
            <FlatList
              horizontal
              data={items}
              keyExtractor={(item) => String(item.id)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.row}
              renderItem={({ item }) => {
                const uri = resolveImageUrl(item.image_url);
                const on = selected.has(item.id);
                return (
                  <TouchableOpacity
                    style={[styles.piece, on && styles.pieceOn]}
                    onPress={() => toggle(item.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.pieceTile}>
                      {uri ? (
                        <Image source={{ uri }} style={styles.pieceImage} resizeMode="contain" />
                      ) : (
                        <View
                          style={[styles.pieceSwatch, { backgroundColor: swatchColor(item.color) }]}
                        />
                      )}
                    </View>
                    <Text style={[styles.pieceLabel, on && styles.pieceLabelOn]} numberOfLines={1}>
                      {item.color}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        );
      })}

      {chosen.length >= 2 && name.trim() ? (
        <Animated.View entering={FadeIn.duration(160)}>
          <TouchableOpacity
            style={[styles.primary, saving && styles.disabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.accentInk} />
            ) : (
              <Text style={styles.primaryText}>
                {existing ? 'Save changes' : `Save look · ${chosen.length} pieces`}
              </Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      ) : null}
    </ScrollView>
  );
}

const TILE = 72;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  loading: { flex: 1, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  content: { padding: space.xl, paddingTop: 72, paddingBottom: space.xxxl },
  back: { color: colors.textMuted, fontSize: 15, marginBottom: space.lg },
  display: { ...type.display, marginBottom: space.xl },

  placeholder: {
    width: '100%',
    aspectRatio: 1.4,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xl,
    paddingHorizontal: space.xl,
  },
  placeholderText: { ...type.bodyMuted, textAlign: 'center' },

  label: { ...type.label },
  spaced: { marginTop: space.lg },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: colors.lineStrong,
    paddingVertical: space.md,
    fontSize: 16,
    color: colors.text,
    marginTop: space.xs,
  },
  textArea: { minHeight: 56, textAlignVertical: 'top' },

  section: { marginTop: space.xl },
  row: { paddingTop: space.md, paddingRight: space.xl },
  piece: { width: TILE, marginRight: space.sm, opacity: 0.55 },
  pieceOn: { opacity: 1 },
  pieceTile: {
    width: TILE,
    height: TILE,
    borderRadius: radius.sm,
    backgroundColor: colors.tile,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pieceImage: { width: '100%', height: '100%' },
  pieceSwatch: { width: '70%', height: '70%', borderRadius: radius.sm },
  pieceLabel: {
    fontSize: 11,
    color: colors.textFaint,
    marginTop: space.xs,
    textTransform: 'lowercase',
  },
  pieceLabelOn: { color: colors.text, fontWeight: '700' },

  primary: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.lg,
    alignItems: 'center',
    marginTop: space.xxl,
    minHeight: 54,
    justifyContent: 'center',
  },
  disabled: { opacity: 0.6 },
  primaryText: { color: colors.accentInk, fontWeight: '700', fontSize: 15 },
});