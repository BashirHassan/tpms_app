/**
 * Tab Storage Utility
 * 
 * Provides tab-scoped storage for multi-account authentication.
 * Each browser tab gets a unique tab ID, and all auth data is namespaced per tab.
 * 
 * SECURITY DESIGN:
 * - Uses sessionStorage (tab-scoped, cleared on tab close)
 * - Each tab has a unique ID that persists across page reloads
 * - Auth tokens are namespaced per tab to prevent cross-tab pollution
 * - Logging into a new account in one tab doesn't affect other tabs
 * 
 * SAME-ORIGIN TAB INHERITANCE:
 * - When a new tab opens on the same origin (e.g., CTRL+click on sidebar link),
 *   it can inherit auth from localStorage if no tab-scoped auth exists yet.
 * - This allows seamless navigation without requiring re-login.
 * - Cross-subdomain navigation still uses SSO for security.
 * 
 * @module utils/tabStorage
 */

// Tab ID key in sessionStorage (never changes for a tab's lifetime)
const TAB_ID_KEY = '__digitaltp_tab_id__';

// Storage keys prefix
const STORAGE_PREFIX = 'digitaltp';

// Shared storage key for same-origin new tab inheritance
const SHARED_AUTH_KEY = '__digitaltp_shared_auth__';

/**
 * Generate a unique tab ID using crypto API (fallback to random string)
 * @returns {string} Unique tab identifier
 */
function generateTabId() {
  // Use crypto.randomUUID if available (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Fallback: Generate a random string
  const array = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    // Last resort fallback for older browsers
    for (let i = 0; i < 16; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Get or create the unique tab ID for this browser tab.
 * The tab ID persists across page reloads within the same tab.
 * @returns {string} The tab's unique identifier
 */
export function getTabId() {
  let tabId = sessionStorage.getItem(TAB_ID_KEY);
  
  if (!tabId) {
    tabId = generateTabId();
    sessionStorage.setItem(TAB_ID_KEY, tabId);
  }
  
  return tabId;
}

/**
 * Build a namespaced storage key for the current tab
 * @param {string} key - The base key name
 * @returns {string} Namespaced key
 */
function getNamespacedKey(key) {
  const tabId = getTabId();
  return `${STORAGE_PREFIX}:${tabId}:${key}`;
}

/**
 * Store a value in tab-scoped storage
 * @param {string} key - Storage key
 * @param {*} value - Value to store (will be JSON stringified if not a string)
 */
export function setTabItem(key, value) {
  const namespacedKey = getNamespacedKey(key);
  const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
  sessionStorage.setItem(namespacedKey, stringValue);
}

/**
 * Retrieve a value from tab-scoped storage
 * @param {string} key - Storage key
 * @param {boolean} [parse=false] - Whether to JSON parse the value
 * @returns {string|object|null} The stored value or null
 */
export function getTabItem(key, parse = false) {
  const namespacedKey = getNamespacedKey(key);
  const value = sessionStorage.getItem(namespacedKey);
  
  if (value === null) return null;
  
  if (parse) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  
  return value;
}

/**
 * Remove a value from tab-scoped storage
 * @param {string} key - Storage key
 */
export function removeTabItem(key) {
  const namespacedKey = getNamespacedKey(key);
  sessionStorage.removeItem(namespacedKey);
}

/**
 * Clear all auth-related data for the current tab.
 * Called on logout or before new login to ensure clean state.
 */
export function clearTabAuth() {
  const tabId = getTabId();
  const keysToRemove = [];
  
  // Find all keys for this tab
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key && key.startsWith(`${STORAGE_PREFIX}:${tabId}:`)) {
      keysToRemove.push(key);
    }
  }
  
  // Remove them (can't remove during iteration)
  keysToRemove.forEach(key => sessionStorage.removeItem(key));
}

/**
 * Update the shared auth state in localStorage.
 * This enables same-origin new tabs to inherit auth.
 * @param {object|null} authData - Auth data to share, or null to clear
 */
function updateSharedAuth(authData) {
  if (authData === null) {
    localStorage.removeItem(SHARED_AUTH_KEY);
  } else {
    localStorage.setItem(SHARED_AUTH_KEY, JSON.stringify({
      ...authData,
      timestamp: Date.now(),
    }));
  }
}

/**
 * Get shared auth from localStorage for same-origin new tab inheritance.
 * Only returns data if it's recent (within 24 hours).
 * @returns {object|null} Shared auth data or null
 */
