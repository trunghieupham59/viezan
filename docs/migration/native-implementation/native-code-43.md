# Native code 43 — Giọng nói & Phiên dịch, ký bản build thử (2026-10-28)

## Thay đổi (Swift + Qt)

| Phần | Thay đổi |
| --- | --- |
| Nhà cung cấp nhận dạng (STT) | Chưa chọn = "Tự động" (OpenAI → Gemini → Groq có key), cả hai bản. Trước: Swift mặc định OpenAI; Qt Cài đặt hiện "Tự động" nhưng ghi âm/Phiên dịch dùng `"openai"`. Lựa chọn rõ ràng của người dùng giữ nguyên |
| Model nhận dạng OpenAI | Dùng model tốt nhất tài khoản có (dò): `gpt-4o-transcribe` → `gpt-4o-mini-transcribe` → `whisper-1` |
| Báo trước | Trang Phiên dịch: "Nhận dạng giọng nói cần API key OpenAI, Gemini hoặc Groq" (hoặc provider đã chọn chưa có key) + mở Nhà cung cấp AI. Lượt dò ghi nhận `speechKeyed` |
| Mã lỗi Phiên dịch (Swift) | Lỗi nhận dạng: mã provider / thiếu key / `providerNetworkError` khi mất mạng; lỗi dịch/tổng hợp: `failureCode` (vd. `providerOffline`) — trước: mọi lỗi không phải `CloudFailure` là `audioError`. Qt: tổng hợp lỗi không mã → `providerError` |
| Cổng giọng nói (micro) | `VoiceGate` (Swift `VoiceGate.swift`, Qt `VoiceGate.h`, cùng tham số) thay ngưỡng cố định −42 dB: mức âm làm mượt 0,3 s (trung bình công suất); giọng nói = to hơn **nền ồn tự học** (bám đáy, tăng chậm ~20 s) 6 dB, thấp nhất −60 dB; kết thúc đoạn sau 0,7 s lặng, đoạn dài quá 12 s cắt ở khoảng lặng 0,3 s kế tiếp, trần 25 s; đoạn phải có ≥ 0,5 s giọng liên tục (tiếng click, gõ phím bị bỏ); bỏ đoạn chờ 10 s không có giọng |
| Bản ghi rỗng | Bản ghi không có chữ/số ("." hay "...") bị xoá khỏi phiên, không đem đi dịch (trước: model dịch trả lời kiểu chat "Vui lòng cung cấp nội dung…") |
| Treo khi bắt đầu Phiên dịch (Swift) | `ShellToolbarButton` tắt (`isEnabled = false`) chính nút đang giữ focus ("Phiên mới") trong `updateNSView` → AppKit tính lại key loop, đọc focus graph của SwiftUI lồng nhau → vòng lặp AttributeGraph, 99,9% CPU. Sửa: chỉ đổi khi khác, và hoãn việc tắt nút đang focus ra ngoài lượt cập nhật |
| Ký bản build thử | `build.py` ký app SwiftUI (và helper) + app Qt trên macOS bằng chứng chỉ Apple Development hợp lệ đầu tiên (hoặc `VIEZAN_SIGN_IDENTITY`), định danh cố định `com.viezan.native.preview` / `com.viezan.native.qt.preview`. Không có chứng chỉ hợp lệ → ad-hoc + cảnh báo |

## Vì sao keychain hỏi liên tục

Bản build ad-hoc có chữ ký đổi theo từng build (`ViezanNative-<hash>`, không Team ID). Keychain
gắn "Luôn Cho phép" với chữ ký đó, nên mỗi build hỏi lại **từng key** (Claude, OpenAI…); quyền
Micro/Ghi màn hình cũng vậy. Ký bằng chứng chỉ cố định giữ quyền qua các build.

Máy có 3 chứng chỉ Apple Development nhưng ban đầu **không hợp lệ**: thiếu chứng chỉ trung gian
Apple WWDR G3 (`codesign`: "unable to build chain to self-signed root"). Đã cài
`AppleWWDRCAG3.cer` từ https://www.apple.com/certificateauthority/ (người dùng thêm vào keychain).
`security` liệt kê chứng chỉ không theo thứ tự cố định (bản v31 ký bằng chứng chỉ khác và bị hỏi lại),
nên `build.py` chọn theo tên rồi hash.

