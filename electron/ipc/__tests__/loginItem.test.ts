// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { HIDDEN_START_FLAG, isHiddenStartRequest, loginItemArgs, supportsLoginItem } from '../../loginItem'

describe('launch at login', () => {
  it('recognises the hidden-start flag the login item launches with', () => {
    expect(isHiddenStartRequest(['Viezan.exe', HIDDEN_START_FLAG])).toBe(true)
    expect(isHiddenStartRequest(['Viezan.exe'])).toBe(false)
    expect(isHiddenStartRequest(['Viezan.exe', '--quit'])).toBe(false)
  })

  it('is only offered on packaged Windows and macOS builds', () => {
    expect(supportsLoginItem('win32', true)).toBe(true)
    expect(supportsLoginItem('darwin', true)).toBe(true)
    expect(supportsLoginItem('linux', true)).toBe(false)
    expect(supportsLoginItem('win32', false)).toBe(false)
  })

  it('starts in the tray on Windows and normally on macOS', () => {
    expect(loginItemArgs('win32')).toEqual([HIDDEN_START_FLAG])
    expect(loginItemArgs('darwin')).toEqual([])
  })
})
