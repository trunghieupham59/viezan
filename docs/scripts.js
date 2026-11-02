/* ══════════════════════════════════════════════════════════════
   TRANSLATIONS — EN, VI, CN, JP, FR, KR
══════════════════════════════════════════════════════════════ */
const TRANSLATIONS = {

  /* ── English ── */
  en: {
    nav: { features: 'Features', screenshots: 'Screenshots', about: 'About', download: 'Download', support: '☕ Support' },
    hero: {
      badge: 'Free & Open Source',
      h1: '<span class="brand">AI Translation</span><br><span class="dim">Built for</span> Real Work',
      sub: 'Text, live audio, image translation, browser translation and AI chat in one <strong>local-first</strong> desktop app. Use Local AI or connect your own cloud provider keys.',
      btn_download: '⬇ Download Free',
      btn_screenshots: '🖼 View Screenshots',
      btn_github: '★ GitHub',
      platform_mac: 'macOS',
      platform_win: 'Windows',
      platform_linux: 'Linux',
    },
    providers: { label: 'Powered by local runtimes and bring-your-own-key cloud providers' },
    features: {
      label: 'Features',
      title: 'Everything you need to<br>communicate without barriers',
      sub: 'Viezan packs a full translation suite into one desktop app: local runtime support, bring-your-own-key cloud providers, no Viezan relay server.',
    },
    feat: [
      { title: 'Text Translation',   desc: 'Translate with 7 tone styles — Neutral, Friendly, Professional, Business, Slack, Polite, Technical. Auto or manual mode. 19 languages supported.', tag: 'Core' },
      { title: 'Live Translation',   desc: 'Real-time subtitles from microphone or system audio. Floating overlay with custom font size, color, and opacity. AI session summary after each call.', tag: 'Real-time' },
      { title: 'Image Translation',  desc: 'Drag-and-drop or paste any image. AI Vision extracts and translates all text — documents, screenshots, menus, slides — and lets you download the result.', tag: 'AI Vision' },
      { title: 'AI Chat',            desc: 'Full-featured AI chat with image attachments, voice input, custom System Prompts, preset templates, web search, native chart responses, and complete searchable chat history.', tag: 'Assistant' },
      { title: 'Voice I/O',          desc: 'Voice input via Web Speech API, OpenAI Whisper, Gemini STT, and Groq fallback. Text-to-Speech uses free-first and premium provider paths.', tag: 'Audio' },
      { title: 'Furigana Support',   desc: 'Automatic furigana overlay on Japanese translations. Essential for learners, BrSE, and anyone working daily with Japanese text.', tag: 'Japanese' },
      { title: 'Global Hotkey',      desc: 'Summon Viezan from any application with a global keyboard shortcut. No need to switch apps mid-workflow.', tag: 'Productivity' },
      { title: 'Privacy First',      desc: 'Provider keys are stored in the operating system credential store and used by the desktop app only. No Viezan-hosted relay server sits between you and the selected provider.', tag: 'Security' },
      { title: 'Settings Modal',     desc: 'Settings redesigned as a clean popup overlay — access API keys, and model preferences instantly from any tab without losing context.', tag: 'UX' },
      { title: 'Phonetic Mode',      desc: 'Pure phonetic transcription mode — get romanization or phonetics instead of a full translation. Perfect for pronunciation learning and language study.', tag: 'Translate' },
      { title: 'Web Search in Chat', desc: 'AI Chat with optional real-time web search through Tavily or Brave keys, plus a Jina fallback path when available.', tag: 'Chat' },
      { title: 'Local AI Support',   desc: 'Run translation and chat through Ollama, LM Studio or llama.cpp. Benchmark your hardware, download curated models, and keep work fully local.', tag: 'Available' },
    ],
    screenshots: { label: 'Screenshots', title: 'See it in action', sub: 'Click any card to zoom in. Navigate with arrow keys or swipe on mobile.' },
    story: {
      label: 'The Story',
      h2: 'Built by a BrSE,<br>for the whole team',
      p1: 'Working as a BrSE/PM at a Japanese product company, I watched information get lost in translation chains — IT Comtors, BAs, BrSEs all passing context along until the original meaning was gone, costing hours of extra meetings.',
      p2: 'With the spirit of <strong>"工夫"</strong> — always finding a way to improve — I built Viezan: a tool that lets everyone communicate directly with AI translation, no intermediary needed.',
      p3: 'The app is <strong>local-first</strong>. It can call local runtimes directly, or provider APIs with your own keys. No Viezan relay server sits between you and the provider you choose.',
    },
    highlights: [
      { title: '19 Languages Supported',   desc: 'From Vietnamese, Japanese, English to Korean, Chinese, French and more.' },
      { title: '3 UI Languages',           desc: 'Interface available in Vietnamese, English, and Japanese — auto dark mode included.' },
      { title: 'Smart Model Suggestions',  desc: 'Viezan automatically recommends the best AI model for each task type.' },
      { title: '100% Free to Download',    desc: 'No subscription. You only pay for the AI API calls you choose to make.' },
      { title: 'Local AI Available',       desc: 'Use Ollama, LM Studio or llama.cpp for private, keyless local translation and chat.' },
    ],
    download: {
      label: 'Download', title: 'Get Viezan for free',
      sub: 'Available for macOS, Windows and Linux. No account required. Start translating in minutes.',
      mac_btn: '⬇ Download .dmg', win_btn: '⬇ Download .exe', linux_btn: '⬇ Download .AppImage',
      warning: '⚠️ macOS may block the app because it is not signed/notarized yet. Use System Settings → Privacy & Security → Open Anyway, or see the README for the trusted-download Terminal fallback. <a href="https://github.com/trunghieupham59/Viezan#readme" style="color:var(--accent)" target="_blank">See instructions →</a>',
    },
    support: {
      label: 'Support', h2: 'Enjoying Viezan?',
      p: 'Viezan is free and built in my spare time. If it saves you time or helps your team communicate better, a coffee goes a long way toward code signing, better local AI, and new features. ☕',
      btn: '☕ Buy me a coffee via Momo', github: '★ Star on GitHub', bug: '🐛 Report a bug', changelog: '📋 Changelog',
    },
    footer: {
      github: 'GitHub', releases: 'Releases', issues: 'Issues', coffee: 'Buy me a coffee ☕',
      made: 'Made with ❤️ and 工夫 by <a href="https://github.com/trunghieupham59" target="_blank">trunghieupham59</a> · <a href="https://github.com/trunghieupham59/viezan?tab=MIT-1-ov-file" target="_blank">MIT License</a>',
    },
  },

  /* ── Vietnamese ── */
  vi: {
    nav: { features: 'Tính năng', screenshots: 'Ảnh chụp', about: 'Về chúng tôi', download: 'Tải xuống', support: '☕ Ủng hộ' },
    hero: {
      badge: 'Miễn phí & Mã nguồn mở',
      h1: '<span class="brand">Dịch thuật AI</span><br><span class="dim">Được tạo ra cho</span> Công việc thực tế',
      sub: 'Dịch văn bản, âm thanh trực tiếp, ảnh, trình duyệt và chat AI trong một ứng dụng desktop <strong>local-first</strong>. Dùng Local AI hoặc kết nối API key cloud của bạn.',
      btn_download: '⬇ Tải miễn phí',
      btn_screenshots: '🖼 Xem ảnh chụp',
      btn_github: '★ GitHub',
      platform_mac: 'macOS',
      platform_win: 'Windows',
      platform_linux: 'Linux',
    },
    providers: { label: 'Chạy với runtime local và cloud provider BYOK' },
    features: {
      label: 'Tính năng',
      title: 'Mọi thứ bạn cần để<br>giao tiếp không rào cản',
      sub: 'Viezan tích hợp bộ công cụ dịch thuật trong một ứng dụng desktop: hỗ trợ runtime local, cloud provider BYOK và không có relay server của Viezan.',
    },
    feat: [
      { title: 'Dịch văn bản',         desc: 'Dịch với 7 phong cách — Trung lập, Thân thiện, Chuyên nghiệp, Kinh doanh, Slack, Lịch sự, Kỹ thuật. Chế độ tự động hoặc thủ công. Hỗ trợ 19 ngôn ngữ.', tag: 'Cốt lõi' },
      { title: 'Dịch trực tiếp',       desc: 'Phụ đề thời gian thực từ microphone hoặc âm thanh hệ thống. Overlay nổi với cỡ chữ, màu sắc và độ trong suốt tùy chỉnh. Tóm tắt phiên bằng AI sau mỗi cuộc họp.', tag: 'Thời gian thực' },
      { title: 'Dịch ảnh',             desc: 'Kéo thả hoặc dán bất kỳ ảnh nào. AI Vision trích xuất và dịch toàn bộ văn bản — tài liệu, ảnh chụp màn hình, menu, slide — và cho phép tải kết quả về.', tag: 'AI Vision' },
      { title: 'Chat AI',              desc: 'Chat AI đầy đủ tính năng với đính kèm ảnh, nhập liệu bằng giọng nói, System Prompts tùy chỉnh, mẫu sẵn có, tìm kiếm web và lịch sử chat có thể tìm kiếm.', tag: 'Trợ lý' },
      { title: 'Giọng nói I/O',        desc: 'Nhập liệu bằng giọng nói qua Web Speech API, OpenAI Whisper, Gemini STT và Groq dự phòng. Text-to-Speech có đường dẫn miễn phí trước và provider cao cấp.', tag: 'Âm thanh' },
      { title: 'Hỗ trợ Furigana',      desc: 'Overlay furigana tự động trên bản dịch tiếng Nhật. Không thể thiếu cho người học, BrSE và những ai làm việc hàng ngày với văn bản tiếng Nhật.', tag: 'Tiếng Nhật' },
      { title: 'Phím tắt toàn cục',    desc: 'Gọi Viezan từ bất kỳ ứng dụng nào bằng phím tắt toàn cục. Không cần chuyển ứng dụng giữa chừng công việc.', tag: 'Năng suất' },
      { title: 'Bảo mật trước tiên',   desc: 'Provider key được lưu trong kho thông tin xác thực của hệ điều hành và chỉ dùng trong desktop app. Không có relay server của Viezan nằm giữa bạn và provider đã chọn.', tag: 'Bảo mật' },
      { title: 'Cài đặt dạng Modal',   desc: 'Cài đặt được thiết kế lại thành popup overlay — truy cập API key, và tùy chọn mô hình ngay lập tức từ bất kỳ tab nào mà không mất ngữ cảnh.', tag: 'UX' },
      { title: 'Chế độ Phiên âm',      desc: 'Chế độ phiên âm thuần tuý — nhận phiên âm/romanization thay vì bản dịch đầy đủ. Hoàn hảo cho việc học phát âm và nghiên cứu ngôn ngữ.', tag: 'Dịch thuật' },
      { title: 'Tìm kiếm Web trong Chat', desc: 'Chat AI với tìm kiếm web tùy chọn qua Tavily hoặc Brave key, kèm đường dẫn Jina fallback khi khả dụng.', tag: 'Chat' },
      { title: 'Hỗ trợ AI cục bộ',     desc: 'Dịch và chat qua Ollama, LM Studio hoặc llama.cpp. Benchmark phần cứng, tải model đề xuất và giữ dữ liệu hoàn toàn trên máy.', tag: 'Đã có' },
    ],
    screenshots: { label: 'Ảnh chụp', title: 'Xem thực tế', sub: 'Nhấp vào bất kỳ ảnh nào để phóng to. Điều hướng bằng phím mũi tên hoặc vuốt trên di động.' },
    story: {
      label: 'Câu chuyện',
      h2: 'Được xây dựng bởi một BrSE,<br>cho cả đội nhóm',
      p1: 'Làm việc với tư cách BrSE/PM tại một công ty sản phẩm Nhật Bản, tôi chứng kiến thông tin bị mất trong chuỗi dịch thuật — IT Comtor, BA, BrSE chuyển tiếp ngữ cảnh cho đến khi ý nghĩa gốc biến mất, gây lãng phí hàng giờ họp hành thêm.',
      p2: 'Với tinh thần <strong>"工夫"</strong> — luôn tìm cách cải thiện — tôi đã xây dựng Viezan: một công cụ giúp mọi người giao tiếp trực tiếp với bản dịch AI, không cần trung gian.',
      p3: 'Ứng dụng theo hướng <strong>local-first</strong>. Viezan có thể gọi runtime local trực tiếp hoặc gọi provider API bằng key của bạn. Không có relay server của Viezan nằm giữa bạn và provider đã chọn.',
    },
    highlights: [
      { title: 'Hỗ trợ 19 ngôn ngữ',          desc: 'Từ Tiếng Việt, Tiếng Nhật, Tiếng Anh đến Tiếng Hàn, Tiếng Trung, Tiếng Pháp và nhiều hơn.' },
      { title: '3 Ngôn ngữ giao diện',         desc: 'Giao diện có sẵn bằng Tiếng Việt, Tiếng Anh và Tiếng Nhật — chế độ tối tự động.' },
      { title: 'Gợi ý mô hình thông minh',     desc: 'Viezan tự động đề xuất mô hình AI tốt nhất cho từng loại tác vụ.' },
      { title: '100% Miễn phí tải xuống',      desc: 'Không đăng ký. Bạn chỉ trả tiền cho các lần gọi API AI mà bạn chọn.' },
      { title: 'AI cục bộ đã có',              desc: 'Dùng Ollama, LM Studio hoặc llama.cpp để dịch và chat local, riêng tư, không cần API key.' },
    ],
    download: {
      label: 'Tải xuống', title: 'Tải Viezan miễn phí',
      sub: 'Có sẵn cho macOS, Windows và Linux. Không cần tài khoản. Bắt đầu dịch trong vài phút.',
      mac_btn: '⬇ Tải .dmg', win_btn: '⬇ Tải .exe', linux_btn: '⬇ Tải .AppImage',
      warning: '⚠️ macOS có thể chặn ứng dụng vì chưa ký/notarize. Vào System Settings → Privacy & Security → Open Anyway, hoặc xem README để dùng lệnh Terminal khi bạn tin tưởng file tải về. <a href="https://github.com/trunghieupham59/Viezan#readme" style="color:var(--accent)" target="_blank">Xem hướng dẫn →</a>',
    },
    support: {
      label: 'Ủng hộ', h2: 'Thích Viezan?',
      p: 'Viezan miễn phí và được xây dựng trong thời gian rảnh. Nếu nó tiết kiệm thời gian hoặc giúp nhóm của bạn giao tiếp tốt hơn, một ly cà phê sẽ đóng góp rất nhiều cho việc ký mã, cải thiện AI cục bộ và các tính năng mới. ☕',
      btn: '☕ Mua tôi một ly cà phê qua Momo', github: '★ Star trên GitHub', bug: '🐛 Báo lỗi', changelog: '📋 Nhật ký thay đổi',
    },
    footer: {
      github: 'GitHub', releases: 'Phiên bản', issues: 'Vấn đề', coffee: 'Mua tôi cà phê ☕',
      made: 'Được tạo với ❤️ và 工夫 bởi <a href="https://github.com/trunghieupham59" target="_blank">trunghieupham59</a> · <a href="https://github.com/trunghieupham59/viezan?tab=MIT-1-ov-file" target="_blank">Giấy phép MIT</a>',
    },
  },

  /* ── Chinese Simplified ── */
  cn: {
    nav: { features: '功能', screenshots: '截图', about: '关于', download: '下载', support: '☕ 支持' },
    hero: {
      badge: '免费 & 开源',
      h1: '<span class="brand">AI 翻译</span><br><span class="dim">专为</span>实际工作打造',
      sub: '文本、实时音频、图片、浏览器翻译和 AI 聊天集中在一个 <strong>local-first</strong> 桌面应用中。可使用 Local AI，也可连接自己的云端提供商密钥。',
      btn_download: '⬇ 免费下载',
      btn_screenshots: '🖼 查看截图',
      btn_github: '★ GitHub',
      platform_mac: 'macOS',
      platform_win: 'Windows',
      platform_linux: 'Linux',
    },
    providers: { label: '由本地运行时和 BYOK 云端提供商驱动' },
    features: {
      label: '功能',
      title: '跨越语言障碍，<br>轻松无阻沟通',
      sub: 'Viezan 将完整翻译套件集成到一个桌面应用中：支持本地运行时、BYOK 云端提供商，并且没有 Viezan 中继服务器。',
    },
    feat: [
      { title: '文本翻译',       desc: '支持 7 种语气风格 — 中立、友好、专业、商务、Slack、礼貌、技术。自动或手动模式。支持 19 种语言。', tag: '核心' },
      { title: '实时翻译',       desc: '来自麦克风或系统音频的实时字幕。可自定义字体大小、颜色和透明度的浮动叠加层。每次通话后 AI 会话总结。', tag: '实时' },
      { title: '图片翻译',       desc: '拖放或粘贴任意图片。AI 视觉提取并翻译所有文字 — 文档、截图、菜单、幻灯片 — 并支持下载结果。', tag: 'AI 视觉' },
      { title: 'AI 聊天',        desc: '功能齐全的 AI 聊天，支持图片附件、语音输入、自定义系统提示、预设模板、网页搜索和完整可搜索的聊天历史。', tag: '助手' },
      { title: '语音输入/输出',  desc: '通过 Web Speech API、OpenAI Whisper、Gemini STT 和 Groq 备用进行语音输入。Text-to-Speech 支持免费优先和高级提供商路径。', tag: '音频' },
      { title: '假名支持',       desc: '日语翻译自动添加假名注音。对日语学习者、BrSE 以及日常使用日文的人来说必不可少。', tag: '日语' },
      { title: '全局快捷键',     desc: '使用全局键盘快捷键从任何应用程序中呼出 Viezan。工作流程中途无需切换应用。', tag: '效率' },
      { title: '隐私优先',       desc: '提供商密钥存储在操作系统的凭据存储中，并且只由桌面应用使用。你和所选提供商之间没有 Viezan 托管的中继服务器。', tag: '安全' },
      { title: '设置弹窗',       desc: '设置重新设计为简洁弹出层 — 可从任何标签页即时访问 API 密钥和模型偏好，无需离开当前页面。', tag: 'UX' },
      { title: '音标模式',       desc: '纯音标转录模式 — 获取罗马音或音标而非完整翻译。非常适合发音学习和语言研究。', tag: '翻译' },
      { title: 'Chat 网页搜索',  desc: 'AI 聊天支持通过 Tavily 或 Brave 密钥进行可选实时网页搜索，并在可用时使用 Jina fallback。', tag: '聊天' },
      { title: '本地 AI 支持',   desc: '通过 Ollama、LM Studio 或 llama.cpp 进行翻译和聊天。测试硬件、下载推荐模型，并让数据保留在本机。', tag: '已可用' },
    ],
    screenshots: { label: '截图', title: '实际效果一览', sub: '点击任意卡片放大查看。使用方向键导航或在移动端滑动。' },
    story: {
      label: '背后故事',
      h2: '由一位 BrSE 打造，<br>为整个团队服务',
      p1: '作为日本产品公司的 BrSE/PM，我目睹了信息在翻译链中丢失的情景 — IT Comtor、BA、BrSE 层层传递上下文，直到原意消失，浪费了数小时的额外会议。',
      p2: '秉承<strong>"工夫"</strong>精神 — 总是寻找改进方法 — 我构建了 Viezan：一款让所有人通过 AI 翻译直接沟通的工具，无需中间人。',
      p3: '应用采用 <strong>local-first</strong> 设计。它可以直接调用本地运行时，也可以使用你的密钥调用提供商 API。你和所选提供商之间没有 Viezan 中继服务器。',
    },
    highlights: [
      { title: '支持 19 种语言',    desc: '从越南语、日语、英语到韩语、中文、法语等更多语言。' },
      { title: '3 种界面语言',      desc: '界面支持越南语、英语和日语 — 包含自动深色模式。' },
      { title: '智能模型建议',      desc: 'Viezan 自动为每种任务类型推荐最佳 AI 模型。' },
      { title: '100% 免费下载',     desc: '无需订阅。您只需为选择的 AI API 调用付费。' },
      { title: '本地 AI 已可用',    desc: '使用 Ollama、LM Studio 或 llama.cpp 进行私密、免 API 密钥的本地翻译和聊天。' },
    ],
    download: {
      label: '下载', title: '免费获取 Viezan',
      sub: '适用于 macOS、Windows 和 Linux。无需账户。几分钟内开始翻译。',
      mac_btn: '⬇ 下载 .dmg', win_btn: '⬇ 下载 .exe', linux_btn: '⬇ 下载 .AppImage',
      warning: '⚠️ 由于应用尚未签名/公证，macOS 可能会阻止打开。请在 System Settings → Privacy & Security → Open Anyway 中允许，或查看 README 中针对可信下载的 Terminal 备用命令。<a href="https://github.com/trunghieupham59/Viezan#readme" style="color:var(--accent)" target="_blank">查看说明 →</a>',
    },
    support: {
      label: '支持', h2: '喜欢 Viezan？',
      p: 'Viezan 是免费的，在我的业余时间构建。如果它为您节省了时间或帮助团队更好沟通，一杯咖啡将在代码签名、改进本地 AI 和新功能方面大有帮助。☕',
      btn: '☕ 通过 Momo 请我喝咖啡', github: '★ 在 GitHub 上给星', bug: '🐛 报告错误', changelog: '📋 更新日志',
    },
    footer: {
      github: 'GitHub', releases: '发布版本', issues: '问题反馈', coffee: '请我喝咖啡 ☕',
      made: '用 ❤️ 和 工夫 制作，作者 <a href="https://github.com/trunghieupham59" target="_blank">trunghieupham59</a> · <a href="https://github.com/trunghieupham59/viezan?tab=MIT-1-ov-file" target="_blank">MIT 许可证</a>',
    },
  },

  /* ── Japanese ── */
  jp: {
    nav: { features: '機能', screenshots: 'スクショ', about: '概要', download: 'DL', support: '☕ サポート' },
    hero: {
      badge: '無料 & オープンソース',
      h1: '<span class="brand">AI 翻訳</span><br><span class="dim">実務のために</span>作られた',
      sub: 'テキスト、ライブ音声、画像、ブラウザ翻訳、AI チャットを 1 つの <strong>local-first</strong> デスクトップアプリに統合。Local AI または自分のクラウドプロバイダーキーを使えます。',
      btn_download: '⬇ 無料ダウンロード',
      btn_screenshots: '🖼 スクリーンショット',
      btn_github: '★ GitHub',
      platform_mac: 'macOS',
      platform_win: 'Windows',
      platform_linux: 'Linux',
    },
    providers: { label: 'ローカルランタイムと BYOK クラウドプロバイダーに対応' },
    features: {
      label: '機能',
      title: '言語の壁を超えて<br>コミュニケーション',
      sub: 'Viezan は翻訳スイートを 1 つのデスクトップアプリに統合。ローカルランタイム、BYOK クラウドプロバイダーに対応し、Viezan の中継サーバーはありません。',
    },
    feat: [
      { title: 'テキスト翻訳',          desc: '7 つのトーンスタイル — ニュートラル、フレンドリー、プロフェッショナル、ビジネス、Slack、丁寧、テクニカル。自動または手動モード。19 言語対応。', tag: 'コア' },
      { title: 'ライブ翻訳',            desc: 'マイクまたはシステムオーディオからのリアルタイム字幕。カスタムフォントサイズ、色、透明度のフローティングオーバーレイ。各通話後の AI セッションサマリー。', tag: 'リアルタイム' },
      { title: '画像翻訳',              desc: '任意の画像をドラッグ＆ドロップまたは貼り付け。AI Vision がすべてのテキストを抽出・翻訳 — ドキュメント、スクリーンショット、メニュー、スライド。', tag: 'AI Vision' },
      { title: 'AI チャット',           desc: '画像添付、音声入力、カスタムシステムプロンプト、プリセットテンプレート、ウェブ検索、検索可能な完全なチャット履歴を備えたフル機能 AI チャット。', tag: 'アシスタント' },
      { title: '音声 I/O',              desc: 'Web Speech API、OpenAI Whisper、Gemini STT、Groq フォールバックによる音声入力。Text-to-Speech は無料優先とプレミアムプロバイダーの経路に対応。', tag: 'オーディオ' },
      { title: 'ふりがなサポート',       desc: '日本語翻訳に自動ふりがなオーバーレイ。学習者、BrSE、日本語テキストを日常的に扱う方に必須。', tag: '日本語' },
      { title: 'グローバルホットキー',   desc: 'グローバルキーボードショートカットで任意のアプリから Viezan を呼び出し。ワークフロー中にアプリを切り替える必要なし。', tag: '生産性' },
      { title: 'プライバシー第一',       desc: 'プロバイダーキーは OS の資格情報ストアに保存され、デスクトップアプリだけが使用します。あなたと選択したプロバイダーの間に Viezan の中継サーバーはありません。', tag: 'セキュリティ' },
      { title: '設定モーダル',          desc: '設定をクリーンなポップアップオーバーレイに刷新 — どのタブからでも即座に API キーとモデル設定にアクセス。コンテキストを失わない。', tag: 'UX' },
      { title: 'フォネティックモード',   desc: '純粋な音声転写モード — 完全な翻訳の代わりにローマ字や音声表記を取得。発音学習や語学研究に最適。', tag: '翻訳' },
      { title: 'チャットでウェブ検索',   desc: 'Tavily または Brave キーによる任意のリアルタイムウェブ検索に対応し、利用可能な場合は Jina fallback も使います。', tag: 'チャット' },
      { title: 'ローカル AI サポート',   desc: 'Ollama、LM Studio、llama.cpp で翻訳とチャットを実行。ハードウェアを測定し、推奨モデルをダウンロードして、作業を完全にローカルに保ちます。', tag: '利用可能' },
    ],
    screenshots: { label: 'スクリーンショット', title: '実際の動作を見る', sub: 'カードをクリックしてズームイン。矢印キーでナビゲートまたはモバイルでスワイプ。' },
    story: {
      label: 'ストーリー',
      h2: 'BrSE が作った、<br>チーム全員のためのツール',
      p1: '日本のプロダクト会社で BrSE/PM として働く中、IT Comtor、BA、BrSE が文脈を伝言ゲームのように伝える翻訳チェーンで情報が失われていくのを目の当たりにしました。その結果、余分な会議に何時間も費やすことになっていました。',
      p2: '<strong>「工夫」</strong>の精神 — 常に改善策を見つける — に従い、中間者不要で誰もが AI 翻訳で直接コミュニケーションできる Viezan を作りました。',
      p3: 'アプリは <strong>local-first</strong> です。ローカルランタイムを直接呼び出すことも、あなたのキーでプロバイダー API を呼び出すこともできます。あなたと選択したプロバイダーの間に Viezan の中継サーバーはありません。',
    },
    highlights: [
      { title: '19 言語対応',             desc: 'ベトナム語、日本語、英語から韓国語、中国語、フランス語など。' },
      { title: '3 つの UI 言語',          desc: 'ベトナム語、英語、日本語のインターフェース — 自動ダークモード付き。' },
      { title: 'スマートモデル提案',       desc: 'Viezan が各タスクに最適な AI モデルを自動で推薦。' },
      { title: '100% 無料ダウンロード',    desc: 'サブスクリプション不要。選択した AI API 呼び出し分のみお支払い。' },
      { title: 'ローカル AI 利用可能',     desc: 'Ollama、LM Studio、llama.cpp で、API キー不要のプライベートなローカル翻訳とチャットを利用できます。' },
    ],
    download: {
      label: 'ダウンロード', title: 'Viezan を無料で入手',
      sub: 'macOS、Windows および Linux で利用可能。アカウント不要。数分で翻訳開始。',
      mac_btn: '⬇ .dmg をダウンロード', win_btn: '⬇ .exe をダウンロード', linux_btn: '⬇ .AppImage をダウンロード',
      warning: '⚠️ アプリはまだ署名/公証されていないため、macOS がブロックする場合があります。System Settings → Privacy & Security → Open Anyway を使うか、信頼できるダウンロードの場合は README の Terminal fallback を確認してください。<a href="https://github.com/trunghieupham59/Viezan#readme" style="color:var(--accent)" target="_blank">手順を見る →</a>',
    },
    support: {
      label: 'サポート', h2: 'Viezan を気に入っていますか？',
      p: 'Viezan は無料で、余暇に作られています。時間を節約したり、チームのコミュニケーションに役立てているなら、コーヒー一杯がコード署名、ローカル AI の改善、新機能への大きな力になります。☕',
      btn: '☕ Momo でコーヒーを買ってください', github: '★ GitHub でスター', bug: '🐛 バグを報告', changelog: '📋 変更履歴',
    },
    footer: {
      github: 'GitHub', releases: 'リリース', issues: 'イシュー', coffee: 'コーヒーを買ってください ☕',
      made: '❤️ と 工夫 を込めて <a href="https://github.com/trunghieupham59" target="_blank">trunghieupham59</a> が作成 · <a href="https://github.com/trunghieupham59/viezan?tab=MIT-1-ov-file" target="_blank">MIT ライセンス</a>',
    },
  },

  /* ── French ── */
  fr: {
    nav: { features: 'Fonctions', screenshots: 'Captures', about: 'À propos', download: 'Télécharger', support: '☕ Soutenir' },
    hero: {
      badge: 'Gratuit & Open Source',
      h1: '<span class="brand">Traduction IA</span><br><span class="dim">Conçu pour</span> le travail réel',
      sub: 'Texte, audio en direct, images, traduction navigateur et chat IA dans une application desktop <strong>local-first</strong>. Utilisez Local AI ou vos propres clés de fournisseurs cloud.',
      btn_download: '⬇ Télécharger gratuitement',
      btn_screenshots: '🖼 Voir les captures',
      btn_github: '★ GitHub',
      platform_mac: 'macOS',
      platform_win: 'Windows',
      platform_linux: 'Linux',
    },
    providers: { label: 'Propulsé par des runtimes locaux et des fournisseurs cloud BYOK' },
    features: {
      label: 'Fonctionnalités',
      title: 'Tout ce dont vous avez besoin<br>pour communiquer sans barrières',
      sub: 'Viezan regroupe une suite de traduction complète dans une application desktop : runtimes locaux, fournisseurs cloud BYOK, sans serveur relais Viezan.',
    },
    feat: [
      { title: 'Traduction de texte',        desc: 'Traduisez avec 7 styles de ton — Neutre, Amical, Professionnel, Business, Slack, Poli, Technique. Mode automatique ou manuel. 19 langues supportées.', tag: 'Essentiel' },
      { title: 'Traduction en direct',       desc: 'Sous-titres en temps réel depuis le microphone ou l\'audio système. Overlay flottant avec taille de police, couleur et opacité personnalisables. Résumé de session IA après chaque appel.', tag: 'Temps réel' },
      { title: 'Traduction d\'images',       desc: 'Glissez-déposez ou collez n\'importe quelle image. L\'IA Vision extrait et traduit tout le texte — documents, captures, menus, diapositives — et permet de télécharger le résultat.', tag: 'IA Vision' },
      { title: 'Chat IA',                    desc: 'Chat IA complet avec pièces jointes d\'images, saisie vocale, Prompts Système personnalisés, modèles prédéfinis, recherche web et historique de chat complet et consultable.', tag: 'Assistant' },
      { title: 'E/S vocale',                 desc: 'Saisie vocale via Web Speech API, OpenAI Whisper, Gemini STT et fallback Groq. La synthèse vocale propose des chemins gratuits d\'abord et des fournisseurs premium.', tag: 'Audio' },
      { title: 'Support Furigana',           desc: 'Overlay furigana automatique sur les traductions japonaises. Indispensable pour les apprenants, BrSE et tous ceux qui travaillent quotidiennement avec du texte japonais.', tag: 'Japonais' },
      { title: 'Raccourci global',           desc: 'Invoquez Viezan depuis n\'importe quelle application avec un raccourci clavier global. Pas besoin de changer d\'application en plein travail.', tag: 'Productivité' },
      { title: 'Confidentialité avant tout', desc: 'Les clés fournisseurs sont stockées dans le gestionnaire d’identifiants du système et utilisées uniquement par l\'application desktop. Aucun serveur relais Viezan ne se place entre vous et le fournisseur choisi.', tag: 'Sécurité' },
      { title: 'Fenêtre Paramètres',         desc: 'Les paramètres redessinés en popup overlay — accédez aux clés API, préférences de modèle instantanément depuis n\'importe quel onglet.', tag: 'UX' },
      { title: 'Mode Phonétique',            desc: 'Mode de transcription phonétique pure — obtenez la romanisation ou la phonétique au lieu d\'une traduction complète. Parfait pour l\'apprentissage de la prononciation.', tag: 'Traduction' },
      { title: 'Recherche Web dans le Chat', desc: 'Chat IA avec recherche web optionnelle via des clés Tavily ou Brave, plus un chemin Jina fallback lorsqu\'il est disponible.', tag: 'Chat' },
      { title: 'Support IA local',           desc: 'Traduisez et chattez via Ollama, LM Studio ou llama.cpp. Évaluez votre matériel, téléchargez des modèles recommandés et gardez tout en local.', tag: 'Disponible' },
    ],
    screenshots: { label: 'Captures d\'écran', title: 'Voyez-le en action', sub: 'Cliquez sur une carte pour zoomer. Naviguez avec les touches directionnelles ou glissez sur mobile.' },
    story: {
      label: 'L\'histoire',
      h2: 'Créé par un BrSE,<br>pour toute l\'équipe',
      p1: 'En travaillant comme BrSE/PM dans une entreprise de produits japonaise, j\'ai vu des informations se perdre dans des chaînes de traduction — IT Comtors, BAs, BrSEs se passant le contexte jusqu\'à ce que le sens original disparaisse, coûtant des heures de réunions supplémentaires.',
      p2: 'Dans l\'esprit de <strong>"工夫"</strong> — toujours trouver un moyen de s\'améliorer — j\'ai construit Viezan : un outil permettant à chacun de communiquer directement avec la traduction IA, sans intermédiaire.',
      p3: 'L\'application est <strong>local-first</strong>. Elle peut appeler des runtimes locaux directement ou des API fournisseurs avec vos propres clés. Aucun serveur relais Viezan ne se place entre vous et le fournisseur choisi.',
    },
    highlights: [
      { title: '19 langues supportées',              desc: 'Du vietnamien, japonais, anglais au coréen, chinois, français et plus encore.' },
      { title: '3 langues d\'interface',             desc: 'Interface disponible en vietnamien, anglais et japonais — mode sombre automatique inclus.' },
      { title: 'Suggestions de modèles intelligentes', desc: 'Viezan recommande automatiquement le meilleur modèle IA pour chaque type de tâche.' },
      { title: '100% gratuit à télécharger',         desc: 'Aucun abonnement. Vous ne payez que pour les appels API IA que vous choisissez d\'effectuer.' },
      { title: 'IA locale disponible',               desc: 'Utilisez Ollama, LM Studio ou llama.cpp pour une traduction et un chat locaux, privés et sans clé API.' },
    ],
    download: {
      label: 'Télécharger', title: 'Obtenez Viezan gratuitement',
      sub: 'Disponible pour macOS, Windows et Linux. Aucun compte requis. Commencez à traduire en quelques minutes.',
      mac_btn: '⬇ Télécharger .dmg', win_btn: '⬇ Télécharger .exe', linux_btn: '⬇ Télécharger .AppImage',
      warning: '⚠️ macOS peut bloquer l\'application car elle n\'est pas encore signée/notariée. Utilisez System Settings → Privacy & Security → Open Anyway, ou consultez le README pour le fallback Terminal avec un téléchargement de confiance. <a href="https://github.com/trunghieupham59/Viezan#readme" style="color:var(--accent)" target="_blank">Voir les instructions →</a>',
    },
    support: {
      label: 'Soutien', h2: 'Vous appréciez Viezan ?',
      p: 'Viezan est gratuit et développé sur mon temps libre. S\'il vous fait gagner du temps ou aide votre équipe à mieux communiquer, un café contribue à la signature de code, à l\'amélioration de l\'IA locale et aux nouvelles fonctionnalités. ☕',
      btn: '☕ Offrez-moi un café via Momo', github: '★ Star sur GitHub', bug: '🐛 Signaler un bug', changelog: '📋 Journal des modifications',
    },
    footer: {
      github: 'GitHub', releases: 'Versions', issues: 'Problèmes', coffee: 'Offrez-moi un café ☕',
      made: 'Fait avec ❤️ et 工夫 par <a href="https://github.com/trunghieupham59" target="_blank">trunghieupham59</a> · <a href="https://github.com/trunghieupham59/viezan?tab=MIT-1-ov-file" target="_blank">Licence MIT</a>',
    },
  },

  /* ── Korean ── */
  kr: {
    nav: { features: '기능', screenshots: '스크린샷', about: '소개', download: '다운로드', support: '☕ 후원' },
    hero: {
      badge: '무료 & 오픈소스',
      h1: '<span class="brand">AI 번역</span><br><span class="dim">실제 업무를 위해</span> 제작됨',
      sub: '텍스트, 라이브 오디오, 이미지, 브라우저 번역, AI 채팅을 하나의 <strong>local-first</strong> 데스크톱 앱에서 사용하세요. Local AI 또는 직접 연결한 클라우드 제공업체 키를 사용할 수 있습니다.',
      btn_download: '⬇ 무료 다운로드',
      btn_screenshots: '🖼 스크린샷 보기',
      btn_github: '★ GitHub',
      platform_mac: 'macOS',
      platform_win: 'Windows',
      platform_linux: 'Linux',
    },
    providers: { label: '로컬 런타임과 BYOK 클라우드 제공업체 지원' },
    features: {
      label: '기능',
      title: '언어 장벽 없이<br>소통하기 위한 모든 것',
      sub: 'Viezan은 번역 스위트를 하나의 데스크톱 앱에 담았습니다. 로컬 런타임, BYOK 클라우드 제공업체를 지원하며 Viezan 릴레이 서버는 없습니다.',
    },
    feat: [
      { title: '텍스트 번역',        desc: '7가지 톤 스타일로 번역 — 중립, 친근, 전문, 비즈니스, Slack, 정중, 기술. 자동 또는 수동 모드. 19개 언어 지원.', tag: '핵심' },
      { title: '실시간 번역',        desc: '마이크 또는 시스템 오디오에서 실시간 자막. 사용자 정의 글꼴 크기, 색상 및 투명도의 플로팅 오버레이. 각 통화 후 AI 세션 요약.', tag: '실시간' },
      { title: '이미지 번역',        desc: '이미지를 드래그 앤 드롭하거나 붙여넣기. AI Vision이 모든 텍스트를 추출하고 번역 — 문서, 스크린샷, 메뉴, 슬라이드 — 결과 다운로드 가능.', tag: 'AI Vision' },
      { title: 'AI 채팅',            desc: '이미지 첨부, 음성 입력, 사용자 정의 시스템 프롬프트, 프리셋 템플릿, 웹 검색, 완전한 검색 가능한 채팅 기록을 갖춘 완전한 AI 채팅.', tag: '어시스턴트' },
      { title: '음성 I/O',           desc: 'Web Speech API, OpenAI Whisper, Gemini STT, Groq 폴백을 통한 음성 입력. Text-to-Speech는 무료 우선 경로와 프리미엄 제공업체 경로를 지원합니다.', tag: '오디오' },
      { title: '후리가나 지원',       desc: '일본어 번역에 자동 후리가나 오버레이. 학습자, BrSE, 일본어 텍스트를 매일 다루는 모든 분에게 필수.', tag: '일본어' },
      { title: '글로벌 단축키',      desc: '글로벌 키보드 단축키로 모든 애플리케이션에서 Viezan 호출. 작업 중 앱 전환 불필요.', tag: '생산성' },
      { title: '개인정보 우선',      desc: '제공업체 키는 운영체제의 자격 증명 저장소에 보관되며 데스크톱 앱에서만 사용됩니다. 사용자와 선택한 제공업체 사이에 Viezan 릴레이 서버가 없습니다.', tag: '보안' },
      { title: '설정 모달',          desc: '설정이 깔끔한 팝업 오버레이로 재설계 — 어떤 탭에서든 API 키, 모델 기본 설정에 즉시 접근. 컨텍스트 유지.', tag: 'UX' },
      { title: '발음 표기 모드',      desc: '순수 음성 전사 모드 — 완전한 번역 대신 로마자나 발음 기호를 받아보세요. 발음 학습과 언어 연구에 완벽합니다.', tag: '번역' },
      { title: 'Chat 웹 검색',       desc: 'Tavily 또는 Brave 키를 통한 선택적 실시간 웹 검색과 사용 가능한 경우 Jina fallback 경로를 지원합니다.', tag: '채팅' },
      { title: '로컬 AI 지원',       desc: 'Ollama, LM Studio 또는 llama.cpp로 번역과 채팅을 실행합니다. 하드웨어를 벤치마크하고 추천 모델을 다운로드하며 작업을 로컬에 유지합니다.', tag: '사용 가능' },
    ],
    screenshots: { label: '스크린샷', title: '실제 작동 모습', sub: '카드를 클릭하면 확대됩니다. 화살표 키로 탐색하거나 모바일에서 스와이프하세요.' },
    story: {
      label: '스토리',
      h2: 'BrSE가 만든,<br>팀 전체를 위한 도구',
      p1: '일본 제품 회사에서 BrSE/PM으로 일하면서 IT Comtor, BA, BrSE가 문맥을 전달하다 원래 의미가 사라지고 추가 회의에 몇 시간을 낭비하는 번역 체인에서 정보가 손실되는 것을 목격했습니다.',
      p2: '<strong>"工夫"</strong> 정신 — 항상 개선 방법을 찾는 — 에 따라 중간자 없이 AI 번역으로 직접 소통할 수 있는 도구 Viezan을 만들었습니다.',
      p3: '앱은 <strong>local-first</strong>입니다. 로컬 런타임을 직접 호출하거나 사용자의 키로 제공업체 API를 호출할 수 있습니다. 사용자와 선택한 제공업체 사이에 Viezan 릴레이 서버는 없습니다.',
    },
    highlights: [
      { title: '19개 언어 지원',     desc: '베트남어, 일본어, 영어에서 한국어, 중국어, 프랑스어 등 더 많은 언어.' },
      { title: '3개 UI 언어',        desc: '베트남어, 영어, 일본어 인터페이스 — 자동 다크 모드 포함.' },
      { title: '스마트 모델 제안',    desc: 'Viezan이 각 작업 유형에 가장 적합한 AI 모델을 자동으로 추천합니다.' },
      { title: '100% 무료 다운로드', desc: '구독 없음. 선택한 AI API 호출 비용만 지불합니다.' },
      { title: '로컬 AI 사용 가능',  desc: 'Ollama, LM Studio 또는 llama.cpp로 비공개, 키 없는 로컬 번역과 채팅을 사용할 수 있습니다.' },
    ],
    download: {
      label: '다운로드', title: '무료로 Viezan 받기',
      sub: 'macOS, Windows 및 Linux에서 사용 가능. 계정 불필요. 몇 분 안에 번역 시작.',
      mac_btn: '⬇ .dmg 다운로드', win_btn: '⬇ .exe 다운로드', linux_btn: '⬇ .AppImage 다운로드',
      warning: '⚠️ 앱이 아직 서명/공증되지 않아 macOS가 차단할 수 있습니다. System Settings → Privacy & Security → Open Anyway를 사용하거나, 신뢰한 다운로드라면 README의 Terminal fallback을 확인하세요. <a href="https://github.com/trunghieupham59/Viezan#readme" style="color:var(--accent)" target="_blank">안내 보기 →</a>',
    },
    support: {
      label: '후원', h2: 'Viezan이 마음에 드시나요?',
      p: 'Viezan은 무료이며 여가 시간에 만들어졌습니다. 시간을 절약하거나 팀의 소통에 도움이 된다면 커피 한 잔이 코드 서명, 로컬 AI 개선, 새 기능에 큰 도움이 됩니다. ☕',
      btn: '☕ Momo로 커피 사주기', github: '★ GitHub에서 스타', bug: '🐛 버그 신고', changelog: '📋 변경 로그',
    },
    footer: {
      github: 'GitHub', releases: '릴리스', issues: '이슈', coffee: '커피 사주기 ☕',
      made: '❤️ 와 工夫 으로 <a href="https://github.com/trunghieupham59" target="_blank">trunghieupham59</a> 제작 · <a href="https://github.com/trunghieupham59/viezan?tab=MIT-1-ov-file" target="_blank">MIT 라이선스</a>',
    },
  },
};

