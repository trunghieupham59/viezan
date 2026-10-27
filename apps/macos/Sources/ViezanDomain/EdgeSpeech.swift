import Foundation
import CryptoKit

/// Native transport for the same public browser speech protocol used by the
/// previous client. The service controls compatibility; truncated turns fail.
public enum EdgeSpeech {
    private static let publicClient = "6A5AA1D4EAFF4E9FB37E23D68491D6F4"
    public static let voices = ["vi": "vi-VN-HoaiMyNeural", "en": "en-US-JennyNeural", "zh": "zh-CN-XiaoxiaoNeural", "zh-TW": "zh-TW-HsiaoChenNeural", "ja": "ja-JP-NanamiNeural", "ko": "ko-KR-SunHiNeural", "fr": "fr-FR-DeniseNeural", "de": "de-DE-KatjaNeural", "es": "es-ES-ElviraNeural", "pt": "pt-PT-RaquelNeural", "ru": "ru-RU-SvetlanaNeural", "ar": "ar-SA-ZariyahNeural", "th": "th-TH-PremwadeeNeural", "id": "id-ID-GadisNeural", "it": "it-IT-ElsaNeural", "nl": "nl-NL-ColetteNeural", "pl": "pl-PL-ZofiaNeural", "tr": "tr-TR-EmelNeural", "hi": "hi-IN-SwaraNeural"]
    public static func audio(_ text: String, language: String, voice: String) async throws -> Data {
        guard !text.isEmpty, text.count <= 5000 else { throw CloudFailure.invalidResponse }
        let selected = voice.isEmpty ? (voices[language] ?? voices["en"]!) : voice
        guard selected.range(of: "^[A-Za-z]{2,3}-[A-Za-z]{2,4}-[A-Za-z0-9-]{1,80}$", options: .regularExpression) != nil else { throw CloudFailure.invalidResponse }
        let now = Int64(Date().timeIntervalSince1970) + 11_644_473_600, ticks = (now - now % 300) * 10_000_000
        let signature = SHA256.hash(data: Data((String(ticks) + publicClient).utf8)).map { String(format: "%02X", $0) }.joined()
        var url = URLComponents(string: "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1")!
        url.queryItems = [.init(name: "TrustedClientToken", value: publicClient), .init(name: "ConnectionId", value: UUID().uuidString.replacingOccurrences(of: "-", with: "")), .init(name: "Sec-MS-GEC", value: signature), .init(name: "Sec-MS-GEC-Version", value: "1-143.0.3650.75")]
        var request = URLRequest(url: url.url!)
        request.setValue("chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold", forHTTPHeaderField: "Origin")
        request.setValue("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0", forHTTPHeaderField: "User-Agent")
        request.setValue("muid=" + UUID().uuidString.replacingOccurrences(of: "-", with: "") + ";", forHTTPHeaderField: "Cookie")
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        let config = URLSessionConfiguration.ephemeral; config.timeoutIntervalForRequest = 30; config.timeoutIntervalForResource = 180
        let session = URLSession(configuration: config, delegate: NoRedirectDelegate(), delegateQueue: nil); defer { session.invalidateAndCancel() }
        let socket = session.webSocketTask(with: request); socket.maximumMessageSize = 1_048_576; socket.resume(); defer { socket.cancel(with: .goingAway, reason: nil) }
        return try await withTaskCancellationHandler(operation: {
            try await withThrowingTaskGroup(of: Data.self) { group in
                group.addTask {
                    let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = TimeZone(secondsFromGMT: 0); formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss 'GMT'"
                    let timestamp = formatter.string(from: Date())
                    let body = #"{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-16khz-32kbitrate-mono-mp3"}}}}"#
                    try await socket.send(.string("X-Timestamp:\(timestamp)\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n" + body))
                    let escaped = text.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "\"", with: "&quot;")
                    let xmlLanguage = selected.split(separator: "-").prefix(2).joined(separator: "-")
                    let ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='\(xmlLanguage)'><voice name='\(selected)'><prosody pitch='+0Hz' rate='+20%' volume='+0%'>\(escaped)</prosody></voice></speak>"
                    try await socket.send(.string("X-RequestId:\(UUID().uuidString.replacingOccurrences(of: "-", with: ""))\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:\(timestamp)Z\r\nPath:ssml\r\n\r\n" + ssml))
                    var result = Data()
                    while true {
                        try Task.checkCancellation()
                        switch try await socket.receive() {
                        case .string(let message):
                            if message.contains("Path:turn.end") { guard !result.isEmpty else { throw CloudFailure.invalidResponse }; return result }
                        case .data(let data):
                            guard data.count >= 2 else { throw CloudFailure.invalidResponse }
                            let length = Int(data[0]) * 256 + Int(data[1]); guard data.count >= length + 2 else { throw CloudFailure.invalidResponse }
                            let header = String(decoding: data[2..<(2 + length)], as: UTF8.self)
                            if header.contains("Path:audio") { guard result.count + data.count - length - 2 <= 16_777_216 else { throw ProviderFailure.oversizedResponse }; result.append(data.dropFirst(length + 2)) }
                        @unknown default: throw CloudFailure.invalidResponse
                        }
                    }
                }
                group.addTask { try await Task.sleep(for: .seconds(180)); socket.cancel(with: .goingAway, reason: nil); throw CloudFailure.network }
                defer { group.cancelAll(); socket.cancel(with: .goingAway, reason: nil) }
                guard let result = try await group.next() else { throw CloudFailure.invalidResponse }; return result
            }
        }, onCancel: { socket.cancel(with: .goingAway, reason: nil) })
    }
}
