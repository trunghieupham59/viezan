import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { checkTextClipping } from './check-text-clipping.mjs'

const server = await createServer({
  mode: 'web-preview',
  server: { host: '127.0.0.1', port: 5189, strictPort: true },
})
try {
  await server.listen()
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
  })
  try {
    const page = await browser.newPage({ locale: 'en-US' })
    await page.goto('http://127.0.0.1:5189')
    const screens = [
      ['AI Chat', '.chat-page textarea'],
      ['AI Translate', '.translate-source-pane'],
      ['AI Interpret', '.live-transcript-actions'],
      ['Dictionary', 'h1.reliability-page-title'],
      ['History', '[role="tablist"]'],
      ['Settings', '[data-settings-section="preferences"]'],
    ]
    for (const [name, ready] of screens) {
      await page.getByRole('button', { name, exact: true }).first().evaluate(element => element.click())
      await page.locator(ready).first().waitFor()
      const tightLabels = await page.evaluate(() => Array.from(document.querySelectorAll('*'))
        .filter(element => {
          const style = getComputedStyle(element)
          return element.getBoundingClientRect().height > 0
            && Array.from(element.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
            && style.overflowY === 'hidden'
            && Number.parseFloat(style.lineHeight) / Number.parseFloat(style.fontSize) < 1.4
        }).map(element => ({ class: element.className, text: element.textContent.trim() })))
      console.log(`${name}: clipped text with tight line boxes: ${JSON.stringify(tightLabels)}`)
      assert.equal(tightLabels.length, 0, `Unsafe clipped labels on ${name}`)
      if (process.env.TEXT_CLIPPING_SCREENSHOT_DIR) {
        await page.screenshot({ path: `${process.env.TEXT_CLIPPING_SCREENSHOT_DIR}/${name.replaceAll(' ', '-')}.png` })
      }
    }
    // Reproduce the reported label through the real settings and task UI.
    await page.getByRole('button', { name: 'App Language: English', exact: true }).click()
    await page.getByRole('option', { name: 'Tiếng Việt', exact: true }).click()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'AI Chat', exact: true }).first().click()
    await page.locator('.prompt-card').filter({ hasText: 'Nghiên cứu' }).click()
    const researchLabel = page.locator('.chat-task-option-field .ai-select-field__value')
    assert.equal(await researchLabel.textContent(), 'Nghiên cứu chuyên sâu')
    for (const width of [1440, 800]) {
      await page.setViewportSize({ width, height: 900 })
      for (const dark of [false, true]) {
        await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark)
        const metrics = await researchLabel.evaluate(element => {
          const style = getComputedStyle(element)
          return { height: element.clientHeight, fontSize: Number.parseFloat(style.fontSize) }
        })
        assert(metrics.height >= metrics.fontSize * 1.4, 'Research selector clips its line box')
        if (process.env.TEXT_CLIPPING_SCREENSHOT_DIR) {
          await page.screenshot({ path: `${process.env.TEXT_CLIPPING_SCREENSHOT_DIR}/research-vi-${width}-${dark ? 'dark' : 'light'}.png` })
        }
      }
    }
    await checkTextClipping(page)
  } finally {
    await browser.close()
  }
} finally {
  await server.close()
}
