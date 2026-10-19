// Guards the design system: semantic tokens stay defined, brand colour
// literals never leak back into rules (they must go through var(--token)), and
// both stylesheets keep honouring the user's reduced-motion preference.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const styles = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../public/dashboard.css', import.meta.url), 'utf8');

const REQUIRED_TOKENS = [
  '--brand:', '--brand-dark:', '--brand-bright:', '--brand-glow:',
  '--ink:', '--surface:', '--surface-3:', '--slate-border:', '--slate-strong:',
  '--slate-muted:', '--slate-faint:', '--brand-soft:', '--danger-strong:',
];

// Brand literals that must only ever appear as custom-property definitions.
const BRAND_HEXES = ['#15803d', '#16a34a', '#22c55e'];

test('semantic design tokens are defined in :root', () => {
  for (const token of REQUIRED_TOKENS) {
    assert.ok(styles.includes(token), `missing design token ${token}`);
  }
});

test('brand colour literals only appear as token definitions', () => {
  const offenders = styles
    .split('\n')
    .filter((line) => BRAND_HEXES.some((hex) => line.includes(hex)) && !/^\s*--[\w-]+\s*:/.test(line));
  assert.deepEqual(
    offenders,
    [],
    `brand hex used directly instead of var(--token): ${offenders.join(' | ')}`,
  );
});

test('reduced-motion preference is honoured in both stylesheets', () => {
  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, 'styles.css');
  assert.match(dashboard, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, 'dashboard.css');
});
