import { useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { AppLogoIcon } from '../components/AppLogo'
import { MessageBubble } from '../components/chat/MessageBubble'
import { ResearchStepsPanel } from '../components/chat/ResearchStepsPanel'
import { SystemPromptDropdown } from '../components/chat/SystemPromptDropdown'
import { ModelSelector } from '../components/ModelSelector'
import { ProviderIcon } from '../components/ProviderIcon'
import { DragOverlay } from '../components/ui/DragOverlay'
import { ImagePreviewThumbnail } from '../components/ui/ImagePreviewThumbnail'
import {
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ImageIcon,
  LightbulbIcon,
  PlusIcon,
  SendIcon,
  StopSquareIcon,
  TrashIcon,
  XIcon,
} from '../components/ui/icons'
import { VoiceRecorder } from '../components/VoiceRecorder'
import { MAX_CHAT_IMAGE_DIMENSION, MAX_IMAGE_INPUT_BYTES } from '../constants/image'
import { COPY_FEEDBACK_DURATION_MS } from '../constants/ui'
import { useVoiceInput } from '../hooks/useVoiceInput'
import { chatService } from '../services/chatService'
import { DEEP_RESEARCH_CANCELLED_ERROR, deepResearchService } from '../services/deepResearchService'
import { smartThinkingService } from '../services/smartThinkingService'
import { useAppStore, useT } from '../store/useAppStore'
import type { ChatMessage, ChatMessageContent, ChatSession, DeepResearchResumeState } from '../types'
import { localizeChatError, localizeChatException } from '../utils/chatErrors'
import { createClientId } from '../utils/id'
import { extractImageFromClipboard, resizeImageFile } from '../utils/imageUtils'
import { eventMatchesShortcut, shouldSendChatMessage } from '../utils/keyboardShortcuts'
import { formatModelName } from '../utils/modelDisplay'
import { formatTimeAgo } from '../utils/relativeTime'
import { estimateUsageCost } from '../utils/usageCost'

const CHAT_TEXTAREA_MAX_HEIGHT_PX = 160
const CHAT_STREAM_BUFFER_INTERVAL_MS = 60
const VOICE_BAR_HEIGHT_BASE_PX = 6
const VOICE_BAR_HEIGHT_STEP_PX = 4
const VOICE_BAR_DURATION_BASE_S = 0.5
const VOICE_BAR_DURATION_STEP_S = 0.1
const VOICE_BAR_DELAY_STEP_S = 0.05

function toIpcMessage(msg: ChatMessage) {
  const content = msg.content
    .filter((c) => msg.role === 'user' || c.type === 'text')
    .map((c) => ({ type: c.type, text: c.text, imageBase64: c.imageBase64, imageMimeType: c.imageMimeType }))
  return { role: msg.role, content }
}

function toIpcHistory(messages: ChatMessage[]) {
  return messages
    .filter((m) => !m.isLoading && !m.error && !m.isResearchStep && !m.isSmartThinkingStep)
    .map(toIpcMessage)
}

function flattenChatCostInput(messages: ReturnType<typeof toIpcHistory>, systemPrompt?: string): string {
  const messageText = messages
    .flatMap((m) => m.content.map((c) => c.text ?? (c.type === 'image' ? '[image]' : '')))
    .filter(Boolean)
    .join('\n')
  return [systemPrompt, messageText].filter(Boolean).join('\n')
}

const IMAGE_EDIT_INTENT_PATTERN = new RegExp([
  '\\b(edit|change|modify|retouch|remove|replace|add|turn|make|convert|transform|erase|fill|extend|upscale|enhance|recolor)\\b',
  '(sửa|chỉnh|đổi|thay|xóa|xoá|bỏ|thêm|chuyển|biến|làm|tạo|ghép)',
  '(編集|変更|修正|削除|追加)',
].join('|'), 'i')

function shouldRouteToImageEdit(text: string, hasImage: boolean) { return hasImage && IMAGE_EDIT_INTENT_PATTERN.test(text) }
function buildImageDataUrl(b64: string, mime: string) { return `data:${mime};base64,${b64}` }
function getChatImageUrl(c: ChatMessageContent): string | null {
  return c.imagePreviewUrl ?? (c.imageBase64 && c.imageMimeType ? buildImageDataUrl(c.imageBase64, c.imageMimeType) : null)
}
function imageExtensionFromMime(mimeType?: string) {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType?.startsWith('image/')) return mimeType.replace('image/', '')
  return 'png'
}

async function imageUrlToPngBlob(imageUrl: string): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Failed to load image'))
    el.src = imageUrl
  })
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  if (!w || !h) throw new Error('Invalid image dimensions')
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(img, 0, 0, w, h)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Encode failed')), 'image/png')
  })
}

async function copyImageToClipboard(imageUrl: string): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    await navigator.clipboard?.writeText?.(imageUrl)
    return
  }
  const blob = await imageUrlToPngBlob(imageUrl)
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
}

// ─── Session Panel ────────────────────────────────────────────────────────────

interface SessionPanelProps {
  sessions: ChatSession[]
  activeChatSessionId: string | null
  onSelect: (id: string | null) => void
  onNew: () => void
  onDelete: (id: string) => void
  t: ReturnType<typeof useT>
}

