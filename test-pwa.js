const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, 'frontend');
const mime = { json: 'application/json', js: 'application/javascript', svg: 'image/svg+xml', html: 'text/html', css: 'text/css', png: 'image/png' };

function serve(res, file) {
  const ext = path.extname(file).slice(1);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('NOT_FOUND'); }
    else { res.writeHead(200, { 'Content-Type': mime[ext] || 'text/plain', 'Service-Worker-Allowed': '/' }); res.end(data); }
  });
}

const rewrites = {
  '/': 'index.html', '/about': 'about.html', '/contact': 'contact.html',
  '/insights': 'insights.html', '/process': 'process.html', '/privacy-policy': 'privacy-policy.html',
  '/service-area': 'service-area.html', '/services': 'services.html',
  '/login': 'login.html', '/signup': 'signup.html',
  '/manifest.json': 'manifest.json', '/sw.js': 'sw.js', '/offline.html': 'offline.html',
};

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const file = rewrites[url];
  if (file) { serve(res, path.join(BASE, file)); return; }
  if (url.startsWith('/assets/')) { serve(res, path.join(BASE, url.slice(1))); return; }
  if (url.startsWith('/styles.css')) { serve(res, path.join(BASE, 'styles.css')); return; }
  if (url.startsWith('/script.js')) { serve(res, path.join(BASE, 'script.js')); return; }
  if (url.startsWith('/auth.js')) { serve(res, path.join(BASE, 'auth.js')); return; }
  // 404 catch-all
  serve(res, path.join(BASE, '404.html'));
});

const TESTS = [
  { path: '/', expect: 'Lawn Craft', name: 'GET /' },
  { path: '/about', expect: 'About Us', name: 'GET /about' },
  { path: '/contact', expect: 'Contact', name: 'GET /contact' },
  { path: '/services', expect: 'Services', name: 'GET /services' },
  { path: '/insights', expect: 'Insights', name: 'GET /insights' },
  { path: '/process', expect: 'Process', name: 'GET /process' },
  { path: '/service-area', expect: 'Service Area', name: 'GET /service-area' },
  { path: '/privacy-policy', expect: 'Privacy Policy', name: 'GET /privacy-policy' },
  { path: '/login', expect: 'Sign In', name: 'GET /login' },
  { path: '/signup', expect: 'Create Account', name: 'GET /signup' },
  { path: '/nonexistent', expect: 'Page Not Found', name: 'GET /nonexistent -> 404' },
  { path: '/manifest.json', expect: 'icons', name: 'GET /manifest.json' },
  { path: '/sw.js', expect: 'CACHE', name: 'GET /sw.js' },
];

server.listen(8888, () => {
  console.log('Clean URL test\n');
  let done = 0, passed = 0;
  TESTS.forEach(t => {
    http.get('http://localhost:8888' + t.path, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const ok = res.statusCode === 200 && data.includes(t.expect);
        if (ok) passed++;
        console.log(`${ok ? 'PASS' : 'FAIL'} ${t.name} (${res.statusCode}, ${data.includes(t.expect) ? 'content OK' : 'content MISS'})`);
        done++;
        if (done === TESTS.length) {
          console.log(`\n${passed}/${TESTS.length} passed`);
          server.close();
        }
      });
    });
  });
});
