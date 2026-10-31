import { chromium } from '/Users/phamtrunghieu/Github/personal/viezan/node_modules/playwright/index.mjs';
import { openPrototype } from './prototype.mjs';

const [out, plat, mode = 'dark'] = process.argv.slice(2);
const pages = ['home','chat','translate','interpret','dictionary','everywhere','apps','thermal','utilities','settings'];
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 920 }, deviceScaleFactor: 2 });
await openPrototype(page);
await page.selectOption('#platform', plat); await page.waitForTimeout(400);
// The prototype opens in light mode; #mode switches it to dark.
if (mode === 'dark') { await page.click('#mode'); await page.waitForTimeout(300); }
for (const p of pages) { await page.click(`#nav [data-page="${p}"]`); await page.waitForTimeout(300); await (await page.$('#app')).screenshot({ path: `${out}/${plat}-${mode}-${p}.png` }); }
await browser.close();
