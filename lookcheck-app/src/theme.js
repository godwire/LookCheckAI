/**
 * Design tokens for LookCheck AI.
 *
 * Direction: a lookbook after hours. The ground is a warm near-black rather
 * than a cold one - the light in a shop at closing time, not a terminal
 * window. Type is paper white, never pure #fff, so it reads as printed rather
 * than emitted. The single accent is denim indigo: the one colour every
 * wardrobe already contains.
 *
 * Colour is otherwise reserved for the clothes themselves. The interface stays
 * achromatic so that garment swatches are the only saturated thing on screen -
 * which is what makes an outfit's palette readable at a glance.
 */

export const colors = {
  ink: '#131110',          // page ground
  surface: '#1C1917',      // cards
  surfaceHigh: '#262220',  // raised / pressed
  line: '#332F2B',         // hairlines
  lineStrong: '#443F3A',

  text: '#F4EFE9',         // paper white
  textMuted: '#A39A91',
  textFaint: '#6E6862',

  accent: '#7B90CE',       // denim indigo
  accentInk: '#131110',    // type on accent
  accentDim: '#2A3050',

  positive: '#8FB593',
  negative: '#C9827A',

  overlay: 'rgba(19, 17, 16, 0.86)',

  // Garment tiles are photographed against white, the way a catalogue does it.
  // The interface stays dark; the clothes sit on paper.
  tile: '#FFFFFF',
};

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
};

/**
 * Two registers only, held far apart: large tight-tracked headings against
 * small wide-tracked uppercase labels. The gap between them gives the layout
 * its rhythm without needing a second typeface.
 */
export const type = {
  display: { fontSize: 34, fontWeight: '800', letterSpacing: -1.1, color: colors.text },
  title: { fontSize: 26, fontWeight: '700', letterSpacing: -0.7, color: colors.text },
  heading: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3, color: colors.text },
  body: { fontSize: 15, fontWeight: '400', color: colors.text, lineHeight: 22 },
  bodyMuted: { fontSize: 14, fontWeight: '400', color: colors.textMuted, lineHeight: 20 },
  small: { fontSize: 13, color: colors.textMuted },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.textFaint,
  },
  numeral: { fontSize: 44, fontWeight: '300', letterSpacing: -2, color: colors.text },
};

/**
 * Garment colour names arrive from the AI as free text ("charcoal grey",
 * "burgundy"), so the swatch strip resolves them to real pigment. Anything
 * unrecognised falls back to a neutral chip rather than guessing.
 */
const SWATCHES = {
  black: '#15130F', charcoal: '#2E2B27', graphite: '#3A3733', slate: '#4A5058',
  grey: '#8B8681', gray: '#8B8681', silver: '#B9B4AE',
  white: '#F4F1EB', ivory: '#F0E9DC', cream: '#EADFCB', bone: '#E4DACB',
  beige: '#D8C5A9', sand: '#D9C6A5', oatmeal: '#D6C9B2', ecru: '#DED3BE',
  tan: '#BE9A6E', camel: '#B58F5F', taupe: '#8E7F71', stone: '#A99C8C',
  brown: '#6B4A32', chocolate: '#4A3123', espresso: '#37261C', nude: '#D6B49A',

  navy: '#1F2A44', denim: '#3E5C86', indigo: '#3B4A80', blue: '#3E6FB0',
  cobalt: '#2C55B8', azure: '#4F8FD1', sky: '#8CB6DE', petrol: '#1F4E52',
  teal: '#1F6F6E', turquoise: '#3FA9A0',

  green: '#3E7A4A', olive: '#6B6B3C', emerald: '#2C7A5B', sage: '#9AAE8F',
  mint: '#A8D6BE', forest: '#254A32', moss: '#5C6B4A', lime: '#A8C64A',
  khaki: '#8F8560',

  red: '#B2342E', crimson: '#98252B', scarlet: '#C0392B', cherry: '#A02334',
  burgundy: '#6E2436', maroon: '#6B2028', wine: '#5E2233', rust: '#9C4A28',

  orange: '#D2732F', coral: '#D9705E', terracotta: '#B85C3C',
  apricot: '#E0A272', peach: '#E8B79A', amber: '#C68B2C', copper: '#A45F35',

  yellow: '#D9B23F', mustard: '#C69A2E', gold: '#C2A24E', honey: '#D3A94E',
  ochre: '#B98A32', lemon: '#E0CE6A',

  pink: '#D28FA3', rose: '#C97E92', blush: '#E3B5B8', salmon: '#DE9080',
  fuchsia: '#B34A8C', magenta: '#A83C7A',

  purple: '#6B4A8E', violet: '#6A4F9C', lilac: '#A894C4', lavender: '#B0A6D0',
  plum: '#5E3350', mauve: '#937C8E', aubergine: '#432740',
};

export function swatchColor(name) {
  const words = String(name || '').toLowerCase().split(/[\s/,-]+/).filter(Boolean);
  // Read right to left: in "dark olive green" the last word is the pigment.
  for (let i = words.length - 1; i >= 0; i -= 1) {
    if (SWATCHES[words[i]]) return SWATCHES[words[i]];
  }
  return colors.lineStrong;
}

/** True when a swatch needs dark type on top of it. */
export function isLightSwatch(hex) {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150;
}

export const CATEGORY_LABELS = {
  top: 'Top',
  bottom: 'Bottom',
  outerwear: 'Layer',
  footwear: 'Shoes',
  accessory: 'Accent',
};

export default { colors, space, radius, type, swatchColor, isLightSwatch, CATEGORY_LABELS };
