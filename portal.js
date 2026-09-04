// Lawn Craft Client Portal & Dynamic Personalization Engine
(function () {
  'use strict';

  const STORAGE_KEY = 'lawncraft_client_identifier';
  let currentClientData = null;

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

  // Clear stored identifier
  function clearStoredIdentifier() {
    try {
      localStorage.removeItem(STORAGE_KEY);
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

  // API: Lookup Client Profile
  async function fetchClientProfile(identifier) {
    try {
      const res = await fetch('/api/portal/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier })
      });

      if (!res.ok) {
        throw new Error('No client record found for this identifier');
      }

      const data = await res.json();
      if (data.success && data.client) {
        return data;
      }
      throw new Error('Invalid client data received');
    } catch (err) {
      console.warn('[Portal Lookup Failed]', err);
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

    // Swap Hero to Personalized Welcome
    const heroContent = document.querySelector('.hero-content');
    if (heroContent) {
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
            <div class="loyalty-value-sub">Cash Value: <strong>$${loyalty.dollar_value.toFixed(2)}</strong> ($0.50/pt)</div>
          </div>
          <div class="loyalty-col loyalty-referral-col">
            <div class="loyalty-label">YOUR REFERRAL PERK</div>
            <div class="referral-code-box">
              <span class="ref-code" id="ref-code-text">${loyalty.referral_code}</span>
              <button class="btn-copy-ref" id="copy-ref-btn" title="Copy Referral Code"><i class="fa-regular fa-copy"></i></button>
              <a href="https://api.whatsapp.com/send?text=${encodeURIComponent(`Hi! Get 15% off professional lawn mowing and care with Lawn Craft using my referral code ${loyalty.referral_code}: https://lawncraft.com/?client=${encodeURIComponent(client.phone)}`)}" 
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
                    <span class="meta-value text-accent">$${(activeOrder.total_price || 45).toFixed(2)}</span>
                  </div>
                </div>

                ${activeOrder.status === 'in_progress' ? `
                  <div class="crew-tracker-teaser">
                    <div class="teaser-info">
                      <div class="crew-avatar">
                        <i class="fa-solid fa-truck-pickup"></i>
                      </div>
                      <div class="crew-text">
                        <strong>Crew Lead: ${activeOrder.crew_lead || 'Jackson Mwangi'}</strong>
                        <p>Vehicle: ${activeOrder.crew_vehicle || 'Toyota Hilux KDG 892A'} • ETA on-site: Active Now</p>
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
                      <span class="balance-amount">$${unpaidInvoice.balance_due.toFixed(2)}</span>
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
                          <i class="fa-solid fa-file-invoice"></i> ${inv.invoice_number} ($${inv.total_amount.toFixed(2)}) — Tax Receipt
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
                <div class="addon-price">$85.00</div>
              </div>
              <button class="btn btn-addon-book" data-service="Core Aeration" data-price="85">
                <i class="fa-solid fa-plus"></i> 1-Click Book
              </button>
            </div>

            <div class="addon-item">
              <div class="addon-icon"><i class="fa-solid fa-scissors"></i></div>
              <div class="addon-details">
                <h4>Hedge & Shrub Sculpting</h4>
                <p>Artisanal hedge trimming, formal shaping, and complete green debris hauling.</p>
                <div class="addon-price">$45.00</div>
              </div>
              <button class="btn btn-addon-book" data-service="Hedge Sculpting" data-price="45">
                <i class="fa-solid fa-plus"></i> 1-Click Book
              </button>
            </div>

            <div class="addon-item">
              <div class="addon-icon"><i class="fa-solid fa-faucet-drip"></i></div>
              <div class="addon-details">
                <h4>Smart Sprinkler Tune-Up</h4>
                <p>Nozzle alignment, water pressure audit, and automated leak detection.</p>
                <div class="addon-price">$50.00</div>
              </div>
              <button class="btn btn-addon-book" data-service="Sprinkler Tune-Up" data-price="50">
                <i class="fa-solid fa-plus"></i> 1-Click Book
              </button>
            </div>

            <div class="addon-item">
              <div class="addon-icon"><i class="fa-solid fa-seedling"></i></div>
              <div class="addon-details">
                <h4>Organic Slow-Release Feed</h4>
                <p>Eco-friendly micro-nutrient treatment for deep green vibrancy without chemical burn.</p>
                <div class="addon-price">$65.00</div>
              </div>
              <button class="btn btn-addon-book" data-service="Organic Bio-Fertilization" data-price="65">
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
    showToast('Switched to public view. See you soon!', 'success');
    setTimeout(() => {
      // Remove query params and reload cleanly
      window.location.href = window.location.pathname;
    }, 500);
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
            <span class="currency">USD</span>
            <span class="figure">$${Number(amount).toFixed(2)}</span>
          </div>
          <div class="form-group">
            <label for="mpesa-phone-input">M-Pesa Mobile Number</label>
            <input type="tel" id="mpesa-phone-input" class="form-control" value="${defaultPhone || '0712345678'}" placeholder="e.g. 0712345678 or 254712345678">
          </div>
          <button class="btn btn-mpesa-trigger" id="send-stk-btn">
            <i class="fa-solid fa-paper-plane"></i> Send STK PIN Prompt
          </button>
        </div>

        <div class="mpesa-status-view" id="mpesa-status-step" style="display: none;">
          <div class="stk-spinner"><i class="fa-solid fa-spinner fa-spin"></i></div>
          <h4>Check Your Phone!</h4>
          <p>STK Push sent to <strong id="stk-sent-phone"></strong>. Please enter your 4-digit M-Pesa PIN on your screen.</p>
          <div class="stk-simulation-notice">
            <i class="fa-solid fa-circle-check text-green"></i> <span>Simulation mode: auto-confirming payment in 3s...</span>
          </div>
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

      try {
        const res = await fetch('/api/mpesa/stkpush', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: phoneInput,
            amount: Number(amount),
            invoice_id: invoiceId,
            account_reference: `INV-${invoiceId}`
          })
        });

        const data = await res.json();
        if (data.success) {
          // After 2.5s simulation delay, show confirmed
          setTimeout(() => {
            statusStep.style.display = 'none';
            const successStep = document.getElementById('mpesa-success-step');
            successStep.style.display = 'block';
            document.getElementById('mpesa-receipt-code').textContent = data.mpesa_receipt || 'NLM89218XK';
            showToast('Payment successful! Your invoice is marked paid.', 'success');
            refreshCurrentClient();
          }, 2500);
        } else {
          throw new Error(data.error?.message || 'STK Push failed');
        }
      } catch (err) {
        statusStep.style.display = 'none';
        document.getElementById('mpesa-body-step').style.display = 'block';
        showToast(err.message || 'M-Pesa transaction failed', 'error');
      }
    });

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
          <p>Passwordless access for property owners. Enter your phone number or email to view your property specs, crew tracker, and loyalty perks.</p>
        </div>

        <form id="client-login-form">
          <div class="form-group">
            <label for="client-identifier-input">Phone Number or Email</label>
            <div class="input-with-icon">
              <i class="fa-solid fa-user-tag"></i>
              <input type="text" id="client-identifier-input" class="form-control" placeholder="e.g. 0712345678 or your@email.com" required>
            </div>
          </div>
          <button type="submit" class="btn btn-primary btn-block" id="client-login-submit-btn">
            <i class="fa-solid fa-arrow-right-to-bracket"></i> Access My Lawn
          </button>
        </form>

        <div class="demo-switch-pills">
          <span class="demo-pills-label"><i class="fa-solid fa-wand-magic-sparkles"></i> Try One-Click Demo Profiles:</span>
          <div class="pills-grid">
            <button class="demo-pill" data-id="0712345678">
              <strong>Sarah Wanjiru</strong> (Karen)
              <span class="pill-badge badge-active">Active Crew + Unpaid Bill</span>
            </button>
            <button class="demo-pill" data-id="0722334455">
              <strong>David Kimani</strong> (Runda)
              <span class="pill-badge badge-vip">Platinum VIP + Scheduled</span>
            </button>
            <button class="demo-pill" data-id="0733445566">
              <strong>Elena Gomez</strong> (Kilimani)
              <span class="pill-badge badge-bronze">Bronze + Fresh Quote</span>
            </button>
          </div>
        </div>
      </div>
    `;

    modal.classList.add('active');

    // Close
    document.getElementById('close-login-modal').addEventListener('click', () => modal.classList.remove('active'));

    // Form Submit
    document.getElementById('client-login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('client-identifier-input').value.trim();
      if (!input) return;

      const submitBtn = document.getElementById('client-login-submit-btn');
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Finding your lawn...`;

      const data = await fetchClientProfile(input);
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i class="fa-solid fa-arrow-right-to-bracket"></i> Access My Lawn`;

      if (data) {
        setStoredIdentifier(input);
        modal.classList.remove('active');
        showToast(`Welcome back, ${data.client.name}!`, 'success');
        renderPersonalizedState(data);
      } else {
        showToast('We could not find records for that number. Try one of our demo profiles below!', 'error');
      }
    });

    // Demo Pills Click
    modal.querySelectorAll('.demo-pill').forEach(pill => {
      pill.addEventListener('click', async () => {
        const id = pill.getAttribute('data-id');
        document.getElementById('client-identifier-input').value = id;
        pill.classList.add('loading');

        const data = await fetchClientProfile(id);
        pill.classList.remove('loading');

        if (data) {
          setStoredIdentifier(id);
          modal.classList.remove('active');
          showToast(`Loaded ${data.client.name}'s Client Hub!`, 'success');
          renderPersonalizedState(data);
        }
      });
    });
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
      'kikuyu': { name: 'Kikuyu Turf', baseRate: 0.007 },
      'bermuda': { name: 'Bermuda Tifway', baseRate: 0.008 },
      'paspalum': { name: 'Paspalum', baseRate: 0.0075 },
      'buffalo': { name: 'Buffalo Grass', baseRate: 0.009 }
    };

    const freqMultipliers = {
      'weekly': { name: 'Weekly (Best Health)', mult: 0.85 },
      'biweekly': { name: 'Bi-Weekly (Most Popular)', mult: 1.0 },
      'monthly': { name: 'Monthly Maintenance', mult: 1.25 },
      'onetime': { name: 'One-Time Precision Cut', mult: 1.4 }
    };

    const addonRates = {
      'edging': { name: 'Precision Edge Trimming', price: 15 },
      'fertilizer': { name: 'Organic Feed Treatment', price: 35 },
      'aeration': { name: 'Core Soil Aeration', price: 55 },
      'hedges': { name: 'Perimeter Hedge Shaping', price: 30 }
    };

    function calculateTotal() {
      const grass = grassRates[currentGrass] || grassRates.kikuyu;
      const freq = freqMultipliers[currentFrequency] || freqMultipliers.biweekly;

      let subtotal = Math.max(35, currentSize * grass.baseRate);
      subtotal = subtotal * freq.mult;

      selectedAddons.forEach(addonKey => {
        if (addonRates[addonKey]) subtotal += addonRates[addonKey].price;
      });

      let discount = 0;
      if (appliedCoupon && appliedCoupon.valid) {
        if (appliedCoupon.discount_type === 'percent') {
          discount = subtotal * (appliedCoupon.discount_value / 100);
        } else {
          discount = Math.min(appliedCoupon.discount_value, subtotal);
        }
      }

      const total = Math.max(25, subtotal - discount);

      // Update DOM
      const subtotalEl = document.getElementById('calc-subtotal');
      const discountRow = document.getElementById('calc-discount-row');
      const discountAmountEl = document.getElementById('calc-discount-amount');
      const totalEl = document.getElementById('calc-total');
      const sizeValEl = document.getElementById('calc-size-val');

      if (sizeValEl) sizeValEl.textContent = `${currentSize.toLocaleString()} sq ft`;
      if (subtotalEl) subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
      if (totalEl) totalEl.textContent = `$${total.toFixed(2)}`;

      if (discountRow) {
        if (discount > 0) {
          discountRow.style.display = 'flex';
          if (discountAmountEl) discountAmountEl.textContent = `-$${discount.toFixed(2)}`;
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
          <div class="anon-estimate-pill">Estimated Total: <strong>$${Number(price).toFixed(2)}</strong></div>
        </div>

        <form id="anon-booking-form">
          <div class="form-group">
            <label for="anon-name">Full Name</label>
            <input type="text" id="anon-name" class="form-control" placeholder="e.g. Jane Doe" required>
          </div>
          <div class="form-group">
            <label for="anon-phone">Phone Number (WhatsApp or Call)</label>
            <input type="tel" id="anon-phone" class="form-control" placeholder="e.g. 0712345678" required>
          </div>
          <div class="form-group">
            <label for="anon-address">Property Address / Estate</label>
            <input type="text" id="anon-address" class="form-control" placeholder="e.g. Karen, Runda, or Lavington" required>
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
            notes: `Website Instant Calculator Order. Promo: ${couponCode || 'None'}`
          })
        });

        const json = await res.json();
        if (json.success) {
          // Cache verified phone so user is recognized!
          setStoredIdentifier(phone);
          modal.classList.remove('active');
          showToast(`Thank you ${name}! Your order is queued for supervisor dispatch. Welcome to Lawn Craft!`, 'success');
          
          // Switch to personalized client hub automatically!
          setTimeout(async () => {
            const profile = await fetchClientProfile(phone);
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
      const data = await fetchClientProfile(queryId);
      if (data) {
        renderPersonalizedState(data);
        showToast(`Recognized from link: Welcome ${data.client.name}!`, 'success');
        return;
      }
    }

    // 2. Check localStorage for returning client
    const storedId = getStoredIdentifier();
    if (storedId) {
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
