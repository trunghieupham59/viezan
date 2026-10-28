import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const context = vm.createContext({})
vm.runInContext(fs.readFileSync(new URL('../../../apps/desktop-qt/domain.js', import.meta.url), 'utf8'), context)
const domain = context.Domain
function fixture() {
  let state = domain.create('chat', 'translate')
  let counter = 0
  return {
    get state() { return state },
    get current() { return domain.current(state) },
    command(name, payload = {}) { state = domain.command(state, name, payload, `id-${++counter}`, `attempt-${counter}`); return state },
  }
}

test('two independent tasks retain drafts, model snapshots and active session', () => {
  const app = fixture()
  app.command('draft', {value: 'Chat question'})
  app.command('model', {value: 'demo.slow'})
  app.command('submit')
  const chatTask = app.state.tasks[0]
  app.command('draft', {value: 'Follow-up draft'})
  app.command('navigate', {feature: 'translate'})
  app.command('draft', {value: 'Translate text'})
  app.command('submit')
  app.command('model', {sessionID: 'chat', value: 'demo.standard'})
  app.command('receive', {taskID: chatTask.id, attemptID: chatTask.attemptID, chunk: 'Reply'})
  app.command('cancel', {taskID: chatTask.id})
  assert.equal(app.current.id, 'translate')
  assert.ok(domain.running(app.state, 'translate'))
  assert.equal(chatTask.request.model, 'demo.slow')
  app.command('select', {sessionID: 'chat'})
  assert.equal(app.current.draft, 'Follow-up draft')
  assert.equal(app.current.messages.at(-1).text, 'Reply')
})

test('cancel and retry reject delayed events from previous attempts without duplicate messages', () => {
  const app = fixture()
  app.command('draft', {value: 'Question'})
  app.command('submit')
  const old = app.state.tasks[0]
  app.command('cancel', {taskID: old.id})
  app.command('receive', {taskID: old.id, attemptID: old.attemptID, chunk: 'Too late'})
  assert.equal(app.current.messages.at(-1).text, '')
  app.command('retry', {taskID: old.id})
  const current = app.state.tasks[0]
  assert.notEqual(current.attemptID, old.attemptID)
  assert.equal(current.attemptNumber, 2)
  app.command('receive', {taskID: old.id, attemptID: old.attemptID, chunk: 'Old', terminal: 'succeeded'})
  app.command('receive', {taskID: current.id, attemptID: current.attemptID, chunk: 'New', terminal: 'succeeded'})
  assert.equal(app.current.messages.length, 2)
  assert.equal(app.current.messages.at(-1).text, 'New')
  assert.equal(app.state.tasks.length, 1)
})

test('editing translation or changing languages invalidates stale output and retries', () => {
  const app = fixture()
  app.command('navigate', {feature: 'translate'})
  app.command('draft', {value: 'Original'})
  app.command('submit')
  const first = app.state.tasks[0]
  app.command('receive', {taskID: first.id, attemptID: first.attemptID, chunk: 'Partial'})
  app.command('draft', {value: 'Edited'})
  app.command('receive', {taskID: first.id, attemptID: first.attemptID, chunk: 'Stale', terminal: 'succeeded'})
  assert.equal(app.current.output, '')
  assert.equal(domain.canRetry(app.state, app.state.tasks[0]), false)
  app.command('submit')
  const second = app.state.tasks[0]
  app.command('pair', {source: 'en', target: 'ja'})
  app.command('receive', {taskID: second.id, attemptID: second.attemptID, chunk: 'Wrong language'})
  assert.equal(app.current.target, 'ja')
  assert.equal(app.current.output, '')
})

test('restart preserves partial text and unsent draft without restarting work', () => {
  const app = fixture()
  app.command('draft', {value: 'Question 日本語'})
  app.command('submit')
  const task = app.state.tasks[0]
  app.command('receive', {taskID: task.id, attemptID: task.attemptID, chunk: 'Partial'})
  app.command('draft', {value: 'Bản nháp'})
  const restored = domain.recover(JSON.parse(JSON.stringify(app.state)))
  assert.equal(restored.tasks[0].status, 'interrupted')
  assert.equal(domain.current(restored).draft, 'Bản nháp')
  assert.equal(domain.current(restored).messages.at(-1).text, 'Partial')
  assert.equal(domain.running(restored, 'chat'), undefined)
  assert.equal(app.state.tasks[0].status, 'running')
})

test('unsupported schema, invalid selection and duplicate identities fail closed', () => {
  assert.throws(() => domain.recover({...domain.create('a', 'b'), schemaVersion: 99}))
  assert.throws(() => domain.recover({...domain.create('a', 'b'), active: {chat: 'missing', translate: 'b'}}))
  assert.throws(() => domain.recover(domain.create('same', 'same')))
})

