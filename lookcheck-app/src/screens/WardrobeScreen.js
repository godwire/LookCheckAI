import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  LayoutAnimation,
  useWindowDimensions,
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { useFocusEffect } from '@react-navigation/native';

import { api } from '../api/client';

import ClothingCard from '../components/ClothingCard';
import ClothingTile from '../components/ClothingTile';
import ItemSheet from '../components/ItemSheet';
import WardrobeFilterChip from '../components/WardrobeFilterChip';

import WardrobeViewSwitcher, {
  VIEW_MODES,
  DEFAULT_VIEW_MODE,
} from '../components/WardrobeViewSwitcher';

import {
  colors,
  space,
  radius,
  type,
  CATEGORY_LABELS,
} from '../theme';

const FILTERS = [
  'all',
  'top',
  'bottom',
  'outerwear',
  'footwear',
  'accessory',
];

const CHIP_HEIGHT = 36;

const FILTER_ROW_HEIGHT =
  CHIP_HEIGHT + space.lg;

const GRID_GAP = space.md;

const VIEW_MODE_KEY = 'wardrobe:viewMode';

export default function WardrobeScreen({
  navigation,
}) {
  const { width } = useWindowDimensions();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');

  /* Row view opens a card in place; tile views open a sheet. */
  const [expandedId, setExpandedId] = useState(null);
  const [sheetId, setSheetId] = useState(null);

  const [viewMode, setViewMode] = useState(DEFAULT_VIEW_MODE);
  const [viewReady, setViewReady] = useState(false);

  /*
   * The chosen layout is a preference, not a session detail: someone who
   * reads their wardrobe as small tiles wants it that way tomorrow too.
   * The list is held back until the stored choice is known, so the screen
   * does not open in rows and then rearrange itself.
   */
  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const stored = await AsyncStorage.getItem(VIEW_MODE_KEY);

        if (active && stored && VIEW_MODES[stored]) {
          setViewMode(stored);
        }
      } catch {
        /* A missing preference is not worth interrupting the screen for. */
      } finally {
        if (active) setViewReady(true);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  function changeViewMode(next) {
    if (next === viewMode) return;

    LayoutAnimation.configureNext(
      LayoutAnimation.Presets.easeInEaseOut
    );

    setExpandedId(null);
    setSheetId(null);
    setViewMode(next);

    AsyncStorage.setItem(VIEW_MODE_KEY, next).catch(() => {});
  }

  const loadWardrobe = useCallback(
    async () => {
      setLoading(true);

      try {
        setItems(await api.getWardrobe());
      } catch (err) {
        Alert.alert(
          'Wardrobe unavailable',
          err.message
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      loadWardrobe();
    }, [loadWardrobe])
  );

  const counts = useMemo(() => {
    const map = {};

    items.forEach((item) => {
      map[item.category] =
        (map[item.category] || 0) + 1;
    });

    return map;
  }, [items]);

  const availableFilters = useMemo(
    () =>
      FILTERS.filter(
        (value) =>
          value === 'all' || counts[value]
      ),
    [counts]
  );

  /*
   * If the last item of the active category is removed,
   * that filter disappears from the row.
   *
   * Fall back to "everything" instead of showing
   * an empty/dead category.
   */
  const activeFilter =
    availableFilters.includes(filter)
      ? filter
      : 'all';

  const visible = useMemo(
    () =>
      activeFilter === 'all'
        ? items
        : items.filter(
            (item) =>
              item.category === activeFilter
          ),
    [items, activeFilter]
  );

  /*
   * Read the sheet's garment out of the live list rather than storing a
   * copy of it, so an edit made on another screen is reflected when the
   * wardrobe reloads on focus.
   */
  const sheetItem = useMemo(
    () =>
      sheetId === null
        ? null
        : items.find(
            (item) => item.id === sheetId
          ) || null,
    [items, sheetId]
  );

  const columns = VIEW_MODES[viewMode].columns;
  const isGrid = columns > 1;

  const tileWidth =
    (width -
      space.xl * 2 -
      GRID_GAP * (columns - 1)) /
    columns;

  function toggle(itemId) {
    setExpandedId((current) =>
      current === itemId
        ? null
        : itemId
    );
  }

  function confirmDelete(item) {
    Alert.alert(
      'Remove this piece?',
      `${item.color} ${item.category} will be removed from your wardrobe.`,
      [
        {
          text: 'Keep',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            handleDelete(item.id),
        },
      ]
    );
  }

  async function handleDelete(itemId) {
    const snapshot = items;

    LayoutAnimation.configureNext(
      LayoutAnimation.Presets.easeInEaseOut
    );

    setExpandedId(null);
    setSheetId(null);

    setItems((prev) =>
      prev.filter(
        (item) => item.id !== itemId
      )
    );

    try {
      await api.deleteWardrobeItem(itemId);
    } catch (err) {
      setItems(snapshot);

      Alert.alert(
        'Not removed',
        err.message
      );
    }
  }

  function renderItem({ item }) {
    if (isGrid) {
      return (
        <ClothingTile
          item={item}
          width={tileWidth}
          dense={columns > 2}
          onPress={() => setSheetId(item.id)}
        />
      );
    }

    return (
      <ClothingCard
        item={item}
        expanded={expandedId === item.id}
        onToggle={() => toggle(item.id)}
        onEdit={() =>
          navigation.navigate('EditItem', { item })
        }
        onDelete={() => confirmDelete(item)}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>
            {items.length}{' '}
            {items.length === 1
              ? 'piece'
              : 'pieces'}
          </Text>

          <Text style={styles.display}>
            Wardrobe
          </Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.ghost}
            onPress={() =>
              navigation.navigate('Looks')
            }
            activeOpacity={0.7}
          >
            <Text style={styles.ghostText}>
              Looks
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.add}
            onPress={() =>
              navigation.navigate('AddItem')
            }
            activeOpacity={0.8}
          >
            <Text style={styles.addText}>
              Add
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {items.length > 0 && (
        <View style={styles.filterRow}>
          <FlatList
            style={styles.filterList}
            horizontal
            data={availableFilters}
            keyExtractor={(value) => value}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={
              styles.filterContent
            }
            renderItem={({ item: value }) => {
              const selected =
                activeFilter === value;

              const label =
                value === 'all'
                  ? 'Everything'
                  : CATEGORY_LABELS[value];

              return (
                <WardrobeFilterChip
                  value={value}
                  label={label}
                  selected={selected}
                  onPress={() => {
                    setExpandedId(null);
                    setFilter(value);
                  }}
                />
              );
            }}
          />

          <View style={styles.switcher}>
            <WardrobeViewSwitcher
              mode={viewMode}
              onChange={changeViewMode}
            />
          </View>
        </View>
      )}

      {items.length === 0 && !loading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            Your wardrobe is empty
          </Text>

          <Text style={styles.emptyBody}>
            Photograph a piece, paste a shop
            link, or type the details in yourself.
          </Text>

          <TouchableOpacity
            style={styles.primary}
            onPress={() =>
              navigation.navigate('AddItem')
            }
            activeOpacity={0.8}
          >
            <Text style={styles.primaryText}>
              Add a piece
            </Text>
          </TouchableOpacity>
        </View>
      ) : viewReady ? (
        <FlatList
          /*
           * FlatList cannot change its column count in place, so the key
           * carries the layout - switching views remounts the list rather
           * than leaving it in a half-measured state.
           */
          key={`wardrobe-${columns}`}
          style={styles.list}
          data={visible}
          numColumns={columns}
          keyExtractor={(item) =>
            String(item.id)
          }
          renderItem={renderItem}
          columnWrapperStyle={
            isGrid ? styles.column : undefined
          }
          onRefresh={loadWardrobe}
          refreshing={loading}
          contentContainerStyle={
            styles.listContent
          }
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View style={styles.list} />
      )}

      <ItemSheet
        item={sheetItem}
        onClose={() => setSheetId(null)}
        onEdit={() => {
          const item = sheetItem;

          setSheetId(null);

          if (item) {
            navigation.navigate('EditItem', { item });
          }
        }}
        onDelete={() => {
          if (sheetItem) confirmDelete(sheetItem);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.ink,
    paddingTop: 72,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',

    paddingHorizontal: space.xl,
  },

  eyebrow: {
    ...type.label,
    marginBottom: space.sm,
  },

  display: {
    ...type.display,
  },

  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',

    marginBottom: space.xs,
  },

  ghost: {
    paddingVertical: space.sm,
    paddingHorizontal: space.md,

    marginRight: space.xs,
  },

  ghostText: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 14,
  },

  add: {
    borderWidth: 1,
    borderColor: colors.lineStrong,

    borderRadius: radius.pill,

    paddingVertical: space.sm,
    paddingHorizontal: space.lg,

    marginBottom: space.xs,
  },

  addText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
  },

  filterRow: {
    height: FILTER_ROW_HEIGHT,

    flexDirection: 'row',
    alignItems: 'center',

    flexGrow: 0,
    flexShrink: 0,

    marginTop: space.lg,
  },

  filterList: {
    flex: 1,
  },

  filterContent: {
    alignItems: 'center',

    paddingLeft: space.xl,
    paddingRight: space.sm,
  },

  /*
   * The switcher sits outside the scrolling chips: it is a property of the
   * whole wardrobe, not one more thing to filter by, and it should stay
   * reachable however far the categories are scrolled.
   */
  switcher: {
    justifyContent: 'center',

    paddingLeft: space.sm,
    paddingRight: space.xl,

    borderLeftWidth: 1,
    borderLeftColor: colors.line,

    marginLeft: space.xs,
  },

  list: {
    flex: 1,
  },

  listContent: {
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.xxxl,
  },

  column: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP + space.xs,
  },

  empty: {
    paddingTop: space.xxxl,
    paddingHorizontal: space.xl,
  },

  emptyTitle: {
    ...type.heading,
    marginBottom: space.sm,
  },

  emptyBody: {
    ...type.bodyMuted,
    marginBottom: space.xl,
  },

  primary: {
    backgroundColor: colors.accent,

    borderRadius: radius.pill,

    paddingVertical: space.lg,

    alignItems: 'center',
  },

  primaryText: {
    color: colors.accentInk,
    fontWeight: '700',
    fontSize: 15,
  },
});