/* ══════════════════════════════════════════════════════════════
   I18N ENGINE
══════════════════════════════════════════════════════════════ */
function setLang(lang) {
  if (!TRANSLATIONS[lang]) return;
  const t = TRANSLATIONS[lang];

  /* helper: safe nested key access */
  const g = (obj, path) => path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);

  /* simple text nodes */
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const val = g(t, el.dataset.i18n);
    if (val !== undefined) el.textContent = val;
  });

  /* nodes that contain HTML (bold, br, links…) */
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const val = g(t, el.dataset.i18nHtml);
    if (val !== undefined) el.innerHTML = val;
  });

  /* feature cards */
  document.querySelectorAll('[data-feat]').forEach(card => {
    const idx = parseInt(card.dataset.feat, 10);
    const f   = t.feat[idx];
    if (!f) return;
    const h3  = card.querySelector('h3');
    const p   = card.querySelector('p');
    const tag = card.querySelector('.feature-tag');
    if (h3)  h3.textContent  = f.title;
    if (p)   p.textContent   = f.desc;
    if (tag) tag.textContent = f.tag;
  });

  /* highlight items */
  document.querySelectorAll('[data-highlight]').forEach(item => {
    const idx = parseInt(item.dataset.highlight, 10);
    const h   = t.highlights[idx];
    if (!h) return;
    const h4 = item.querySelector('h4');
    const p  = item.querySelector('p');
    if (h4) h4.textContent = h.title;
    if (p)  p.textContent  = h.desc;
  });

  /* download buttons */
  const dlMac   = document.getElementById('dl-mac');
  const dlWin   = document.getElementById('dl-win');
  const dlLinux = document.getElementById('dl-linux');
  if (dlMac)   dlMac.textContent   = t.download.mac_btn;
  if (dlWin)   dlWin.textContent   = t.download.win_btn;
  if (dlLinux) dlLinux.textContent = t.download.linux_btn;

  /* active lang button */
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });

  /* persist */
  try { localStorage.setItem('viezan-lang', lang); } catch (_) {}
}

