# Tài liệu Kiến trúc TTS — my-translator

## Tổng quan

Dự án `my-translator` là một ứng dụng desktop Tauri v2 (Rust + Vanilla JS) dùng làm overlay dịch trực tiếp. Hệ thống TTS (Text-to-Speech) của nó hỗ trợ **4 nhà cung cấp**, tất cả đều chia sẻ một **interface thống nhất**, và âm thanh được phát qua một **AudioPlayer tập trung** dựa trên Web Audio API.

---

## Kiến trúc tổng thể

```
Bản dịch mới (text)
        │
        ▼
  app._speakIfEnabled(text)
        │
        ▼
  tts.speak(text)          ← Edge | Google | ElevenLabs | WebSpeech
        │
        ▼
  tts.onAudioChunk(base64, isFinal)
        │
        ▼
  audioPlayer.enqueue(base64)   ← Chỉ với Edge/Google/ElevenLabs
        │
        ▼
  Web Audio API (seamless queue playback)
```

---

## 1. Interface chung (Unified TTS Contract)

Tất cả 4 provider đều implement cùng một interface để `app.js` có thể hoán đổi chúng:

```js
class SomeTTS {
    // ── Cấu hình ──────────────────────────────────────────────
    configure({ apiKey, voiceId, voice, speed, ... }) { }

    // ── Vòng đời kết nối ──────────────────────────────────────
    connect()     { } // Khởi tạo kết nối / đánh dấu sẵn sàng
    disconnect()  { } // Dọn dẹp, hủy hàng đợi

    // ── Phát âm ───────────────────────────────────────────────
    speak(text)   { } // Thêm vào hàng đợi và phát

    // ── Callbacks (gán từ bên ngoài) ──────────────────────────
    onAudioChunk = (base64Audio, isFinal) => {}  // nhận base64 MP3
    onError      = (errorMsg) => {}              // lỗi
    onStatusChange = (status) => {}              // 'connecting'|'connected'|'disconnected'|'error'
}
```

**Cách app.js wire callbacks** (trong `init()`):
```js
// Tất cả provider dùng audioPlayer làm output chung
for (const tts of [elevenLabsTTS, edgeTTSRust, googleTTS]) {
    tts.onAudioChunk = (base64Audio, isFinal) => {
        audioPlayer.enqueue(base64Audio);
    };
    tts.onError = (error) => {
        console.error('[TTS]', error);
        this._showToast(error, 'error');
    };
}
// WebSpeech phát trực tiếp — không cần audioPlayer
```

---

## 2. Các Provider TTS

### 2.1 Edge TTS (Mặc định — Miễn phí)

**File:** `src/js/edge-tts.js` + `src-tauri/src/commands/edge_tts.rs`

**Đặc điểm:**
- **Miễn phí hoàn toàn** — không cần API key
- Chất lượng giọng nói **tự nhiên cao** (Microsoft Neural TTS)
- Rust backend proxy WebSocket để vượt qua giới hạn CORS của browser
- Output: **base64 MP3** (audio-24khz-48kbitrate-mono-mp3)
- Hàng đợi xử lý tuần tự (queue-based)

**Voice mặc định:** `vi-VN-HoaiMyNeural` (tiếng Việt nữ)

**Cách hoạt động (Frontend):**
```js
class EdgeTTSRust {
    speak(text) {
        this._queue.push(text.trim());
        if (!this._isSpeaking) this._processQueue();
    }

    async _processQueue() {
        const text = this._queue.shift();
        const base64Audio = await invoke('edge_tts_speak', {
            text,
            voice: this.voice,   // e.g. 'vi-VN-HoaiMyNeural'
            rate: this.speed,    // percentage: +20% default
        });
        this.onAudioChunk(base64Audio, true);
        this._processQueue(); // xử lý tiếp
    }
}
```

**Cách hoạt động (Rust Backend — `edge_tts.rs`):**

