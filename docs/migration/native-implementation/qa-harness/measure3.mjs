import { chromium } from '/Users/phamtrunghieu/Github/personal/viezan/node_modules/playwright/index.mjs';
import { openPrototype } from './prototype.mjs';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
await openPrototype(page);
await page.click('#mode'); await page.waitForTimeout(300);
const css = s => page.evaluate(sel => [...document.querySelectorAll(sel)].slice(0,3).map(e => { const c = getComputedStyle(e), b=e.getBoundingClientRect(); return `${sel} ${Math.round(b.width)}x${Math.round(b.height)} bg=${c.backgroundColor} border=${c.borderTopWidth} ${c.borderTopColor} color=${c.color} fs=${c.fontSize} fw=${c.fontWeight} r=${c.borderRadius} pad=${c.padding} shadow=${c.boxShadow.slice(0,60)}` }), s);
await page.click('#nav [data-page="dictionary"]'); await page.waitForTimeout(300);
for (const s of ['.lp-choice','.lp-swap','.lw-model','.dict-search, .lw-search, form', 'input', '.toolbar-actions button', '.toolbar']) console.log((await css(s)).join('\n'));
await page.click('#nav [data-page="chat"]'); await page.waitForTimeout(300);
for (const s of ['.composer','.composer textarea','.composer-foot button','.msg-user, .bubble, .user','.toolbar-actions button']) console.log((await css(s)).join('\n'));
await page.click('#nav [data-page="translate"]'); await page.waitForTimeout(300);
for (const s of ['.lw-pane, .lw-panel, .pane','.lw-pane-head, .pane-head','.lw-pane-foot, .pane-foot', '.lw-panes, .panes']) console.log((await css(s)).join('\n'));
await browser.close();
