import { describe, expect, it } from 'vitest'
import {
  DEV_LOCAL_SERVER_PORT,
  RELEASE_LOCAL_SERVER_PORT,
  resolveRuntimeProfile,
} from '../../runtimeProfile'

describe('resolveRuntimeProfile — packaged (official) build', () => {
  it('keeps the historic defaults so existing user data and the Chrome extension keep working', () => {
    const profile = resolveRuntimeProfile(true)

    expect(profile.channel).toBe('release')
    expect(profile.isDev).toBe(false)
    expect(profile.userDataDirName).toBeNull()
    expect(profile.localServerPort).toBe(RELEASE_LOCAL_SERVER_PORT)
    expect(profile.windowTitle).toBe('Viezan')
    expect(profile.appName).toBe('Viezan')
    expect(profile.trayEnabled).toBe(true)
  })

  it('ignores every environment override', () => {
    const profile = resolveRuntimeProfile(true, { VIEZAN_LOCAL_PORT: '45000', VIEZAN_DEV_TRAY: '1' })

    expect(profile.localServerPort).toBe(RELEASE_LOCAL_SERVER_PORT)
    expect(profile.userDataDirName).toBeNull()
  })
})

describe('resolveRuntimeProfile — development run', () => {
  it('is isolated from the official build: own userData, own port, visibly labelled', () => {
    const profile = resolveRuntimeProfile(false)

    expect(profile.channel).toBe('dev')
    expect(profile.isDev).toBe(true)
    expect(profile.userDataDirName).toBe('viezan-dev')
    expect(profile.localServerPort).toBe(DEV_LOCAL_SERVER_PORT)
    expect(profile.localServerPort).not.toBe(RELEASE_LOCAL_SERVER_PORT)
    expect(profile.windowTitle).toBe('Viezan (Dev)')
    expect(profile.appName).not.toBe(resolveRuntimeProfile(true).appName)
  })

  it('uses a userData folder name that differs from the default one even on case-insensitive filesystems', () => {
    const dev = resolveRuntimeProfile(false).userDataDirName?.toLowerCase()
    expect(dev).toBeDefined()
    expect(dev).not.toBe('viezan')
  })

  it('does not stay resident in the tray unless explicitly requested', () => {
    expect(resolveRuntimeProfile(false).trayEnabled).toBe(false)
    expect(resolveRuntimeProfile(false, { VIEZAN_DEV_TRAY: '1' }).trayEnabled).toBe(true)
    expect(resolveRuntimeProfile(false, { VIEZAN_DEV_TRAY: 'true' }).trayEnabled).toBe(false)
  })

  it('accepts a valid VIEZAN_LOCAL_PORT override', () => {
    expect(resolveRuntimeProfile(false, { VIEZAN_LOCAL_PORT: '39875' }).localServerPort).toBe(39875)
    expect(resolveRuntimeProfile(false, { VIEZAN_LOCAL_PORT: ' 45000 ' }).localServerPort).toBe(45000)
  })

  it.each(['', 'abc', '80', '70000', '39875abc', '-1', '1.5'])(
    'falls back to the dev port for an invalid override %j',
    (value) => {
      expect(resolveRuntimeProfile(false, { VIEZAN_LOCAL_PORT: value }).localServerPort).toBe(DEV_LOCAL_SERVER_PORT)
    },
  )
})
