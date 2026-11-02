import Testing
@testable import ViezanDomain

// The picker shows the newest model of each family; the listing from the screenshot
// that prompted this (14 Claude rows, OpenAI with babbage/davinci) must shrink to a handful.
@Test func featuredKeepsTheNewestOfEachFamilyMostCapableFirst() {
    let claude = ["claude-fable-5", "claude-fable-5-1", "claude-haiku-4-5", "claude-haiku-5-5", "claude-opus-4-5", "claude-opus-4-6", "claude-opus-4-7",
                  "claude-opus-4-8", "claude-opus-5", "claude-opus-5-5", "claude-sonnet-4-5", "claude-sonnet-4-6", "claude-sonnet-5", "claude-sonnet-5-5"].map { "claude:" + $0 }
    #expect(ModelLineup.featured(claude) == ["claude:claude-fable-5-1", "claude:claude-opus-5-5", "claude:claude-sonnet-5-5", "claude:claude-haiku-5-5"])
    let openAI = ["babbage-002", "chat-latest", "chatgpt-image-latest", "computer-use-preview", "davinci-002", "gpt-3.5-turbo", "gpt-3.5-turbo-0125",
                  "gpt-4.1", "gpt-4.1-mini", "gpt-5", "gpt-5-mini", "gpt-5.5", "gpt-5.5-mini", "gpt-5.5-nano", "o3", "o3-mini", "o4-mini", "text-embedding-3-small", "tts-1", "whisper-1"].map { "openai:" + $0 }
    // One model per size; the GPT line wins over the o-series at the same size, which only fills a gap.
    #expect(ModelLineup.featured(openAI) == ["openai:gpt-5.5", "openai:gpt-5.5-mini", "openai:gpt-5.5-nano"])
    #expect(ModelLineup.featured(["openai:o3-pro", "openai:gpt-5.5", "openai:o3", "openai:gpt-5.5-mini"]) == ["openai:o3-pro", "openai:gpt-5.5", "openai:gpt-5.5-mini"])
    let gemini = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3-flash-preview", "gemini-3-pro", "gemini-2.5-flash-lite", "gemini-embedding-001", "gemini-2.5-flash-live-001"].map { "gemini:" + $0 }
    #expect(ModelLineup.featured(gemini) == ["gemini:gemini-3-pro", "gemini:gemini-3-flash-preview", "gemini:gemini-2.5-flash-lite"])
    // A dated snapshot never outranks the plain release; the plain one wins at equal version.
    #expect(ModelLineup.featured(["claude:claude-sonnet-5-5-20260301", "claude:claude-sonnet-5-5"]) == ["claude:claude-sonnet-5-5"])
    // Local runtimes list everything installed; unreadable cloud IDs still show a few names.
    #expect(ModelLineup.featured(["ollama:qwen3:4b", "ollama:gemma3:4b"]) == ["ollama:gemma3:4b", "ollama:qwen3:4b"])
    #expect(ModelLineup.featured(["openai:zeta-1", "openai:alpha-2"]) == ["openai:alpha-2", "openai:zeta-1"])
    #expect(ModelLineup.featured([]).isEmpty)
}

@Test func shortNamesComeFromTheIDNotACatalog() {
    #expect(ModelLineup.shortName("claude:claude-sonnet-5-5") == "Sonnet 5.5")
    #expect(ModelLineup.shortName("claude:claude-opus-5") == "Opus 5")
    #expect(ModelLineup.shortName("claude:claude-fable-5-1-20260301") == "Fable 5.1")
    #expect(ModelLineup.shortName("openai:gpt-5.5-mini") == "GPT-5.5 Mini")
    #expect(ModelLineup.shortName("openai:gpt-5") == "GPT-5")
    #expect(ModelLineup.shortName("openai:o4-mini") == "o4 Mini")
    #expect(ModelLineup.shortName("openai:gpt-5.5-pro") == "GPT-5.5 Pro")
    #expect(ModelLineup.shortName("gemini:gemini-3-pro") == "Gemini 3 Pro")
    #expect(ModelLineup.shortName("gemini:gemini-2.5-flash-lite") == "Gemini 2.5 Flash Lite")
    #expect(ModelLineup.shortName("ollama:qwen3:4b") == "qwen3:4b")
    #expect(ModelLineup.shortName("openai:some-new-thing-2026-05-01") == "some-new-thing")
}

@Test func tiersResolvePerProviderAndVanishWhereTheyWouldNotDiffer() {
    let claude = ["claude:claude-haiku-5-5", "claude:claude-sonnet-5-5", "claude:claude-opus-5-5", "claude:claude-fable-5-1"]
    // Generation first: Opus 5.5 outranks Fable 5.1 for Careful; Sonnet is the main line.
    #expect(ModelLineup.tiers(for: "claude:claude-sonnet-5-5", listing: claude) == [.fast: "claude:claude-haiku-5-5", .balanced: "claude:claude-sonnet-5-5", .careful: "claude:claude-opus-5-5"])
    let openAI = ["openai:gpt-5.5", "openai:gpt-5.5-mini", "openai:gpt-5.5-nano", "openai:babbage-002"]
    #expect(ModelLineup.tiers(for: "openai:gpt-5.5", listing: openAI) == [.fast: "openai:gpt-5.5-nano", .balanced: "openai:gpt-5.5", .careful: "openai:gpt-5.5"])
    let gemini = ["gemini:gemini-3-pro", "gemini:gemini-3-flash"]
    #expect(ModelLineup.tiers(for: "gemini:gemini-3-flash", listing: gemini) == [.fast: "gemini:gemini-3-flash", .balanced: "gemini:gemini-3-flash", .careful: "gemini:gemini-3-pro"])
    // One family only, or a local runtime: no purposes to choose between.
    #expect(ModelLineup.tiers(for: "claude:claude-sonnet-5-5", listing: ["claude:claude-sonnet-5-5", "claude:claude-sonnet-5"]) == nil)
    #expect(ModelLineup.tiers(for: "ollama:qwen3:4b", listing: ["ollama:qwen3:4b", "ollama:gemma3:4b"]) == nil)
}

