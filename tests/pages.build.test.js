// The public/*.html pages are generated from src/pages + src/partials. This
// test fails when someone edits a generated page directly (or edits a source
// without rebuilding), so the two can never drift apart.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildAll, renderPage } from '../scripts/build-pages.mjs';

test('generated pages are up to date with src/pages and src/partials', () => {
  const { stale } = buildAll({ check: true });
  assert.deepEqual(stale, [], `stale pages: ${stale.join(', ')} — run \`npm run build:pages\``);
});

test('every generated page has exactly one header, footer and script bundle', () => {
  const dir = path.resolve('src/pages');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.html'))) {
    const html = renderPage(file.replace(/\.html$/, ''), fs.readFileSync(path.join(dir, file), 'utf8'));
    assert.equal((html.match(/<header id="main-header">/g) || []).length, 1, `${file}: header`);
    assert.equal((html.match(/<footer class="footer"/g) || []).length, 1, `${file}: footer`);
    assert.equal((html.match(/<script src="\/portal\.js">/g) || []).length, 1, `${file}: portal script`);
    assert.equal((html.match(/<script src="\/script\.js">/g) || []).length, 1, `${file}: main script`);
    assert.equal(/data-nav=/.test(html), false, `${file}: data-nav markers must be stripped`);
    assert.equal(/<!--\s*@(include|if|else|endif|page)/.test(html), false, `${file}: unrendered directive`);
  }
});

test('active navigation link matches the page', () => {
  const services = renderPage('services', fs.readFileSync(path.resolve('src/pages/services.html'), 'utf8'));
  assert.match(services, /<a href="\/services" class="active">Services<\/a>/);
  assert.doesNotMatch(services, /<a href="\/" class="active">Home<\/a>/);
  const home = renderPage('index', fs.readFileSync(path.resolve('src/pages/index.html'), 'utf8'));
  assert.match(home, /<a href="#home" class="active">Home<\/a>/, 'home page uses in-page anchors');
  assert.match(home, /href="#contact" class="btn-quote-cta"/);
});
