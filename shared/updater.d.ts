export interface UpdateStatus {
  type: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error-codesign' | 'error'
  version?: string
  percent?: number
  bytesPerSecond?: number
  transferred?: number
  total?: number
  installMode?: 'restart' | 'open-installer'
  error?: string
  downloadUrl?: string
  background?: boolean
}