/* ══════════════════════════════════════════════════════════════
   CAROUSEL
══════════════════════════════════════════════════════════════ */
const IMAGES = [
  'screenshots/1.png',
  'screenshots/1.1.png',
  'screenshots/2.png',
  'screenshots/2.1.png',
  'screenshots/3.png',
  'screenshots/3.1.png',
  'screenshots/3.2.png',
  'screenshots/4.png',
  'screenshots/4.1.png',
  'screenshots/4.2.png',
  'screenshots/5.png',
  'screenshots/5.1.png',
  'screenshots/5.2.png',
  'screenshots/5.3.png',
  'screenshots/5.4.png',
  'screenshots/5.5.png',
  'screenshots/5.6.png',
  'screenshots/5.7.png',
];
const COUNT  = IMAGES.length;

const sliderEl  = document.getElementById('slider');
const dotsEl    = document.getElementById('dots');
const lightbox  = document.getElementById('lightbox');
const lbImg     = document.getElementById('lbImg');
const lbCounter = document.getElementById('lbCounter');

let current = 0;
let autoTimer;

function openLightbox(idx) {
  lbImg.src = IMAGES[idx];
  lbCounter.textContent = `${idx + 1} / ${COUNT}`;
  lightbox.classList.add('open');
  clearInterval(autoTimer);
}
function closeLightbox() {
  lightbox.classList.remove('open');
  startTimer();
}

