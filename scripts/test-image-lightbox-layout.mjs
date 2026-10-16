import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { chromium } from 'playwright'

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--no-proxy-server'] })
try {
  const page = await browser.newPage()
  await page.setContent('<div id="root"></div>')
  for (const file of ['src/index.css', 'src/styles/codex.css', 'src/styles/tokens.css']) {
    await page.addStyleTag({ content: await readFile(file, 'utf8') })
  }
  const fixture = await build({
    stdin: {
      resolveDir: process.cwd(), loader: 'tsx',
      contents: `
        import React from 'react'
        import { createRoot } from 'react-dom/client'
        import { flushSync } from 'react-dom'
        import { AppShell } from './src/components/templates/AppShell'
        import { ImageLightbox } from './src/components/ui/molecules/ImageLightbox'
        const root = createRoot(document.getElementById('root'))
        window.renderPreview = (showTitlebar, landscape) => {
          const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + (landscape ? 1800 : 800) + '" height="' + (landscape ? 800 : 1800) + '"><rect width="100%" height="100%" fill="steelblue"/></svg>'
          flushSync(() => root.render(<AppShell showTitlebar={showTitlebar} primaryNavigation={null}>
            <ImageLightbox src={'data:image/svg+xml,' + encodeURIComponent(svg)} alt="Layout fixture"
              previewLabel="Image preview" toolbarLabel="Image actions"
              copyLabel="Copy" downloadLabel="Download" closeLabel="Close preview"
              onCopy={() => {}} onDownload={() => {}} onClose={() => {}} />
          </AppShell>))
        }
      `,
    },
    bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'import.meta.env.BASE_URL': '"/"' },
  })
  await page.addScriptTag({ content: fixture.outputFiles[0].text })
  for (const [width, height] of [[1200, 700], [800, 600], [360, 640]]) {
    await page.setViewportSize({ width, height })
    for (const dark of [false, true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark)
      for (const titlebar of [false, true]) {
        for (const landscape of [false, true]) {
          await page.evaluate(([titlebar, landscape]) => window.renderPreview(titlebar, landscape), [titlebar, landscape])
          await page.locator('.image-lightbox-image').evaluate(image => image.decode())
          await page.getByRole('dialog').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)))
          const bounds = await page.evaluate(() => {
            const box = selector => {
              const { top, bottom, left, right } = document.querySelector(selector).getBoundingClientRect()
              return { top, bottom, left, right }
            }
            return {
              overlay: box('.image-lightbox'), toolbar: box('.image-lightbox-toolbar'), image: box('.image-lightbox-image'),
              titlebarHeight: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--vzn-titlebar-height')),
            }
          })
          assert.equal(bounds.overlay.top, titlebar ? bounds.titlebarHeight : 0)
          for (const target of [bounds.toolbar, bounds.image]) {
            assert(target.top >= bounds.overlay.top && target.bottom <= height, JSON.stringify(bounds))
            assert(target.left >= 0 && target.right <= width, JSON.stringify(bounds))
          }
          assert(bounds.toolbar.bottom <= bounds.image.top, 'Toolbar must not overlap the image')
          if (process.env.VIEZAN_LIGHTBOX_SCREENSHOT && width === 1200 && titlebar && !dark && !landscape) {
            await page.screenshot({ path: process.env.VIEZAN_LIGHTBOX_SCREENSHOT })
          }
        }
      }
    }
  }
  console.log('PASS: lightbox geometry in 24 viewport/theme/titlebar/orientation combinations')
} finally {
  await browser.close()
}
