import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeepResearchResumeState } from '../../types'
import { DEEP_RESEARCH_CANCELLED_ERROR, type DeepResearchUiText, deepResearchService } from '../deepResearchService'

const TEST_UI_TEXT: DeepResearchUiText = {
  stepAnalyze: 'Analyze',
  // The renderer collapses every Survey step into one pill, so the label is
  // intentionally just the phase name; per-aspect detail is surfaced via the
  // hover-info popover (see ResearchStepsPanel).
  stepRound1: 'Survey',
  stepGap: 'Gap check',
  stepDeep: 'Deep dive',
  stepCross: 'Cross-check',
  stepSynth: 'Synthesize',

  modeRealtime: 'Real-time mode',
  modeAiOnly: 'AI-only mode',
  willStudy: 'Studying {count} aspects',
  imageContext: 'Image context: {context}',
  imageTerms: 'Image terms: {terms}',
  imageKbLabel: 'Attached image context',
  complete: 'Research complete',
  gapsFound: 'Found {count} gaps',
  deeperLabel: '[Deeper]',
  cannotAnalyze: '[cannot analyze: {error}]',
  cannotResearch: '[cannot research: {error}]',
  crossFailed: 'Cross-reference failed: {error}',
  crossFailedInline: '[cross-reference failed: {error}]',
  synthFailed: 'Synthesis failed ({error})',
  errorInline: '[Error: {error}]',
  errorAnalyze: 'Analysis error',
  errorGeneric: 'Error',
  errorEval: 'Evaluation error',
  errorCross: 'Cross-reference error',
  errorSynth: 'Synthesis error',
  errorUnknown: 'Unknown error',
  webSummary: 'Web summary',
}