test('Qt UI uses generated catalogs and identical shared resources', () => {
  const qt = fs.readFileSync(new URL('../../../apps/desktop-qt/qml/native.json', import.meta.url), 'utf8')
  const swift = fs.readFileSync(new URL('../../../apps/macos/Sources/ViezanDomain/Resources/native.json', import.meta.url), 'utf8')
  assert.equal(qt, swift)
  const resource = JSON.parse(qt)
  const qml = ['Main.qml', 'SettingsWorkspace.qml', 'ChatTranscript.qml'].map(file => fs.readFileSync(new URL(`../../../apps/desktop-qt/qml/${file}`, import.meta.url), 'utf8')).join('\n')
  for (const [, key] of qml.matchAll(/\bt\("([^"]+)"\)/g)) for (const locale of ['vi', 'en', 'ja']) assert.ok(resource.locales[locale][key], `${locale}.${key}`)
  for (const section of resource.settingsSections) for (const key of [section.title, section.description, ...section.terms]) for (const locale of ['vi', 'en', 'ja']) assert.ok(resource.locales[locale][key], `${locale}.${key}`)
})

test('QML avoids JavaScript APIs missing from the Qt V4 engine', () => {
  // V4 lacks these (checked with Qt 6.12's qml runtime); a call throws and leaves
  // bindings at their defaults, e.g. a hidden label becomes visible.
  const missing = /\.(flatMap|flat|at|findLast|findLastIndex|replaceAll|toSorted|toReversed)\(|Object\.(fromEntries|hasOwn)\(|structuredClone\(/
  const folder = new URL('../../../apps/desktop-qt/qml/', import.meta.url)
  for (const file of fs.readdirSync(folder).filter(name => name.endsWith('.qml'))) {
    fs.readFileSync(new URL(file, folder), 'utf8').split('\n').forEach((line, index) => {
      assert.doesNotMatch(line.replace(/\/\/.*$|\/\*.*?\*\//g, ''), missing, `${file}:${index + 1}`)
    })
  }
})

test('shared recovery contract preserves Unicode and cross-platform identities', () => {
  const saved = JSON.parse(fs.readFileSync(new URL('../../../contracts/native-workbench/recovery-fixture.json', import.meta.url), 'utf8'))
  const state = domain.recover(saved)
  assert.equal(state.tasks[0].status, 'interrupted')
  assert.equal(state.tasks[0].attemptID, 'attempt-fixture')
  assert.equal(state.tasks[0].request.model, 'demo.slow')
  assert.equal(domain.current(state).draft, 'Bản nháp chưa gửi')
  assert.equal(domain.current(state).messages.at(-1).text, 'Phản hồi dở dang')
})

test('appearance and language edits preserve running requests, drafts and model IDs', () => {
  const app = fixture()
  app.command('draft', {value: 'Question'})
  app.command('model', {value: 'demo.slow'})
  app.command('submit')
  app.command('draft', {value: 'Unsent next message'})
  const before = JSON.stringify({sessions: app.state.sessions, tasks: app.state.tasks, active: app.state.active})
  app.command('appearance', {mode: 'light', textSize: 'large'})
  app.command('locale', {value: 'ja'})
  assert.equal(JSON.stringify({sessions: app.state.sessions, tasks: app.state.tasks, active: app.state.active}), before)
  assert.equal(app.state.appearance.mode, 'light')
  assert.equal(app.state.appearance.textSize, 'large')
  assert.equal(app.state.tasks[0].request.locale, 'vi')
  assert.equal(domain.recover(app.state).appearance.mode, 'light')
  const saved = JSON.stringify(app.state)
  app.command('appearance', {mode: 'unsupported'})
  assert.equal(JSON.stringify(app.state), saved)
  app.command('appearance', {textSize: 'unsupported'})
  assert.equal(JSON.stringify(app.state), saved)
})

test('older snapshots remain readable and unsupported saved appearance blocks recovery', () => {
  const saved = JSON.parse(fs.readFileSync(new URL('../../../contracts/native-workbench/recovery-fixture.json', import.meta.url), 'utf8'))
  assert.doesNotThrow(() => domain.recover(saved))
  assert.doesNotThrow(() => domain.recover({...saved, appearance: null}))
  assert.throws(() => domain.recover({...saved, appearance: {mode: 'unknown', textSize: 'large'}}))
  assert.throws(() => domain.recover({...saved, appearance: {mode: 'dark', textSize: 'huge'}}))
})

test('navigation preference is backward compatible and independent of work', () => {
  const app = fixture()
  assert.equal(domain.recover(app.state).shell, undefined)
  app.command('draft', {value: 'Keep draft'})
  app.command('submit')
  const before = JSON.stringify({sessions: app.state.sessions, tasks: app.state.tasks})
  app.command('navigation', {collapsed: true})
  assert.equal(app.state.shell.navigationCollapsed, true)
  assert.equal(JSON.stringify({sessions: app.state.sessions, tasks: app.state.tasks}), before)
  app.command('navigate', {feature: 'translate'})
  assert.equal(domain.recover(app.state).shell.navigationCollapsed, true)
  for (const value of ['false', 0, {}, null]) {
    assert.throws(() => domain.validate({...app.state, shell: {navigationCollapsed: value}}), /invalidShell/)
  }
})