function getSharedAuth() {
  try {
    const data = localStorage.getItem(SHARED_AUTH_KEY);
    if (!data) return null;
    
    const parsed = JSON.parse(data);
    
    // Check if shared auth is still valid (within 24 hours)
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    if (Date.now() - parsed.timestamp > maxAge) {
      localStorage.removeItem(SHARED_AUTH_KEY);
      return null;
    }
    
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Get the auth token for the current tab.
 * Falls back to shared auth for same-origin new tabs.
 * @returns {string|null} JWT token or null
 */
export function getToken() {
  // First try tab-scoped storage
  const tabToken = getTabItem('token');
  if (tabToken) return tabToken;
  
  // Fall back to shared auth for same-origin new tabs
  const shared = getSharedAuth();
  if (shared?.token) {
    // Bootstrap this tab with shared auth
    setTabItem('token', shared.token);
    if (shared.user) {
      setTabItem('user', shared.user);
    }
    if (shared.sessionId) {
      setTabItem('sessionId', shared.sessionId);
    }
    return shared.token;
  }
  
  return null;
}

/**
 * Set the auth token for the current tab
 * @param {string} token - JWT token
 */
export function setToken(token) {
  setTabItem('token', token);
}

/**
 * Remove the auth token for the current tab
 */
export function removeToken() {
  removeTabItem('token');
}

/**
 * Get the user data for the current tab
 * @returns {object|null} User object or null
 */
export function getUser() {
  return getTabItem('user', true);
}

/**
 * Set the user data for the current tab.
 * Also updates the shared auth with the latest user data.
 * @param {object} user - User object
 */
export function setUser(user) {
  setTabItem('user', user);
  
  // Update shared auth with user data if we have a token
  const token = getTabItem('token');
  const sessionId = getTabItem('sessionId');
  if (token) {
    updateSharedAuth({ token, sessionId, user });
  }
}

/**
 * Remove the user data for the current tab
 */
export function removeUser() {
  removeTabItem('user');
}

/**
 * Get the session ID for the current tab
 * @returns {string|null} Session ID or null
 */
export function getSessionId() {
  return getTabItem('sessionId');
}

/**
 * Set the session ID for the current tab
 * @param {string} sessionId - Session ID from backend
 */
export function setSessionId(sessionId) {
  setTabItem('sessionId', sessionId);
}

/**
 * Check if the current tab is authenticated
 * @returns {boolean} True if token exists
 */
export function isAuthenticated() {
  return !!getToken();
}

/**
 * Prepare for new login by clearing any existing auth state.
 * MUST be called before each login to prevent session pollution.
 */
export function prepareForLogin() {
  clearTabAuth();
}

/**
 * Store complete auth state after successful login.
 * Also updates shared auth for same-origin new tab inheritance.
 * @param {object} authData - Auth response data
 * @param {string} authData.token - JWT token
 * @param {string} authData.sessionId - Server session ID
 * @param {object} authData.user - User profile data
 */
export function storeAuthState(authData) {
  const { token, sessionId, user } = authData;
  
  setToken(token);
  if (sessionId) {
    setSessionId(sessionId);
  }
  if (user) {
    setUser(user);
  }
  
  // Update shared auth for same-origin new tabs
  updateSharedAuth({ token, sessionId, user });
}

/**
 * Clear all auth state on logout.
 * Also clears shared auth to prevent new tabs from inheriting stale auth.
 */
export function clearAuthState() {
  clearTabAuth();
  // Clear shared auth on logout
  updateSharedAuth(null);
}

/**
 * Clear only the current tab's auth state (for 401 handling).
 * Does NOT clear shared auth - other tabs should remain unaffected.
 * Use clearAuthState() for explicit logout which clears shared auth too.
 */
export function clearTabAuthOnly() {
  clearTabAuth();
}

// Export storage keys for testing/debugging
export const STORAGE_KEYS = {
  TOKEN: 'token',
  USER: 'user',
  SESSION_ID: 'sessionId',
};

export default {
  getTabId,
  getToken,
  setToken,
  removeToken,
  getUser,
  setUser,
  removeUser,
  getSessionId,
  setSessionId,
  isAuthenticated,
  prepareForLogin,
  storeAuthState,
  clearAuthState,
  clearTabAuthOnly,
  setTabItem,
  getTabItem,
  removeTabItem,
  clearTabAuth,
};
