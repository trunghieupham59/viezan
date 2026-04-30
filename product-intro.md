VIEZAN — Công cụ dịch thuật AI local-first
Viezan là app dịch thuật AI cho macOS, Windows và Linux. App hỗ trợ dịch văn bản, dịch ảnh, phiên dịch trực tiếp, AI Chat và dịch trên trình duyệt.
Viezan không có server trung gian. Dữ liệu đi trực tiếp từ máy bạn tới Local AI runtime hoặc provider AI bạn chọn.
Vì Sao Có Viezan?
Mình làm BrSE/PM trong công ty product Nhật Bản. Trong công việc, thông tin kỹ thuật dễ bị lệch khi đi qua nhiều lớp dịch như dev, BA, BrSE, IT Comtor và khách hàng.
Viezan giúp mọi người tự dịch, tự hỏi AI và tự kiểm tra ngữ cảnh nhanh hơn. Tinh thần chính là "工夫": cải tiến công việc hằng ngày bằng công cụ thực dụng.
AI Provider
- Local AI: Ollama, LM Studio, llama.cpp.
- Cloud AI: OpenAI GPT, Anthropic Claude, Google Gemini.
- Local AI có thể phát hiện runtime, benchmark máy, đề xuất model và tải/gỡ model qua Ollama.
- `local-auto` tự chọn model local phù hợp với máy.
- Cloud provider dùng API key của chính bạn.
- API key được lưu trên máy, không đi qua server của Viezan.
 Tính Năng Chính
- **AI Dịch**: dịch 19 ngôn ngữ, auto-detect, Auto/Manual mode, 6 phong cách dịch, rewrite, đọc to và voice input.
- **Phiên âm**: hỗ trợ furigana, pinyin, romanization hoặc phiên âm thuần.
- **Dịch ảnh**: kéo thả, dán hoặc chọn ảnh; AI đọc chữ trong ảnh, dịch và tạo kết quả tải xuống.
- **AI Phiên Dịch Trực Tiếp**: nghe microphone, system audio hoặc cả hai; có STT, dịch streaming và phụ đề nổi.
- **Sau cuộc họp**: tóm tắt nội dung, trích xuất việc cần làm, quyết định chính, phân tích người nói và xuất `.txt` hoặc `.srt`.
- **Voice Input**: dùng OpenAI Whisper, Gemini STT hoặc Groq Whisper.
- **TTS**: có Microsoft Edge TTS miễn phí, fallback sang OpenAI, Gemini hoặc ElevenLabs nếu có key.
- **AI Chat**: chat theo phiên, streaming response, đính kèm ảnh, voice input, System Prompt, preset prompt và lịch sử chat.
- **Deep Research**: tìm kiếm web qua Tavily, Brave hoặc Jina fallback miễn phí.
- **Browser Translation**: dịch text trên web bằng extension, floating button, popup, context menu và phím tắt `Alt+T` / `Option+T`.
- **Lịch sử**: lưu riêng AI Dịch, AI Chat và AI Phiên Dịch; có tìm kiếm, dùng lại và xóa hàng loạt.
Bảo Mật Và Riêng Tư
- Không có Viezan-hosted relay server.
- Local AI chạy trên máy qua Ollama, LM Studio hoặc llama.cpp.
- Cloud request đi trực tiếp tới provider bạn chọn.
- API key được mã hóa bằng Electron safeStorage.
- Renderer và Chrome Extension không nhận raw API key.
- Extension kết nối app desktop qua `127.0.0.1:39875` bằng token `X-Viezan-Token`.
- Nội dung chỉ được gửi khi bạn chủ động dịch.
 Phù Hợp Với Ai?
- BrSE, PM, developer, QA, BA, IT Comtor.
- Người học ngoại ngữ hoặc làm việc với tài liệu đa ngôn ngữ.
- Team cần dịch nhanh chat, meeting, ticket, tài liệu kỹ thuật hoặc nội dung web.
- Người muốn dùng AI local khi không có API key hoặc muốn giữ dữ liệu trong máy.
Tải Xuống
- Viezan miễn phí và mã nguồn mở.
- Download: https://github.com/trunghieupham59/Viezan/releases
