// Lightweight Markdown renderer for AI chat responses and translation output.
// Supports: headings, bold, italic, inline code, code blocks, unordered lists,
// ordered lists, tables, horizontal rules, paragraphs.
// No external dependencies - pure React.

import { useT } from '../store/useAppStore'
import { renderInline } from '../utils/markdownInline'
import { ChartBlock, parseChartArtifact } from './markdown/ChartBlock'

interface Props {
  text: string
  className?: string
  /**
   * When true, use a smaller base font size + tighter spacing — suitable
   * for nested previews like the research-step popover where the markdown
   * is meta-content (not the user-facing answer). The default look is
   * unchanged so existing call sites keep their subtitle-size baseline.
   */
  compact?: boolean
}


/** Check if a line is a table separator row (|---|---|) */
function isTableSeparator(line: string): boolean {
  return /^\|[\s\-:|]+\|/.test(line.trim())
}

/** Check if a line looks like a table row (starts and ends with |) */
function isTableRow(line: string): boolean {
  const t = line.trim()
  return t.startsWith('|') && t.endsWith('|')
}

/** Parse a table row into cells */
function parseTableRow(line: string): string[] {
  return line.trim().slice(1, -1).split('|').map(cell => cell.trim())
}

export function MarkdownText({ text, className, compact = false }: Props) {

  const t = useT()
  const chartLabels = {
    bar: t.markdown_chart_bar,
    line: t.markdown_chart_line,
    pie: t.markdown_chart_pie,
    total: t.markdown_chart_total,
  }
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let listItems: string[] = []
  let orderedListItems: string[] = []
  let tableLines: string[] = []
  let inCodeBlock = false
  let codeLanguage = ''
  let codeLines: string[] = []
  let key = 0

  const flushList = () => {
    if (listItems.length === 0) return
    elements.push(
      <ul key={`ul-${key++}`} className="my-1.5 space-y-0.5 list-none pl-0">
        {listItems.map((item, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable index for list rendering
          <li key={i} className="flex items-start gap-1.5">
            <span className="markdown-bullet w-1.5 h-1.5 rounded-full bg-current opacity-50 flex-shrink-0" />
            <span>{renderInline(item)}</span>
          </li>
        ))}
      </ul>
    )
    listItems = []
  }

  const flushOrderedList = () => {
    if (orderedListItems.length === 0) return
    elements.push(
      <ol key={`ol-${key++}`} className="my-1.5 space-y-0.5 list-none pl-0">
        {orderedListItems.map((item, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable index for list rendering
          <li key={i} className="flex items-baseline gap-1.5">
            <span className="markdown-ol-index text-xs font-semibold flex-shrink-0 text-right">{i + 1}.</span>
            <span>{renderInline(item)}</span>
          </li>
        ))}
      </ol>
    )
    orderedListItems = []
  }

  const flushTable = () => {
    if (tableLines.length < 2) {
      // Not a valid table — emit as paragraphs
      for (const l of tableLines) {
        elements.push(<p key={key++} className="leading-relaxed">{renderInline(l)}</p>)
      }
      tableLines = []
      return
    }

    const headerCells = parseTableRow(tableLines[0])
    // Skip separator row (index 1), data starts at index 2
    const dataRows = tableLines.slice(2).filter(l => isTableRow(l))

    elements.push(
      <div key={`tbl-${key++}`} className="my-2 overflow-x-auto">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr className="markdown-table-head-row">
              {headerCells.map((cell, ci) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: stable index for table header
                <th key={ci}
                  className="markdown-table-th px-3 py-1.5 text-left font-semibold first:rounded-tl last:rounded-tr"
                >
                  {renderInline(cell)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows.map((row, ri) => {
              const cells = parseTableRow(row)
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: stable index for table rows
                <tr key={ri} className="markdown-table-row">
                  {cells.map((cell, ci) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: stable index for table cells — row index used as key
                    <td key={`${ri}-${ci}`} className="markdown-table-td px-3 py-1.5 align-top">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
    tableLines = []
  }

  const flushCodeBlock = () => {
    if (codeLines.length === 0) {
      codeLanguage = ''
      return
    }
    if (codeLanguage === 'chart') {
      const parsed = parseChartArtifact(codeLines.join('\n'), t.markdown_chart_value)
      if (parsed.ok) {
        elements.push(<ChartBlock key={`chart-${key++}`} chart={parsed.chart} labels={chartLabels} />)
        codeLines = []
        codeLanguage = ''
        return
      }
    }
    elements.push(
      <pre key={`pre-${key++}`} className="markdown-pre my-2 px-3 py-2.5 rounded-lg overflow-x-auto font-mono leading-relaxed">
        <code>{codeLines.join('\n')}</code>
      </pre>
    )
    codeLines = []
    codeLanguage = ''
  }

  for (const line of lines) {
    const trimmed = line.trim()

    // ── Code fence ────────────────────────────────────────────────────────────
    if (trimmed.startsWith('```')) {
      if (!inCodeBlock) {
        flushList()
        flushOrderedList()
        flushTable()
        codeLanguage = trimmed.slice(3).trim().split(/\s+/)[0]?.toLowerCase() ?? ''
        inCodeBlock = true
      } else {
        inCodeBlock = false
        flushCodeBlock()
      }
      continue
    }
    if (inCodeBlock) {
      codeLines.push(line)
      continue
    }

    // ── Table row ─────────────────────────────────────────────────────────────
    if (isTableRow(trimmed) || isTableSeparator(trimmed)) {
      flushList()
      flushOrderedList()
      tableLines.push(trimmed)
      continue
    }

    // If we were collecting table lines and now have a non-table line
    if (tableLines.length > 0) {
      flushTable()
    }

    // ── Horizontal rule ───────────────────────────────────────────────────────
    if (/^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed)) {
      flushList()
      flushOrderedList()
      elements.push(<hr key={key++} className="markdown-hr my-2" />)
      continue
    }

    // ── Unordered list item ───────────────────────────────────────────────────
    if (/^[-*+]\s+/.test(trimmed)) {
      flushOrderedList()
      const content = trimmed.replace(/^[-*+]\s+/, '')
      listItems.push(content)
      continue
    }

    // ── Ordered list item ─────────────────────────────────────────────────────
    if (/^\d+\.\s+/.test(trimmed)) {
      flushList()
      const content = trimmed.replace(/^\d+\.\s+/, '')
      orderedListItems.push(content)
      continue
    }

    // Flush pending lists before non-list lines
    flushList()
    flushOrderedList()

    // ── Headings ──────────────────────────────────────────────────────────────
    if (trimmed.startsWith('### ')) {
      elements.push(<h3 key={key++} className="markdown-heading text-sm font-bold mt-3 mb-1">{renderInline(trimmed.slice(4))}</h3>)
      continue
    }
    if (trimmed.startsWith('## ')) {
      elements.push(<h2 key={key++} className="markdown-heading text-base font-bold mt-3 mb-1">{renderInline(trimmed.slice(3))}</h2>)
      continue
    }
    if (trimmed.startsWith('# ')) {
      elements.push(<h1 key={key++} className="markdown-heading text-lg font-bold mt-3 mb-1">{renderInline(trimmed.slice(2))}</h1>)
      continue
    }

    // ── Empty line → paragraph break ──────────────────────────────────────────
    if (trimmed === '') {
      elements.push(<div key={key++} className="h-2" />)
      continue
    }

    // ── Normal paragraph line ─────────────────────────────────────────────────
    elements.push(
      <p key={key++} className="leading-relaxed">
        {renderInline(trimmed)}
      </p>
    )
  }

  // Flush remaining buffers
  if (inCodeBlock) flushCodeBlock()
  flushList()
  flushOrderedList()
  if (tableLines.length > 0) flushTable()

  // The wrapper sets the baseline font size. Compact mode shrinks the body
  // to ~12px which is intentional in the research-step popover where the
  // markdown is meta/diagnostic content rather than the primary answer.
  // Caller-supplied `className` is appended last so it can still override
  // size when needed (the base size sits in the components layer).
  const baseClass = compact ? 'markdown-text markdown-text--compact space-y-0.5' : 'markdown-text space-y-0.5'
  return <div className={`${baseClass} ${className ?? ''}`}>{elements}</div>
}