describe('deepResearchService', () => {
  beforeEach(() => {
    vi.mocked(window.api.chat).mockReset()
    vi.mocked(window.api.chatStream).mockReset()
    vi.mocked(window.api.chatStream).mockResolvedValue({ success: false })
    vi.mocked(window.api.onChatStreamEvent).mockReset()
    vi.mocked(window.api.onChatStreamEvent).mockReturnValue(() => {})
    window.api.webSearch = vi.fn().mockResolvedValue({ success: false })
  })

  it('includes attached images in research calls and uses visual search terms', async () => {
    const webSearchMock = vi.fn().mockResolvedValue({
      success: true,
      results: [{
        title: 'Acme X100 review',
        url: 'https://example.test/acme-x100',
        content: 'Acme X100 is a compact gadget with recent market coverage.',
        score: 0.9,
      }],
    })
    ;(window.api as typeof window.api & { webSearch: typeof webSearchMock }).webSearch = webSearchMock

    const replies = [
      JSON.stringify({
        aspects: ['Product identity', 'Recent market coverage'],
        imageContext: 'The image shows an Acme X100 gadget box.',
        searchTerms: ['Acme X100 gadget'],
      }),
      'Product identity findings',
      'Market coverage findings',
      JSON.stringify({ isComplete: true, gaps: [], queries: [] }),
      'Cross-reference complete',
      'Final synthesis',
    ]
    vi.mocked(window.api.chat).mockImplementation(async () => ({
      success: true,
      reply: replies.shift() ?? 'Fallback reply',
    }))

    await deepResearchService.run({
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      question: 'Research this image',
      images: [{ imageBase64: 'image-base64', imageMimeType: 'image/png' }],
      uiText: TEST_UI_TEXT,
      callbacks: {
        onStepStart: vi.fn((label: string) => `step-${label}`),
        onStepComplete: vi.fn(),
        onStepError: vi.fn(),
      },
    })

    const chatCalls = vi.mocked(window.api.chat).mock.calls.map(([params]) => params)
    expect(chatCalls[0].messages[0].content).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'image',
        imageBase64: 'image-base64',
        imageMimeType: 'image/png',
      }),
      expect.objectContaining({ type: 'text', text: 'Research this image' }),
    ]))
    expect(chatCalls[1].messages[0].content).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'image',
        imageBase64: 'image-base64',
        imageMimeType: 'image/png',
      }),
    ]))
    expect(chatCalls[chatCalls.length - 1].messages[0].content).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'image',
        imageBase64: 'image-base64',
        imageMimeType: 'image/png',
      }),
    ]))
    expect(webSearchMock).toHaveBeenCalledWith(expect.objectContaining({
      query: expect.stringContaining('Acme X100 gadget'),
    }))
  })

  it('keeps accumulated research context out of cross-reference system prompts', async () => {
    const longFinding = 'Detailed finding. '.repeat(2500).trim()
    const replies = [
      JSON.stringify({ aspects: ['Aspect A', 'Aspect B'] }),
      longFinding,
      longFinding,
      JSON.stringify({ isComplete: true, gaps: [], queries: [] }),
      'Cross-reference complete',
      'Final synthesis',
    ]
    vi.mocked(window.api.chat).mockImplementation(async () => ({
      success: true,
      reply: replies.shift() ?? 'Fallback reply',
    }))

    await deepResearchService.run({
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      question: 'Research a large topic',
      uiText: TEST_UI_TEXT,
      callbacks: {
        onStepStart: vi.fn((label: string) => `step-${label}`),
        onStepComplete: vi.fn(),
        onStepError: vi.fn(),
      },
    })

    const chatCalls = vi.mocked(window.api.chat).mock.calls.map(([params]) => params)
    const gapCall = chatCalls[3]
    const crossReferenceCall = chatCalls[4]

    expect(gapCall.systemPrompt?.length).toBeLessThan(20_000)
    expect(crossReferenceCall.systemPrompt?.length).toBeLessThan(20_000)
    expect(gapCall.systemPrompt).not.toContain(longFinding)
    expect(crossReferenceCall.systemPrompt).not.toContain(longFinding)
    expect(gapCall.messages[0].content.find((item) => item.type === 'text')?.text).toContain(longFinding)
    expect(crossReferenceCall.messages[0].content.find((item) => item.type === 'text')?.text).toContain(longFinding)
    expect(gapCall.bypassLengthCheck).toBe(true)
    expect(crossReferenceCall.bypassLengthCheck).toBe(true)
  })

  it('resumes survey from the unfinished aspect instead of skipping the phase', async () => {
    const resumeState: DeepResearchResumeState = {
      question: 'Research partial survey',
      aspects: ['Aspect A', 'Aspect B'],
      knowledgeBase: [{ label: 'Aspect A', content: 'Completed A' }],
      surveyCompletedAspects: ['Aspect A'],
      imageContext: '',
      imageSearchTerms: [],
      anyWebSearch: false,
      lastCompletedPhase: 'survey',
      lastGapIteration: 0,
      hasImages: false,
    }
    const replies = [
      'Completed B',
      JSON.stringify({ isComplete: true, gaps: [], queries: [] }),
      'Cross-reference complete',
      'Final synthesis',
    ]
    vi.mocked(window.api.chat).mockImplementation(async () => ({
      success: true,
      reply: replies.shift() ?? 'Fallback reply',
    }))
    const onStepStart = vi.fn((label: string) => `step-${label}-${onStepStart.mock.calls.length}`)

    await deepResearchService.run({
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      question: resumeState.question,
      uiText: TEST_UI_TEXT,
      resumeState,
      callbacks: {
        onStepStart,
        onStepComplete: vi.fn(),
        onStepError: vi.fn(),
      },
    })

    const chatCalls = vi.mocked(window.api.chat).mock.calls.map(([params]) => params)
    const firstUserText = chatCalls[0].messages[0].content.find((item) => item.type === 'text')?.text
    expect(firstUserText).toContain('Analyze this aspect: Aspect B')
    expect(firstUserText).not.toContain('Aspect A')
    expect(onStepStart).toHaveBeenCalledWith('Survey', { phase: 'survey', aspect: 'Aspect B' })
    expect(onStepStart).not.toHaveBeenCalledWith('Survey', { phase: 'survey', aspect: 'Aspect A' })
  })

  it('uses survey indexes so duplicate aspect labels do not skip unfinished jobs', async () => {
    const resumeState: DeepResearchResumeState = {
      question: 'Research duplicate aspect labels',
      aspects: ['Aspect A', 'Repeated Aspect', 'Repeated Aspect', 'Repeated Aspect'],
      knowledgeBase: [
        { label: 'Aspect A', content: 'Completed A' },
        { label: 'Repeated Aspect', content: 'Completed repeated job 2' },
      ],
      surveyCompletedAspects: ['Aspect A', 'Repeated Aspect'],
      surveyCompletedIndexes: [0, 1],
      imageContext: '',
      imageSearchTerms: [],
      anyWebSearch: false,
      lastCompletedPhase: 'survey',
      lastGapIteration: 0,
      hasImages: false,
    }
    const replies = [
      'Completed repeated job 3',
      'Completed repeated job 4',
      JSON.stringify({ isComplete: true, gaps: [], queries: [] }),
      'Cross-reference complete',
      'Final synthesis',
    ]
    vi.mocked(window.api.chat).mockImplementation(async () => ({
      success: true,
      reply: replies.shift() ?? 'Fallback reply',
    }))
    const onStepStart = vi.fn((label: string) => `step-${label}-${onStepStart.mock.calls.length}`)
    const snapshots: Array<DeepResearchResumeState | null> = []

    await deepResearchService.run({
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      question: resumeState.question,
      uiText: TEST_UI_TEXT,
      resumeState,
      callbacks: {
        onStepStart,
        onStepComplete: vi.fn(),
        onStepError: vi.fn(),
        onResumeStateChange: (state) => snapshots.push(state),
      },
    })

    expect(onStepStart.mock.calls[0]).toEqual(['Survey', { phase: 'survey', aspect: 'Repeated Aspect' }])
    expect(onStepStart.mock.calls[1]).toEqual(['Survey', { phase: 'survey', aspect: 'Repeated Aspect' }])
    expect(snapshots).toEqual(expect.arrayContaining([
      expect.objectContaining({ surveyCompletedIndexes: [0, 1, 2] }),
      expect.objectContaining({ surveyCompletedIndexes: [0, 1, 2, 3] }),
    ]))
  })

  it('does not advance the survey checkpoint when stop aborts the active job', async () => {
    const controller = new AbortController()
    const resumeState: DeepResearchResumeState = {
      question: 'Research interrupted survey',
      aspects: ['Aspect A', 'Aspect B', 'Aspect C'],
      knowledgeBase: [{ label: 'Aspect A', content: 'Completed A' }],
      surveyCompletedAspects: ['Aspect A'],
      surveyCompletedIndexes: [0],
      imageContext: '',
      imageSearchTerms: [],
      anyWebSearch: false,
      lastCompletedPhase: 'survey',
      lastGapIteration: 0,
      hasImages: false,
    }
    vi.mocked(window.api.chatStream).mockImplementation(async () => {
      controller.abort()
      return { success: true, reply: 'Late Aspect B result' }
    })
    const onStepError = vi.fn()
    const snapshots: Array<DeepResearchResumeState | null> = []

    await expect(deepResearchService.run({
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      question: resumeState.question,
      uiText: TEST_UI_TEXT,
      resumeState,
      signal: controller.signal,
      callbacks: {
        onStepStart: vi.fn((label: string) => `step-${label}`),
        onStepComplete: vi.fn(),
        onStepError,
        onResumeStateChange: (state) => snapshots.push(state),
      },
    })).rejects.toThrow(DEEP_RESEARCH_CANCELLED_ERROR)

    expect(onStepError).toHaveBeenCalledWith('step-Survey', DEEP_RESEARCH_CANCELLED_ERROR)
    expect(snapshots).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ surveyCompletedIndexes: [0, 1] }),
    ]))
  })

  it('resumes deep-dive from the unfinished query in the active gap round', async () => {
    const resumeState: DeepResearchResumeState = {
      question: 'Research partial gap loop',
      aspects: ['Aspect A'],
      knowledgeBase: [
        { label: 'Aspect A', content: 'Completed A' },
        { label: '[Deeper] Gap 1', content: 'Completed Gap 1' },
      ],
      surveyCompletedAspects: ['Aspect A'],
      imageContext: '',
      imageSearchTerms: [],
      anyWebSearch: false,
      activeGapRound: {
        iteration: 1,
        gaps: ['Gap 1', 'Gap 2'],
        queries: ['Query 1', 'Query 2'],
        completedQueryIndexes: [0],
      },
      lastCompletedPhase: 'deep',
      lastGapIteration: 1,
      hasImages: false,
    }
    const replies = [
      'Completed Gap 2',
      JSON.stringify({ isComplete: true, gaps: [], queries: [] }),
      'Cross-reference complete',
      'Final synthesis',
    ]
    vi.mocked(window.api.chat).mockImplementation(async () => ({
      success: true,
      reply: replies.shift() ?? 'Fallback reply',
    }))
    const onStepStart = vi.fn((label: string) => `step-${label}-${onStepStart.mock.calls.length}`)

    await deepResearchService.run({
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      question: resumeState.question,
      uiText: TEST_UI_TEXT,
      resumeState,
      callbacks: {
        onStepStart,
        onStepComplete: vi.fn(),
        onStepError: vi.fn(),
      },
    })

    const chatCalls = vi.mocked(window.api.chat).mock.calls.map(([params]) => params)
    const firstUserText = chatCalls[0].messages[0].content.find((item) => item.type === 'text')?.text
    expect(firstUserText).toContain('Deep dive research: Gap 2')
    expect(firstUserText).not.toContain('Deep dive research: Gap 1')
    expect(onStepStart).toHaveBeenCalledWith('Deep dive', { phase: 'deep', aspect: 'Gap 2' })
    expect(onStepStart).not.toHaveBeenCalledWith('Deep dive', { phase: 'deep', aspect: 'Gap 1' })
  })
})

