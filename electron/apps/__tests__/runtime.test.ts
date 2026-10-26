// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppActionRequest, AppRemovalPlan } from '../../../shared/appsApi'
import { createAppsRuntime } from '../runtime'

const mocks = vi.hoisted(() => ({ inventory: vi.fn(), residues: vi.fn(), execute: vi.fn(), finish: vi.fn(), running: vi.fn(), quit: vi.fn(), confirm: vi.fn(), command: vi.fn() }))
vi.mock('../inventory', () => ({ inventory: mocks.inventory }))
vi.mock('../residues', () => ({ residues: mocks.residues }))
vi.mock('../../fileActions/native', () => ({
  createNativeFiles: () => ({ available: () => true, running: mocks.running, quit: mocks.quit }),
  runFile: mocks.command,
}))
vi.mock('../../fileActions/service', async importOriginal => ({
  ...await importOriginal<typeof import('../../fileActions/service')>(),
  createFileActions: () => ({ execute: mocks.execute, finish: mocks.finish, sessions: async () => [] }),
}))
const app = { id: '00000000-0000-4000-8000-000000000001', name: 'Synthetic', bundleId: 'org.example.app', teamId: 'TEAM', path: '/Applications/Synthetic.app', version: '1', executable: 'Synthetic' }
const bundle = { id: 'bundle', path: app.path, kind: 'bundle', evidence: 'exact', selected: true, bytes: 1 }
const data = { id: 'data', path: '/Users/fixture/Library/Caches/org.example.app', kind: 'data', evidence: 'exact', selected: true, bytes: 1 }
function runtime(platform = 'darwin') {
  return createAppsRuntime({ home: '/Users/fixture', userData: '/private/tmp/unused', ownBundle: '/Applications/Viezan.app', binary: '/fake', uid: 501, platform, confirm: mocks.confirm, reveal: () => {} })
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.inventory.mockResolvedValue([app])
  mocks.residues.mockImplementation(async () => ({ items: [{ ...bundle }, { ...data }], incomplete: false }))
  mocks.command.mockResolvedValue({ stdout: 'MDM enrollment: No' })
  mocks.running.mockResolvedValue(false)
  mocks.confirm.mockResolvedValue(true)
  mocks.execute.mockResolvedValue({ id: 'session' })
  mocks.finish.mockResolvedValue({ id: 'session', remaining: 0 })
})
async function preview(rt: ReturnType<typeof runtime>) {
  rt.start()
  await rt.api.inventory()
  const result = await rt.api.inspect(app.id)
  if (!result.success) throw new Error(result.error)
  return result.data
}
const request = (plan: AppRemovalPlan): AppActionRequest => ({ planId: plan.id, itemIds: ['bundle', 'data'], action: 'uninstall', quit: true, locale: 'en' })
describe('removal plan authorization and lifecycle', () => {
  it('does not scan or mutate on an unsupported or disabled module', async () => {
    expect(await runtime('win32').api.inventory()).toEqual({ success: false, error: 'unsupported' })
    expect(await runtime().api.inventory()).toEqual({ success: false, error: 'disabled' })
    expect(mocks.inventory).not.toHaveBeenCalled()
  })
  it('rejects stale and unrecognized item IDs before confirmation', async () => {
    const rt = runtime(); const plan = await preview(rt)
    expect(await rt.api.apply({ ...request(plan), itemIds: ['/etc/passwd'] })).toMatchObject({ success: false, error: 'stale' })
    await rt.api.inventory()
    expect(await rt.api.apply(request(plan))).toMatchObject({ success: false, error: 'stale' })
    expect(mocks.confirm).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('requires confirmation and rechecks module state after the dialog', async () => {
    const rt = runtime(); const plan = await preview(rt)
    mocks.confirm.mockResolvedValueOnce(false)
    expect(await rt.api.apply(request(plan))).toMatchObject({ success: false, error: 'cancelled' })
    mocks.confirm.mockImplementationOnce(async () => { rt.stop(); return true })
    expect(await rt.api.apply(request(plan))).toMatchObject({ success: false, error: 'disabled' })
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('refuses bundle deletion in reset mode', async () => {
    const rt = runtime(); const plan = await preview(rt)
    expect(await rt.api.apply({ ...request(plan), action: 'reset' })).toMatchObject({ success: false, error: 'stale' })
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('does not mutate when a running app cannot quit normally', async () => {
    const rt = runtime(); const plan = await preview(rt)
    mocks.running.mockResolvedValue(true); mocks.quit.mockRejectedValue(new Error('unsaved dialog'))
    expect(await rt.api.apply(request(plan))).toMatchObject({ success: false })
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('aborts before any mutation if ownership becomes shared after approval', async () => {
    const rt = runtime(); const plan = await preview(rt)
    mocks.residues.mockResolvedValue({ items: [bundle, { ...data, blocked: 'shared' }], incomplete: false })
    expect(await rt.api.apply(request(plan))).toMatchObject({ success: false, error: 'shared' })
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('refuses incomplete initial or repeated scans', async () => {
    const rt = runtime(); const plan = await preview(rt)
    mocks.residues.mockResolvedValue({ items: [bundle, data], incomplete: true })
    expect(await rt.api.apply(request(plan))).toMatchObject({ success: false, error: 'unreadable' })
    expect(mocks.execute).not.toHaveBeenCalled()
    const incomplete = await rt.api.inspect(app.id)
    if (!incomplete.success) throw new Error('Expected preview')
    mocks.confirm.mockClear()
    expect(await rt.api.apply(request(incomplete.data))).toMatchObject({ success: false, error: 'unreadable' })
    expect(mocks.confirm).not.toHaveBeenCalled()
  })
  it('checks enrollment again after confirmation and refuses unknown status', async () => {
    const rt = runtime(); const plan = await preview(rt)
    mocks.command.mockResolvedValueOnce({ stdout: 'MDM enrollment: Yes' })
    expect(await rt.api.apply(request(plan))).toMatchObject({ success: false, error: 'protected' })
    mocks.command.mockResolvedValueOnce({ stdout: '' })
    expect(await rt.api.apply(request(plan))).toMatchObject({ success: false, error: 'unreadable' })
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('consumes successful plans and reports incomplete post-operation verification', async () => {
    const rt = runtime(); const plan = await preview(rt)
    mocks.residues.mockResolvedValueOnce({ items: [bundle, data], incomplete: false }).mockResolvedValueOnce({ items: [], incomplete: true })
    expect(await rt.api.apply(request(plan))).toMatchObject({ success: true })
    expect(mocks.finish).toHaveBeenCalledWith({ id: 'session' }, null)
    expect(await rt.api.apply(request(plan))).toMatchObject({ success: false, error: 'stale' })
  })
  it('conservatively blocks managed devices', async () => {
    mocks.command.mockResolvedValue({ stdout: 'MDM enrollment: Yes (User Approved)' })
    const rt = runtime(); rt.start()
    expect(await rt.api.inventory()).toMatchObject({ success: true, data: [{ blocked: 'protected' }] })
  })
})
