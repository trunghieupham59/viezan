# Skill: viezan-doc-sync

Skill phát hiện drift giữa source code Viezan và tài liệu chính (`ARCHITECTURE.md`, `PROMPTS.md`, `viezanagent/docs/`, `README.md`, `chrome-extension/README.md`).

## Khi dùng

```text
Dùng skill viezan-doc-sync để rà drift giữa code và docs trước release.
```

```text
Dùng skill viezan-doc-sync sau khi thêm IPC/provider/locale/skill mới.
```

## Code truth anchors

- IPC channels từ `electron/main.ts` + `electron/ipc/`
- Preload domain modules từ `electron/preload/`
- Providers từ `SUPPORTED_PROVIDERS` và `PROVIDERS`
- Store slices từ `src/store/slices/`
- Locales từ `src/i18n/locales/`
- Skills/Workflows từ `viezanagent/skill/` + `viezanagent/workflow/`
- Report paths từ workflow JSON `save_path`
- Live pipeline thresholds từ `src/hooks/useLiveTranslate.ts`

## Output chuẩn

```markdown
## Drift Summary
- Missing in docs: <n>
- Stale in docs: <n>
- Broken paths: <n>

## Missing in Docs
| Severity | Anchor | Code | Doc to update |

## Stale in Docs
| Severity | Anchor | Doc | Suggested removal/update |

## Broken Paths
| File | Reference | Status |

## Report Path Drift
| Workflow | save_path in JSON | PROMPTS.md entry |

## Required Updates
1. ...
```

## Checklist nhanh

- IPC channel mới có trong ARCHITECTURE.md không?
- Provider/locale mới có trong README/product-intro không?
- Skill/workflow mới có trong PROMPTS.md không?
- Path tham chiếu chéo trong skill/workflow JSON có còn đúng không?
- Threshold trong docs có khớp code không?
