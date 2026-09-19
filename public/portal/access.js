// Client Hub sign-in / registration modal.
import { fetchClientProfile } from './api.js';
import { renderPersonalizedState } from './hub.js';
import { state, getStoredIdentifier, setStoredIdentifier, setStoredPin, showToast } from './state.js';

export function openClientAccessModal() {
  let modal = document.getElementById('client-access-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'client-access-modal';
    modal.className = 'portal-modal-backdrop';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="portal-modal-card client-login-card">
      <button class="portal-modal-close" id="close-login-modal">&times;</button>
      <div class="client-modal-header">
        <div class="client-modal-icon"><i class="fa-solid fa-leaf"></i></div>
        <h3>Lawn Craft Client Hub</h3>
        <p>Enter your registered phone number or email and your access PIN to open your hub.</p>
      </div>

      <!-- Lookup Form -->
      <form id="client-login-form">
        <div class="form-group">
          <label for="client-identifier-input">Phone Number or Email</label>
          <div class="input-with-icon">
            <i class="fa-solid fa-user-tag"></i>
            <input type="text" id="client-identifier-input" class="form-control" placeholder="e.g. 0712 345 678 or your@email.com" required>
          </div>
        </div>
        <div class="form-group">
          <label for="client-pin-input">Access PIN</label>
          <div class="input-with-icon">
            <i class="fa-solid fa-shield-halved"></i>
            <input type="password" id="client-pin-input" class="form-control" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" placeholder="4-6 digit PIN" required>
          </div>
          <p style="font-size:0.75rem; color:#6b7280; margin:4px 0 0;">
            Your PIN protects your property, invoices and loyalty details.
          </p>
        </div>
        <button type="submit" class="btn btn-primary btn-block" id="client-login-submit-btn">
          <i class="fa-solid fa-arrow-right-to-bracket"></i> Access My Lawn
        </button>
        <div id="client-login-error-box" style="display:none; margin-top:12px; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:12px; font-size:0.85rem; color:#991b1b;">
          <i class="fa-solid fa-circle-exclamation"></i> <span id="client-login-error-text"></span>
        </div>
      </form>

      <!-- Unregistered Alert Box (Hidden initially) -->
      <div id="client-not-found-box" style="display:none; margin-top:16px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:14px; text-align:left;">
        <h4 style="font-size:0.95rem; color:#166534; margin:0 0 6px 0; display:flex; align-items:center; gap:6px;">
          <i class="fa-solid fa-circle-info"></i> Account Not Found
        </h4>
        <p style="font-size:0.85rem; color:#14532d; margin:0 0 10px 0;">
          We could not find an existing account matching that contact. You can quickly register your property below to activate your hub with 100 welcome loyalty points.
        </p>
        <button type="button" class="btn btn-primary btn-sm" id="show-register-form-btn" style="width:100%;">
          <i class="fa-solid fa-id-card"></i> Register Property Profile
        </button>
      </div>

      <!-- Inline New Client Registration Form (Initially Hidden) -->
      <div id="client-register-container" style="display:none; margin-top:20px; border-top:1px solid #e2e8f0; padding-top:18px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h4 style="font-size:1rem; color:#0f172a; margin:0; font-weight:700;">
            <i class="fa-solid fa-user-plus text-accent"></i> Register Property Profile
          </h4>
          <button type="button" id="cancel-register-btn" style="background:none; border:none; color:#64748b; font-size:0.85rem; cursor:pointer;">
            Cancel
          </button>
        </div>
        <form id="client-register-form">
          <div class="form-group" style="margin-bottom:10px;">
            <label for="reg-name" style="font-size:0.8rem; font-weight:600;">Full Name</label>
            <input type="text" id="reg-name" class="form-control" placeholder="e.g. John Kamau" required style="padding:8px 12px; font-size:0.9rem;">
          </div>
          <div class="form-group" style="margin-bottom:10px;">
            <label for="reg-phone" style="font-size:0.8rem; font-weight:600;">Mobile Phone Number</label>
            <input type="tel" id="reg-phone" class="form-control" placeholder="e.g. 0712 345 678" required style="padding:8px 12px; font-size:0.9rem;">
          </div>
          <div class="form-group" style="margin-bottom:10px;">
            <label for="reg-email" style="font-size:0.8rem; font-weight:600;">Email Address (Optional)</label>
            <input type="email" id="reg-email" class="form-control" placeholder="e.g. john@domain.co.ke" style="padding:8px 12px; font-size:0.9rem;">
          </div>
          <div class="form-group" style="margin-bottom:10px;">
            <label for="reg-address" style="font-size:0.8rem; font-weight:600;">Property Estate / Address</label>
            <input type="text" id="reg-address" class="form-control" placeholder="e.g. Karen, Runda, Muthaiga" required style="padding:8px 12px; font-size:0.9rem;">
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
            <div class="form-group" style="margin-bottom:0;">
              <label for="reg-size" style="font-size:0.8rem; font-weight:600;">Lawn Size (sq ft)</label>
              <input type="number" id="reg-size" class="form-control" placeholder="e.g. 5000" style="padding:8px 12px; font-size:0.9rem;">
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label for="reg-grass" style="font-size:0.8rem; font-weight:600;">Grass Species</label>
              <select id="reg-grass" class="form-control" style="padding:8px 12px; font-size:0.9rem;">
                <option value="Kikuyu Turf">Kikuyu Turf</option>
                <option value="Bermuda Grass">Bermuda Grass</option>
                <option value="Paspalum Vaginatum">Paspalum</option>
                <option value="St. Augustine">St. Augustine</option>
                <option value="Cape Royal Turf">Cape Royal Turf</option>
              </select>
            </div>
          </div>
          <div class="form-group" style="margin-bottom:14px;">
            <label for="reg-pin" style="font-size:0.8rem; font-weight:600;">Create Access PIN (4-6 digits)</label>
            <input type="password" id="reg-pin" class="form-control" inputmode="numeric" pattern="[0-9]{4,6}" minlength="4" maxlength="6" placeholder="e.g. 1234" required style="padding:8px 12px; font-size:0.9rem;">
            <p style="font-size:0.72rem; color:#6b7280; margin:4px 0 0;">You will use this PIN to open your hub on future visits.</p>
          </div>
          <button type="submit" class="btn btn-primary btn-block" id="reg-submit-btn">
            <i class="fa-solid fa-sparkles"></i> Create Profile & Open Hub (+100 Pts)
          </button>
        </form>
      </div>

      <div style="margin-top:18px; text-align:center;">
        <a href="#pricing-calculator" id="modal-calc-jump-btn" style="font-size:0.85rem; color:#15803d; text-decoration:underline; font-weight:600;">
          <i class="fa-solid fa-calculator"></i> Or Get an Instant Pricing Estimate First
        </a>
      </div>
    </div>
  `;

  modal.classList.add('active');

  const storedIdentifier = getStoredIdentifier();
  if (storedIdentifier) {
    const identInput = document.getElementById('client-identifier-input');
    if (identInput && !identInput.value) identInput.value = storedIdentifier;
  }

  // Close Modal
  document.getElementById('close-login-modal').addEventListener('click', () => modal.classList.remove('active'));

  // Calculator link click
  const calcLink = document.getElementById('modal-calc-jump-btn');
  if (calcLink) {
    calcLink.addEventListener('click', (e) => {
      modal.classList.remove('active');
    });
  }

  // Toggle Registration
  const notFoundBox = document.getElementById('client-not-found-box');
  const registerContainer = document.getElementById('client-register-container');
  const showRegisterBtn = document.getElementById('show-register-form-btn');
  const cancelRegisterBtn = document.getElementById('cancel-register-btn');

  if (showRegisterBtn) {
    showRegisterBtn.addEventListener('click', () => {
      notFoundBox.style.display = 'none';
      registerContainer.style.display = 'block';
      const enteredId = document.getElementById('client-identifier-input').value.trim();
      if (enteredId.includes('@')) {
        document.getElementById('reg-email').value = enteredId;
      } else if (enteredId) {
        document.getElementById('reg-phone').value = enteredId;
      }
    });
  }

  if (cancelRegisterBtn) {
    cancelRegisterBtn.addEventListener('click', () => {
      registerContainer.style.display = 'none';
    });
  }

  // Lookup Form Submit
  document.getElementById('client-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('client-identifier-input').value.trim();
    const pin = document.getElementById('client-pin-input').value.trim();
    if (!input || !pin) return;

    const submitBtn = document.getElementById('client-login-submit-btn');
    const pinErrorBox = document.getElementById('client-login-error-box');
    const pinErrorText = document.getElementById('client-login-error-text');
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Checking records...`;
    notFoundBox.style.display = 'none';
    if (pinErrorBox) pinErrorBox.style.display = 'none';

    const data = await fetchClientProfile(input, pin);
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i class="fa-solid fa-arrow-right-to-bracket"></i> Access My Lawn`;

    if (data) {
      setStoredIdentifier(input);
      setStoredPin(pin);
      modal.classList.remove('active');
      showToast(`Welcome back, ${data.client.name}!`, 'success');
      renderPersonalizedState(data);
    } else if (state.lastLookupError && (state.lastLookupError.code === 'INVALID_PIN' || state.lastLookupError.code === 'ACCESS_PIN_REQUIRED')) {
      if (pinErrorText) pinErrorText.textContent = state.lastLookupError.message;
      if (pinErrorBox) pinErrorBox.style.display = 'block';
    } else {
      notFoundBox.style.display = 'block';
    }
  });

  // Registration Form Submit
  const regForm = document.getElementById('client-register-form');
  if (regForm) {
    regForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('reg-name').value.trim();
      const phone = document.getElementById('reg-phone').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const address = document.getElementById('reg-address').value.trim();
      const size = Number(document.getElementById('reg-size').value) || 5000;
      const grass = document.getElementById('reg-grass').value;
      const pin = document.getElementById('reg-pin').value.trim();

      const regBtn = document.getElementById('reg-submit-btn');
      regBtn.disabled = true;
      regBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Registering profile...`;

      try {
        const res = await fetch('/api/portal/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            phone,
            email,
            address,
            property_size: size,
            grass_type: grass,
            service_plan: 'Standard Precision Care',
            pin
          })
        });
        const json = await res.json();
        if (json.success && json.client) {
          setStoredIdentifier(phone || email);
          setStoredPin(pin);
          modal.classList.remove('active');
          showToast(`Profile created! Welcome to Lawn Craft, ${json.client.name}!`, 'success');
          const fullProfile = await fetchClientProfile(phone || email, pin);
          if (fullProfile) {
            renderPersonalizedState(fullProfile);
          }
        } else {
          showToast(json.error?.message || 'Failed to create profile.', 'error');
          regBtn.disabled = false;
          regBtn.innerHTML = `<i class="fa-solid fa-sparkles"></i> Create Profile & Open Hub (+100 Pts)`;
        }
      } catch (err) {
        showToast('Network error during registration.', 'error');
        regBtn.disabled = false;
        regBtn.innerHTML = `<i class="fa-solid fa-sparkles"></i> Create Profile & Open Hub (+100 Pts)`;
      }
    });
  }
}

// Setup Instant Lawn Pricing Calculator
