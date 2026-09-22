// Personalised client hub: header state, dashboard rendering, refresh and sign-out.
import { fetchClientProfile } from './api.js';
import { openMpesaModal } from './payments.js';
import { state, FEATURES, getStoredIdentifier, getStoredPin, esc, firstName, clearStoredIdentifier, showToast } from './state.js';
import { fetchNairobiYardConditions } from './weather.js';

export function updateTopNavUser(clientData) {
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
export function renderPersonalizedState(data) {
  state.currentClientData = data;
  const client = data.client;
  const loyalty = data.loyalty;
  const workOrders = data.work_orders || [];
  const invoices = data.invoices || [];

  updateTopNavUser(data);

  // State-based rendering: authenticated clients see the dashboard instead
  // of the marketing funnel (marketing sections are hidden via CSS).
  document.body.classList.add('hub-authenticated');

  // Identify the most relevant work order: live > confirmed/scheduled > awaiting confirmation
  const ACTIVE_ORDER_STATUSES = ['in_progress', 'dispatched', 'scheduled', 'confirmed', 'incoming', 'pending_confirmation'];
  const activeOrder = ACTIVE_ORDER_STATUSES.map(s => workOrders.find(w => w.status === s)).find(Boolean) || workOrders[0];
  const orderAwaitingConfirmation = Boolean(activeOrder && activeOrder.status === 'pending_confirmation');
  const orderLive = Boolean(activeOrder && (activeOrder.status === 'in_progress' || activeOrder.status === 'dispatched'));
  const visitLabel = orderLive ? 'View Request Status' : orderAwaitingConfirmation ? 'Request Status' : activeOrder ? 'Next Visit' : 'Book a Visit';

  // Swap Hero to Personalized Welcome
  const heroContent = document.querySelector('.hero-content');
  if (heroContent) {
    if (!state.originalHeroHTML) {
      state.originalHeroHTML = heroContent.innerHTML;
    }
    heroContent.innerHTML = `
      <div class="client-welcome-badge">
        <span class="pulse-dot"></span>
        <span>My Lawn • ${esc(client.service_plan || 'Lawn care')}</span>
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
        <a href="${activeOrder ? '#active-service-section' : '#quick-addons-section'}" class="btn btn-primary"><i class="fa-solid ${orderLive ? 'fa-route' : 'fa-calendar-check'}"></i> ${visitLabel}</a>
        <a href="#outstanding-bills-section" class="btn btn-secondary"><i class="fa-solid fa-file-invoice-dollar"></i> Bills &amp; Payments</a>
        <button id="switch-account-btn" class="btn btn-outline-light"><i class="fa-solid fa-arrow-right-from-bracket"></i> Sign out</button>
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

  // --- Dashboard main column ---
  const operationalMainHTML = () => `
    <div class="dash-widget">
      <h3><i class="fa-solid fa-bolt"></i> Quick Actions <span class="dash-widget-sub">Everything in one tap</span></h3>
      <div class="dash-actions-grid">
        <a href="#quick-addons-section" class="dash-action"><i class="fa-solid fa-plus"></i> Request Extra Mow</a>
        ${activeOrder
          ? `<a href="/tracker/${activeOrder.id}" class="dash-action"><i class="fa-solid fa-location-crosshairs"></i> ${orderLive ? 'Live Crew Status' : 'Track My Request'}</a>`
          : `<span class="dash-action disabled"><i class="fa-solid fa-location-crosshairs"></i> Track My Request</span>`}
        ${unpaidInvoice
          ? `<button type="button" class="dash-action" id="dash-pay-btn" data-invoice-id="${unpaidInvoice.id}" data-amount="${unpaidInvoice.balance_due}"><i class="fa-solid fa-mobile-screen-button"></i> Pay With M-Pesa</button>`
          : `<span class="dash-action disabled"><i class="fa-solid fa-circle-check"></i> Balance Settled</span>`}
        <a href="#contact" class="dash-action"><i class="fa-solid fa-headset"></i> Contact Support</a>
      </div>

      <h3 style="margin-top: 1.4rem;"><i class="fa-solid fa-clipboard-list"></i> Your Plan</h3>
      <div class="plan-card">
        <div>
          <div class="plan-name">${esc(client.service_plan || 'Lawn care')}</div>
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
          client.phone, { onPaid: refreshCurrentClient });
      });
    }
  };

  const renderMainColumn = () => {
    const mainEl = document.getElementById('lc-dash-main');
    if (!mainEl) return;
    mainEl.innerHTML = operationalMainHTML();
    wireDashPay();
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
            <span class="lc-chip-value ${unpaidInvoice ? '' : 'lc-text-emerald'}">${unpaidInvoice ? 'KSh ' + Math.round(unpaidInvoice.balance_due).toLocaleString() : estimateInvoice ? 'Estimate pending' : 'All Paid'}</span>
          </div>
          ${FEATURES.loyalty ? `<div class="lc-chip">
            <span class="lc-chip-label">Reward Points</span>
            <span class="lc-chip-value lc-text-emerald">${loyalty.points_balance} pts</span>
          </div>` : ''}
        </div>
      </div>

      <!-- Dashboard grid: 2/3 content + 1/3 side rail -->
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

      ${FEATURES.loyalty ? `      <!-- Loyalty & Perks Bar -->
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
          <div class="loyalty-value-sub">Earn reward points on every service visit</div>
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

` : ''}

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
      openMpesaModal(invoiceId, amount, client.phone, { onPaid: refreshCurrentClient });
    });
  }

  // Dashboard quick-action Pay button is wired inside renderMainColumn.

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
          const total = Math.round(Number(json.invoice?.total_amount || 0)).toLocaleString();
          showToast(json.booking_mode === 'confirm'
            ? `${service} requested (estimate KSh ${total}). We will confirm the final price by SMS before any payment.`
            : `${service} booked for KSh ${total}. We will be in touch to schedule it.`, 'success');
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
export async function refreshCurrentClient() {
  const id = getStoredIdentifier();
  if (id) {
    const data = await fetchClientProfile(id);
    if (data) renderPersonalizedState(data);
  }
}

// Handle Logout / Switch Account
export function handleLogout() {
  clearStoredIdentifier();
  state.currentClientData = null;

  // Restore the marketing funnel view
  document.body.classList.remove('hub-authenticated');

  // Stop listening to onboarding state changes for this session
  if (state.onboardingUnsub) { state.onboardingUnsub(); state.onboardingUnsub = null; }

  // 1. Immediately remove personalized dashboard container from DOM
  const dash = document.getElementById('personalized-dashboard');
  if (dash) dash.remove();

  // 2. Restore original public hero banner immediately
  const heroContent = document.querySelector('.hero-content');
  if (heroContent && state.originalHeroHTML) {
    heroContent.innerHTML = state.originalHeroHTML;
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
