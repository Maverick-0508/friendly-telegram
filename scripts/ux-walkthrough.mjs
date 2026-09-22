// Headless-browser UX walkthrough: books a service as a new visitor, opens the
// hub, pay page and receipt, checks sign-out / PIN login, page rendering, mobile
// layout, console errors and failed requests. Screenshots go to %TEMP%/lawncraft-shots.
//
//   npm i --no-save puppeteer-core          (drives the system Edge/Chrome)
//   UX_BASE=http://localhost:3000 UX_LABEL=local node scripts/ux-walkthrough.mjs
//
// On Windows run from PowerShell; some sandboxes block the browser launch.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.env.UX_BASE || 'http://localhost:3000';
const LABEL = process.env.UX_LABEL || 'local';
const SHOTS = path.resolve(process.env.TEMP || '/tmp', 'lawncraft-shots');
fs.mkdirSync(SHOTS, { recursive: true });

const candidates = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];
const exe = candidates.find((p) => fs.existsSync(p));
if (!exe) { console.log('NO BROWSER FOUND'); process.exit(2); }

const document_has_pay = (txt) => /Pay via Lipa Na M-Pesa/.test(txt);
const results = [];
const rec = (name, ok, detail = '') => results.push({ name, ok, detail });
const shot = async (page, name) => { const f = path.join(SHOTS, `${LABEL}-${name}.png`); await page.screenshot({ path: f, fullPage: false }); return f; };

