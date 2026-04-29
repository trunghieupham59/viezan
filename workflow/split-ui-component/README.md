# Workflow: split-ui-component

Workflow phân tích tổ chức UI component, phát hiện **SVG icon hardcode**, **UI pattern duplicate**, đề xuất kế hoạch tách component và lưu báo cáo.

## Mô tả

Workflow này hướng dẫn AI agent thực hiện toàn bộ quy trình từ đầu đến cuối:

```
Step 1: Xác định phạm vi
   ↓
Step 2: Đọc toàn bộ source code
   ↓
Step 3: Phân loại tất cả Component hiện có (Reusable / Feature-specific)
   ↓
Step 4: Phát hiện SVG Icon Hardcode Inline
   ↓
Step 5: Phát hiện Emoji dùng làm Icon
   ↓
Step 6: Phát hiện UI Pattern Duplicate không tách Component
   ↓
Step 7: Phát hiện Sub-component Inline quá lớn (≥ 30 dòng)
   ↓
Step 8: Loại bỏ False Positive
   ↓
Step 9: Ưu tiên hóa vấn đề
   ↓
Step 10: Tạo báo cáo đầy đủ
   ↓
Step 11: Lưu báo cáo vào viezanagent/report/
```

## Cách kích hoạt

```
Hãy dùng workflow split-ui-component để phân tích toàn bộ src/components và src/pages
```

Hoặc chỉ định phạm vi hẹp hơn:

```
Hãy dùng workflow split-ui-component để kiểm tra SVG icon hardcode trong src/
Hãy dùng workflow split-ui-component để phân tích src/pages/HistoryPage.tsx
```

---

## Skill sử dụng

Workflow này gọi **skill `split-ui-component`** ở nhiều bước:

| Bước | Skill Section | Mục tiêu |
|------|--------------|----------|
| Step 3 | `component_classification` | Phân loại Reusable vs Feature-specific |
| Step 4 | `detection_categories.inline-svg-icon` | Tìm SVG inline |
| Step 5 | `detection_categories.emoji-as-icon` | Tìm emoji làm icon |
| Step 6 | `detection_categories.ui-pattern-duplicate` | Tìm UI pattern duplicate |
| Step 7 | `detection_categories.large-inline-sub-component` | Tìm inline component quá lớn |

---

## Tiêu chí phân loại

### ✅ REUSABLE — `src/components/ui/`

Thỏa **TẤT CẢ** 5 tiêu chí:

| # | Tiêu chí |
|---|---------|
| 1 | Không import business logic (store, service, hook feature-specific) |
| 2 | Props-only interface — không tự gọi `useAppStore()` bên trong |
| 3 | Domain-agnostic — tên và logic không gắn với 1 feature cụ thể |
| 4 | Icon từ registry — không SVG inline |
| 5 | Label qua props — không hardcode string hiển thị |

> **Cũng là Reusable:** Component ở `src/components/*.tsx` root (Sidebar, AppLogo...)
> **Không cần dùng ở 2+ nơi** — 1 lần dùng vẫn là reusable nếu pass 5 tiêu chí

### 🔷 FEATURE-SPECIFIC — `src/components/{feature}/`

Vi phạm **ÍT NHẤT 1**:
- Tên nói rõ feature (`VoiceOverlay`, `DragOverlay`)
- Import store/service của feature (`SystemPromptDropdown` biết `chatSystemPrompt`)
- Layout chỉ có nghĩa trong feature đó (`MessageBubble`)
- Chứa complex state gắn domain (drag state, voice recording)

---

## Bảng phân loại vấn đề

| Vấn đề | Severity | Dấu hiệu cần kiểm tra |
|--------|---------|------------------------------|
| SVG Icon Hardcode Inline | 🟠 High | `<svg>` xuất hiện ngoài `src/components/ui/icons/` |
| UI Pattern Duplicate | 🟠 High | Nhiều JSX block/className dài gần giống nhau |
| Sub-component Inline quá lớn | 🟡 Medium | Function component trong page/feature file dài >= 30 dòng |
| Component sai thư mục | 🟡 Medium | Feature-specific đặt trong `ui/` hoặc ngược lại |
| Emoji dùng làm Icon | 🟡 Medium | Emoji status/action render như icon thay vì icon registry |

---

## Quy tắc tránh False Positive

### KHÔNG phải vi phạm:
- `<svg>` bên trong `src/components/ui/icons/` — icon definition hợp lệ
- `provider.emoji` (`p?.emoji ?? '🤖'`) — metadata, không phải UI icon
- Sub-component inline **< 30 dòng** — chấp nhận được
- Component dùng 1 lần nhưng pass 5 tiêu chí — vẫn là reusable

