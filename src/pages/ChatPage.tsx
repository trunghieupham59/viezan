import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { MessageBubble } from '../components/chat/MessageBubble'
import { ResearchStepsPanel } from '../components/chat/ResearchStepsPanel'
import { ChatTaskConfiguration } from '../components/organisms'
import { AppLogoIcon, Button } from '../components/ui/atoms'
import { DragOverlay } from '../components/ui/DragOverlay'
import { ImagePreviewThumbnail } from '../components/ui/ImagePreviewThumbnail'
import {
  GlobeIcon,
  PaperclipIcon,
  PlusIcon,
  SendIcon,
  StopSquareIcon,
} from '../components/ui/icons'

import { VoiceRecorder, type VoiceRecordingState } from '../components/VoiceRecorder'
import { MAX_CHAT_IMAGE_DIMENSION, MAX_IMAGE_INPUT_BYTES } from '../constants/image'
import { COPY_FEEDBACK_DURATION_MS } from '../constants/ui'
import { useChatTextareaSize } from '../hooks/useChatTextareaSize'
import { useVoiceInput } from '../hooks/useVoiceInput'
import type { VoiceErrorTranslationKey } from '../i18n/types'
import { chatService } from '../services/chatService'
import { DEEP_RESEARCH_CANCELLED_ERROR, deepResearchService } from '../services/deepResearchService'
import { planImageRequest } from '../services/imagePromptService'
import type { ActionableSearchFallback } from '../services/searchResultFormatting'
import { smartThinkingService } from '../services/smartThinkingService'
import { useAppStore, useT } from '../store/useAppStore'
import { useNotificationStore } from '../store/useNotificationStore'
import type {
  AudioTranscriptionErrorCode,
  ChatMessage,
  ChatMessageContent,
  ChatRequestConfiguration,
  DeepResearchResumeState,
} from '../types'
import { canUseChatWebSearch, getChatTaskExecution, resolveChatTaskState } from '../types/chatTask'
import { shouldUseCarefulReasoning } from '../utils/carefulReasoning'
import { localizeChatError, localizeChatException } from '../utils/chatErrors'
import { imageInputSupport, supportsChatImageMode } from '../utils/chatImageMode'
import { chatImageStoreKey, getChatImage, putChatImage } from '../utils/chatImageStore'
import { getChatTaskInstruction, selectChatTask } from '../utils/chatTaskConfiguration'
import { isEmptyChatTask } from '../utils/chatTaskDraft'
import { createClientId } from '../utils/id'
import { extractImageFromClipboard, resizeImageFile } from '../utils/imageUtils'
import { eventMatchesShortcut, shouldSendChatMessage } from '../utils/keyboardShortcuts'
import { estimateUsageCost } from '../utils/usageCost'
import { canResolveVoiceErrorInSettings, getVoiceNotificationTone } from '../utils/voiceErrors'


/**
 * Buffer interval (ms) used to coalesce streamed tokens before they hit the
 * Zustand store. 60 ms ≈ 16 Hz feels real-time to the eye while skipping
 * ~70% of the per-token re-renders ChatPage would otherwise pay for.
 */
const CHAT_STREAM_BUFFER_INTERVAL_MS = 60

/** How long the web-search fallback notice stays up; longer than a plain toast because it offers an action. */
const SEARCH_FALLBACK_NOTICE_MS = 10_000
/** Toast owner keys: a newer notice of the same kind replaces the previous one. */
const VOICE_ERROR_KEY = 'chat-voice-error'
const SEARCH_FALLBACK_KEY = 'chat-web-search-fallback'
const SEARCH_UNAVAILABLE_KEY = 'chat-web-search-unavailable'
const ATTACH_IMAGE_ERROR_KEY = 'chat-attach-image'
const COPIED_KEY = 'chat-copied'

// DUP-05: resizeImageToBase64 replaced by shared resizeImageFile from imageUtils.ts
// HC-09: MAX_CHAT_IMAGE_DIMENSION imported from constants/image.ts
// MAX_CHAT_SESSIONS is enforced in useAppStore.createChatSession — defined there as the single source of truth

/**
 * DUP-02: Convert a store ChatMessage to the IPC-format expected by chatService.send().
 * Strips UI-only fields (id, timestamp, isLoading, error, imagePreviewUrl, imageFileName)
 * that should not be sent to the main process.
 * Centralised here so handleSend and handleRegenerate share a single implementation.
 */
function toIpcMessage(msg: ChatMessage) {
  const content = msg.content
    .filter((c) => msg.role === 'user' || c.type === 'text')
    .map((c) => ({
      type: c.type,
      text: c.text,
      imageBase64: c.imageBase64,
      imageMimeType: c.imageMimeType,
    }))

  if (msg.role === 'user' && msg.taskInstruction) {
    const textContent = content.find((item) => item.type === 'text')
    if (textContent) textContent.text = msg.taskInstruction + (textContent.text ?? '')
    else content.push({ type: 'text', text: msg.taskInstruction, imageBase64: undefined, imageMimeType: undefined })
  }

  return {
    role: msg.role,
    content,
  }
}

function toIpcHistory(messages: ChatMessage[]) {
  return messages
    .filter((m) => !m.isLoading && !m.error && !m.isResearchStep && !m.isSmartThinkingStep)
    .map(toIpcMessage)
}

/**
 * Plain transcript of the latest turns, handed to Deep Research so a follow-up
 * such as "compare it with the previous one" keeps its subject.
 */
function buildConversationTranscript(messages: ChatMessage[]): string {
  const MAX_TURNS = 8
  const MAX_CHARS_PER_TURN = 1200
  return toIpcHistory(messages)
    .slice(-MAX_TURNS)
    .map((message) => {
      const text = message.content.map((c) => c.text ?? '').join(' ').trim()
      return text ? `${message.role.toUpperCase()}: ${text.slice(0, MAX_CHARS_PER_TURN)}` : ''
    })
    .filter(Boolean)
    .join('\n')
}

/**
 * Save a chat image (AI-produced or attached by the user) to the durable image
 * store and return the key the message keeps. The chat store strips pixel data
 * before persisting, so without this the picture would be gone after a restart.
 */
function persistChatImage(sessionId: string, messageId: string, imageBase64: string, imageMimeType: string): string {
  const key = chatImageStoreKey(sessionId, messageId)
  void putChatImage(key, { imageBase64, imageMimeType })
  return key
}

/** Most recent image an assistant message produced (generated or edited) that still has its pixel data. */
function findLatestAssistantImage(messages: ChatMessage[]): { base64: string; mimeType: string } | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role !== 'assistant' || message.error) continue
    const image = message.content.find((c) => c.type === 'image' && c.imageBase64 && c.imageMimeType)
    if (image?.imageBase64 && image.imageMimeType) {
      return { base64: image.imageBase64, mimeType: image.imageMimeType }
    }
  }
  return undefined
}

function flattenChatCostInput(messages: ReturnType<typeof toIpcHistory>, systemPrompt?: string): string {
  const messageText = messages
    .flatMap((message) => message.content.map((content) => content.text ?? (content.type === 'image' ? '[image]' : '')))
    .filter(Boolean)
    .join('\n')
  return [systemPrompt, messageText].filter(Boolean).join('\n')
}

const IMAGE_EDIT_INTENT_PATTERN = new RegExp([
  '\\b(edit|change|modify|retouch|remove|replace|add|turn|make|convert|transform|erase|fill|extend|upscale|enhance|recolor)\\b',
  '(sửa|chỉnh|đổi|thay|xóa|xoá|bỏ|thêm|chuyển|biến|làm|tạo|ghép)',
  '(編集|変更|修正|削除|追加)',
].join('|'), 'i')

function shouldRouteToImageEdit(text: string, hasImage: boolean): boolean {
  return hasImage && IMAGE_EDIT_INTENT_PATTERN.test(text)
}

function buildImageDataUrl(imageBase64: string, imageMimeType: string): string {
  return `data:${imageMimeType};base64,${imageBase64}`
}

function getChatImageUrl(content: ChatMessageContent): string | null {
  return content.imagePreviewUrl ??
    (content.imageBase64 && content.imageMimeType
      ? buildImageDataUrl(content.imageBase64, content.imageMimeType)
      : null)
}

function imageExtensionFromMime(mimeType?: string): string {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType?.startsWith('image/')) return mimeType.replace('image/', '')
  return 'png'
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image for clipboard'))
    img.src = src
  })
}