1. **Tạo token DRM** (`generate_sec_ms_gec()`):
   - Lấy Unix timestamp hiện tại
   - Chuyển về Windows File Time epoch (thêm 11,644,473,600)
   - Làm tròn xuống 5 phút (ticks % 300)
   - Hash SHA-256 của `{ticks_in_100ns}{TRUSTED_CLIENT_TOKEN}`
   - Trả về hex uppercase

2. **Kết nối WebSocket** tới `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1`
   - Thêm các headers cần thiết: `Origin`, `User-Agent` (Chrome/Edge), `Cookie: muid=...`

3. **Gửi 2 tin nhắn:**
   - `speech.config`: cấu hình output format MP3
   - `ssml`: SSML text với voice + rate

4. **Thu thập audio:**
   - Tin nhắn Binary: 2 bytes header length + header + **audio data**
   - Dừng khi nhận `Path:turn.end`

5. **Trả về base64** của toàn bộ audio data

**SSML format:**
```xml
<speak version='1.0' xmlns='...' xml:lang='en-US'>
  <voice name='vi-VN-HoaiMyNeural'>
    <prosody pitch='+0Hz' rate='+20%' volume='+0%'>
      Nội dung cần đọc
    </prosody>
  </voice>
</speak>
```

**Cargo dependencies cần thiết:**
```toml
tokio-tungstenite = { version = "0.24", features = ["native-tls"] }
sha2 = "0.10"
hex = "0.4"
base64 = "0.22"
uuid = { version = "1", features = ["v4"] }
rand = "0.8"
chrono = { version = "0.4", features = ["serde"] }
futures-util = "0.3"
```

---

### 2.2 Google Cloud TTS (Chirp 3 HD)

**File:** `src/js/google-tts.js`

**Đặc điểm:**
- **Chất lượng gần con người** nhất trong các provider
- Cần Google Cloud API key (1M chars/tháng miễn phí)
- Gọi trực tiếp REST API từ JS (không qua Rust)
- Hỗ trợ nhiều ngôn ngữ qua `VOICE_MAP`
- Output: **base64 MP3**

**Voice Map (tự động theo target language):**
```js
const VOICE_MAP = {
    'vi': { code: 'vi-VN', name: 'vi-VN-Chirp3-HD-Aoede' },
    'en': { code: 'en-US', name: 'en-US-Chirp3-HD-Kore' },
    'ja': { code: 'ja-JP', name: 'ja-JP-Chirp3-HD-Aoede' },
    'ko': { code: 'ko-KR', name: 'ko-KR-Chirp3-HD-Aoede' },
    'zh': { code: 'zh-CN', name: 'cmn-CN-Chirp3-HD-Aoede' },
    // fr, de, es...
};
```

**API Request:**
```js
fetch('https://texttospeech.googleapis.com/v1/text:synthesize?key={API_KEY}', {
    method: 'POST',
    body: JSON.stringify({
        input: { text },
        voice: { languageCode: 'vi-VN', name: 'vi-VN-Chirp3-HD-Aoede' },
        audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0 },
    }),
})
// Response: { audioContent: "base64mp3..." }
```

**Auto-select voice:**
```js
googleTTS.setTargetLanguage('vi');
// → tự set voice = 'vi-VN-Chirp3-HD-Aoede', languageCode = 'vi-VN'
```

---

### 2.3 ElevenLabs TTS (Premium — WebSocket Streaming)

**File:** `src/js/elevenlabs-tts.js`

**Đặc điểm:**
- **Chất lượng cao nhất**, giọng rất tự nhiên
- Cần ElevenLabs API key (có free tier)
- **WebSocket persistent connection** — low latency, streaming
- Model: `eleven_flash_v2_5` (ultra-low latency)
- Output format: `mp3_44100_128`
- **Auto-reconnect** (max 3 lần, delay tăng dần)
- **Đo TTFB** (Time to First Byte) cho mỗi request
- **BOS/EOS protocol**: gửi `" "` (BOS) khi mở, `""` (EOS) khi đóng

