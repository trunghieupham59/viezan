import { describe, expect, it } from 'vitest'
import { isQuitRequest, QUIT_FLAG } from '../../quitRequest'

describe('isQuitRequest', () => {
  it('recognises the installer quit flag in a second-instance argv', () => {
    expect(isQuitRequest(['C:\\Program Files\\Viezan\\Viezan.exe', QUIT_FLAG])).toBe(true)
  })

  it('ignores a normal relaunch and unrelated switches', () => {
    expect(isQuitRequest(['Viezan.exe'])).toBe(false)
    expect(isQuitRequest(['Viezan.exe', '--updated', '--force-run'])).toBe(false)
    expect(isQuitRequest(['Viezan.exe', '--quit-now'])).toBe(false)
  })
})
