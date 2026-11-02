# Workflow: score-code

Workflow chấm điểm source code theo bộ tiêu chí chuẩn.

## Mô tả

Quy trình 5 bước để đánh giá và chấm điểm source code từ bài tập đến project lớn, sử dụng skill [`score-code`](../../skill/score-code/README.md).

## Cách dùng

```
Hãy chấm điểm source code này theo workflow score-code.
Loại bài: [cơ bản | OOP/backend | project lớn]
```

## Output mẫu

```
## Kết quả chấm điểm

### Loại bài: Assignment OOP / Backend

| Tiêu chí          | Điểm tối đa | Điểm đạt | Nhận xét                            |
|-------------------|-------------|----------|-------------------------------------|
| Correctness       | 35          | 30       | Đúng logic chính, thiếu 2 edge case |
| Code Quality      | 15          | 12       | Naming tốt, còn 1 hàm dài 80 dòng  |
| Structure         | 15          | 13       | Layer rõ ràng, 1 file hơi nặng      |
| Maintainability   | 10          | 8        | Coupling thấp, 2 magic number       |
| Testing           | 10          | 7        | Có test, thiếu edge case            |
| Architecture      | 10          | 9        | Pattern phù hợp                     |
| Documentation     | 5           | 4        | README đầy đủ, thiếu API docs       |
| **Tổng**          | **100**     | **83**   |                                     |

### Điểm mạnh
- ...

### Điểm cần cải thiện
- ...
```

---

## Các tiêu chí quy chuẩn

### 1. Correctness
Code có giải quyết đúng bài toán không.

Đánh giá:
* Kết quả đúng với yêu cầu
* Xử lý đủ happy path và edge cases
* Không crash với input hợp lệ
* Output đúng format
* Không hard-code kết quả

Ví dụ lỗi:
* Sai logic
* Bỏ sót trường hợp `null`, rỗng, boundary
* Chạy đúng ví dụ mẫu nhưng sai test thực tế

Đây thường là tiêu chí quan trọng nhất.

### 2. Code Quality
Chất lượng code ở mức vi mô: đọc có rõ không, viết có sạch không.

Đánh giá:
* Tên biến, hàm, class có rõ nghĩa
* Hàm ngắn gọn, một trách nhiệm
* Ít lặp code không cần thiết
* Điều kiện, vòng lặp, biểu thức dễ hiểu
* Dùng comment hợp lý, không thừa
* Coding style nhất quán

Ví dụ lỗi:
* `a`, `b`, `tmp1`, `tmp2` khắp nơi
* Một hàm 200 dòng làm quá nhiều việc
* Magic number không giải thích
* Nested `if` quá sâu

### 3. Structure / Organization
Cách tổ chức code ở mức module/file/package.

Đánh giá:
* Chia file, class, module hợp lý
* Phân tầng rõ ràng
* Logic không nhồi hết vào 1 chỗ
* Dependency giữa các phần rõ ràng
* Dễ tìm nơi cần sửa

Ví dụ lỗi:
* Toàn bộ business logic nằm trong controller/UI
* Một file chứa quá nhiều class/hàm không liên quan
* Utility dùng lẫn lộn, không có ranh giới

Khác với `Code Quality`:
* `Code Quality` nhìn vào **cách viết từng đoạn code**
* `Structure` nhìn vào **cách sắp xếp toàn bộ codebase**

### 4. Maintainability
Code có dễ sửa, dễ mở rộng, dễ debug sau này không.

Đánh giá:
* Mức độ coupling thấp, cohesion cao
* Dễ thay đổi yêu cầu mà không vỡ nhiều chỗ
* Có tách abstraction hợp lý
* Dễ trace lỗi
* Tránh side effects khó đoán
* Config tách khỏi code cứng

Ví dụ lỗi:
* Sửa 1 rule phải đổi ở 6 file
* Logic phụ thuộc lẫn nhau quá chặt
* Nhiều giá trị hard-coded
* Không có điểm mở rộng rõ ràng

