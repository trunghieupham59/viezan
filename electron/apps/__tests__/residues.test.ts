// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { AppRecord } from '../inventory'
import { ownership, prefixMatch } from '../residues'

const app: AppRecord = { id: 'one', bundleId: 'com.foo.editor', name: 'Editor', path: '/Applications/Editor.app', teamId: 'VENDOR', executable: 'Editor', version: '1' }
describe('ownership evidence', () => {
  it('uses reverse-DNS boundaries', () => {
    expect(prefixMatch('com.foobar', 'com.foo')).toBe(false)
    expect(prefixMatch('com.foo.helper', 'com.foo')).toBe(true)
    expect(ownership('com.foo.editor.plist', app, [app])).toEqual({ evidence: 'exact', shared: false })
    expect(ownership('com.foo.editorial', app, [app])?.evidence).toBe('vendor')
  })
  it('does not treat vendor or name matches as exact', () => {
    expect(ownership('VENDOR.Shared', app, [app])?.evidence).toBe('vendor')
    expect(ownership('Editor', app, [app])?.evidence).toBe('name')
    expect(ownership('com.foobar.reader', app, [app])).toBeNull()
  })
  it('protects common vendor storage and data owned by another installed app', () => {
    const other = { ...app, id: 'two', name: 'Reader', bundleId: 'com.foo.reader', path: '/Applications/Reader.app' }
    expect(ownership('VENDOR.Shared', app, [app, other])?.shared).toBe(true)
    expect(ownership('com.foo.reader.plist', app, [app, other])?.shared).toBe(true)
    expect(ownership('com.foo.editor.plist', app, [app, other])?.shared).toBe(false)
  })
  it('keeps data when another copy of the same bundle remains installed', () => {
    const duplicate = { ...app, id: 'two', path: '/Applications/Older/Editor.app' }
    expect(ownership('com.foo.editor', app, [app, duplicate])?.shared).toBe(true)
  })
  it('does not treat a helper prefix as exact ownership', () => {
    expect(ownership('com.foo.editor.helper', app, [app])?.evidence).toBe('vendor')
  })
  it('protects a parent domain when an installed child app may use it', () => {
    const child = { ...app, path: '/Applications/Child.app', bundleId: 'com.foo.editor.child' }
    expect(ownership('com.foo.editor', app, [app, child])?.shared).toBe(true)
  })

})
