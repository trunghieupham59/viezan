# Skill: viezan-i18n-audit

Skill audit i18n coverage và chất lượng dịch của Viezan trên 3 locale VI/EN/JA, kèm parity với Chrome Extension surface.

## Khi dùng

```text
Dùng skill viezan-i18n-audit để kiểm tra i18n coverage giữa vi/en/ja.
```

```text
Dùng skill viezan-i18n-audit để tìm UI string đang hardcode trong:
[file/folder]
```

## Đầu vào cần đọc

- `src/i18n/locales/vi.ts`, `en.ts`, `ja.ts`
- `src/i18n/types.ts`, `src/i18n/index.ts`
- File JSX/TSX trong `src/components` và `src/pages` thuộc scope kiểm tra
- `chrome-extension/` nếu scope có browser extension

## Output chuẩn

```markdown
## Coverage Summary
- vi.ts: <số key>
- en.ts: <số key>
- ja.ts: <số key>
- Symmetric: yes/no

## Missing Keys
| Severity | Locale | Key | Note |

## Hardcoded Strings
| Severity | File:Line | Snippet | Suggested key |

## Unused or Duplicate Keys
| Severity | Key | Reason |

## Extension i18n Parity
- Popup/Options/Tooltip text source:
- Default target language/style consistency:

## Required Fixes
1. ...
```

## Checklist nhanh

- 3 locale có cùng tập key không?
- Key mới đã được dùng trong code chưa?
- Có placeholder `{name}` không nhất quán giữa locale không?
- UI string trong SettingsPage / ChatPage / TranslatePage có còn hardcode không?
- Extension popup/options/tooltip dùng từ ngữ giống app không?
