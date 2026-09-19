#!/usr/bin/env node
// Assemble public/*.html from src/pages/*.html + src/partials/*.html.
//
//   node scripts/build-pages.mjs          # write public/<page>.html
//   node scripts/build-pages.mjs --check  # exit 1 if any public page is stale
//
// Page source format:
//   <!-- @page nav="services" home="false" -->   (first line; nav marks the
//                                                 active link, home switches
//                                                 the header to in-page anchors)
//   ...full HTML with:
//   <!-- @include head-assets -->   shared <head> links/meta
//   <!-- @include header -->        site header + mega menu
//   <!-- @include footer -->        site footer
//   <!-- @include scripts -->       standard trailing scripts
//
// Partials may use {{var}} substitutions and
//   <!-- @if flag --> ... <!-- @else --> ... <!-- @endif -->
// blocks keyed on page config values ("true"/"false").
//
// The output is committed: Vercel's legacy `builds` config does not run npm
// scripts, and plain static files stay cacheable. A test keeps them in sync.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES_DIR = path.join(ROOT, 'src', 'pages');
const PARTIALS_DIR = path.join(ROOT, 'src', 'partials');
const OUT_DIR = path.join(ROOT, 'public');

const partials = Object.fromEntries(
  fs.readdirSync(PARTIALS_DIR)
    .filter((f) => f.endsWith('.html'))
    .map((f) => [f.replace(/\.html$/, ''), fs.readFileSync(path.join(PARTIALS_DIR, f), 'utf8').replace(/\r\n/g, '\n')])
);

function parseConfig(source) {
  const m = source.match(/^\s*<!--\s*@page\s+([^>]*?)-->\s*\n?/);
  const config = { nav: '', home: 'false' };
  if (m) {
    for (const kv of m[1].matchAll(/(\w+)="([^"]*)"/g)) config[kv[1]] = kv[2];
    source = source.slice(m[0].length);
  }
  config.quote_href = config.home === 'true' ? '#contact' : '/contact';
  return { config, body: source };
}

function renderConditionals(text, config) {
  return text.replace(
    /<!--\s*@if\s+(\w+)\s*-->\n?([\s\S]*?)(?:<!--\s*@else\s*-->\n?([\s\S]*?))?<!--\s*@endif\s*-->\n?/g,
    (_, flag, yes, no = '') => (String(config[flag]) === 'true' ? yes : no)
  );
}

function substitute(text, config) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => (key in config ? String(config[key]) : ''));
}

function markActive(text, nav) {
  // Add class="active" to any element carrying data-nav="<nav>", then drop
  // the data-nav markers from the output.
  return text
    .replace(/<a ([^>]*?)data-nav="([^"]+)"([^>]*)>/g, (m, before, key, after) => {
      const attrs = `${before}${after}`.replace(/\s{2,}/g, ' ').trim();
      if (key !== nav) return `<a ${attrs}>`;
      if (/class="/.test(attrs)) return `<a ${attrs.replace(/class="([^"]*)"/, 'class="$1 active"')}>`;
      return `<a ${attrs} class="active">`;
    });
}

export function renderPage(name, source) {
  const { config, body } = parseConfig(source.replace(/\r\n/g, '\n'));
  let html = body.replace(/^([ \t]*)<!--\s*@include\s+([\w-]+)\s*-->[ \t]*\n?/gm, (_, indent, partial) => {
    if (!(partial in partials)) throw new Error(`${name}: unknown partial "${partial}"`);
    let block = partials[partial];
    block = renderConditionals(block, config);
    block = substitute(block, config);
    return block.endsWith('\n') ? block : block + '\n';
  });
  html = markActive(html, config.nav);
  const banner = `<!-- Generated from src/pages/${name}.html by scripts/build-pages.mjs. Do not edit directly: edit the source and run \`npm run build:pages\`. -->\n`;
  html = html.replace(/^(<!DOCTYPE html>\s*\n)/i, `$1${banner}`);
  return html;
}

export function buildAll({ check = false } = {}) {
  const stale = [];
  const written = [];
  for (const file of fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith('.html')).sort()) {
    const name = file.replace(/\.html$/, '');
    const out = renderPage(name, fs.readFileSync(path.join(PAGES_DIR, file), 'utf8'));
    const target = path.join(OUT_DIR, file);
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') : null;
    if (current === out) continue;
    if (check) stale.push(name);
    else { fs.writeFileSync(target, out); written.push(name); }
  }
  return { stale, written };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const { stale, written } = buildAll({ check });
  if (check) {
    if (stale.length) {
      console.error(`Stale generated pages (run \`npm run build:pages\`): ${stale.join(', ')}`);
      process.exit(1);
    }
    console.log('All generated pages are up to date.');
  } else {
    console.log(written.length ? `Wrote: ${written.join(', ')}` : 'No changes.');
  }
}