document.getElementById('lbClose').addEventListener('click', closeLightbox);
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });

IMAGES.forEach((src, i) => {
  const slide = document.createElement('div');
  slide.className = 'slide';
  slide.innerHTML = `<img src="${src}" alt="Screenshot ${i + 1}" loading="lazy">`;
  slide.addEventListener('click', () => {
    if (i === current) { openLightbox(i); }
    else { resetTimer(); goTo(i); }
  });
  sliderEl.appendChild(slide);

  const dot = document.createElement('div');
  dot.className = 'dot';
  dot.addEventListener('click', () => goTo(i));
  dotsEl.appendChild(dot);
});

const slides = sliderEl.querySelectorAll('.slide');
const dotEls = dotsEl.querySelectorAll('.dot');

function layout(active) {
  slides.forEach((slide, i) => {
    const offset  = i - active;
    const wrapped = ((offset + COUNT + Math.round(COUNT / 2)) % COUNT) - Math.round(COUNT / 2);
    const absOff  = Math.abs(wrapped);
    const sign    = wrapped === 0 ? 0 : wrapped / absOff;

    if (absOff > 2) { slide.style.opacity = '0'; slide.style.pointerEvents = 'none'; return; }

    slide.style.opacity       = absOff === 0 ? '1' : absOff === 1 ? '0.6' : '0.3';
    slide.style.filter        = `brightness(${absOff === 0 ? 1 : absOff === 1 ? 0.65 : 0.4})`;
    slide.style.pointerEvents = 'auto';
    slide.style.zIndex        = String(10 - absOff);

    const tx    = sign * (absOff === 1 ? 460 : 760);
    const tz    = absOff === 0 ? 0 : absOff === 1 ? -280 : -500;
    const ry    = sign * (absOff === 1 ? 38 : 50);
    const scale = absOff === 0 ? 1 : absOff === 1 ? 0.72 : 0.52;

    slide.style.transform = `translateX(${tx}px) translateZ(${tz}px) rotateY(${ry}deg) scale(${scale})`;
  });
  dotEls.forEach((d, i) => {
    d.classList.toggle('active', i === active);
  });
}

