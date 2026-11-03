# Rule: generate-code

Bộ quy tắc để AI generate code đạt chất lượng cao, được xây dựng trực tiếp từ bộ tiêu chí đánh giá [`score-code`](../../skill/score-code/README.md).

> **Nguyên tắc cốt lõi**: Mỗi rule được ánh xạ 1-1 với một tiêu chí chấm điểm. Code được generate theo đúng các rule này sẽ đạt điểm tốt khi chấm bằng workflow `score-code`.

> **Viezan override**: Khi generate code trong repo Viezan, áp dụng thêm rule [`viezan-product-engineering`](../viezan-product-engineering/README.md). Các yêu cầu local-first, API key trong Main Process/keychain, IPC boundary, i18n VI/EN/JA và icon registry có độ ưu tiên cao hơn ví dụ generic trong file này.

---

## Tổng quan bộ rule

| # | Rule | Tiêu chí tương ứng | Mức độ ưu tiên |
|---|------|-------------------|----------------|
| 1 | [Correctness Rules](#1-correctness-rules) | Correctness | 🔴 Bắt buộc |
| 2 | [Code Quality Rules](#2-code-quality-rules) | Code Quality | 🔴 Bắt buộc |
| 3 | [Structure Rules](#3-structure-rules) | Structure | 🟠 Quan trọng |
| 4 | [Maintainability Rules](#4-maintainability-rules) | Maintainability | 🟠 Quan trọng |
| 5 | [Architecture Rules](#5-architecture-rules) | Architecture | 🟠 Quan trọng |
| 6 | [Testing Rules](#6-testing-rules) | Testing | 🟡 Khuyến nghị |
| 7 | [Documentation Rules](#7-documentation-rules) | Documentation | 🟡 Khuyến nghị |
| 8 | [Performance Rules](#8-performance-rules) | Performance | 🟡 Khuyến nghị |
| 9 | [Security Rules](#9-security-rules) | Security | 🔴 Bắt buộc (web/app/backend) |
| 10 | [Reliability Rules](#10-reliability-rules) | Reliability | 🔴 Bắt buộc |

---

## Cách dùng

### Với một task generate code đơn giản
```
Áp dụng rule generate-code với priority: Correctness, Code Quality, Reliability.
Implement: [yêu cầu]
```

### Với một project OOP/Backend
```
Áp dụng toàn bộ rule generate-code.
Loại project: OOP/Backend
Implement: [yêu cầu]
```

### Kiểm tra sau khi generate
```
Sau khi generate xong, hãy tự chấm điểm code vừa tạo theo workflow score-code.
```

---

## 1. Correctness Rules

> Mục tiêu: Code giải quyết đúng bài toán, xử lý đủ trường hợp.

### R-COR-01: Implement đúng spec
- Đọc kỹ yêu cầu trước khi code
- Output phải khớp với spec: kiểu dữ liệu, format, đơn vị
- Không assume — nếu spec mơ hồ, hỏi hoặc ghi rõ assumption

### R-COR-02: Xử lý edge cases
Luôn xử lý các trường hợp biên trước khi implement happy path:
- Input `null` / `undefined` / empty string / empty array
- Số âm, số 0, số rất lớn
- Chuỗi có ký tự đặc biệt
- Danh sách có 0 phần tử, 1 phần tử, nhiều phần tử trùng nhau

### R-COR-03: Không hard-code kết quả
- Không viết code trả kết quả đúng chỉ với ví dụ mẫu
- Logic phải đúng với mọi input hợp lệ
- Không dùng magic number cho business logic

### R-COR-04: Validate output
- Đảm bảo output đúng format
- Với async/stream: đảm bảo xử lý completion và partial data
- Return type phải nhất quán (không lúc trả string, lúc trả number)

---

## 2. Code Quality Rules

> Mục tiêu: Code sạch, dễ đọc, không trùng lặp, nhất quán.

### R-QUA-01: Đặt tên rõ nghĩa
```
❌ const d = new Date();
❌ function calc(a, b) { ... }
❌ let tmp1, tmp2;

✅ const currentDate = new Date();
✅ function calculateTotalPrice(basePrice, taxRate) { ... }
✅ let filteredUsers, sortedResults;
```

**Quy tắc đặt tên:**
- **Variable/Function**: camelCase, mô tả hành động hoặc nội dung
- **Class/Type/Interface**: PascalCase, danh từ
- **Constant**: UPPER_SNAKE_CASE hoặc camelCase tùy convention dự án
- **Boolean**: prefix `is`, `has`, `can`, `should` (vd: `isLoading`, `hasError`)
- **Async function**: tên mô tả hành động (vd: `fetchUserById`, không phải `getUserAsync`)

### R-QUA-02: Single Responsibility — mỗi hàm một việc
```
❌ function processAndSaveAndNotifyUser(data) {
  // validate + transform + save to DB + send email
}

✅ function validateUserData(data) { ... }
✅ function transformUserData(data) { ... }
✅ async function saveUser(user) { ... }
✅ async function notifyUser(userId) { ... }
```

**Giới hạn:**
- Hàm không quá 40 dòng (lý tưởng < 20 dòng)
- Nếu cần scroll để đọc hết 1 hàm → cần tách

### R-QUA-03: Không trùng lặp code (DRY)
- Extract thành hàm/helper khi logic lặp ≥ 2 lần
- Dùng higher-order function thay vì copy-paste với biến khác nhau
- Không copy-paste code giữa các module — tạo shared utility

### R-QUA-04: Không dùng magic number/string
```
❌ if (status === 3) { ... }
❌ setTimeout(fn, 86400000);

✅ const STATUS_COMPLETED = 3;
✅ const ONE_DAY_MS = 24 * 60 * 60 * 1000;
✅ if (status === STATUS_COMPLETED) { ... }
```

### R-QUA-05: Điều kiện và vòng lặp rõ ràng
```
❌ if (a && b && !c && (d || e)) { ... }
❌ data.filter(x => x.active && !x.deleted && x.role !== 'guest' && x.age > 18)

✅ const isEligibleForPromotion = a && b && !c && (d || e);
   if (isEligibleForPromotion) { ... }
✅ const isActiveUser = (user) => user.active && !user.deleted && user.role !== 'guest' && user.age > 18;
   data.filter(isActiveUser)
```

### R-QUA-06: Coding style nhất quán
- Nhất quán về: quotes (single/double), semicolons, trailing comma
- Nhất quán về: spacing, indentation
- Ưu tiên dùng linter config có sẵn trong dự án (eslint, prettier, biome)
- Với Viezan hiện tại: ưu tiên TypeScript strict, Vitest và Biome; không giả định ESLint nếu repo không có config/dependency.

---

## 3. Structure Rules

> Mục tiêu: Codebase có tổ chức rõ ràng, dễ điều hướng, phân tầng đúng.

### R-STR-01: Phân tầng rõ ràng
Tổ chức theo tầng, không nhồi logic vào sai layer:

```
UI Layer        → chỉ render, handle user interaction, gọi service
Service Layer   → business logic, orchestration
Data Layer      → database, API calls, persistence
Utils/Helpers   → pure functions, không side effects
```

**Vi phạm phổ biến:**
```
❌ Gọi fetch() / database query trực tiếp trong React component
❌ Business logic trong controller/route handler
❌ UI string format trong service layer
```

### R-STR-02: Mỗi file/module một trách nhiệm
- 1 file = 1 concern chính
- Không tạo file `utils.ts` chứa mọi thứ không liên quan nhau
- Nếu 1 file > 300 dòng → xem xét tách

### R-STR-03: Cấu trúc thư mục phản ánh domain
```
✅ src/
   ├── features/
   │   ├── auth/
   │   │   ├── auth.service.ts
   │   │   ├── auth.controller.ts
   │   │   └── auth.types.ts
   │   └── payment/
   │       ├── payment.service.ts
   │       └── payment.types.ts
   └── shared/
       ├── utils/
       └── types/
```

### R-STR-04: Import có hướng rõ ràng
- Layer trên import layer dưới, không ngược lại
- Không có circular import giữa các module
- Shared utilities không import từ feature modules

---

## 4. Maintainability Rules

> Mục tiêu: Code dễ sửa, dễ mở rộng, thay đổi 1 chỗ không vỡ nhiều nơi.

### R-MNT-01: Coupling thấp — không phụ thuộc trực tiếp vào implementation
```
❌ // Service trực tiếp gọi MySQL
class UserService {
  getUser(id) {
    return mysql.query(`SELECT * FROM users WHERE id = ${id}`);
  }
}

✅ // Service phụ thuộc vào interface
class UserService {
  constructor(private userRepository: IUserRepository) {}
  getUser(id: string) {
    return this.userRepository.findById(id);
  }
}
```

### R-MNT-02: Config tách khỏi code
```
❌ const apiUrl = 'https://api.production.com/v2';
❌ const maxRetries = 3;

✅ const apiUrl = process.env.API_URL;
✅ const maxRetries = config.MAX_RETRIES ?? 3;
```

### R-MNT-03: Không có side effects ẩn
- Hàm không nên thay đổi state bên ngoài scope của nó mà không nói rõ
- Tên hàm phải phản ánh nếu nó có side effects (`saveUser` không phải `getUser`)
- Tránh mutate tham số truyền vào

```
❌ function filterActiveUsers(users) {
  users.splice(0); // mutates original array!
  return users.filter(u => u.active);
}

✅ function filterActiveUsers(users: User[]): User[] {
  return users.filter(u => u.active); // pure, no mutation
}
```

### R-MNT-04: Dễ mở rộng — Open/Closed Principle
- Thiết kế để thêm feature mới mà không sửa code cũ
- Dùng strategy pattern, factory, plugin pattern khi logic có thể mở rộng
- Tránh `switch/if-else` dài dựa trên type — dùng polymorphism hoặc map

### R-MNT-05: Abstraction phù hợp
- Không under-abstract: copy-paste logic → khó sửa
- Không over-abstract: tạo interface/base class cho mọi thứ → khó hiểu
- Nguyên tắc: abstract khi có ≥ 2 implementation hoặc cần swap

---

## 5. Architecture Rules

> Mục tiêu: Thiết kế tổng thể hợp lý với quy mô bài toán, không over/under-engineer.

### R-ARC-01: Chọn pattern phù hợp quy mô
| Quy mô | Pattern phù hợp |
|--------|----------------|
| Script nhỏ | Procedural, functional |
| CRUD app | MVC, layered architecture |
| Monolith phức tạp | Clean Architecture, DDD-lite |
| Microservices | Event-driven, CQRS khi cần |

**Tránh**: dùng microservices cho app 3 người dùng; dùng monolith cho hệ thống cần scale độc lập.

### R-ARC-02: Dependency đi đúng hướng
- Domain/Business logic không phụ thuộc vào Infrastructure (DB, HTTP, filesystem)
- Dùng Dependency Injection hoặc interface để đảo ngược phụ thuộc
- Vẽ dependency diagram trước khi code nếu cần

### R-ARC-03: Không circular dependency
- Module A không import Module B nếu B đang import A
- Nếu 2 module cần nhau → extract interface hoặc event bus
- Dùng tool kiểm tra: `madge`, `dependency-cruiser`

### R-ARC-04: Không over-engineering
```
❌ Tạo AbstractFactoryBuilderProvider cho class chỉ dùng 1 lần
❌ Implement EventBus cho app 1 màn hình
❌ Dùng CQRS cho simple CRUD

✅ Bắt đầu đơn giản, refactor khi có nhu cầu thực tế
✅ YAGNI — You Aren't Gonna Need It
```

### R-ARC-05: Quyết định kỹ thuật có lý do
- Comment lý do chọn pattern (đặc biệt khi không phổ biến)
- Ghi lại ADR (Architecture Decision Record) cho quyết định quan trọng
- Ưu tiên solution đơn giản nhất đáp ứng yêu cầu

---

## 6. Testing Rules

> Mục tiêu: Code có test cover case quan trọng, test dễ đọc và dễ maintain.

### R-TST-01: Test cover đủ case
Với mỗi function/module, test các nhóm:
1. **Happy path** — input bình thường, kết quả mong đợi
2. **Edge cases** — null, empty, boundary values
3. **Error cases** — input sai, exception, network failure
4. **Integration** — khi các module tương tác nhau

### R-TST-02: Test có tên mô tả
```
❌ it('test 1', ...)
❌ it('works', ...)

✅ it('should return empty array when input is null', ...)
✅ it('should throw ValidationError when email is invalid', ...)
✅ describe('calculateTax', () => {
     it('should apply 10% rate for standard items', ...)
     it('should apply 0% rate for exempt items', ...)
   })
```

### R-TST-03: Code phải testable
- Inject dependencies thay vì tạo trực tiếp trong hàm
- Không phụ thuộc global state / singleton
- Pure functions dễ test nhất — ưu tiên pure functions cho business logic

### R-TST-04: Mock đúng cách
- Chỉ mock external dependencies (DB, API, filesystem)
- Không mock implementation detail nội bộ
- Cleanup mock sau mỗi test (`afterEach`, `afterAll`)

### R-TST-05: Test phải nhanh và stable
- Unit test < 100ms
- Không phụ thuộc network trong unit test
- Tránh `setTimeout` / `sleep` trong test — dùng fake timers

---

## 7. Documentation Rules

> Mục tiêu: Code được giải thích đủ để người khác hiểu và sử dụng.

### R-DOC-01: README phải có đủ thông tin cơ bản
```markdown
✅ README phải chứa:
- Mô tả ngắn gọn dự án làm gì
- Cách cài đặt (prerequisites, install)
- Cách chạy (development, production)
- Cách chạy test
- Các biến môi trường cần thiết
```

### R-DOC-02: Comment giải thích "tại sao", không phải "cái gì"
```
❌ // Tăng i lên 1
i++;

❌ // Lấy user theo id
const user = await getUser(id);

✅ // Skip first element because API always returns a dummy header record
const records = apiResponse.slice(1);

✅ // Use setTimeout to avoid race condition with the animation frame
setTimeout(() => updateDOM(), 0);
```

### R-DOC-03: Document public API và function phức tạp
```typescript
/**
 * Calculate compound interest over time.
 * Uses continuous compounding formula: A = P * e^(rt)
 *
 * @param principal - Initial investment amount in VND
 * @param rate - Annual interest rate (e.g., 0.05 for 5%)
 * @param years - Investment period in years
 * @returns Final amount including interest
 * @throws {Error} If principal or rate is negative
 */
function calculateCompoundInterest(principal: number, rate: number, years: number): number
```

### R-DOC-04: Ghi rõ assumptions và limitations
```
// NOTE: This function assumes dates are in UTC timezone.
// Local timezone handling must be done by the caller.

// LIMITATION: Maximum 1000 items per batch due to API constraint.
// For larger datasets, use the bulk endpoint instead.
```

### R-DOC-05: Không có dead comment
```
❌ // TODO: fix this (từ 2 năm trước, không ai sửa)
❌ // const oldCode = ...; (code đã xóa)
❌ // This function does XYZ (chỉ lặp lại tên hàm)
```

---

## 8. Performance Rules

> Mục tiêu: Hiệu năng phù hợp yêu cầu, không có bottleneck rõ ràng.

### R-PRF-01: Chọn cấu trúc dữ liệu phù hợp
```
❌ Dùng Array.find() trong vòng lặp lớn → O(n²)
✅ Tạo Map/Set từ array trước, sau đó lookup → O(n)

❌ Array cho frequent lookup by id
✅ Map/Object cho frequent lookup by id
```

### R-PRF-02: Tránh lặp thừa
```
❌ // Hai vòng lặp qua cùng một array
const names = users.map(u => u.name);
const emails = users.map(u => u.email);

✅ // Một vòng lặp
const { names, emails } = users.reduce((acc, u) => {
  acc.names.push(u.name);
  acc.emails.push(u.email);
  return acc;
}, { names: [], emails: [] });
```

### R-PRF-03: Không query/fetch trong vòng lặp (N+1 problem)
```
❌ for (const orderId of orderIds) {
  const order = await db.query(`SELECT * FROM orders WHERE id = ?`, [orderId]);
}

✅ const orders = await db.query(`SELECT * FROM orders WHERE id IN (?)`, [orderIds]);
```

### R-PRF-04: Lazy loading và pagination
- Không load toàn bộ dataset vào memory nếu không cần
- Implement pagination cho list endpoints
- Dùng streaming cho file/data lớn

### R-PRF-05: Cache kết quả đắt tiền
- Cache kết quả của computation nặng hoặc network call
- Ghi rõ cache invalidation strategy
- Tránh stale cache gây bug

---

## 9. Security Rules

> Mục tiêu: Không có lỗ hổng bảo mật rõ ràng, áp dụng cho web/app/backend.

### R-SEC-01: Không hard-code secret
```
❌ const apiKey = 'sk-1234567890abcdef';
❌ const dbPassword = 'admin123';

✅ const apiKey = process.env.API_KEY;
✅ const dbPassword = process.env.DB_PASSWORD;
// Và thêm vào .gitignore: .env
```

### R-SEC-02: Validate tất cả input từ user
```
❌ const query = `SELECT * FROM users WHERE name = '${req.body.name}'`;

✅ // Dùng parameterized query
const query = `SELECT * FROM users WHERE name = ?`;
db.query(query, [req.body.name]);

✅ // Validate schema
const schema = z.object({ name: z.string().min(1).max(100) });
const { name } = schema.parse(req.body);
```

### R-SEC-03: Sanitize output để tránh XSS
```
❌ element.innerHTML = userInput;

✅ element.textContent = userInput;
✅ // Hoặc dùng DOMPurify nếu cần render HTML
element.innerHTML = DOMPurify.sanitize(userInput);
```

### R-SEC-04: Không lộ thông tin nhạy cảm trong response/log
```
❌ return res.json({ user, password: user.password });
❌ console.log('User login:', { email, password });
❌ return res.status(500).json({ error: err.stack });

✅ return res.json({ user: { id: user.id, email: user.email } });
✅ console.log('User login attempt:', { email });
✅ return res.status(500).json({ error: 'Internal server error' });
```

### R-SEC-05: Authentication và authorization
- Luôn verify token/session trước khi xử lý request
- Không dựa vào client-side data cho authorization
- Implement rate limiting cho authentication endpoints

---

## 10. Reliability Rules

> Mục tiêu: Hệ thống ổn định, không crash vì lỗi có thể xử lý.

### R-REL-01: Xử lý lỗi đầy đủ — không bỏ qua exception
```
❌ try {
  await saveUser(user);
} catch (e) {
  // bỏ qua
}

❌ promise.catch(() => {}); // silent fail

✅ try {
  await saveUser(user);
} catch (error) {
  logger.error('Failed to save user', { userId: user.id, error });
  throw new ServiceError('Could not save user', { cause: error });
}
```

### R-REL-02: Fail fast với input không hợp lệ
```
✅ function processPayment(amount: number) {
  if (amount <= 0) {
    throw new ValidationError(`Payment amount must be positive, got: ${amount}`);
  }
  // ... proceed
}
```

### R-REL-03: Timeout cho external calls
```
❌ const response = await fetch(apiUrl); // không timeout

✅ const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 5000);
const response = await fetch(apiUrl, { signal: controller.signal });
clearTimeout(timeoutId);

✅ // Hoặc dùng library với timeout built-in
const response = await axios.get(apiUrl, { timeout: 5000 });
```

### R-REL-04: Retry với exponential backoff cho transient errors
```
✅ async function fetchWithRetry(url: string, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fetch(url);
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const delay = Math.pow(2, attempt) * 100; // 200ms, 400ms, 800ms
      await sleep(delay);
    }
  }
}
```

### R-REL-05: Trạng thái hệ thống nhất quán
- Dùng transaction cho operations cần atomic
- Rollback khi partial update thất bại
- Tránh để hệ thống ở trạng thái invalid khi có lỗi

### R-REL-06: Logging có ý nghĩa
```
❌ console.log('here');
❌ console.log('error:', e);

✅ logger.info('Payment processed', { orderId, amount, userId });
✅ logger.error('Payment failed', {
  orderId,
  amount,
  userId,
  errorCode: e.code,
  errorMessage: e.message
});
```

---

## Checklist trước khi submit code

Trước khi hoàn thành generate code, tự kiểm tra:

### 🔴 Bắt buộc (sẽ fail nếu thiếu)
- [ ] **COR**: Logic đúng với tất cả input hợp lệ
- [ ] **COR**: Xử lý null/undefined/empty
- [ ] **QUA**: Tên biến/hàm mô tả rõ nghĩa
- [ ] **QUA**: Không có magic number/string
- [ ] **REL**: Không bỏ qua exception
- [ ] **REL**: External calls có timeout
- [ ] **SEC**: Không hard-code secret (nếu có)
- [ ] **SEC**: Input được validate (nếu có user input)

### 🟠 Quan trọng
- [ ] **QUA**: Không có hàm > 40 dòng
- [ ] **QUA**: Không có logic trùng lặp
- [ ] **STR**: Logic nằm đúng layer
- [ ] **MNT**: Config tách khỏi code cứng
- [ ] **MNT**: Không mutate tham số input

### 🟡 Khuyến nghị
- [ ] **TST**: Có test cho happy path và edge cases
- [ ] **DOC**: Comment giải thích logic không rõ ràng
- [ ] **PRF**: Không có N+1 query hoặc nested loop thừa

---

## Tham khảo

- Skill chấm điểm: [`../../skill/score-code/README.md`](../../skill/score-code/README.md)
- Workflow chấm điểm: [`../../workflow/score-code/README.md`](../../workflow/score-code/README.md)
- Chi tiết rule JSON: [`./rules.json`](./rules.json)
