import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Image, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useUser } from '../context/UserContext';
import { api } from '../api/client';

const CATEGORIES = ['top', 'bottom', 'outerwear', 'footwear', 'accessory'];

export default function AddItemScreen({ navigation }) {
  const { user } = useUser();
  const [mode, setMode] = useState(null); // 'photo' | 'link' | null
  const [photoUri, setPhotoUri] = useState(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable fields, pre-filled by AI after photo/link analysis (or filled manually)
  const [category, setCategory] = useState('top');
  const [color, setColor] = useState('');
  const [style, setStyle] = useState('');
  const [warmthLevel, setWarmthLevel] = useState(3);
  const [description, setDescription] = useState('');
  const [sourceLink, setSourceLink] = useState(null);
  const [analyzed, setAnalyzed] = useState(false);

  async function handlePickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow photo library access to add wardrobe items.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled) return;

    const uri = result.assets[0].uri;
    setPhotoUri(uri);
    setMode('photo');
    await analyzePhoto(uri);
  }

  async function handleTakePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow camera access to add wardrobe items.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (result.canceled) return;

    const uri = result.assets[0].uri;
    setPhotoUri(uri);
    setMode('photo');
    await analyzePhoto(uri);
  }

  async function analyzePhoto(uri) {
    setAnalyzing(true);
    try {
      const attrs = await api.analyzePhoto(user.id, uri);
      applyAttributes(attrs);
    } catch (err) {
      Alert.alert(
        'AI analysis unavailable',
        `${err.message}\n\nYou can still fill in the details manually below.`
      );
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleAnalyzeLink() {
    if (!linkUrl.trim()) {
      Alert.alert('Enter a link', 'Paste a product page URL first.');
      return;
    }
    setAnalyzing(true);
    try {
      const attrs = await api.parseLink(linkUrl.trim());
      applyAttributes(attrs);
    } catch (err) {
      Alert.alert(
        'AI analysis unavailable',
        `${err.message}\n\nYou can still fill in the details manually below.`
      );
    } finally {
      setAnalyzing(false);
    }
  }

  function applyAttributes(attrs) {
    if (attrs.category) setCategory(attrs.category);
    if (attrs.color) setColor(attrs.color);
    if (attrs.style) setStyle(attrs.style);
    if (attrs.warmth_level) setWarmthLevel(attrs.warmth_level);
    if (attrs.description) setDescription(attrs.description);
    if (attrs.source_link) setSourceLink(attrs.source_link);
    setAnalyzed(true);
  }

  async function handleSave() {
    if (!color.trim() || !style.trim()) {
      Alert.alert('Missing details', 'Please fill in at least color and style.');
      return;
    }
    setSaving(true);
    try {
      await api.addWardrobeItem(user.id, {
        category,
        color: color.trim(),
        style: style.trim(),
        warmth_level: warmthLevel,
        description: description.trim() || null,
        source_link: sourceLink,
      });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Could not save item', err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.heading}>Add to Wardrobe</Text>

      {!mode && (
        <View style={styles.modeButtons}>
          <TouchableOpacity style={styles.modeButton} onPress={handleTakePhoto}>
            <Text style={styles.modeButtonIcon}>📷</Text>
            <Text style={styles.modeButtonText}>Take a photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.modeButton} onPress={handlePickPhoto}>
            <Text style={styles.modeButtonIcon}>🖼️</Text>
            <Text style={styles.modeButtonText}>Choose from gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.modeButton} onPress={() => setMode('link')}>
            <Text style={styles.modeButtonIcon}>🔗</Text>
            <Text style={styles.modeButtonText}>Paste a product link</Text>
          </TouchableOpacity>
        </View>
      )}

      {mode === 'link' && !analyzed && (
        <View>
          <TextInput
            style={styles.input}
            placeholder="https://store.com/product/..."
            value={linkUrl}
            onChangeText={setLinkUrl}
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.primaryButton} onPress={handleAnalyzeLink}>
            <Text style={styles.primaryButtonText}>Analyze link</Text>
          </TouchableOpacity>
        </View>
      )}

      {photoUri && <Image source={{ uri: photoUri }} style={styles.preview} />}

      {analyzing && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1a1a1a" />
          <Text style={styles.analyzingText}>AI is looking at this item...</Text>
        </View>
      )}

      {(mode && !analyzing) && (
        <View style={styles.form}>
          <Text style={styles.label}>Category</Text>
          <View style={styles.chipRow}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.chip, category === c && styles.chipActive]}
                onPress={() => setCategory(c)}
              >
                <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Color</Text>
          <TextInput style={styles.input} value={color} onChangeText={setColor} placeholder="e.g. Navy blue" />

          <Text style={styles.label}>Style</Text>
          <TextInput style={styles.input} value={style} onChangeText={setStyle} placeholder="e.g. Minimalist" />

          <Text style={styles.label}>Warmth level: {warmthLevel}/5</Text>
          <View style={styles.chipRow}>
            {[1, 2, 3, 4, 5].map((level) => (
              <TouchableOpacity
                key={level}
                style={[styles.warmthChip, warmthLevel === level && styles.chipActive]}
                onPress={() => setWarmthLevel(level)}
              >
                <Text style={[styles.chipText, warmthLevel === level && styles.chipTextActive]}>
                  {level}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Any extra detail..."
            multiline
          />

          <TouchableOpacity
            style={[styles.primaryButton, saving && styles.disabledButton]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save to wardrobe'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20, paddingTop: 60 },
  heading: { fontSize: 26, fontWeight: '800', marginBottom: 24 },
  modeButtons: { gap: 12 },
  modeButton: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ddd',
    borderRadius: 12, padding: 16, marginBottom: 12,
  },
  modeButtonIcon: { fontSize: 24, marginRight: 12 },
  modeButtonText: { fontSize: 16, fontWeight: '600' },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    padding: 14, fontSize: 15, marginBottom: 16,
  },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  primaryButton: { backgroundColor: '#1a1a1a', borderRadius: 10, padding: 16, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disabledButton: { opacity: 0.6 },
  preview: { width: '100%', height: 220, borderRadius: 12, marginVertical: 16 },
  centered: { alignItems: 'center', paddingVertical: 30 },
  analyzingText: { marginTop: 10, color: '#888' },
  form: { marginTop: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 8, textTransform: 'uppercase' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 20,
    paddingVertical: 8, paddingHorizontal: 14, marginRight: 8, marginBottom: 8,
  },
  warmthChip: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 20,
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginRight: 8,
  },
  chipActive: { backgroundColor: '#1a1a1a', borderColor: '#1a1a1a' },
  chipText: { color: '#333', textTransform: 'capitalize' },
  chipTextActive: { color: '#fff', fontWeight: '700' },
});
