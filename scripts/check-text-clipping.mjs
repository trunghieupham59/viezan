import assert from 'node:assert/strict'

/** Compare actual glyph pixels with and without vertical clipping, using app CSS. */
export async function checkTextClipping(page) {
  const samples = [
    'Nghiên cứu chuyên sâu · nghiệp vụ · ậ ệ ự ỹ · g j p q y',
    'Research typography · g j p q y · underline_test',
    '翻訳・設定・研究 · が ぱ ポ · g j p q y',
  ]
  const cases = [
    ...['xs', 'sm', 'md', 'lg'].map(size => [
      `ui-button ui-button-${size} ui-button-rect`, 'truncate',
    ]),
    ['btn-menu-item', 'truncate'],
    ['btn-nav-item', 'truncate'],
    ['ui-button ui-button-md ai-select-field__trigger', 'ai-select-field__value'],
    ['ui-button ui-button-md ai-select-field__option', 'ai-select-field__option-description'],
    ['ui-button ui-button-md', 'sidebar-nav-label'],
    ['chat-session-copy', 'chat-session-title'],
    ['model-picker-option-copy', 'model-picker-option-name'],
    ['model-picker-option-copy', 'model-picker-option-meta'],
    ['cmd-palette-item-copy', 'cmd-palette-item-name'],
    ['cmd-palette-item-copy', 'cmd-palette-item-description'],
  ]
  const failures = []
  let negativeControlChecked = false
  for (const width of [1440, 800]) {
    await page.setViewportSize({ width, height: 900 })
    for (const dark of [false, true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark)
      for (const sample of samples) {
        for (const [parentClass, labelClass] of cases) {
          await page.evaluate(({ parentClass, labelClass, sample }) => {
            document.querySelector('[data-text-clipping-probe]')?.remove()
            const probe = document.createElement('div')
            probe.dataset.textClippingProbe = ''
            Object.assign(probe.style, {
              position: 'fixed', top: '0', left: '0', zIndex: '9999',
              width: '700px', height: '100px', padding: '24px',
              background: 'var(--vzn-canvas)',
            })
            const parent = document.createElement('button')
            parent.className = parentClass
            parent.style.width = '600px'
            // Pin geometry: changing overflow also changes an inline flexbox's
            // baseline, which must not move the whole fixture between images.
            Object.assign(parent.style, { position: 'absolute', top: '24px', left: '24px' })
            const label = document.createElement('span')
            label.className = labelClass
            // Isolate vertical clipping from horizontal glyph overhang at a
            // fractional inline boundary (ellipsis clipping is intentional).
            label.style.paddingInline = '4px'
            label.textContent = sample
            parent.append(label)
            probe.append(parent)
            document.body.append(probe)
          }, { parentClass, labelClass, sample })
          const probe = page.locator('[data-text-clipping-probe]')
          const clipped = await probe.screenshot({ animations: 'disabled' })
          await probe.evaluate(element => {
            for (const child of element.querySelectorAll('*')) {
              child.style.setProperty('overflow', 'visible', 'important')
            }
          })
          const unclipped = await probe.screenshot({ animations: 'disabled' })
          if (!clipped.equals(unclipped)) {
            failures.push(`${width}px ${dark ? 'dark' : 'light'}: ${parentClass} > ${labelClass}: ${sample}`)
          }
          if (!negativeControlChecked) {
            await probe.evaluate(element => {
              for (const child of element.querySelectorAll('*')) child.style.removeProperty('overflow')
              element.firstElementChild.style.setProperty('line-height', '1', 'important')
            })
            const unsafe = await probe.screenshot({ animations: 'disabled' })
            await probe.evaluate(element => {
              for (const child of element.querySelectorAll('*')) child.style.setProperty('overflow', 'visible', 'important')
            })
            const reference = await probe.screenshot({ animations: 'disabled' })
            assert(!unsafe.equals(reference), 'Negative control did not detect clipped Vietnamese glyphs at line-height: 1')
            negativeControlChecked = true
          }
        }
      }
    }
  }
  await page.locator('[data-text-clipping-probe]').evaluate(element => element.remove())
  assert.equal(failures.length, 0, `Glyph pixels were clipped:\n${failures.join('\n')}`)
  console.log(`Text clipping: ${cases.length * samples.length * 4} pixel comparisons passed (VI/EN/JA, light/dark, desktop/compact)`)
}
