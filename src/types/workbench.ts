import type { ImageTextRegion, TranslationComparisonResult, TranslationModelSelection, TranslationReasoningEffort, TranslationStyle } from './index'

export interface ImageAttachment {
  base64: string
  mimeType: string
  width: number
  height: number
  previewDataUrl: string
  fileName: string
}

export interface TranslationResultContext {
  sourceText: string
  imageAttachment: ImageAttachment | null
  sourceLang: string
  targetLang: string
  modelsKey: string
  translationStyle: string
  reasoningEffort: string
}

/** Only recoverable content; requests, recording, menus and errors stay transient. */
export interface TranslateSnapshot {
  sourceText: string
  translatedText: string
  phoneticText: string
  sourceLang: string
  targetLang: string
  translationModels: TranslationModelSelection[]
  translationStyle: TranslationStyle
  translationReasoningEffort: TranslationReasoningEffort
  imageAttachment: ImageAttachment | null
  imageRegions: ImageTextRegion[] | null
  editedImageUrl: string | null
  comparisonResults: TranslationComparisonResult[]
  selectedComparisonKey: string | null
  activeHistoryId: string | null
  resultContext: TranslationResultContext | null
  detectedSourceLang: string | null
}

export interface DictionarySnapshot {
  term: string
  context: string
  sourceLang: string
  targetLang: string
  selectedEntryId: string | null
  activeListTab: 'recent' | 'favorites'
}

export interface WorkbenchSnapshots {
  translate: TranslateSnapshot
  dictionary: DictionarySnapshot
}

export type WorkbenchFeature = keyof WorkbenchSnapshots
export interface WorkbenchRecord<K extends WorkbenchFeature> {
  version: 1
  snapshot: WorkbenchSnapshots[K]
  previous: WorkbenchSnapshots[K] | null
  awayAt: number | null
  completedAt: number | null
  updatedAt: number
}