**Đã xác nhận:** sau khi cho phép một lần với bản ký, các bản v32–v38 mở không hỏi keychain;
danh sách model cloud vẫn tải (OpenAI 142, Claude 14). Quyền Micro cũng chỉ hỏi một lần.

## Chạy thật (macOS, bản v29 — trước khi đổi model nhận dạng)

- Phiên dịch chế độ micro, câu tiếng Anh phát bằng `say` qua loa: pipeline chạy đầu-cuối
  (ghi âm → STT "Tự động" → dịch Claude Haiku 5.5 → song ngữ có mốc thời gian, người nói).
- **Chất lượng nhận dạng kém** với `whisper-1`: đoán nhầm ngôn ngữ nên "gốc" ra tiếng Việt, và bịa
  câu trên tạp âm (đoạn đầu kéo dài 20 giây vì phòng có tạp âm/quạt vượt ngưỡng −42 dB) →
  đổi sang model nhận dạng mới. **Chưa chạy lại** để xác nhận.
- Không chạy: ghi âm trong Chat, đọc to, âm thanh hệ thống, Qt với key cloud, Windows/Linux.

## Chạy thật (macOS, bản v33 — model nhận dạng mới, chưa có `VoiceGate`)

- Không còn treo khi bắt đầu Phiên dịch với nút "Phiên mới" đang focus (CPU 8%).
- Câu tiếng Anh giờ nhận dạng **đúng tiếng Anh** (`gpt-4o-transcribe`), dịch đúng.
- Còn lỗi, đã sửa bằng `VoiceGate` + lọc bản ghi rỗng: tạp âm phòng vượt −42 dB nên mỗi đoạn kéo đủ
  20 s; đoạn chỉ có tạp âm ra "." / "..." rồi model dịch trả lời kiểu chat; tạp âm bị bịa thành câu
  (tiếng Ý, Ả Rập, "Hello, how are you?"…); câu bị cắt ngang ở mốc 20 s ("…plan for next").

## Chạy thật (macOS, v34–v37 — hiệu chỉnh `VoiceGate` bằng số đo thật)

- v34/v35 (ngưỡng nền + 9 dB, bỏ đoạn thưa giọng): hết đoạn tạp âm nhưng **mất lời** — câu bị cắt
  giữa chừng và phần sau bị bỏ. Ghi vết tạm (biến môi trường, đã gỡ) cho thấy phòng ồn −27…−34 dB,
  giọng từ loa chỉ −20…−29 dB: ngưỡng nền + 9 dB (≈ −23 dB) nằm giữa dải giọng nói.
- Mô phỏng lại trên chính dữ liệu đó → làm mượt 0,3 s, nền + 6 dB, yêu cầu 0,5 s giọng liên tục;
  test hồi quy `voiceGateKeepsQuietSpeechInANoisyRoomAsOneUtterance` dựng từ các mức đo được.
- **v37:** ba câu (8 s, 4 s, 20 s) → đúng ba đoạn, trọn vẹn, nhận dạng và dịch đúng
  (`evidence/native-voice-43/interpretation-voicegate.jpg`); không có đoạn tạp âm nào; các đoạn
  chờ im lặng bị bỏ đúng sau 10 s; phiên vẫn nghe tiếp.
- Một lần ở v34 phiên tự dừng sau đoạn thứ ba, không có lỗi hiển thị; **không tái hiện** ở v36/v37.
- Không chạy: ghi âm trong Chat, đọc to, âm thanh hệ thống, Qt với key cloud, Windows/Linux.

## Kiểm tra

`swift test` 31 + 33 (thêm 3 test `VoiceGate`); Qt 101/101 (thêm 2 test `VoiceGate`); domain 11;
`generate-resources --check`; `documentation.mjs`. Bản cuối v38 build từ mã đã gỡ ghi vết.
Không chạy: bản Qt với giọng thật (cổng giống hệt, chỉ có test đơn vị), âm thanh hệ thống
(vẫn chia 5 s cố định, chỉ hưởng bộ lọc bản ghi rỗng).