Khác với `Structure` ở chỗ:
* `Structure` là tổ chức hiện tại
* `Maintainability` là khả năng sống lâu và sửa đổi an toàn

### 5. Architecture
Thiết kế tổng thể có hợp lý với quy mô bài toán không.

Đánh giá:
* Chọn pattern/phân lớp phù hợp
* Tách domain, application, infrastructure hợp lý nếu cần
* Phụ thuộc đi đúng hướng
* Không over-engineering
* Quyết định kỹ thuật có lý do

Ví dụ lỗi:
* Bài nhỏ nhưng dựng architecture quá nặng
* Bài lớn nhưng tất cả dồn vào 1 service
* Domain logic phụ thuộc trực tiếp UI/database
* Pattern dùng sai mục đích

Lưu ý:
* Với bài nhỏ, mục này nên chấm nhẹ
* Với project/team assignment, mục này quan trọng hơn

### 6. Readability
Code có dễ đọc đối với người khác không.

Đánh giá:
* Format, spacing, naming rõ
* Ý đồ thể hiện rõ qua code
* Luồng xử lý dễ theo dõi
* Ít trick khó hiểu
* Comment hỗ trợ đúng chỗ

Ví dụ lỗi:
* Viết ngắn quá mức, khó hiểu
* Dùng nhiều toán tử lồng nhau
* Tên hàm không phản ánh hành vi

Tiêu chí này có thể gộp vào `Code Quality`, nhưng nhiều nơi tách riêng.

### 7. Testability / Testing
Code có dễ test không, và có test đủ tốt không.

Đánh giá:
* Có unit test/integration test nếu yêu cầu
* Test cover case quan trọng
* Test dễ đọc, có ý nghĩa
* Code thiết kế để mock/stub được khi cần
* Tránh phụ thuộc khiến test khó viết

Ví dụ lỗi:
* Không có test
* Test chỉ kiểm tra case đẹp
* Code phụ thuộc global state nên khó test
* Test quá fragile

### 8. Performance / Efficiency
Hiệu năng có phù hợp yêu cầu không.

Đánh giá:
* Độ phức tạp thời gian/bộ nhớ hợp lý
* Không có bottleneck rõ ràng
* Không query/lặp thừa
* Chọn cấu trúc dữ liệu phù hợp

Ví dụ lỗi:
* Dùng thuật toán O(n²) cho bài cần O(n log n)
* Query database trong loop
* Copy dữ liệu không cần thiết

### 9. Reliability / Robustness
Mức độ ổn định và an toàn khi chạy thực tế.

Đánh giá:
* Xử lý lỗi hợp lý
* Validate input
* Không làm chương trình chết vì lỗi có thể xử lý
* Timeout/retry nếu bối cảnh cần
* Trạng thái hệ thống nhất quán

Ví dụ lỗi:
* Bỏ qua exception
* Không check dữ liệu đầu vào
* Lỗi 1 phần làm hỏng toàn luồng

### 10. Security
Nếu bài có liên quan web/app/backend.

Đánh giá:
* Validate và sanitize input
* Không lộ secret
* Phân quyền đúng
* Tránh SQL injection, XSS, command injection
* Mã hóa/password handling đúng chuẩn

Ví dụ lỗi:
* Hard-code API key
* Ghép SQL bằng string
* Trả lỗi lộ stack trace nhạy cảm

### 11. Documentation
Code có được giải thích đủ để người khác hiểu và dùng không.

Đánh giá:
* README rõ
* Hướng dẫn chạy/build/test
* Comment cho logic khó
* API docs nếu cần
* Ghi rõ assumptions/limitations

Ví dụ lỗi:
* Không có cách chạy project
* Comment thừa, chỉ lặp lại code
* Thiếu giải thích ở đoạn business logic phức tạp

### 12. Consistency / Convention
Code có tuân theo chuẩn chung của team/ngôn ngữ không.

Đánh giá:
* Theo style guide
* Quy ước naming nhất quán
* Cách tổ chức thư mục theo convention
* Cách xử lý lỗi, logging, test theo cùng một kiểu