async function imageUrlToPngBlob(imageUrl: string): Promise<Blob> {
  const img = await loadImageElement(imageUrl)
  const width = img.naturalWidth || img.width
  const height = img.naturalHeight || img.height
  if (!width || !height) throw new Error('Invalid image dimensions')

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is unavailable')
  ctx.drawImage(img, 0, 0, width, height)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('Failed to encode image for clipboard'))
      }
    }, 'image/png')
  })
}

async function copyImageToClipboard(imageUrl: string): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    await navigator.clipboard?.writeText?.(imageUrl)
    return
  }

  const blob = await imageUrlToPngBlob(imageUrl)
  await navigator.clipboard.write([
    new ClipboardItem({ [blob.type]: blob }),
  ])
}

// ─── Main ChatPage ────────────────────────────────────────────────────────────
/** Close only when sending; later responses must not dismiss reopened settings. */
function collapseChatTaskOptions(sessionId: string) {
  const store = useAppStore.getState()
  const task = store.chatSessions.find((session) => session.id === sessionId)?.taskState
  if (task?.open) store.setChatTaskState(sessionId, { ...task, open: false })
}

export function ChatPage() {
  const storedTaskState = useAppStore((state) => state.activeChatSessionId
    ? state.chatSessions.find((session) => session.id === state.activeChatSessionId)?.taskState
    : state.chatPendingTaskState)
  const setChatTaskState = useAppStore((state) => state.setChatTaskState)
  const pendingModes = useAppStore(useShallow((s) => ({ imageMode: s.chatPendingImageMode,
    deepResearchMode: s.chatPendingDeepResearchMode, webSearchMode: s.chatPendingWebSearchMode })))
  const locale = useAppStore((s) => s.locale)
  // Subscribe with `useShallow` so ChatPage only re-renders when one of the
  // listed slices actually changes (instead of on every unrelated store mutation
  // such as locale, history, usage cost, etc.). Actions are stable references in
  // Zustand so they're safe to include without churn.
  const {
    selectedProvider, selectedModels, keyStatus,
    chatSendShortcut, chatNewSessionShortcut,
    chatSessions, activeChatSessionId, chatSystemPrompt,
    createChatSession, setActiveChatSession, addChatMessage, updateChatMessage,
    addChatSessionCost, openSettings,
    recordUsageCost, setDeepResearchResumeState,
    setChatSessionDraft,
    setChatPendingDraft,
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
      createChatSession: s.createChatSession,
      setActiveChatSession: s.setActiveChatSession,
      setChatSessionModel: s.setChatSessionModel,
      addChatMessage: s.addChatMessage,
      updateChatMessage: s.updateChatMessage,
      addChatSessionCost: s.addChatSessionCost,
      setChatSystemPrompt: s.setChatSystemPrompt,
      addSystemPromptPreset: s.addSystemPromptPreset,
      openSettings: s.openSettings,
      recordUsageCost: s.recordUsageCost,
      setDeepResearchResumeState: s.setDeepResearchResumeState,
      setChatSessionDraft: s.setChatSessionDraft,
      setChatPendingDraft: s.setChatPendingDraft,
    })),
  )


  const t = useT()

  /**
   * Composer state — backed by the store so drafts and toggle survive page
   * navigation (lazy-loaded ChatPage unmounts when user switches to
   * Translate/etc.). Local `useState` is the source of truth at render time
   * for typing perf; effects below sync it with whichever session — or the
   * empty-state pending bucket — owns the draft right now.
   *
   * Mirrors ChatGPT/Claude behaviour: text drafts + mode toggle persist
   * per-session; attached images stay ephemeral.
   */
  const [inputText, setInputTextLocal] = useState(() => {
    const s = useAppStore.getState()
    if (s.activeChatSessionId) {
      return s.chatSessions.find((x) => x.id === s.activeChatSessionId)?.draftInput ?? ''
    }
    return s.chatPendingDraft
  })
  const setInputText = useCallback((text: string) => {
    setInputTextLocal(text)
    const sid = useAppStore.getState().activeChatSessionId
    if (sid) setChatSessionDraft(sid, text)
    else setChatPendingDraft(text)
  }, [setChatSessionDraft, setChatPendingDraft])
  const [isSending, setIsSending] = useState(false)
  const [voiceRecordingState, setVoiceRecordingState] = useState<VoiceRecordingState>('idle')
  const [voiceErrorCode, setVoiceErrorCode] = useState<AudioTranscriptionErrorCode | null>(null)
  // Set when a configured web-search provider (Tavily/Brave) rejected the key or ran out of
  // quota and free search answered instead — transient notice, auto-dismissed below.
  const [searchFallbackNotice, setSearchFallbackNotice] = useState<ActionableSearchFallback | null>(null)

  useEffect(() => {
    if (!searchFallbackNotice) return
    const timer = setTimeout(() => setSearchFallbackNotice(null), SEARCH_FALLBACK_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [searchFallbackNotice])

  // Set when every web-search provider failed, so the answer has no live sources.
  const [searchUnavailable, setSearchUnavailable] = useState(false)
  const reportSearchUnavailable = useCallback(() => setSearchUnavailable(true), [])

  // Deep Research can run for minutes, so the notice stays up while a request is in
  // flight and only starts its countdown once the answer is done.
  useEffect(() => {
    if (!searchUnavailable || isSending) return
    const timer = setTimeout(() => setSearchUnavailable(false), SEARCH_FALLBACK_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [searchUnavailable, isSending])
  const isVoiceBusy = voiceRecordingState !== 'idle' && voiceRecordingState !== 'error'
  /**
   * AbortController for the in-flight chat request. Held in a ref (not state)
   * because handlers shouldn't re-render when it's swapped, and because
   * `handleStop` needs the latest controller without going through React's
   * batched state queue. Reset to `null` once the request settles.
   */
  const abortControllerRef = useRef<AbortController | null>(null)
  const [attachedImage, setAttachedImage] = useState<{
    base64: string; mimeType: string; previewUrl: string; fileName: string
  } | null>(null)
  const notify = useNotificationStore((state) => state.notify)
  const dismissNotification = useNotificationStore((state) => state.dismiss)
  /** Image processing failures go to the toast stack; a new attempt clears the old one. */
  const reportAttachImageError = useCallback((message: string) => {
    notify({ key: ATTACH_IMAGE_ERROR_KEY, tone: 'error', message })
  }, [notify])
  /** Visual feedback state when user drags a file over the chat area */
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  /** Plus menu (attach/tools) popup */
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [plusMenuPos, setPlusMenuPos] = useState<{ bottom: number; left: number }>({ bottom: 0, left: 0 })
  const plusBtnRef = useRef<HTMLButtonElement>(null)
  const plusMenuRef = useRef<HTMLDivElement>(null)
  const platform = window.api?.platform
  // ── Voice input — shared hook (same logic as TranslatePage) ──
  const {
    isVoiceActive,
    isVoiceInterim,
    voicePrefixRef: _voicePrefixRef,
    handleVoiceRecordingChange,
    handleVoiceTranscript,
    cancelVoiceInput,
    resetVoicePrefix,
  } = useVoiceInput({ currentText: inputText, onTextChange: setInputText })

  const handleVoiceStateChange = useCallback((state: VoiceRecordingState) => {
    setVoiceRecordingState(state)
    if (state === 'requesting') setVoiceErrorCode(null)
    if (state !== 'idle' && state !== 'error') {
      setShowPlusMenu(false)
    }
  }, [])

  const handleVoiceError = useCallback((code: AudioTranscriptionErrorCode) => {
    setVoiceErrorCode(code === 'CANCELLED' ? null : code)
  }, [])

  const hasKey = selectedProvider === 'local' || keyStatus[selectedProvider]
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Active session
  const activeSession = chatSessions.find((s) => s.id === activeChatSessionId) ?? null
  const taskState = useMemo(() => resolveChatTaskState(storedTaskState, activeChatSessionId ? {
    imageMode: activeSession?.imageMode, deepResearchMode: activeSession?.deepResearchMode ?? Boolean(activeSession?.deepResearchResumeState), webSearchMode: activeSession?.webSearchMode,
  } : pendingModes), [storedTaskState, activeChatSessionId, activeSession?.imageMode, activeSession?.deepResearchMode, activeSession?.deepResearchResumeState, activeSession?.webSearchMode, pendingModes])
  const { imageMode, webSearchMode } = getChatTaskExecution(taskState)
  const imageModeSupported = supportsChatImageMode(selectedProvider)

  const voiceContextKey = `chat:${activeChatSessionId ?? 'pending'}:${inputText}`
  const voiceErrorMessage = voiceErrorCode
    ? t[`voice_error_${voiceErrorCode.toLowerCase()}` as VoiceErrorTranslationKey]
    : null
  const canOpenSettingsForVoiceError = voiceErrorCode
    ? canResolveVoiceErrorInSettings(voiceErrorCode)
    : false

  // ── Notices go to the app-level toast stack ──
  // Each effect dismisses its own toast on cleanup so page-scoped notices
  // leave with the page instead of following the user to other features.
  useEffect(() => {
    if (!voiceErrorCode || !voiceErrorMessage) {
      dismissNotification(VOICE_ERROR_KEY)
      return
    }
    notify({
      key: VOICE_ERROR_KEY,
      tone: getVoiceNotificationTone(voiceErrorCode),
      title: t.voice_transcription_error_title,
      message: voiceErrorMessage,
      actions: canOpenSettingsForVoiceError
        ? [{ label: t.translate_error_open_settings, onClick: () => { setVoiceErrorCode(null); openSettings() } }]
        : undefined,
      onDismiss: () => setVoiceErrorCode(null),
    })
    return () => dismissNotification(VOICE_ERROR_KEY)
  }, [voiceErrorCode, voiceErrorMessage, canOpenSettingsForVoiceError, notify, dismissNotification, openSettings, t])

  useEffect(() => {
    if (!searchFallbackNotice) {
      dismissNotification(SEARCH_FALLBACK_KEY)
      return
    }
    notify({
      key: SEARCH_FALLBACK_KEY,
      tone: 'warning',
      title: t.chat_web_search_fallback_title,
      message: t.chat_web_search_fallback(
        searchFallbackNotice.from === 'tavily' ? 'Tavily' : 'Brave Search',
        searchFallbackNotice.reason,
      ),
      actions: [{ label: t.translate_error_open_settings, onClick: () => { setSearchFallbackNotice(null); openSettings() } }],
      onDismiss: () => setSearchFallbackNotice(null),
    })
    return () => dismissNotification(SEARCH_FALLBACK_KEY)
  }, [searchFallbackNotice, notify, dismissNotification, openSettings, t])

  useEffect(() => {
    if (!searchUnavailable) {
      dismissNotification(SEARCH_UNAVAILABLE_KEY)
      return
    }
    notify({
      key: SEARCH_UNAVAILABLE_KEY,
      tone: 'warning',
      title: t.chat_web_search_unavailable_title,
      message: t.chat_web_search_unavailable,
      actions: [{ label: t.translate_error_open_settings, onClick: () => { setSearchUnavailable(false); openSettings() } }],
      onDismiss: () => setSearchUnavailable(false),
    })
    return () => dismissNotification(SEARCH_UNAVAILABLE_KEY)
  }, [searchUnavailable, notify, dismissNotification, openSettings, t])

  // Re-activate on mount so a model selected in another feature cannot leak
  // into this conversation after navigating back to Chat.
  useEffect(() => {
    if (activeChatSessionId) setActiveChatSession(activeChatSessionId)
  }, [activeChatSessionId, setActiveChatSession])

  const recordChatCost = useCallback((sessionId: string, messageId: string, inputText: string, reply: string, configuration?: ChatRequestConfiguration) => {
    const cost = estimateUsageCost({
      feature: 'chat',
      provider: configuration?.provider ?? selectedProvider,
      model: configuration?.model ?? selectedModels[selectedProvider],
      inputText,
      outputText: reply,
    })
    recordUsageCost(cost)
    addChatSessionCost(sessionId, cost)
    updateChatMessage(sessionId, messageId, { cost })
  }, [addChatSessionCost, recordUsageCost, selectedProvider, selectedModels, updateChatMessage])

  // Auto-scroll to bottom on new messages.
  // Use `instant` instead of `smooth` to avoid jank during streaming — when
  // tokens land every ~60 ms a smooth scroll animation never settles and the
  // browser ends up dropping frames on long replies.
  const msgCount = activeSession?.messages.length ?? 0
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new messages count
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [msgCount])

  useChatTextareaSize(textareaRef, inputText, activeChatSessionId, msgCount === 0)

  // ── Hydrate composer when the active session changes ──
  // Sources of truth for draft/mode:
  //   - active session exists → that session's `draftInput` / `deepResearchMode`
  //   - no active session (empty state) → `chatPendingDraft` / `chatPendingDeepResearchMode`
  // Reset attachedImage too — ephemeral by design, mirrors ChatGPT/Claude.
  useEffect(() => {
    const s = useAppStore.getState()
    if (activeChatSessionId) {
      const session = s.chatSessions.find((x) => x.id === activeChatSessionId)
      setInputTextLocal(session?.draftInput ?? '')
    } else {
      setInputTextLocal(s.chatPendingDraft)
    }
    setAttachedImage(null)
  }, [activeChatSessionId])

  // ── Plus menu (attach/tools popup) ──
  const openPlusMenu = () => {
    if (plusBtnRef.current) {
      const rect = plusBtnRef.current.getBoundingClientRect()
      setPlusMenuPos({ bottom: window.innerHeight - rect.top + 6, left: rect.left })
    }
    setShowPlusMenu(true)
  }
  useEffect(() => {
    if (!showPlusMenu) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (!plusBtnRef.current?.contains(t) && !plusMenuRef.current?.contains(t)) {
        setShowPlusMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPlusMenu])

  // ── Ensure active session exists for current provider/model ──
  const ensureSession = useCallback(() => {
    if (activeChatSessionId && chatSessions.find((s) => s.id === activeChatSessionId)) {
      return activeChatSessionId
    }
    return createChatSession(selectedProvider, selectedModels[selectedProvider])
  }, [activeChatSessionId, chatSessions, createChatSession, selectedProvider, selectedModels])

  // ── Image attachment ──
  const handleImageSelect = useCallback(async (file: File) => {
    dismissNotification(ATTACH_IMAGE_ERROR_KEY)
    // Hard upper-bound check before decoding — a 50 MP RAW/HEIC dropped into
    // the composer would otherwise allocate hundreds of megabytes of canvas
    // memory inside resizeImageFile and freeze the renderer.
    if (file.size > MAX_IMAGE_INPUT_BYTES) {
      const maxMb = Math.round(MAX_IMAGE_INPUT_BYTES / (1024 * 1024))
      reportAttachImageError(t.image_translate_size_error(maxMb))
      return
    }
    try {
      // DUP-05: use shared resizeImageFile (fixed quality, no compression loop needed for chat)
      const result = await resizeImageFile(file, MAX_CHAT_IMAGE_DIMENSION)
      setAttachedImage(result)
    } catch (err) {
      // Show error in the UI so the user knows the attachment failed
      const msg = err instanceof Error ? err.message : t.image_translate_error_failed
      reportAttachImageError(msg)
    }
  }, [t.image_translate_error_failed, t.image_translate_size_error, dismissNotification, reportAttachImageError])

  const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDraggingOver(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      reportAttachImageError(t.image_translate_type_error)
      return
    }
    handleImageSelect(file)
  }, [handleImageSelect, reportAttachImageError, t])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Only clear when leaving the container itself, not a child element
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDraggingOver(false)
    }
  }, [])

  // ── Send message ──
  // ── Regenerate last assistant response ──
  /**
   * Run (or resume) the Deep Research pipeline against an active session.
   *
   * Extracted from the original `handleSend` Deep Research branch so that
   * the new "Tiếp tục nghiên cứu" button can call the same orchestration
   * with a `resumeState` argument — both code paths share the exact same
   * step bubbles, callbacks, and persistence wiring, so resume looks
   * identical to a fresh run from the user's perspective.
   *
   * The function expects the user message + any attachments to already be
   * pushed into the session — fresh runs do that in `handleSend`, resumed
   * runs simply skip it because the original user message is still there.
   */
  const runDeepResearchPipeline = useCallback(async ({
    sessionId,
    question,
    history,
    images,
    resumeState,
    configuration,
  }: {
    sessionId: string
    question: string
    history?: string
    images: { imageBase64: string; imageMimeType: string }[]
    resumeState?: DeepResearchResumeState
    configuration?: ChatRequestConfiguration
  }) => {
    const drController = new AbortController()
    abortControllerRef.current = drController
    setIsSending(true)

    try {
      await deepResearchService.run({
        signal: drController.signal,
        provider: configuration?.provider ?? selectedProvider,
        model: configuration?.model ?? selectedModels[selectedProvider],
        question,
        history,
        carefulReasoning: shouldUseCarefulReasoning(question),
        images: images.length > 0 ? images : undefined,
        resumeState,
        uiText: {
          stepAnalyze: t.chat_deep_research_step_analyze,
          stepRound1: t.chat_deep_research_step_round1,
          stepGap: t.chat_deep_research_step_gap,
          stepDeep: t.chat_deep_research_step_deep,
          stepCross: t.chat_deep_research_step_cross,
          stepSynth: t.chat_deep_research_step_synth,
          modeRealtime: t.chat_deep_research_mode_realtime,
          modeAiOnly: t.chat_deep_research_mode_ai_only,
          willStudy: t.chat_deep_research_will_study,
          imageContext: t.chat_deep_research_image_context,
          imageTerms: t.chat_deep_research_image_terms,
          imageKbLabel: t.chat_deep_research_image_kb_label,
          complete: t.chat_deep_research_complete,
          gapsFound: t.chat_deep_research_gaps_found,
          deeperLabel: t.chat_deep_research_deeper_label,
          cannotAnalyze: t.chat_deep_research_cannot_analyze,
          cannotResearch: t.chat_deep_research_cannot_research,
          crossFailed: t.chat_deep_research_cross_failed,
          crossFailedInline: t.chat_deep_research_cross_failed_inline,
          synthFailed: t.chat_deep_research_synth_failed,
          errorInline: t.chat_deep_research_error_inline,
          errorAnalyze: t.chat_deep_research_error_analyze,
          errorGeneric: t.chat_deep_research_error_generic,
          errorEval: t.chat_deep_research_error_eval,
          errorCross: t.chat_deep_research_error_cross,
          errorSynth: t.chat_deep_research_error_synth,
          errorUnknown: t.chat_deep_research_error_unknown,
          webSummary: t.chat_deep_research_web_summary,
          sourcesTitle: t.chat_smart_thinking_sources_title,
        },
        callbacks: {
          onStepStart: (label, meta) => {
            const msgId = createClientId('msg-dr')
            addChatMessage(sessionId, {
              id: msgId,
              role: 'assistant',
              content: [{ type: 'text', text: '' }],
              timestamp: Date.now(),
              isLoading: true,
              isResearchStep: true,
              researchStepLabel: label,
              researchStepPhase: meta.phase,
              researchStepAspect: meta.aspect,
            })
            return msgId
          },
          onStepComplete: (msgId, content, isFinal) => {
            updateChatMessage(sessionId, msgId, {
              content: [{ type: 'text', text: content }],
              isLoading: false,
              isResearchStep: !isFinal,
              isResearchFinal: isFinal,
              ...(isFinal ? { researchStepLabel: undefined } : {}),
            })
            if (isFinal) {
              recordChatCost(sessionId, msgId, question, content, configuration)
            }
          },
          onStepError: (msgId, error) => {
            updateChatMessage(sessionId, msgId, {
              isLoading: false,
              error: error === DEEP_RESEARCH_CANCELLED_ERROR
                ? undefined
                : localizeChatException(t, error, t.chat_error_failed_response),
              isResearchStep: true,
            })
          },
          // Persist phase-level snapshots so a Stop / page reload can resume
          // the run from the last completed phase. The store action accepts
          // `null` to clear the snapshot when synthesis succeeds.
          onSearchFallback: setSearchFallbackNotice,
          onSearchUnavailable: reportSearchUnavailable,
          onResumeStateChange: (state) => {
            setDeepResearchResumeState(sessionId, state ? { ...state, requestConfiguration: configuration } : null)
          },
        },
      })
    } catch {
      // Catastrophic + cancellation errors are surfaced via per-step
      // callbacks; we swallow here so the orchestration's `finally` always
      // resets the in-flight controller flag.
    } finally {
      if (abortControllerRef.current === drController) {
        abortControllerRef.current = null
      }
      setIsSending(false)
    }
  }, [
    selectedProvider,
    selectedModels,
    addChatMessage,
    updateChatMessage,
    recordChatCost,
    reportSearchUnavailable,
    setDeepResearchResumeState,
    t,
  ])

  /**
   * Click handler for the "Tiếp tục nghiên cứu" button on a stopped Deep
   * Research panel. Restores the persisted snapshot and replays the
   * pipeline starting from the next phase — already-completed phases are
   * skipped inside the service (see `isPhaseDone`), so the user pays only
   * for the remaining steps.
   */
  const handleResumeDeepResearch = useCallback(async () => {
    if (isSending || !activeChatSessionId) return
    const session = useAppStore.getState().chatSessions.find((s) => s.id === activeChatSessionId)
    const resumeState = session?.deepResearchResumeState
    if (!resumeState) return
    await runDeepResearchPipeline({
      sessionId: activeChatSessionId,
      question: resumeState.question,
      images: [],
      resumeState,
      configuration: resumeState.requestConfiguration,
    })
  }, [isSending, activeChatSessionId, runDeepResearchPipeline])

  const executeChatRequest = useCallback(async (retry?: {
    sessionId: string; message: ChatMessage; history: ChatMessage[]; assistantMsgId?: string;
    image: { base64: string; mimeType: string; previewUrl: string; fileName: string } | null;
  }) => {
    const configuration: ChatRequestConfiguration = retry?.message.requestConfiguration ?? {
      provider: selectedProvider, model: selectedModels[selectedProvider], systemPrompt: chatSystemPrompt || undefined,
      task: taskState ? { ...taskState, options: { ...taskState.options }, open: false } : null,
      ...getChatTaskExecution(taskState),
    }
    const draft = retry ? retry.message.content.filter((part) => part.type === 'text').map((part) => part.text ?? '').join('') : inputText
    const requestImage = retry ? retry.image : attachedImage
    const requestProvider = configuration.provider
    const requestModel = configuration.model
    const requestSystemPrompt = configuration.systemPrompt
    const requestDeepResearch = configuration.deepResearchMode
    const requestWebSearch = configuration.webSearchMode
    const requestImageMode = configuration.imageMode
    const requestHasKey = requestProvider === 'local' || useAppStore.getState().keyStatus[requestProvider]
    const recordRequestCost = (sessionId: string, messageId: string, input: string, reply: string) => recordChatCost(sessionId, messageId, input, reply, configuration)


    const text = draft.trim()
    if (isEmptyChatTask(draft) && !requestImage) return
    if ((!text && !requestImage) || isSending || abortControllerRef.current || isVoiceBusy || (requestImageMode && !text)) return
    if (!requestHasKey) return
    if (requestImageMode && !supportsChatImageMode(requestProvider)) return

    // Snapshot the current choices once; retries use the instruction saved on this user message.
    const taskInstruction = retry ? retry.message.taskInstruction : getChatTaskInstruction(t, configuration.task)
    const requestText = taskInstruction ? taskInstruction + text : text


    const sessionId = retry?.sessionId ?? ensureSession()
    collapseChatTaskOptions(sessionId)
    setShowPlusMenu(false)

    // ── Build the user message (shared by normal, vision, and Deep Research paths)
    const userContent: ChatMessageContent[] = []
    const userMsgId = createClientId('msg-u')
    if (requestImage && !retry) {
      userContent.push({
        type: 'image',
        imageBase64: requestImage.base64,
        imageMimeType: requestImage.mimeType,
        imagePreviewUrl: requestImage.previewUrl,
        imageFileName: requestImage.fileName,
        // Kept in the image store so the photo is still there when the conversation is reopened.
        imageStoreKey: persistChatImage(sessionId, userMsgId, requestImage.base64, requestImage.mimeType),
      })
    }
    if (text) {
      userContent.push({ type: 'text', text })
    }

    const userMsg: ChatMessage = retry?.message ?? {
      id: userMsgId,
      role: 'user',
      content: userContent,
      taskInstruction,
      requestConfiguration: configuration,
      timestamp: Date.now(),
    }

    // ── Deep Research path ────────────────────────────────────────────────────
    const publishResponse = (message: ChatMessage) => {
      if (retry?.assistantMsgId) updateChatMessage(sessionId, retry.assistantMsgId, { ...message, id: retry.assistantMsgId, error: undefined, usedModel: undefined, cost: undefined, isResearchStep: undefined, isResearchFinal: undefined, isSmartThinkingStep: undefined })
      else addChatMessage(sessionId, message)
    }
    if (requestDeepResearch && (text || requestImage)) {
      // Snapshot the earlier turns before the new question joins the session.
      const history = buildConversationTranscript(
        retry?.history ?? useAppStore.getState().chatSessions.find((s) => s.id === sessionId)?.messages ?? [],
      )
      if (!retry) addChatMessage(sessionId, userMsg)
      setDeepResearchResumeState(sessionId, null)
      if (!retry) setInputText('')
      if (!retry) setAttachedImage(null)
      await runDeepResearchPipeline({
        sessionId,
        configuration,
        question: requestText || t.chat_deep_research_image_only_prompt,
        history,
        images: requestImage
          ? [{ imageBase64: requestImage.base64, imageMimeType: requestImage.mimeType }]
          : [],
      })
      return
    }

    // ── Image Mode path (generate or edit) ───────────────────────────────────
    // Only available when the user explicitly enables Image Mode.
    // - With attached image + text prompt → edit the image.
    // - Without attached image → generate a new image from the text prompt.
    if (requestImageMode && (text || requestImage)) {
      // Earlier turns, captured before this message joins the session: they
      // give the planner its context and the image a follow-up may refine.
      const priorMessages = retry?.history ?? useAppStore.getState().chatSessions.find((s) => s.id === sessionId)?.messages ?? []
      if (!retry) addChatMessage(sessionId, userMsg)
      if (!retry) setInputText('')
      const capturedImage = requestImage
      if (!retry) setAttachedImage(null)
      const imgController = new AbortController()
      abortControllerRef.current = imgController
      setIsSending(true)

      const assistantMsgId = retry?.assistantMsgId ?? createClientId('msg-a')
      publishResponse({
        id: assistantMsgId,
        role: 'assistant',
        content: [{ type: 'text', text: '' }],
        timestamp: Date.now(),
        isLoading: true,
      })

      try {
        // An attached image with no instruction has nothing to generate or edit.
        if (!text) {
          updateChatMessage(sessionId, assistantMsgId, { isLoading: false, error: t.chat_image_mode_hint })
          return
        }

        // Rewrite the request into a detailed prompt and decide whether it
        // refines the image generated earlier in this conversation.
        const previousImage = capturedImage ? undefined : findLatestAssistantImage(priorMessages)
        const plan = configuration.imagePlan ?? await planImageRequest({
          provider: requestProvider,
          model: requestModel,
          text: requestText,
          history: buildConversationTranscript(priorMessages),
          hasPreviousImage: Boolean(previousImage),
          hasAttachedImage: Boolean(capturedImage),
          signal: imgController.signal,
        })
        if (imgController.signal.aborted) {
          updateChatMessage(sessionId, assistantMsgId, { isLoading: false })
          return
        }
        if (!configuration.imagePlan) updateChatMessage(sessionId, userMsg.id, {
          requestConfiguration: { ...configuration, imagePlan: { ...plan } },
        })

        const sourceImage = capturedImage
          ? { base64: capturedImage.base64, mimeType: capturedImage.mimeType }
          : plan.editPrevious ? previousImage : undefined
        const isEdit = Boolean(sourceImage)
        let result: Awaited<ReturnType<typeof chatService.editImage>>

        if (sourceImage) {
          if (typeof window.api.editChatImage !== 'function') {
            updateChatMessage(sessionId, assistantMsgId, {
              isLoading: false,
              error: t.chat_error_image_edit_reload_required,
            })
            return
          }
          result = await chatService.editImage({
            provider: requestProvider,
            model: requestModel,
            prompt: plan.prompt,
            imageBase64: sourceImage.base64,
            imageMimeType: sourceImage.mimeType,
          }, { signal: imgController.signal })
        } else {
          if (typeof window.api.generateChatImage !== 'function') {
            updateChatMessage(sessionId, assistantMsgId, {
              isLoading: false,
              error: t.chat_error_image_generate_reload_required,
            })
            return
          }
          result = await chatService.generateImage({
            provider: requestProvider,
            model: requestModel,
            prompt: plan.prompt,
          }, { signal: imgController.signal })
        }

        if (imgController.signal.aborted) {
          updateChatMessage(sessionId, assistantMsgId, { isLoading: false })
        } else if (result.success && result.imageBase64 && result.imageMimeType) {
          // Show the prompt that was actually used so the user can see it and refine it.
          const doneLabel = isEdit ? t.chat_image_edit_done : t.chat_image_generate_done
          // Image captions render as plain text, so the prompt is quoted rather than Markdown-formatted.
          const outputLabel = plan.rewritten ? `${doneLabel}\n\n“${plan.prompt}”` : doneLabel
          updateChatMessage(sessionId, assistantMsgId, {
            content: [
              {
                type: 'image',
                imageBase64: result.imageBase64,
                imageMimeType: result.imageMimeType,
                imagePreviewUrl: buildImageDataUrl(result.imageBase64, result.imageMimeType),
                imageFileName: `${isEdit ? 'edited' : 'generated'}-image-${Date.now()}.${imageExtensionFromMime(result.imageMimeType)}`,
                imageStoreKey: persistChatImage(sessionId, assistantMsgId, result.imageBase64, result.imageMimeType),
              },
              { type: 'text', text: outputLabel },
            ],
            isLoading: false,
          })
          recordRequestCost(sessionId, assistantMsgId, text, outputLabel)
        } else {
          updateChatMessage(sessionId, assistantMsgId, {
            isLoading: false,
            error: localizeChatError(
              t,
              result,
              isEdit ? t.chat_error_failed_image_edit : t.chat_error_image_generate_failed,
            ),
          })
        }
      } catch (err) {
        if (imgController.signal.aborted) {
          updateChatMessage(sessionId, assistantMsgId, { isLoading: false })
        } else {
          updateChatMessage(sessionId, assistantMsgId, {
            isLoading: false,
            error: localizeChatException(
              t, err,
              t.chat_error_image_generate_failed,
            ),
          })
        }
      } finally {
        if (abortControllerRef.current === imgController) abortControllerRef.current = null
        setIsSending(false)
      }
      return
    }

    if (!retry) addChatMessage(sessionId, userMsg)
    setDeepResearchResumeState(sessionId, null)
    if (!retry) setInputText('')
    if (!retry) setAttachedImage(null)
    const sendController = new AbortController()
    abortControllerRef.current = sendController
    setIsSending(true)

    // Build IPC-format conversation history (includes the user message just added).
    const ipcHistory = toIpcHistory(
      retry ? [...retry.history, userMsg] : useAppStore.getState().chatSessions.find((s) => s.id === sessionId)?.messages ?? []
    )

    // ── Smart Thinking path (DEFAULT for text-only chat) ─────────────────────
    // AI itself classifies the question and decides whether to web-search.
    // Skipped only when:
    //   • The user attached an image without Web Search mode (vision flow uses
    //     straight chatService.stream). With Web Search on, the image stays in
    //     the history for the final answer and the search still runs.
    //   • There is no text (image-only message)
    if (text && (!requestImage || requestWebSearch)) {
      // Single morphing placeholder bubble shared across all Smart Thinking phases:
      //   1. Initial "Thinking…" — while AI classifier decides whether to web-search.
      //   2. "Smart Thinking…" pill — shown only if the classifier triggered a web search.
      //   3. Back to "Thinking…" — between search completion and the start of token streaming.
      //   4. Streaming tokens — final answer fills the same bubble.
      // Reusing one bubble (instead of swapping between a step bubble and an answer bubble)
      // matches modern chat UIs and keeps the conversation flow visually stable.
      const placeholderMsgId = retry?.assistantMsgId ?? createClientId('msg-a')
      publishResponse({
        id: placeholderMsgId,
        role: 'assistant',
        content: [{ type: 'text', text: '' }],
        timestamp: Date.now(),
        isLoading: true,
      })

      try {
        await smartThinkingService.run({
          signal: sendController.signal,
          provider: requestProvider,
          model: requestModel,
          question: requestText,
          messages: ipcHistory,
          systemPrompt: requestSystemPrompt || undefined,
          carefulReasoning: shouldUseCarefulReasoning(text),
          forceWebSearch: requestWebSearch,
          allowWebSearch: requestWebSearch,
          uiText: {

            webSearchStepLabelPrefix: t.chat_smart_thinking_step_label_prefix,
            webSearchSummaryTitle: t.chat_smart_thinking_summary_title,
            webSearchDefaultReason: t.chat_smart_thinking_default_reason,
            webSearchSourcesTitle: t.chat_smart_thinking_sources_title,
            webSearchNoSources: t.chat_smart_thinking_no_sources,
            webSearchNoResults: t.chat_smart_thinking_no_results,
            webSearchErrorFallback: t.chat_smart_thinking_search_error,
            noResponseError: t.chat_smart_thinking_no_response,
            unknownError: t.chat_smart_thinking_unknown_error,
          },
          callbacks: {
            // Step starts → flip the placeholder to the "Smart Thinking…" pill.
            // We deliberately ignore `label` and any step content/sources so the
            // user only sees a lightweight indicator.
            onStepStart: (_label) => {
              updateChatMessage(sessionId, placeholderMsgId, {
                content: [{ type: 'text', text: '' }],
                isLoading: true,
                isSmartThinkingStep: true,
                researchStepLabel: t.chat_smart_thinking_badge,
              })
              return placeholderMsgId
            },
            // Step done → clear the Smart Thinking pill and return the bubble
            // to its plain "Thinking…" state until token streaming begins.
            onStepComplete: (_msgId, _content) => {
              updateChatMessage(sessionId, placeholderMsgId, {
                content: [{ type: 'text', text: '' }],
                isLoading: true,
                isSmartThinkingStep: false,
                researchStepLabel: undefined,
              })
            },
            onStepError: (_msgId, _error) => {
              // Soft fallback: keep showing "Thinking…" so the model can still
              // answer from internal knowledge. The web-search failure itself
              // is not surfaced — only a final answer error would be.
              updateChatMessage(sessionId, placeholderMsgId, {
                content: [{ type: 'text', text: '' }],
                isLoading: true,
                isSmartThinkingStep: false,
                researchStepLabel: undefined,
              })
            },
            onSearchFallback: setSearchFallbackNotice,
            onSearchUnavailable: reportSearchUnavailable,
            onAnswerStart: () => placeholderMsgId,
            onAnswerToken: (_msgId, content) => {
              updateChatMessage(sessionId, placeholderMsgId, {
                content: [{ type: 'text', text: content }],
                isLoading: true,
                isSmartThinkingStep: false,
                researchStepLabel: undefined,
                error: undefined,
              })
            },
            onAnswerComplete: (_msgId, content) => {
              updateChatMessage(sessionId, placeholderMsgId, {
                content: [{ type: 'text', text: content }],
                isLoading: false,
                isSmartThinkingStep: false,
                researchStepLabel: undefined,
              })
              recordRequestCost(
                sessionId,
                placeholderMsgId,
                flattenChatCostInput(ipcHistory, requestSystemPrompt || undefined),
                content,
              )
            },
            onAnswerError: (_msgId, error, errorCode) => {
              updateChatMessage(sessionId, placeholderMsgId, {
                isLoading: false,
                isSmartThinkingStep: false,
                researchStepLabel: undefined,
                error: localizeChatError(t, { error, errorCode }, t.chat_error_failed_response),
              })
            },
          },
        })
      } catch {
        // Per-step errors are handled by callbacks; ignore catastrophic ones.
      } finally {
        if (abortControllerRef.current === sendController) {
          abortControllerRef.current = null
        }
        setIsSending(false)
      }
      return
    }

    // ── Image edit path ──────────────────────────────────────────────────────
    // Chat/vision endpoints can analyze images but cannot return edited pixels.
    // When the prompt asks for a visual edit, call the dedicated image-edit API.
    const shouldEditImage = Boolean(requestImage && text && configuration.task?.selected == null && shouldRouteToImageEdit(text, true))

    if (requestImage && shouldEditImage) {
      const assistantMsgId = retry?.assistantMsgId ?? createClientId('msg-a')
      publishResponse({
        id: assistantMsgId,
        role: 'assistant',
        content: [{ type: 'text', text: '' }],
        timestamp: Date.now(),
        isLoading: true,
      })

      if (typeof window.api.editChatImage !== 'function') {
        updateChatMessage(sessionId, assistantMsgId, {
          isLoading: false,
          error: t.chat_error_image_edit_reload_required,
        })
        if (abortControllerRef.current === sendController) {
          abortControllerRef.current = null
        }
        setIsSending(false)
        return
      }

      try {
        const result = await chatService.editImage({
          provider: requestProvider,
          model: requestModel,
          prompt: requestText,
          imageBase64: requestImage.base64,
          imageMimeType: requestImage.mimeType,
        }, { signal: sendController.signal })

        // Cancellation aborts the provider; also guard against a result racing
        // with Stop so it cannot replace the cancelled response.
        if (sendController.signal.aborted) {
          updateChatMessage(sessionId, assistantMsgId, { isLoading: false })
        } else if (result.success && result.imageBase64 && result.imageMimeType) {
          const outputLabel = t.chat_image_edit_done
          updateChatMessage(sessionId, assistantMsgId, {
            content: [
              {
                type: 'image',
                imageBase64: result.imageBase64,
                imageMimeType: result.imageMimeType,
                imagePreviewUrl: buildImageDataUrl(result.imageBase64, result.imageMimeType),
                imageFileName: `edited-image-${Date.now()}.${imageExtensionFromMime(result.imageMimeType)}`,
                imageStoreKey: persistChatImage(sessionId, assistantMsgId, result.imageBase64, result.imageMimeType),
              },
              { type: 'text', text: outputLabel },
            ],
            isLoading: false,
          })
          recordRequestCost(sessionId, assistantMsgId, text, outputLabel)
        } else {
          updateChatMessage(sessionId, assistantMsgId, {
            isLoading: false,
            error: localizeChatError(t, result, t.chat_error_failed_image_edit),
          })
        }
      } catch (err) {
        if (sendController.signal.aborted) {
          updateChatMessage(sessionId, assistantMsgId, { isLoading: false })
        } else {
          updateChatMessage(sessionId, assistantMsgId, {
            isLoading: false,
            error: localizeChatException(t, err, t.chat_error_failed_image_edit),
          })
        }
      } finally {
        if (abortControllerRef.current === sendController) {
          abortControllerRef.current = null
        }
        setIsSending(false)
      }
      return
    }

    // ── Vision / image-attached path ─────────────────────────────────────────
    // Smart Thinking does not support images; non-edit image prompts use vision chat.

    // Placeholder assistant message
    const assistantMsgId = retry?.assistantMsgId ?? createClientId('msg-a')
    const assistantPlaceholder: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: [{ type: 'text', text: '' }],
      timestamp: Date.now(),
      isLoading: true,
    }
    addChatMessage(sessionId, assistantPlaceholder)

    try {
      let streamedText = ''
      const result = await chatService.stream(
        {
          provider: requestProvider,
          model: requestModel,
          messages: ipcHistory,
          systemPrompt: requestSystemPrompt || undefined,
          carefulReasoning: shouldUseCarefulReasoning(text),
        },
        {
          // Same buffering rationale as the regenerate path — see the constant.
          bufferIntervalMs: CHAT_STREAM_BUFFER_INTERVAL_MS,

          onToken: (token) => {
            streamedText += token
            updateChatMessage(sessionId, assistantMsgId, {
              content: [{ type: 'text', text: streamedText }],
              isLoading: true,
              error: undefined,
            })
          },
          signal: sendController.signal,
        },
      )


      // User cancelled mid-stream — keep partial tokens, no error banner.
      if (result.errorCode === 'CANCELLED' || sendController.signal.aborted) {
        updateChatMessage(sessionId, assistantMsgId, {
          content: [{ type: 'text', text: streamedText }],
          isLoading: false,
        })
      } else if (result.success && result.reply) {
        updateChatMessage(sessionId, assistantMsgId, {
          content: [{ type: 'text', text: result.reply }],
          isLoading: false,
          usedModel: result.usedModel,
        })
        recordRequestCost(
          sessionId,
          assistantMsgId,
          flattenChatCostInput(ipcHistory, requestSystemPrompt || undefined),
          result.reply,
        )
      } else {
        updateChatMessage(sessionId, assistantMsgId, {
          isLoading: false,
          error: localizeChatError(t, result, t.chat_error_failed_response),
        })
      }
    } catch (err) {
      if (sendController.signal.aborted) {
        updateChatMessage(sessionId, assistantMsgId, {
          isLoading: false,
        })
      } else {
        updateChatMessage(sessionId, assistantMsgId, {
          isLoading: false,
          error: localizeChatException(t, err, t.chat_error_failed_response),
        })
      }
    } finally {
      if (abortControllerRef.current === sendController) {
        abortControllerRef.current = null
      }
      setIsSending(false)
    }
  }, [
    inputText,
    taskState,
    attachedImage,
    isSending,
    isVoiceBusy,
    ensureSession,
    addChatMessage,
    updateChatMessage,
    selectedProvider,
    selectedModels,
    chatSystemPrompt,
    recordChatCost,
    reportSearchUnavailable,
    runDeepResearchPipeline,
    setDeepResearchResumeState,
    setInputText,
    t,
  ])


  const handleSend = useCallback(() => executeChatRequest(), [executeChatRequest])
  const handleRegenerate = useCallback(async () => {
    if (isSending || isVoiceBusy || !activeChatSessionId) return
    const sessionId = activeChatSessionId
    const session = useAppStore.getState().chatSessions.find((item) => item.id === sessionId)
    if (!session) return
    const assistant = [...session.messages].reverse().find((message) => message.role === 'assistant')
    if (!assistant) return
    const assistantIndex = session.messages.findIndex((message) => message.id === assistant.id)
    const preceding = session.messages.slice(0, assistantIndex)
    const user = [...preceding].reverse().find((message) => message.role === 'user')
    if (!user) return
    const userIndex = session.messages.findIndex((message) => message.id === user.id)
    const originalImage = user.content.find((part) => part.type === 'image')
    let image = null
    if (originalImage) {
      const stored = !originalImage.imageBase64 && originalImage.imageStoreKey ? await getChatImage(originalImage.imageStoreKey) : null
      const base64 = originalImage.imageBase64 ?? stored?.imageBase64
      const mimeType = originalImage.imageMimeType ?? stored?.imageMimeType
      if (!base64 || !mimeType) { reportAttachImageError(t.chat_image_unavailable); return }
      image = { base64, mimeType, previewUrl: originalImage.imagePreviewUrl ?? buildImageDataUrl(base64, mimeType), fileName: originalImage.imageFileName ?? 'image' }
    }
    const message = user.requestConfiguration ? user : { ...user, requestConfiguration: {
      provider: session.provider, model: session.model, task: null, imageMode: false,
      deepResearchMode: false, webSearchMode: false, systemPrompt: chatSystemPrompt || undefined,
    } }
    const originalConfiguration = message.requestConfiguration
    if (!originalConfiguration) return
    if (originalConfiguration.provider !== 'local' && !useAppStore.getState().keyStatus[originalConfiguration.provider]) {
      reportAttachImageError(t.chat_error_no_key); return
    }
    if (!user.requestConfiguration) useAppStore.getState().updateChatMessage(sessionId, user.id, { requestConfiguration: message.requestConfiguration })
    if (originalConfiguration.deepResearchMode) useAppStore.getState().restartChatResearch(sessionId, user.id)
    await executeChatRequest({ sessionId, message, history: session.messages.slice(0, userIndex),
      assistantMsgId: originalConfiguration.deepResearchMode ? undefined : assistant.id, image })
  }, [activeChatSessionId, isSending, isVoiceBusy, executeChatRequest, chatSystemPrompt, reportAttachImageError, t])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {

    if (shouldSendChatMessage(e.nativeEvent, chatSendShortcut, platform)) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Paste image from clipboard ──
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = extractImageFromClipboard(e.clipboardData)
    if (!file) return
    e.preventDefault()
    handleImageSelect(file)
  }, [handleImageSelect])

  const showCopiedToast = useCallback(() => {
    notify({ key: COPIED_KEY, tone: 'success', message: t.chat_copied, durationMs: COPY_FEEDBACK_DURATION_MS })
  }, [notify, t.chat_copied])

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

    try {
      await copyImageToClipboard(imageUrl)
    } catch {
      await navigator.clipboard?.writeText?.(imageUrl).catch(() => {})
    }
    showCopiedToast()
  }, [showCopiedToast])

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
    showCopiedToast()
  }

  const handleNewChat = useCallback(() => {
    setActiveChatSession(null)
  }, [setActiveChatSession])

  useEffect(() => {
    const handleNewChatShortcut = (e: KeyboardEvent) => {
      if (e.repeat || !eventMatchesShortcut(e, chatNewSessionShortcut, platform)) return
      e.preventDefault()
      handleNewChat()
    }

    window.addEventListener('keydown', handleNewChatShortcut)
    return () => window.removeEventListener('keydown', handleNewChatShortcut)
  }, [chatNewSessionShortcut, handleNewChat, platform])

  /**
   * Stop the in-flight chat request.
   *
   * Calls `controller.abort()` on the active AbortController; that signal is
   * forwarded down through chatService → preload → main process, which closes
   * the provider stream and emits a `CANCELLED` event so the UI keeps any
   * tokens already streamed without showing an error banner.
   */
  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  const messages = activeSession?.messages ?? []

  // Restore AI images whose pixel data was stripped when the session was
  // persisted (they were saved to the image store when created). A key that is
  // looked up once is never retried, so a missing entry cannot cause a loop.
  const requestedImageKeysRef = useRef(new Set<string>())
  useEffect(() => {
    if (!activeChatSessionId) return
    const sessionId = activeChatSessionId
    for (const message of messages) {
      for (const part of message.content) {
        const key = part.imageStoreKey
        if (part.type !== 'image' || !key || part.imageBase64 || requestedImageKeysRef.current.has(key)) continue
        requestedImageKeysRef.current.add(key)
        void getChatImage(key).then((stored) => {
          if (!stored) return
          // Re-read the message: it may have changed while the lookup was running.
          const latest = useAppStore
            .getState()
            .chatSessions.find((s) => s.id === sessionId)
            ?.messages.find((m) => m.id === message.id)
          if (!latest) return
          updateChatMessage(sessionId, message.id, {
            content: latest.content.map((p) =>
              p.imageStoreKey === key && !p.imageBase64
                ? {
                    ...p,
                    imageBase64: stored.imageBase64,
                    imageMimeType: stored.imageMimeType,
                    imagePreviewUrl: buildImageDataUrl(stored.imageBase64, stored.imageMimeType),
                  }
                : p,
            ),
          })
        })
      }
    }
  }, [activeChatSessionId, messages, updateChatMessage])
  const attachedImageReadable = imageInputSupport(selectedProvider, selectedModels[selectedProvider] ?? '')
  const canResumeDeepResearch = Boolean(
    getChatTaskExecution(taskState).deepResearchMode
    && !isSending
    && !inputText.trim()
    && !attachedImage
    && activeSession?.deepResearchResumeState
    && activeSession.deepResearchResumeState.lastCompletedPhase !== 'synth',
  )
  const canRetryDeepResearch = Boolean(
    getChatTaskExecution(taskState).deepResearchMode
    && !isSending && !inputText.trim() && !attachedImage
    && !activeSession?.deepResearchResumeState
    && messages[messages.length - 1]?.isResearchStep
    && [...messages].reverse().find((message) => message.role === 'user')?.requestConfiguration?.deepResearchMode,
  )

  const composerPlaceholder = imageMode
    ? (imageModeSupported ? t.chat_image_mode_hint : t.chat_image_mode_unsupported_provider)
    : taskState?.selected == null ? t.chat_placeholder : [
      t.chat_task_translate_placeholder, t.chat_task_research_placeholder,
      t.chat_task_explain_placeholder, t.chat_task_write_placeholder,
    ][taskState.selected]

  const handleTaskSelect = (index: number | null, option?: string) => {
    if (index === 4 && !imageModeSupported) return
    const next = selectChatTask(t, locale, taskState, index, option)
    setChatTaskState(activeChatSessionId, next)
    requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }))
  }
  // The image task edits the newest generated image when nothing else is attached.
  const handleEditLatestImage = () => {
    if (!imageMode) handleTaskSelect(4)
    else requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }))
  }
  const handleTaskOpenChange = useCallback((open: boolean) => {
    const store = useAppStore.getState()
    const stored = activeChatSessionId
      ? store.chatSessions.find((session) => session.id === activeChatSessionId)?.taskState
      : store.chatPendingTaskState
    const owner = activeChatSessionId ? store.chatSessions.find((session) => session.id === activeChatSessionId) : null
    const current = resolveChatTaskState(stored, owner ?? { imageMode: store.chatPendingImageMode,
      deepResearchMode: store.chatPendingDeepResearchMode, webSearchMode: store.chatPendingWebSearchMode })
    setChatTaskState(activeChatSessionId, { selected: null, options: {}, applied: null, ...current, unified: true, open })
  }, [activeChatSessionId, setChatTaskState])

  /** Shared input area — one task trigger and one composer for every state. */
  const needsTaskContent = !attachedImage && isEmptyChatTask(inputText)
  const inputArea = (
    <div className="chat-composer-content flex flex-col">
      {/* Image preview */}
      {attachedImage && (
        <ImagePreviewThumbnail
          src={attachedImage.previewUrl}
          alt={attachedImage.fileName}
          removeTitle={t.chat_remove_image}
          onRemove={() => setAttachedImage(null)}
        />
      )}
      {attachedImage && !imageMode && attachedImageReadable !== 'yes' && (
        <p className="chat-task-hint chat-attachment-hint" role="status">
          {attachedImageReadable === 'no' ? t.chat_attachment_model_cannot_read : t.chat_attachment_model_may_not_read}
        </p>
      )}

      {/* Textarea row */}
      <div className="px-3 pt-2.5 pb-1">
        <textarea
          ref={textareaRef}
          value={inputText}
          onChange={(e) => { setInputText(e.target.value); if (isVoiceActive) resetVoicePrefix() }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={composerPlaceholder}
          rows={1}
          disabled={isSending}
          readOnly={isVoiceBusy}
          aria-busy={isVoiceBusy}
          className={`chat-input-field w-full ${isVoiceInterim ? 'italic' : ''}`}
          style={isVoiceInterim ? { color: 'var(--vzn-text-soft)' } : undefined}
          aria-describedby={needsTaskContent ? 'chat-task-content-hint' : undefined}
        />
        {needsTaskContent && (
          <p id="chat-task-content-hint" className="chat-task-hint" role="status">{t.chat_task_needs_content}</p>
        )}
      </div>

      {/* Bottom controls bar: [+ | Ảnh | Tự động ▼]  ···  [model | voice | send] */}
      <div className="chat-composer-toolbar flex items-center justify-between px-2 pb-1.5">

        {/* Left: attach, web sources and the task */}
        <div className="chat-composer-tools flex min-w-0 items-center gap-1">

          {/* + button — attach file */}
          <Button
            ref={plusBtnRef}
            size="md"
            shape="icon"
            variant={showPlusMenu ? 'primary' : 'neutral'}
            appearance={showPlusMenu ? 'soft' : 'ghost'}
            onClick={showPlusMenu ? () => setShowPlusMenu(false) : openPlusMenu}
            title={t.chat_attach_image}
            aria-label={t.chat_attach_image}
            aria-haspopup="menu"
            aria-expanded={showPlusMenu}
            disabled={isVoiceBusy}
            className="chat-action-button flex-shrink-0"
          >
            <PlusIcon />
          </Button>

          {canUseChatWebSearch(taskState) && <Button size="md" shape="icon"
            variant={webSearchMode ? 'primary' : 'neutral'} appearance={webSearchMode ? 'soft' : 'ghost'}
            aria-label={t.chat_web_source} aria-pressed={webSearchMode} title={t.chat_web_source_hint}
            disabled={isVoiceBusy} onClick={() => setChatTaskState(activeChatSessionId, {
              selected: null, options: {}, applied: null, open: false, ...taskState, unified: true, webSearch: !webSearchMode,
            })}>
            <GlobeIcon className="h-4 w-4" />
          </Button>}

          {hasKey && (
            <ChatTaskConfiguration t={t} state={taskState} disabled={isVoiceBusy} imageSupported={imageModeSupported}
              contextKey={`${activeChatSessionId ?? 'pending'}:${messages.filter((message) => message.role === 'user').length}`}
              onSelect={handleTaskSelect} onOpenChange={handleTaskOpenChange} />
          )}
        </div>

        {/* Right: char count · model · voice · send */}
        <div className="chat-composer-actions flex min-w-0 items-center gap-1">
          {inputText.length > 600 && (
            <span className="ui-micro tabular-nums">{inputText.length}</span>
          )}
          <VoiceRecorder
            sourceLang="auto"
            contextKey={voiceContextKey}
            onTranscript={handleVoiceTranscript}
            onRecordingChange={handleVoiceRecordingChange}
            onStateChange={handleVoiceStateChange}
            onError={handleVoiceError}
            onCancel={cancelVoiceInput}
            titleRecord={t.chat_voice_record}
            titleStop={t.chat_voice_stop}
            buttonSize="md"
            labelTranscribing={t.voice_transcribing}
            labelRecording={t.voice_recording}
            labelCancel={t.voice_cancel}
            showCancel
            showPulse={false}
            disabled={isSending}
          />
          {!isVoiceBusy && (isSending ? (
            <Button
              size="md"
              shape="icon"
              variant="danger"
              appearance="soft"
              onClick={handleStop}
              title={t.chat_stop}
              aria-label={t.chat_stop}
              className="chat-stop-button"
            >
              <StopSquareIcon className="w-5 h-5" />
            </Button>
          ) : (
            <Button
              size="md"
              shape="icon"
              variant="primary"
              appearance="solid"
              onClick={handleSend}
              disabled={((!inputText.trim() || isEmptyChatTask(inputText)) && !attachedImage) || !hasKey || (imageMode && (!imageModeSupported || !inputText.trim()))}
              title={t.chat_send}
              aria-label={t.chat_send}
              className="chat-send-button"
            >
              <SendIcon />
            </Button>
          ))}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImageSelect(file); e.target.value = '' }}
      />

      {/* + Menu portal — attach file only */}
      {showPlusMenu && createPortal(
        <div
          ref={plusMenuRef}
          className="floating-panel overflow-hidden"
          style={{ position: 'fixed', bottom: plusMenuPos.bottom, left: plusMenuPos.left, width: 220, zIndex: 9999 }}
        >
          <button
            type="button"
            className="btn-menu-item justify-start gap-3"
            onClick={() => { fileInputRef.current?.click(); setShowPlusMenu(false) }}
          >
            <PaperclipIcon className="w-[18px] h-[18px] flex-shrink-0 text-[--vzn-text-muted]" />
            <span>{t.chat_menu_attach_files}</span>
          </button>
        </div>,
        document.body
      )}

      {/* Mode dropdown portal — Tiêu chuẩn / Tìm kiếm / Nghiên cứu / Tạo ảnh */}
    </div>
  )

  return (
    <div
      role="application"
      aria-label={t.chat_attach_image}
      className="app-page chat-page relative"
      onDragOver={(e) => {
        e.preventDefault()
        if (!isDraggingOver) setIsDraggingOver(true)
      }}
      onDragLeave={handleDragLeave}
      onDrop={handleFileDrop}
    >
      {/* Drop indicator overlay */}
      {isDraggingOver && (
        <DragOverlay label={t.chat_attach_image} zIndex="z-50" showRing />
      )}

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="app-workspace">

          {messages.length === 0 ? (
            <div className="chat-empty-state">
              <div className="chat-empty-scroll">
                <div className="chat-empty-hero">
                  <div className="chat-hero-mark" aria-hidden="true">
                    <AppLogoIcon size="lg" />
                  </div>

                  <h1 className="chat-empty-heading">
                    {t.chat_empty_desc}
                  </h1>

                  {!hasKey && (
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-sm" style={{ color: 'var(--vzn-text-muted)' }}>{t.chat_error_no_key}</p>
                      <Button
                        size="sm"
                        shape="rect"
                        variant="primary"
                        appearance="solid"
                        type="button"
                        onClick={() => openSettings()}
                      >
                        {t.chat_error_open_settings}
                      </Button>
                    </div>
                  )}

                </div>
              </div>

              <div className="chat-empty-composer">
                <div className={`chat-composer chat-page-composer w-full ${isDraggingOver ? 'chat-composer-drop' : ''}`}>
                  {inputArea}
                </div>
              </div>
            </div>
          ) : (
            /* ── With messages: full-page ChatGPT style ── */
            <div className={`flex-1 min-h-0 flex flex-col relative ${isDraggingOver ? 'surface-panel-drop' : ''}`}>

              {/* Messages list — scrollable, max-width centered */}
              <div className="chat-messages-scroll flex-1 overflow-y-auto">
                <div className="chat-message-stage">
                  {(() => {
                    const lastAssistantIdx = messages.reduce(
                      (acc, m, i) => (m.role === 'assistant' ? i : acc), -1
                    )

                    // Walk the messages list and emit either a single bubble
                    // or a grouped panel for each consecutive run of research
                    // steps. We keep the order stable so React keys remain
                    // unique (we use the first step id as the panel's key).
                    const rendered: React.ReactNode[] = []
                    let i = 0
                    while (i < messages.length) {
                      const msg = messages[i]
                      if (msg.isResearchStep) {
                        // Collect every consecutive research-step message.
                        const group: ChatMessage[] = []
                        while (i < messages.length && messages[i].isResearchStep) {
                          group.push(messages[i])
                          i++
                        }
                        // Only the run that ended the conversation can be resumed or retried.
                        const endsConversation = i === messages.length
                        rendered.push(
                          <ResearchStepsPanel
                            key={`rsp-${group[0].id}`}
                            steps={group}
                            onResume={endsConversation && canResumeDeepResearch ? handleResumeDeepResearch : undefined}
                            onRetry={endsConversation && canRetryDeepResearch ? handleRegenerate : undefined}
                          />
                        )
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
                          onEditImage={i === lastAssistantIdx && imageModeSupported ? handleEditLatestImage : undefined}
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
                  <div ref={messagesEndRef} className="chat-messages-end" aria-hidden="true" />
                </div>
              </div>

              {/* Input — in-flow footer, max-width centered */}
              <div className="chat-active-composer-footer">
                <div className="chat-active-composer-inner">
                  <div className="chat-composer chat-page-composer">
                    {inputArea}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

    </div>
  )
}
