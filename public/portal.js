// Lawn Craft Client Portal & Dynamic Personalization Engine
(function () {
  'use strict';

  const STORAGE_KEY = 'lawncraft_client_identifier';
  const STORAGE_KEY_PIN = 'lawncraft_client_pin';
  let currentClientData = null;
  let onboardingUnsub = null;

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

  // Escape user-controlled values before interpolating them into innerHTML.
  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function firstName(name) {
    return esc(String(name || '').split(' ')[0]);
  }

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
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span></span>`;
    toast.querySelector('span').textContent = message;
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
        // The icon is a direct child: narrow headers hide the <span>s and show
        // the button as a 38px circle, so the icon must survive on its own.
        btn.innerHTML = `
          <i class="fa-solid fa-user-check" aria-hidden="true"></i>
          <span class="client-nav-name">Hi, ${firstName(clientData.client.name)}</span>
          <span class="vip-tier-chip tier-${esc(tier.toLowerCase())}">${esc(tier)}</span>
        `;
        btn.classList.add('logged-in');
        btn.setAttribute('title', `Client Hub: ${clientData.client.name}`);
        btn.setAttribute('aria-label', `Open Client Hub for ${clientData.client.name}`);
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
          <span>Verified Client Hub • ${esc(client.service_plan || 'Active Care')}</span>
        </div>
        <h1 class="hero-title client-hero-greeting">Welcome back, <span class="highlight-client">${esc(client.name)}</span>!</h1>
        <p class="hero-subtitle client-hero-property">
          <i class="fa-solid fa-location-dot"></i> <strong>${esc(client.address)}</strong>
          <span class="prop-specs-divider">•</span>
          <span>${Number(client.property_size || 0).toLocaleString()} sq ft</span>
          <span class="prop-specs-divider">•</span>
          <span>${esc(client.grass_type)}</span>
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

    // Identify the most relevant work order: live > confirmed/scheduled > awaiting confirmation
    const ACTIVE_ORDER_STATUSES = ['in_progress', 'dispatched', 'scheduled', 'confirmed', 'incoming', 'pending_confirmation'];
    const activeOrder = ACTIVE_ORDER_STATUSES.map(s => workOrders.find(w => w.status === s)).find(Boolean) || workOrders[0];
    const orderAwaitingConfirmation = Boolean(activeOrder && activeOrder.status === 'pending_confirmation');
    // Payable = confirmed by a supervisor; an 'estimate' is shown but cannot be paid yet
    const unpaidInvoice = invoices.find(i => (i.status === 'unpaid' || i.status === 'partially_paid') && Number(i.balance_due) > 0);
    const estimateInvoice = !unpaidInvoice ? invoices.find(i => i.status === 'estimate') : null;

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

    // --- Dashboard render helpers (SaaS-style, Kaggle-esque) ---
    const onboarding = (typeof window.DashboardOnboarding !== 'undefined') ? window.DashboardOnboarding : null;

    const onboardingMainHTML = (snap) => `
      <section class="lc-onboard-card" aria-label="Account setup checklist">
        <div class="lc-onboard-head">
          <div>
            <span class="lc-onboard-tag"><i class="fa-solid fa-wand-magic-sparkles"></i> Getting Started</span>
            <h3 class="lc-onboard-title">Set up your Lawn Care hub</h3>
            <p class="lc-onboard-sub">Three quick steps unlock live tracking, one-tap rebooking and loyalty rewards.</p>
          </div>
        </div>

        <div class="lc-progress-row">
          <div class="lc-progress-track" title="${snap.percentComplete}% complete">
            <div class="lc-progress-bar" style="width:${snap.percentComplete}%"></div>
          </div>
          <span class="lc-progress-summary">${snap.doneCount} of ${snap.totalCount} • ${snap.percentComplete}%</span>
        </div>

        <ul class="lc-checklist">
          ${snap.milestones.map(m => `
            <li class="lc-checklist-item ${m.done ? 'is-done' : ''}" data-key="${m.key}" role="button" tabindex="0"
                aria-label="${m.done ? 'Completed: ' : 'Complete: '}${m.label}">
              <span class="lc-check">${m.done
                ? '<i class="fa-solid fa-check" aria-hidden="true"></i>'
                : `<i class="fa-solid ${m.icon}" aria-hidden="true"></i>`}</span>
              <span class="lc-check-text">
                <strong>${m.label}</strong>
                <span>${m.description}</span>
              </span>
              <i class="fa-solid fa-chevron-right lc-chev" aria-hidden="true"></i>
            </li>
          `).join('')}
        </ul>
      </section>

      <section aria-label="Getting started focus cards">
        <div class="lc-focus-grid">
          ${snap.milestones.map(m => `
            <div class="lc-focus-card ${m.done ? 'is-done' : ''}" data-key="${m.key}" role="button" tabindex="0">
              <span class="lc-focus-icon"><i class="fa-solid ${m.done ? 'fa-check' : m.icon}" aria-hidden="true"></i></span>
              <h4>${m.label}</h4>
              <p>${m.description}</p>
              <span class="lc-focus-go">${m.done ? 'Done' : 'Get started'} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span>
            </div>
          `).join('')}
        </div>
      </section>
    `;

    const operationalMainHTML = () => `
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
            <div class="plan-name">${esc(client.service_plan || 'Custom Care')} • ${esc(tier)} Member</div>
            <div class="plan-detail">${activeOrder ? `Next visit: ${esc(activeOrder.scheduled_date)}` : 'No upcoming visit — book one below.'}</div>
          </div>
          <a href="#active-service-section" class="plan-btn">Manage</a>
        </div>
      </div>
    `;

    const wireDashPay = () => {
      const btn = document.getElementById('dash-pay-btn');
      if (btn && !btn.dataset.wired) {
        btn.dataset.wired = '1';
        btn.addEventListener('click', () => {
          openMpesaModal(
            btn.getAttribute('data-invoice-id'),
            btn.getAttribute('data-amount'),
            client.phone
          );
        });
      }
    };

    const scrollToAnchor = (key) => {
      if (!onboarding) return;
      const milestone = onboarding.MILESTONES.find((m) => m.key === key);
      if (milestone && milestone.anchor) {
        const target = document.getElementById(milestone.anchor);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };

    const syncMainColumn = (snap) => {
      const mainEl = document.getElementById('lc-dash-main');
      if (!mainEl) return;

      const bar = mainEl.querySelector('.lc-progress-bar');
      const summary = mainEl.querySelector('.lc-progress-summary');
      if (bar) bar.style.width = `${snap.percentComplete}%`;
      if (summary) summary.textContent = `${snap.doneCount} of ${snap.totalCount} • ${snap.percentComplete}%`;

      mainEl.querySelectorAll('.lc-checklist-item, .lc-focus-card').forEach((el) => {
        const m = snap.milestones.find((mm) => mm.key === el.dataset.key);
        if (m) {
          el.classList.toggle('is-done', m.done);
          const check = el.querySelector('.lc-check');
          const icon = el.querySelector('.lc-focus-icon i');
          if (check) check.innerHTML = m.done ? '<i class="fa-solid fa-check" aria-hidden="true"></i>' : `<i class="fa-solid ${m.icon}" aria-hidden="true"></i>`;
          if (icon) icon.className = `fa-solid ${m.done ? 'fa-check' : m.icon}`;
        }
      });

      const focusGo = mainEl.querySelectorAll('.lc-focus-go');
      focusGo.forEach((el) => {
        const key = el.closest('.lc-focus-card')?.dataset.key;
        const m = snap.milestones.find((mm) => mm.key === key);
        if (m) {
          el.childNodes[0].textContent = m.done ? 'Done ' : 'Get started ';
        }
      });

      if (snap.isComplete && !snap.isDismissed) {
        onboarding.dismiss();
      } else if (snap.isDismissed && snap.isComplete) {
        if (onboardingUnsub) { onboardingUnsub(); onboardingUnsub = null; }
        mainEl.innerHTML = operationalMainHTML();
        wireDashPay();
        showToast('Onboarding complete — full command center unlocked!', 'success');
      }
    };

    const renderMainColumn = () => {
      if (!onboarding) {
        document.getElementById('lc-dash-main').innerHTML = operationalMainHTML();
        wireDashPay();
        return;
      }
      const snap = onboarding.get();
      const mainEl = document.getElementById('lc-dash-main');
      if (snap.isComplete || snap.isDismissed) {
        mainEl.innerHTML = operationalMainHTML();
        wireDashPay();
        return;
      }
      mainEl.innerHTML = onboardingMainHTML(snap);

      mainEl.querySelectorAll('.lc-checklist-item').forEach((item) => {
        const activate = () => {
          const key = item.dataset.key;
          const current = onboarding.get().milestones.find((m) => m.key === key);
          const doing = !current.done;
          onboarding.toggle(key);
          if (doing) scrollToAnchor(key);
        };
        item.addEventListener('click', activate);
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
        });
      });
      mainEl.querySelectorAll('.lc-focus-card').forEach((card) => {
        const activate = () => scrollToAnchor(card.dataset.key);
        card.addEventListener('click', activate);
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
        });
      });

      if (onboardingUnsub) onboardingUnsub();
      onboardingUnsub = onboarding.subscribe(syncMainColumn);
    };

    dashboardContainer.innerHTML = `
      <div class="container">
        <!-- Compact status header -->
        <div class="lc-status-header">
          <div class="lc-status-greeting">
            <h2>Welcome back, ${firstName(client.name)}!</h2>
            <p class="lc-status-property" id="account-details">
              <i class="fa-solid fa-house"></i>
              <strong>${esc(client.address)}</strong>
              <span>•</span>
              <span>${Number(client.property_size || 0).toLocaleString()} sq ft</span>
              <span>•</span>
              <span>${esc(client.grass_type)}</span>
            </p>
          </div>
          <div class="lc-status-chips">
            <div class="lc-chip">
              <span class="lc-chip-label">Next Service</span>
              <span class="lc-chip-value">${activeOrder ? activeOrder.scheduled_date : '—'}</span>
            </div>
            <div class="lc-chip">
              <span class="lc-chip-label">Account Balance</span>
              <span class="lc-chip-value ${unpaidInvoice ? '' : 'lc-text-emerald'}">${unpaidInvoice ? 'KSh ' + Math.round(unpaidInvoice.balance_due).toLocaleString() : 'All Paid'}</span>
            </div>
            <div class="lc-chip">
              <span class="lc-chip-label">Reward Points</span>
              <span class="lc-chip-value lc-text-emerald">${loyalty.points_balance} pts</span>
            </div>
          </div>
        </div>

        <!-- Main SaaS grid: 2/3 content + 1/3 side rail -->
        <div class="lc-dash-grid">
          <div class="lc-dash-main" id="lc-dash-main"></div>

          <div class="lc-dash-side">
            <div class="lc-side-card">
              <h3><i class="fa-solid fa-cloud-sun"></i> Yard Conditions</h3>
              <div class="yard-conditions">
                <div class="yc-title" id="yard-conditions-title"><i class="fa-solid fa-droplet"></i> ${kshSeasonTip.title}</div>
                <div class="yc-body" id="yard-conditions-body">${kshSeasonTip.body}</div>
              </div>
            </div>

            <div class="lc-side-card">
              <h3><i class="fa-solid fa-clock-rotate-left"></i> Recent Visits</h3>
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

            <div class="lc-side-card lc-support-card">
              <i class="fa-solid fa-headset" aria-hidden="true"></i>
              <div>
                <strong>Need help with your lawn?</strong>
                <p>Our care crew replies within minutes during business hours.</p>
                <a href="#contact" class="lc-link">Contact Support <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
              </div>
            </div>
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
                <span class="portal-card-tag"><i class="fa-solid fa-calendar-check"></i> ${orderAwaitingConfirmation ? 'Booking Request' : 'Upcoming Appointment'}</span>
                <h3 class="portal-card-title">${activeOrder ? esc(activeOrder.title) : 'No service scheduled'}</h3>
              </div>
              ${activeOrder && activeOrder.status === 'in_progress' ? `
                <span class="status-badge status-in-progress pulse-glow">
                  <span class="live-dot"></span> Crew On-Site
                </span>
              ` : orderAwaitingConfirmation ? `
                <span class="status-badge status-pending">
                  <i class="fa-regular fa-hourglass-half"></i> Awaiting Confirmation
                </span>
              ` : activeOrder ? `
                <span class="status-badge status-scheduled">
                  <i class="fa-regular fa-clock"></i> ${activeOrder.status === 'completed' ? 'Completed' : 'Confirmed'}
                </span>
              ` : ''}
            </div>

            <div class="portal-card-body">
              ${activeOrder ? `
                <div class="service-meta-grid">
                  <div class="meta-item">
                    <span class="meta-label">Date & Time</span>
                    <span class="meta-value highlight"><i class="fa-solid fa-clock"></i> ${esc(activeOrder.scheduled_date)}</span>
                  </div>
                  <div class="meta-item">
                    <span class="meta-label">Assigned Crew</span>
                    <span class="meta-value"><i class="fa-solid fa-users-gear"></i> ${esc(activeOrder.crew_name || 'To be assigned')}</span>
                  </div>
                  <div class="meta-item">
                    <span class="meta-label">Service Type</span>
                    <span class="meta-value">${esc(activeOrder.service_type || 'Lawn care service')}</span>
                  </div>
                  <div class="meta-item">
                    <span class="meta-label">${orderAwaitingConfirmation ? 'Estimated Price' : 'Confirmed Price'}</span>
                    <span class="meta-value text-accent">KSh ${Math.round(activeOrder.total_price || 0).toLocaleString()}</span>
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
                ` : orderAwaitingConfirmation ? `
                  <div class="service-schedule-notice">
                    <p><i class="fa-solid fa-circle-info"></i> We are reviewing your request. A supervisor will confirm the final price and date by SMS, and payment is only requested after that.</p>
                    <a href="/tracker/${esc(activeOrder.id)}" class="btn btn-outline-secondary btn-sm">View Request Status</a>
                  </div>
                ` : `
                  <div class="service-schedule-notice">
                    <p><i class="fa-solid fa-circle-info"></i> Your visit is confirmed. Live tracking activates on service day once the crew is dispatched.</p>
                    <a href="/tracker/${esc(activeOrder.id)}" class="btn btn-outline-secondary btn-sm">View Schedule & Checklist</a>
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
              ` : estimateInvoice ? `
                <span class="status-badge status-pending">
                  <i class="fa-regular fa-hourglass-half"></i> Estimate Pending
                </span>
              ` : `
                <span class="status-badge status-paid">
                  <i class="fa-solid fa-circle-check"></i> Account Up-to-Date
                </span>
              `}
            </div>

            <div class="portal-card-body">
              ${estimateInvoice ? `
                <div class="invoice-alert-box estimate-box">
                  <div class="invoice-summary-row">
                    <div>
                      <span class="inv-num">${esc(estimateInvoice.invoice_number)} <small>(estimate)</small></span>
                      <div class="inv-title">${esc(estimateInvoice.service_title || 'Lawn Care Service')}</div>
                      <div class="inv-due text-muted">Nothing to pay yet. We confirm the final price with you first.</div>
                    </div>
                    <div class="inv-amount-box">
                      <span class="balance-label">Estimated</span>
                      <span class="balance-amount">KSh ${Math.round(estimateInvoice.total_amount).toLocaleString()}</span>
                    </div>
                  </div>
                  <div class="payment-action-buttons">
                    <a href="/receipt/${esc(estimateInvoice.id)}" class="btn btn-view-invoice" title="View Estimate">
                      <i class="fa-solid fa-file-lines"></i> View Estimate
                    </a>
                  </div>
                </div>
              ` : unpaidInvoice ? `
                <div class="invoice-alert-box">
                  <div class="invoice-summary-row">
                    <div>
                      <span class="inv-num">${esc(unpaidInvoice.invoice_number)}</span>
                      <div class="inv-title">${esc(unpaidInvoice.service_title || 'Lawn Care Service')}</div>
                      <div class="inv-due text-muted">Due date: ${esc(unpaidInvoice.due_date)}</div>
                    </div>
                    <div class="inv-amount-box">
                      <span class="balance-label">Balance Due</span>
                      <span class="balance-amount">KSh ${Math.round(unpaidInvoice.balance_due).toLocaleString()}</span>
                    </div>
                  </div>
                  <div class="payment-action-buttons">
                    <button class="btn btn-mpesa-instant" data-invoice-id="${esc(unpaidInvoice.id)}" data-amount="${Number(unpaidInvoice.balance_due) || 0}" id="instant-mpesa-btn">
                      <i class="fa-solid fa-mobile-screen-button"></i> Pay via Lipa Na M-Pesa
                    </button>
                    <a href="/pay/${esc(unpaidInvoice.id)}" class="btn btn-card-pay">
                      <i class="fa-solid fa-mobile-screen-button"></i> Pay Online
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
                          <i class="fa-solid fa-file-invoice"></i> ${esc(inv.invoice_number)} (KSh ${Math.round(inv.total_amount).toLocaleString()}) — Tax Receipt
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
              <h3 class="portal-card-title">Seasonal Add-Ons for ${Number(client.property_size || 0).toLocaleString()} sq ft</h3>
              <p class="section-desc">Tailored specifically for ${esc(client.grass_type)}. Book in one tap without re-entering your details.</p>
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

    // Render the main column: onboarding checklist while incomplete, full tools when done.
    renderMainColumn();

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

    // Dashboard quick-action Pay button is wired inside renderMainColumn/syncMainColumn.

    // Wire 1-Click Add-on buttons
    const addonButtons = dashboardContainer.querySelectorAll('.btn-addon-book');
    addonButtons.forEach(btn => {
      btn.addEventListener('click', async () => {
        const service = btn.getAttribute('data-service');

        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Booking...`;

        try {
          // The server prices the service from its catalogue; the PIN proves
          // this booking comes from the account owner.
          const res = await fetch('/api/work-orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_name: client.name,
              phone: client.phone,
              email: client.email,
              service_type: service,
              property_size: client.property_size,
              address: client.address,
              pin: getStoredPin(),
              notes: 'Booked via 1-click client portal'
            })
          });

          const json = await res.json();
          if (json.success) {
            btn.innerHTML = `<i class="fa-solid fa-check"></i> Booked!`;
            btn.classList.add('booked-success');
            if (typeof window.DashboardOnboarding !== 'undefined') {
              window.DashboardOnboarding.setCompleted('set-preferences', true);
            }
            const total = Math.round(Number(json.invoice?.total_amount || 0)).toLocaleString();
            showToast(json.booking_mode === 'confirm'
              ? `${service} requested (estimate KSh ${total}). We will confirm the final price by SMS before any payment. +30 Loyalty points earned!`
              : `${service} scheduled for KSh ${total}! Added to supervisor dispatch queue. +30 Loyalty points earned!`, 'success');
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

    // Stop listening to onboarding state changes for this session
    if (onboardingUnsub) { onboardingUnsub(); onboardingUnsub = null; }

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
        // A prompt for this invoice is already on the customer's phone: resume
        // polling that checkout instead of sending a second prompt.
        const checkoutId = data.checkout_request_id;
        if (!data.success && !(data.error?.code === 'PAYMENT_IN_PROGRESS' && checkoutId)) {
          throw new Error(data.error?.message || 'STK Push failed');
        }

        if (!checkoutId) {
          throw new Error('The payment provider did not return a checkout reference.');
        }

        const result = await pollMpesaStatus(checkoutId);
        if (result.status === 'success') {
          statusStep.style.display = 'none';
          const successStep = document.getElementById('mpesa-success-step');
          successStep.style.display = 'block';
          document.getElementById('mpesa-receipt-code').textContent = result.mpesa_receipt || '—';
          if (typeof window.DashboardOnboarding !== 'undefined') {
            window.DashboardOnboarding.setCompleted('add-payment', true);
          }
          if (result.invoice_status === 'partially_paid') {
            showToast(`M-Pesa confirmed KSh ${Math.round(Number(result.amount_paid || 0)).toLocaleString()}. KSh ${Math.round(Number(result.invoice_balance_due || 0)).toLocaleString()} is still outstanding.`, 'error');
          } else {
            showToast('Payment confirmed by M-Pesa! Your invoice is marked paid.', 'success');
          }
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
  function openAnonymousBookingModal({ size, grass, frequency, grassKey, frequencyKey, addons, price, couponCode }) {
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
  // Open the hub sign-in with the identifier prefilled (deep links from SMS,
  // the PWA shortcut, /login redirects).
  function promptForHub(prefillIdentifier) {
    if (!document.getElementById('instant-calculator') && !document.querySelector('.client-access-trigger')) return;
    openClientAccessModal();
    const input = document.getElementById('client-identifier-input');
    if (input && prefillIdentifier) {
      input.value = prefillIdentifier;
      document.getElementById('client-pin-input')?.focus();
    }
  }

  async function init() {
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
})();
