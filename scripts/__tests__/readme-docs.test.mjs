import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkDocs, recordReview, releaseNotes, renderReadme, sourceDigest } from '../readme-docs.mjs'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const summary = 'Reviewed the feature guide, provider setup and OS limitations against source.'

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'viezan-docs-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), value)
  }
  for (const dir of ['.github', 'native', 'shared', 'chrome-extension']) fs.mkdirSync(path.join(root, dir))
  for (const file of ['package.json', 'package-lock.json', 'src/constants/providers.ts', 'electron/ipc/providers/types.ts', 'src/i18n/index.ts']) {
    write(file, fs.readFileSync(path.join(repo, file)))
  }
  for (const locale of ['en', 'ja', 'vi']) write(`src/i18n/locales/${locale}.ts`, 'export default {}\n')
  write('src/modules/pages.ts', "export const APP_PAGES = { home: lazy(() => import('../pages/HomePage')) }\n")
  write('src/pages/HomePage.tsx', 'export const HomePage = () => null\n')
  write('README.md', '# Viezan\n\n<!-- BEGIN GENERATED:overview -->\n<!-- END GENERATED:overview -->\n\n[Home](src/pages/HomePage.tsx)\n\n<!-- BEGIN GENERATED:stack -->\n<!-- END GENERATED:stack -->\n')
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version
  write('CHANGELOG.md', `# Changelog\n\n## [Unreleased]\n\n- Future work.\n\n## [${version}]\n\n### Changed\n\n- Reviewed product changes.\n\n## [0.1.0]\n\n- Older changes.\n`)
  write('README.md', renderReadme(root))
  recordReview(root, summary)
  return { root, write, version, read: (file) => fs.readFileSync(path.join(root, file), 'utf8') }
}

test('a reviewed checkout passes; checks never change files and sync preserves prose', (t) => {
  const f = fixture(t)
  const before = f.read('.github/readme-review.json')
  assert.deepEqual(checkDocs(f.root), [])
  assert.equal(f.read('.github/readme-review.json'), before)
  assert.equal(renderReadme(f.root), f.read('README.md'))
  assert.match(f.read('README.md'), /\[Home\]\(src\/pages\/HomePage.tsx\)/)
})

test('a version-only bump fails even after regenerating README facts', (t) => {
  const f = fixture(t)
  const pkg = JSON.parse(f.read('package.json'))
  pkg.version = '9.0.0'
  f.write('package.json', JSON.stringify(pkg))
  assert.throws(() => checkDocs(f.root), /CHANGELOG.md needs one/)
  f.write('CHANGELOG.md', `${f.read('CHANGELOG.md')}\n## [9.0.0]\n\n- Internal fixes; existing feature guide still applies.\n`)
  f.write('README.md', renderReadme(f.root))
  assert.ok(checkDocs(f.root).some((error) => error.includes('package-lock')))
  const lock = JSON.parse(f.read('package-lock.json'))
  lock.version = lock.packages[''].version = pkg.version
  f.write('package-lock.json', JSON.stringify(lock))
  assert.ok(checkDocs(f.root).some((error) => error.includes('review is stale')))
  recordReview(f.root, 'Reviewed internal fixes; no changes to feature prose are needed.')
  assert.deepEqual(checkDocs(f.root), [])
})

test('later source additions, edits and deletions invalidate the review', (t) => {
  const f = fixture(t)
  f.write('electron/new-feature.ts', 'export const enabled = true\n')
  assert.ok(checkDocs(f.root).some((error) => error.includes('sourceSha256')))
  recordReview(f.root, summary)
  f.write('electron/new-feature.ts', 'export const enabled = false\n')
  assert.ok(checkDocs(f.root).some((error) => error.includes('sourceSha256')))
  recordReview(f.root, summary)
  fs.unlinkSync(path.join(f.root, 'electron/new-feature.ts'))
  assert.ok(checkDocs(f.root).some((error) => error.includes('sourceSha256')))
})

test('review hashes are portable across CRLF checkouts and ignore tests/build artifacts', (t) => {
  const f = fixture(t)
  const before = sourceDigest(f.root)
  f.write('src/pages/HomePage.tsx', f.read('src/pages/HomePage.tsx').replace(/\n/g, '\r\n'))
  f.write('README.md', f.read('README.md').replace(/\n/g, '\r\n'))
  f.write('src/__tests__/home.test.ts', 'changed test')
  f.write('native/bin/generated.c', 'generated helper')
  f.write('native/.env', 'must never be read')
  assert.equal(sourceDigest(f.root), before)
  assert.deepEqual(checkDocs(f.root), [])
})

test('changed prose or notes require a new review; broken paths cannot be approved', (t) => {
  const f = fixture(t)
  f.write('README.md', `${f.read('README.md')}\nA newly documented limitation.\n`)
  f.write('CHANGELOG.md', f.read('CHANGELOG.md').replace('Reviewed product', 'Updated product'))
  assert.ok(checkDocs(f.root).some((error) => error.includes('readmeSha256')))
  assert.ok(checkDocs(f.root).some((error) => error.includes('changelogSha256')))
  f.write('README.md', `${f.read('README.md')}\n[Missing](src/pages/MissingPage.tsx)\n`)
  assert.throws(() => recordReview(f.root, summary), /Broken README path/)
})

