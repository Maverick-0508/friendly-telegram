/**
 * Lawn Craft – Frontend API Configuration
 *
 * Set the two variables below to point the frontend at your deployed backend.
 *
 * Usage
 * -----
 * 1. Replace the placeholder URL with your actual backend base URL (no trailing slash).
 * 2. This file is loaded automatically before script.js / dashboard.js on every page.
 *
 * Variable reference
 * ------------------
 *   window.LAWNCRAFT_API_BASE   – used by script.js  (contact form, maps, etc.)
 *   window.DASHBOARD_API_BASE   – used by dashboard.js (supervisor dashboard)
 *
 * Examples
 * --------
 *   Production (separate backend host):
 *     window.LAWNCRAFT_API_BASE  = 'https://api.lawncraft.com/api';
 *     window.DASHBOARD_API_BASE  = 'https://api.lawncraft.com/api';
 *
 *   Local development (frontend on :8080, backend on :8000):
 *     window.LAWNCRAFT_API_BASE  = 'http://127.0.0.1:8000/api';
 *     window.DASHBOARD_API_BASE  = 'http://127.0.0.1:8000/api';
 *
 * Leave both variables undefined (or remove the assignments) to fall back to the
 * auto-detection logic already built into script.js / dashboard.js, which resolves
 * to '/api' on same-origin deployments and 'http://127.0.0.1:8000/api' when the
 * page is served from a different local port or via file://.
 */

// Uncomment and edit the lines below when your backend runs on a different host:
// window.LAWNCRAFT_API_BASE = 'https://your-backend-url.example.com/api';
// window.DASHBOARD_API_BASE = 'https://your-backend-url.example.com/api';
