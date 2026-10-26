import type { WorkbenchFeature } from '../types/workbench'

const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const strings = (value: Record<string, unknown>, keys: string[]) => keys.every((key) => typeof value[key] === 'string')
const nullableString = (value: unknown) => value === null || typeof value === 'string'
const timestamp = (value: unknown) => value === null || (typeof value === 'number' && Number.isFinite(value))
const provider = (value: unknown) => ['local', 'gemini', 'claude', 'openai'].includes(String(value))

function image(value: unknown): boolean {
  return value === null || (object(value) && strings(value, ['base64', 'mimeType', 'previewDataUrl', 'fileName'])
    && typeof value.width === 'number' && typeof value.height === 'number')
}

function resultContext(value: unknown): boolean {
  return value === null || (object(value)
    && strings(value, ['sourceText', 'sourceLang', 'targetLang', 'modelsKey', 'translationStyle', 'reasoningEffort'])
    && image(value.imageAttachment))
}

function snapshot(feature: WorkbenchFeature, value: unknown): boolean {
  if (!object(value) || !strings(value, ['sourceLang', 'targetLang'])) return false
  if (feature === 'dictionary') return strings(value, ['term', 'context'])
    && nullableString(value.selectedEntryId) && ['recent', 'favorites'].includes(String(value.activeListTab))
  return strings(value, ['sourceText', 'translatedText', 'phoneticText', 'translationStyle', 'translationReasoningEffort'])
    && Array.isArray(value.translationModels) && value.translationModels.length > 0
    && value.translationModels.every((model) => object(model) && provider(model.provider) && typeof model.model === 'string')
    && Array.isArray(value.comparisonResults) && value.comparisonResults.every((result) => object(result)
      && provider(result.provider) && strings(result, ['model', 'key', 'translatedText'])
      && ['idle', 'loading', 'success', 'error'].includes(String(result.status)))
    && image(value.imageAttachment) && (value.imageRegions === null || Array.isArray(value.imageRegions))
    && nullableString(value.editedImageUrl) && nullableString(value.activeHistoryId)
    && nullableString(value.selectedComparisonKey) && nullableString(value.detectedSourceLang)
    && resultContext(value.resultContext)
}

export function validWorkbenchRecords(value: unknown): boolean {
  if (!object(value)) return false
  return Object.entries(value).every(([feature, record]) => {
    if (feature !== 'translate' && feature !== 'dictionary') return false
    return object(record) && record.version === 1 && typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
      && timestamp(record.awayAt) && timestamp(record.completedAt) && snapshot(feature, record.snapshot)
      && (record.previous === null || snapshot(feature, record.previous))
  })
}
