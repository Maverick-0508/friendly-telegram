#!/usr/bin/env node
// One-off refactoring tool: splits the monolithic IIFE portal.js into ES
// modules under public/portal/ plus a thin public/portal.js entry.
//
//   git show <rev>:public/portal.js > .tmp-portal-src.js
//   node scripts/split-portal.mjs .tmp-portal-src.js
//
// Kept in the repo for reference; the generated modules are now the source
// of truth and are edited directly.
import fs from 'node:fs';

const srcPath = process.argv[2];
if (!srcPath) { console.error('usage: node scripts/split-portal.mjs <monolithic-portal.js>'); process.exit(2); }
const src = fs.readFileSync(srcPath, 'utf8').replace(/\r\n/g, '\n').split('\n');

// --- locate top-level functions (IIFE body is indented two spaces) ---
const fnStarts = [];
src.forEach((l, i) => { const m = l.match(/^  (?:async )?function (\w+)\(/); if (m) fnStarts.push({ name: m[1], start: i }); });
const tailStart = src.findIndex((l, i) => i > fnStarts.at(-1).start && /^  \/\/ Expose global methods/.test(l));
if (tailStart < 0) throw new Error('tail marker not found');
const fns = {};
fnStarts.forEach((f, i) => {
  const end = i + 1 < fnStarts.length ? fnStarts[i + 1].start : tailStart;
  let lines = src.slice(f.start, end);
  // shared-state declarations that sat between functions move into state.js
  lines = lines.filter((l) => !/^\s*let (originalHeroHTML|lastLookupError) = null;\s*$/.test(l));
  lines = lines.filter((l) => !/^\s*\/\/ Stored state\s*$/.test(l));
  fns[f.name] = lines;
});

const wmoStart = src.findIndex((l) => /const WMO_TEXT = \{/.test(l));
const wmoEnd = src.findIndex((l, i) => i > wmoStart && /^  \};\s*$/.test(l));
const wmo = src.slice(wmoStart, wmoEnd + 1);

const GROUPS = {
  state: ['getQueryIdentifier', 'getStoredIdentifier', 'setStoredIdentifier', 'getStoredPin', 'setStoredPin', 'esc', 'firstName', 'clearStoredIdentifier', 'showToast'],
  api: ['fetchClientProfile'],
  weather: ['fetchNairobiYardConditions'],
  hub: ['updateTopNavUser', 'renderPersonalizedState', 'refreshCurrentClient', 'handleLogout'],
  payments: ['openMpesaModal'],
  access: ['openClientAccessModal'],
  calculator: ['initPricingCalculator', 'openAnonymousBookingModal'],
  entry: ['initClientNavTriggers', 'promptForHub', 'init'],
};
const owner = {};
for (const [mod, names] of Object.entries(GROUPS)) for (const n of names) owner[n] = mod;
for (const n of Object.keys(fns)) if (!owner[n]) throw new Error(`unassigned function: ${n}`);
const STATE_VARS = ['currentClientData', 'originalHeroHTML', 'lastLookupError', 'onboardingUnsub'];

const dedent = (lines) => lines.map((l) => (l.startsWith('  ') ? l.slice(2) : l));
function rewriteState(text) {
  for (const v of STATE_VARS) text = text.replace(new RegExp(`(?<![\\w.$])${v}\\b`, 'g'), `state.${v}`);
  return text;
}
const exportify = (lines) => lines.map((l) => l.replace(/^(async )?function (\w+)\(/, (m, a, n) => `export ${a || ''}function ${n}(`));

function importsFor(mod, text, prefix = './') {
  const byModule = {};
  for (const [name, m] of Object.entries(owner)) {
    if (m === mod) continue;
    if (new RegExp(`\\b${name}\\b`).test(text)) (byModule[m] ||= []).push(name);
  }
  if (/\bstate\./.test(text)) (byModule.state ||= []).unshift('state');
  return Object.entries(byModule)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([m, names]) => `import { ${names.join(', ')} } from '${prefix}${m}.js';`);
}

const HEADERS = {
  state: `// Shared client-side state and small helpers for the Lawn Craft client hub.
const STORAGE_KEY = 'lawncraft_client_identifier';
const STORAGE_KEY_PIN = 'lawncraft_client_pin';

// Mutable state shared across the hub modules.
export const state = {
  currentClientData: null,
  originalHeroHTML: null,
  lastLookupError: null,
  onboardingUnsub: null,
};
`,
  api: '// Calls to the Lawn Craft backend used by the client hub.\n',
  weather: `// Live Nairobi weather for the Yard Conditions widget (keyless Open-Meteo).\n\n// WMO weather codes -> short human labels\n${dedent(wmo).join('\n')}\n`,
  hub: '// Personalised client hub: header state, dashboard rendering, refresh and sign-out.\n',
  payments: '// Lipa Na M-Pesa STK push modal and payment status polling.\n',
  access: '// Client Hub sign-in / registration modal.\n',
  calculator: '// Instant pricing calculator and the booking-request modal for new visitors.\n',
};

const out = {};
for (const [mod, names] of Object.entries(GROUPS)) {
  let body = names.map((n) => exportify(dedent(fns[n])).join('\n')).join('\n');
  body = rewriteState(body);
  if (mod === 'payments') {
    // Break the hub <-> payments cycle: the caller passes what to do after payment.
    body = body.replace('export function openMpesaModal(invoiceId, amount, defaultPhone)', 'export function openMpesaModal(invoiceId, amount, defaultPhone, { onPaid } = {})');
    if (!/refreshCurrentClient\(\);/.test(body)) throw new Error('payments: refreshCurrentClient call not found');
    body = body.replace(/^(\s*)refreshCurrentClient\(\);/m, "$1if (typeof onPaid === 'function') onPaid();");
  }
  if (mod === 'hub') {
    let n = 0;
    body = body.replace(/openMpesaModal\(([\s\S]*?)\);/g, (m, args) => { n += 1; return `openMpesaModal(${args.trimEnd()}, { onPaid: refreshCurrentClient });`; });
    if (n < 1) throw new Error('hub: openMpesaModal call sites not found');
  }
  out[mod] = body;
}

// The entry keeps the tail (window.LawnCraftPortal + bootstrapping), minus the IIFE close.
const tail = dedent(src.slice(tailStart)).join('\n').replace(/\n\}\)\(\);\s*$/, '\n');
out.entry = rewriteState(out.entry + '\n' + tail);

fs.mkdirSync('public/portal', { recursive: true });
for (const [mod, body] of Object.entries(out)) {
  if (mod === 'entry') continue;
  const imports = importsFor(mod, body);
  fs.writeFileSync(`public/portal/${mod}.js`, `${HEADERS[mod]}${imports.length ? imports.join('\n') + '\n' : ''}\n${body.trim()}\n`);
}
const entryImports = importsFor('entry', out.entry, './portal/');
fs.writeFileSync('public/portal.js', `// Lawn Craft Client Portal & Dynamic Personalization Engine (entry module).\n// Loaded with <script type="module">; feature code lives in /portal/*.js.\n${entryImports.join('\n')}\n\n${out.entry.trim()}\n`);

// sanity: no leftover bare references to shared state
for (const [mod, body] of Object.entries(out)) {
  for (const v of STATE_VARS) {
    const bare = body.match(new RegExp(`(?<![\\w.$])${v}\\b`, 'g'));
    if (bare) throw new Error(`${mod}: bare reference to ${v} remains`);
  }
}
console.log(Object.entries(out).map(([m, b]) => `${m.padEnd(11)} ${String(b.split('\n').length).padStart(4)} lines`).join('\n'));