describe('deepResearchService web-search fallback notice', () => {
  const baseParams = {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    question: 'What changed in the latest release?',
    uiText: TEST_UI_TEXT,
  }

  function makeCallbacks() {
    let id = 0
    return {
      onStepStart: vi.fn(() => `step-${++id}`),
      onStepComplete: vi.fn(),
      onStepError: vi.fn(),
      onSearchFallback: vi.fn(),
    }
  }

  beforeEach(() => {
    vi.mocked(window.api.chat).mockReset()
    vi.mocked(window.api.chat).mockResolvedValue({
      success: true,
      reply: '{"aspects":["alpha","beta"],"isComplete":true,"gaps":[]}',
    })
    vi.mocked(window.api.chatStream).mockReset()
    vi.mocked(window.api.chatStream).mockResolvedValue({ success: false })
    vi.mocked(window.api.onChatStreamEvent).mockReset()
    vi.mocked(window.api.onChatStreamEvent).mockReturnValue(() => {})
  })

  it('reports a rejected search key once per run, not once per query', async () => {
    window.api.webSearch = vi.fn().mockResolvedValue({
      success: true,
      provider: 'jina',
      results: [{ title: 'T', url: 'https://example.test', content: 'c', score: 1 }],
      fallback: { from: 'tavily', reason: 'auth' },
    })
    const callbacks = makeCallbacks()
    await deepResearchService.run({ ...baseParams, callbacks }).catch(() => {})

    expect(vi.mocked(window.api.webSearch).mock.calls.length).toBeGreaterThan(1)
    expect(callbacks.onSearchFallback).toHaveBeenCalledTimes(1)
    expect(callbacks.onSearchFallback).toHaveBeenCalledWith({ from: 'tavily', reason: 'auth' })
  })

  it('stays silent for transient errors and when no fallback happened', async () => {
    window.api.webSearch = vi.fn().mockResolvedValue({
      success: true,
      provider: 'jina',
      results: [{ title: 'T', url: 'https://example.test', content: 'c', score: 1 }],
      fallback: { from: 'brave', reason: 'error' },
    })
    const transient = makeCallbacks()
    await deepResearchService.run({ ...baseParams, callbacks: transient }).catch(() => {})
    expect(transient.onSearchFallback).not.toHaveBeenCalled()

    window.api.webSearch = vi.fn().mockResolvedValue({ success: true, provider: 'tavily', results: [] })
    const none = makeCallbacks()
    await deepResearchService.run({ ...baseParams, callbacks: none }).catch(() => {})
    expect(none.onSearchFallback).not.toHaveBeenCalled()
  })
})

