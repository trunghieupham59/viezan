import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useT } from '../../store/useAppStore'
import type { ChatMessage, ResearchStepPhase } from '../../types'
import { tpl } from '../../utils/tpl'
import { MarkdownText } from '../MarkdownText'
import { Button } from '../ui/atoms'
import {
  CheckCircleIcon,
  ChevronRightIcon,
  InfoCircleIcon,
  LightbulbIcon,
  SparklesIcon,
  SpinnerIcon,
} from '../ui/icons'
import { type ProgressStepStatus, ProgressSteps } from '../ui/molecules'

/**
 * ResearchStepsPanel — Cursor / ChatGPT-style "tool-call" panel for the
 * Deep Research pipeline.
 *
 * The panel solves two UX problems with the previous design:
 *
 *   1. **Wall-of-cards.** A single Deep Research run can fire 6–14 step
 *      messages (1 analyze + N survey + 1–2 gap + N deep-dive + 1 cross +
 *      1 synth). Rendering each one as a full bubble buried the actual
 *      answer and made the chat feel chaotic.
 *   2. **Title bloat.** Step titles like
 *      `Vòng 1 — Nghiên cứu: Quy định giảm trừ gia cảnh áp dụng cho năm 2026`
 *      either truncated mid-aspect or wrapped onto two lines.
 *
 * The replacement is a single collapsible card with **pills grouped by
 * phase**:
 *
 *   • Steps belonging to the same phase (e.g. four `survey` steps for four
 *     research aspects) collapse into one row that reads
 *     `Khảo sát · 4 khía cạnh ⓘ ✓` — a Cursor-style "tool-call" entry.
 *   • Phase row label is short (just the phase name); per-aspect detail is
 *     surfaced in a hover-info popover triggered by the ⓘ icon. The
 *     popover renders the markdown content of every step in that phase
 *     plus the aspect title (when present).
 *   • A single status indicator on the right shows ✓ when every step in
 *     the group succeeded, a red dot when at least one failed, or a spinner
 *     while any step is still loading.
 *
 * The panel header still shows `Đang suy nghĩ` while running and
 * `Đã suy nghĩ · N bước` when finished, matching the previous chat-history
 * format. Toggling the header collapses every pill at once.
 */

interface ResearchStepsPanelProps {
  steps: ChatMessage[]
  /** The run stopped part-way and can continue from the last finished step. */
  onResume?: () => void
  /** The run ended on a failed step and can be re-run. */
  onRetry?: () => void
}

/** The pipeline in order, with the label of each phase. */
const PIPELINE: readonly { phase: ResearchStepPhase; labelKey: 'chat_deep_research_step_analyze' | 'chat_deep_research_step_round1' | 'chat_deep_research_step_gap' | 'chat_deep_research_step_deep' | 'chat_deep_research_step_cross' | 'chat_deep_research_step_synth' }[] = [
  { phase: 'analyze', labelKey: 'chat_deep_research_step_analyze' },
  { phase: 'survey', labelKey: 'chat_deep_research_step_round1' },
  { phase: 'gap', labelKey: 'chat_deep_research_step_gap' },
  { phase: 'deep', labelKey: 'chat_deep_research_step_deep' },
  { phase: 'cross', labelKey: 'chat_deep_research_step_cross' },
  { phase: 'synth', labelKey: 'chat_deep_research_step_synth' },
]


/**
 * One visual row in the panel — represents either a single step (rare) or
 * a contiguous run of steps that share the same phase.
 */
interface PhaseGroup {
  /** Phase identifier (also used to pick the icon and title). */
  phase: ResearchStepPhase | 'unknown'
  /** Title rendered on the row — short, no aspect text. */
  title: string
  /** Steps included in this group (1+). */
  steps: ChatMessage[]
}

/**
 * Strip Markdown noise so intermediate research traces render as compact
 * prose inside the popover. The popover already constrains height + width,
 * but un-trimmed markdown headings still dominate the layout.
 */
