import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import vm from 'node:vm'
import { buildSync } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// The renderer icon registry owns the paths; native Qt gets generated SVGs.
export function generateIcons(root, check) {
  const result = buildSync({
    stdin: {contents: "export * from './src/components/ui/icons/actions'; export * from './src/components/ui/icons/navigation'; export * from './src/components/ui/icons/files'; export * from './src/components/ui/icons/media'", resolveDir: root, loader: 'ts'},
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react/jsx-runtime'],
  })
  const module = {exports: {}}
  vm.runInNewContext(result.outputFiles[0].text, {module, exports: module.exports, require: createRequire(import.meta.url)})
  const icons = {
    interpret: ["MicrophoneIcon"], apps: ["LayersIcon"],
    everywhere: ["GlobeIcon"], utilities: ["KeyboardIcon"], thermal: ["ThermometerIcon"],
    dictionary: ['BookIcon'], home: ['HomeIcon'], chat: ['ChatBubbleIcon'], translate: ['TranslateIcon'], settings: ['GearIcon'],
    history: ['ClockIcon'], search: ['SearchIcon'], new: ['PlusIcon'],
    refresh: ['RefreshIcon'], activity: ['ActivityIcon'], close: ['XIcon'], back: ['ChevronLeftIcon'],
    expand: ['SidebarPanelIcon', {action: 'expand'}], collapse: ['SidebarPanelIcon', {action: 'collapse'}],
  }
  const write = (relative, bytes) => {
    const destination = path.join(root, relative)
    if (check) {
      if (!fs.existsSync(destination) || !fs.readFileSync(destination).equals(Buffer.from(bytes))) throw new Error(`Stale native asset: ${relative}`)
    } else { fs.mkdirSync(path.dirname(destination), {recursive: true}); fs.writeFileSync(destination, bytes) }
  }
  for (const [name, [component, props]] of Object.entries(icons)) {
    const svg = renderToStaticMarkup(React.createElement(module.exports[component], {...props, className: ''}))
      .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
    write(`apps/desktop-qt/qml/icons/${name}.svg`, `${svg}\n`)
  }
  write('apps/desktop-qt/qml/brand.png', fs.readFileSync(path.join(root, 'public/icon.png')))
}
