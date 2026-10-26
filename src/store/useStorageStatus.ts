import { create } from 'zustand'

/** Kept outside persisted state: reporting a failed write must not cause another write. */
export const useStorageStatus = create<{
  settingsFailed: boolean
  recoveryFailed: boolean
  recoveryReadFailed: boolean
}>(() => ({ settingsFailed: false, recoveryFailed: false, recoveryReadFailed: false }))
