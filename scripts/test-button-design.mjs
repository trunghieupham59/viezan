import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

// Run against an existing Web Preview; no Electron runtime or user profile is changed.
const url = process.env.BUTTON_QA_URL || 'http://127.0.0.1:5173'
const output = process.env.BUTTON_QA_DIR || path.join(os.tmpdir(), 'viezan-button-qa')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
let checked = 0

async function verify(page, scenario) {
  // Allow theme and control color transitions to settle before comparing computed colors.
  await page.waitForTimeout(250)
  const results = await page.locator('button[data-ui-control="button"]').evaluateAll((buttons) => {
    const tokens = getComputedStyle(document.documentElement)
    return buttons.filter(button => {
      const bounds = button.getBoundingClientRect()
      return bounds.width > 0 && bounds.height > 0 && getComputedStyle(button).visibility !== 'hidden'
    }).map(button => {
      const bounds = button.getBoundingClientRect()
      const style = getComputedStyle(button)
      const size = button.dataset.controlSize
      const expected = Number.parseFloat(tokens.getPropertyValue(`--vzn-control-height-${size}`))
      const card = button.classList.contains('prompt-card')
      const expectedHeight = card ? Number.parseFloat(tokens.getPropertyValue('--vzn-prompt-card-min-height')) : expected
      const named = Boolean(button.getAttribute('aria-label') || button.getAttribute('aria-labelledby') || button.textContent.trim())
      const disabledMatches = !button.disabled || ['backgroundColor', 'borderTopColor', 'color'].every((property, index) => {
        const probe = document.createElement('span')
        probe.style.color = `var(--vzn-disabled-${['bg', 'border', 'fg'][index]})`
        document.body.append(probe)
        const resolved = getComputedStyle(probe).color
        probe.remove()
        return style[property] === resolved
      })
      return {
        label: button.getAttribute('aria-label') || button.textContent.trim().slice(0, 50),
        height: bounds.height,
        width: bounds.width,
        size,
        expectedHeight,
        card,
        square: button.dataset.controlShape !== 'icon' || Math.abs(bounds.width - bounds.height) < 1,
        named,
        disabledMatches,
      }
    })
  })
  assert(results.length > 0, `${scenario}: no controls rendered`)
  for (const result of results) {
    assert(result.card ? result.height >= result.expectedHeight : Math.abs(result.height - result.expectedHeight) < 1,
      `${scenario}: ${JSON.stringify(result)}`)
    assert(result.square, `${scenario}: non-square icon control ${result.label}`)
    assert(result.named, `${scenario}: unnamed control`)
    assert(result.disabledMatches, `${scenario}: disabled colors drifted for ${result.label}`)
  }
  checked += results.length
  await page.screenshot({ path: path.join(output, `${scenario}.png`) })
}

try {
  const errors = []
  for (const width of [1440, 800]) {
    const page = await browser.newPage({ locale: 'en-US', viewport: { width, height: 900 } })
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(url)
    await page.locator('.chat-composer').waitFor()
    await verify(page, `chat-${width}`)
    for (const [name, ready] of [
      ['AI Translate', '.translate-source-pane'],
      ['Dictionary', '.app-main form input'],
      ['AI Interpret', '.app-main .app-page'],
    ]) {
      await page.getByRole('button', { name, exact: true }).first().click()
      await page.locator(ready).first().waitFor()
      await page.waitForTimeout(250)
      await verify(page, `${name.toLowerCase().replaceAll(' ', '-')}-${width}`)
    }
    await page.getByRole('button', { name: 'Settings', exact: true }).first().click()
    await page.locator('.settings-shell').waitFor()
    for (const id of ['preferences', 'api', 'stt', 'tts', 'chat', 'hotkeys', 'browser', 'updates']) {
      const section = page.locator(`[data-settings-section="${id}"]`)
      await section.evaluate(element => element.scrollIntoView({ block: 'start' }))
      await page.waitForTimeout(150)
      await verify(page, `settings-${id}-${width}`)
      if (id === 'chat') {
        await section.getByRole('button', { name: 'Add Preset', exact: true }).click()
        assert(await section.getByRole('button', { name: 'Save', exact: true }).isDisabled(), 'Empty preset form must not submit')
        await verify(page, `settings-preset-form-${width}`)
        await section.getByRole('button', { name: 'Cancel', exact: true }).click()
      }
      if (id === 'browser') {
        await section.getByRole('button', { name: 'New API Key', exact: true }).click()
        await verify(page, `settings-token-form-${width}`)
        await section.getByRole('button', { name: 'Cancel', exact: true }).click()
      }
    }
    // Verify the same disabled and selected palette contract in dark mode.
    await page.locator('[data-settings-section="preferences"]').evaluate(element => element.scrollIntoView({ block: 'start' }))
    await page.getByRole('button', { name: 'Dark', exact: true }).click()
    await page.waitForTimeout(250)
    await verify(page, `settings-dark-${width}`)
    await page.close()
  }
  assert.deepEqual(errors, [], 'Web Preview raised runtime errors')
  console.log(`Button design QA passed: ${checked} control checks at 1440px and 800px. Screenshots: ${output}`)
} finally {
  await browser.close()
}
