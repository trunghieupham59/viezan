# VIEZAN — Trợ Lý Dịch Thuật AI Cho Máy Tính

## Câu Chuyện Ra Đời

Mình làm BrSE/PM cho công ty product Nhật Bản. Việc quá dựa vào dịch thuật của IT Comtor, BA hoặc BrSE khiến dev cảm thấy mơ hồ, khó hiểu — thông tin bị tam sao thất bổn, ngữ cảnh kỹ thuật bị mất đi, cả team mất thêm nhiều buổi họp chỉ để làm rõ một yêu cầu đáng lẽ đã rõ từ đầu.

Với tinh thần "工夫" — luôn tìm cách cải tiến — mình đã code (kết hợp vibe code) ra Viezan: bộ công cụ gồm Desktop App (macOS, Windows & Linux) kèm Chrome Extension, giúp mọi người dịch trực tiếp qua nhiều ngôn ngữ bằng AI mà không cần qua người trung gian. Với thời đại AI như hiện nay, mình mong ứng dụng này hỗ trợ được nhiều hơn cho anh chị em trong việc phiên dịch và chat trực tiếp với khách hàng hoặc cấp trên.

Từ bản 1.1.5, Viezan đã có Local AI: phát hiện Ollama, LM Studio hoặc llama.cpp, benchmark phần cứng, đề xuất model phù hợp và tải model qua Ollama ngay trong ứng dụng. Nhờ đó anh chị em có thể dịch và chat local không cần API key nếu công ty không cấp key hoặc muốn giữ dữ liệu trên máy. Vì kinh tế chưa cho phép nên chưa mua được code signing — nếu thấy sản phẩm hữu ích thì mình sẽ cân nhắc đầu tư thêm.

Sản phẩm chạy 100% local trên máy bạn. Mình chỉ dùng API của các provider để gọi model — không có server trung gian, không có dữ liệu nào đi qua hệ thống của mình.

---

## Tính Năng Chính

Viezan tích hợp Local AI và 3 nhà cung cấp AI lớn với nhiều model để lựa chọn: Local AI qua Ollama/LM Studio/llama.cpp, Google Gemini, Anthropic Claude và OpenAI GPT. Viezan tự động đề xuất model phù hợp nhất cho từng tác vụ, bạn chuyển đổi provider bất cứ lúc nào.

Dịch văn bản với 7 phong cách — Neutral, Friendly, Professional, Business, Slack, Polite, Technical — phù hợp từng bối cảnh giao tiếp từ tin nhắn team đến tài liệu kỹ thuật. Hỗ trợ Auto/Manual mode tùy thói quen.

Live Translation lắng nghe và dịch song song theo thời gian thực từ microphone hoặc system audio, kèm phụ đề nổi trên màn hình với tùy chỉnh màu sắc, cỡ chữ và độ trong suốt. Sau mỗi phiên có thể tóm tắt toàn bộ nội dung bằng AI.

Dịch ảnh bằng AI Vision: kéo thả hoặc dán ảnh vào, Viezan trích xuất và dịch toàn bộ văn bản trong ảnh, kết quả tải xuống ngay.

Voice Input hỗ trợ Web Speech API, OpenAI Whisper, Gemini STT và Groq Whisper fallback. Text-to-Speech có chuỗi fallback OpenAI, Gemini, Edge TTS và ElevenLabs.

AI Chat tích hợp hoàn chỉnh: đính kèm ảnh, voice input, System Prompt và preset lưu sẵn, lịch sử chat đầy đủ có thể mở lại bất cứ lúc nào.

Furigana tự động cho bản dịch tiếng Nhật — đặc biệt hữu ích cho ai đang học hoặc làm việc với tiếng Nhật hàng ngày. Lịch sử riêng cho Translate, Chat và Live session, có thể tìm kiếm và tái sử dụng bất cứ lúc nào.

Chrome Extension và Bookmarklet dịch trực tiếp trên trình duyệt không cần chuyển cửa sổ. Extension được đóng gói dạng ZIP để cài thủ công, hỗ trợ popup, right-click menu và phím tắt Alt+T. Global Hotkey kích hoạt Viezan từ bất kỳ ứng dụng nào.

API key mã hóa bằng Electron safeStorage — Keychain trên macOS, Credential Manager trên Windows — không ghi ra file, không qua bất kỳ server nào.

Hỗ trợ 19 ngôn ngữ. Giao diện Tiếng Việt, Anh và Nhật. Dark Mode tự động theo hệ thống.

---

Tải xuống miễn phí: https://github.com/trunghieupham59/Viezan/releases
