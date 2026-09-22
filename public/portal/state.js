// Shared client-side state and small helpers for the Lawn Craft client hub.
const STORAGE_KEY = 'lawncraft_client_identifier';
const STORAGE_KEY_PIN = 'lawncraft_client_pin';

// Feature switches for things the business has not launched yet. Keep them
// off until the offer is real so the site never promises what it cannot do.
export const FEATURES = {
  loyalty: false, // points, tiers, cash value, referral perks
};

// Mutable state shared across the hub modules.
export const state = {
  currentClientData: null,
  originalHeroHTML: null,
  lastLookupError: null,
  onboardingUnsub: null,
};

export function getQueryIdentifier() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('client') || urlParams.get('phone') || null;
  } catch {
    return null;
  }
}

// Get stored identifier
export function getStoredIdentifier() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

// Set stored identifier
export function setStoredIdentifier(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {}
}

// The PIN is held in sessionStorage so a returning visitor is recognized for
// the rest of the browser tab's life without re-prompting, but it does not
// persist across sessions — the hub always asks on a new visit.
export function getStoredPin() {
  try {
    return sessionStorage.getItem(STORAGE_KEY_PIN) || '';
  } catch {
    return '';
  }
}

export function setStoredPin(pin) {
  try {
    sessionStorage.setItem(STORAGE_KEY_PIN, pin);
  } catch {}
}


// Escape user-controlled values before interpolating them into innerHTML.
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function firstName(name) {
  return esc(String(name || '').split(' ')[0]);
}

// Clear stored identifier and session
export function clearStoredIdentifier() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('lawncraft_access_token');
    localStorage.removeItem('lawncraft_user');
    sessionStorage.removeItem(STORAGE_KEY_PIN);
    sessionStorage.clear();
  } catch {}
}

// Toast Notification
export function showToast(message, type = 'success') {
  let container = document.getElementById('portal-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'portal-toast-container';
    container.className = 'portal-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `portal-toast portal-toast-${type}`;
  const icon = type === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation';
  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span></span>`;
  toast.querySelector('span').textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('portal-toast-fade');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}


// API: Lookup Client Profile (identifier + access PIN)
