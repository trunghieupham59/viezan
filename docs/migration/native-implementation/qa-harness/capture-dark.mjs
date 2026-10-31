import { chromium } from '/Users/phamtrunghieu/Github/personal/viezan/node_modules/playwright/index.mjs';
import { openPrototype } from './prototype.mjs';

const out = process.argv[2];
const pages = ['home','chat','translate','interpret','dictionary','everywhere','apps','thermal','utilities','settings'];
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 920 }, deviceScaleFactor: 2 });
await openPrototype(page);
await page.click('#mode'); await page.waitForTimeout(300);
for (const p of pages) { await page.click(`#nav [data-page="${p}"]`); await page.waitForTimeout(300); await (await page.$('#app')).screenshot({ path: `${out}/dark-${p}.png` }); }
await page.click('#mode'); await page.waitForTimeout(300);
for (const p of pages) { await page.click(`#nav [data-page="${p}"]`); await page.waitForTimeout(300); await (await page.$('#app')).screenshot({ path: `${out}/light-${p}.png` }); }
// measurements
const m = await page.evaluate(() => {
  const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return {x:b.x,y:b.y,w:b.width,h:b.height,font:cs.fontSize,weight:cs.fontWeight,bg:cs.backgroundColor,color:cs.color,radius:cs.borderRadius}; };
  return { app: r('#app'), nav: r('#nav'), navBtn: r('#nav button'), navActive: r('#nav button.active'), title: r('#page-title'), section: r('#section'), sidebar: r('aside') || r('.sidebar'), header: r('header') || r('.topbar'), content: r('#content'), h1: r('#content h1'), body: r('body') };
});
console.log(JSON.stringify(m, null, 1));
await browser.close();
