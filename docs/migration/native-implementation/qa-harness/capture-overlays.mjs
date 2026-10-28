import { chromium } from '/Users/phamtrunghieu/Github/personal/viezan/node_modules/playwright/index.mjs';
import { openPrototype } from './prototype.mjs';

// usage: node capture-overlays.mjs <outdir> [macos|windows|linux] [dark|light]
// The prototype's command palette, History and Activity layers on Translate, 1x.
const [out, plat = 'macos', mode = 'dark'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
await openPrototype(page);
if (plat !== 'macos') {
  await page.selectOption('#platform', plat);
  await page.waitForTimeout(400);
}
if (mode === 'dark') {
  await page.click('#mode');
  await page.waitForTimeout(300);
}
await page.click('#nav [data-page="translate"]');
await page.waitForTimeout(300);
const shot = async (name) => {
  await page.waitForTimeout(400);
  await (await page.$('#app')).screenshot({ path: `${out}/${plat}-${mode}-overlay-${name}.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
};
await page.click('.search');
await shot('palette');
await page.click('button:has-text("Lịch sử")');
await shot('history');
await page.click('button:has-text("Hoạt động")');
await shot('activity');
await browser.close();
