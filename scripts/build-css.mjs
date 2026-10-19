// Minifies and content-hashes the site stylesheets into public/dist/ so the
// production pages can be served from immutable, cache-friendly URLs.
//
//   npm run build:css          # writes public/dist/*.min.css + manifest.json
//   npm run build:css:check    # CI: fails if the dist output is stale/missing
//
// The minifier is intentionally dependency-free: a conservative, token-safe
// whitespace/comment pass (it never rewrites selectors or values), so it cannot
// silently change rendering.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const OUT_DIR = path.join(PUBLIC_DIR, 'dist');

const INPUTS = [
  { name: 'styles', file: 'styles.css' },
  { name: 'dashboard', file: 'dashboard.css' },
];

const CHECK = process.argv.includes('--check');

/** Conservative CSS minifier: strips comments and collapses safe whitespace. */
function minify(css) {
  return css
    // Remove comments (but never the contents of url() or strings).
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Collapse runs of whitespace to a single space.
    .replace(/\s+/g, ' ')
    // Drop spaces around structural punctuation.
    .replace(/\s*([{}:;,>~+])\s*/g, '$1')
    // Remove the last semicolon before a closing brace.
    .replace(/;}/g, '}')
    // Tidy any leftover space before !important.
    .replace(/\s*!important/g, '!important')
    .trim();
}

function hash(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 10);
}

const manifest = {};
let changed = false;

for (const { name, file } of INPUTS) {
  const srcPath = path.join(PUBLIC_DIR, file);
  if (!fs.existsSync(srcPath)) {
    console.error(`[build:css] Missing source: ${srcPath}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(srcPath, 'utf8');
  const min = minify(raw);
  const digest = hash(min);
  const outName = `${name}.${digest}.min.css`;
  const outPath = path.join(OUT_DIR, outName);
  manifest[name] = {
    source: `/${file}`,
    output: `/dist/${outName}`,
    bytes: Buffer.byteLength(min),
    hash: digest,
  };

  if (!fs.existsSync(outPath)) changed = true;
}

if (CHECK) {
  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  let stale = false;
  for (const { name } of INPUTS) {
    const expected = manifest[name];
    const outPath = path.join(OUT_DIR, path.basename(expected.output));
    if (!fs.existsSync(outPath)) {
      console.error(`[build:css:check] Missing build artefact: ${expected.output}`);
      stale = true;
    }
  }
  if (!fs.existsSync(manifestPath)) {
    console.error('[build:css:check] Missing public/dist/manifest.json — run npm run build:css');
    stale = true;
  } else {
    const onDisk = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    for (const { name } of INPUTS) {
      if (onDisk[name]?.hash !== manifest[name].hash) {
        console.error(`[build:css:check] ${name} is stale — run npm run build:css`);
        stale = true;
      }
    }
  }
  if (stale) process.exit(1);
  console.log('CSS build artefacts are up to date.');
  process.exit(0);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

// Prune previous hashed files for these bundles so dist stays tidy.
for (const entry of fs.readdirSync(OUT_DIR)) {
  if (/^(styles|dashboard)\.[0-9a-f]+\.min\.css$/.test(entry)) {
    const known = Object.values(manifest).some((m) => path.basename(m.output) === entry);
    if (!known) fs.rmSync(path.join(OUT_DIR, entry));
  }
}

for (const { name, file } of INPUTS) {
  const raw = fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8');
  const min = minify(raw);
  fs.writeFileSync(path.join(OUT_DIR, path.basename(manifest[name].output)), min);
}

fs.writeFileSync(
  path.join(OUT_DIR, 'manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);

for (const [name, meta] of Object.entries(manifest)) {
  console.log(`  ${name.padEnd(10)} ${meta.source} -> ${meta.output}  (${meta.bytes} bytes)`);
}
console.log(changed ? 'CSS built.' : 'CSS rebuilt (no hash change).');
