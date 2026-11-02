# Workflow: ship-viezan-feature

Workflow implement một tính năng Viezan từ PRD/issue đến code, test và docs.

## Cách dùng

```text
Dùng workflow ship-viezan-feature để implement PRD sau:
[nội dung PRD]
```

## Quy trình

1. Đọc PRD và xác định product fit.
2. Dùng skill `viezan-feature-planner` để lập impact map.
3. Áp dụng rule `viezan-product-engineering` và `generate-code`.
4. Implement theo tầng: types/constants -> main IPC -> preload -> services/store -> UI -> i18n -> tests.
5. Nếu chạm Chrome Extension, chạy pass riêng cho popup/options/content tooltip: visual parity, no emoji icon, no decorative inline SVG, storage defaults và manual smoke.
6. Audit privacy/IPC nếu có chạm provider, key, preload, local server hoặc external URL.
7. Verify bằng test/build/lint phù hợp.
8. Cập nhật docs hoặc prompt nếu feature ảnh hưởng cách dùng agent/user.

## Output cuối

```markdown
## Done
- Files changed:
- Behavior:

## Verification
- Commands:
- Result:

## Notes
- Risks:
- Follow-up:
```
