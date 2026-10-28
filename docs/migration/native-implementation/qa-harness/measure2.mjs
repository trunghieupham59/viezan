import { chromium } from '/Users/phamtrunghieu/Github/personal/viezan/node_modules/playwright/index.mjs';
import { openPrototype } from './prototype.mjs';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
await openPrototype(page);
for (const p of process.argv.slice(2)) {
  await page.click(`#nav [data-page="${p}"]`); await page.waitForTimeout(300);
  const rows = await page.evaluate(() => {
    const main = document.querySelector('#content'); const mb = main.getBoundingClientRect();
    const out = [];
    for (const e of main.querySelectorAll('h1,h2,h3,p,small,b,strong,button,input,textarea,label,.card,section,li,span')) {
      const b = e.getBoundingClientRect(); if (!b.width || !b.height) continue;
      const c = getComputedStyle(e);
      const txt = (e.childNodes.length && [...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(' ').slice(0,30)) || '';
      if (!txt && !['BUTTON','INPUT','TEXTAREA'].includes(e.tagName) && !e.classList.contains('card')) continue;
      out.push(`${e.tagName.toLowerCase()}${e.className?'.'+String(e.className).split(' ')[0]:''} x${Math.round(b.x-mb.x)} y${Math.round(b.y-mb.y)} w${Math.round(b.width)} h${Math.round(b.height)} fs${c.fontSize} fw${c.fontWeight} r${c.borderRadius} "${txt}"`);
    }
    return out.slice(0, 60);
  });
  console.log('== '+p); console.log(rows.join('\n'));
}
await browser.close();
