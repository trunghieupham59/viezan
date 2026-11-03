# AI Chat — Known Limitations & User Guidance

> **Trạng thái**: Living document · 2026-05-05
> **Mục đích**: Tài liệu hoá các giới hạn cố hữu của LLM mà Viezan không thể "fix" hoàn toàn ở phía code, kèm cách giảm thiểu (mitigation) đã được tích hợp và best practices cho user.

---

## L1 — Numerical / financial reasoning có thể sai khi context khác common-case

### Triệu chứng

LLM đôi khi **bỏ qua hoặc đè lên ràng buộc số học do user nêu ra**, thay vào đó áp công thức / kịch bản common-case quen thuộc, rồi đưa ra câu trả lời **rất tự tin nhưng sai**.

### Reproducer (câu hỏi gốc)

```
Nếu lương Gross của tôi là 50.000.000đ/tháng
Công ty tôi sẽ đóng 100% mức thuế trên toàn bộ lương của tôi (50.000.000đ)
Khấu trừ cá nhân tôi mỗi tháng theo mức mới năm 2026.
Thì khi tổng kết thuế vào tháng 4 năm 2027 tôi sẽ hoàn lại được bao nhiêu?
Biết: Ngoài giảm trừ gia cảnh cá nhân thì tôi không còn khoản giảm trừ nào khác.
```

**Hành vi quan sát (trước fix)**: AI đọc xong, bỏ qua câu "công ty đóng 100% thuế trên TOÀN BỘ 50tr (chưa trừ giảm trừ gia cảnh)", áp ngay công thức chuẩn — `Thu nhập tính thuế = 50tr − giảm trừ gia cảnh` rồi tính thuế trên số đó. Vì ràng buộc của user khiến **thuế tạm khấu trừ ≠ thuế phải đóng thực tế**, bỏ qua ràng buộc đồng nghĩa hai con số trùng nhau → AI kết luận "không hoàn được đồng nào", trong khi đáp án đúng là **có hoàn**, do user đóng dư thuế trên phần thu nhập đáng lẽ được giảm trừ.

**Hành vi đáng lẽ phải có**:
1. Restate giả định: "Công ty khấu trừ thuế trên 50tr (không trừ giảm trừ gia cảnh trước)".
2. Tính `thuế tạm đóng` = thuế lũy tiến trên 50tr (chưa trừ giảm trừ).
3. Tính `thuế thực tế` (quyết toán) = thuế lũy tiến trên `(50tr − giảm trừ gia cảnh)`.
4. `Số tiền hoàn` = `thuế tạm đóng` − `thuế thực tế` (> 0).

### Tại sao xảy ra

- LLM được train trên rất nhiều dataset có cùng pattern "lương → trừ giảm trừ → tính thuế" nên prior này rất mạnh.
- Khi user đưa context khác common-case nhưng không lặp lại cảnh báo nhiều lần, attention mechanism thường "trượt" qua chi tiết unusual và áp đáp án quen thuộc.
- Đặc biệt trầm trọng với câu hỏi **dài, nhiều dòng, có nhiều con số** vì model cần làm nhiều bước cùng lúc.

### Mitigation đã tích hợp trong Viezan

| Lớp | File | Hành vi |
|---|---|---|
| **1. Reading discipline (always-on)** | `electron/ipc/chatPrompts.ts` | Mọi request đều thêm directive: *"Treat every user-stated assumption, number, percentage, rule, or constraint as authoritative — do NOT silently override it with a common-case default."* — chi phí chỉ ~50 tokens/request. |
| **2. Careful Reasoning toggle (default ON)** | ChatPage / Quick Chat composer | Append directive yêu cầu AI: (a) restate giả định trước khi tính, (b) tính từng bước có nhãn, (c) self-check đáp án vs từng ràng buộc đã nêu, (d) hỏi nếu thiếu thông tin. |
| **3. Auto-suggest banner** | `src/utils/reasoningHeuristic.ts` | Khi user nhập câu chứa số tiền + từ khoá tài chính (thuế, lương, %, hoàn, v.v.) mà toggle Careful Reasoning đang OFF, hiện 1 banner gợi ý bật toggle. |
| **4. Test case** | `electron/ipc/__tests__/chatPrompts.test.ts` | Snapshot test giữ cho 2 directive này không bị xoá nhầm. |

