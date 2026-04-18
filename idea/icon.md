---
title: Logo Idea
---

tôi cung cấp 2 logo một dạng không có background, một có background trắng. Hãy replace âp toàn bộ icon cho phù hợp: `logo-have-background.svg`, `logo-remove-background.svg`

```Task
## Kích thước logo/app icon chuẩn: 
| Nền tảng | Kích thước chính | Định dạng khuyến nghị | Ghi chú |
|---|---:|---|---|
| macOS | 1024 × 1024 px | PNG | Dùng để xuất toàn bộ bộ icon `.icns` |
| Windows | 256 × 256 px | ICO, PNG | File `.ico` thường chứa nhiều kích thước |
| Google Chrome Extension | 128 × 128 px | PNG | Ngoài ra cần thêm các size nhỏ hơn trong `manifest` |

## Chi tiết theo từng nền tảng

### macOS

Apple thường khởi đầu từ icon gốc:

* `1024 × 1024 px`

Sau đó tạo các kích thước phổ biến:

* `16 × 16`
* `32 × 32`
* `64 × 64`
* `128 × 128`
* `256 × 256`
* `512 × 512`
* `1024 × 1024`

Lưu ý:

* Thường xuất thành file `.icns`
* Nên thiết kế trên nền vuông
* Chừa khoảng an toàn, không để chi tiết sát mép
* Nếu làm app icon hiện đại cho macOS, nên chuẩn bị bản vector hoặc nguồn lớn để export sắc nét

### Windows

Windows hỗ trợ file `.ico` chứa nhiều size khác nhau. Bộ kích thước phổ biến:

* `16 × 16`
* `24 × 24`
* `32 × 32`
* `48 × 48`
* `64 × 64`
* `128 × 128`
* `256 × 256`

Khuyến nghị:

* Xuất 1 file `.ico` chứa nhiều size
* Chuẩn bị thêm `256 × 256 px` PNG gốc để dễ chuyển đổi
* Tránh chữ nhỏ vì icon Windows thường hiển thị ở size nhỏ

### Google Extension

Chrome Extension thường cần các kích thước:

* `16 × 16`
* `32 × 32`
* `48 × 48`
* `128 × 128`

Ý nghĩa thường gặp:

* `16 × 16`: favicon / context nhỏ
* `32 × 32`: một số giao diện hiển thị trung bình
* `48 × 48`: trang quản lý extension
* `128 × 128`: Chrome Web Store và cài đặt

Ví dụ trong `manifest.json`:

```json
{
    "icons": {
        "16": "icon16.png",
        "32": "icon32.png",
        "48": "icon48.png",
        "128": "icon128.png"
    }
}
```

## Khuyến nghị thực tế

Nếu bạn muốn làm **1 bộ logo dùng chung**, hãy thiết kế file gốc:

* `1024 × 1024 px`
* nền trong suốt
* định dạng gốc: Figma / SVG / AI

Sau đó export ra:

| Mục đích | Kích thước |
|---|---:|
| macOS source | 1024 × 1024 |
| Windows ICO set | 16, 32, 48, 64, 128, 256 |
| Chrome Extension | 16, 32, 48, 128 |

## Gợi ý an toàn khi thiết kế

* Giữ logo ở giữa, chừa padding khoảng `10%–15%`
* Không dùng chi tiết quá mảnh
* Không dùng chữ nhỏ
* Đảm bảo tương phản tốt trên nền sáng và tối
* Test ở size `16 × 16` trước, nếu vẫn nhận diện được thì icon ổn

## Bảng export chuẩn đầy đủ

Dưới đây là bộ export thực tế, dễ giao cho designer hoặc developer.

| Tên file | Kích thước | Định dạng | Nền tảng | Ghi chú |
|---|---:|---|---|---|
| `icon-master.png` | 1024 × 1024 | PNG | Nguồn gốc | File master để export toàn bộ size khác |
| `icon.svg` | Vector | SVG | Nguồn gốc | Dùng để scale không vỡ |
| `macos-icon-16.png` | 16 × 16 | PNG | macOS | Size nhỏ |
| `macos-icon-32.png` | 32 × 32 | PNG | macOS | Size chuẩn nhỏ |
| `macos-icon-64.png` | 64 × 64 | PNG | macOS | Retina từ 32 |
| `macos-icon-128.png` | 128 × 128 | PNG | macOS | Finder/app display |
| `macos-icon-256.png` | 256 × 256 | PNG | macOS | Retina từ 128 |
| `macos-icon-512.png` | 512 × 512 | PNG | macOS | Retina từ 256 |
| `macos-icon-1024.png` | 1024 × 1024 | PNG | macOS | App Store / source cho `.icns` |
| `app.icns` | Multi-size | ICNS | macOS | File package icon cuối cùng |
| `win-icon-16.png` | 16 × 16 | PNG | Windows | Taskbar/list nhỏ |
| `win-icon-24.png` | 24 × 24 | PNG | Windows | Một số UI cũ |
| `win-icon-32.png` | 32 × 32 | PNG | Windows | Explorer phổ biến |
| `win-icon-48.png` | 48 × 48 | PNG | Windows | Desktop/icon view |
| `win-icon-64.png` | 64 × 64 | PNG | Windows | UI scale cao |
| `win-icon-128.png` | 128 × 128 | PNG | Windows | Preview lớn |
| `win-icon-256.png` | 256 × 256 | PNG | Windows | Nguồn cho `.ico` |
| `app.ico` | Multi-size | ICO | Windows | File icon cuối cùng |
| `ext-icon-16.png` | 16 × 16 | PNG | Chrome Extension | Toolbar/context nhỏ |
| `ext-icon-32.png` | 32 × 32 | PNG | Chrome Extension | UI trung bình |
| `ext-icon-48.png` | 48 × 48 | PNG | Chrome Extension | Trang Extensions |
| `ext-icon-128.png` | 128 × 128 | PNG | Chrome Extension | Chrome Web Store |

## Bộ file tối giản nên giao

Nếu muốn gọn nhưng vẫn đủ dùng, giao bộ sau:

| Tên file | Kích thước | Định dạng | Mục đích |
|---|---:|---|---|
| `icon.svg` | Vector | SVG | File gốc chỉnh sửa |
| `icon-master.png` | 1024 × 1024 | PNG | File gốc export |
| `app.icns` | Multi-size | ICNS | macOS |
| `app.ico` | Multi-size | ICO | Windows |
| `ext-icon-16.png` | 16 × 16 | PNG | Chrome Extension |
| `ext-icon-32.png` | 32 × 32 | PNG | Chrome Extension |
| `ext-icon-48.png` | 48 × 48 | PNG | Chrome Extension |
| `ext-icon-128.png` | 128 × 128 | PNG | Chrome Extension |

## Cấu trúc folder đề xuất

```text
assets/
    source/
        icon.svg
        icon-master.png
    macos/
        macos-icon-16.png
        macos-icon-32.png
        macos-icon-64.png
        macos-icon-128.png
        macos-icon-256.png
        macos-icon-512.png
        macos-icon-1024.png
        app.icns
    windows/
        win-icon-16.png
        win-icon-24.png
        win-icon-32.png
        win-icon-48.png
        win-icon-64.png
        win-icon-128.png
        win-icon-256.png
        app.ico
    chrome-extension/
        ext-icon-16.png
        ext-icon-32.png
        ext-icon-48.png
        ext-icon-128.png
