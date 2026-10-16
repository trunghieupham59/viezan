export type LocalAiExecutionMode = 'gpu' | 'hybrid'

export interface LocalAiPerformanceProfile {
  model: string
  mode: LocalAiExecutionMode
  numGpuLayers: number
  contextLength: number
}

export interface LocalAiPerformanceMeasurement {
  mode: LocalAiExecutionMode
  profile: LocalAiPerformanceProfile
  status: 'ok' | 'error'
  error?: string
  tokensPerSecond?: number
  firstTokenMs?: number
  loadMs?: number
  gpuPercent?: number
  vramBytes?: number
  modelRamBytes?: number
  qualityPassed?: boolean
  sampleCount?: number
  runnerRecoveries?: number
  runnerRecoveryErrors?: string[]
}

export interface LocalAiPerformanceComparison {
  model: string
  measuredAt: string
  results: LocalAiPerformanceMeasurement[]
  recommendedMode?: LocalAiExecutionMode
}

export interface LocalAiPerformanceState {
  comparison?: LocalAiPerformanceComparison
  selection?: LocalAiPerformanceProfile
  running?: boolean
}

export interface LocalAiPerformanceRequest {
  model: string
  consentToReload: true
}
