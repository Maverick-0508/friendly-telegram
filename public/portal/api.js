// Calls to the Lawn Craft backend used by the client hub.
import { state, getStoredPin } from './state.js';

export async function fetchClientProfile(identifier, pin) {
  try {
    const res = await fetch('/api/portal/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, pin: pin || getStoredPin() })
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      state.lastLookupError = {
        code: body.error?.code || 'NOT_FOUND',
        message: body.error?.message || 'No client record found for this identifier',
        notFound: body.not_found || res.status === 404,
      };
      return null;
    }

    const data = await res.json();
    if (data.success && data.client) {
      state.lastLookupError = null;
      return data;
    }
    state.lastLookupError = { code: 'INVALID_DATA', message: 'Invalid client data received' };
    return null;
  } catch (err) {
    console.warn('[Portal Lookup Failed]', err);
    state.lastLookupError = { code: 'NETWORK', message: 'Network error. Please try again.' };
    return null;
  }
}

// Update Top Navigation Button
