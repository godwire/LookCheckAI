/**
 * Runtime configuration.
 *
 * The backend URL is resolved in this order:
 *
 *   1. EXPO_PUBLIC_API_URL          - set in .env, wins over everything
 *   2. app.json -> extra.apiBaseUrl - used for production builds
 *   3. Automatic detection          - during development, Expo already knows
 *                                     your computer's LAN address, so we reuse
 *                                     it and just swap the port. This is why
 *                                     you no longer have to paste your IP
 *                                     anywhere: start the server on the same
 *                                     machine that runs `npx expo start` and
 *                                     it connects by itself.
 *   4. http://127.0.0.1:8000        - last resort (simulator only)
 */

import Constants from 'expo-constants';

const BACKEND_PORT = 8000;

function detectDevHost() {
  // Looks like "192.168.1.198:8081" while the Metro bundler is running.
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost ||
    Constants.manifest2?.extra?.expoGo?.debuggerHost;

  if (!hostUri) return null;

  const host = hostUri.split(':')[0];
  if (!host) return null;

  return `http://${host}:${BACKEND_PORT}`;
}

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiBaseUrl ||
  detectDevHost() ||
  `http://127.0.0.1:${BACKEND_PORT}`;

// Handy while debugging connection problems - shown on the login screen.
export const API_SOURCE = process.env.EXPO_PUBLIC_API_URL
  ? 'env'
  : Constants.expoConfig?.extra?.apiBaseUrl
  ? 'app.json'
  : detectDevHost()
  ? 'auto-detected'
  : 'fallback';

export const CLOTHING_CATEGORIES = ['top', 'bottom', 'outerwear', 'footwear', 'accessory'];
export const STYLE_OPTIONS = ['Casual', 'Streetwear', 'Business', 'Minimalist', 'Sport', 'Formal'];
