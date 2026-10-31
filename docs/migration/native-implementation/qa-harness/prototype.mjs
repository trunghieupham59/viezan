import { readFile } from 'node:fs/promises';

// Serve docs/migration/desktop-review straight from disk. python's http.server drops
// parallel requests, which left the prototype half-loaded (missing scripts/styles).
const root = new URL('../../desktop-review/', import.meta.url);
const types = { html: 'text/html', css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml', png: 'image/png', json: 'application/json' };

export async function openPrototype(page) {
  const failures = [];
  page.on('pageerror', e => failures.push(e.message));
  await page.route('http://prototype.test/**', async route => {
    const path = new URL(route.request().url()).pathname.slice(1) || 'index.html';
    try {
      route.fulfill({ body: await readFile(new URL(path, root)), contentType: types[path.split('.').pop()] ?? 'application/octet-stream' });
    } catch { route.fulfill({ status: 404 }); }
  });
  await page.goto('http://prototype.test/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const bar = await page.textContent('.reviewbar>span');
  if (!bar.includes('Review 18') || failures.length) throw new Error(`prototype did not load cleanly: ${bar} ${failures.join('; ')}`);
}
