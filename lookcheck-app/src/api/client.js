/**
 * API client for the LookCheck AI backend.
 *
 * IMPORTANT (read this before running the app):
 * When testing on a real phone via Expo Go, "localhost" refers to the PHONE
 * itself, not your computer. You must replace API_BASE_URL below with your
 * computer's LAN IP address (e.g. "http://192.168.1.42:8000").
 *
 * How to find your computer's LAN IP:
 *   - Windows: open Command Prompt, run `ipconfig`, look for "IPv4 Address"
 *   - macOS/Linux: open Terminal, run `ifconfig | grep inet` (or `ip a`)
 *
 * Your phone and computer must be on the same Wi-Fi network.
 */

export const API_BASE_URL = 'http://192.168.1.198:8000'; // <-- CHANGE THIS

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message = body.error || message;
    } catch (e) {
      // response wasn't JSON - keep default message
    }
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

export const api = {
  // --- Users ---
  createUser: (data) => request('/api/users', { method: 'POST', body: JSON.stringify(data) }),
  getUser: (userId) => request(`/api/users/${userId}`),
  updateLocation: (userId, data) =>
    request(`/api/users/${userId}/location`, { method: 'PUT', body: JSON.stringify(data) }),

  // --- Wardrobe ---
  getWardrobe: (userId) => request(`/api/users/${userId}/wardrobe`),
  addWardrobeItem: (userId, item) =>
    request(`/api/users/${userId}/wardrobe`, { method: 'POST', body: JSON.stringify(item) }),
  deleteWardrobeItem: (userId, itemId) =>
    request(`/api/users/${userId}/wardrobe/${itemId}`, { method: 'DELETE' }),

  analyzePhoto: async (userId, photoUri) => {
    const formData = new FormData();
    formData.append('photo', {
      uri: photoUri,
      name: 'photo.jpg',
      type: 'image/jpeg',
    });
    const response = await fetch(`${API_BASE_URL}/api/wardrobe/analyze-photo`, {
      method: 'POST',
      body: formData,
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    if (!response.ok) throw new Error('Photo analysis failed');
    return response.json();
  },

  parseLink: (url) =>
    request('/api/wardrobe/parse-link', { method: 'POST', body: JSON.stringify({ url }) }),

  // --- Weather ---
  getWeather: (lat, lon) => request(`/api/weather?lat=${lat}&lon=${lon}`),

  // --- Outfits ---
  getEvents: () => request('/api/events'),
  getOutfitToday: (userId) => request(`/api/users/${userId}/outfit/today`, { method: 'POST' }),
  getOutfitForEvent: (userId, eventName) =>
    request(`/api/users/${userId}/outfit/event`, {
      method: 'POST',
      body: JSON.stringify({ event_name: eventName }),
    }),
  getOutfitHistory: (userId) => request(`/api/users/${userId}/outfits/history`),
};
