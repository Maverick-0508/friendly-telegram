// Lawn Craft Client Portal & Dynamic Personalization Engine (entry module).
// Loaded with <script type="module">; feature code lives in /portal/*.js.
import { openClientAccessModal } from './portal/access.js';
import { fetchClientProfile } from './portal/api.js';
import { initPricingCalculator } from './portal/calculator.js';
import { updateTopNavUser, renderPersonalizedState, refreshCurrentClient, handleLogout } from './portal/hub.js';
import { state, getQueryIdentifier, getStoredIdentifier, setStoredIdentifier, getStoredPin, showToast } from './portal/state.js';

export function initClientNavTriggers() {
  document.querySelectorAll('.client-access-trigger').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      if (state.currentClientData) {
        // Scroll to personalized dashboard
        const dash = document.getElementById('personalized-dashboard');
        if (dash) {
          dash.scrollIntoView({ behavior: 'smooth' });
        }
      } else {
        openClientAccessModal();
      }
    });
  });
}

// Main Auto-Initialization
// Open the hub sign-in with the identifier prefilled (deep links from SMS,
// the PWA shortcut, /login redirects).
export function promptForHub(prefillIdentifier) {
  if (!document.getElementById('instant-calculator') && !document.querySelector('.client-access-trigger')) return;
  openClientAccessModal();
  const input = document.getElementById('client-identifier-input');
  if (input && prefillIdentifier) {
    input.value = prefillIdentifier;
    document.getElementById('client-pin-input')?.focus();
  }
}

export async function init() {
  initClientNavTriggers();
  initPricingCalculator();

  const params = new URLSearchParams(window.location.search);
  const wantsHub = params.get('client_portal') === 'open' || params.get('hub') === 'open' || window.location.hash === '#client-hub';

  // 1. Check URL query params for ?client= or ?phone=
  const queryId = getQueryIdentifier();
  if (queryId) {
    setStoredIdentifier(queryId);
    if (getStoredPin()) {
      const data = await fetchClientProfile(queryId);
      if (data) {
        renderPersonalizedState(data);
        showToast(`Recognized from link: Welcome ${data.client.name}!`, 'success');
        return;
      }
    }
    // Known identifier but no session PIN: ask for the PIN instead of
    // silently showing the public page.
    updateTopNavUser(null);
    promptForHub(queryId);
    return;
  }

  // 2. Check localStorage for returning client (requires an active session PIN)
  const storedId = getStoredIdentifier();
  if (storedId && getStoredPin()) {
    const data = await fetchClientProfile(storedId);
    if (data) {
      renderPersonalizedState(data);
      if (wantsHub) document.getElementById('personalized-dashboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
  }

  // 3. Anonymous state
  updateTopNavUser(null);
  if (wantsHub) promptForHub(storedId || '');
}

// Expose global methods
window.LawnCraftPortal = {
  openModal: openClientAccessModal,
  logout: handleLogout,
  fetchClient: fetchClientProfile,
  refresh: refreshCurrentClient
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
