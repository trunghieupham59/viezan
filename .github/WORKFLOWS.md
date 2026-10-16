# GitHub Workflows & Automation

Tài liệu tổng quan về toàn bộ pipeline CI/CD và automation của Viezan, lưu tại
`.github/`.

## 🚦 Pipeline tổng quan

Windows CI và release dùng `.github/actions/stage-ollama-runtime` trước khi đóng
gói. Action tải archive từ prerelease `ollama-runtime-0.40.4-viezan-http-test`,
kiểm tra SHA-256 đã pin trong action, rồi chạy staging và kiểm chứng manifest.
Không bỏ qua bước này hoặc dùng binary thay thế khi tải/kiểm chứng thất bại.
Runtime nằm ngoài Git; khi cập nhật phải kiểm chứng bộ binary mới và cập nhật
cả digest archive lẫn các hash binary được pin trong script staging.
Tag runtime không bắt đầu bằng `v`, không kích hoạt workflow phát hành ứng dụng.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          PUSH / PULL REQUEST                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │   lint   │  │ typecheck│  │   test   │  │ build x3 │  │  CodeQL  │  │
│  │ (Biome)  │  │ tsc x2   │  │ (Vitest) │  │ mac/win/ │  │ security │  │
│  │          │  │          │  │          │  │  linux * │  │          │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
│        │             │             │             │                     │
│        └─────────────┴─────────────┴─────────────┘                     │
│                                  │                                     │
│                                  ▼                                     │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │      PR-only: dependency-review · pr-checks (title + labels)   │    │
│  └────────────────────────────────────────────────────────────────┘    │
│  * build x3 chỉ chạy khi push main/develop, chạy tay, hoặc PR đổi file │
│    đóng gói (xem "Khi nào chạy build" bên dưới). Mọi PR đều có thêm    │
│    job `compile` (npm run build trên Linux, ~1 phút).                  │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                          SCHEDULED / TAG                               │
│  • codeql.yml          (mỗi tuần — security audit)                     │
│  • dependabot.yml      (mỗi tuần — npm + actions update)               │
│  • auto-tag.yml        (develop đổi version — tạo tag + gọi release)   │
│  • release.yml         (tag v*  — publish DMG/EXE/AppImage + ZIP)      │
│  • pages.yml           (push docs/** — deploy GitHub Pages)            │
└────────────────────────────────────────────────────────────────────────┘
```

## 📁 Cấu trúc thư mục `.github/`

| File                                       | Mục đích                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| `workflows/ci.yml`                         | Lint (Biome + Atomic boundaries) + TypeCheck + Vitest + compile check + build matrix có điều kiện (artifact 5 ngày) + smoke test installer Windows |
| `workflows/codeql.yml`                     | Phân tích bảo mật JS/TS định kỳ + theo PR                                   |
| `workflows/dependency-review.yml`          | Chặn dependency có CVE / license không tương thích trong PR                 |
| `workflows/pr-checks.yml`                  | Bắt buộc tiêu đề PR theo Conventional Commits + auto-gán nhãn theo path file |
| `workflows/auto-tag.yml`                   | Đổi `version` trong `package.json` trên `develop` → tạo tag `vX.Y.Z` + gọi release |
| `workflows/release.yml`                    | Tag `v*` (hoặc dispatch từ auto-tag) → build & publish DMG/EXE/AppImage + extension ZIP |
| `workflows/pages.yml`                      | Deploy `docs/` lên GitHub Pages                                             |
| `actions/install-linux-deps`               | Composite action: cài system deps build Linux (dùng ở ci/release)   |
| `actions/sync-version`                     | Composite action: đồng bộ `package.json` version theo tag (dùng ở release)  |
| `labeler.yml`                              | Định nghĩa rule cho `actions/labeler`                                       |
| `dependabot.yml`                           | Cập nhật npm + GitHub Actions hàng tuần (theo group)                        |
| `release.yml`                              | Cấu hình "auto-generated release notes" của GitHub                          |
| `CODEOWNERS`                               | Auto request review                                                         |
| `FUNDING.yml`                              | Nút Sponsor                                                                 |
| `pull_request_template.md`                 | Template PR                                                                 |
| `ISSUE_TEMPLATE/config.yml`                | Tắt blank issue + redirect Discussions / Security                           |
| `ISSUE_TEMPLATE/bug_report.yml`            | Form báo bug                                                                |
| `ISSUE_TEMPLATE/feature_request.yml`       | Form đề xuất feature                                                        |
| `ISSUE_TEMPLATE/question.yml`              | Form câu hỏi                                                                |

## 🔐 Secrets & Variables cần khai báo trong repo

> **Settings → Secrets and variables → Actions**

### Secrets (bắt buộc khi release)

| Secret                           | Dùng ở đâu                          | Bắt buộc                |
| -------------------------------- | ----------------------------------- | ----------------------- |
| `GITHUB_TOKEN`                   | (auto)                              | ✅                       |
| `APPLE_ID`                       | `release.yml` — notarize macOS      | ✅ (bản notarized)       |
| `APPLE_APP_SPECIFIC_PASSWORD`    | `release.yml` — notarize macOS      | ✅ (bản notarized)       |
| `SIGNPATH_API_TOKEN`             | `release.yml` — sign Windows        | ⛔ (optional fallback)   |

### Variables

| Variable                         | Dùng ở đâu                          |
| -------------------------------- | ----------------------------------- |
| `APPLE_TEAM_ID`                  | `release.yml`                       |
| `SIGNPATH_ORGANIZATION_ID`       | `release.yml`                       |
| `SIGNPATH_PROJECT_SLUG`          | `release.yml` — mặc định `tre-assistant` |
| `SIGNPATH_SIGNING_POLICY_SLUG`   | `release.yml` — mặc định `release-signing` |
| `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG` | `release.yml` — mặc định `windows-installer` |
| `REQUIRE_WINDOWS_SIGNING`        | `release.yml` — `true` = bắt buộc ký: thiếu secret hoặc ký lỗi thì release fail, không đẩy installer chưa ký |

## 🏷️ Quy ước Conventional Commits

Tiêu đề PR và commit nên theo dạng:

```
<type>(<scope>): <subject viết thường>
```

Các `type` được chấp nhận: `feat`, `fix`, `hotfix`, `patch`, `revert`, `improve`,
`enhance`, `update`, `refactor`, `perf`, `chore`, `style`, `docs`, `test`, `ci`,
`build`, `deps`, `security`.

Ví dụ:

- `feat(translate): add streaming response`
- `fix(electron): handle keychain missing on linux`
- `chore(deps): bump electron to 41.2.1`

## 🚀 Quy trình release

1. Bump `version` trong `package.json` và merge vào `develop`.
2. `auto-tag.yml` tự tạo tag `vX.Y.Z` (bỏ qua nếu tag đã tồn tại) rồi gọi
   `release.yml` trên tag đó. Nếu bỏ lỡ, chạy tay **Actions → Auto Tag Release**.
3. `release.yml` build và upload DMG / EXE / AppImage / `latest.yml` + extension
   ZIP lên GitHub Release tương ứng.

Có thể tag tay (`git tag vX.Y.Z && git push origin vX.Y.Z`); `release.yml` vẫn
chạy theo tag push và `auto-tag.yml` sẽ thấy tag đã có nên bỏ qua. Không chạy
`release.yml` bằng tay từ một branch — chỉ từ tag.

## 🏗️ Khi nào chạy build

Build đóng gói 3 hệ điều hành mất khoảng 20 phút nên không chạy ở mọi PR:

| Sự kiện                                  | Lint / TypeCheck / Test / `compile` | Build x3 + smoke test installer |
| ---------------------------------------- | ----------------------------------- | -------------------------------- |
| Pull request                             | Luôn chạy                           | Chỉ khi PR đổi file đóng gói     |
| Push `main` / `develop`                  | Luôn chạy                           | Luôn chạy                        |
| Chạy tay (Actions → CI → Run workflow)  | Luôn chạy                           | Luôn chạy                        |

File đóng gói (job `changes` trong `ci.yml`): `package.json`, `package-lock.json`,
`build/**`, `scripts/**`, `electron-builder.*`, `vite.config.*`, `tsconfig*.json`,
`.github/workflows/**`, `.github/actions/**`. Muốn đổi danh sách này, sửa biến
`PACKAGING_PATHS`. Nếu không so sánh được với nhánh gốc, job `changes` chọn build
đầy đủ. Build **phát hành** chỉ chạy khi bump version (xem `auto-tag.yml`).

## 📦 Bản build dev

Không còn nightly. Muốn bản dev để thử, tải artifact `viezan-<OS>-<sha>` (giữ 5
ngày) từ run của `ci.yml` trên `develop`, hoặc chạy tay **Actions → CI → Run
workflow**.

## 🤖 Dependabot — chiến lược group

- React + types: gom 1 PR.
- Vite + Vitest + plugin Vite: gom 1 PR.
- Electron + electron-builder + electron-updater: gom 1 PR.
- AI providers (Anthropic, Google GenAI, OpenAI): gom 1 PR.
- Testing tools, build tooling: mỗi nhóm 1 PR.
- Major bump của `electron`, `react`, `react-dom` bị **bỏ qua** — phải nâng tay.
- GitHub Actions cũng được bump theo tuần (gom toàn bộ vào 1 PR).