const userDataDir = fs.mkdtempSync(path.join(process.env.TEMP || '/tmp', 'pptr-ux-'));
const browser = await puppeteer.launch({
  executablePath: exe, headless: true, userDataDir, timeout: 60000,
  args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions'],
});
const shots = [];
try {
  const page = await browser.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  // The deliberate wrong-PIN attempt produces a 403 the browser logs as an error.
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/status of 403/.test(m.text())) return;
    if (/open-meteo/.test(m.location()?.url || '')) return; // third-party weather API
    consoleErrors.push(`${m.text()} @ ${m.location()?.url || '?'}`.slice(0, 220));
  });
  page.on('requestfailed', (r) => {
    if (r.url().includes('open-meteo')) return;
    // Map tiles still downloading when we navigate away are aborted by the browser, not failed.
    if (r.failure()?.errorText === 'net::ERR_ABORTED' && /tile\.openstreetmap\.org|unsplash\.com/.test(r.url())) return;
    failedRequests.push(`${r.failure()?.errorText} ${r.url()}`.slice(0, 200));
  });
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('open-meteo') && !r.url().includes('/api/portal/lookup')) failedRequests.push(`HTTP ${r.status()} ${r.url()}`.slice(0, 200)); });

  // ---- Desktop home ----
  await page.setViewport({ width: 1366, height: 800 });
  const t0 = Date.now();
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  const loadMs = Date.now() - t0;
  rec('home loads', true, `${loadMs} ms to network idle`);
  const hasHero = await page.$('.hero-content');
  const hasCalc = await page.$('#instant-calculator');
  const hasContact = await page.$('form#contactForm, form[id*="contact"], #contact form');
  rec('home: hero, calculator and contact form present', Boolean(hasHero && hasCalc && hasContact), `hero=${!!hasHero} calc=${!!hasCalc} contact=${!!hasContact}`);
  const heroImg = await page.evaluate(() => { const i = document.querySelector('.hero-image'); return i ? { complete: i.complete, w: i.naturalWidth, src: i.currentSrc } : null; });
  rec('home: hero image loaded', Boolean(heroImg && heroImg.complete && heroImg.w > 0), JSON.stringify(heroImg));
  const iconsOk = await page.evaluate(() => { const i = document.querySelector('.fa-solid, .fa-regular, .fa-brands'); if (!i) return 'no icon el'; const ff = getComputedStyle(i, '::before').fontFamily; return ff; });
  rec('home: icon font applied', /Font Awesome/i.test(String(iconsOk)), String(iconsOk));
  shots.push(await shot(page, 'home-desktop'));

  // ---- Calculator: anonymous booking flow ----
  await page.evaluate(() => document.getElementById('instant-calculator')?.scrollIntoView());
  await page.waitForSelector('#calc-book-btn', { timeout: 10000 });
  const totalBefore = await page.$eval('#calc-total', (el) => el.textContent.trim());
  await page.click('.calc-chip[data-grass="buffalo"]').catch(() => {});
  await page.click('.calc-chip[data-freq="onetime"]').catch(() => {});
  const totalAfter = await page.$eval('#calc-total', (el) => el.textContent.trim());
  rec('calculator updates total when options change', totalBefore !== totalAfter, `${totalBefore} -> ${totalAfter}`);
  // coupon
  await page.type('#calc-coupon-input', 'SPRING20');
  await page.click('#calc-coupon-btn');
  await page.waitForFunction(() => (document.getElementById('calc-coupon-msg')?.textContent || '').length > 0, { timeout: 30000 });
  const couponMsg = await page.$eval('#calc-coupon-msg', (el) => el.textContent.trim());
  rec('coupon applies from the UI', /applied|success/i.test(couponMsg), couponMsg.slice(0, 80));
  shots.push(await shot(page, 'calculator'));

  await page.click('#calc-book-btn');
  await page.waitForSelector('#anon-book-modal.active', { timeout: 10000 });
  rec('booking opens confirmation modal for new visitor', true);
  const estimate = await page.$eval('.anon-estimate-pill', (el) => el.textContent.trim());
  shots.push(await shot(page, 'booking-modal'));
  const phone = '0700' + String(100000 + Math.floor(Math.random() * 899999));
  await page.type('#anon-name', 'UX Test Visitor');
  await page.type('#anon-phone', phone);
  await page.type('#anon-address', 'Runda, Nairobi');
  rec('booking form asks for three fields only (no PIN up front)', (await page.$('#anon-pin')) === null);
  await page.click('#anon-submit-btn');
  await page.waitForSelector('#anon-success', { visible: true, timeout: 20000 })
    .then(() => rec('booking request sent and success panel shown', true))
    .catch(async () => rec('booking request sent and success panel shown', false, await page.$eval('#portal-toast-container', (e) => e.textContent).catch(() => 'no toast')));
  const successText = await page.$eval('#anon-success', (e) => e.innerText).catch(() => '');
  const trackHref = await page.$eval('#anon-track-link', (e) => e.getAttribute('href')).catch(() => '');
  rec('success panel offers tracking link and optional PIN setup', /Track my request/.test(successText) && /PIN/.test(successText) && /^\/tracker\/wo_/.test(trackHref), `${trackHref}`);
  shots.push(await shot(page, 'booking-success'));

  // Optional PIN setup straight from the success panel, prefilled from the booking.
  await page.click('#anon-create-pin');
  await page.waitForSelector('#client-register-container', { visible: true, timeout: 10000 });
  const regPrefill = await page.evaluate(() => ({ name: document.getElementById('reg-name').value, phone: document.getElementById('reg-phone').value, address: document.getElementById('reg-address').value, loginHidden: getComputedStyle(document.getElementById('client-login-form')).display === 'none' }));
  rec('PIN setup form prefilled from the booking', regPrefill.name === 'UX Test Visitor' && regPrefill.phone === phone && regPrefill.loginHidden, JSON.stringify(regPrefill));
  await page.type('#reg-pin', '2468');
  await page.click('#reg-submit-btn');
  await page.waitForFunction(() => document.body.classList.contains('hub-authenticated'), { timeout: 20000 })
    .then(() => rec('PIN saved and hub opens', true))
    .catch(async () => rec('PIN saved and hub opens', false, await page.$eval('#portal-toast-container', (e) => e.textContent).catch(() => 'no toast')));
  await new Promise((r) => setTimeout(r, 1200));
  const hubText = await page.evaluate(() => document.getElementById('personalized-dashboard')?.innerText || '');
  const invoiceAmountMatch = hubText.match(/Estimated\s*KSh\s*([\d,]+)/i);
  rec('hub shows the estimate awaiting confirmation (no pay button)', Boolean(invoiceAmountMatch) && /Estimate Pending|Awaiting Confirmation/.test(hubText) && !document_has_pay(hubText), `estimate "${estimate}" hub estimate ${invoiceAmountMatch?.[1] || 'n/a'}`);
  rec('hub greets the client by name', /Welcome back, UX/.test(hubText));
  shots.push(await shot(page, 'client-hub'));

  // pay page for that invoice
  const invoiceId = await page.evaluate(() => (document.querySelector('a[href^="/receipt/"]')?.getAttribute('href') || '').split('/').pop() || null);
  if (invoiceId) {
    await page.goto(`${BASE}/pay/${invoiceId}`, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => (document.getElementById('inv-num')?.textContent || '').startsWith('INV-'), { timeout: 10000 }).catch(() => {});
    const invNum = await page.$eval('#inv-num', (el) => el.textContent.trim()).catch(() => '');
    const bal = await page.$eval('#inv-balance', (el) => el.textContent.trim()).catch(() => '');
    const prefilled = await page.$eval('#mpesa-phone', (el) => el.value).catch(() => '');
    const payDisabled = await page.$eval('#submit-mpesa-btn', (el) => el.disabled).catch(() => false);
    rec('pay page renders estimate, prefills phone, and blocks payment until confirmed', invNum.startsWith('INV-') && bal.includes('estimate') && prefilled.length > 6 && payDisabled, `${invNum} ${bal} phone=${prefilled} disabled=${payDisabled}`);
    shots.push(await shot(page, 'pay-page'));
    await page.goto(`${BASE}/receipt/${invoiceId}`, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 800));
    const badge = await page.$eval('#r-paid-badge', (el) => el.textContent.trim()).catch(() => '');
    const docTitle = await page.$eval('.doc-title', (el) => el.textContent.trim()).catch(() => '');
    rec('receipt page renders the estimate as ESTIMATE', /ESTIMATE/.test(badge) && /ESTIMATE/.test(docTitle), `${docTitle} / ${badge}`);
    shots.push(await shot(page, 'receipt-unpaid'));
  } else {
    rec('pay page renders invoice and prefills phone', false, 'no invoice id in hub');
  }

  // tracker page for the new (not yet dispatched) order
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => document.body.classList.contains('hub-authenticated'), { timeout: 15000 }).catch(() => {});
  const trackerHref = await page.evaluate(() => document.querySelector('a[href^="/tracker/"]')?.getAttribute('href') || '');
  if (trackerHref) {
    await page.goto(BASE + trackerHref, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => !/Loading/.test(document.getElementById('tracker-status-text')?.textContent || ''), { timeout: 15000 }).catch(() => {});
    const t = await page.evaluate(() => ({
      status: document.getElementById('tracker-status-text')?.textContent.trim(),
      contactVisible: getComputedStyle(document.getElementById('crew-contact-row')).display !== 'none',
      crewPins: document.querySelectorAll('.custom-crew-pin').length,
      tasks: document.querySelectorAll('#tracker-checklist .task-item').length,
      counter: document.getElementById('checklist-counter')?.textContent.trim(),
    }));
    rec('tracker: new request shows honest state (awaiting confirmation, no fake crew/phone)', t.status === 'Awaiting Confirmation' && !t.contactVisible && t.crewPins === 0, JSON.stringify(t));
    rec('tracker: checklist rendered from the order', t.tasks === 5 && /0 of 5/.test(t.counter || ''), `${t.tasks} tasks, ${t.counter}`);
    shots.push(await shot(page, 'tracker'));
  } else {
    rec('tracker: link present in hub', false, 'no tracker link');
  }


  // returning visitor: hub persists across reload within the session
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => document.body.classList.contains('hub-authenticated'), { timeout: 15000 })
    .then(() => rec('returning visitor is recognised on reload (same session)', true))
    .catch(() => rec('returning visitor is recognised on reload (same session)', false));

  // sign out
  await page.click('#switch-account-btn').catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));
  await page.waitForFunction(() => !document.body.classList.contains('hub-authenticated'), { timeout: 10000 })
    .then(() => rec('switch account signs out cleanly', true))
    .catch(() => rec('switch account signs out cleanly', false));

  // legacy /login (signed out) redirects into the hub sign-in modal
  await page.goto(BASE + '/login', { waitUntil: 'networkidle2' });
  await page.waitForSelector('#client-access-modal.active', { timeout: 15000 })
    .then(() => rec('/login opens the Client Hub sign-in', /client_portal=open/.test(page.url())))
    .catch(() => rec('/login opens the Client Hub sign-in', false, page.url()));
  await page.click('#close-login-modal').catch(() => {});

  // hub login modal with wrong PIN then right PIN
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await page.click('.client-access-trigger');
  await page.waitForSelector('#client-access-modal.active', { timeout: 10000 });
  await page.type('#client-identifier-input', phone);
  await page.type('#client-pin-input', '0000');
  await page.click('#client-access-modal button[type="submit"]');
  await new Promise((r) => setTimeout(r, 1500));
  const wrongPinShown = await page.evaluate(() => /incorrect|pin/i.test(document.getElementById('client-access-modal')?.innerText || ''));
  rec('login modal explains a wrong PIN', wrongPinShown);
  shots.push(await shot(page, 'login-wrong-pin'));
  await page.$eval('#client-pin-input', (el) => { el.value = ''; });
  await page.type('#client-pin-input', '2468');
  await page.click('#client-access-modal button[type="submit"]');
  await page.waitForFunction(() => document.body.classList.contains('hub-authenticated'), { timeout: 15000 })
    .then(() => rec('login with correct PIN opens hub', true))
    .catch(() => rec('login with correct PIN opens hub', false));

  // ---- Other pages: console errors ----
  for (const p of ['/services', '/calculator', '/service-area', '/contact', '/about', '/login']) {
    await page.goto(BASE + p, { waitUntil: 'networkidle2', timeout: 60000 });
    const ok = await page.evaluate(() => document.querySelector('main, section, .page-hero, h1') !== null);
    rec(`page ${p} renders content`, ok);
  }
  shots.push(await shot(page, 'services'));

  // ---- Installed app (PWA) mode ----
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.evaluate(() => { try { sessionStorage.clear(); localStorage.removeItem('lawncraft_client_identifier'); } catch {} });
  await page.goto(BASE + '/?source=pwa', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 800));
  const pwa = await page.evaluate(() => ({
    htmlPwa: document.documentElement.classList.contains('pwa'),
    tiles: document.querySelectorAll('.app-tile').length,
    tabbar: Boolean(document.querySelector('.app-tabbar')),
    cookieVisible: Boolean(document.getElementById('cookie-consent')) && getComputedStyle(document.getElementById('cookie-consent')).display !== 'none',
    heroMarketingHidden: getComputedStyle(document.querySelector('.hero-trust-badges') || document.body).display === 'none',
    ctaHidden: getComputedStyle(document.querySelector('.btn-quote-cta')).display === 'none',
  }));
  rec('installed app opens on an app home with tiles, tab bar, no cookie bar', pwa.htmlPwa && pwa.tiles >= 5 && pwa.tabbar && !pwa.cookieVisible && pwa.ctaHidden, JSON.stringify(pwa));
  shots.push(await shot(page, 'pwa-home'));
  await page.click('#app-tile-hub');
  await page.waitForSelector('#client-access-modal.active', { timeout: 10000 })
    .then(() => rec('app home "My Lawn" tile opens sign-in', true))
    .catch(() => rec('app home "My Lawn" tile opens sign-in', false));
  await page.click('#close-login-modal').catch(() => {});
  await page.evaluate(() => { try { sessionStorage.removeItem('lc_pwa'); } catch {} });

  // ---- Mobile web ----
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  rec('mobile: no horizontal overflow', overflow <= 1, `overflow ${overflow}px`);
  const hasMenu = await page.$('.menu-toggle, .hamburger, [aria-label*="menu" i], .nav-toggle');
  rec('mobile: navigation toggle present', Boolean(hasMenu));
  shots.push(await shot(page, 'home-mobile'));
  await page.evaluate(() => document.getElementById('instant-calculator')?.scrollIntoView());
  await new Promise((r) => setTimeout(r, 500));
  shots.push(await shot(page, 'calculator-mobile'));

  rec('no console errors across the walkthrough', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | '));
  rec('no failed network requests (excluding weather API)', failedRequests.length === 0, failedRequests.slice(0, 5).join(' | '));
} catch (err) {
  rec('walkthrough completed without exception', false, err.message);
} finally {
  await browser.close();
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed against ${BASE}`);
console.log('screenshots:', shots.join(', '));
