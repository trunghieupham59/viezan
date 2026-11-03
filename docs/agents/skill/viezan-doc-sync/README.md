# Skill: viezan-doc-sync

Skill phát hiện drift giữa source code Viezan và tài liệu chính (`ARCHITECTURE.md`, `PROMPTS.md`, `docs/migration/legacy-reference/agent-handbook/manual/`, `README.md`, `chrome-extension/README.md`).

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
- Agent/Rule/Skill/Workflow từ `docs/agents/agent/` + `docs/agents/rule/` + `docs/agents/skill/` + `docs/agents/workflow/`
- Agent classification từ JSON `classification.lifecycle` + `classification.domain`
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

## Classification Drift
| Artifact | JSON lifecycle/domain | PROMPTS.md/README.md category |

## Required Updates
1. ...
```

## Checklist nhanh

- IPC channel mới có trong ARCHITECTURE.md không?
- Provider/locale mới có trong README/product-intro không?
- Agent/rule/skill/workflow mới có trong PROMPTS.md và README.md không?
- JSON của agent/rule/skill/workflow có `classification.lifecycle`, `classification.domain`, `classification.use_for` không?
- Purpose/lifecycle trong JSON có khớp Agent Catalog không?
- Path tham chiếu chéo trong agent/skill/workflow JSON có còn đúng không?
- Threshold trong docs có khớp code không?
