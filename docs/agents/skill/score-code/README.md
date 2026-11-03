# Skill: score-code

Skill chấm điểm source code theo từng tiêu chí cụ thể, có thang điểm rõ ràng và tránh chồng chéo giữa các tiêu chí.

## Mô tả

Skill này cung cấp định nghĩa chi tiết cho **10 tiêu chí** đánh giá source code. Mỗi tiêu chí có:
- Phạm vi đánh giá rõ ràng
- Dấu hiệu tốt và xấu
- Thang điểm 5 mức
- Quy tắc không chấm trùng với tiêu chí khác

## Cách dùng

```
Hãy dùng skill score-code để chấm tiêu chí [Correctness | Code Quality | ...] cho đoạn code sau:
[code]
```

## Các tiêu chí

| # | Tiêu chí | Phạm vi chính |
|---|---|---|
| 1 | **Correctness** | Kết quả đúng, edge cases |
| 2 | **Code Quality** | Naming, clean code, duplication |
| 3 | **Structure** | Tổ chức file/module/layer |
| 4 | **Maintainability** | Coupling, extensibility, dễ debug |
| 5 | **Architecture** | Thiết kế tổng thể, pattern |
| 6 | **Testing** | Unit/integration test, testability |
| 7 | **Documentation** | README, comment, API docs |
| 8 | **Performance** | Độ phức tạp, bottleneck |
| 9 | **Security** | Validate, injection, secret |
| 10 | **Reliability** | Error handling, robustness |

## Viezan-specific overlay

Khi chấm code trong repo Viezan, luôn áp dụng thêm các điểm sau:

| Tiêu chí | Bổ sung cần chấm |
|---|---|
| Architecture | Ranh giới Main / Preload / Renderer, IPC `domain:action`, provider registry |
| Security | API key chỉ ở Main Process/keychain, không raw key trong renderer/preload, external URL allowlist |
| Reliability | Retry/fallback provider, cleanup audio/stream/timer, mounted guard |
| Code Quality | i18n VI/EN/JA cho UI text, icon qua `src/components/ui/icons/` |
| Testing | IPC tests, store tests, utility tests, component/page tests theo blast radius |

## Quy tắc không chấm trùng

| Tiêu chí | Không chấm trùng với |
|---|---|
| Correctness | Style, naming |
| Code Quality | Kiến trúc tổng thể |
| Structure | Naming chi tiết |
| Maintainability | Correctness |
| Architecture | Format/micro-style |
| Testing | Documentation |
| Documentation | Logic code |

## Tham khảo

- Chi tiết tiêu chí: [`../../workflow/score-code/README.md`](../../workflow/score-code/README.md)
- Workflow sử dụng skill này: [`../../workflow/score-code/README.md`](../../workflow/score-code/README.md)