function compactMarkdown(raw: string): string {
  return raw
    .split('\n')
    .map((line) => {
      let s = line.trim()
      // Demote headings (## Foo) to plain text — popover is already a heading.
      s = s.replace(/^#{1,6}\s+/, '')
      return s
    })
    .filter((line, index, arr) => {
      if (line === '' && arr[index - 1] === '') return false
      return true
    })
    .join('\n')
    .trim()
}

/**
 * Title for a phase row. Steps that already share an i18n phase label use
 * that label verbatim (e.g. `Phân tích`, `Đối chiếu`); single-aspect phases
 * (analyze / cross / synth) keep that label, while multi-aspect phases
 * (survey / deep) append a count suffix `· {n} khía cạnh`.
 */
function buildPhaseTitle(group: PhaseGroup, aspectsSuffix: string): string {
  const baseLabel = group.title
  const isCountable = group.phase === 'survey' || group.phase === 'deep'
  if (!isCountable || group.steps.length <= 1) return baseLabel
  return `${baseLabel} · ${tpl(aspectsSuffix, { count: group.steps.length })}`
}

/**
 * Group consecutive steps that share the same `researchStepPhase` into one
 * row. Steps without a phase (back-compat) become a single-step "unknown"
 * group so the panel still renders something sane.
 */
function buildPhaseGroups(steps: ChatMessage[]): PhaseGroup[] {
  const groups: PhaseGroup[] = []
  for (const step of steps) {
    const phase = (step.researchStepPhase ?? 'unknown') as ResearchStepPhase | 'unknown'
    const last = groups[groups.length - 1]
    if (last && last.phase === phase && phase !== 'unknown') {
      last.steps.push(step)
      continue
    }
    groups.push({
      phase,
      title: step.researchStepLabel ?? '…',
      steps: [step],
    })
  }
  return groups
}

/**
 * Aggregate status across every step in a phase row. Used to pick which
 * indicator (spinner / check / dot) is shown on the right of the pill.
 */
type PhaseStatus = 'loading' | 'error' | 'done'
function getGroupStatus(group: PhaseGroup): PhaseStatus {
  if (group.steps.some((s) => s.isLoading)) return 'loading'
  if (group.steps.some((s) => s.error)) return 'error'
  return 'done'
}

const PHASE_ICON_CLASS = 'h-3.5 w-3.5'
function PhaseIcon({ phase }: { phase: ResearchStepPhase | 'unknown' }) {
  // We deliberately reuse the existing icon set instead of inventing new
  // ones; mapping is purely visual and color-coded so the user can scan
  // phases at a glance.
  switch (phase) {
    case 'analyze':
      return <SparklesIcon className={`${PHASE_ICON_CLASS} chat-research-icon`} />
    case 'survey':
      return <LightbulbIcon className={`${PHASE_ICON_CLASS} chat-research-icon`} />
    case 'gap':
      return <InfoCircleIcon className={`${PHASE_ICON_CLASS} chat-research-icon`} />
    case 'deep':
      return <LightbulbIcon className={`${PHASE_ICON_CLASS} chat-research-icon`} />
    case 'cross':
      return <CheckCircleIcon className={`${PHASE_ICON_CLASS} chat-research-icon`} />
    case 'synth':
      return <SparklesIcon className={`${PHASE_ICON_CLASS} chat-research-icon`} />
    default:
      return <SparklesIcon className={`${PHASE_ICON_CLASS} chat-research-icon-quiet`} />
  }
}

function StatusIndicator({ status }: { status: PhaseStatus }) {
  if (status === 'loading') {
    return <SpinnerIcon className="w-3 h-3 animate-spin chat-research-icon-quiet" />
  }
  if (status === 'error') {
    return (
      <span
        className="ui-status-dot ui-status-dot-danger inline-block h-2 w-2"
        aria-hidden
      />
    )
  }
  return <CheckCircleIcon className="w-3.5 h-3.5 chat-research-icon" />
}

// ── Hover info popover ────────────────────────────────────────────────────────

/**
 * Popover that shows the per-step content for a phase row. Rendered into a
 * portal so it can escape the panel's `overflow:hidden` and the chat
 * scroll container — otherwise a popover anchored to the bottom row would
 * be clipped.
 *
 * Position is recomputed on open via `getBoundingClientRect()` and clamped
 * inside the viewport so the popover never spills off-screen.
 */
interface InfoPopoverProps {
  anchor: HTMLElement
  group: PhaseGroup
  onClose: () => void
  /**
   * Called when the cursor enters the popover surface. Used by the parent
   * `PhasePill` to keep the hover-mode popover open while the user is
   * actively reading / scrolling inside it (otherwise leaving the trigger
   * button would close the popover before the cursor reaches it).
   */
  onMouseEnter?: () => void
  /** Called when the cursor leaves the popover surface entirely. */
  onMouseLeave?: () => void
}

function InfoPopover({ anchor, group, onClose, onMouseEnter, onMouseLeave }: InfoPopoverProps) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)


  // Compute position on mount + window resize. We position the popover to
  // the LEFT of the info button so it doesn't clip the right viewport edge
  // (most chat layouts have the panel anchored near the right side).
  useLayoutEffect(() => {
    const compute = () => {
      const anchorRect = anchor.getBoundingClientRect()
      const popoverWidth = 380
      const popoverMaxHeight = Math.min(window.innerHeight * 0.6, 480)

      // Default: open to the LEFT of the anchor, vertically centred-ish on it.
      const gap = 8
      let left = anchorRect.left - popoverWidth - gap
      // If not enough room on the left, flip to the right.
      if (left < 8) left = anchorRect.right + gap
      // Clamp horizontally inside the viewport.
      left = Math.max(8, Math.min(left, window.innerWidth - popoverWidth - 8))

      // Vertical: align top of popover slightly above the anchor; clamp inside
      // viewport so a row near the bottom edge still gets a fully-visible
      // popover that scrolls internally if its content overflows.
      let top = anchorRect.top - 4
      const maxTop = window.innerHeight - popoverMaxHeight - 8
      if (top > maxTop) top = maxTop
      top = Math.max(8, top)

      setPosition({ top, left })
    }

    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [anchor])

  // Close on outside click / Esc — guards against the popover sticking when
  // the user clicks elsewhere or presses Escape.
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (popoverRef.current?.contains(target)) return
      if (anchor.contains(target)) return
      onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [anchor, onClose])

  if (!position) return null

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      className="chat-research-info-popover"
      style={{ top: position.top, left: position.left }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >

      <div className="chat-research-info-popover-header">
        <PhaseIcon phase={group.phase} />
        <span className="chat-research-text-strong truncate text-xs font-semibold">
          {group.title}
        </span>
      </div>
      <div className="chat-research-info-popover-body">
        {group.steps.map((step, idx) => {
          const text = step.content.find((c) => c.type === 'text')?.text ?? ''
          const compact = compactMarkdown(text)
          const aspect = step.researchStepAspect
          return (
            <div key={step.id} className="chat-research-info-popover-item">
              {(aspect || group.steps.length > 1) && (
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="ui-micro font-medium tabular-nums">
                    {idx + 1}.
                  </span>
                  <span className="chat-research-text line-clamp-2 text-xs font-semibold">
                    {aspect ?? group.title}
                  </span>
                </div>
              )}
              {step.error ? (
                <div className="ui-error-text text-xs">
                  {step.error}
                </div>
              ) : compact ? (
                <MarkdownText
                  text={compact}
                  // `compact` mode shrinks MarkdownText's baseline font from
                  // 15px to 12px so the popover body sits visually below the
                  // surrounding chat message size, matching the "tooltip /
                  // diagnostic preview" intent of the research-step trace.
                  compact
                  className="chat-research-text-muted leading-relaxed"
                />

              ) : step.isLoading ? (
                <div className="chat-research-icon-quiet text-xs italic">
                  …
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}

// ── Per-row pill ──────────────────────────────────────────────────────────────

interface PhasePillProps {
  group: PhaseGroup
  rowTitle: string
  showDetailsLabel: string
}

/**
 * Delay before auto-closing a hover-opened popover. Gives the cursor time
 * to travel from the trigger button across the visible gap and into the
 * popover surface. Without this delay, fast cursor movement triggers
 * `onMouseLeave` before the popover gets a chance to fire `onMouseEnter`.
 */
const POPOVER_HOVER_CLOSE_DELAY_MS = 150

function PhasePill({ group, rowTitle, showDetailsLabel }: PhasePillProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  /**
   * Open state for the per-pill info popover. We track two open modes:
   *
   *   • 'hover'  — opened via onMouseEnter. Closes when the cursor leaves
   *                BOTH the trigger and the popover surface (so the user
   *                can move into the popover and scroll long content).
   *   • 'pinned' — opened via click. Stays open until the user clicks the
   *                trigger again, presses Escape, or clicks outside (handled
   *                inside InfoPopover via outside-click + Esc listeners).
   *
   * Tracking the mode separately means hover-leave doesn't close a pinned
   * popover, and a click while hovering pins instead of toggling-closed.
   */
  const [popoverMode, setPopoverMode] = useState<'closed' | 'hover' | 'pinned'>('closed')
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const status = getGroupStatus(group)

  // Always render the info button; while loading, the popover still shows
  // the phase title and a "…" hint, which is more informative than hiding it.
  const hasContent = group.steps.length > 0
  const isOpen = popoverMode !== 'closed'

  /** Cancel any pending hover-close so the popover stays open. */
  const cancelHoverClose = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  /** Schedule a hover-close — only takes effect if mode is still 'hover'. */
  const scheduleHoverClose = () => {
    cancelHoverClose()
    closeTimerRef.current = setTimeout(() => {
      setPopoverMode((m) => (m === 'hover' ? 'closed' : m))
      closeTimerRef.current = null
    }, POPOVER_HOVER_CLOSE_DELAY_MS)
  }

  // Cancel any pending hover-close timer on unmount so we don't try to
  // setState on a torn-down component. Inlined (instead of calling the
  // memo'd cancelHoverClose) so the hook has zero dependencies.
  useEffect(() => () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])



  return (
    <li className="chat-research-pill-row">
      <span className="chat-research-pill-icon" aria-hidden>
        <PhaseIcon phase={group.phase} />
      </span>
      <span className="chat-research-pill-title" title={rowTitle}>
        {rowTitle}
      </span>
      <span className="chat-research-pill-actions">
        {hasContent && (
          <button
            ref={buttonRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              // Click toggles between pinned and closed; lets the user
              // commit to keeping the popover open even after moving the
              // cursor away, and lets a second click close it.
              cancelHoverClose()
              setPopoverMode((m) => (m === 'pinned' ? 'closed' : 'pinned'))
            }}
            onMouseEnter={() => {
              cancelHoverClose()
              setPopoverMode((m) => (m === 'closed' ? 'hover' : m))
            }}
            onMouseLeave={() => {
              // Defer the close so the cursor has time to enter the popover
              // surface (which then cancels this timer in its own onMouseEnter).
              if (popoverMode === 'hover') scheduleHoverClose()
            }}
            className={`chat-research-pill-info ${isOpen ? 'chat-research-pill-info-active' : ''}`}
            aria-label={showDetailsLabel}
          >
            <InfoCircleIcon className="w-3.5 h-3.5" />
          </button>
        )}
        <span className="chat-research-pill-status" aria-hidden>
          <StatusIndicator status={status} />
        </span>
      </span>

      {isOpen && buttonRef.current && (
        <InfoPopover
          anchor={buttonRef.current}
          group={group}
          onClose={() => {
            cancelHoverClose()
            setPopoverMode('closed')
          }}
          // Mirror the trigger-button behaviour on the popover surface so
          // the popover stays open while the user reads / scrolls inside it.
          onMouseEnter={cancelHoverClose}
          onMouseLeave={() => {
            if (popoverMode === 'hover') scheduleHoverClose()
          }}
        />
      )}
    </li>
  )
}



// ── Main panel ────────────────────────────────────────────────────────────────

export function ResearchStepsPanel({ steps, onResume, onRetry }: ResearchStepsPanelProps) {
  const t = useT()
  const [isOpen, setIsOpen] = useState(true)
  const detailsId = useId()

  const groups = useMemo(() => buildPhaseGroups(steps), [steps])

  const isAnyLoading = steps.some((s) => s.isLoading)
  const totalCount = steps.length
  const waitingOnUser = Boolean(onResume || onRetry)

  // One row per pipeline phase: finished, running, failed or still to come.
  // Older traces without phases fall back to the detail list alone.
  const progress = useMemo(() => {
    if (groups.some((group) => group.phase === 'unknown')) return null
    const all = PIPELINE.map(({ phase, labelKey }) => {
      const group = groups.find((item) => item.phase === phase)
      const status: ProgressStepStatus = !group ? 'pending'
        : getGroupStatus(group) === 'loading' ? 'active'
          : getGroupStatus(group) === 'error' ? 'error' : 'done'
      const countable = (phase === 'survey' || phase === 'deep') && group && group.steps.length > 1
      return { id: phase, label: t[labelKey], status, detail: countable ? tpl(t.chat_research_aspects_suffix, { count: group.steps.length }) : undefined }
    })
    // A phase the run skipped (no gaps to dig into) is not "still to come".
    const reached = all.reduce((last, step, index) => (step.status === 'pending' ? last : index), -1)
    return all.filter((step, index) => step.status !== 'pending' || index > reached)
  }, [groups, t])
  // The step the run is on, or the one it will continue with.
  const currentIndex = progress
    ? (() => {
      const live = progress.findIndex((step) => step.status === 'active' || step.status === 'error')
      if (live >= 0) return live
      const next = progress.findIndex((step) => step.status === 'pending')
      return next >= 0 ? next : progress.length - 1
    })()
    : 0
  const currentStep = currentIndex + 1

  // Header label: live step while running, summary once done.
  const headerLabel = isAnyLoading || waitingOnUser
    ? progress ? `${t.chat_research_title} · ${tpl(t.chat_research_step_of, { current: currentStep, total: progress.length })}` : t.chat_thinking_label
    : `${t.chat_research_done_label} · ${totalCount} ${t.chat_research_steps_unit}`

  // Auto-collapse when finished so the user's eye flows past the trace
  // straight to the final answer below.
  useEffect(() => {
    if (!isAnyLoading) setIsOpen(false)
  }, [isAnyLoading])

  const showProgress = Boolean(progress) && (isAnyLoading || waitingOnUser)

  return (
    <div className="flex gap-2 items-start">
      <section className="chat-research-panel flex-1" aria-label={t.chat_research_title} data-waiting={waitingOnUser || undefined}>
        {/* Header — always clickable so the user can re-open the trace */}
        <Button
          size="sm"
          shape="rect"
          variant="neutral"
          appearance="ghost"
          className="chat-research-toggle"
          aria-expanded={isOpen || isAnyLoading}
          aria-controls={detailsId}
          onClick={() => setIsOpen((v) => !v)}
        >
          <span className="chat-research-toggle__label">
            {isAnyLoading ? <SparklesIcon className="chat-research-toggle__icon animate-pulse" /> : <LightbulbIcon className="chat-research-toggle__icon" />}
            <span>{headerLabel}</span>
          </span>
          {isAnyLoading
            ? <SpinnerIcon className="chat-research-toggle__icon animate-spin" />
            : <ChevronRightIcon className="chat-research-toggle__chevron" data-open={isOpen || undefined} />}
        </Button>

        {showProgress && progress && (
          <ProgressSteps
            label={t.chat_research_progress_label}
            steps={progress}
            statusLabels={{ done: t.chat_research_status_done, active: t.chat_research_status_active, pending: t.chat_research_status_pending, error: t.chat_research_status_error }}
            className="chat-research-steps"
          />
        )}

        {waitingOnUser && (
          <div className="chat-research-recovery">
            <p className="chat-research-recovery__reason" role="status">
              {onResume ? tpl(t.chat_research_stopped, { n: currentStep }) : tpl(t.chat_research_failed, { n: currentStep })}
            </p>
            <div className="chat-research-recovery__actions">
              {onRetry && (
                <Button size="sm" shape="rect" variant="neutral" appearance="outline" onClick={onRetry}>
                  {tpl(t.chat_research_retry_step, { n: currentStep })}
                </Button>
              )}
              {onResume && (
                <Button size="sm" shape="rect" variant="primary" appearance="solid" onClick={onResume}>
                  {t.chat_deep_research_resume_short}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Phase detail list — collapsible. Stays expanded while still loading
         *  so the user always sees live progress; collapses automatically on
         *  completion (see useEffect above). */}
        {(isOpen || isAnyLoading) && (
          <ul id={detailsId} className="chat-research-pill-list">
            {groups.map((group) => (
              <PhasePill
                key={group.steps[0].id}
                group={group}
                rowTitle={buildPhaseTitle(group, t.chat_research_aspects_suffix)}
                showDetailsLabel={t.chat_research_show_details}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
