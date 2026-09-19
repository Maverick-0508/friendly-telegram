// Instant pricing calculator and the booking-request modal for new visitors.
import { fetchClientProfile } from './api.js';
import { renderPersonalizedState, refreshCurrentClient } from './hub.js';
import { state, setStoredIdentifier, getStoredPin, setStoredPin, esc, showToast } from './state.js';

export function initPricingCalculator() {
  const calcContainer = document.getElementById('instant-calculator');
  if (!calcContainer) return;

  let currentSize = 5000;
  let currentGrass = 'kikuyu';
  let currentFrequency = 'biweekly';
  let appliedCoupon = null;
  let selectedAddons = new Set();

  const grassRates = {
    'kikuyu': { name: 'Kikuyu Turf', baseRate: 0.70 },
    'bermuda': { name: 'Bermuda Tifway', baseRate: 0.80 },
    'paspalum': { name: 'Paspalum', baseRate: 0.75 },
    'buffalo': { name: 'Buffalo Grass', baseRate: 0.90 }
  };

  const freqMultipliers = {
    'weekly': { name: 'Weekly (Best Health)', mult: 0.85 },
    'biweekly': { name: 'Bi-Weekly (Most Popular)', mult: 1.0 },
    'monthly': { name: 'Monthly Maintenance', mult: 1.25 },
    'onetime': { name: 'One-Time Precision Cut', mult: 1.4 }
  };

  const addonRates = {
    'edging': { name: 'Precision Edge Trimming', price: 1500 },
    'fertilizer': { name: 'Organic Feed Treatment', price: 3500 },
    'aeration': { name: 'Core Soil Aeration', price: 5500 },
    'hedges': { name: 'Perimeter Hedge Shaping', price: 3000 }
  };

  function calculateTotal() {
    const grass = grassRates[currentGrass] || grassRates.kikuyu;
    const freq = freqMultipliers[currentFrequency] || freqMultipliers.biweekly;

    let subtotal = Math.max(3500, Math.round(currentSize * grass.baseRate));
    subtotal = Math.round(subtotal * freq.mult);

    selectedAddons.forEach(addonKey => {
      if (addonRates[addonKey]) subtotal += addonRates[addonKey].price;
    });

    let discount = 0;
    if (appliedCoupon && appliedCoupon.valid) {
      if (appliedCoupon.discount_type === 'percent') {
        discount = Math.round(subtotal * (appliedCoupon.discount_value / 100));
      } else {
        discount = Math.min(appliedCoupon.discount_value, subtotal);
      }
    }

    const total = Math.max(2500, subtotal - discount);

    // Update DOM
    const subtotalEl = document.getElementById('calc-subtotal');
    const discountRow = document.getElementById('calc-discount-row');
    const discountAmountEl = document.getElementById('calc-discount-amount');
    const totalEl = document.getElementById('calc-total');
    const sizeValEl = document.getElementById('calc-size-val');

    if (sizeValEl) sizeValEl.textContent = `${currentSize.toLocaleString()} sq ft`;
    if (subtotalEl) subtotalEl.textContent = `KSh ${subtotal.toLocaleString()}`;
    if (totalEl) totalEl.textContent = `KSh ${total.toLocaleString()}`;

    if (discountRow) {
      if (discount > 0) {
        discountRow.style.display = 'flex';
        if (discountAmountEl) discountAmountEl.textContent = `-KSh ${discount.toLocaleString()}`;
      } else {
        discountRow.style.display = 'none';
      }
    }

    return { subtotal, discount, total };
  }

  // Bind size slider
  const slider = document.getElementById('calc-size-slider');
  if (slider) {
    slider.addEventListener('input', (e) => {
      currentSize = Number(e.target.value);
      calculateTotal();
    });
  }

  // Bind grass chips
  const grassChips = calcContainer.querySelectorAll('.calc-chip[data-grass]');
  grassChips.forEach(chip => {
    chip.addEventListener('click', () => {
      grassChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentGrass = chip.getAttribute('data-grass');
      calculateTotal();
    });
  });

  // Bind frequency chips
  const freqChips = calcContainer.querySelectorAll('.calc-chip[data-freq]');
  freqChips.forEach(chip => {
    chip.addEventListener('click', () => {
      freqChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFrequency = chip.getAttribute('data-freq');
      calculateTotal();
    });
  });

  // Bind Addon checkboxes
  const addonCheckboxes = calcContainer.querySelectorAll('.calc-addon-check');
  addonCheckboxes.forEach(chk => {
    chk.addEventListener('change', () => {
      const key = chk.getAttribute('data-addon');
      if (chk.checked) selectedAddons.add(key);
      else selectedAddons.delete(key);
      calculateTotal();
    });
  });

  // Bind Coupon form
  const couponInput = document.getElementById('calc-coupon-input');
  const couponBtn = document.getElementById('calc-coupon-btn');
  const couponMsg = document.getElementById('calc-coupon-msg');

  if (couponBtn && couponInput) {
    couponBtn.addEventListener('click', async () => {
      const code = couponInput.value.trim();
      if (!code) return;

      couponBtn.disabled = true;
      couponBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;

      try {
        const { subtotal } = calculateTotal();
        const res = await fetch('/api/coupons/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, amount: subtotal })
        });

        const data = await res.json();
        couponBtn.disabled = false;
        couponBtn.innerHTML = `Apply`;

        if (data.valid) {
          appliedCoupon = data;
          if (couponMsg) {
            couponMsg.className = 'coupon-message success';
            couponMsg.textContent = data.message;
          }
          calculateTotal();
        } else {
          appliedCoupon = null;
          if (couponMsg) {
            couponMsg.className = 'coupon-message error';
            couponMsg.textContent = data.message || 'Invalid coupon code';
          }
          calculateTotal();
        }
      } catch (err) {
        couponBtn.disabled = false;
        couponBtn.innerHTML = `Apply`;
        if (couponMsg) {
          couponMsg.className = 'coupon-message error';
          couponMsg.textContent = 'Failed to validate code';
        }
      }
    });
  }

  // Instant Booking / Dispatch Submission
  const bookBtn = document.getElementById('calc-book-btn');
  if (bookBtn) {
    bookBtn.addEventListener('click', async () => {
      const { total } = calculateTotal();
      const client = state.currentClientData?.client;

      // If client already recognized, book in 1 click!
      if (client) {
        bookBtn.disabled = true;
        bookBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sending request...`;

        try {
          // Send the pricing *inputs*; the server computes the invoice total.
          const res = await fetch('/api/work-orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_name: client.name,
              phone: client.phone,
              email: client.email,
              address: client.address,
              property_size: currentSize,
              grass: currentGrass,
              frequency: currentFrequency,
              addons: Array.from(selectedAddons),
              coupon_code: appliedCoupon?.code || '',
              pin: getStoredPin(),
              notes: 'Calculator booking from client hub'
            })
          });

          const json = await res.json();
          if (json.success) {
            bookBtn.innerHTML = `<i class="fa-solid fa-check"></i> Request Sent!`;
            const serverTotal = Math.round(Number(json.invoice?.total_amount || total));
            showToast(json.booking_mode === 'confirm'
              ? `Request received, ${client.name}. Estimate KSh ${serverTotal.toLocaleString()}; we will confirm the final price by SMS before any payment. +30 Loyalty points earned.`
              : `Booking for ${client.name} queued for dispatch at KSh ${serverTotal.toLocaleString()}! +30 Loyalty points earned.`, 'success');
            setTimeout(() => {
              refreshCurrentClient();
            }, 1200);
          } else {
            throw new Error(json.error?.message || 'Booking failed');
          }
        } catch (err) {
          bookBtn.disabled = false;
          bookBtn.innerHTML = `<i class="fa-solid fa-calendar-check"></i> Request This Service`;
          showToast(err.message, 'error');
        }
      } else {
        // Anonymous visitor: open quick quote/book prompt or modal
        openAnonymousBookingModal({
          size: currentSize,
          grass: grassRates[currentGrass].name,
          frequency: freqMultipliers[currentFrequency].name,
          grassKey: currentGrass,
          frequencyKey: currentFrequency,
          addons: Array.from(selectedAddons),
          price: total,
          couponCode: appliedCoupon?.code || ''
        });
      }
    });
  }

  // Initial calculation
  calculateTotal();
}

// Anonymous Visitor Booking / Quote Modal
export function openAnonymousBookingModal({ size, grass, frequency, grassKey, frequencyKey, addons, price, couponCode }) {
  let modal = document.getElementById('anon-book-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'anon-book-modal';
    modal.className = 'portal-modal-backdrop';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="portal-modal-card">
      <button class="portal-modal-close" id="close-anon-modal">&times;</button>
      <div class="client-modal-header">
        <div class="client-modal-icon"><i class="fa-solid fa-clipboard-check"></i></div>
        <h3>Confirm Your Lawn Service</h3>
        <p>${Number(size).toLocaleString()} sq ft • ${esc(grass)} • ${esc(frequency)}</p>
        <div class="anon-estimate-pill">Estimate: <strong>KSh ${Math.round(Number(price)).toLocaleString()}</strong></div>
        <p class="anon-estimate-note" style="font-size:0.82rem; color:#4b5563; margin:8px 0 0;">
          <i class="fa-solid fa-circle-info"></i> This is an estimate. A supervisor confirms the final price by SMS before any payment is requested.
        </p>
      </div>

      <form id="anon-booking-form">
        <div class="form-group">
          <label for="anon-name">Full Name</label>
          <input type="text" id="anon-name" class="form-control" placeholder="Enter your full name" required>
        </div>
        <div class="form-group">
          <label for="anon-phone">Phone Number (WhatsApp or Call)</label>
          <input type="tel" id="anon-phone" class="form-control" placeholder="e.g. 0712 345 678" required>
        </div>
        <div class="form-group">
          <label for="anon-address">Property Address / Estate</label>
          <input type="text" id="anon-address" class="form-control" placeholder="e.g. Karen, Runda, Muthaiga, or Lavington" required>
        </div>
        <div class="form-group">
          <label for="anon-pin">Create Access PIN (4-6 digits)</label>
          <input type="password" id="anon-pin" class="form-control" inputmode="numeric" pattern="[0-9]{4,6}" minlength="4" maxlength="6" placeholder="e.g. 1234" required>
          <p style="font-size:0.75rem; color:#6b7280; margin:4px 0 0;">You will use this PIN to open your hub and track your order.</p>
        </div>
        <button type="submit" class="btn btn-primary btn-block" id="anon-submit-btn">
          <i class="fa-solid fa-paper-plane"></i> Send Booking Request
        </button>
      </form>
    </div>
  `;

  modal.classList.add('active');

  document.getElementById('close-anon-modal').addEventListener('click', () => modal.classList.remove('active'));

  document.getElementById('anon-booking-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('anon-name').value.trim();
    const phone = document.getElementById('anon-phone').value.trim();
    const address = document.getElementById('anon-address').value.trim();
    const pin = document.getElementById('anon-pin').value.trim();

    const btn = document.getElementById('anon-submit-btn');
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Submitting...`;

    try {
      const res = await fetch('/api/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: name,
          phone: phone,
          address: address,
          property_size: size,
          grass: grassKey,
          frequency: frequencyKey,
          addons: addons || [],
          coupon_code: couponCode || '',
          pin,
          notes: 'Website instant calculator order'
        })
      });

      const json = await res.json();
      if (json.success) {
        // Cache verified phone so user is recognized this session!
        setStoredIdentifier(phone);
        setStoredPin(pin);
        modal.classList.remove('active');
        const serverTotal = Math.round(Number(json.invoice?.total_amount || price));
        showToast(json.booking_mode === 'confirm'
          ? `Thank you ${name}! Your request (estimate KSh ${serverTotal.toLocaleString()}) is with our supervisor. We will confirm the final price by SMS before any payment.`
          : `Thank you ${name}! Your KSh ${serverTotal.toLocaleString()} order is queued for supervisor dispatch. Welcome to Lawn Craft!`, 'success');
        
        // Switch to personalized client hub automatically and bring it into view.
        setTimeout(async () => {
          const profile = await fetchClientProfile(phone, pin);
          if (profile) {
            renderPersonalizedState(profile);
            document.getElementById('personalized-dashboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 1000);
      } else {
        throw new Error(json.error?.message || 'Submission failed');
      }
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Send Booking Request`;
      showToast(err.message || 'Submission error. Please check your connection.', 'error');
    }
  });
}

// Setup Top Nav Button Trigger