Ví dụ lỗi:
* Chỗ camelCase, chỗ snake_case
* Mỗi file một kiểu tổ chức khác nhau

---

## Những tiêu chí hay bị chồng chéo

| Tên tiêu chí chuẩn | Ý nghĩa chính | Phạm vi |
|---|---|---|
| Code Quality | Chất lượng viết code | Mức dòng/hàm/class |
| Structure | Tổ chức module, file, layer | Mức codebase |
| Maintainability | Dễ sửa, dễ mở rộng, dễ debug | Mức vòng đời |
| Architecture | Thiết kế tổng thể, hướng phụ thuộc | Mức hệ thống |

Cách nhớ nhanh:
* **Code Quality** = viết có sạch không
* **Structure** = sắp xếp có gọn không
* **Maintainability** = sau này sửa có đau không
* **Architecture** = thiết kế tổng thể có đúng không

---

## Mẫu rubric không chấm trùng

| Tiêu chí | Được chấm gì | Không chấm trùng với |
|---|---|---|
| Correctness | Kết quả đúng, edge case | Không tính style |
| Code Quality | Naming, readability, duplication, hàm/class rõ ràng | Không tính kiến trúc tổng thể |
| Structure | Cách chia file/module/layer | Không tính naming chi tiết |
| Maintainability | Dễ sửa, coupling/cohesion, mở rộng | Không tính correctness |
| Architecture | Quyết định thiết kế tổng thể | Không tính format/micro-style |
| Testing | Chất lượng test và khả năng test | Không tính docs |
| Documentation | README, comment, hướng dẫn | Không tính logic code |

---

## Bộ rubric & Trọng số gợi ý

### Bài lập trình cơ bản
| Tiêu chí | Điểm |
|---|---:|
| Correctness | 50 |
| Code Quality | 20 |
| Structure | 10 |
| Testing | 10 |
| Documentation | 10 |

### Assignment OOP / Backend
| Tiêu chí | Điểm |
|---|---:|
| Correctness | 35 |
| Code Quality | 15 |
| Structure | 15 |
| Maintainability | 10 |
| Testing | 10 |
| Architecture | 10 |
| Documentation | 5 |

### Project lớn / Đồ án nhóm
| Tiêu chí | Điểm |
|---|---:|
| Correctness | 25 |
| Architecture | 15 |
| Code Quality | 15 |
| Maintainability | 15 |
| Testing | 10 |
| Performance | 10 |
| Security | 5 |
| Documentation | 5 |

### Viezan Electron local-first app
| Tiêu chí | Điểm |
|---|---:|
| Correctness | 20 |
| Architecture | 15 |
| Security | 15 |
| Reliability | 15 |
| Code Quality | 10 |
| Maintainability | 10 |
| Testing | 10 |
| Performance | 3 |
| Documentation | 2 |

Áp dụng khi chấm code trong repo Viezan. Security và Reliability được nâng trọng số vì app xử lý API key qua keychain, IPC/preload boundary, provider calls, audio/stream và dữ liệu dịch local-first.

---

## Gợi ý định nghĩa ngắn gọn để AI chấm

* **Code Quality**: đánh giá naming, độ rõ ràng, duplication, độ dài hàm, magic number, style consistency
* **Structure**: đánh giá cách chia module, file, layer, separation of concerns
* **Maintainability**: đánh giá coupling, cohesion, extensibility, ease of debugging, config vs hard-code
* **Architecture**: đánh giá design decisions ở mức hệ thống, dependency direction, pattern suitability, tránh over-engineering

---

## Kết luận: Bộ 7 tiêu chí khuyến nghị

Nếu muốn bộ tiêu chí "chuẩn" và dùng được với AI:

* Correctness
* Code Quality
* Structure
* Maintainability
* Architecture
* Testing
* Documentation

Nếu cần thực tế hơn cho backend/web/app thì thêm:
* Performance
* Security
* Reliability