describe('deepResearchService research quality', () => {
  const noGaps = JSON.stringify({ isComplete: true, gaps: [], queries: [] })

  const result = (title: string, url: string) => ({ title, url, content: `${title} content`, score: 0.9 })

  function queueReplies(replies: Array<string | { success: false; error: string }>) {
    vi.mocked(window.api.chat).mockImplementation(async () => {
      const next = replies.shift() ?? 'Fallback reply'
      return typeof next === 'string' ? { success: true, reply: next } : next
    })
  }

  function makeCallbacks() {
    let id = 0
    return {
      onStepStart: vi.fn(() => `step-${++id}`),
      onStepComplete: vi.fn(),
      onStepError: vi.fn(),
      onResumeStateChange: vi.fn(),
    }
  }

  beforeEach(() => {
    vi.mocked(window.api.chat).mockReset()
    vi.mocked(window.api.chatStream).mockReset()
    vi.mocked(window.api.chatStream).mockResolvedValue({ success: false })
    vi.mocked(window.api.onChatStreamEvent).mockReset()
    vi.mocked(window.api.onChatStreamEvent).mockReturnValue(() => {})
  })

  it('numbers sources globally across searches and appends only the cited ones to the answer', async () => {
    window.api.webSearch = vi.fn()
      .mockResolvedValueOnce({ success: true, results: [result('Alpha', 'https://a.test'), result('Beta', 'https://b.test')] })
      .mockResolvedValueOnce({ success: true, results: [result('Alpha', 'https://a.test'), result('Gamma', 'https://c.test')] })
      .mockResolvedValue({ success: false })
    queueReplies([
      JSON.stringify({ aspects: ['Aspect one', 'Aspect two'] }),
      'Finding one [1][2]',
      'Finding two [1][3]',
      noGaps,
      'Cross-reference',
      'Answer relying on [1] and [3].\n\n## Sources\n[1] https://a.test',
    ])
    const callbacks = makeCallbacks()

    await deepResearchService.run({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      question: 'Compare alpha and gamma',
      uiText: { ...TEST_UI_TEXT, sourcesTitle: 'Sources' },
      callbacks,
    })

    const chatCalls = vi.mocked(window.api.chat).mock.calls.map(([params]) => params)
    // The second aspect reuses [1] for the repeated page and continues at [3], not [2].
    expect(chatCalls[2].systemPrompt).toContain('**[1] Alpha**')
    expect(chatCalls[2].systemPrompt).toContain('**[3] Gamma**')
    expect(chatCalls[2].systemPrompt).not.toContain('**[2] Gamma**')

    const synthesisText = chatCalls[5].messages[0].content.find((item) => item.type === 'text')?.text ?? ''
    expect(synthesisText).toContain('[3] Gamma — https://c.test')

    const finalCall = callbacks.onStepComplete.mock.calls.find(([, , isFinal]) => isFinal)
    const finalContent = finalCall?.[1] as string
    expect(finalContent).toContain('Answer relying on [1] and [3].')
    expect(finalContent).toContain('- **[1]** [Alpha](https://a.test)')
    expect(finalContent).toContain('- **[3]** [Gamma](https://c.test)')
    expect(finalContent).not.toContain('Beta')
    // The model's own trailing source list is replaced by the numbered one.
    expect(finalContent.match(/Sources/g)).toHaveLength(1)
  })

  it('keeps a failed survey step out of the findings and tells the synthesis about the gap', async () => {
    window.api.webSearch = vi.fn().mockResolvedValue({ success: false })
    queueReplies([
      JSON.stringify({ aspects: ['Aspect one', 'Aspect two'] }),
      { success: false, error: 'provider exploded' },
      'Finding two',
      noGaps,
      'Cross-reference',
      'Final answer',
    ])
    const callbacks = makeCallbacks()

    await deepResearchService.run({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      question: 'Research this',
      uiText: TEST_UI_TEXT,
      callbacks,
    })

    expect(callbacks.onStepError).toHaveBeenCalledWith('step-2', 'provider exploded')
    const chatCalls = vi.mocked(window.api.chat).mock.calls.map(([params]) => params)
    const synthesisCall = chatCalls[chatCalls.length - 1]
    const synthesisText = synthesisCall.messages[0].content.find((item) => item.type === 'text')?.text ?? ''
    expect(synthesisText).not.toContain('provider exploded')
    expect(synthesisText).toContain('Finding two')
    expect(synthesisCall.systemPrompt).toContain('could NOT be researched')
    expect(synthesisCall.systemPrompt).toContain('Aspect one')

    const lastSnapshot = callbacks.onResumeStateChange.mock.calls
      .map(([state]) => state)
      .filter(Boolean)
      .pop()
    expect(lastSnapshot?.surveyCompletedIndexes).toEqual([1])
  })

  it('searches gap queries as planned instead of appending the original question', async () => {
    const webSearchMock = vi.fn().mockResolvedValue({ success: false })
    window.api.webSearch = webSearchMock
    queueReplies([
      JSON.stringify({ aspects: ['Aspect one', 'Aspect two'] }),
      'Finding one',
      'Finding two',
      JSON.stringify({ isComplete: false, gaps: ['Missing pricing'], queries: ['Acme X100 official price 2026'] }),
      'Deep dive finding',
      noGaps,
      'Cross-reference',
      'Final answer',
    ])

    await deepResearchService.run({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      question: 'A very long original question about everything Acme',
      uiText: TEST_UI_TEXT,
      callbacks: makeCallbacks(),
    })

    const queries = webSearchMock.mock.calls.map(([params]) => params.query)
    expect(queries).toContain('Acme X100 official price 2026')
    expect(queries).toContain('Aspect one')
    expect(queries.some((query) => query.includes('original question'))).toBe(false)
  })

  it('gives the analysis step the earlier conversation to resolve references', async () => {
    window.api.webSearch = vi.fn().mockResolvedValue({ success: false })
    queueReplies([
      JSON.stringify({ aspects: ['Aspect one', 'Aspect two'] }),
      'Finding one',
      'Finding two',
      noGaps,
      'Cross-reference',
      'Final answer',
    ])

    await deepResearchService.run({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      question: 'Compare it with the previous one',
      history: 'USER: Tell me about the Acme X100\nASSISTANT: The X100 is a gadget.',
      uiText: TEST_UI_TEXT,
      callbacks: makeCallbacks(),
    })

    const analyzeText = vi.mocked(window.api.chat).mock.calls[0][0].messages[0].content
      .find((item) => item.type === 'text')?.text ?? ''
    expect(analyzeText).toContain('Compare it with the previous one')
    expect(analyzeText).toContain('Tell me about the Acme X100')
  })
})
