import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { MessageBubble } from '../components/chat/MessageBubble'
import { ResearchStepsPanel } from '../components/chat/ResearchStepsPanel'
import { ChatAIConfiguration } from '../components/organisms'
import { AppLogoIcon, Button } from '../components/ui/atoms'
import { DragOverlay } from '../components/ui/DragOverlay'
import { ImagePreviewThumbnail } from '../components/ui/ImagePreviewThumbnail'
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  GlobeIcon,
  ImageSparkleIcon,
  LightbulbIcon,
  PaperclipIcon,
  PencilIcon,
  PlusIcon,
  SendIcon,
  StopSquareIcon,
  TelescopeIcon,
  TranslateIcon,
  XIcon,
} from '../components/ui/icons'
import { NotificationToast, PromptCard } from '../components/ui/molecules'

import { VoiceRecorder, type VoiceRecordingState } from '../components/VoiceRecorder'
import { MAX_CHAT_IMAGE_DIMENSION, MAX_IMAGE_INPUT_BYTES } from '../constants/image'
import { COPY_FEEDBACK_DURATION_MS } from '../constants/ui'
import { useVoiceInput } from '../hooks/useVoiceInput'
import type { VoiceErrorTranslationKey } from '../i18n/types'
import { chatService } from '../services/chatService'
import { DEEP_RESEARCH_CANCELLED_ERROR, deepResearchService } from '../services/deepResearchService'
import { planImageRequest } from '../services/imagePromptService'
import type { ActionableSearchFallback } from '../services/searchResultFormatting'
import { smartThinkingService } from '../services/smartThinkingService'
import { useAppStore, useT } from '../store/useAppStore'
import type {
  AudioTranscriptionErrorCode,
  ChatMessage,
  ChatMessageContent,
  DeepResearchResumeState,
  Provider,
} from '../types'

import { shouldUseCarefulReasoning } from '../utils/carefulReasoning'
import { localizeChatError, localizeChatException } from '../utils/chatErrors'
import { supportsChatImageMode } from '../utils/chatImageMode'
import { createClientId } from '../utils/id'
import { extractImageFromClipboard, resizeImageFile } from '../utils/imageUtils'
import { eventMatchesShortcut, shouldSendChatMessage } from '../utils/keyboardShortcuts'
import { estimateUsageCost } from '../utils/usageCost'
import { canResolveVoiceErrorInSettings, getVoiceNotificationTone } from '../utils/voiceErrors'


/** Max height (px) của textarea input — giới hạn scroll khi text dài */
const CHAT_TEXTAREA_MAX_HEIGHT_PX = 160

/**
 * Buffer interval (ms) used to coalesce streamed tokens before they hit the
 * Zustand store. 60 ms ≈ 16 Hz feels real-time to the eye while skipping
 * ~70% of the per-token re-renders ChatPage would otherwise pay for.
 */
const CHAT_STREAM_BUFFER_INTERVAL_MS = 60

/** How long the web-search fallback notice stays up; longer than a plain toast because it offers an action. */
const SEARCH_FALLBACK_NOTICE_MS = 10_000

/** Response modes are mutually exclusive; each maps onto the per-session mode flags. */
type ResponseMode = 'standard' | 'web' | 'research' | 'image'

interface ModeOption {
  mode: ResponseMode
  label: string
  Icon?: typeof GlobeIcon
  /** Secondary line under the label, e.g. why the option is unavailable. */
  hint?: string
  title?: string
  disabled?: boolean
}

const MODE_MENU_ID = 'chat-response-mode-menu'
const MODE_MENU_ITEM_SELECTOR = '[role="menuitemradio"]'


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

