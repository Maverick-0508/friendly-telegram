// Lawn Craft Client Portal & Dynamic Personalization Engine
(function () {
  'use strict';

  const STORAGE_KEY = 'lawncraft_client_identifier';
  const STORAGE_KEY_PIN = 'lawncraft_client_pin';
  let currentClientData = null;

  // WMO weather codes -> short human labels (Open-Meteo)
  const WMO_TEXT = {
    0: 'Clear Skies',
    1: 'Mainly Clear',
    2: 'Partly Cloudy',
    3: 'Overcast',
    45: 'Morning Fog',
    48: 'Foggy',
    51: 'Light Drizzle',
    53: 'Drizzle',
    55: 'Heavy Drizzle',
    61: 'Light Rain',
    63: 'Moderate Rain',
    65: 'Heavy Rain',
    80: 'Light Showers',
    81: 'Moderate Showers',
    82: 'Heavy Showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm',
    99: 'Severe Thunderstorm'
  };

  // Live Nairobi weather for the Yard Conditions widget (keyless Open-Meteo).
  // Returns null when offline/unreachable so we can fall back to the season tip.
  async function fetchNairobiYardConditions() {
    try {
      const res = await fetch(
        'https://api.open-meteo.com/v1/forecast?latitude=-1.2864&longitude=36.8172&current=temperature_2m,relative_humidity_2m,precipitation,weather_code&timezone=Africa/Nairobi',
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) return null;
      const json = await res.json();
      const c = json.current;
      if (!c) return null;
      const temp = Math.round(c.temperature_2m ?? 0);
      const humid = Math.round(c.relative_humidity_2m ?? 0);
      const rain = Number(c.precipitation ?? 0);
      const wmo = WMO_TEXT[c.weather_code] || 'Mixed Conditions';

      let body;
      if (rain > 0.5) {
        body = `${rain.toFixed(1)} mm of rain expected — we adjust mowing height to avoid rutting and hold off watering.`;
      } else if (rain > 0) {
        body = 'Light drizzle expected — skip watering today and let the crew keep the mow height raised.';
      } else if (humid < 35) {
        body = 'Very dry air — water deeply early in the morning and let the grass grow slightly longer to protect the crown.';
      } else {
        body = 'Dry but comfortable — deep-water twice weekly, ideally in the early morning for maximum uptake.';
      }

      return { title: `${wmo} • ${temp}°C`, body };
    } catch {
      return null;
    }
  }

  // Check URL query params for frictionless access (?client= or ?phone=)
  function getQueryIdentifier() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('client') || urlParams.get('phone') || null;
    } catch {
      return null;
    }
  }

  // Get stored identifier
  function getStoredIdentifier() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  // Set stored identifier
  function setStoredIdentifier(id) {
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {}
  }

  // The PIN is held in sessionStorage so a returning visitor is recognized for
  // the rest of the browser tab's life without re-prompting, but it does not
  // persist across sessions — the hub always asks on a new visit.
  function getStoredPin() {
    try {
      return sessionStorage.getItem(STORAGE_KEY_PIN) || '';
    } catch {
      return '';
    }
  }

  function setStoredPin(pin) {
    try {
      sessionStorage.setItem(STORAGE_KEY_PIN, pin);
    } catch {}
  }

  // Stored state
  let originalHeroHTML = null;

  // Clear stored identifier and session
  function clearStoredIdentifier() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('lawncraft_access_token');
      localStorage.removeItem('lawncraft_user');
      sessionStorage.removeItem(STORAGE_KEY_PIN);
      sessionStorage.clear();
    } catch {}
  }

  // Toast Notification
  function showToast(message, type = 'success') {
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
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('portal-toast-fade');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  let lastLookupError = null;

  // API: Lookup Client Profile (identifier + access PIN)
  async function fetchClientProfile(identifier, pin) {
    try {
      const res = await fetch('/api/portal/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, pin: pin || getStoredPin() })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        lastLookupError = {
          code: body.error?.code || 'NOT_FOUND',
          message: body.error?.message || 'No client record found for this identifier',
          notFound: body.not_found || res.status === 404,
        };
        return null;
      }

      const data = await res.json();
      if (data.success && data.client) {
        lastLookupError = null;
        return data;
      }
      lastLookupError = { code: 'INVALID_DATA', message: 'Invalid client data received' };
      return null;
    } catch (err) {
      console.warn('[Portal Lookup Failed]', err);
      lastLookupError = { code: 'NETWORK', message: 'Network error. Please try again.' };
      return null;
    }
  }

  // Update Top Navigation Button
  function updateTopNavUser(clientData) {
    const navButtons = document.querySelectorAll('.client-access-trigger');
    navButtons.forEach(btn => {
      if (clientData) {
        const tier = clientData.loyalty?.tier || 'Member';
        btn.innerHTML = `
          <span class="user-avatar-badge tier-${tier.toLowerCase()}">
            <i class="fa-solid fa-seedling"></i>
          </span>
          <span class="client-nav-name">Hi, ${clientData.client.name.split(' ')[0]}</span>
          <span class="vip-tier-chip tier-${tier.toLowerCase()}">${tier}</span>
        `;
        btn.classList.add('logged-in');
        btn.setAttribute('title', `Client Hub: ${clientData.client.name}`);
      } else {
        btn.innerHTML = `<i class="fa-solid fa-user-check"></i> <span>Client Hub</span>`;
        btn.classList.remove('logged-in');
        btn.setAttribute('title', 'Access your Lawn Craft Client Portal');
      }
    });
  }

  // Render Personalized Client Hub on index.html
  function renderPersonalizedState(data) {
    currentClientData = data;
    const client = data.client;
    const loyalty = data.loyalty;
    const workOrders = data.work_orders || [];
    const invoices = data.invoices || [];

    updateTopNavUser(data);

    // State-based rendering: authenticated clients see the dashboard instead
    // of the marketing funnel (marketing sections are hidden via CSS).
    document.body.classList.add('hub-authenticated');

    // Swap Hero to Personalized Welcome
    const heroContent = document.querySelector('.hero-content');
    if (heroContent) {
      if (!originalHeroHTML) {
        originalHeroHTML = heroContent.innerHTML;
      }
      heroContent.innerHTML = `
        <div class="client-welcome-badge">
          <span class="pulse-dot"></span>
          <span>Verified Client Hub • ${client.service_plan || 'Active Care'}</span>
        </div>
        <h1 class="hero-title client-hero-greeting">Welcome back, <span class="highlight-client">${client.name}</span>!</h1>
        <p class="hero-subtitle client-hero-property">
          <i class="fa-solid fa-location-dot"></i> <strong>${client.address}</strong>
          <span class="prop-specs-divider">•</span>
          <span>${client.property_size.toLocaleString()} sq ft</span>
          <span class="prop-specs-divider">•</span>
          <span>${client.grass_type}</span>
        </p>
        <div class="hero-buttons client-quick-actions">
          <a href="#active-service-section" class="btn btn-primary"><i class="fa-solid fa-route"></i> Live Crew Status</a>
          <a href="#outstanding-bills-section" class="btn btn-secondary"><i class="fa-solid fa-file-invoice-dollar"></i> Billing & Invoices</a>
          <button id="switch-account-btn" class="btn btn-outline-light"><i class="fa-solid fa-arrow-right-from-bracket"></i> Switch Account</button>
        </div>
      `;

      // Wire Switch Account
      const switchBtn = document.getElementById('switch-account-btn');
      if (switchBtn) {
        switchBtn.addEventListener('click', handleLogout);
      }
    }

    // Insert or update Personalized Dashboard Container
    let dashboardContainer = document.getElementById('personalized-dashboard');
    if (!dashboardContainer) {
      dashboardContainer = document.createElement('div');
      dashboardContainer.id = 'personalized-dashboard';
      dashboardContainer.className = 'personalized-dashboard-wrapper';

      const homeSection = document.getElementById('home');
      if (homeSection && homeSection.nextSibling) {
        homeSection.parentNode.insertBefore(dashboardContainer, homeSection.nextSibling);
      } else {
        const mainContent = document.getElementById('main-content');
        if (mainContent) mainContent.prepend(dashboardContainer);
      }
    }

    // Identify In-Progress or Scheduled Work Order
    const activeOrder = workOrders.find(w => w.status === 'in_progress') || workOrders.find(w => w.status === 'scheduled') || workOrders[0];
    const unpaidInvoice = invoices.find(i => i.status === 'unpaid' && i.balance_due > 0);

    // Recent completed visits feed
    const recentVisits = workOrders
      .filter(w => w.status === 'completed' || w.status === 'done' || w.completed_at)
      .sort((a, b) => String(b.completed_at || b.scheduled_date || '').localeCompare(String(a.completed_at || a.scheduled_date || '')))
      .slice(0, 3);

    // Lightweight seasonal yard-care tip (Kenyan climate)
    const monthIx = new Date().getMonth();
    const kshSeasonTip = (monthIx >= 2 && monthIx <= 4)
      ? { title: 'Long Rains Season', body: 'The lawn is growing fast — we raise mow height slightly to avoid scalping. Extra mowing is one tap away below.' }
      : (monthIx >= 9)
        ? { title: 'Short Rains Expected', body: 'An ideal window for core aeration and feeding. Book a seasonal add-on at the bottom of this page.' }
        : { title: 'Dry Season', body: 'Water deeply twice a week and let the lawn grow slightly longer to protect the crown from heat.' };

    // Calculate Loyalty Tier styling
    const tier = loyalty.tier || 'Bronze';
    const tierIcons = {
      'Bronze': 'fa-medal text-bronze',
      'Silver': 'fa-shield-halved text-silver',
      'Gold': 'fa-crown text-gold',
      'Platinum': 'fa-gem text-platinum',
      'Diamond VIP': 'fa-star text-diamond'
    };

    dashboardContainer.innerHTML = `
      <div class="container">
        <!-- Dashboard Status Bar (at-a-glance) -->
        <div class="dashboard-status-bar">
          <div class="dash-greeting">
            <h2>Welcome back, ${client.name.split(' ')[0]}!</h2>
            <p class="dash-property">
              <i class="fa-solid fa-house"></i>
              <strong>${client.address}</strong>
              <span>•</span>
              <span>${client.property_size.toLocaleString()} sq ft</span>
              <span>•</span>
              <span>${client.grass_type}</span>
            </p>
          </div>
          <div class="dash-status-chips">
            <div class="dash-chip">
              <span class="chip-label">Next Service</span>
              <span class="chip-value">${activeOrder ? activeOrder.scheduled_date : '—'}</span>
            </div>
            <div class="dash-chip">
              <span class="chip-label">Account Balance</span>
              <span class="chip-value ${unpaidInvoice ? '' : 'text-emerald'}">${unpaidInvoice ? 'KSh ' + Math.round(unpaidInvoice.balance_due).toLocaleString() : 'All Paid'}</span>
            </div>
            <div class="dash-chip">
              <span class="chip-label">Reward Points</span>
              <span class="chip-value text-emerald">${loyalty.points_balance} pts</span>
            </div>
          </div>
        </div>

        <!-- Dashboard Widget Grid (Kaggle-style two columns) -->
        <div class="dashboard-widgets-grid">
          <div class="dash-widget">
            <h3><i class="fa-solid fa-bolt"></i> Quick Actions <span class="dash-widget-sub">Book &amp; manage in one tap</span></h3>
            <div class="dash-actions-grid">
              <a href="#quick-addons-section" class="dash-action"><i class="fa-solid fa-plus"></i> Request Extra Mow</a>
              ${activeOrder
                ? `<a href="/tracker/${activeOrder.id}" class="dash-action"><i class="fa-solid fa-location-crosshairs"></i> Live Crew GPS</a>`
                : `<span class="dash-action disabled"><i class="fa-solid fa-location-crosshairs"></i> Live Crew GPS</span>`}
              ${unpaidInvoice
                ? `<button type="button" class="dash-action" id="dash-pay-btn" data-invoice-id="${unpaidInvoice.id}" data-amount="${unpaidInvoice.balance_due}"><i class="fa-solid fa-mobile-screen-button"></i> Pay With M-Pesa</button>`
                : `<span class="dash-action disabled"><i class="fa-solid fa-circle-check"></i> Balance Settled</span>`}
              <a href="#contact" class="dash-action"><i class="fa-solid fa-headset"></i> Contact Support</a>
            </div>

            <h3 style="margin-top: 1.4rem;"><i class="fa-solid fa-clipboard-list"></i> Active Care Package</h3>
            <div class="plan-card">
              <div>
                <div class="plan-name">${client.service_plan || 'Custom Care'} • ${tier} Member</div>
                <div class="plan-detail">${activeOrder ? `Next visit: ${activeOrder.scheduled_date}` : 'No upcoming visit — book one below.'}</div>
              </div>
              <a href="#active-service-section" class="plan-btn">Manage</a>
            </div>
          </div>

          <div class="dash-widget">
            <h3><i class="fa-solid fa-cloud-sun"></i> Yard Conditions</h3>
            <div class="yard-conditions">
              <div class="yc-title" id="yard-conditions-title"><i class="fa-solid fa-droplet"></i> ${kshSeasonTip.title}</div>
              <div class="yc-body" id="yard-conditions-body">${kshSeasonTip.body}</div>
            </div>

            <h3 style="margin-top: 1.4rem;"><i class="fa-solid fa-clock-rotate-left"></i> Recent Visits</h3>
            ${recentVisits.length
              ? `
                <ul class="visits-list">
                  ${recentVisits.map(v => `
                    <li><span>${v.title || v.service_type || 'Lawn Care Visit'}</span><span class="visit-date">${v.completed_at ? v.completed_at.slice(0, 10) : (v.scheduled_date || '')}</span></li>
                  `).join('')}
                </ul>
              `
              : '<p class="no-records-note">No completed visits yet — your first one will show up here.</p>'}
          </div>
        </div>

        <!-- Loyalty & Perks Bar -->
        <div class="loyalty-perks-banner">
          <div class="loyalty-col loyalty-tier-col">
            <div class="loyalty-icon-box">
              <i class="fa-solid ${tierIcons[tier] || 'fa-award'}"></i>
            </div>
            <div>
              <div class="loyalty-label">VIP STATUS</div>
              <div class="loyalty-tier-title">${tier} Member</div>
            </div>
          </div>
          <div class="loyalty-col loyalty-points-col">
            <div class="loyalty-stat-number">${loyalty.points_balance} <span class="pts-unit">pts</span></div>
            <div class="loyalty-value-sub">Cash Value: <strong>KSh ${Math.round(loyalty.dollar_value || loyalty.cash_value || (loyalty.points_balance * 50)).toLocaleString()}</strong> (KSh 50/pt)</div>
          </div>
          <div class="loyalty-col loyalty-referral-col">
            <div class="loyalty-label">YOUR REFERRAL PERK</div>
            <div class="referral-code-box">
              <span class="ref-code" id="ref-code-text">${loyalty.referral_code}</span>
              <button class="btn-copy-ref" id="copy-ref-btn" title="Copy Referral Code"><i class="fa-regular fa-copy"></i></button>
              <a href="https://api.whatsapp.com/send?text=${encodeURIComponent(`Hi! Get 15% off professional lawn mowing and care with Lawn Craft using my referral code ${loyalty.referral_code}: https://lawncraft.vercel.app/?client=${encodeURIComponent(client.phone)}`)}" 
                 target="_blank" rel="noopener" class="btn-whatsapp-share" title="Share via WhatsApp">
                <i class="fa-brands fa-whatsapp"></i> Share
              </a>
            </div>
          </div>
        </div>

        <!-- Main Portal Action Grid -->
        <div class="client-portal-grid">
          
          <!-- Active Service & Live Tracking Card -->
          <div class="portal-card active-service-card" id="active-service-section">
            <div class="portal-card-header">
              <div class="header-left">
                <span class="portal-card-tag"><i class="fa-solid fa-calendar-check"></i> Upcoming Appointment</span>
                <h3 class="portal-card-title">${activeOrder ? activeOrder.title : 'Regular Maintenance Scheduled'}</h3>
              </div>
              ${activeOrder && activeOrder.status === 'in_progress' ? `
                <span class="status-badge status-in-progress pulse-glow">
                  <span class="live-dot"></span> Crew On-Site
                </span>
              ` : `
                <span class="status-badge status-scheduled">
                  <i class="fa-regular fa-clock"></i> Confirmed
                </span>
              `}
            </div>

            <div class="portal-card-body">
              ${activeOrder ? `
                <div class="service-meta-grid">
                  <div class="meta-item">
                    <span class="meta-label">Date & Time</span>
                    <span class="meta-value highlight"><i class="fa-solid fa-clock"></i> ${activeOrder.scheduled_date}</span>
                  </div>
                  <div class="meta-item">
                    <span class="meta-label">Assigned Crew</span>
                    <span class="meta-value"><i class="fa-solid fa-users-gear"></i> ${activeOrder.crew_name || 'Alpha Care Crew'}</span>
                  </div>
                  <div class="meta-item">
                    <span class="meta-label">Service Type</span>
                    <span class="meta-value">${activeOrder.service_type || 'Precision Lawn Mowing'}</span>
                  </div>
                  <div class="meta-item">
                    <span class="meta-label">Total Price</span>
                    <span class="meta-value text-accent">KSh ${Math.round(activeOrder.total_price || 4500).toLocaleString()}</span>
                  </div>
                </div>

                ${activeOrder.status === 'in_progress' ? `
                  <div class="crew-tracker-teaser">
                    <div class="teaser-info">
                      <div class="crew-avatar">
                        <i class="fa-solid fa-truck-pickup"></i>
                      </div>
                      <div class="crew-text">
                        <strong>Crew Lead: ${activeOrder.crew_lead || 'Assigned Field Specialist'}</strong>
                        <p>Vehicle: ${activeOrder.crew_vehicle || 'Lawn Craft Field Unit'} • ETA on-site: Active Now</p>
                      </div>
                    </div>
                    <a href="/tracker/${activeOrder.id}" class="btn btn-tracker-pulse">
                      <i class="fa-solid fa-location-crosshairs"></i> Open Live GPS Tracker
                    </a>
                  </div>
                ` : `
                  <div class="service-schedule-notice">
                    <p><i class="fa-solid fa-circle-info"></i> Your team is preparing equipment for this visit. A live GPS tracking link will activate automatically on service day.</p>
                    <a href="/tracker/${activeOrder.id}" class="btn btn-outline-secondary btn-sm">Preview Route & Checklist</a>
                  </div>
                `}
              ` : `
                <p class="no-records-note">No active service scheduled right now.</p>
                <a href="#quick-addons-section" class="btn btn-primary btn-sm">Schedule Next Service</a>
              `}
            </div>
          </div>

          <!-- Outstanding Bills & 1-Click Settlement Card -->
          <div class="portal-card billing-card" id="outstanding-bills-section">
            <div class="portal-card-header">
              <div class="header-left">
                <span class="portal-card-tag"><i class="fa-solid fa-credit-card"></i> Invoicing & Payments</span>
                <h3 class="portal-card-title">Account Balance</h3>
              </div>
              ${unpaidInvoice ? `
                <span class="status-badge status-unpaid">
                  <i class="fa-solid fa-triangle-exclamation"></i> Payment Due
                </span>
              ` : `
                <span class="status-badge status-paid">
                  <i class="fa-solid fa-circle-check"></i> Account Up-to-Date
                </span>
              `}
            </div>

            <div class="portal-card-body">
              ${unpaidInvoice ? `
                <div class="invoice-alert-box">
                  <div class="invoice-summary-row">
                    <div>
                      <span class="inv-num">${unpaidInvoice.invoice_number}</span>
                      <div class="inv-title">${unpaidInvoice.service_title || 'Lawn Care Service'}</div>
                      <div class="inv-due text-muted">Due date: ${unpaidInvoice.due_date}</div>
                    </div>
                    <div class="inv-amount-box">
                      <span class="balance-label">Balance Due</span>
                      <span class="balance-amount">KSh ${Math.round(unpaidInvoice.balance_due).toLocaleString()}</span>
                    </div>
                  </div>
                  <div class="payment-action-buttons">
                    <button class="btn btn-mpesa-instant" data-invoice-id="${unpaidInvoice.id}" data-amount="${unpaidInvoice.balance_due}" id="instant-mpesa-btn">
                      <i class="fa-solid fa-mobile-screen-button"></i> Pay via Lipa Na M-Pesa
                    </button>
                    <a href="/pay/${unpaidInvoice.id}" class="btn btn-card-pay">
                      <i class="fa-regular fa-credit-card"></i> Card / Options
                    </a>
                    <a href="/receipt/${unpaidInvoice.id}" class="btn btn-view-invoice" title="View Tax Invoice">
                      <i class="fa-solid fa-file-pdf"></i> View Invoice
                    </a>
                  </div>
                </div>
              ` : `
                <div class="all-paid-celebration">
                  <div class="paid-check-circle"><i class="fa-solid fa-check"></i></div>
                  <h4>No Outstanding Invoices</h4>
                  <p>All completed services have been settled. Thank you for your continued trust in Lawn Craft!</p>
                  ${invoices.length > 0 ? `
                    <div class="recent-receipts-list">
                      <span class="recent-label">Recent Official Receipts:</span>
                      ${invoices.slice(0, 2).map(inv => `
                        <a href="/receipt/${inv.id}" class="recent-receipt-link">
                          <i class="fa-solid fa-file-invoice"></i> ${inv.invoice_number} (KSh ${Math.round(inv.total_amount).toLocaleString()}) — Tax Receipt
                        </a>
                      `).join('')}
                    </div>
                  ` : ''}
                </div>
              `}
            </div>
          </div>

        </div>

        <!-- 1-Click Service Add-Ons -->
        <div class="portal-card addons-card" id="quick-addons-section">
          <div class="portal-card-header">
            <div>
              <span class="portal-card-tag"><i class="fa-solid fa-bolt"></i> 1-Click Client Rebooking</span>
              <h3 class="portal-card-title">Seasonal Add-Ons for ${client.property_size.toLocaleString()} sq ft</h3>
              <p class="section-desc">Tailored specifically for ${client.grass_type}. Book in one tap without re-entering your details.</p>
            </div>
          </div>

          <div class="addons-grid">
            <div class="addon-item">
              <div class="addon-icon"><i class="fa-solid fa-spray-can-sparkles"></i></div>
              <div class="addon-details">
                <h4>Seasonal Core Aeration</h4>
                <p>Relieves compacted soil and increases nutrient absorption for healthier roots.</p>
                <div class="addon-price">KSh 8,500</div>
              </div>
              <button class="btn btn-addon-book" data-service="Core Aeration" data-price="8500">
                <i class="fa-solid fa-plus"></i> 1-Click Book
              </button>
            </div>

            <div class="addon-item">
              <div class="addon-icon"><i class="fa-solid fa-scissors"></i></div>
              <div class="addon-details">
                <h4>Hedge & Shrub Sculpting</h4>
                <p>Artisanal hedge trimming, formal shaping, and complete green debris hauling.</p>
                <div class="addon-price">KSh 4,500</div>
              </div>
              <button class="btn btn-addon-book" data-service="Hedge Sculpting" data-price="4500">
                <i class="fa-solid fa-plus"></i> 1-Click Book
              </button>
            </div>

            <div class="addon-item">
              <div class="addon-icon"><i class="fa-solid fa-faucet-drip"></i></div>
              <div class="addon-details">
                <h4>Smart Sprinkler Tune-Up</h4>
                <p>Nozzle alignment, water pressure audit, and automated leak detection.</p>
                <div class="addon-price">KSh 5,000</div>
              </div>
              <button class="btn btn-addon-book" data-service="Sprinkler Tune-Up" data-price="5000">
                <i class="fa-solid fa-plus"></i> 1-Click Book
              </button>
            </div>

            <div class="addon-item">
              <div class="addon-icon"><i class="fa-solid fa-seedling"></i></div>
              <div class="addon-details">
                <h4>Organic Slow-Release Feed</h4>
                <p>Eco-friendly micro-nutrient treatment for deep green vibrancy without chemical burn.</p>
                <div class="addon-price">KSh 6,500</div>
              </div>
              <button class="btn btn-addon-book" data-service="Organic Bio-Fertilization" data-price="6500">
                <i class="fa-solid fa-plus"></i> 1-Click Book
              </button>
            </div>
          </div>
        </div>

      </div>
    `;

    // Wire Copy Referral Button
    const copyRefBtn = document.getElementById('copy-ref-btn');
    if (copyRefBtn) {
      copyRefBtn.addEventListener('click', () => {
        const codeText = document.getElementById('ref-code-text')?.textContent || loyalty.referral_code;
        navigator.clipboard.writeText(codeText).then(() => {
          showToast(`Referral code ${codeText} copied to clipboard!`, 'success');
        });
      });
    }

    // Wire Instant M-Pesa STK Push button
    const instantMpesaBtn = document.getElementById('instant-mpesa-btn');
    if (instantMpesaBtn) {
      instantMpesaBtn.addEventListener('click', () => {
        const invoiceId = instantMpesaBtn.getAttribute('data-invoice-id');
        const amount = instantMpesaBtn.getAttribute('data-amount');
        openMpesaModal(invoiceId, amount, client.phone);
      });
    }

    // Wire dashboard quick-action Pay button
    const dashPayBtn = document.getElementById('dash-pay-btn');
    if (dashPayBtn) {
      dashPayBtn.addEventListener('click', () => {
        openMpesaModal(
          dashPayBtn.getAttribute('data-invoice-id'),
          dashPayBtn.getAttribute('data-amount'),
          client.phone
        );
      });
    }

    // Wire 1-Click Add-on buttons
    const addonButtons = dashboardContainer.querySelectorAll('.btn-addon-book');
    addonButtons.forEach(btn => {
      btn.addEventListener('click', async () => {
        const service = btn.getAttribute('data-service');
        const price = Number(btn.getAttribute('data-price'));

        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Booking...`;

        try {
          const res = await fetch('/api/work-orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: client.id,
              client_name: client.name,
              phone: client.phone,
              email: client.email,
              service_type: service,
              price: price,
              property_size: client.property_size,
              address: client.address,
              notes: `Booked via 1-click client portal for ${client.name}`,
              status: 'incoming' // Feeds directly to supervisor dispatch queue
            })
          });

          const json = await res.json();
          if (json.success) {
            btn.innerHTML = `<i class="fa-solid fa-check"></i> Booked!`;
            btn.classList.add('booked-success');
            showToast(`${service} scheduled! Added to supervisor dispatch queue. +25 Loyalty points earned!`, 'success');
            setTimeout(() => {
              refreshCurrentClient();
            }, 1200);
          } else {
            throw new Error(json.error?.message || 'Booking failed');
          }
        } catch (err) {
          btn.disabled = false;
          btn.innerHTML = `<i class="fa-solid fa-plus"></i> 1-Click Book`;
          showToast(err.message || 'Could not schedule add-on. Please try again.', 'error');
        }
      });
    });

    // Swap the season tip for live Nairobi weather when available
    fetchNairobiYardConditions().then(tip => {
      if (!tip) return;
      const ycTitle = document.getElementById('yard-conditions-title');
      const ycBody = document.getElementById('yard-conditions-body');
      if (ycTitle && ycBody) {
        ycTitle.innerHTML = `<i class="fa-solid fa-cloud-sun"></i> ${tip.title}`;
        ycBody.textContent = tip.body;
      }
    });
  }

  // Refresh client data in-place
  async function refreshCurrentClient() {
    const id = getStoredIdentifier();
    if (id) {
      const data = await fetchClientProfile(id);
      if (data) renderPersonalizedState(data);
    }
  }

  // Handle Logout / Switch Account
  function handleLogout() {
    clearStoredIdentifier();
    currentClientData = null;

    // Restore the marketing funnel view
    document.body.classList.remove('hub-authenticated');

    // 1. Immediately remove personalized dashboard container from DOM
    const dash = document.getElementById('personalized-dashboard');
    if (dash) dash.remove();

    // 2. Restore original public hero banner immediately
    const heroContent = document.querySelector('.hero-content');
    if (heroContent && originalHeroHTML) {
      heroContent.innerHTML = originalHeroHTML;
    }

    // 3. Reset top nav user trigger to public state
    updateTopNavUser(null);

    // 4. Reset auth link in navigation bar
    const authLink = document.querySelector('.nav-auth-link');
    if (authLink) {
      authLink.textContent = 'Sign In';
      authLink.href = '/login';
      authLink.removeAttribute('data-auth-handler');
    }

    showToast('Signed out successfully. Switched to public view.', 'success');
    setTimeout(() => {
      // Remove query params and reload cleanly to public page
      window.location.href = window.location.pathname;
    }, 350);
  }

  // Open M-Pesa STK Push Modal
  function openMpesaModal(invoiceId, amount, defaultPhone) {
    let modal = document.getElementById('mpesa-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'mpesa-modal';
      modal.className = 'portal-modal-backdrop';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="portal-modal-card">
        <button class="portal-modal-close" id="close-mpesa-modal">&times;</button>
        <div class="mpesa-header">
          <div class="mpesa-logo-badge">LIPA NA M-PESA</div>
          <h3>Settle Invoice via M-Pesa</h3>
          <p>An instant STK Push prompt will be sent to your mobile phone.</p>
        </div>

        <div class="mpesa-body" id="mpesa-body-step">
          <div class="mpesa-amount-display">
            <span class="currency">KES</span>
            <span class="figure">KSh ${Math.round(Number(amount)).toLocaleString()}</span>
          </div>
          <div class="form-group">
            <label for="mpesa-phone-input">M-Pesa Mobile Number</label>
            <input type="tel" id="mpesa-phone-input" class="form-control" value="${defaultPhone || ''}" placeholder="e.g. 0712 345 678 or 254712345678">
          </div>
          <button class="btn btn-mpesa-trigger" id="send-stk-btn">
            <i class="fa-solid fa-paper-plane"></i> Send STK PIN Prompt
          </button>
        </div>

        <div class="mpesa-status-view" id="mpesa-status-step" style="display: none;">
          <div class="stk-spinner"><i class="fa-solid fa-spinner fa-spin"></i></div>
          <h4>Check Your Phone!</h4>
          <p>A payment request was sent to <strong id="stk-sent-phone"></strong>. Enter your M-Pesa PIN on your handset to authorize the payment.</p>
          <p class="text-muted" style="font-size:0.85rem; margin-top:8px;">
            <i class="fa-solid fa-shield-halved"></i> Waiting for confirmation from Safaricom…
          </p>
        </div>

        <div class="mpesa-success-view" id="mpesa-success-step" style="display: none;">
          <div class="success-icon"><i class="fa-solid fa-circle-check"></i></div>
          <h4>Payment Confirmed!</h4>
          <p>M-Pesa Ref: <strong id="mpesa-receipt-code"></strong></p>
          <div class="modal-success-actions">
            <a href="/receipt/${invoiceId}" class="btn btn-primary btn-sm"><i class="fa-solid fa-receipt"></i> View Official Tax Receipt</a>
            <button class="btn btn-secondary btn-sm" id="finish-mpesa-modal">Close</button>
          </div>
        </div>
      </div>
    `;

    modal.classList.add('active');

    // Close button
    document.getElementById('close-mpesa-modal').addEventListener('click', () => modal.classList.remove('active'));

    // Send STK Button
    document.getElementById('send-stk-btn').addEventListener('click', async () => {
      const phoneInput = document.getElementById('mpesa-phone-input').value.trim();
      if (!phoneInput) {
        showToast('Please enter your M-Pesa phone number', 'error');
        return;
      }

      document.getElementById('mpesa-body-step').style.display = 'none';
      const statusStep = document.getElementById('mpesa-status-step');
      statusStep.style.display = 'block';
      document.getElementById('stk-sent-phone').textContent = phoneInput;

      const resetForm = () => {
        statusStep.style.display = 'none';
        document.getElementById('mpesa-body-step').style.display = 'block';
      };

      try {
        const res = await fetch('/api/mpesa/stkpush', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: phoneInput,
            amount: Number(amount),
            invoice_id: invoiceId
          })
        });

        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error?.message || 'STK Push failed');
        }

        const checkoutId = data.checkout_request_id;
        if (!checkoutId) {
          throw new Error('The payment provider did not return a checkout reference.');
        }

        const result = await pollMpesaStatus(checkoutId);
        if (result.status === 'success') {
          statusStep.style.display = 'none';
          const successStep = document.getElementById('mpesa-success-step');
          successStep.style.display = 'block';
          document.getElementById('mpesa-receipt-code').textContent = result.mpesa_receipt || '—';
          showToast('Payment confirmed by M-Pesa! Your invoice is marked paid.', 'success');
          refreshCurrentClient();
        } else if (result.status === 'failed' || result.status === 'cancelled') {
          resetForm();
          showToast(result.result_desc || 'M-Pesa payment was not completed. Please try again.', 'error');
        } else {
          resetForm();
          showToast('Payment is still pending. If you completed the prompt it will reflect shortly.', 'error');
        }
      } catch (err) {
        resetForm();
        showToast(err.message || 'M-Pesa transaction failed', 'error');
      }
    });

    async function pollMpesaStatus(checkoutId, { attempts = 40, intervalMs = 3000 } = {}) {
      for (let i = 0; i < attempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        try {
          const res = await fetch(`/api/mpesa/status/${encodeURIComponent(checkoutId)}`);
          const json = await res.json();
          if (json.success && json.data && json.data.status !== 'pending') {
            return json.data;
          }
        } catch {
          // Transient network error; keep polling until attempts are exhausted.
        }
      }
      return { status: 'pending' };
    }

    const finishBtn = document.getElementById('finish-mpesa-modal');
    if (finishBtn) {
      finishBtn.addEventListener('click', () => modal.classList.remove('active'));
    }
  }

  // Open "My Lawn / Client Access" Modal
  function openClientAccessModal() {
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
              <input type="password" id="client-pin-input" class="form-control" inputmode="numeric" pattern="\d{4,6}" maxlength="6" placeholder="4-6 digit PIN" required>
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
              <input type="password" id="reg-pin" class="form-control" inputmode="numeric" pattern="\d{4,6}" minlength="4" maxlength="6" placeholder="e.g. 1234" required style="padding:8px 12px; font-size:0.9rem;">
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
      } else if (lastLookupError && (lastLookupError.code === 'INVALID_PIN' || lastLookupError.code === 'ACCESS_PIN_REQUIRED')) {
        if (pinErrorText) pinErrorText.textContent = lastLookupError.message;
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
  function initPricingCalculator() {
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
        const client = currentClientData?.client;

        // If client already recognized, book in 1 click!
        if (client) {
          bookBtn.disabled = true;
          bookBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Submitting Dispatch...`;

          try {
            const res = await fetch('/api/work-orders', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                client_id: client.id,
                client_name: client.name,
                phone: client.phone,
                email: client.email,
                address: client.address,
                property_size: currentSize,
                service_type: `${grassRates[currentGrass].name} Cut (${freqMultipliers[currentFrequency].name})`,
                price: total,
                status: 'incoming', // supervisor dispatch queue
                notes: `Calculator Booking with Coupon: ${appliedCoupon?.code || 'None'}`
              })
            });

            const json = await res.json();
            if (json.success) {
              bookBtn.innerHTML = `<i class="fa-solid fa-check"></i> Booked Successfully!`;
              showToast(`Booking for ${client.name} queued for dispatch! +25 Loyalty points earned.`, 'success');
              setTimeout(() => {
                refreshCurrentClient();
              }, 1200);
            } else {
              throw new Error(json.error?.message || 'Booking failed');
            }
          } catch (err) {
            bookBtn.disabled = false;
            bookBtn.innerHTML = `<i class="fa-solid fa-calendar-check"></i> Instant Book Lawn Service`;
            showToast(err.message, 'error');
          }
        } else {
          // Anonymous visitor: open quick quote/book prompt or modal
          openAnonymousBookingModal(currentSize, grassRates[currentGrass].name, freqMultipliers[currentFrequency].name, total, appliedCoupon?.code);
        }
      });
    }

    // Initial calculation
    calculateTotal();
  }

  // Anonymous Visitor Booking / Quote Modal
  function openAnonymousBookingModal(size, grass, frequency, price, couponCode) {
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
          <p>${size.toLocaleString()} sq ft • ${grass} • ${frequency}</p>
          <div class="anon-estimate-pill">Estimated Total: <strong>KSh ${Math.round(Number(price)).toLocaleString()}</strong></div>
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
            <input type="password" id="anon-pin" class="form-control" inputmode="numeric" pattern="\d{4,6}" minlength="4" maxlength="6" placeholder="e.g. 1234" required>
            <p style="font-size:0.75rem; color:#6b7280; margin:4px 0 0;">You will use this PIN to open your hub and track your order.</p>
          </div>
          <button type="submit" class="btn btn-primary btn-block" id="anon-submit-btn">
            <i class="fa-solid fa-paper-plane"></i> Submit to Supervisor Dispatch Queue
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
            service_type: `${grass} Cut (${frequency})`,
            price: price,
            status: 'incoming', // feeds directly to supervisor dispatch queue
            pin,
            notes: `Website Instant Calculator Order. Promo: ${couponCode || 'None'}`
          })
        });

        const json = await res.json();
        if (json.success) {
          // Cache verified phone so user is recognized this session!
          setStoredIdentifier(phone);
          setStoredPin(pin);
          modal.classList.remove('active');
          showToast(`Thank you ${name}! Your order is queued for supervisor dispatch. Welcome to Lawn Craft!`, 'success');
          
          // Switch to personalized client hub automatically!
          setTimeout(async () => {
            const profile = await fetchClientProfile(phone, pin);
            if (profile) renderPersonalizedState(profile);
          }, 1000);
        } else {
          throw new Error(json.error?.message || 'Submission failed');
        }
      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Submit to Supervisor Dispatch Queue`;
        showToast(err.message || 'Submission error. Please check your connection.', 'error');
      }
    });
  }

  // Setup Top Nav Button Trigger
  function initClientNavTriggers() {
    document.querySelectorAll('.client-access-trigger').forEach(trigger => {
      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentClientData) {
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
  async function init() {
    initClientNavTriggers();
    initPricingCalculator();

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
      } else {
        updateTopNavUser(null);
        return;
      }
    }

    // 2. Check localStorage for returning client (requires an active session PIN)
    const storedId = getStoredIdentifier();
    if (storedId && getStoredPin()) {
      const data = await fetchClientProfile(storedId);
      if (data) {
        renderPersonalizedState(data);
        return;
      }
    }

    // 3. Anonymous state
    updateTopNavUser(null);
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
})();
