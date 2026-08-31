/**
 * API client for the LookCheck AI backend.
 *
 * All user-scoped calls send a bearer token; the backend derives the account
 * from it, so no endpoint takes a user id any more.
 *
 * The token lives in this module (set by AuthContext) rather than being passed
 * into every call, and a 401 from any request triggers the registered
 * `onUnauthorized` handler so the app can sign the user out cleanly.
 */

import { API_BASE_URL } from '../config';

/**
 * Processed wardrobe tiles are served by our own backend as relative paths
 * ("/media/..."), while items added from a shop keep the store's absolute
 * URL. Everything that renders an image goes through here.
 */
export function resolveImageUrl(url) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_BASE_URL}${url}`;
}

let authToken = null;
let onUnauthorized = null;

export function setAuthToken(token) {
  authToken = token;
}

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export { ApiError };

async function readError(response) {
  let message = `Request failed (${response.status})`;
  try {
    const body = await response.json();
    if (body?.error) message = body.error;
  } catch (e) {
    // Response wasn't JSON - keep the default message.
  }
  return message;
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  } catch (e) {
    throw new ApiError(
      `Cannot reach the server at ${API_BASE_URL}. Check that the backend is running and that your phone is on the same Wi-Fi network.`,
      0
    );
  }

  if (response.status === 401) {
    const message = await readError(response);
    if (onUnauthorized) onUnauthorized();
    throw new ApiError(message, 401);
  }

  if (!response.ok) {
    throw new ApiError(await readError(response), response.status);
  }

  if (response.status === 204) return null;
  return response.json();
}

export const api = {
  // --- Auth ---
  register: (data) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (email, password) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  getMe: () => request('/api/auth/me'),
  updateProfile: (data) => request('/api/auth/me', { method: 'PATCH', body: JSON.stringify(data) }),
  updateLocation: (data) =>
    request('/api/auth/me/location', { method: 'PUT', body: JSON.stringify(data) }),
  setAiConsent: (granted) =>
    request('/api/auth/me/ai-consent', { method: 'POST', body: JSON.stringify({ granted }) }),
  deleteAccount: () => request('/api/auth/me', { method: 'DELETE' }),

  // --- Wardrobe ---
  getWardrobe: () => request('/api/wardrobe'),
  addWardrobeItem: (item) => request('/api/wardrobe', { method: 'POST', body: JSON.stringify(item) }),
  deleteWardrobeItem: (itemId) => request(`/api/wardrobe/${itemId}`, { method: 'DELETE' }),

  /**
   * Returns { image_kind, candidates: [...] } - one candidate per garment
   * found in the photo, each with its own processed catalogue tile.
   *
   * Note: we deliberately do NOT set a Content-Type header here. React Native
   * generates the multipart boundary itself, and setting the header manually
   * strips it, which silently breaks the upload.
   */
  analyzePhoto: (photoUri) => {
    const formData = new FormData();
    formData.append('photo', { uri: photoUri, name: 'photo.jpg', type: 'image/jpeg' });
    return request('/api/wardrobe/analyze-photo', { method: 'POST', body: formData });
  },

  /**
   * Stores a photo the user chose themselves, with no AI involved. Returns
   * { image_url } - the same normalised tile every other route produces.
   */
  uploadItemPhoto: (photoUri) => {
    const formData = new FormData();
    formData.append('photo', { uri: photoUri, name: 'photo.jpg', type: 'image/jpeg' });
    return request('/api/wardrobe/photo', { method: 'POST', body: formData });
  },

  updateWardrobeItem: (itemId, fields) =>
    request(`/api/wardrobe/${itemId}`, { method: 'PATCH', body: JSON.stringify(fields) }),

  parseLink: (url) =>
    request('/api/wardrobe/parse-link', { method: 'POST', body: JSON.stringify({ url }) }),

  // --- Weather ---
  getWeather: () => request('/api/weather'),

  // --- Outfits ---
  getEvents: () => request('/api/events'),

  /** Returns today's look, generating it only if it doesn't exist yet. */
  getOutfitToday: () => request('/api/outfit/today'),

  /** Explicitly asks for a different look. Counts against the daily limit. */
  regenerateOutfitToday: () => request('/api/outfit/today', { method: 'POST' }),

  getOutfitForEvent: (eventName) =>
    request('/api/outfit/event', { method: 'POST', body: JSON.stringify({ event_name: eventName }) }),

  getOutfitHistory: () => request('/api/outfits/history'),

  sendOutfitFeedback: (outfitId, rating) =>
    request(`/api/outfits/${outfitId}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ rating }),
    }),

  // --- Saved looks ---
  getLooks: () => request('/api/looks'),
  getLook: (lookId) => request(`/api/looks/${lookId}`),
  createLook: (look) => request('/api/looks', { method: 'POST', body: JSON.stringify(look) }),
  updateLook: (lookId, fields) =>
    request(`/api/looks/${lookId}`, { method: 'PATCH', body: JSON.stringify(fields) }),
  deleteLook: (lookId) => request(`/api/looks/${lookId}`, { method: 'DELETE' }),
  /** Makes a saved look today's outfit, exactly as a generated one would be. */
  wearLook: (lookId) => request(`/api/looks/${lookId}/wear`, { method: 'POST' }),

  // --- Diagnostics ---
  health: () => request('/api/health'),
};