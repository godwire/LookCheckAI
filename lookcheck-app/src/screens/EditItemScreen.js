import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Image, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeIn } from 'react-native-reanimated';

import { api, resolveImageUrl } from '../api/client';
import { CLOTHING_CATEGORIES, STYLE_OPTIONS } from '../config';
import { colors, space, radius, type, swatchColor, CATEGORY_LABELS } from '../theme';

const WARMTH_NOTES = {
  1: 'Height of summer',
  2: 'Warm days',
  3: 'Mild, in between',
  4: 'Cold weather',
  5: 'Deep winter',
};

export default function EditItemScreen({ route, navigation }) {
  const original = route.params.item;

  const [category, setCategory] = useState(original.category);
  const [color, setColor] = useState(original.color || '');
  const [style, setStyle] = useState(original.style || '');
  const [warmthLevel, setWarmthLevel] = useState(original.warmth_level || 3);
  const [description, setDescription] = useState(original.description || '');
  const [imageUrl, setImageUrl] = useState(original.image_url || null);
  const [cutoutUrl, setCutoutUrl] = useState(original.cutout_url || null);
  const [cutoutJoins, setCutoutJoins] = useState(original.cutout_joins || null);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const changed =
    category !== original.category ||
    color.trim() !== (original.color || '') ||
    style.trim() !== (original.style || '') ||
    warmthLevel !== original.warmth_level ||
    description.trim() !== (original.description || '') ||
    imageUrl !== (original.image_url || null);

  async function pickPhoto(fromCamera) {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow access to change this photo.');
      return;
    }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;

    setUploading(true);
    try {
      const { image_url, cutout_url, cutout_joins } =
        await api.uploadItemPhoto(result.assets[0].uri);
      setImageUrl(image_url);
      setCutoutUrl(cutout_url || null);
      setCutoutJoins(cutout_joins || null);
    } catch (err) {
      Alert.alert('Photo not saved', err.message);
    } finally {
      setUploading(false);
    }
  }

  function choosePhoto() {
    Alert.alert('Change photo', null, [
      { text: 'Take a photo', onPress: () => pickPhoto(true) },
      { text: 'Choose from library', onPress: () => pickPhoto(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function handleSave() {
    if (!color.trim() || !style.trim()) {
      Alert.alert('Two fields missing', 'Colour and style are needed to match this piece.');
      return;
    }
    setSaving(true);
    try {
      await api.updateWardrobeItem(original.id, {
        category,
        color: color.trim(),
        style: style.trim(),
        warmth_level: warmthLevel,
        description: description.trim() || null,
        image_url: imageUrl,
        cutout_url: cutoutUrl,
        cutout_joins: cutoutJoins,
      });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Not saved', err.message);
    } finally {
      setSaving(false);
    }
  }

  const uri = resolveImageUrl(imageUrl);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
        <Text style={styles.back}>← Wardrobe</Text>
      </TouchableOpacity>

      <Text style={styles.display}>Edit piece</Text>

      <TouchableOpacity style={styles.photoFrame} onPress={choosePhoto} disabled={uploading}>
        {uploading ? (
          <ActivityIndicator color={colors.accent} />
        ) : uri ? (
          <Image source={{ uri }} style={styles.photo} resizeMode="contain" />
        ) : (
          <View style={[styles.photoEmpty, { backgroundColor: swatchColor(color) }]} />
        )}
      </TouchableOpacity>
      <TouchableOpacity onPress={choosePhoto} disabled={uploading}>
        <Text style={styles.photoAction}>
          {imageUrl ? 'Change photo' : 'Add a photo'}
        </Text>
      </TouchableOpacity>

      <Text style={[styles.label, styles.spaced]}>Category</Text>
      <View style={styles.chips}>
        {CLOTHING_CATEGORIES.map((value) => (
          <TouchableOpacity
            key={value}
            style={[styles.chip, category === value && styles.chipActive]}
            onPress={() => setCategory(value)}
          >
            <Text style={[styles.chipText, category === value && styles.chipTextActive]}>
              {CATEGORY_LABELS[value]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.label, styles.spaced]}>Colour</Text>
      <View style={styles.colorRow}>
        <View style={[styles.colorSwatch, { backgroundColor: swatchColor(color) }]} />
        <TextInput
          style={[styles.input, styles.colorInput]}
          value={color}
          onChangeText={setColor}
          placeholder="Charcoal grey"
          placeholderTextColor={colors.textFaint}
        />
      </View>

      <Text style={[styles.label, styles.spaced]}>Style</Text>
      <View style={styles.chips}>
        {STYLE_OPTIONS.map((value) => (
          <TouchableOpacity
            key={value}
            style={[styles.chip, style === value && styles.chipActive]}
            onPress={() => setStyle(value)}
          >
            <Text style={[styles.chipText, style === value && styles.chipTextActive]}>
              {value}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.label, styles.spaced]}>Warmth</Text>
      <View style={styles.warmthRow}>
        {[1, 2, 3, 4, 5].map((level) => (
          <TouchableOpacity
            key={level}
            style={[styles.warmth, warmthLevel === level && styles.warmthActive]}
            onPress={() => setWarmthLevel(level)}
          >
            <Text style={[styles.warmthText, warmthLevel === level && styles.warmthTextActive]}>
              {level}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.warmthNote}>{WARMTH_NOTES[warmthLevel]}</Text>

      <Text style={[styles.label, styles.spaced]}>Notes</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={description}
        onChangeText={setDescription}
        placeholder="Anything worth remembering about this piece"
        placeholderTextColor={colors.textFaint}
        multiline
      />

      {changed && (
        <Animated.View entering={FadeIn.duration(160)}>
          <TouchableOpacity
            style={[styles.primary, saving && styles.disabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color={colors.accentInk} />
              : <Text style={styles.primaryText}>Save changes</Text>}
          </TouchableOpacity>
        </Animated.View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  content: { padding: space.xl, paddingTop: 72, paddingBottom: space.xxxl },
  back: { color: colors.textMuted, fontSize: 15, marginBottom: space.lg },
  display: { ...type.display, marginBottom: space.xl },

  photoFrame: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: colors.tile,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: { width: '100%', height: '100%' },
  photoEmpty: { width: '60%', height: '60%', borderRadius: radius.md },
  photoAction: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: space.md,
  },

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
  textArea: { minHeight: 64, textAlignVertical: 'top' },
  colorRow: { flexDirection: 'row', alignItems: 'center' },
  colorSwatch: {
    width: 34, height: 34, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.line,
    marginRight: space.md, marginTop: space.sm,
  },
  colorInput: { flex: 1 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space.md },
  chip: {
    borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radius.pill,
    paddingVertical: space.sm, paddingHorizontal: space.md,
    marginRight: space.sm, marginBottom: space.sm,
  },
  chipActive: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { color: colors.textMuted, fontSize: 13 },
  chipTextActive: { color: colors.ink, fontWeight: '700' },

  warmthRow: { flexDirection: 'row', marginTop: space.md },
  warmth: {
    width: 46, height: 46, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.lineStrong,
    alignItems: 'center', justifyContent: 'center', marginRight: space.sm,
  },
  warmthActive: { backgroundColor: colors.text, borderColor: colors.text },
  warmthText: { color: colors.textMuted, fontSize: 15 },
  warmthTextActive: { color: colors.ink, fontWeight: '700' },
  warmthNote: { ...type.small, fontSize: 12, marginTop: space.sm },

  primary: {
    backgroundColor: colors.accent, borderRadius: radius.pill,
    paddingVertical: space.lg, alignItems: 'center', marginTop: space.xxl,
    minHeight: 54, justifyContent: 'center',
  },
  disabled: { opacity: 0.6 },
  primaryText: { color: colors.accentInk, fontWeight: '700', fontSize: 15 },
});
