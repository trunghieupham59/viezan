import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { smartThinkingService } from '../smartThinkingService'

describe('smartThinkingService', () => {
  const originalChatStream = window.api.chatStream
  const originalOnChatStreamEvent = window.api.onChatStreamEvent

  beforeEach(() => {
    vi.mocked(window.api.chat).mockReset()
    window.api.webSearch = vi.fn().mockResolvedValue({ success: false })
    ;(window.api as unknown as { chatStream?: typeof originalChatStream }).chatStream = undefined
    ;(window.api as unknown as {
      onChatStreamEvent?: typeof window.api.onChatStreamEvent
    }).onChatStreamEvent = undefined
  })

  afterEach(() => {
    window.api.chatStream = originalChatStream
    window.api.onChatStreamEvent = originalOnChatStreamEvent
  })

  it.each(['gemini', 'local'])('does not classify or search externally when web sources are off for %s', async (provider) => {
    vi.mocked(window.api.chat).mockResolvedValue({ success: true, reply: 'Offline-source answer' })
    const callbacks = { onStepStart: vi.fn(() => 'step'), onStepComplete: vi.fn(), onStepError: vi.fn(),
      onAnswerStart: vi.fn(() => 'answer'), onAnswerToken: vi.fn(), onAnswerComplete: vi.fn(), onAnswerError: vi.fn() }
    await smartThinkingService.run({ provider, model: 'test-model', question: 'What is the latest news today?',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'What is the latest news today?' }] }],
      allowWebSearch: false, forceWebSearch: true, callbacks,
      uiText: { webSearchStepLabelPrefix: 'Search', webSearchSummaryTitle: 'Summary', webSearchDefaultReason: 'Reason',
        webSearchSourcesTitle: 'Sources', webSearchNoSources: 'None', webSearchNoResults: 'None',
        webSearchErrorFallback: 'Error', noResponseError: 'Empty', unknownError: 'Unknown' },
    })
    expect(window.api.webSearch).not.toHaveBeenCalled()
    expect(window.api.chat).toHaveBeenCalledTimes(1)
    expect(callbacks.onStepStart).not.toHaveBeenCalled()
    expect(callbacks.onAnswerComplete).toHaveBeenCalledWith('answer', 'Offline-source answer')
  })

  it('keeps overlapping planned web queries concise without dropping answer focus', async () => {
    const classifierReply = JSON.stringify({
      needs_web: true,
      query: 'current leadership roles example agency',
      reason: 'The question asks for current information.',
      answer_focus: 'Identify the current people who hold the requested roles.',
      source_guidance: 'Prefer official or primary sources for current public roles.',
      source_count: 2,
      freshness_requirement: 'current-as-of-now',
      reliability_requirement: 'official or primary current leadership source',
    })
    vi.mocked(window.api.chat)
      .mockResolvedValueOnce({ success: true, reply: classifierReply })
      .mockResolvedValueOnce({ success: true, reply: 'Final answer' })

    const webSearchMock = vi.fn().mockResolvedValue({
      success: true,
      results: [
        {
          title: 'Summary of example agency roles',
          url: 'https://news.example.com/example-agency-roles',
          content: 'A secondary article lists role titles but not current holders.',
          score: 0.99,
        },
        {
          title: 'Example Agency Leadership',
          url: 'https://www.agency.gov/leadership',
          content: 'The official page lists current leaders by name and role.',
          score: 0.75,
        },
      ],
    })
    window.api.webSearch = webSearchMock

    const callbacks = {
      onStepStart: vi.fn(() => 'step-1'),
      onStepComplete: vi.fn(),
      onStepError: vi.fn(),
      onAnswerStart: vi.fn(() => 'answer-1'),
      onAnswerToken: vi.fn(),
      onAnswerComplete: vi.fn(),
      onAnswerError: vi.fn(),
    }

    await smartThinkingService.run({
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      question: 'Who currently holds the senior leadership roles at the example agency?',
      messages: [{
        role: 'user',
        content: [{
          type: 'text',
          text: 'Who currently holds the senior leadership roles at the example agency?',
        }],
      }],
      uiText: {
        webSearchStepLabelPrefix: 'Search',
        webSearchSummaryTitle: 'Summary',
        webSearchDefaultReason: 'Search is needed.',
        webSearchSourcesTitle: 'Sources',
        webSearchNoSources: 'No sources',
        webSearchNoResults: 'No matching web results.',
        webSearchErrorFallback: 'Search failed',
        noResponseError: 'No response',
        unknownError: 'Unknown error',
      },
      callbacks,
    })

    expect(webSearchMock).toHaveBeenCalledWith(expect.objectContaining({
      maxResults: 2,
      query: 'current leadership roles example agency',
    }))
    expect(callbacks.onStepStart).toHaveBeenCalledWith('Search current leadership roles example agency')
    expect(callbacks.onStepComplete).toHaveBeenCalledWith('step-1', expect.stringContaining('**Sources:**'))

    const finalCall = vi.mocked(window.api.chat).mock.calls[1][0]
    const finalPrompt = finalCall.systemPrompt ?? ''
    expect(finalPrompt).toContain('Answer focus from the routing step: Identify the current people')
    expect(finalPrompt).toContain('Freshness requirement: current-as-of-now')
    expect(finalPrompt).toContain('Reliability requirement: official or primary current leadership source')
    expect(finalPrompt).toContain('Search metadata')
    expect(finalPrompt).toContain('Retrieved at:')
    expect(finalPrompt).toContain('Search query: current leadership roles example agency')
    expect(finalPrompt).toContain('Do not invent or complete facts')
    expect(finalPrompt).toContain('Evaluate source credibility')
    expect(finalPrompt).toContain('Cross-check whether the retrieved evidence is fresh enough')
    expect(finalPrompt).toContain('When sources conflict')
    expect(finalPrompt).toContain('Answer the exact question')
    expect(callbacks.onAnswerComplete).toHaveBeenCalledWith(
      'answer-1',
      expect.stringContaining('Final answer'),
    )
    expect(callbacks.onAnswerComplete).toHaveBeenCalledWith(
      'answer-1',
      expect.stringContaining('agency.gov'),
    )
  })

  it('uses recent chat context for follow-up web queries and hides classifier reasoning', async () => {
    const classifierReply = JSON.stringify({
      needs_web: true,
      query: 'Tô Lâm Tổng Bí thư Việt Nam hiện nay',
      reason: 'The question is a direct check and I must inspect the prior turn under the strict rule.',
      answer_focus: 'Verify whether the prior claim about the current Vietnamese party leader is still current.',
      source_guidance: 'Prefer official Vietnamese government or party sources.',
      source_count: 1,
    })
    vi.mocked(window.api.chat)
      .mockResolvedValueOnce({ success: true, reply: classifierReply })
      .mockResolvedValueOnce({ success: true, reply: 'Tin này vẫn đúng theo nguồn hiện tại [1].' })

    const webSearchMock = vi.fn().mockResolvedValue({
      success: true,
      results: [{
        title: 'Đồng chí Tô Lâm được bầu giữ chức Tổng Bí thư',
        url: 'https://dangcongsan.vn/to-lam-tong-bi-thu',
        content: 'Thông tin chính thức về Tổng Bí thư Tô Lâm.',
        score: 0.98,
      }],
    })
    window.api.webSearch = webSearchMock

    const callbacks = {
      onStepStart: vi.fn(() => 'step-1'),
      onStepComplete: vi.fn(),
      onStepError: vi.fn(),
      onAnswerStart: vi.fn(() => 'answer-1'),
      onAnswerToken: vi.fn(),
      onAnswerComplete: vi.fn(),
      onAnswerError: vi.fn(),
    }

    await smartThinkingService.run({
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      question: 'tin này đã đúng với thời điểm hiện tại chưa?',
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'tổng bí thư đảng cộng sản Việt Nam là ai?' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Tổng Bí thư hiện nay là ông Tô Lâm.' }],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'tin này đã đúng với thời điểm hiện tại chưa?' }],
        },
      ],
      uiText: {
        webSearchStepLabelPrefix: 'Search',
        webSearchSummaryTitle: 'Summary',
        webSearchDefaultReason: 'Search is needed.',
        webSearchSourcesTitle: 'Sources',
        webSearchNoSources: 'No sources',
        webSearchNoResults: 'No matching web results.',
        webSearchErrorFallback: 'Search failed',
        noResponseError: 'No response',
        unknownError: 'Unknown error',
      },
      callbacks,
    })

    const classifierCall = vi.mocked(window.api.chat).mock.calls[0][0]
    const classifierText = classifierCall.messages[0].content[0].text ?? ''
    expect(classifierText).toContain('Tổng Bí thư hiện nay là ông Tô Lâm.')
    expect(classifierText).toContain('tin này đã đúng với thời điểm hiện tại chưa?')
    expect(classifierCall.bypassLengthCheck).toBe(true)

    expect(webSearchMock).toHaveBeenCalledWith(expect.objectContaining({
      maxResults: 1,
      query: 'Tô Lâm Tổng Bí thư Việt Nam hiện nay',
    }))
    expect(callbacks.onStepComplete).toHaveBeenCalledWith(
      'step-1',
      expect.not.stringContaining('strict rule'),
    )
    expect(callbacks.onStepComplete).toHaveBeenCalledWith(
      'step-1',
      expect.stringContaining('Search is needed.'),
    )
  })

  it('uses the classifier query as canonical search input and applies generic source grounding', async () => {
    const classifierReply = JSON.stringify({
      needs_web: true,
      query: 'example policy notice exact wording',
      reason: 'The user asks for source-backed wording.',
      answer_focus: 'Find the exact wording in retrieved source material.',
      source_guidance: 'Prefer primary source pages that contain the requested wording.',
      source_count: 1,
    })
    vi.mocked(window.api.chat)
      .mockResolvedValueOnce({ success: true, reply: classifierReply })
      .mockResolvedValueOnce({ success: true, reply: 'The retrieved snippet confirms only part of the wording [1].' })

    const webSearchMock = vi.fn().mockResolvedValue({
      success: true,
      results: [{
        title: 'Example Policy Notice',
        url: 'https://docs.example.com/policy-notice',
        content: 'A source snippet with only partial notice wording.',
        score: 0.95,
      }],
    })
    window.api.webSearch = webSearchMock

    const callbacks = {
      onStepStart: vi.fn(() => 'step-1'),
      onStepComplete: vi.fn(),
      onStepError: vi.fn(),
      onAnswerStart: vi.fn(() => 'answer-1'),
      onAnswerToken: vi.fn(),
      onAnswerComplete: vi.fn(),
      onAnswerError: vi.fn(),
    }

    await smartThinkingService.run({
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      question: 'show the exact wording of the example policy notice',
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: 'show the exact wording of the example policy notice' }],
      }],
      uiText: {
        webSearchStepLabelPrefix: 'Search',
        webSearchSummaryTitle: 'Summary',
        webSearchDefaultReason: 'Search is needed.',
        webSearchSourcesTitle: 'Sources',
        webSearchNoSources: 'No sources',
        webSearchNoResults: 'No matching web results.',
        webSearchErrorFallback: 'Search failed',
        noResponseError: 'No response',
        unknownError: 'Unknown error',
      },
      callbacks,
    })

    expect(webSearchMock).toHaveBeenCalledWith(expect.objectContaining({
      maxResults: 1,
      query: 'example policy notice exact wording',
    }))
    expect(callbacks.onStepStart).toHaveBeenCalledWith('Search example policy notice exact wording')

    const finalCall = vi.mocked(window.api.chat).mock.calls[1][0]
    const finalPrompt = finalCall.systemPrompt ?? ''
    expect(finalPrompt).toContain('requested answer depends on exact wording')
    expect(finalPrompt).toContain('If the retrieved results are snippets or incomplete')
    expect(finalPrompt).not.toContain('Verbatim-content guard')
  })

  it('applies the Smart Thinking contract even when web search is not needed', async () => {
    const classifierReply = JSON.stringify({
      needs_web: false,
      query: '',
      reason: 'The answer can be reasoned from the current conversation.',
      answer_focus: 'Provide a practical decision framework.',
      source_guidance: '',
      source_count: 0,
    })
    vi.mocked(window.api.chat)
      .mockResolvedValueOnce({ success: true, reply: classifierReply })
      .mockResolvedValueOnce({ success: true, reply: 'Use the option with the best risk-adjusted payoff.' })

    const callbacks = {
      onStepStart: vi.fn(() => 'step-1'),
      onStepComplete: vi.fn(),
      onStepError: vi.fn(),
      onAnswerStart: vi.fn(() => 'answer-1'),
      onAnswerToken: vi.fn(),
      onAnswerComplete: vi.fn(),
      onAnswerError: vi.fn(),
    }

    await smartThinkingService.run({
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      question: 'How should I decide between these two implementation options?',
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: 'How should I decide between these two implementation options?' }],
      }],
      uiText: {
        webSearchStepLabelPrefix: 'Search',
        webSearchSummaryTitle: 'Summary',
        webSearchDefaultReason: 'Search is needed.',
        webSearchSourcesTitle: 'Sources',
        webSearchNoSources: 'No sources',
        webSearchNoResults: 'No matching web results.',
        webSearchErrorFallback: 'Search failed',
        noResponseError: 'No response',
        unknownError: 'Unknown error',
      },
      callbacks,
    })

    expect(window.api.webSearch).not.toHaveBeenCalled()
    expect(callbacks.onStepStart).not.toHaveBeenCalled()

    const classifierCall = vi.mocked(window.api.chat).mock.calls[0][0]
    expect(classifierCall.systemPrompt).toContain('Identify the real problem')
    expect(classifierCall.systemPrompt).toContain('external, source-specific, or verifiable facts')

    const finalCall = vi.mocked(window.api.chat).mock.calls[1][0]
    const finalPrompt = finalCall.systemPrompt ?? ''
    expect(finalPrompt).toContain('You are Smart Thinking')
    expect(finalPrompt).toContain('Find the real problem')
    expect(finalPrompt).toContain('Trace root causes')
    expect(finalPrompt).toContain('Challenge weak assumptions')
    expect(finalPrompt).toContain('multiple perspectives')
    expect(finalPrompt).toContain("Occam's razor")
    expect(finalPrompt).toContain('feedback loops')
    expect(finalPrompt).toContain('Scale depth to the task')
  })

  it('skips the classifier model call for local providers unless web search is forced', async () => {
    vi.mocked(window.api.chat).mockResolvedValueOnce({ success: true, reply: 'Hôm nay là thứ Hai.' })

    await smartThinkingService.run({
      provider: 'local',
      model: 'gemma3:12b',
      question: 'hôm nay là thứ mấy?',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hôm nay là thứ mấy?' }] }],
      uiText: {
        webSearchStepLabelPrefix: 'Search',
        webSearchSummaryTitle: 'Summary',
        webSearchDefaultReason: 'Search is needed.',
        webSearchSourcesTitle: 'Sources',
        webSearchNoSources: 'No sources',
        webSearchNoResults: 'No matching web results.',
        webSearchErrorFallback: 'Search failed',
        noResponseError: 'No response',
        unknownError: 'Unknown error',
      },
      callbacks: {
        onStepStart: vi.fn(() => 'step-1'),
        onStepComplete: vi.fn(),
        onStepError: vi.fn(),
        onAnswerStart: vi.fn(() => 'answer-1'),
        onAnswerToken: vi.fn(),
        onAnswerComplete: vi.fn(),
        onAnswerError: vi.fn(),
      },
    })

    // Only the answer call reaches the model; no JSON routing call precedes it.
    expect(window.api.chat).toHaveBeenCalledTimes(1)
    const answerCall = vi.mocked(window.api.chat).mock.calls[0][0]
    expect(answerCall.systemPrompt ?? '').toContain('You are Smart Thinking')
    expect(answerCall.systemPrompt ?? '').not.toContain('Trace root causes')
    expect(window.api.webSearch).not.toHaveBeenCalled()
  })

  it('searches the web for time-sensitive local questions without a classifier call', async () => {
    window.api.webSearch = vi.fn().mockResolvedValue({
      success: true,
      results: [{ title: 'Jack album', url: 'https://example.com/jack', content: 'New album released.' }],
    })
    vi.mocked(window.api.chat).mockResolvedValueOnce({ success: true, reply: 'Album mới nhất là ... [1]' })

    const callbacks = {
      onStepStart: vi.fn(() => 'step-1'),
      onStepComplete: vi.fn(),
      onStepError: vi.fn(),
      onAnswerStart: vi.fn(() => 'answer-1'),
      onAnswerToken: vi.fn(),
      onAnswerComplete: vi.fn(),
      onAnswerError: vi.fn(),
    }

    await smartThinkingService.run({
      provider: 'local',
      model: 'gemma3:12b',
      question: 'album nhạc mới nhất của Jack',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'album nhạc mới nhất của Jack' }] }],
      uiText: {
        webSearchStepLabelPrefix: 'Search',
        webSearchSummaryTitle: 'Summary',
        webSearchDefaultReason: 'Search is needed.',
        webSearchSourcesTitle: 'Sources',
        webSearchNoSources: 'No sources',
        webSearchNoResults: 'No matching web results.',
        webSearchErrorFallback: 'Search failed',
        noResponseError: 'No response',
        unknownError: 'Unknown error',
      },
      callbacks,
    })

    expect(window.api.webSearch).toHaveBeenCalledTimes(1)
    expect(callbacks.onStepStart).toHaveBeenCalledTimes(1)
    // One model call only: the grounded answer. No routing call before it.
    expect(window.api.chat).toHaveBeenCalledTimes(1)
    expect(vi.mocked(window.api.chat).mock.calls[0][0].systemPrompt ?? '').toContain('WEB SEARCH RESULTS')
  })

  it('guards real-time answers when Smart Thinking cannot retrieve usable web evidence', async () => {
    const classifierReply = JSON.stringify({
      needs_web: true,
      query: 'current Viezan release',
      reason: 'The answer needs live release verification.',
      answer_focus: 'State the latest Viezan release only if current sources verify it.',
      source_guidance: 'Prefer official release pages.',
      source_count: 1,
      freshness_requirement: 'current-as-of-now',
      reliability_requirement: 'official release source',
    })
    vi.mocked(window.api.chat)
      .mockResolvedValueOnce({ success: true, reply: classifierReply })
      .mockResolvedValueOnce({ success: true, reply: 'I cannot verify the latest release from retrieved web results.' })

    const webSearchMock = vi.fn().mockResolvedValue({
      success: true,
      results: [],
    })
    window.api.webSearch = webSearchMock

    const callbacks = {
      onStepStart: vi.fn(() => 'step-1'),
      onStepComplete: vi.fn(),
      onStepError: vi.fn(),
      onAnswerStart: vi.fn(() => 'answer-1'),
      onAnswerToken: vi.fn(),
      onAnswerComplete: vi.fn(),
      onAnswerError: vi.fn(),
    }

    await smartThinkingService.run({
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      question: 'What is the current Viezan release?',
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: 'What is the current Viezan release?' }],
      }],
      uiText: {
        webSearchStepLabelPrefix: 'Search',
        webSearchSummaryTitle: 'Summary',
        webSearchDefaultReason: 'Search is needed.',
        webSearchSourcesTitle: 'Sources',
        webSearchNoSources: 'No sources',
        webSearchNoResults: 'No matching web results.',
        webSearchErrorFallback: 'Search failed',
        noResponseError: 'No response',
        unknownError: 'Unknown error',
      },
      callbacks,
    })

    expect(webSearchMock).toHaveBeenCalledWith(expect.objectContaining({
      maxResults: 1,
      query: 'current Viezan release',
    }))
    expect(callbacks.onStepComplete).toHaveBeenCalledWith('step-1', '_No matching web results._')

    const finalCall = vi.mocked(window.api.chat).mock.calls[1][0]
    const finalPrompt = finalCall.systemPrompt ?? ''
    expect(finalPrompt).toContain('did not retrieve usable web results')
    expect(finalPrompt).toContain('Search query attempted: current Viezan release')
    expect(finalPrompt).toContain('Freshness requirement: current-as-of-now')
    expect(finalPrompt).toContain('Reliability requirement: official release source')
    expect(finalPrompt).toContain('Do not present time-sensitive')
    expect(finalPrompt).toContain('Do not fabricate citations')
  })

  it('clamps excessive classifier source budgets for Smart Thinking search', async () => {
    const classifierReply = JSON.stringify({
      needs_web: true,
      query: 'current disputed market claim',
      reason: 'The answer needs external verification.',
      answer_focus: 'Check the claim without doing broad research.',
      source_guidance: 'Use a small set of credible sources.',
      source_count: 9,
    })
    vi.mocked(window.api.chat)
      .mockResolvedValueOnce({ success: true, reply: classifierReply })
      .mockResolvedValueOnce({ success: true, reply: 'Final answer [1].' })

    const webSearchMock = vi.fn().mockResolvedValue({
      success: true,
      results: Array.from({ length: 8 }, (_, i) => ({
        title: `Source ${i + 1}`,
        url: `https://example.com/${i + 1}`,
        content: `Source ${i + 1} content`,
        score: 1 - i * 0.1,
      })),
    })
    window.api.webSearch = webSearchMock

    const callbacks = {
      onStepStart: vi.fn(() => 'step-1'),
      onStepComplete: vi.fn(),
      onStepError: vi.fn(),
      onAnswerStart: vi.fn(() => 'answer-1'),
      onAnswerToken: vi.fn(),
      onAnswerComplete: vi.fn(),
      onAnswerError: vi.fn(),
    }

    await smartThinkingService.run({
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      question: 'Check this current disputed market claim',
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: 'Check this current disputed market claim' }],
      }],
      uiText: {
        webSearchStepLabelPrefix: 'Search',
        webSearchSummaryTitle: 'Summary',
        webSearchDefaultReason: 'Search is needed.',
        webSearchSourcesTitle: 'Sources',
        webSearchNoSources: 'No sources',
        webSearchNoResults: 'No matching web results.',
        webSearchErrorFallback: 'Search failed',
        noResponseError: 'No response',
        unknownError: 'Unknown error',
      },
      callbacks,
    })

    expect(webSearchMock).toHaveBeenCalledWith(expect.objectContaining({
      maxResults: 6,
      query: 'current disputed market claim',
    }))
    expect(callbacks.onAnswerComplete).toHaveBeenCalledWith('answer-1', expect.stringContaining('Source 6'))
    expect(callbacks.onAnswerComplete).toHaveBeenCalledWith('answer-1', expect.not.stringContaining('Source 7'))
  })

  describe('forced web search (Web Search mode)', () => {
    const uiText = {
      webSearchStepLabelPrefix: 'Search',
      webSearchSummaryTitle: 'Summary',
      webSearchDefaultReason: 'Search is needed.',
      webSearchSourcesTitle: 'Sources',
      webSearchNoSources: 'No sources',
      webSearchNoResults: 'No matching web results.',
      webSearchErrorFallback: 'Search failed',
      noResponseError: 'No response',
      unknownError: 'Unknown error',
    }

    const makeCallbacks = () => ({
      onStepStart: vi.fn(() => 'step-1'),
      onStepComplete: vi.fn(),
      onStepError: vi.fn(),
      onAnswerStart: vi.fn(() => 'answer-1'),
      onAnswerToken: vi.fn(),
      onAnswerComplete: vi.fn(),
      onAnswerError: vi.fn(),
    })

    const history = [
      { role: 'user' as const, content: [{ type: 'text' as const, text: 'Who founded Example Corp?' }] },
      { role: 'assistant' as const, content: [{ type: 'text' as const, text: 'Jane Doe founded it.' }] },
      { role: 'user' as const, content: [{ type: 'text' as const, text: 'and when?' }] },
    ]

    it('lets the classifier rewrite a follow-up into a self-contained query and raises the source floor', async () => {
      vi.mocked(window.api.chat)
        .mockResolvedValueOnce({
          success: true,
          reply: JSON.stringify({
            needs_web: false,
            query: 'Example Corp founding date',
            source_count: 1,
          }),
        })
        .mockResolvedValueOnce({ success: true, reply: 'Final answer' })
      const webSearchMock = vi.fn().mockResolvedValue({ success: false })
      window.api.webSearch = webSearchMock

      await smartThinkingService.run({
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        question: 'and when?',
        messages: history,
        uiText,
        callbacks: makeCallbacks(),
        forceWebSearch: true,
      })

      const classifierCall = vi.mocked(window.api.chat).mock.calls[0][0]
      expect(classifierCall.systemPrompt).toContain('explicitly turned on Web Search')
      expect(webSearchMock).toHaveBeenCalledWith(expect.objectContaining({
        query: 'Example Corp founding date',
        maxResults: 4,
      }))
    })

    it('still searches the raw question with a wide budget when the classifier fails', async () => {
      vi.mocked(window.api.chat)
        .mockResolvedValueOnce({ success: false, error: 'boom' })
        .mockResolvedValueOnce({ success: true, reply: 'Final answer' })
      const webSearchMock = vi.fn().mockResolvedValue({ success: false })
      window.api.webSearch = webSearchMock

      await smartThinkingService.run({
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        question: 'latest example news',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'latest example news' }] }],
        uiText,
        callbacks: makeCallbacks(),
        forceWebSearch: true,
      })

      expect(webSearchMock).toHaveBeenCalledWith(expect.objectContaining({
        query: 'latest example news',
        maxResults: 5,
      }))
    })

    it('reports when every search provider failed so the user is told search is not working', async () => {
      vi.mocked(window.api.chat)
        .mockResolvedValueOnce({ success: true, reply: '{"needs_web": true, "query": "q", "source_count": 4}' })
        .mockResolvedValueOnce({ success: true, reply: 'Final answer' })
      window.api.webSearch = vi.fn().mockResolvedValue({
        success: false,
        error: 'Jina 401',
        errorCode: 'SEARCH_FAILED',
      })
      const callbacks = { ...makeCallbacks(), onSearchUnavailable: vi.fn() }

      await smartThinkingService.run({
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        question: 'q',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'q' }] }],
        uiText,
        callbacks,
        forceWebSearch: true,
      })

      expect(callbacks.onSearchUnavailable).toHaveBeenCalledTimes(1)
    })

    it('hands the answer model up to 2000 characters per result', async () => {
      vi.mocked(window.api.chat)
        .mockResolvedValueOnce({ success: true, reply: '{"needs_web": true, "query": "q", "source_count": 3}' })
        .mockResolvedValueOnce({ success: true, reply: 'Final answer' })
      window.api.webSearch = vi.fn().mockResolvedValue({
        success: true,
        results: [{ title: 'Long', url: 'https://example.com/long', content: 'x'.repeat(3000), score: 0.9 }],
      })

      await smartThinkingService.run({
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        question: 'q',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'q' }] }],
        uiText,
        callbacks: makeCallbacks(),
        forceWebSearch: true,
      })

      const finalPrompt = vi.mocked(window.api.chat).mock.calls[1][0].systemPrompt ?? ''
      expect(finalPrompt).toContain('x'.repeat(2000))
      expect(finalPrompt).not.toContain('x'.repeat(2001))
    })
  })
})