function SessionPanel({ sessions, activeChatSessionId, onSelect, onNew, onDelete, t }: SessionPanelProps) {
  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <aside
      className="flex flex-shrink-0 flex-col"
      style={{ width: 220, borderRight: '1px solid var(--vzn-border)', background: 'var(--vzn-surface)' }}
    >
      {/* New chat button */}
      <div className="flex-shrink-0 px-3 pt-3 pb-2">
        <button
          type="button"
          onClick={onNew}
          className="btn-primary flex w-full items-center justify-center gap-1.5 py-2 text-sm"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          {t.chat_new_session}
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-px">
        {sorted.length === 0 ? (
          <p className="px-2 py-6 text-center ui-caption leading-relaxed">
            {t.chat_session_panel_empty}
          </p>
        ) : (
          sorted.map((session) => {
            const isActive = session.id === activeChatSessionId
            const msgCount = session.messages.filter((m) => !m.isLoading && !m.error).length
            const timeStr = formatTimeAgo(session.updatedAt, t)

            return (
              <button
                key={session.id}
                type="button"
                onClick={() => onSelect(session.id)}
                className="group relative flex w-full cursor-pointer flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition-all duration-150 outline-none"
                style={{
                  background: isActive ? 'var(--vzn-accent-soft)' : 'transparent',
                  boxShadow: isActive ? 'inset 2px 0 0 var(--vzn-accent)' : 'none',
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--vzn-surface-muted)' }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <ProviderIcon provider={session.provider} size={11} />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold leading-snug" style={{ color: isActive ? 'var(--vzn-accent)' : 'var(--vzn-text-strong)' }}>
                    {session.title}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDelete(session.id) }}
                    className="shrink-0 rounded p-0.5 opacity-0 transition-all duration-150 group-hover:opacity-100"
                    style={{ color: 'var(--vzn-text-soft)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--vzn-danger-soft)'; e.currentTarget.style.color = 'var(--vzn-danger)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--vzn-text-soft)' }}
                    aria-label={t.history_chat_delete}
                  >
                    <TrashIcon className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex items-center gap-1" style={{ color: 'var(--vzn-text-soft)' }}>
                  <span className="text-[10px]">{timeStr}</span>
                  {msgCount > 0 && (
                    <>
                      <span className="text-[10px]">·</span>
                      <span className="text-[10px]">{msgCount}</span>
                    </>
                  )}
                  {session.deepResearchResumeState && session.deepResearchResumeState.lastCompletedPhase !== 'synth' && (
                    <>
                      <span className="text-[10px]">·</span>
                      <LightbulbIcon className="h-2.5 w-2.5 text-yellow-400" />
                    </>
                  )}
                </div>
              </button>
            )
          })
        )}
      </div>
    </aside>
  )
}

// ─── Suggestion chips data ────────────────────────────────────────────────────

const SUGGESTION_ICONS = ['🌐', '🔍', '💡', '✍️'] as const

// ─── Main ChatPageV2 ──────────────────────────────────────────────────────────