test('a new routed feature needs a README feature link', (t) => {
  const f = fixture(t)
  f.write('src/modules/pages.ts', `${f.read('src/modules/pages.ts')}\nconst extra = lazy(() => import("../pages/ExtraPage"))\n`)
  f.write('src/pages/ExtraPage.tsx', 'export const ExtraPage = () => null\n')
  assert.throws(() => recordReview(f.root, summary), /missing a feature link/)
})

test('an unsupported route shape fails closed instead of silently skipping a page', (t) => {
  const f = fixture(t)
  f.write('src/modules/pages.ts', `${f.read('src/modules/pages.ts')}\nconst extra = lazy(loadExtraPage)\n`)
  assert.throws(() => recordReview(f.root, summary), /completely extract the page catalog/)
})

test('missing or duplicate generated markers fail without overwriting prose', (t) => {
  const f = fixture(t)
  const original = f.read('README.md')
  f.write('README.md', original.replace('<!-- END GENERATED:stack -->', ''))
  assert.throws(() => renderReadme(f.root), /marker pair/)
  f.write('README.md', `${original}\n<!-- BEGIN GENERATED:overview -->`)
  assert.throws(() => renderReadme(f.root), /marker pair/)
})

test('provider/locale/dependency changes refresh generated facts, without certifying review', (t) => {
  const f = fixture(t)
  f.write('electron/ipc/providers/types.ts', f.read('electron/ipc/providers/types.ts').replace("'local']", "'local', 'new']"))
  assert.throws(() => renderReadme(f.root), /registries disagree/)
  f.write('src/constants/providers.ts', f.read('src/constants/providers.ts').replace('export const PROVIDERS: ProviderConfig[] = [', "export const PROVIDERS: ProviderConfig[] = [\n{ id: 'new', name: 'New AI', color: '#000', },"))
  f.write('src/i18n/index.ts', f.read('src/i18n/index.ts').replace("en: 'English',", "en: 'English',\nfr: 'Français',"))
  f.write('src/i18n/locales/fr.ts', 'export default {}\n')
  const pkg = JSON.parse(f.read('package.json'))
  pkg.devDependencies.typescript = '^99.0.0'
  f.write('package.json', JSON.stringify(pkg))
  const rendered = renderReadme(f.root)
  assert.match(rendered, /New AI/)
  assert.match(rendered, /Français/)
  assert.match(rendered, /\^99\.0\.0/)
  f.write('README.md', rendered)
  assert.ok(checkDocs(f.root).some((error) => error.includes('review is stale')))
})

test('release notes select exactly the current version and reject empty/duplicate entries', (t) => {
  const f = fixture(t)
  assert.match(releaseNotes(f.root), /Reviewed product changes/)
  assert.doesNotMatch(releaseNotes(f.root), /Future work|Older changes/)
  const original = f.read('CHANGELOG.md')
  f.write('CHANGELOG.md', original.replace('- Reviewed product changes.', 'TBD'))
  assert.throws(() => releaseNotes(f.root), /non-placeholder/)
  f.write('CHANGELOG.md', `${original}\n## [${f.version}]\n\n- Duplicate release entry.\n`)
  assert.throws(() => releaseNotes(f.root), /needs one/)
})

test('direct releases reject branch dispatch and mismatched tags', (t) => {
  const f = fixture(t)
  for (const ref of ['refs/heads/develop', 'refs/tags/v9.0.0', '']) {
    assert.ok(checkDocs(f.root, ref).some((error) => error.includes('Release must run')))
  }
  assert.deepEqual(checkDocs(f.root, `refs/tags/v${f.version}`), [])
})

test('review requires a summary and a missing record never passes', (t) => {
  const f = fixture(t)
  assert.throws(() => recordReview(f.root, 'done'), /summary/)
  fs.unlinkSync(path.join(f.root, '.github/readme-review.json'))
  assert.ok(checkDocs(f.root).some((error) => error.includes('Missing README review')))
})

test('auto-tag and every release upload are downstream of documentation validation', () => {
  const readWorkflow = (name) => fs.readFileSync(path.join(repo, '.github', name), 'utf8')
  const tag = readWorkflow('workflows/auto-tag.yml')
  assert.ok(tag.indexOf('npm run check:docs') < tag.indexOf('git tag -a'))
  assert.ok(tag.includes('npm run check:docs'))
  const release = readWorkflow('workflows/release.yml')
  assert.ok(release.indexOf('uses: ./.github/actions/sync-version') < release.indexOf('uses: softprops/action-gh-release'))
  for (const job of release.split(/^ {4}build-/m).slice(1)) assert.match(job, /needs: create-release/)
  assert.match(release, /readme-docs\.mjs notes/)
  const action = readWorkflow('actions/sync-version/action.yml')
  assert.match(action, /check --release-ref "\$GITHUB_REF"/)
  assert.doesNotMatch(action, /npm version/)
  assert.doesNotMatch(readWorkflow('workflows/docs.yml'), /paths-ignore|docs:review/)
})