```

## Ghi chú bàn giao cho designer

* Artboard gốc: `1024 × 1024 px`
* Nền: transparent
* Chừa safe area: khoảng `10%–15%`
* Không dùng chữ nhỏ
* Không để chi tiết quá sát mép
* Test nhận diện ở size `16 × 16`
* Nếu có bản dark/light, tách riêng:
    * `icon-light`
    * `icon-dark`

## Ghi chú bàn giao cho developer

### Chrome Extension `manifest.json`

```json
{
    "icons": {
        "16": "assets/chrome-extension/ext-icon-16.png",
        "32": "assets/chrome-extension/ext-icon-32.png",
        "48": "assets/chrome-extension/ext-icon-48.png",
        "128": "assets/chrome-extension/ext-icon-128.png"
    }
}
```

### Windows

* Dùng `app.ico` cho executable/app packaging
* File `.ico` nên chứa nhiều kích thước trong cùng 1 file

### macOS

* Dùng `app.icns` cho app bundle
* Có thể generate từ các PNG size chuẩn

## Checklist xuất file

| Hạng mục | Trạng thái cần có |
|---|---|
| File vector gốc | Có |
| PNG master 1024 | Có |
| ICNS cho macOS | Có |
| ICO cho Windows | Có |
| PNG 16/32/48/128 cho extension | Có |
| Nền transparent | Có |
| Test ở icon nhỏ | Có |

```