@Test func searchFoldsSnapshotsAndDropsNonChatModels() {
    let listing = ["gpt-4o", "gpt-4o-2024-05-13", "gpt-4o-2024-08-06", "gpt-4o-mini", "gpt-4o-mini-tts", "gpt-4o-transcribe", "gpt-4o-mini-search-preview", "gpt-4.1-mini", "gpt-5", "whisper-1"].map { "openai:" + $0 }
    #expect(ModelLineup.search(listing, query: "") == ["openai:gpt-4.1-mini", "openai:gpt-4o", "openai:gpt-4o-mini", "openai:gpt-5"])
    #expect(ModelLineup.search(listing, query: "MINI") == ["openai:gpt-4.1-mini", "openai:gpt-4o-mini"])
    #expect(ModelLineup.search(listing, query: "zzz").isEmpty)
    // Only dated snapshots listed: the newest one stands for the name.
    #expect(ModelLineup.search(["openai:gpt-4o-2024-05-13", "openai:gpt-4o-2024-08-06"], query: "4o") == ["openai:gpt-4o-2024-08-06"])
    #expect(ModelLineup.search((1...20).map { "openai:gpt-\($0)" }, query: "").count == 8)
}

// The newest release wins even when its ID carries a codename, as the user's listing did.
@Test func codenamedReleasesLeadTheirSize() {
    let listing = ["gpt-6-astra", "gpt-5.5", "gpt-5.5-pro", "gpt-5.5-mini", "gpt-5.4-nano", "o3"].map { "openai:" + $0 }
    #expect(ModelLineup.featured(listing) == ["openai:gpt-5.5-pro", "openai:gpt-6-astra", "openai:gpt-5.5-mini", "openai:gpt-5.4-nano"])
    #expect(ModelLineup.shortName("openai:gpt-6-astra") == "GPT-6 Astra")
    #expect(ModelLineup.shortName("claude:claude-opus-6-sol") == "Opus 6 Sol")
    #expect(ModelLineup.tiers(for: "openai:gpt-6-astra", listing: listing)?[.balanced] == "openai:gpt-6-astra")
    // The listing from the screenshot: a 6.1 main line, an older 5.5 Pro, 5.4 small sizes. Careful must
    // not fall back to the older Pro while 6.1 exists; Fast is the newest small size.
    let shown = ["gpt-6.1-sol", "gpt-6-astra", "gpt-5.5-pro", "gpt-5.5", "gpt-5.4-mini", "gpt-5.4-nano"].map { "openai:" + $0 }
    #expect(ModelLineup.tiers(for: "openai:gpt-6-astra", listing: shown) == [.fast: "openai:gpt-5.4-nano", .balanced: "openai:gpt-6.1-sol", .careful: "openai:gpt-6.1-sol"])
    // A newer small size outranks an older one for Fast.
    #expect(ModelLineup.tiers(for: "openai:gpt-6.1-sol", listing: shown + ["openai:gpt-6.1-mini"])?[.fast] == "openai:gpt-6.1-mini")
    #expect(ModelLineup.shortName("openai:gpt-6.1-sol") == "GPT-6.1 Sol")
}

@Test func panelSectionsFollowTheQuery() {
    let listings = ["openai": ["openai:gpt-5.5", "openai:gpt-5.5-mini", "openai:whisper-1"], "claude": ["claude:claude-sonnet-5-5", "claude:claude-haiku-5-5"], "ollama": ["ollama:qwen3:4b"]]
    let tiers: [ModelTier: String] = [.fast: "openai:gpt-5.5-mini", .balanced: "openai:gpt-5.5", .careful: "openai:gpt-5.5"]
    let cloud = ["openai", "claude", "gemini"], local = ["ollama", "lmstudio", "llamacpp"]
    let idle = ModelLineup.sections(query: "", tiers: tiers, recent: ["claude:claude-haiku-5-5", "openai:gpt-5.5"], listings: listings, cloud: cloud, local: local)
    #expect(idle.map(\.key) == ["purpose", "recent", "openai", "claude", "gemini", "local"])
    #expect(idle[1].rows == [.model("claude:claude-haiku-5-5")])
    #expect(idle[4].rows == [.setup("gemini")])
    #expect(idle[5].rows == [.model("ollama:qwen3:4b")])
    let search = ModelLineup.sections(query: "mini", tiers: tiers, recent: [], listings: listings, cloud: cloud, local: local)
    #expect(search.map(\.key) == ["openai"])
    #expect(search[0].rows == [.model("openai:gpt-5.5-mini")])
    let typed = ModelLineup.sections(query: "openai:gpt-7", tiers: nil, recent: [], listings: listings, cloud: cloud, local: local)
    #expect(typed.last?.rows == [.typed("openai:gpt-7")])
    #expect(ModelLineup.sections(query: "zzz", tiers: nil, recent: [], listings: listings, cloud: cloud, local: local).isEmpty)
    #expect(ModelLineup.sections(query: "", tiers: nil, recent: [], listings: [:], cloud: cloud, local: local).map(\.key) == ["openai", "claude", "gemini", "local"])
}

@Test func recentModelsKeepThreeDistinctNewestFirst() {
    let history = ["ollama:d", "gemini:c", "ollama:d", "openai:whisper-1", "claude:a", "openai:b"]
    #expect(ModelLineup.recent(history) == ["ollama:d", "gemini:c", "claude:a"])
}
