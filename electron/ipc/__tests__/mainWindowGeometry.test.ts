// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { mainWindowGeometry } from '../../mainWindowGeometry'

describe('main window geometry', () => {
  it('keeps the desktop default while allowing the verified minimum', () => {
    expect(mainWindowGeometry({ width: 1920, height: 1040 })).toEqual({ width: 1200, height: 700, minWidth: 640, minHeight: 480 })
  })
  it('fits a small work area without forcing the original desktop dimensions', () => {
    expect(mainWindowGeometry({ width: 1024, height: 600 })).toEqual({ width: 1024, height: 600, minWidth: 640, minHeight: 480 })
  })
  it('does not set a minimum larger than the OS work area', () => {
    expect(mainWindowGeometry({ width: 600, height: 450 })).toEqual({ width: 600, height: 450, minWidth: 600, minHeight: 450 })
  })
})