**URL kết nối:**
```
wss://api.elevenlabs.io/v1/text-to-speech/{voiceId}/stream-input
  ?model_id=eleven_flash_v2_5
  &output_format=mp3_44100_128
```

**Protocol:**
```
1. WebSocket OPEN
2. → BOS: { text: " ", voice_settings: {...}, xi_api_key: "..." }
3. → Text chunk: { text: "Nội dung + ", flush: true }
4. ← { audio: "base64mp3", isFinal: false }  // streaming chunks
5. ← { audio: "base64mp3", isFinal: true }   // cuối câu
6. → EOS: { text: "" }
7. WebSocket CLOSE
```

**Voice ID mặc định:** `FTYCiQT21H9XQvhRu0ch` (MinhTrung — giọng nam tiếng Việt)

**Xử lý queue khi đang connecting:**
```js
speak(text) {
    if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
        this._sendText(text);      // gửi ngay
    } else {
        this._textQueue.push(text); // queue
        if (!this.ws) this.connect(); // tự connect
    }
}
// Khi WS open: _flushQueue() → gửi hết queue
```

---

### 2.4 Web Speech TTS (Local — Miễn phí)

**File:** `src/js/web-speech-tts.js`

**Đặc điểm:**
- **Hoàn toàn cục bộ**, không cần internet
- Sử dụng `SpeechSynthesis` API của browser
- Dùng giọng hệ thống (macOS/Windows voices)
- **Không dùng audioPlayer** — phát trực tiếp
- `onAudioChunk` không được dùng

```js
speak(text) {
    const utterance = new SpeechSynthesisUtterance(text.trim());
    utterance.lang = 'vi-VN';
    utterance.rate = 1.2;
    utterance.voice = this.voice; // giọng tiếng Việt từ hệ thống
    speechSynthesis.speak(utterance);
}

// Lấy danh sách giọng tiếng Việt
static getVietnameseVoices() {
    return speechSynthesis.getVoices().filter(v => v.lang.startsWith('vi'));
}
```

---

## 3. AudioPlayer — Queue-based Web Audio API

**File:** `src/js/audio-player.js`

Đây là **trái tim** của hệ thống phát âm thanh. Nhận base64 MP3 chunks và phát **liền mạch** không bị ngắt quãng.

### Kiến trúc

```
base64 MP3 chunk
      │
      ▼
  atob() → Uint8Array
      │
      ▼
  AudioContext.decodeAudioData() → AudioBuffer
      │
      ▼
  _queue: AudioBuffer[]
      │
      ▼
  _scheduleNext() → AudioBufferSourceNode
      │
      ▼
  source.start(startTime)  // scheduled seamlessly
      │
  _nextStartTime = startTime + buffer.duration
```

### API

```js
audioPlayer.init()           // Phải gọi sau user gesture
audioPlayer.enqueue(base64)  // Thêm chunk để phát
audioPlayer.stop()           // Dừng và clear queue
audioPlayer.resume()         // Resume từ suspended state
audioPlayer.setEnabled(bool) // Enable/disable
audioPlayer.isActive         // Đang phát hoặc còn queue?
```

### Seamless playback

```js
_scheduleNext() {
    const buffer = this._queue.shift();
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);

    // Bắt đầu ngay sau chunk trước (không có khoảng ngừng)
    const startTime = Math.max(currentTime, this._nextStartTime);
    source.start(startTime);
    this._nextStartTime = startTime + buffer.duration;

    // Khi xong → phát chunk tiếp
    source.onended = () => this._scheduleNext();
}
```

### Backlog management

Nếu queue đầy (> 10 buffers), drop các buffer cũ nhất để tránh latency stacking:
```js
if (this._queue.length >= this._maxQueueSize) {
    const dropped = this._queue.length - this._maxQueueSize + 1;
    this._queue.splice(0, dropped);
}
```

---

## 4. Cách chọn Provider (app.js)

