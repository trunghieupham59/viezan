<!--
Cảm ơn bạn đã đóng góp cho Viezan! 🎉
Vui lòng điền đầy đủ các mục bên dưới để PR được review nhanh hơn.
-->

## 📌 Summary

<!-- Mô tả ngắn (1-3 dòng) PR này làm gì và vì sao cần thiết. -->

## 🔗 Related Issues

<!-- Liệt kê issue / discussion liên quan, ví dụ: Fixes #123, Closes #456 -->

Closes #

## 🧩 Type of Change

<!-- Đánh dấu (x) các loại phù hợp. Tiêu đề PR cũng phải bắt đầu bằng prefix tương ứng (Conventional Commits). -->

- [ ] ✨ `feat` — Tính năng mới
- [ ] 🐛 `fix` — Sửa bug
- [ ] 🔧 `refactor` / `perf` / `style` — Cải tiến không thay đổi hành vi
- [ ] 📝 `docs` — Tài liệu
- [ ] ✅ `test` — Thêm / sửa test
- [ ] 🏗️ `build` / `ci` / `chore` — Hạ tầng, dependencies, CI
- [ ] 🔒 `security` — Vá lỗi bảo mật
- [ ] 💥 Breaking change

## 🛠 What Changed

<!-- Liệt kê các thay đổi chính theo bullet point. -->

-
-

## 🧪 How to Test

<!-- Hướng dẫn reviewer cách test thủ công (nếu cần). -->

```bash
npm install
npm run dev
```

## 📷 Screenshots / Recordings

<!-- Nếu PR đụng UI, vui lòng đính kèm ảnh / GIF trước-sau. -->

## ✅ Checklist

- [ ] Tiêu đề PR theo [Conventional Commits](https://www.conventionalcommits.org/) (ví dụ `feat(translate): add streaming`)
- [ ] Đã chạy `npm run test` và toàn bộ tests pass
- [ ] Đã chạy `npx biome ci .` không còn warning/error
- [ ] Đã chạy `npx tsc -p tsconfig.json --noEmit` và `npx tsc -p tsconfig.electron.json --noEmit`
- [ ] Đã thêm / cập nhật unit test cho các thay đổi (nếu áp dụng)
- [ ] Đã cập nhật tài liệu (`README.md`, `docs/`, hoặc comment) (nếu áp dụng)
- [ ] Đã rà README theo source, chạy `npm run docs:sync`, ghi nhận `npm run docs:review -- --summary "..."` sau khi rà, và chạy `npm run check:docs`; nếu không đổi mô tả, giải thích trong summary
- [ ] Khi bump version: `package-lock.json` và mục phiên bản trong `CHANGELOG.md` đã đồng bộ
- [ ] Không commit secrets / API keys / cấu hình cá nhân
- [ ] Đã tự review diff lần cuối

## 📝 Notes for Reviewers

<!-- Bất cứ điều gì reviewer cần biết: trade-off, vấn đề còn open, follow-up sẽ làm sau, ... -->
