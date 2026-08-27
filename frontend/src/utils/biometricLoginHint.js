/**
 * Biometric Login Hint
 *
 * A non-sensitive per-subdomain localStorage marker: "this device has
 * fingerprint login enabled, for this email". It's what lets the login page
 * show a "Login with Fingerprint" button and know which account to ask the
 * server about, WITHOUT the user typing their email - only the actual
 * WebAuthn assertion (verified server-side) ever proves identity.
 */

const KEY_PREFIX = 'digitaltp_biometric_hint:';

function keyFor(subdomain) {
  return `${KEY_PREFIX}${subdomain || 'default'}`;
}

export function getBiometricLoginHint(subdomain) {
  try {
    const raw = localStorage.getItem(keyFor(subdomain));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setBiometricLoginHint(subdomain, email) {
  try {
    localStorage.setItem(keyFor(subdomain), JSON.stringify({ email }));
  } catch {
    // Ignore storage failures (private browsing, quota, etc.) - the button
    // simply won't appear next time, which is a safe fallback.
  }
}

export function clearBiometricLoginHint(subdomain) {
  try {
    localStorage.removeItem(keyFor(subdomain));
  } catch {
    // Ignore
  }
}