/** Text of the most recent user message, used to decide per-request prompt options. */
function latestUserText(messages: ReturnType<typeof toIpcHistory>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'user') continue
    return messages[i].content.map((c) => c.text ?? '').join(' ')
  }
  return ''
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
export function ChatPage() {
  // Subscribe with `useShallow` so ChatPage only re-renders when one of the
  // listed slices actually changes (instead of on every unrelated store mutation
  // such as locale, history, usage cost, etc.). Actions are stable references in
  // Zustand so they're safe to include without churn.
  const {
    selectedProvider, selectedModels, keyStatus,
    chatSendShortcut, chatNewSessionShortcut,
    chatSessions, activeChatSessionId, chatSystemPrompt,
    createChatSession, setActiveChatSession, setChatSessionModel, addChatMessage, updateChatMessage,
    addChatSessionCost, openSettings,
    recordUsageCost, setDeepResearchResumeState,
    setChatSessionDraft, setChatSessionDeepResearchMode, setChatSessionWebSearchMode, setChatSessionImageMode,
    setChatPendingDraft, setChatPendingDeepResearchMode, setChatPendingWebSearchMode, setChatPendingImageMode,
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
      setChatSessionDeepResearchMode: s.setChatSessionDeepResearchMode,
      setChatSessionWebSearchMode: s.setChatSessionWebSearchMode,
      setChatSessionImageMode: s.setChatSessionImageMode,
      setChatPendingDraft: s.setChatPendingDraft,
      setChatPendingDeepResearchMode: s.setChatPendingDeepResearchMode,
      setChatPendingWebSearchMode: s.setChatPendingWebSearchMode,
      setChatPendingImageMode: s.setChatPendingImageMode,
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
  const isVoiceBusy = voiceRecordingState !== 'idle' && voiceRecordingState !== 'error'
  /**
   * AbortController for the in-flight chat request. Held in a ref (not state)
   * because handlers shouldn't re-render when it's swapped, and because
   * `handleStop` needs the latest controller without going through React's
   * batched state queue. Reset to `null` once the request settles.
   */
  const abortControllerRef = useRef<AbortController | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [attachedImage, setAttachedImage] = useState<{
    base64: string; mimeType: string; previewUrl: string; fileName: string
  } | null>(null)
  /** User-visible error shown in the input area when image processing fails. */
  const [attachImageError, setAttachImageError] = useState<string | null>(null)
  /** Visual feedback state when user drags a file over the chat area */
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  /** Plus menu (attach/tools) popup */
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [plusMenuPos, setPlusMenuPos] = useState<{ bottom: number; left: number }>({ bottom: 0, left: 0 })
  const plusBtnRef = useRef<HTMLButtonElement>(null)
  const plusMenuRef = useRef<HTMLDivElement>(null)
  /** Mode dropdown (Tự động / Tìm kiếm / Nghiên cứu) */
  const [showModeMenu, setShowModeMenu] = useState(false)
  const [modeMenuPos, setModeMenuPos] = useState<{ bottom: number; left: number }>({ bottom: 0, left: 0 })
  const modeBtnRef = useRef<HTMLButtonElement>(null)
  const modeMenuRef = useRef<HTMLDivElement>(null)
  /** Whether Deep Research multi-step pipeline is active — persisted per session */
  const [deepResearchMode, setDeepResearchModeLocal] = useState(() => {
    const s = useAppStore.getState()
    if (s.activeChatSessionId) {
      return s.chatSessions.find((x) => x.id === s.activeChatSessionId)?.deepResearchMode ?? false
    }
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

  /** Whether Web Search mode is active — always forces a web search, persisted per session */
  const [webSearchMode, setWebSearchModeLocal] = useState(() => {
    const s = useAppStore.getState()
    if (s.activeChatSessionId) {
      return s.chatSessions.find((x) => x.id === s.activeChatSessionId)?.webSearchMode ?? false
    }
    return s.chatPendingWebSearchMode
  })
  const setWebSearchMode = useCallback((updater: boolean | ((v: boolean) => boolean)) => {
    setWebSearchModeLocal((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      const sid = useAppStore.getState().activeChatSessionId
      if (sid) setChatSessionWebSearchMode(sid, next)
      else setChatPendingWebSearchMode(next)
      return next
    })
  }, [setChatSessionWebSearchMode, setChatPendingWebSearchMode])

  /** Image Mode — tạo ảnh từ text hoặc sửa ảnh đính kèm bằng AI, persisted per session */
  const [imageMode, setImageModeLocal] = useState(() => {
    const s = useAppStore.getState()
    if (s.activeChatSessionId) {
      return s.chatSessions.find((x) => x.id === s.activeChatSessionId)?.imageMode ?? false
    }
    return s.chatPendingImageMode
  })
  const setImageMode = useCallback((updater: boolean | ((v: boolean) => boolean)) => {
    setImageModeLocal((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      const sid = useAppStore.getState().activeChatSessionId
      if (sid) setChatSessionImageMode(sid, next)
      else setChatPendingImageMode(next)
      return next
    })
  }, [setChatSessionImageMode, setChatPendingImageMode])

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
      setShowModeMenu(false)
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
  const voiceContextKey = `chat:${activeChatSessionId ?? 'pending'}:${inputText}`
  const voiceErrorMessage = voiceErrorCode
    ? t[`voice_error_${voiceErrorCode.toLowerCase()}` as VoiceErrorTranslationKey]
    : null
  const canOpenSettingsForVoiceError = voiceErrorCode
    ? canResolveVoiceErrorInSettings(voiceErrorCode)
    : false

  // Re-activate on mount so a model selected in another feature cannot leak
  // into this conversation after navigating back to Chat.
  useEffect(() => {
    if (activeChatSessionId) setActiveChatSession(activeChatSessionId)
  }, [activeChatSessionId, setActiveChatSession])

  const handleChatModelChange = useCallback((provider: Provider, model: string) => {
    if (!activeChatSessionId) return
    const state = useAppStore.getState()
    // `fetchModels` may finish after the user switches conversations. Bind
    // this callback to the session/provider from the render that launched it
    // so an old response can never rewrite the newly-active conversation.
    if (
      state.activeChatSessionId !== activeChatSessionId
      || state.selectedProvider !== provider
    ) return
    setChatSessionModel(activeChatSessionId, provider, model)
  }, [activeChatSessionId, setChatSessionModel])

  const recordChatCost = useCallback((sessionId: string, messageId: string, inputText: string, reply: string) => {
    const cost = estimateUsageCost({
      feature: 'chat',
      provider: selectedProvider,
      model: selectedModels[selectedProvider],
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

  // ── Auto-resize textarea ──
  // biome-ignore lint/correctness/useExhaustiveDependencies: inputText is the trigger for resize
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, CHAT_TEXTAREA_MAX_HEIGHT_PX)}px`
  }, [inputText])

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
      setDeepResearchModeLocal(session?.deepResearchMode ?? false)
      setWebSearchModeLocal(session?.webSearchMode ?? false)
      setImageModeLocal(session?.imageMode ?? false)
    } else {
      setInputTextLocal(s.chatPendingDraft)
      setDeepResearchModeLocal(s.chatPendingDeepResearchMode)
      setWebSearchModeLocal(s.chatPendingWebSearchMode)
      setImageModeLocal(s.chatPendingImageMode)
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

  // ── Mode dropdown (Tự động / Tìm kiếm / Nghiên cứu) ──
  const openModeMenu = () => {
    if (modeBtnRef.current) {
      const rect = modeBtnRef.current.getBoundingClientRect()
      setModeMenuPos({ bottom: window.innerHeight - rect.top + 6, left: rect.left })
    }
    setShowModeMenu(true)
  }
  useEffect(() => {
    if (!showModeMenu) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (!modeBtnRef.current?.contains(target) && !modeMenuRef.current?.contains(target)) {
        setShowModeMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showModeMenu])
  // Move focus into the menu on open: the checked item, else the first enabled one.
  useEffect(() => {
    if (!showModeMenu) return
    const menu = modeMenuRef.current
    const target = menu?.querySelector<HTMLButtonElement>(`${MODE_MENU_ITEM_SELECTOR}[aria-checked="true"]:not(:disabled)`)
      ?? menu?.querySelector<HTMLButtonElement>(`${MODE_MENU_ITEM_SELECTOR}:not(:disabled)`)
    target?.focus()
  }, [showModeMenu])

  // ── Ensure active session exists for current provider/model ──
  const ensureSession = useCallback(() => {
    if (activeChatSessionId && chatSessions.find((s) => s.id === activeChatSessionId)) {
      return activeChatSessionId
    }
    return createChatSession(selectedProvider, selectedModels[selectedProvider])
  }, [activeChatSessionId, chatSessions, createChatSession, selectedProvider, selectedModels])

  // ── Image attachment ──
  const handleImageSelect = useCallback(async (file: File) => {
    setAttachImageError(null)
    // Hard upper-bound check before decoding — a 50 MP RAW/HEIC dropped into
    // the composer would otherwise allocate hundreds of megabytes of canvas
    // memory inside resizeImageFile and freeze the renderer.
    if (file.size > MAX_IMAGE_INPUT_BYTES) {
      const maxMb = Math.round(MAX_IMAGE_INPUT_BYTES / (1024 * 1024))
      setAttachImageError(t.image_translate_size_error(maxMb))
      return
    }
    try {
      // DUP-05: use shared resizeImageFile (fixed quality, no compression loop needed for chat)
      const result = await resizeImageFile(file, MAX_CHAT_IMAGE_DIMENSION)
      setAttachedImage(result)
    } catch (err) {
      // Show error in the UI so the user knows the attachment failed
      const msg = err instanceof Error ? err.message : t.image_translate_error_failed
      setAttachImageError(msg)
    }
  }, [t.image_translate_error_failed, t.image_translate_size_error])

  const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDraggingOver(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setAttachImageError(t.image_translate_type_error)
      return
    }
    handleImageSelect(file)
  }, [handleImageSelect, t])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Only clear when leaving the container itself, not a child element
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDraggingOver(false)
    }
  }, [])

  // ── Send message ──
  // ── Regenerate last assistant response ──
  const handleRegenerate = useCallback(async () => {
    if (isSending || !activeChatSessionId) return
    const session = useAppStore.getState().chatSessions.find((s) => s.id === activeChatSessionId)
    if (!session) return

    // Find last assistant message
    const msgs = session.messages
    const lastAssistantIdx = [...msgs].map((m, i) => ({ m, i })).reverse().find(({ m }) => m.role === 'assistant')
    if (!lastAssistantIdx) return
    const assistantMsgId = lastAssistantIdx.m.id

    // History = all messages up to (not including) the last assistant message
    const historyMessages = msgs
      .slice(0, lastAssistantIdx.i)
      .filter((m) => !m.isLoading && !m.error && !m.isResearchStep && !m.isSmartThinkingStep)

    if (historyMessages.length === 0) return

    const controller = new AbortController()
    abortControllerRef.current = controller
    setIsSending(true)

    // Reset assistant message to loading
    updateChatMessage(activeChatSessionId, assistantMsgId, {
      content: [{ type: 'text', text: '' }],
      isLoading: true,
      error: undefined,
      usedModel: undefined,
      timestamp: Date.now(),
    })

    try {
      let streamedText = ''
      const result = await chatService.stream(
        {
          provider: selectedProvider,
          model: selectedModels[selectedProvider],
          messages: historyMessages.map(toIpcMessage),
          systemPrompt: chatSystemPrompt || undefined,
          carefulReasoning: shouldUseCarefulReasoning(latestUserText(historyMessages.map(toIpcMessage))),
        },
        {
          // Buffer tokens so the store update fires at most once per ~60 ms
          // instead of for every provider token. This caps the streaming-time
          // re-render rate while keeping the perceived latency below 100 ms.
          bufferIntervalMs: CHAT_STREAM_BUFFER_INTERVAL_MS,
          onToken: (token) => {
            streamedText += token
            updateChatMessage(activeChatSessionId, assistantMsgId, {
              content: [{ type: 'text', text: streamedText }],
              isLoading: true,
              error: undefined,
            })
          },
          signal: controller.signal,
        },
      )

      // User cancelled mid-stream — keep partial tokens, no error banner.
      if (result.errorCode === 'CANCELLED' || controller.signal.aborted) {

        updateChatMessage(activeChatSessionId, assistantMsgId, {

          content: [{ type: 'text', text: streamedText }],
          isLoading: false,
        })
      } else if (result.success && result.reply) {
        updateChatMessage(activeChatSessionId, assistantMsgId, {
          content: [{ type: 'text', text: result.reply }],
          isLoading: false,
          usedModel: result.usedModel,
        })
        recordChatCost(
          activeChatSessionId,
          assistantMsgId,
          flattenChatCostInput(historyMessages.map(toIpcMessage), chatSystemPrompt || undefined),
          result.reply,
        )
      } else {
        updateChatMessage(activeChatSessionId, assistantMsgId, {
          isLoading: false,
          error: localizeChatError(t, result, t.chat_error_failed_regenerate),
        })
      }
    } catch (err) {
      if (controller.signal.aborted) {
        // Cancellation thrown as exception — finalise without error banner.
        updateChatMessage(activeChatSessionId, assistantMsgId, {
          isLoading: false,
        })
      } else {
        updateChatMessage(activeChatSessionId, assistantMsgId, {
          isLoading: false,
          error: localizeChatException(t, err, t.chat_error_unexpected),
        })
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
      setIsSending(false)
    }
  }, [
    isSending,
    activeChatSessionId,
    updateChatMessage,
    selectedProvider,
    selectedModels,
    chatSystemPrompt,
    recordChatCost,
    t,
  ])

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
  }: {
    sessionId: string
    question: string
    history?: string
    images: { imageBase64: string; imageMimeType: string }[]
    resumeState?: DeepResearchResumeState
  }) => {
    const drController = new AbortController()
    abortControllerRef.current = drController
    setIsSending(true)

    try {
      await deepResearchService.run({
        signal: drController.signal,
        provider: selectedProvider,
        model: selectedModels[selectedProvider],
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
              recordChatCost(sessionId, msgId, question, content)
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
          onResumeStateChange: (state) => {
            setDeepResearchResumeState(sessionId, state)
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
    })
  }, [isSending, activeChatSessionId, runDeepResearchPipeline])

  const handleSend = useCallback(async () => {

    const text = inputText.trim()
    if ((!text && !attachedImage) || isSending || isVoiceBusy) return
    if (!hasKey) return


    const sessionId = ensureSession()

    // ── Build the user message (shared by normal, vision, and Deep Research paths)
    const userContent: ChatMessageContent[] = []
    if (attachedImage) {
      userContent.push({
        type: 'image',
        imageBase64: attachedImage.base64,
        imageMimeType: attachedImage.mimeType,
        imagePreviewUrl: attachedImage.previewUrl,
        imageFileName: attachedImage.fileName,
      })
    }
    if (text) {
      userContent.push({ type: 'text', text })
    }

    const userMsg: ChatMessage = {
      id: createClientId('msg-u'),
      role: 'user',
      content: userContent,
      timestamp: Date.now(),
    }

    // ── Deep Research path ────────────────────────────────────────────────────
    if (deepResearchMode && (text || attachedImage)) {
      // Snapshot the earlier turns before the new question joins the session.
      const history = buildConversationTranscript(
        useAppStore.getState().chatSessions.find((s) => s.id === sessionId)?.messages ?? [],
      )
      addChatMessage(sessionId, userMsg)
      setDeepResearchResumeState(sessionId, null)
      setInputText('')
      setAttachedImage(null)
      await runDeepResearchPipeline({
        sessionId,
        question: text || t.chat_deep_research_image_only_prompt,
        history,
        images: attachedImage
          ? [{ imageBase64: attachedImage.base64, imageMimeType: attachedImage.mimeType }]
          : [],
      })
      return
    }

    // ── Image Mode path (generate or edit) ───────────────────────────────────
    // Only available when the user explicitly enables Image Mode.
    // - With attached image + text prompt → edit the image.
    // - Without attached image → generate a new image from the text prompt.
    if (imageMode && (text || attachedImage)) {
      // Earlier turns, captured before this message joins the session: they
      // give the planner its context and the image a follow-up may refine.
      const priorMessages = useAppStore.getState().chatSessions.find((s) => s.id === sessionId)?.messages ?? []
      addChatMessage(sessionId, userMsg)
      setInputText('')
      const capturedImage = attachedImage
      setAttachedImage(null)
      const imgController = new AbortController()
      abortControllerRef.current = imgController
      setIsSending(true)

      const assistantMsgId = createClientId('msg-a')
      addChatMessage(sessionId, {
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
        const plan = await planImageRequest({
          provider: selectedProvider,
          model: selectedModels[selectedProvider],
          text,
          history: buildConversationTranscript(priorMessages),
          hasPreviousImage: Boolean(previousImage),
          hasAttachedImage: Boolean(capturedImage),
          signal: imgController.signal,
        })
        if (imgController.signal.aborted) {
          updateChatMessage(sessionId, assistantMsgId, { isLoading: false })
          return
        }

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
            provider: selectedProvider,
            model: selectedModels[selectedProvider],
            prompt: plan.prompt,
            imageBase64: sourceImage.base64,
            imageMimeType: sourceImage.mimeType,
          })
        } else {
          if (typeof window.api.generateChatImage !== 'function') {
            updateChatMessage(sessionId, assistantMsgId, {
              isLoading: false,
              error: t.chat_error_image_generate_reload_required,
            })
            return
          }
          result = await chatService.generateImage({
            provider: selectedProvider,
            model: selectedModels[selectedProvider],
            prompt: plan.prompt,
          })
        }

        if (imgController.signal.aborted) {
          updateChatMessage(sessionId, assistantMsgId, { isLoading: false })
        } else if (result.success && result.imageBase64 && result.imageMimeType) {
          // Show the prompt that was actually used so the user can see it and refine it.
          const doneLabel = isEdit ? t.chat_image_edit_done : t.chat_image_generate_done
          const outputLabel = plan.rewritten ? `${doneLabel}\n\n> ${plan.prompt}` : doneLabel
          updateChatMessage(sessionId, assistantMsgId, {
            content: [
              {
                type: 'image',
                imageBase64: result.imageBase64,
                imageMimeType: result.imageMimeType,
                imagePreviewUrl: buildImageDataUrl(result.imageBase64, result.imageMimeType),
                imageFileName: `${isEdit ? 'edited' : 'generated'}-image-${Date.now()}.${imageExtensionFromMime(result.imageMimeType)}`,
              },
              { type: 'text', text: outputLabel },
            ],
            isLoading: false,
          })
          recordChatCost(sessionId, assistantMsgId, text, outputLabel)
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

    addChatMessage(sessionId, userMsg)
    setDeepResearchResumeState(sessionId, null)
    setInputText('')
    setAttachedImage(null)
    const sendController = new AbortController()
    abortControllerRef.current = sendController
    setIsSending(true)

    // Build IPC-format conversation history (includes the user message just added).
    const ipcHistory = toIpcHistory(
      useAppStore.getState().chatSessions.find((s) => s.id === sessionId)?.messages ?? []
    )

    // ── Smart Thinking path (DEFAULT for text-only chat) ─────────────────────
    // AI itself classifies the question and decides whether to web-search.
    // Skipped only when:
    //   • The user attached an image without Web Search mode (vision flow uses
    //     straight chatService.stream). With Web Search on, the image stays in
    //     the history for the final answer and the search still runs.
    //   • There is no text (image-only message)
    if (text && (!attachedImage || webSearchMode)) {
      // Single morphing placeholder bubble shared across all Smart Thinking phases:
      //   1. Initial "Thinking…" — while AI classifier decides whether to web-search.
      //   2. "Smart Thinking…" pill — shown only if the classifier triggered a web search.
      //   3. Back to "Thinking…" — between search completion and the start of token streaming.
      //   4. Streaming tokens — final answer fills the same bubble.
      // Reusing one bubble (instead of swapping between a step bubble and an answer bubble)
      // matches modern chat UIs and keeps the conversation flow visually stable.
      const placeholderMsgId = createClientId('msg-a')
      addChatMessage(sessionId, {
        id: placeholderMsgId,
        role: 'assistant',
        content: [{ type: 'text', text: '' }],
        timestamp: Date.now(),
        isLoading: true,
      })

      try {
        await smartThinkingService.run({
          signal: sendController.signal,
          provider: selectedProvider,
          model: selectedModels[selectedProvider],
          question: text,
          messages: ipcHistory,
          systemPrompt: chatSystemPrompt || undefined,
          carefulReasoning: shouldUseCarefulReasoning(text),
          forceWebSearch: webSearchMode,
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
              recordChatCost(
                sessionId,
                placeholderMsgId,
                flattenChatCostInput(ipcHistory, chatSystemPrompt || undefined),
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
    const shouldEditImage = Boolean(attachedImage && text && shouldRouteToImageEdit(text, true))

    if (attachedImage && shouldEditImage) {
      const assistantMsgId = createClientId('msg-a')
      addChatMessage(sessionId, {
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
          provider: selectedProvider,
          model: selectedModels[selectedProvider],
          prompt: text,
          imageBase64: attachedImage.base64,
          imageMimeType: attachedImage.mimeType,
        })

        // The edit IPC does not yet accept an AbortSignal — if the user clicked
        // Stop while the backend was running, finalise the bubble silently and
        // discard the result instead of overwriting with edited content.
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
              },
              { type: 'text', text: outputLabel },
            ],
            isLoading: false,
          })
          recordChatCost(sessionId, assistantMsgId, text, outputLabel)
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
    const assistantMsgId = createClientId('msg-a')
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
          provider: selectedProvider,
          model: selectedModels[selectedProvider],
          messages: ipcHistory,
          systemPrompt: chatSystemPrompt || undefined,
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
        recordChatCost(
          sessionId,
          assistantMsgId,
          flattenChatCostInput(ipcHistory, chatSystemPrompt || undefined),
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
    attachedImage,
    isSending,
    isVoiceBusy,
    hasKey,
    deepResearchMode,
    webSearchMode,
    imageMode,
    ensureSession,
    addChatMessage,
    updateChatMessage,
    selectedProvider,
    selectedModels,
    chatSystemPrompt,
    recordChatCost,
    runDeepResearchPipeline,
    setDeepResearchResumeState,
    setInputText,
    t,
  ])


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
  const canResumeDeepResearch = Boolean(
    !isSending
    && !inputText.trim()
    && !attachedImage
    && activeSession?.deepResearchResumeState
    && activeSession.deepResearchResumeState.lastCompletedPhase !== 'synth',
  )

  const activeModeLabel = deepResearchMode
    ? t.chat_mode_chip_research
    : webSearchMode
      ? t.chat_mode_chip_web
      : imageMode
        ? t.chat_mode_chip_image
        : t.chat_mode_standard

  const activeMode: ResponseMode = deepResearchMode
    ? 'research'
    : webSearchMode
      ? 'web'
      : imageMode
        ? 'image'
        : 'standard'
  const imageModeSupported = supportsChatImageMode(selectedProvider)
  const modeOptions: ModeOption[] = [
    { mode: 'standard', label: t.chat_mode_standard },
    { mode: 'web', label: t.chat_menu_web_search, Icon: GlobeIcon },
    { mode: 'research', label: t.chat_menu_deep_research, Icon: TelescopeIcon },
    {
      mode: 'image',
      label: t.chat_mode_chip_image,
      Icon: ImageSparkleIcon,
      title: t.chat_menu_image_mode,
      disabled: !imageModeSupported && activeMode !== 'image',
      hint: imageModeSupported ? undefined : t.chat_image_mode_unsupported_provider,
    },
  ]
  const composerPlaceholder = imageMode
    ? (imageModeSupported ? t.chat_image_mode_hint : t.chat_image_mode_unsupported_provider)
    : t.chat_placeholder

  const selectResponseMode = (mode: ResponseMode) => {
    setWebSearchMode(mode === 'web')
    setDeepResearchMode(mode === 'research')
    setImageMode(mode === 'image')
    setShowModeMenu(false)
    textareaRef.current?.focus()
  }

  /** Roving focus for the mode menu: arrows/Home/End move, Escape returns to the trigger. */
  const handleModeMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setShowModeMenu(false)
      modeBtnRef.current?.focus()
      return
    }
    if (e.key === 'Tab') {
      setShowModeMenu(false)
      return
    }
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>(`${MODE_MENU_ITEM_SELECTOR}:not(:disabled)`))
    if (items.length === 0) return
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    let next: number
    switch (e.key) {
      case 'ArrowDown': next = (current + 1) % items.length; break
      case 'ArrowUp': next = current <= 0 ? items.length - 1 : current - 1; break
      case 'Home': next = 0; break
      case 'End': next = items.length - 1; break
      default: return
    }
    e.preventDefault()
    items[next]?.focus()
  }

  /** Shared input area — reused in both empty-state and messages-state layouts */
  const inputArea = (
    <div className="flex flex-col">
      {/* Error row */}
      {attachImageError && (
        <div className="px-4 pt-2 flex items-center gap-2">
          <p className="ui-error-text text-xs">{attachImageError}</p>
          <button type="button" onClick={() => setAttachImageError(null)} className="btn-icon btn-icon-xs btn-icon-danger" aria-label={t.translate_error_dismiss}>
            <XIcon className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Image preview */}
      {attachedImage && (
        <ImagePreviewThumbnail
          src={attachedImage.previewUrl}
          alt={attachedImage.fileName}
          removeTitle={t.chat_remove_image}
          onRemove={() => setAttachedImage(null)}
        />
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
          style={{ maxHeight: `${CHAT_TEXTAREA_MAX_HEIGHT_PX}px`, overflowY: 'auto', padding: '3px 0', ...(isVoiceInterim ? { color: 'var(--vzn-text-soft)' } : null) }}
        />
      </div>

      {/* Bottom controls bar: [+ | Ảnh | Tự động ▼]  ···  [model | voice | send] */}
      <div className="flex items-center justify-between px-2 pb-1.5">

        {/* Left: attach + mode toggles */}
        <div className="flex items-center gap-0.5">

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
            className={`chat-action-button flex-shrink-0 ${showPlusMenu ? 'chat-action-button-active-neutral' : ''}`}
          >
            <PlusIcon />
          </Button>

          {/* Tiêu chuẩn ▼ — response mode dropdown (standard / web / research / image) */}
          <Button
            ref={modeBtnRef}
            size="md"
            shape="pill"
            variant={(webSearchMode || deepResearchMode || imageMode || showModeMenu) ? 'primary' : 'neutral'}
            appearance={(webSearchMode || deepResearchMode || imageMode || showModeMenu) ? 'soft' : 'ghost'}
            className={`chat-mode-pill ${(webSearchMode || deepResearchMode || imageMode) ? 'chat-mode-pill-active' : ''}`}
            aria-haspopup="menu"
            aria-label={`${t.chat_response_mode}: ${activeModeLabel}`}
            aria-expanded={showModeMenu}
            aria-controls={showModeMenu ? MODE_MENU_ID : undefined}
            disabled={isVoiceBusy}
            onClick={showModeMenu ? () => setShowModeMenu(false) : openModeMenu}
          >
            {deepResearchMode
              ? <TelescopeIcon className="h-3.5 w-3.5 flex-shrink-0" />
              : webSearchMode
                ? <GlobeIcon className="h-3.5 w-3.5 flex-shrink-0" />
                : imageMode
                  ? <ImageSparkleIcon className="h-3.5 w-3.5 flex-shrink-0" />
                  : null}
            <span>{activeModeLabel}</span>
            <ChevronDownIcon className={`w-3 h-3 flex-shrink-0 transition-transform duration-150 ${showModeMenu ? 'rotate-180' : ''}`} />
          </Button>
        </div>

        {/* Right: char count · model · voice · send */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {inputText.length > 600 && (
            <span className="ui-micro tabular-nums">{inputText.length}</span>
          )}
          {!isVoiceBusy && (
            <>
              <ChatAIConfiguration
                conversationId={activeChatSessionId}
                onSelectionChange={handleChatModelChange}
              />
              <span className="w-px h-3.5 flex-shrink-0" style={{ background: 'var(--vzn-border-strong)' }} />
            </>
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
            <Button size="md" shape="icon" variant="danger" appearance="soft" onClick={handleStop} title={t.chat_stop} aria-label={t.chat_stop} className="chat-stop-button">
              <StopSquareIcon className="w-5 h-5" />
            </Button>
          ) : canResumeDeepResearch ? (
            <Button size="md" shape="pill" variant="primary" appearance="solid" onClick={handleResumeDeepResearch} title={t.chat_deep_research_resume} aria-label={t.chat_deep_research_resume} className="chat-resume-button">
              <span className="chat-primary-action-label">{t.chat_deep_research_resume_short}</span>
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button size="md" shape="icon" variant="primary" appearance="solid" onClick={handleSend} disabled={(!inputText.trim() && !attachedImage) || !hasKey} title={t.chat_send} aria-label={t.chat_send} className="chat-send-button">
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
      {showModeMenu && createPortal(
        <div
          id={MODE_MENU_ID}
          ref={modeMenuRef}
          role="menu"
          aria-label={t.chat_response_mode}
          onKeyDown={handleModeMenuKeyDown}
          className="floating-panel overflow-hidden"
          style={{ position: 'fixed', bottom: modeMenuPos.bottom, left: modeMenuPos.left, width: 220, zIndex: 9999 }}
        >
          {modeOptions.map(({ mode, label, Icon, hint, title, disabled }) => {
            const checked = mode === activeMode
            return (
              <button
                key={mode}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                disabled={disabled}
                title={title}
                className={`btn-menu-item justify-start gap-3${hint ? ' btn-menu-item-with-hint' : ''}`}
                onClick={() => selectResponseMode(mode)}
              >
                {Icon ? (
                  <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${checked ? 'text-[--vzn-accent]' : 'text-[--vzn-text-muted]'}`} />
                ) : (
                  <span className="w-[18px] h-[18px] flex-shrink-0 flex items-center justify-center">
                    {checked && <CheckIcon className="w-4 h-4 text-[--vzn-accent]" />}
                  </span>
                )}
                <span className="flex min-w-0 flex-1 flex-col text-left">
                  <span>{label}</span>
                  {hint && <span className="ui-micro">{hint}</span>}
                </span>
                {Icon && checked && <CheckIcon className="w-4 h-4 flex-shrink-0 text-[--vzn-accent]" />}
              </button>
            )
          })}
        </div>,
        document.body
      )}
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

      {(voiceErrorMessage || searchFallbackNotice) && (
        <div className="notification-viewport">
          {searchFallbackNotice && (
            <NotificationToast
              tone="warning"
              title={t.chat_web_search_fallback_title}
              message={t.chat_web_search_fallback(
                searchFallbackNotice.from === 'tavily' ? 'Tavily' : 'Brave Search',
                searchFallbackNotice.reason,
              )}
              actionLabel={t.translate_error_open_settings}
              onAction={() => {
                setSearchFallbackNotice(null)
                openSettings()
              }}
              dismissLabel={t.translate_error_dismiss}
              onDismiss={() => setSearchFallbackNotice(null)}
              className="fade-in"
            />
          )}
          {voiceErrorMessage && (
            <NotificationToast
              tone={voiceErrorCode ? getVoiceNotificationTone(voiceErrorCode) : 'error'}
              title={t.voice_transcription_error_title}
              message={voiceErrorMessage}
              actionLabel={canOpenSettingsForVoiceError ? t.translate_error_open_settings : undefined}
              onAction={canOpenSettingsForVoiceError
                ? () => {
                    setVoiceErrorCode(null)
                    openSettings()
                  }
                : undefined}
              dismissLabel={t.translate_error_dismiss}
              onDismiss={() => setVoiceErrorCode(null)}
              className="fade-in"
            />
          )}
        </div>
      )}

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="app-workspace">

          {messages.length === 0 ? (
            <div className="chat-empty-state">
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
                    <button type="button" onClick={() => openSettings()} className="btn-primary btn-sm">
                      {t.chat_error_open_settings}
                    </button>
                  </div>
                )}

                {hasKey && (
                  <div className="chat-suggestion-grid">
                    {([
                      { tone: 'blue', icon: <TranslateIcon className="h-4 w-4" />, title: t.chat_suggest_translate, desc: t.chat_suggest_translate_desc, prompt: t.chat_suggest_translate_prompt },
                      { tone: 'violet', icon: <TelescopeIcon className="h-4 w-4" />, title: t.chat_suggest_research, desc: t.chat_suggest_research_desc, prompt: t.chat_suggest_research_prompt },
                      { tone: 'green', icon: <LightbulbIcon className="h-4 w-4" />, title: t.chat_suggest_explain, desc: t.chat_suggest_explain_desc, prompt: t.chat_suggest_explain_prompt },
                      { tone: 'orange', icon: <PencilIcon className="h-4 w-4" />, title: t.chat_suggest_write, desc: t.chat_suggest_write_desc, prompt: t.chat_suggest_write_prompt },
                    ] as const).map((item) => (
                      <PromptCard
                        key={item.title}
                        tone={item.tone}
                        icon={item.icon}
                        title={item.title}
                        description={item.desc}
                        onClick={() => {
                          setInputText(item.prompt)
                          setTimeout(() => textareaRef.current?.focus(), 0)
                        }}
                      />
                    ))}
                  </div>
                )}
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
                        rendered.push(
                          <ResearchStepsPanel
                            key={`rsp-${group[0].id}`}
                            steps={group}
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

      {/* ── Copied toast ── */}
      {copiedId && (
        <div className="pointer-events-none fixed bottom-20 left-1/2 -translate-x-1/2
                        bg-gray-800 text-white text-xs px-3 py-1.5 rounded-full shadow-lg fade-in z-50">
          {t.chat_copied}
        </div>
      )}
    </div>
  )
}
