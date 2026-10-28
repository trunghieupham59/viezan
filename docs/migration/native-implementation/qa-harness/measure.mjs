import { chromium } from '/Users/phamtrunghieu/Github/personal/viezan/node_modules/playwright/index.mjs';
import { openPrototype } from './prototype.mjs';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
await openPrototype(page);
for (const mode of ['light','dark']) {
  if (mode==='dark') { await page.click('#mode'); await page.waitForTimeout(300); }
  await page.click('#nav [data-page="home"]'); await page.waitForTimeout(300);
  const m = await page.evaluate(() => {
    const pick = (e) => { if (!e) return null; const b=e.getBoundingClientRect(), c=getComputedStyle(e); return {y:Math.round(b.y), h:Math.round(b.height), w:Math.round(b.width), fs:c.fontSize, fw:c.fontWeight, color:c.color, bg:c.backgroundColor, border:c.borderColor+' '+c.borderWidth, r:c.borderRadius}; };
    const q = s => document.querySelector(s);
    const btns=[...document.querySelectorAll('#nav button')];
    const svg = btns[1]?.querySelector('svg');
    return { navInactive: pick(btns[1]), navActive: pick(q('#nav button.active')), navIcon: svg ? getComputedStyle(svg).color : null, aside: pick(q('aside')), header: pick(q('header')), brand: pick(q('.brand')||q('aside h1')), search: pick(q('aside .search')||q('aside button')), group: pick(q('#nav .group')), app: pick(q('#app')), main: pick(q('main')), card: pick(q('.card')), primary: pick(q('.primary')), outline: pick(q('#content button:not(.primary)')) };
  });
  console.log(mode, JSON.stringify(m));
}
await browser.close();
