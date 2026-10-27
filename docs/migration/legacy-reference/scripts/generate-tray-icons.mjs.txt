/** Render only the Windows tray artwork. Requires the existing Playwright Chromium. */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const artwork = readFileSync(join(root, 'build/tray.svg'), 'utf8')
// Include intermediate DPI slots as well as the requested 100% and 200% sizes.
const sizes = [16, 20, 24, 32, 40, 48, 64]
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  const frames = []
  for (const size of sizes) {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${artwork}`)
    frames.push(await page.screenshot({ omitBackground: true }))
  }
  // Windows ICO directory with independently rasterized PNG entries. Never
  // resize the 16px frame into a higher-DPI slot at runtime.
  const header = Buffer.alloc(6 + sizes.length * 16)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(sizes.length, 4)
  let offset = header.length
  frames.forEach((frame, index) => {
    const entry = 6 + index * 16
    header[entry] = sizes[index]
    header[entry + 1] = sizes[index]
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(frame.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += frame.length
  })
  writeFileSync(join(root, 'public/tray.ico'), Buffer.concat([header, ...frames]))
  console.log(`public/tray.ico: ${sizes.join(', ')}px transparent frames`)

  // Optional comparison artifact; not part of the application bundle.
  if (process.argv[2]) {
    const before = readFileSync(join(root, 'public/icon.png')).toString('base64')
    const panels = ['#f8f8f8', '#202020'].map((background) => `
      <section style="background:${background};color:${background === '#202020' ? '#fff' : '#222'}">
        <h2>${background === '#202020' ? 'Dark' : 'Light'} background</h2>
        ${[16, 32].map((size) => `<div class="row"><span>${size}px</span>
          <figure><img width="${size}" height="${size}" src="data:image/png;base64,${before}"><figcaption>Before</figcaption></figure>
          <figure><img width="${size}" height="${size}" src="data:image/png;base64,${frames[sizes.indexOf(size)].toString('base64')}"><figcaption>After</figcaption></figure>
          <figure><img class="zoom" width="${size * 4}" height="${size * 4}" src="data:image/png;base64,${frames[sizes.indexOf(size)].toString('base64')}"><figcaption>After ×4</figcaption></figure>
        </div>`).join('')}
      </section>`).join('')
    await page.setViewportSize({ width: 800, height: 480 })
    await page.setContent(`<style>body{margin:0;font:14px sans-serif;display:flex}section{width:50%;padding:24px;box-sizing:border-box;height:480px}h2{font-size:18px}.row{height:180px;display:flex;align-items:center;gap:16px}figure{margin:0;text-align:center}figcaption{margin-top:12px;font-size:12px}.zoom{image-rendering:pixelated}</style>${panels}`)
    await page.screenshot({ path: resolve(process.argv[2]) })
  }
} finally {
  await browser.close()
}
