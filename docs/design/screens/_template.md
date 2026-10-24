# [Tên màn hình]

> Bản vẽ gốc: `boards/[X].dc.html` · Board chi tiết: `specs/[x].html` · Mã nguồn: `src/pages/[X]Page.tsx`

## 1. Mục đích

Một đoạn: màn hình giải quyết việc gì, người dùng đến đây khi nào, thành công trông như thế nào.

## 2. Điểm vào và điểm ra

| Từ | Cách vào | Ghi chú |
| --- | --- | --- |
| Thanh điều hướng | Mục "[nhãn]" | |
| Bảng lệnh ⌘K | Lệnh "[...]" | |
| Phím tắt | `[...]` | |

## 3. Bố cục

Sơ đồ vùng (ASCII) ở bề rộng mặc định 1200 px, tên vùng khớp tên class/component trong mã.

```
┌ PageHeader ─────────────────────────────────────────────┐
│ Tiêu đề · mô tả                       [hành động chính] │
├─────────────────────────────────────────────────────────┤
│ Vùng A                     │ Vùng B                      │
└─────────────────────────────────────────────────────────┘
```

| Vùng | Component | Kích thước / token | Cuộn |
| --- | --- | --- | --- |

## 4. Thành phần và hành động

Mỗi điều khiển một hàng. "Phản hồi" là điều người dùng thấy ngay sau khi bấm.

| # | Điều khiển | Loại (Button size · variant · appearance) | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |

## 5. Trạng thái

| Trạng thái | Khi nào | Hiển thị | Hành động có sẵn |
| --- | --- | --- | --- |
| Trống | | | |
| Đang tải | | | |
| Có dữ liệu | | | |
| Lỗi | | | |
| Thiếu khoá / model | | | |
| Module tắt | | | |

## 6. Luồng tương tác chính

Từng bước, đánh số, kèm trạng thái giao diện ở mỗi bước.

## 7. Responsive

| Bề rộng vùng nội dung | Thay đổi |
| --- | --- |
| ≥ 900 px | |
| 560–899 px | |
| < 560 px | |

## 8. Bàn phím và trợ năng

Thứ tự Tab, phím tắt, nhãn ARIA, `aria-pressed` / `aria-expanded`, vùng `aria-live`, focus khi mở/đóng lớp phủ.

## 9. Nội dung chữ (vi)

Nhãn tiếng Việt chính và khoá i18n tương ứng.

| Khoá | vi |
| --- | --- |

## 10. Chênh lệch với bản dựng hiện tại

Những gì bản vẽ có mà app chưa có (hoặc ngược lại), để làm tiếp. Không bịa tính năng: nếu bản vẽ đề xuất điều app chưa hỗ trợ, ghi rõ "đề xuất".