### Khuyến nghị cho user

1. **Giữ Careful Reasoning ON** (mặc định). Chỉ tắt khi cần câu trả lời siêu ngắn.
2. **Viết câu hỏi với cấu trúc rõ ràng**:
   - Liệt kê giả định bằng bullet list thay vì paragraph dài.
   - Ghi rõ "Khác với mặc định: ..." nếu có constraint unusual.
   - Yêu cầu AI restate giả định trước khi trả lời.
3. **Với câu hỏi tính toán quan trọng (thuế, lương, hợp đồng), dùng reasoning models**:
   - OpenAI o1 / o3-mini
   - Gemini 2.5 Thinking
   - Claude Sonnet với extended thinking
   Các model này có khả năng tự reflect và bắt được lỗi reasoning mà GPT-4o-mini / Gemini Flash dễ bỏ sót.
4. **Cross-check con số quan trọng**: gửi cùng câu hỏi cho 2 provider khác nhau. Nếu kết quả lệch nhau → đào sâu.

### Tại sao không "fix" triệt để được?

Đây là giới hạn **bản chất của transformer-based LLM**: prior thống kê + attention chunks. Không có cách phía code nào ép model phải đọc kỹ 100% mọi token nếu chính model "tự tin" rằng một số token là dư thừa. Reasoning models giảm hiện tượng này bằng cách dành thêm tokens internal "thinking", nhưng vẫn không zero-out được.

**Việc cần làm phía code**: tăng signal-to-noise của user constraint (đã làm — Reading + Reasoning Discipline), và educate user (tài liệu này).

---

## L2 — Time-sensitive facts có thể stale

LLM training cutoff ≠ thời gian hiện tại. Câu hỏi về luật mới, giá hiện tại, sự kiện gần đây có thể trả về thông tin lỗi thời.

**Mitigation**: Smart Thinking (DEFAULT) + Deep Research mode tự gọi web search cho câu hỏi cần thông tin thời gian thực.

**User**: cho phép Web Search trong Settings (Tavily / Brave key) để Smart Thinking có dữ liệu thật.

---

## L3 — Math chính xác bằng tay vs token-by-token

Phép tính số học phức tạp (số lớn, decimal precision) đôi khi sai 1-2 chữ số ngay cả khi LLM "biết" công thức. Token-by-token generation không phải calculator.

**Mitigation**:
- Careful Reasoning yêu cầu show step-by-step → user có thể verify.
- Roadmap: F20 (Code Interpreter) trong Phase 3 sẽ sandbox Python để chạy phép tính thật.

**User**: với phép tính cần độ chính xác tuyệt đối, copy ra bảng tính / máy tính để kiểm chứng.

---

## L4 — Prompt injection từ message history

User có thể (vô tình hoặc cố ý) chèn instruction vào message để bypass system prompt enforcement. Các directive như "MUST strictly follow" có thể bị weaken bởi câu user nói sau đó.

**Mitigation hiện có**: enforcement clause được chèn vào cuối system prompt; user không thể trực tiếp sửa system prompt. Tuy nhiên injection từ message body vẫn có thể xảy ra.

**Roadmap**: D5 — log injection attempt heuristic, hiện warning UI.

---

## L5 — Image vision không hỗ trợ tất cả providers

- Gemini, Claude, GPT-4o: có vision.
- Gemini 1.5 Flash-8B / một số legacy models: không có vision.
- Local: tuỳ model (LLaVA, Qwen-VL có; phần lớn text-only thì không).

**Mitigation**: backend tự fallback sang model có vision khi phát hiện request có ảnh + model hiện tại không hỗ trợ → emit `image:model-switched` event để UI hiện toast.

**User**: nếu thường dùng vision, chọn provider có support sẵn (Gemini / OpenAI) trong Quick Settings.

---

## Báo lỗi mới

Nếu phát hiện limitation mới chưa liệt kê ở đây, dùng `/reportbug` slash command (sắp ra mắt) hoặc mở issue trên GitHub.
