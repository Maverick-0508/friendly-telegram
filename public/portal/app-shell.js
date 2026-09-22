// Installed-app (PWA) shell. When the site runs standalone we behave like an
// app rather than a brochure: a task-first home with large tiles, a compact
// header and a bottom tab bar (the pattern utility apps such as Kenya Power's
// MyPower use: account first, big actions, pay with M-Pesa, help one tap away).
import { state } from './state.js';
import { openClientAccessModal } from './access.js';

const SUPPORT_PHONE = '+254758827319';
const SUPPORT_WHATSAPP = 'https://wa.me/254758827319?text=' + encodeURIComponent('Hi Lawn Craft, I would like some help with my lawn.');

export function isPwaMode() {
  return document.documentElement.classList.contains('pwa');
}

/** Replace the marketing hero with an app home for visitors who are not signed in. */
export function renderAppHome() {
  if (!isPwaMode() || state.currentClientData) return;
  const hero = document.querySelector('#home .hero-content');
  if (!hero) return;

  document.body.classList.add('app-mode');
  if (!state.originalHeroHTML) state.originalHeroHTML = hero.innerHTML;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  hero.innerHTML = `
    <div class="app-home">
      <p class="app-home-greeting">${greeting}, welcome to Lawn Craft</p>
      <h1>What would you like to do?</h1>
      <div class="app-tiles">
        <button type="button" class="app-tile app-tile-primary" id="app-tile-hub">
          <i class="fa-solid fa-user-check" aria-hidden="true"></i>
          My Lawn
          <small>Estimates, bookings and bills</small>
        </button>
        <a href="#pricing-calculator" class="app-tile">
          <i class="fa-solid fa-calculator" aria-hidden="true"></i>
          Get a price
          <small>Estimate in seconds</small>
        </a>
        <a href="#services" class="app-tile">
          <i class="fa-solid fa-leaf" aria-hidden="true"></i>
          Services
          <small>Mowing, hedges, garden care</small>
        </a>
        <a href="#contact" class="app-tile">
          <i class="fa-solid fa-calendar-check" aria-hidden="true"></i>
          Request a visit
          <small>We call you back</small>
        </a>
        <a href="${SUPPORT_WHATSAPP}" target="_blank" rel="noopener" class="app-tile">
          <i class="fa-brands fa-whatsapp" aria-hidden="true"></i>
          WhatsApp us
          <small>Quick questions</small>
        </a>
        <a href="tel:${SUPPORT_PHONE}" class="app-tile">
          <i class="fa-solid fa-phone" aria-hidden="true"></i>
          Call us
          <small>Mon to Sat, 8am to 6pm</small>
        </a>
      </div>
    </div>
  `;

  document.getElementById('app-tile-hub')?.addEventListener('click', () => openClientAccessModal());
}

/** Bottom tab bar on every page while installed. */
export function renderAppTabbar() {
  if (!isPwaMode() || document.querySelector('.app-tabbar')) return;
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const tabs = [
    { href: '/', icon: 'fa-house', label: 'Home', active: path === '/' },
    { href: '/calculator', icon: 'fa-calculator', label: 'Price', active: path === '/calculator' },
    { href: '/?client_portal=open', icon: 'fa-user-check', label: 'My Lawn', active: false, id: 'app-tab-hub' },
    { href: '/services', icon: 'fa-leaf', label: 'Services', active: path === '/services' },
    { href: '/contact', icon: 'fa-headset', label: 'Help', active: path === '/contact' },
  ];
  const nav = document.createElement('nav');
  nav.className = 'app-tabbar';
  nav.setAttribute('aria-label', 'App navigation');
  nav.innerHTML = tabs.map((t) => `
    <a href="${t.href}" class="${t.active ? 'is-active' : ''}"${t.id ? ` id="${t.id}"` : ''} aria-label="${t.label}">
      <i class="fa-solid ${t.icon}" aria-hidden="true"></i><span>${t.label}</span>
    </a>`).join('');
  document.body.appendChild(nav);

  // "My Lawn" opens the hub in place when we are already on the home page.
  document.getElementById('app-tab-hub')?.addEventListener('click', (e) => {
    if (path !== '/') return; // navigate to the home page with the hub prompt
    e.preventDefault();
    if (state.currentClientData) {
      document.getElementById('personalized-dashboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      openClientAccessModal();
    }
  });
}