---

## Format báo cáo

### Bản đồ Component (Step 3)

```markdown
## Bản đồ Component

### Reusable (src/components/ui/)
| Component | Trạng thái | Ghi chú |
|-----------|----------|--------|
| CopyButton.tsx | ✅ Đúng vị trí | Pass 5/5 tiêu chí |
| ButtonGroup.tsx | ✅ Đúng vị trí | Pass 5/5 tiêu chí |
| DownloadButton | Nếu chưa có | Chỉ đề xuất khi scan hiện tại thấy duplicate |

### Feature-specific (src/components/{feature}/)
| Component | Feature | Trạng thái | Ghi chú |
|-----------|---------|----------|--------|
| DragOverlay.tsx | translate | ✅ Đúng vị trí | Layout đặc thù |
| MessageBubble | chat | Đúng nếu đang ở `src/components/chat/` | Không báo lại nếu đã tách |

### Root-level Reusable (src/components/)
| Component | Trạng thái | Vấn đề |
|-----------|----------|--------|
| Sidebar.tsx | Kiểm tra bằng scan hiện tại | Không dùng ví dụ cũ làm bằng chứng |
| AppLogo.tsx | ✅ Đúng | Không vấn đề |
```

### Từng vấn đề

```markdown
### [🟠 High] SVG Icon Hardcode Inline
**File:** `path/to/component.tsx:line`
**Code:**
\```tsx
<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
    d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25..." />
</svg>
\```
**Vấn đề:** Icon viết SVG trực tiếp vào JSX thay vì dùng icon registry
**Icon đề xuất:** `<MeaningfulName>Icon`
**Category:** `actions.tsx` / `navigation.tsx` / `media.tsx` / `status.tsx` / `auth.tsx` / `files.tsx` / `providers.tsx`
**Sửa:**
\```tsx
// 1. Thêm vào src/components/ui/icons/navigation.tsx
export function ChatIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
    </svg>
  )
}
// 2. Import và dùng trong component
import { ChatIcon } from '@/components/ui/icons'
<ChatIcon className="w-5 h-5" />
\```
```

### Kế hoạch tách component

```markdown
## Kế hoạch Action (theo thứ tự ưu tiên)

| # | Ưu tiên | Action | Chi tiết |
|---|---------|--------|---------|
| 1 | 🟠 High | Thay inline SVG | Dựa trên kết quả scan hiện tại, ưu tiên shared/root components |
| 2 | 🟠 High | Tách duplicate UI pattern | Chỉ khi cùng pattern lặp 2+ lần và props interface rõ |
| 3 | 🟡 Medium | Tách inline sub-component | Chỉ khi component >= 30 dòng và gây khó đọc/test |
| 4 | 🟡 Medium | Di chuyển component sai thư mục | Reusable vào `ui/`, feature-specific vào folder feature |
| 5 | 🟢 Low | Thay emoji icon | Bỏ qua emoji metadata/provider/user content |
```

### Bảng tóm tắt

```markdown
## Tóm tắt

| Loại vấn đề | 🟠 High | 🟡 Medium | 🟢 Low | Tổng |
|-------------|--------|---------|------|------|
| SVG Icon Hardcode Inline | n | 0 | 0 | n |
| UI Pattern Duplicate | n | 0 | 0 | n |
| Sub-component Inline quá lớn | 0 | n | 0 | n |
| Emoji dùng như Icon | 0 | n | n | n |
| **Tổng** | **n** | **n** | **n** | **n** |

**File bị ảnh hưởng nhiều nhất:** lấy từ kết quả scan hiện tại, không dùng số liệu report cũ.

**Top 3 ưu tiên sửa:**
1. Sửa các finding Critical/High xuất hiện ở shared/root components trước
2. Tách duplicate UI pattern có ROI rõ
3. Tách inline component lớn nếu đang làm page khó test/maintain
```

---

## Lưu báo cáo

Báo cáo được lưu tại `viezanagent/report/split-ui-report-YYYYMMDD-HHmm.md`

```bash
# Ví dụ tên file
viezanagent/report/split-ui-report-20260417-2200.md
```

---

## Tham khảo

- Skill được sử dụng: [`../../skill/split-ui-component/README.md`](../../skill/split-ui-component/README.md)
- Skill JSON: [`../../skill/split-ui-component/split-ui-component.json`](../../skill/split-ui-component/split-ui-component.json)
- Workflow JSON: [`./split-ui-component.json`](./split-ui-component.json)
- Icon registry: `src/components/ui/icons/`
