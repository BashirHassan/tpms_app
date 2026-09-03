/**
 * Durable per-browser device id, used for anti-cheating device fingerprinting
 * at supervisor location check-in (see locationTrackingController.js) and to
 * bind a WebAuthn biometric credential to a specific device at enrollment
 * (see biometricController.js verifyRegistration).
 *
 * Persisted redundantly in localStorage, a long-lived cookie, and IndexedDB so
 * clearing any single store (or a private window losing localStorage) doesn't
 * let a supervisor trivially mint a fresh device identity. On every read, the
 * three stores are reconciled: whichever already has a value wins, and the
 * other stores are backfilled to match. Only when none of the three has a
 * value is a fresh id generated.
 */

const STORAGE_KEY = 'digitaltp_device_id';
const COOKIE_NAME = 'digitaltp_device_id';
const COOKIE_MAX_AGE_SECONDS = 5 * 365 * 24 * 60 * 60; // 5 years
const IDB_DB_NAME = 'digitaltp_device';
const IDB_STORE_NAME = 'ids';
const IDB_KEY = 'device_id';

function readCookie() {
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(value) {
  try {
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(value)}; max-age=${COOKIE_MAX_AGE_SECONDS}; path=/; SameSite=Lax`;
  } catch {
    // Cookies disabled - localStorage/IndexedDB remain as fallbacks
  }
}

function readLocalStorage() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeLocalStorage(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // localStorage disabled/full - cookie/IndexedDB remain as fallbacks
  }
}

function openIdb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(IDB_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(IDB_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readIdb() {
  try {
    const db = await openIdb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, 'readonly');
      const req = tx.objectStore(IDB_STORE_NAME).get(IDB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function writeIdb(value) {
  try {
    const db = await openIdb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      tx.objectStore(IDB_STORE_NAME).put(value, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDB unavailable - localStorage/cookie remain as fallbacks
  }
}

let cached = null;

/**
 * Resolve the durable device id, reconciling all three stores. Async because
 * IndexedDB is async; callers that need it synchronously (e.g. inside a
 * render) should call this once on mount/effect and cache the result.
 */
export async function getOrCreateDeviceId() {
  if (cached) return cached;

  const fromLocalStorage = readLocalStorage();
  const fromCookie = readCookie();
  const fromIdb = await readIdb();

  const deviceId = fromLocalStorage || fromCookie || fromIdb || crypto.randomUUID();

  cached = deviceId;

  if (fromLocalStorage !== deviceId) writeLocalStorage(deviceId);
  if (fromCookie !== deviceId) writeCookie(deviceId);
  if (fromIdb !== deviceId) await writeIdb(deviceId);

  return deviceId;
}

/**
 * Device fingerprint payload sent with each location check-in (see
 * locationTrackingController.js generateDeviceHash).
 */
export async function generateDeviceInfo() {
  return {
    device_id: await getOrCreateDeviceId(),
    model: navigator.userAgentData?.platform || navigator.platform || 'Unknown',
    os: navigator.userAgentData?.platform || navigator.platform || 'Unknown',
    browser: navigator.userAgent.split(' ').pop() || 'Unknown',
    screen: `${screen.width}x${screen.height}`,
    language: navigator.language,
  };
}