```js
_getActiveTTS() {
    const provider = settingsManager.get().tts_provider; // 'edge' | 'google' | 'elevenlabs'
    if (provider === 'elevenlabs') return elevenLabsTTS;
    if (provider === 'google')     return googleTTS;
    return edgeTTSRust; // default
}

_configureTTS(tts, settings) {
    if (provider === 'elevenlabs') {
        tts.configure({ apiKey: '...', voiceId: '...' });
    } else if (provider === 'google') {
        tts.configure({ apiKey: '...', voice: '...', languageCode: '...', speakingRate: 1.0 });
    } else { // edge
        tts.configure({ voice: 'vi-VN-HoaiMyNeural', speed: 20 }); // +20%
    }
}
```

### Toggle TTS on/off

```js
_speakIfEnabled(text) {
    if (this.ttsEnabled && text?.trim()) {
        this._getActiveTTS().speak(text);
    }
}

// Khi toggle ON:
tts.connect();
audioPlayer.resume();

// Khi toggle OFF:
tts.disconnect();
audioPlayer.stop();
```

**Lưu ý:** TTS tự động tắt trong **chế độ dịch 2 chiều** để tránh audio feedback loop.

---

## 5. So sánh các Provider

| Provider | Chất lượng | Latency | Giá | API Key | Cơ chế |
|---|---|---|---|---|---|
| **Edge TTS** | ★★★★ | ~300-600ms | Miễn phí | Không cần | Rust WebSocket proxy |
| **Google Chirp 3 HD** | ★★★★★ | ~200-500ms | 1M chars/tháng free | Google Cloud | REST API (JS direct) |
| **ElevenLabs** | ★★★★★ | ~100-300ms | Có free tier | ElevenLabs | WebSocket streaming |
| **Web Speech** | ★★★ | Gần tức thì | Miễn phí | Không cần | Browser SpeechSynthesis |

---

## 6. Settings được lưu (JSON)

```json
{
    "tts_provider": "edge",              // "edge" | "google" | "elevenlabs"
    "tts_enabled": false,                // luôn false khi khởi động
    "edge_tts_voice": "vi-VN-HoaiMyNeural",
    "edge_tts_speed": 20,               // percentage: -50 đến +100
    "elevenlabs_api_key": "",
    "tts_voice_id": "21m00Tcm4TlvDq8ikWAM",
    "tts_speed": 1.2,
    "google_tts_api_key": "",
    "google_tts_voice": "vi-VN-Chirp3-HD-Aoede",
    "google_tts_speed": 1.0
}
```

---

## 7. Điểm nổi bật để tham khảo cho Viezan

1. **Edge TTS hoàn toàn miễn phí** với chất lượng tốt — phù hợp làm default TTS không cần key
2. **Rust proxy** giải quyết vấn đề CORS/headers khi gọi WebSocket từ browser (Electron cũng có thể dùng IPC tương tự)
3. **AudioPlayer** với Web Audio API tạo phát âm thanh liền mạch từ nhiều chunks — quan trọng khi nhận stream
4. **Interface thống nhất** cho tất cả provider giúp dễ hoán đổi
5. **TTFB measurement** trong ElevenLabs rất hữu ích để debug latency
6. **Backlog management** (drop stale buffers) quan trọng để tránh latency stacking trong real-time use
7. **Auto-reconnect** logic trong ElevenLabs (exponential backoff) tốt cho production

---

## 8. Cấu trúc file

```
src/js/
├── audio-player.js      # Web Audio API queue player
├── edge-tts.js          # Edge TTS frontend (gọi Rust)
├── elevenlabs-tts.js    # ElevenLabs WebSocket streaming
├── google-tts.js        # Google Chirp 3 HD REST API
├── web-speech-tts.js    # Browser SpeechSynthesis (local)
├── app.js               # Main controller — wire everything
├── settings.js          # Settings persistence
├── ui.js                # Transcript UI
└── soniox.js            # STT WebSocket (Soniox)

src-tauri/src/
├── commands/
│   ├── edge_tts.rs      # Edge TTS Rust command (DRM + WebSocket)
│   ├── audio.rs         # Audio capture commands
│   └── ...
└── ...
```