function goTo(idx)    { current = ((idx % COUNT) + COUNT) % COUNT; layout(current); }
function startTimer() { autoTimer = setInterval(() => goTo(current + 1), 3500); }
function resetTimer() { clearInterval(autoTimer); startTimer(); }

document.getElementById('prev').addEventListener('click', () => { resetTimer(); goTo(current - 1); });
document.getElementById('next').addEventListener('click', () => { resetTimer(); goTo(current + 1); });

document.addEventListener('keydown', e => {
  if (lightbox.classList.contains('open')) { if (e.key === 'Escape') closeLightbox(); return; }
  if (e.key === 'ArrowLeft')  { resetTimer(); goTo(current - 1); }
  if (e.key === 'ArrowRight') { resetTimer(); goTo(current + 1); }
});

let touchX = 0;
document.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; });
document.addEventListener('touchend',   e => {
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 40) { resetTimer(); goTo(current + (dx < 0 ? 1 : -1)); }
});

layout(0);
startTimer();

/* ══════════════════════════════════════════════════════════════
   SCROLL REVEAL
══════════════════════════════════════════════════════════════ */
const revealEls = document.querySelectorAll('.reveal');
const io = new IntersectionObserver(entries => {
  entries.forEach(en => {
    if (en.isIntersecting) { en.target.classList.add('visible'); io.unobserve(en.target); }
  });
}, { threshold: 0.12 });
revealEls.forEach(el => {
  io.observe(el);
});