export function ChatPageV2() {
  const {
    selectedProvider, selectedModels, keyStatus,
    chatSendShortcut, chatNewSessionShortcut,
    chatSessions, activeChatSessionId, chatSystemPrompt, systemPromptPresets,
    createChatSession, setActiveChatSession, addChatMessage, updateChatMessage,
    addChatSessionCost, clearChatSession, setChatSystemPrompt, addSystemPromptPreset, openSettings,
    recordUsageCost, setDeepResearchResumeState, deleteChatSession,
    setChatSessionDraft, setChatSessionDeepResearchMode,
    setChatPendingDraft, setChatPendingDeepResearchMode,
  } = useAppStore(
    useShallow((s) => ({
      selectedProvider: s.selectedProvider,
      selectedModels: s.selectedModels,
      keyStatus: s.keyStatus,
      chatSendShortcut: s.chatSendShortcut,
      chatNewSessionShortcut: s.chatNewSessionShortcut,
      chatSessions: s.chatSessions,
      activeChatSessionId: s.activeChatSessionId,
      chatSystemPrompt: s.chatSystemPrompt,
      systemPromptPresets: s.systemPromptPresets,
      createChatSession: s.createChatSession,
      setActiveChatSession: s.setActiveChatSession,
      addChatMessage: s.addChatMessage,
      updateChatMessage: s.updateChatMessage,
      addChatSessionCost: s.addChatSessionCost,
      clearChatSession: s.clearChatSession,
      setChatSystemPrompt: s.setChatSystemPrompt,
      addSystemPromptPreset: s.addSystemPromptPreset,
      openSettings: s.openSettings,
      recordUsageCost: s.recordUsageCost,
      setDeepResearchResumeState: s.setDeepResearchResumeState,
      deleteChatSession: s.deleteChatSession,
      setChatSessionDraft: s.setChatSessionDraft,
      setChatSessionDeepResearchMode: s.setChatSessionDeepResearchMode,
      setChatPendingDraft: s.setChatPendingDraft,
      setChatPendingDeepResearchMode: s.setChatPendingDeepResearchMode,
    })),
  )

  const t = useT()

  const [inputText, setInputTextLocal] = useState(() => {
    const s = useAppStore.getState()
    if (s.activeChatSessionId) return s.chatSessions.find((x) => x.id === s.activeChatSessionId)?.draftInput ?? ''
    return s.chatPendingDraft
  })
  const setInputText = useCallback((text: string) => {
    setInputTextLocal(text)
    const sid = useAppStore.getState().activeChatSessionId
    if (sid) setChatSessionDraft(sid, text)
    else setChatPendingDraft(text)
  }, [setChatSessionDraft, setChatPendingDraft])

  const [isSending, setIsSending] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [attachedImage, setAttachedImage] = useState<{
    base64: string; mimeType: string; previewUrl: string; fileName: string
  } | null>(null)
  const [attachImageError, setAttachImageError] = useState<string | null>(null)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [showAIConfig, setShowAIConfig] = useState(false)
  const [showSessionPanel, setShowSessionPanel] = useState(true)
  const [deepResearchMode, setDeepResearchModeLocal] = useState(() => {
    const s = useAppStore.getState()
    if (s.activeChatSessionId) return s.chatSessions.find((x) => x.id === s.activeChatSessionId)?.deepResearchMode ?? false
    return s.chatPendingDeepResearchMode
  })
  const setDeepResearchMode = useCallback((updater: boolean | ((v: boolean) => boolean)) => {
    setDeepResearchModeLocal((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      const sid = useAppStore.getState().activeChatSessionId
      if (sid) setChatSessionDeepResearchMode(sid, next)
      else setChatPendingDeepResearchMode(next)
      return next
    })
  }, [setChatSessionDeepResearchMode, setChatPendingDeepResearchMode])

  const activePreset = systemPromptPresets.find((p) => p.content === chatSystemPrompt) ?? null
  const platform = window.api?.platform

  const { isVoiceActive, isVoiceInterim, voicePrefixRef: _voicePrefixRef, handleVoiceRecordingChange, handleVoiceTranscript, resetVoicePrefix } =
    useVoiceInput({ currentText: inputText, onTextChange: setInputText })

  const hasKey = selectedProvider === 'local' || keyStatus[selectedProvider]
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const aiConfigRef = useRef<HTMLDivElement>(null)

  const activeSession = chatSessions.find((s) => s.id === activeChatSessionId) ?? null

  const recordChatCost = useCallback((sessionId: string, messageId: string, inputTxt: string, reply: string) => {
    const cost = estimateUsageCost({
      feature: 'chat', provider: selectedProvider, model: selectedModels[selectedProvider],
      inputText: inputTxt, outputText: reply,
    })
    recordUsageCost(cost)
    addChatSessionCost(sessionId, cost)
    updateChatMessage(sessionId, messageId, { cost })
  }, [addChatSessionCost, recordUsageCost, selectedProvider, selectedModels, updateChatMessage])

  const msgCount = activeSession?.messages.length ?? 0
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new message count
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }) }, [msgCount])

  // biome-ignore lint/correctness/useExhaustiveDependencies: inputText triggers textarea resize
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, CHAT_TEXTAREA_MAX_HEIGHT_PX)}px`
  }, [inputText])

  useEffect(() => {
    const s = useAppStore.getState()
    if (activeChatSessionId) {
      const session = s.chatSessions.find((x) => x.id === activeChatSessionId)
      setInputTextLocal(session?.draftInput ?? '')
      setDeepResearchModeLocal(session?.deepResearchMode ?? false)
    } else {
      setInputTextLocal(s.chatPendingDraft)
      setDeepResearchModeLocal(s.chatPendingDeepResearchMode)
    }
    setAttachedImage(null)
  }, [activeChatSessionId])

  useEffect(() => {
    if (!showAIConfig) return
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Element
      // The model picker is portaled to document.body, so it sits outside aiConfigRef.
      if (target.closest?.('.model-picker-panel')) return
      if (aiConfigRef.current && !aiConfigRef.current.contains(target)) setShowAIConfig(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [showAIConfig])

  const ensureSession = useCallback(() => {
    if (activeChatSessionId && chatSessions.find((s) => s.id === activeChatSessionId)) return activeChatSessionId
    return createChatSession(selectedProvider, selectedModels[selectedProvider])
  }, [activeChatSessionId, chatSessions, createChatSession, selectedProvider, selectedModels])

  const handleImageSelect = useCallback(async (file: File) => {
    setAttachImageError(null)
    if (file.size > MAX_IMAGE_INPUT_BYTES) {
      setAttachImageError(t.image_translate_size_error(Math.round(MAX_IMAGE_INPUT_BYTES / (1024 * 1024))))
      return
    }
    try {
      const result = await resizeImageFile(file, MAX_CHAT_IMAGE_DIMENSION)
      setAttachedImage(result)
    } catch (err) {
      setAttachImageError(err instanceof Error ? err.message : t.image_translate_error_failed)
    }
  }, [t.image_translate_error_failed, t.image_translate_size_error])

  const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDraggingOver(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setAttachImageError(t.image_translate_type_error); return }
    handleImageSelect(file)
  }, [handleImageSelect, t])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingOver(false)
  }, [])

  const handleRegenerate = useCallback(async () => {
    if (isSending || !activeChatSessionId) return
    const session = useAppStore.getState().chatSessions.find((s) => s.id === activeChatSessionId)
    if (!session) return
    const msgs = session.messages
    const lastAssistantIdx = [...msgs].map((m, i) => ({ m, i })).reverse().find(({ m }) => m.role === 'assistant')
    if (!lastAssistantIdx) return
    const assistantMsgId = lastAssistantIdx.m.id
    const historyMessages = msgs.slice(0, lastAssistantIdx.i).filter((m) => !m.isLoading && !m.error && !m.isResearchStep && !m.isSmartThinkingStep)
    if (historyMessages.length === 0) return
    const controller = new AbortController()
    abortControllerRef.current = controller
    setIsSending(true)
    updateChatMessage(activeChatSessionId, assistantMsgId, { content: [{ type: 'text', text: '' }], isLoading: true, error: undefined, timestamp: Date.now() })
    try {
      let streamedText = ''
      const result = await chatService.stream(
        { provider: selectedProvider, model: selectedModels[selectedProvider], messages: historyMessages.map(toIpcMessage), systemPrompt: chatSystemPrompt || undefined, carefulReasoning: true },
        { bufferIntervalMs: CHAT_STREAM_BUFFER_INTERVAL_MS, onToken: (token) => { streamedText += token; updateChatMessage(activeChatSessionId, assistantMsgId, { content: [{ type: 'text', text: streamedText }], isLoading: true, error: undefined }) }, signal: controller.signal },
      )
      if (result.errorCode === 'CANCELLED' || controller.signal.aborted) {
        updateChatMessage(activeChatSessionId, assistantMsgId, { content: [{ type: 'text', text: streamedText }], isLoading: false })
      } else if (result.success && result.reply) {
        updateChatMessage(activeChatSessionId, assistantMsgId, { content: [{ type: 'text', text: result.reply }], isLoading: false })
        recordChatCost(activeChatSessionId, assistantMsgId, flattenChatCostInput(historyMessages.map(toIpcMessage), chatSystemPrompt || undefined), result.reply)
      } else {
        updateChatMessage(activeChatSessionId, assistantMsgId, { isLoading: false, error: localizeChatError(t, result, t.chat_error_failed_regenerate) })
      }
    } catch (err) {
      updateChatMessage(activeChatSessionId, assistantMsgId, controller.signal.aborted ? { isLoading: false } : { isLoading: false, error: localizeChatException(t, err, t.chat_error_unexpected) })
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null
      setIsSending(false)
    }
  }, [isSending, activeChatSessionId, updateChatMessage, selectedProvider, selectedModels, chatSystemPrompt, recordChatCost, t])

  const runDeepResearchPipeline = useCallback(async ({ sessionId, question, images, resumeState }: { sessionId: string; question: string; images: { imageBase64: string; imageMimeType: string }[]; resumeState?: DeepResearchResumeState }) => {
    const drController = new AbortController()
    abortControllerRef.current = drController
    setIsSending(true)
    try {
      await deepResearchService.run({
        signal: drController.signal, provider: selectedProvider, model: selectedModels[selectedProvider],
        question, carefulReasoning: true, images: images.length > 0 ? images : undefined, resumeState,
        uiText: {
          stepAnalyze: t.chat_deep_research_step_analyze, stepRound1: t.chat_deep_research_step_round1,
          stepGap: t.chat_deep_research_step_gap, stepDeep: t.chat_deep_research_step_deep,
          stepCross: t.chat_deep_research_step_cross, stepSynth: t.chat_deep_research_step_synth,
          modeRealtime: t.chat_deep_research_mode_realtime, modeAiOnly: t.chat_deep_research_mode_ai_only,
          willStudy: t.chat_deep_research_will_study, imageContext: t.chat_deep_research_image_context,
          imageTerms: t.chat_deep_research_image_terms, imageKbLabel: t.chat_deep_research_image_kb_label,
          complete: t.chat_deep_research_complete, gapsFound: t.chat_deep_research_gaps_found,
          deeperLabel: t.chat_deep_research_deeper_label, cannotAnalyze: t.chat_deep_research_cannot_analyze,
          cannotResearch: t.chat_deep_research_cannot_research, crossFailed: t.chat_deep_research_cross_failed,
          crossFailedInline: t.chat_deep_research_cross_failed_inline, synthFailed: t.chat_deep_research_synth_failed,
          errorInline: t.chat_deep_research_error_inline, errorAnalyze: t.chat_deep_research_error_analyze,
          errorGeneric: t.chat_deep_research_error_generic, errorEval: t.chat_deep_research_error_eval,
          errorCross: t.chat_deep_research_error_cross, errorSynth: t.chat_deep_research_error_synth,
          errorUnknown: t.chat_deep_research_error_unknown, webSummary: t.chat_deep_research_web_summary,
        },
        callbacks: {
          onStepStart: (label, meta) => {
            const msgId = createClientId('msg-dr')
            addChatMessage(sessionId, { id: msgId, role: 'assistant', content: [{ type: 'text', text: '' }], timestamp: Date.now(), isLoading: true, isResearchStep: true, researchStepLabel: label, researchStepPhase: meta.phase, researchStepAspect: meta.aspect })
            return msgId
          },
          onStepComplete: (msgId, content, isFinal) => {
            updateChatMessage(sessionId, msgId, { content: [{ type: 'text', text: content }], isLoading: false, isResearchStep: !isFinal, isResearchFinal: isFinal, ...(isFinal ? { researchStepLabel: undefined } : {}) })
            if (isFinal) recordChatCost(sessionId, msgId, question, content)
          },
          onStepError: (msgId, error) => {
            updateChatMessage(sessionId, msgId, { isLoading: false, error: error === DEEP_RESEARCH_CANCELLED_ERROR ? undefined : localizeChatException(t, error, t.chat_error_failed_response), isResearchStep: true })
          },
          onResumeStateChange: (state) => setDeepResearchResumeState(sessionId, state),
        },
      })
    } catch { /* per-step callbacks handle errors */ } finally {
      if (abortControllerRef.current === drController) abortControllerRef.current = null
      setIsSending(false)
    }
  }, [selectedProvider, selectedModels, addChatMessage, updateChatMessage, recordChatCost, setDeepResearchResumeState, t])

  const handleResumeDeepResearch = useCallback(async () => {
    if (isSending || !activeChatSessionId) return
    const session = useAppStore.getState().chatSessions.find((s) => s.id === activeChatSessionId)
    const resumeState = session?.deepResearchResumeState
    if (!resumeState) return
    await runDeepResearchPipeline({ sessionId: activeChatSessionId, question: resumeState.question, images: [], resumeState })
  }, [isSending, activeChatSessionId, runDeepResearchPipeline])

  const handleSend = useCallback(async () => {
    const text = inputText.trim()
    if ((!text && !attachedImage) || isSending || !hasKey) return
    const sessionId = ensureSession()
    const userContent: ChatMessageContent[] = []
    if (attachedImage) userContent.push({ type: 'image', imageBase64: attachedImage.base64, imageMimeType: attachedImage.mimeType, imagePreviewUrl: attachedImage.previewUrl, imageFileName: attachedImage.fileName })
    if (text) userContent.push({ type: 'text', text })
    const userMsg: ChatMessage = { id: createClientId('msg-u'), role: 'user', content: userContent, timestamp: Date.now() }
    if (deepResearchMode && (text || attachedImage)) {
      addChatMessage(sessionId, userMsg)
      setDeepResearchResumeState(sessionId, null)
      setInputText('')
      setAttachedImage(null)
      await runDeepResearchPipeline({ sessionId, question: text || t.chat_deep_research_image_only_prompt, images: attachedImage ? [{ imageBase64: attachedImage.base64, imageMimeType: attachedImage.mimeType }] : [] })
      return
    }
    addChatMessage(sessionId, userMsg)
    setDeepResearchResumeState(sessionId, null)
    setInputText('')
    setAttachedImage(null)
    const sendController = new AbortController()
    abortControllerRef.current = sendController
    setIsSending(true)
    const ipcHistory = toIpcHistory(useAppStore.getState().chatSessions.find((s) => s.id === sessionId)?.messages ?? [])
    if (text && !attachedImage) {
      const placeholderMsgId = createClientId('msg-a')
      addChatMessage(sessionId, { id: placeholderMsgId, role: 'assistant', content: [{ type: 'text', text: '' }], timestamp: Date.now(), isLoading: true })
      try {
        await smartThinkingService.run({
          signal: sendController.signal, provider: selectedProvider, model: selectedModels[selectedProvider],
          question: text, messages: ipcHistory, systemPrompt: chatSystemPrompt || undefined, carefulReasoning: true,
          uiText: { webSearchStepLabelPrefix: t.chat_smart_thinking_step_label_prefix, webSearchSummaryTitle: t.chat_smart_thinking_summary_title, webSearchDefaultReason: t.chat_smart_thinking_default_reason, webSearchSourcesTitle: t.chat_smart_thinking_sources_title, webSearchNoSources: t.chat_smart_thinking_no_sources, webSearchNoResults: t.chat_smart_thinking_no_results, webSearchErrorFallback: t.chat_smart_thinking_search_error, noResponseError: t.chat_smart_thinking_no_response, unknownError: t.chat_smart_thinking_unknown_error },
          callbacks: {
            onStepStart: (_label) => { updateChatMessage(sessionId, placeholderMsgId, { content: [{ type: 'text', text: '' }], isLoading: true, isSmartThinkingStep: true, researchStepLabel: t.chat_smart_thinking_badge }); return placeholderMsgId },
            onStepComplete: (_msgId, _content) => { updateChatMessage(sessionId, placeholderMsgId, { content: [{ type: 'text', text: '' }], isLoading: true, isSmartThinkingStep: false, researchStepLabel: undefined }) },
            onStepError: (_msgId, _error) => { updateChatMessage(sessionId, placeholderMsgId, { content: [{ type: 'text', text: '' }], isLoading: true, isSmartThinkingStep: false, researchStepLabel: undefined }) },
            onAnswerStart: () => placeholderMsgId,
            onAnswerToken: (_msgId, content) => { updateChatMessage(sessionId, placeholderMsgId, { content: [{ type: 'text', text: content }], isLoading: true, isSmartThinkingStep: false, researchStepLabel: undefined, error: undefined }) },
            onAnswerComplete: (_msgId, content) => { updateChatMessage(sessionId, placeholderMsgId, { content: [{ type: 'text', text: content }], isLoading: false, isSmartThinkingStep: false, researchStepLabel: undefined }); recordChatCost(sessionId, placeholderMsgId, flattenChatCostInput(ipcHistory, chatSystemPrompt || undefined), content) },
            onAnswerError: (_msgId, error, errorCode) => { updateChatMessage(sessionId, placeholderMsgId, { isLoading: false, isSmartThinkingStep: false, researchStepLabel: undefined, error: localizeChatError(t, { error, errorCode }, t.chat_error_failed_response) }) },
          },
        })
      } catch { /* callbacks handle errors */ } finally {
        if (abortControllerRef.current === sendController) abortControllerRef.current = null
        setIsSending(false)
      }
      return
    }
    const shouldEditImage = Boolean(attachedImage && text && shouldRouteToImageEdit(text, true))
    if (attachedImage && shouldEditImage) {
      const assistantMsgId = createClientId('msg-a')
      addChatMessage(sessionId, { id: assistantMsgId, role: 'assistant', content: [{ type: 'text', text: '' }], timestamp: Date.now(), isLoading: true })
      if (typeof window.api.editChatImage !== 'function') {
        updateChatMessage(sessionId, assistantMsgId, { isLoading: false, error: t.chat_error_image_edit_reload_required })
        if (abortControllerRef.current === sendController) abortControllerRef.current = null
        setIsSending(false)
        return
      }
      try {
        const result = await chatService.editImage({ provider: selectedProvider, model: selectedModels[selectedProvider], prompt: text, imageBase64: attachedImage.base64, imageMimeType: attachedImage.mimeType })
        if (sendController.signal.aborted) {
          updateChatMessage(sessionId, assistantMsgId, { isLoading: false })
        } else if (result.success && result.imageBase64 && result.imageMimeType) {
          const outputLabel = t.chat_image_edit_done
          updateChatMessage(sessionId, assistantMsgId, { content: [{ type: 'image', imageBase64: result.imageBase64, imageMimeType: result.imageMimeType, imagePreviewUrl: buildImageDataUrl(result.imageBase64, result.imageMimeType), imageFileName: `edited-image-${Date.now()}.${imageExtensionFromMime(result.imageMimeType)}` }, { type: 'text', text: outputLabel }], isLoading: false })
          recordChatCost(sessionId, assistantMsgId, text, outputLabel)
        } else {
          updateChatMessage(sessionId, assistantMsgId, { isLoading: false, error: localizeChatError(t, result, t.chat_error_failed_image_edit) })
        }
      } catch (err) {
        updateChatMessage(sessionId, assistantMsgId, sendController.signal.aborted ? { isLoading: false } : { isLoading: false, error: localizeChatException(t, err, t.chat_error_failed_image_edit) })
      } finally {
        if (abortControllerRef.current === sendController) abortControllerRef.current = null
        setIsSending(false)
      }
      return
    }
    const assistantMsgId = createClientId('msg-a')
    addChatMessage(sessionId, { id: assistantMsgId, role: 'assistant', content: [{ type: 'text', text: '' }], timestamp: Date.now(), isLoading: true })
    try {
      let streamedText = ''
      const result = await chatService.stream(
        { provider: selectedProvider, model: selectedModels[selectedProvider], messages: ipcHistory, systemPrompt: chatSystemPrompt || undefined, carefulReasoning: true },
        { bufferIntervalMs: CHAT_STREAM_BUFFER_INTERVAL_MS, onToken: (token) => { streamedText += token; updateChatMessage(sessionId, assistantMsgId, { content: [{ type: 'text', text: streamedText }], isLoading: true, error: undefined }) }, signal: sendController.signal },
      )
      if (result.errorCode === 'CANCELLED' || sendController.signal.aborted) {
        updateChatMessage(sessionId, assistantMsgId, { content: [{ type: 'text', text: streamedText }], isLoading: false })
      } else if (result.success && result.reply) {
        updateChatMessage(sessionId, assistantMsgId, { content: [{ type: 'text', text: result.reply }], isLoading: false })
        recordChatCost(sessionId, assistantMsgId, flattenChatCostInput(ipcHistory, chatSystemPrompt || undefined), result.reply)
      } else {
        updateChatMessage(sessionId, assistantMsgId, { isLoading: false, error: localizeChatError(t, result, t.chat_error_failed_response) })
      }
    } catch (err) {
      updateChatMessage(sessionId, assistantMsgId, sendController.signal.aborted ? { isLoading: false } : { isLoading: false, error: localizeChatException(t, err, t.chat_error_unexpected) })
    } finally {
      if (abortControllerRef.current === sendController) abortControllerRef.current = null
      setIsSending(false)
    }
  }, [inputText, attachedImage, isSending, hasKey, deepResearchMode, ensureSession, addChatMessage, updateChatMessage, selectedProvider, selectedModels, chatSystemPrompt, recordChatCost, runDeepResearchPipeline, setDeepResearchResumeState, setInputText, t])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (shouldSendChatMessage(e.nativeEvent, chatSendShortcut, platform)) { e.preventDefault(); handleSend() }
  }
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = extractImageFromClipboard(e.clipboardData)
    if (!file) return
    e.preventDefault()
    handleImageSelect(file)
  }, [handleImageSelect])

  const showCopiedToast = useCallback(() => {
    setCopiedId(String(Date.now()))
    setTimeout(() => setCopiedId(null), COPY_FEEDBACK_DURATION_MS)
  }, [])

  const handleDownloadImage = useCallback((content: ChatMessageContent) => {
    const imageUrl = getChatImageUrl(content)
    if (!imageUrl) return
    const a = document.createElement('a')
    a.href = imageUrl
    a.download = content.imageFileName ?? `viezan-chat-image-${Date.now()}.${imageExtensionFromMime(content.imageMimeType)}`
    a.click()
  }, [])

  const handleCopyImage = useCallback(async (content: ChatMessageContent) => {
    const imageUrl = getChatImageUrl(content)
    if (!imageUrl) return
    try { await copyImageToClipboard(imageUrl) } catch { await navigator.clipboard?.writeText?.(imageUrl).catch(() => {}) }
    showCopiedToast()
  }, [showCopiedToast])

  const handleCopy = (text: string) => { navigator.clipboard.writeText(text).catch(() => {}); showCopiedToast() }
  const handleNewChat = useCallback(() => { setActiveChatSession(null) }, [setActiveChatSession])
  const handleClear = () => { if (activeChatSessionId) clearChatSession(activeChatSessionId) }
  const handleStop = useCallback(() => { abortControllerRef.current?.abort() }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.repeat || !eventMatchesShortcut(e, chatNewSessionShortcut, platform)) return
      e.preventDefault()
      handleNewChat()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [chatNewSessionShortcut, handleNewChat, platform])

  const messages = activeSession?.messages ?? []
  const currentModel = selectedModels[selectedProvider]
  const currentModelLabel = formatModelName(selectedProvider, currentModel)
  const canResumeDeepResearch = Boolean(
    !isSending && !inputText.trim() && !attachedImage
    && activeSession?.deepResearchResumeState
    && activeSession.deepResearchResumeState.lastCompletedPhase !== 'synth',
  )

  // ── Suggestion chips ──────────────────────────────────────────────────────
  const suggestions = [
    { emoji: SUGGESTION_ICONS[0], label: t.chat_suggest_translate, desc: t.chat_suggest_translate_desc, prompt: t.chat_suggest_translate_prompt },
    { emoji: SUGGESTION_ICONS[1], label: t.chat_suggest_research, desc: t.chat_suggest_research_desc, prompt: t.chat_suggest_research_prompt },
    { emoji: SUGGESTION_ICONS[2], label: t.chat_suggest_explain, desc: t.chat_suggest_explain_desc, prompt: t.chat_suggest_explain_prompt },
    { emoji: SUGGESTION_ICONS[3], label: t.chat_suggest_write, desc: t.chat_suggest_write_desc, prompt: t.chat_suggest_write_prompt },
  ]

  // ── Shared composer ───────────────────────────────────────────────────────
  const composer = (
    <div className="flex flex-col">
      {attachImageError && (
        <div className="px-4 pt-2 flex items-center gap-2">
          <p className="ui-error-text text-xs">{attachImageError}</p>
          <button type="button" onClick={() => setAttachImageError(null)} className="btn-icon btn-icon-xs btn-icon-danger" aria-label={t.translate_error_dismiss}>
            <XIcon className="w-3 h-3" />
          </button>
        </div>
      )}
      {deepResearchMode && (
        <div className="flex items-center gap-1.5 px-4 pt-3">
          <span className="chat-pill chat-pill-neutral"><LightbulbIcon className="h-2.5 w-2.5" /><span>{t.chat_deep_research_badge}</span></span>
          <span className="ui-micro">{t.chat_deep_research_hint}</span>
        </div>
      )}
      {attachedImage && (
        <ImagePreviewThumbnail src={attachedImage.previewUrl} alt={attachedImage.fileName} removeTitle={t.chat_remove_image} onRemove={() => setAttachedImage(null)} />
      )}
      {isVoiceActive && (
        <div className="voice-recording-panel mx-3 mt-2 flex items-center gap-3 px-4 py-2">
          <div className="flex items-end gap-[3px] h-5">
            {[1, 2, 3, 4, 5].map((i) => (
              <span key={i} className="voice-recording-bar" style={{ height: `${VOICE_BAR_HEIGHT_BASE_PX + (i % 3) * VOICE_BAR_HEIGHT_STEP_PX}px`, animationDuration: `${VOICE_BAR_DURATION_BASE_S + i * VOICE_BAR_DURATION_STEP_S}s`, animationDelay: `${i * VOICE_BAR_DELAY_STEP_S}s` }} />
            ))}
          </div>
          <span className={`text-xs font-medium ${isVoiceInterim ? 'italic' : 'voice-recording-text'}`} style={isVoiceInterim ? { color: 'var(--vzn-text-soft)' } : undefined}>
            {inputText || '…'}
          </span>
        </div>
      )}
      <div className="px-3 pt-2">
        <textarea
          ref={textareaRef}
          value={inputText}
          onChange={(e) => { setInputText(e.target.value); if (isVoiceActive) resetVoicePrefix() }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={t.chat_placeholder}
          rows={1}
          disabled={isSending}
          className={`chat-input-field ${isVoiceInterim ? 'italic' : ''}`}
          style={{ maxHeight: `${CHAT_TEXTAREA_MAX_HEIGHT_PX}px`, overflowY: 'auto', ...(isVoiceInterim ? { color: 'var(--vzn-text-soft)' } : null) }}
        />
      </div>
      {/* Toolbar: actions left · model indicator center · send right */}
      <div className="flex items-center gap-1 px-2 pb-2">
        <VoiceRecorder sourceLang="auto" onTranscript={handleVoiceTranscript} onRecordingChange={handleVoiceRecordingChange} titleRecord={t.chat_voice_record} titleStop={t.chat_voice_stop} labelTranscribing="…" labelRecording="…" />
        <button type="button" onClick={() => fileInputRef.current?.click()} title={t.chat_attach_image} className="chat-action-button">
          <ImageIcon className="w-4 h-4" />
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImageSelect(file); e.target.value = '' }} />
        <button type="button" onClick={() => setDeepResearchMode((v) => !v)} title={deepResearchMode ? t.chat_deep_research_disable : t.chat_deep_research_enable} className={`chat-action-button ${deepResearchMode ? 'chat-action-button-active-neutral' : ''}`}>
          <LightbulbIcon className="w-4 h-4" />
        </button>

        {/* Model indicator — always visible at center of toolbar */}
        <div className="flex flex-1 items-center justify-center gap-1 select-none min-w-0 px-2">
          <ProviderIcon provider={selectedProvider} size={11} />
          <span className="ui-micro truncate">{currentModelLabel}</span>
        </div>

        {inputText.length > 600 && <span className="ui-micro tabular-nums px-1">{inputText.length}</span>}

        {isSending ? (
          <button type="button" onClick={handleStop} title={t.chat_stop} aria-label={t.chat_stop} className="chat-stop-button">
            <StopSquareIcon className="w-5 h-5" />
          </button>
        ) : canResumeDeepResearch ? (
          <button type="button" onClick={handleResumeDeepResearch} title={t.chat_deep_research_resume} aria-label={t.chat_deep_research_resume} className="chat-resume-button">
            <span className="chat-primary-action-label">{t.chat_deep_research_resume_short}</span>
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button type="button" onClick={handleSend} disabled={(!inputText.trim() && !attachedImage) || !hasKey} title={t.chat_send} className="chat-send-button">
            <SendIcon />
          </button>
        )}
      </div>
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      role="application"
      className="flex flex-1 min-h-0 overflow-hidden relative"
      style={{ height: '100%' }}
      onDragOver={(e) => { e.preventDefault(); if (!isDraggingOver) setIsDraggingOver(true) }}
      onDragLeave={handleDragLeave}
      onDrop={handleFileDrop}
    >
      {isDraggingOver && <DragOverlay label={t.chat_attach_image} zIndex="z-50" showRing />}

      {/* Session panel - slide in from left when showSessionPanel */}
      {showSessionPanel && (
        <div className="session-panel flex-shrink-0">
          <SessionPanel
            sessions={chatSessions}
            activeChatSessionId={activeChatSessionId}
            onSelect={(id) => setActiveChatSession(id)}
            onNew={handleNewChat}
            onDelete={(id) => {
              deleteChatSession(id)
              if (activeChatSessionId === id) setActiveChatSession(null)
            }}
            t={t}
          />
        </div>
      )}

      {/* Main chat column */}
      <div className="flex flex-1 flex-col min-h-0 overflow-hidden">

        {/* Slim top bar - no border, transparent, just actions */}
        <div className="flex flex-shrink-0 items-center gap-2 px-4 py-2">
          <button
            type="button"
            onClick={() => setShowSessionPanel((v) => !v)}
            title={showSessionPanel ? t.nav_collapse_sidebar : t.nav_expand_sidebar}
            className={`btn-icon btn-icon-sm ${showSessionPanel ? 'btn-active' : ''}`}
          >
            {showSessionPanel ? <ChevronLeftIcon className="w-3.5 h-3.5" /> : <ChevronRightIcon className="w-3.5 h-3.5" />}
          </button>
          {messages.length > 0 && (
            <span className="ui-meta" style={{ color: 'var(--vzn-text-soft)' }}>
              {messages.filter((m) => m.role === 'user').length} {t.history_chat_messages}
            </span>
          )}
          <div className="flex-1" />
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              title={t.chat_clear}
              className="btn-icon btn-icon-sm"
              style={{ color: 'var(--vzn-text-soft)' }}
            >
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
          )}
          {/* Model badge + popup */}
          <div className="relative" ref={aiConfigRef}>
            <button
              type="button"
              onClick={() => setShowAIConfig((v) => !v)}
              className={`chat-model-badge ${showAIConfig ? 'btn-active' : ''}`}
            >
              <ProviderIcon provider={selectedProvider} size={13} />
              <span className="max-w-[140px] truncate">{currentModelLabel}</span>
              <ChevronDownIcon className="w-3 h-3 opacity-50" />
            </button>
            {showAIConfig && (
              <div className="floating-panel ai-config-panel absolute top-full right-0 mt-2 z-50 w-[420px] p-4 flex flex-col gap-4 fade-in">
                <h2 className="popover-title">{t.translate_ai_config_title}</h2>
                <div className="flex flex-col gap-3">
                  <ModelSelector />
                  <SystemPromptDropdown
                    chatSystemPrompt={chatSystemPrompt}
                    systemPromptPresets={systemPromptPresets}
                    activePreset={activePreset}
                    onSetChatSystemPrompt={setChatSystemPrompt}
                    onNavigateSettings={() => { openSettings(); setShowAIConfig(false) }}
                    onAddPreset={addSystemPromptPreset}
                    t={t}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 min-h-0 flex-col px-4 pb-4">
          {messages.length === 0 ? (

            /* ── Empty state: logo+chips float center, composer pinned bottom ── */
            <div className="flex flex-1 min-h-0 flex-col">
              {/* Scrollable center section */}
              <div className="flex flex-1 min-h-0 items-center justify-center overflow-y-auto py-6 px-4">
                <div className="flex w-full max-w-lg flex-col items-center gap-7">
                  {/* Logo + heading */}
                  <div className="flex flex-col items-center gap-3 text-center select-none">
                    <div className="chat-logo-ring p-4">
                      <AppLogoIcon size={42} />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold" style={{ color: 'var(--vzn-text-strong)' }}>{t.chat_empty_title}</h2>
                      <p className="text-sm mt-1 max-w-xs mx-auto leading-relaxed" style={{ color: 'var(--vzn-text-muted)' }}>{t.chat_empty_desc}</p>
                    </div>
                    {!hasKey && (
                      <div className="flex flex-col items-center gap-2 mt-1">
                        <p className="text-xs" style={{ color: 'var(--vzn-text-muted)' }}>{t.chat_error_no_key}</p>
                        <button type="button" onClick={() => openSettings()} className="btn-primary btn-sm">{t.chat_error_open_settings}</button>
                      </div>
                    )}
                  </div>
                  {/* 2×2 suggestion chips */}
                  <div className="grid w-full grid-cols-2 gap-2.5">
                    {suggestions.map(({ emoji, label, desc, prompt }) => (
                      <button
                        key={label}
                        type="button"
                        className="chat-suggest-chip"
                        onClick={() => { setInputText(prompt); textareaRef.current?.focus() }}
                      >
                        <span className="chat-suggest-icon">{emoji}</span>
                        <span className="flex flex-col gap-0.5 min-w-0 text-left">
                          <span className="text-sm font-semibold" style={{ color: 'var(--vzn-text-strong)' }}>{label}</span>
                          <span className="text-xs" style={{ color: 'var(--vzn-text-muted)' }}>{desc}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Composer pinned at bottom */}
              <div className="flex-shrink-0 pt-2">
                <div className={`chat-composer ${isDraggingOver ? 'chat-composer-drop' : ''}`}>{composer}</div>
              </div>
            </div>

          ) : (

            // Messages view
            <div className={`glass-panel flex-1 min-h-0 flex flex-col ${isDraggingOver ? 'surface-panel-drop' : ''}`}>
              <div className="flex-1 overflow-y-auto">
                <div className="px-5 py-5 space-y-5">
                  {(() => {
                    const lastAssistantIdx = messages.reduce((acc, m, i) => (m.role === 'assistant' ? i : acc), -1)
                    const rendered: React.ReactNode[] = []
                    let i = 0
                    while (i < messages.length) {
                      const msg = messages[i]
                      if (msg.isResearchStep) {
                        const group: ChatMessage[] = []
                        while (i < messages.length && messages[i].isResearchStep) { group.push(messages[i]); i++ }
                        rendered.push(<ResearchStepsPanel key={`rsp-${group[0].id}`} steps={group} />)
                        continue
                      }
                      rendered.push(
                        <MessageBubble
                          key={msg.id}
                          message={msg}
                          onCopy={handleCopy}
                          onCopyImage={handleCopyImage}
                          onDownloadImage={handleDownloadImage}
                          onRegenerate={i === lastAssistantIdx ? handleRegenerate : undefined}
                          isLastAssistant={i === lastAssistantIdx}
                          isSending={isSending}
                          copyLabel={t.translate_copy}
                          downloadImageLabel={t.chat_download_image}
                          regenerateLabel={t.chat_regenerate}
                        />
                      )
                      i++
                    }
                    return rendered
                  })()}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Pinned composer */}
              <div className="flex-shrink-0 px-4 pb-4 pt-2" style={{ borderTop: '1px solid var(--vzn-border)', background: 'var(--vzn-surface-muted)' }}>
                <div className={`chat-composer ${isDraggingOver ? 'chat-composer-drop' : ''}`}>
                  {composer}
                </div>
              </div>
            </div>

          )}
        </div>
      </div>

      {/* Copied toast */}
      {copiedId && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 z-50 fade-in">
          <div className="rounded-full px-4 py-2 text-xs font-semibold text-white" style={{ background: 'var(--vzn-accent)', boxShadow: 'var(--vzn-shadow-glow)' }}>
            {t.chat_copied}
          </div>
        </div>
      )}
    </div>
  )
}
