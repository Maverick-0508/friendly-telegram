// Client sign-in is the PIN-protected Client Hub (see portal.js). This shim
// keeps old bookmarks and links working: /login and /signup open the hub, and
// any session left by the earlier email/password prototype is cleared.
(function () {
  'use strict';

  try {
    localStorage.removeItem('lawncraft_access_token');
    localStorage.removeItem('lawncraft_user');
  } catch {}

  const path = window.location.pathname.replace(/\.html$/, '');
  if (path === '/login' || path === '/signup') {
    window.location.replace('/?client_portal=open');
    return;
  }

  function setCurrentYear() {
    const el = document.getElementById('currentYear');
    if (el) el.textContent = new Date().getFullYear();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setCurrentYear);
  } else {
    setCurrentYear();
  }
})();