/* ══════════════════════════════════════════════════════════════
   FEATURE CARD MOUSE GLOW
══════════════════════════════════════════════════════════════ */
document.querySelectorAll('.feature-card').forEach(card => {
  card.addEventListener('mousemove', e => {
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left)  / rect.width  * 100).toFixed(1);
    const y = ((e.clientY - rect.top)   / rect.height * 100).toFixed(1);
    card.style.setProperty('--mx', `${x}%`);
    card.style.setProperty('--my', `${y}%`);
  });
});

/* ══════════════════════════════════════════════════════════════
   LANG SWITCHER INIT
══════════════════════════════════════════════════════════════ */
document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => setLang(btn.dataset.lang));
});

/* restore saved lang or detect browser lang */
(function initLang() {
  let saved;
  try { saved = localStorage.getItem('viezan-lang'); } catch (_) {}
  if (saved && TRANSLATIONS[saved]) { setLang(saved); return; }
  const browser = (navigator.language || 'en').toLowerCase().slice(0, 2);
  const map = { vi: 'vi', zh: 'cn', ja: 'jp', fr: 'fr', ko: 'kr' };
  setLang(map[browser] || 'en');
})();

/* ══════════════════════════════════════════════════════════════
   THEME TOGGLE (Dark / Light)
══════════════════════════════════════════════════════════════ */
const themeToggleBtn = document.getElementById('themeToggle');
const htmlEl = document.documentElement;

function setTheme(theme) {
  htmlEl.setAttribute('data-theme', theme);
  if (themeToggleBtn) {
    themeToggleBtn.textContent = theme === 'light' ? '🌙' : '☀️';
    themeToggleBtn.title = theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
  }
  try { localStorage.setItem('viezan-theme', theme); } catch (_) {}
}

(function initTheme() {
  let saved;
  try { saved = localStorage.getItem('viezan-theme'); } catch (_) {}
  if (saved === 'light' || saved === 'dark') { setTheme(saved); return; }
  /* default: dark */
  setTheme('dark');
})();

if (themeToggleBtn) {
  themeToggleBtn.addEventListener('click', () => {
    const current = htmlEl.getAttribute('data-theme') || 'dark';
    setTheme(current === 'dark' ? 'light' : 'dark');
  });
}
