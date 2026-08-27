import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Image, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { useAuth } from '../context/AuthContext';
import { api, ApiError, resolveImageUrl } from '../api/client';
import { CLOTHING_CATEGORIES } from '../config';
import { colors, space, radius, type, swatchColor, CATEGORY_LABELS } from '../theme';

const WARMTH_NOTES = {
  1: 'Height of summer',
  2: 'Warm days',
  3: 'Mild, in between',
  4: 'Cold weather',
  5: 'Deep winter',
};

const METHODS = [
  { key: 'camera', title: 'Photograph it', note: 'Point at the garment, or wear it. The rest is handled.' },
  { key: 'gallery', title: 'Pick from photos', note: 'Outfit shots and screenshots both work.' },
  { key: 'link', title: 'Paste a shop link', note: 'Shared text and app links work too.' },
  { key: 'manual', title: 'Type it in', note: 'No AI involved.' },
];

export default function AddItemScreen({ navigation }) {
  const { setAiConsent } = useAuth();
  const [mode, setMode] = useState(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // When a photo contains several garments the user chooses which one to add.
  const [candidates, setCandidates] = useState(null);

  const [category, setCategory] = useState('top');
  const [color, setColor] = useState('');
  const [style, setStyle] = useState('');
  const [warmthLevel, setWarmthLevel] = useState(3);
  const [description, setDescription] = useState('');
  const [sourceLink, setSourceLink] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [cutoutUrl, setCutoutUrl] = useState(null);
  const [cutoutJoins, setCutoutJoins] = useState(null);
  const [analyzed, setAnalyzed] = useState(false);

  async function handleMethod(key) {
    if (key === 'camera') return handleTakePhoto();
    if (key === 'gallery') return handlePickPhoto();
    setMode(key);
  }

  async function handlePickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photos are off', 'Allow photo access to add pieces from your library.');
      return;
    }
    // `MediaTypeOptions` was removed in Expo SDK 54 - the array form replaces it.
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;
    setMode('photo');
    await analyzePhoto(result.assets[0].uri);
  }

  async function handleTakePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera is off', 'Allow camera access to photograph a piece.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;
    setMode('photo');
    await analyzePhoto(result.assets[0].uri);
  }

  /**
   * Attaches a photo without any AI involvement: nothing leaves the server,
   * so this needs no consent and works with no API key. The image still goes
   * through normalisation, so a hand-added piece sits on the same white
   * square as everything else.
   */
  async function attachOwnPhoto(fromCamera) {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow access to attach a photo.');
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

  function chooseOwnPhoto() {
    Alert.alert('Add a photo', null, [
      { text: 'Take a photo', onPress: () => attachOwnPhoto(true) },
      { text: 'Choose from library', onPress: () => attachOwnPhoto(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  /** The backend refuses AI analysis until the user has opted in. */
  function offerConsent(retry) {
    Alert.alert(
      'Send this to the AI?',
      'To recognise the garment, the image or shop page goes to an external AI provider. Nothing is sent until you agree.',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Allow',
          onPress: async () => {
            try {
              await setAiConsent(true);
              await retry();
            } catch (err) {
              Alert.alert('Choice not saved', err.message);
            }
          },
        },
      ]
    );
  }

  function handleAnalysisError(err, retry) {
    if (err instanceof ApiError && err.status === 403) return offerConsent(retry);
    Alert.alert('Could not read this image', `${err.message}\n\nFill in the details below instead.`);
    setAnalyzed(true);
  }

  async function analyzePhoto(uri) {
    setAnalyzing(true);
    try {
      const result = await api.analyzePhoto(uri);
      const found = result.candidates || [];

      if (found.length > 1) {
        setCandidates(found);
      } else if (found.length === 1) {
        applyCandidate(found[0]);
      }
    } catch (err) {
      handleAnalysisError(err, () => analyzePhoto(uri));
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleAnalyzeLink() {
    const url = linkUrl.trim();
    if (!url) {
      Alert.alert('Add a link', 'Paste the address of a product page first.');
      return;
    }
    setAnalyzing(true);
    try {
      applyCandidate(await api.parseLink(url));
    } catch (err) {
      handleAnalysisError(err, handleAnalyzeLink);
    } finally {
      setAnalyzing(false);
    }
  }

  function applyCandidate(attrs) {
    if (attrs.category) setCategory(attrs.category);
    if (attrs.color) setColor(attrs.color);
    if (attrs.style) setStyle(attrs.style);
    if (attrs.warmth_level) setWarmthLevel(attrs.warmth_level);
    if (attrs.description) setDescription(attrs.description);
    if (attrs.source_link) setSourceLink(attrs.source_link);
    if (attrs.image_url) setImageUrl(attrs.image_url);
    if (attrs.cutout_url) setCutoutUrl(attrs.cutout_url);
    if (attrs.cutout_joins) setCutoutJoins(attrs.cutout_joins);
    setCandidates(null);
    setAnalyzed(true);
  }

  async function handleSave() {
    if (!color.trim() || !style.trim()) {
      Alert.alert('Two fields missing', 'Colour and style are needed to match this piece.');
      return;
    }
    setSaving(true);
    try {
      await api.addWardrobeItem({
        category,
        color: color.trim(),
        style: style.trim(),
        warmth_level: warmthLevel,
        description: description.trim() || null,
        source_link: sourceLink,
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

  const previewUri = resolveImageUrl(imageUrl);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
        <Text style={styles.back}>← Wardrobe</Text>
      </TouchableOpacity>

      <Text style={styles.display}>Add a piece</Text>

      {!mode && (
        <View style={styles.methods}>
          {METHODS.map((method) => (
            <TouchableOpacity
              key={method.key}
              style={styles.method}
              onPress={() => handleMethod(method.key)}
            >
              <View style={styles.methodText}>
                <Text style={styles.methodTitle}>{method.title}</Text>
                <Text style={styles.methodNote}>{method.note}</Text>
              </View>
              <Text style={styles.chevron}>→</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {mode === 'link' && !analyzed && (
        <View>
          <Text style={styles.label}>Product page</Text>
          <TextInput
            style={styles.input}
            placeholder="Paste a link, or the whole shared message"
            placeholderTextColor={colors.textFaint}
            value={linkUrl}
            onChangeText={setLinkUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <TouchableOpacity style={styles.primary} onPress={handleAnalyzeLink}>
            <Text style={styles.primaryText}>Read this page</Text>
          </TouchableOpacity>
        </View>
      )}

      {analyzing && (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.analyzing}>Finding the garment</Text>
          <Text style={styles.analyzingNote}>
            Cutting it out of the photo and cleaning it up
          </Text>
        </View>
      )}

      {/* Several garments in one photo: pick the one being added. */}
      {candidates && !analyzing && (
        <View>
          <Text style={styles.chooserTitle}>
            Found {candidates.length} pieces. Which one are you adding?
          </Text>
          <View style={styles.chooser}>
            {candidates.map((candidate, index) => (
              <TouchableOpacity
                key={index}
                style={styles.candidate}
                onPress={() => applyCandidate(candidate)}
              >
                <View style={styles.candidateTile}>
                  <Image
                    source={{ uri: resolveImageUrl(candidate.image_url) }}
                    style={styles.candidateImage}
                    resizeMode="contain"
                  />
                </View>
                <Text style={styles.candidateLabel} numberOfLines={1}>
                  {candidate.garment_type || CATEGORY_LABELS[candidate.category]}
                </Text>
                <Text style={styles.candidateColor} numberOfLines={1}>{candidate.color}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {previewUri && !analyzing && !candidates && (
        <View style={styles.previewFrame}>
          <Image source={{ uri: previewUri }} style={styles.preview} resizeMode="contain" />
        </View>
      )}

      {mode && !analyzing && !candidates && (
        <View style={styles.form}>
          {/* Typing the details in by hand should not mean going without a
              picture - the wardrobe is meant to be looked at. */}
          {!previewUri && (
            <TouchableOpacity
              style={styles.attach}
              onPress={chooseOwnPhoto}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <>
                  <Text style={styles.attachTitle}>Add your own photo</Text>
                  <Text style={styles.attachNote}>Optional, and never sent to the AI</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {previewUri && (
            <TouchableOpacity onPress={chooseOwnPhoto} disabled={uploading}>
              <Text style={styles.replacePhoto}>
                {uploading ? 'Uploading…' : 'Replace photo'}
              </Text>
            </TouchableOpacity>
          )}

          <Text style={styles.label}>Category</Text>
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
          <TextInput
            style={styles.input}
            value={style}
            onChangeText={setStyle}
            placeholder="Minimalist"
            placeholderTextColor={colors.textFaint}
          />

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

          <TouchableOpacity
            style={[styles.primary, styles.save, saving && styles.disabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color={colors.accentInk} />
              : <Text style={styles.primaryText}>Add to wardrobe</Text>}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  content: { padding: space.xl, paddingTop: 72, paddingBottom: space.xxxl },
  back: { color: colors.textMuted, fontSize: 15, marginBottom: space.lg },
  display: { ...type.display, marginBottom: space.xl },
  methods: { borderTopWidth: 1, borderTopColor: colors.line },
  method: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  methodText: { flex: 1, paddingRight: space.md },
  methodTitle: { ...type.heading, fontSize: 17 },
  methodNote: { ...type.small, fontSize: 13, marginTop: 3 },
  chevron: { color: colors.textFaint, fontSize: 18 },

  label: { ...type.label },
  spaced: { marginTop: space.xl },
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

  centered: { alignItems: 'center', paddingVertical: space.xxl },
  analyzing: { ...type.body, fontSize: 15, marginTop: space.md },
  analyzingNote: { ...type.small, fontSize: 12, marginTop: space.xs },

  chooserTitle: { ...type.heading, fontSize: 17, marginBottom: space.lg },
  chooser: { flexDirection: 'row', flexWrap: 'wrap' },
  candidate: { width: '48%', marginRight: '2%', marginBottom: space.lg },
  candidateTile: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: colors.tile,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  candidateImage: { width: '100%', height: '100%' },
  candidateLabel: {
    ...type.heading, fontSize: 15, marginTop: space.sm, textTransform: 'capitalize',
  },
  candidateColor: { ...type.small, fontSize: 12, textTransform: 'lowercase' },

  previewFrame: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: colors.tile,
    borderWidth: 1,
    borderColor: colors.line,
    marginVertical: space.xl,
    overflow: 'hidden',
  },
  preview: { width: '100%', height: '100%' },

  form: { marginTop: space.md },
  attach: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    paddingVertical: space.xl,
    alignItems: 'center',
    marginBottom: space.xl,
    minHeight: 88,
    justifyContent: 'center',
  },
  attachTitle: { ...type.heading, fontSize: 15 },
  attachNote: { ...type.small, fontSize: 12, marginTop: 4 },
  replacePhoto: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
    paddingBottom: space.lg,
  },
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
    paddingVertical: space.lg, alignItems: 'center', marginTop: space.lg,
    minHeight: 54, justifyContent: 'center',
  },
  save: { marginTop: space.xxl },
  disabled: { opacity: 0.6 },
  primaryText: { color: colors.accentInk, fontWeight: '700', fontSize: 15 },
});
