# Prompt Guide — Lotus Agent Skills & Workflows

Tài liệu tổng hợp các prompt mẫu để kích hoạt từng skill và workflow trong `lotus-agent/`.

---

## 📋 Mục lục

- [Workflow: check-dup-hardcode](#workflow-check-dup-hardcode)
- [Workflow: score-code](#workflow-score-code)
- [Workflow: split-ui-component](#workflow-split-ui-component)

---

## Workflow: check-dup-hardcode

> Quy trình 8 bước: xác định phạm vi → đọc code → phát hiện duplicate → phát hiện hardcode → loại false positive → ưu tiên hóa → tạo báo cáo → lưu file.

### Kiểm tra toàn bộ project
```
Hãy dùng workflow check-dup-hardcode để kiểm tra source code trong toàn bộ project
```

### Kiểm tra một thư mục
```
Hãy dùng workflow check-dup-hardcode để kiểm tra duplicate code trong src/services
```

```
Hãy dùng workflow check-dup-hardcode để kiểm tra hardcode trong toàn bộ electron/ipc
```

### Kiểm tra nhiều thư mục cụ thể
```
Hãy dùng workflow check-dup-hardcode để kiểm tra cả duplicate và hardcode trong:
- src/services/
- src/hooks/
- electron/ipc/
```

> 📁 Báo cáo sẽ được lưu tự động tại `lotus-agent/report/dup-hardcode-report-YYYYMMDD-HHmm.md`

---

## Workflow: score-code

> Quy trình chấm điểm source code đầy đủ theo bộ tiêu chí chuẩn, có trọng số theo loại bài.

### Chấm điểm bài lập trình cơ bản
```
Hãy chấm điểm source code này theo workflow score-code.
Loại bài: cơ bản

[dán code hoặc chỉ đường dẫn]
```

### Chấm điểm assignment OOP / Backend
```
Hãy chấm điểm source code này theo workflow score-code.
Loại bài: OOP/backend

src/services/
```

### Chấm điểm project lớn
```
Hãy chấm điểm source code này theo workflow score-code.
Loại bài: project lớn

Toàn bộ src/ và electron/
```

### Chấm điểm tùy chọn tiêu chí
```
Hãy chấm điểm source code theo workflow score-code với các tiêu chí:
- Correctness (40đ)
- Code Quality (30đ)
- Security (20đ)
- Documentation (10đ)

File: src/services/chatService.ts
```

> 📊 Output là bảng điểm với nhận xét từng tiêu chí, điểm mạnh và điểm cần cải thiện.

---

## Workflow: split-ui-component

> Quy trình 11 bước: phân loại component → tìm SVG inline → tìm emoji icon → tìm UI pattern duplicate → tìm sub-component quá lớn → loại false positive → ưu tiên → tạo báo cáo → lưu file.

### Phân tích toàn bộ (khuyến nghị)
```
Hãy dùng workflow split-ui-component để phân tích toàn bộ src/components và src/pages
```

### Chỉ tìm SVG icon hardcode
```
Hãy dùng workflow split-ui-component để kiểm tra SVG icon hardcode trong src/
```

### Phân tích một page cụ thể
```
Hãy dùng workflow split-ui-component để phân tích src/pages/HistoryPage.tsx
```

### Phân tích sau khi refactor (verify)
```
Hãy dùng workflow split-ui-component để kiểm tra lại src/components/ui/ xem còn vấn đề nào không
```

> 📁 Báo cáo sẽ được lưu tự động tại `lotus-agent/report/split-ui-report-YYYYMMDD-HHmm.md`

---

## 💡 Tips

| Muốn làm gì | Dùng cái nào |
|-------------|-------------|
| Tìm nhanh duplicate + hardcode trong 1 file | **Skill** check-dup-hardcode |
| Phân tích toàn project + tạo báo cáo | **Workflow** check-dup-hardcode |
| Chấm điểm code nhanh 1 tiêu chí | **Skill** score-code |
| Chấm điểm đầy đủ với trọng số loại bài | **Workflow** score-code |
| Kiểm tra component structure nhanh | **Skill** split-ui-component |
| Phân tích toàn bộ UI + action plan | **Workflow** split-ui-component |
