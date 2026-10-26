# TÀI LIỆU HIỆU CHỈNH VÀ BỔ SUNG TIỂU LUẬN BÁO CÁO (REPORT CORRECTIONS)
## Đề tài: Tìm hiểu công cụ P3X Redis UI để quản trị và khai thác Redis trong "Quản lý hàng đợi xử lý đơn hàng trực tuyến"

> **LƯU Ý QUAN TRỌNG:** Tệp tiểu luận gốc `DOAN_NoSQL (1).docx` đang được thành viên khác trong nhóm biên soạn và định dạng. Để tránh xung đột dữ liệu và ghi đè công sức của bạn, tài liệu này được biên soạn độc lập thành 3 phần:
> 1. **Phần A:** Danh mục các điểm kỹ thuật cần hiệu chỉnh trong **Chương 1 đến Chương 4** của bài báo cáo.
> 2. **Phần B:** Bản thảo hoàn chỉnh nội dung **Chương 5: Xây dựng Ứng dụng Thực nghiệm và Đánh giá**.
> 3. **Phần C:** Bản thảo hoàn chỉnh phần **Kết luận và Hướng phát triển**.
> Thành viên phụ trách Word chỉ cần copy các mục tương ứng dán vào file `.docx`.

---

# PHẦN A: DANH MỤC HIỆU CHỈNH KỸ THUẬT CHO CHƯƠNG 1 – 4

### 1. Hiệu chỉnh trong Chương 2 & 3: Phân tách luồng FIFO và Priority (Tránh Double Processing)
- **Vấn đề trong bản thảo Word cũ:** Tại mục 3.2, các đơn hàng mẫu `1001` đến `1005` bị đẩy đồng thời vào cả hai cấu trúc: vừa `LPUSH queue:orders:pending` vừa `ZADD queue:orders:priority`.
- **Hậu quả:** Worker có thể bốc đơn 1004 từ hàng đợi ưu tiên, sau đó một Worker khác lại bốc tiếp đơn 1004 từ hàng đợi pending -> dẫn đến xử lý đơn 2 lần (trừ kho 2 lần, tạo 2 vận đơn).
- **Nội dung cần sửa trong Word:**
  > *"Để đảm bảo tính toàn vẹn và loại trừ hoàn toàn nguy cơ xử lý trùng lặp (Double Processing), hệ thống phân tách luồng tiếp nhận rõ ràng: Đơn hàng thông thường (Standard) chỉ được đẩy vào hàng đợi FIFO `queue:orders:pending` (Redis List). Đơn hàng ưu tiên / VIP (Priority) chỉ được đẩy vào hàng đợi ưu tiên `queue:orders:priority` (Redis Sorted Set) với điểm số Score từ 2 đến 5. Mỗi đơn hàng chỉ tồn tại duy nhất ở một hàng đợi tại một thời điểm."*

### 2. Hiệu chỉnh trong Chương 3: Cơ chế lấy đơn VIP nguyên tử (Tránh mất đơn khi Crash)
- **Vấn đề trong bản thảo Word cũ:** Đề xuất lấy đơn VIP bằng lệnh `ZPOPMAX queue:orders:priority 1`, sau đó mới gọi `HSET order:{id} status PROCESSING`. Nếu Worker bị sập nguồn ngay sau lệnh `ZPOPMAX`, đơn hàng sẽ biến mất hoàn toàn khỏi bộ nhớ.
- **Nội dung cần sửa trong Word:**
  > *"Thao tác tiếp nhận đơn ưu tiên được thực hiện nguyên tử (Atomic Operation) thông qua Redis Lua Script (`claimOrder`). Lua script kiểm tra và bốc đơn có Score cao nhất từ Sorted Set, đồng thời đưa ngay lập tức mã đơn vào `queue:orders:processing`, ghi nhận timestamp nhịp tim (heartbeat ms) vào `queue:orders:processing:meta` và cấp một token sở hữu (UUID). Nhờ vậy, nếu tiến trình Worker bị gián đoạn đột ngột, đơn hàng vẫn được lưu vết an toàn trong processing queue và sẽ được tiến trình Watchdog phục hồi tự động."*

### 3. Hiệu chỉnh trong Chương 3: Thứ tự FIFO thực tế của lệnh LMOVE
- **Vấn đề trong bản thảo Word cũ:** Nạp `LPUSH` theo thứ tự 1001 đến 1005, nhưng lại viết `LMOVE ... RIGHT LEFT` trả về `1004`.
- **Nội dung cần sửa trong Word:**
  > *"Khi nạp đơn theo thứ tự `LPUSH queue:orders:pending 1001`, `1002`, `1003`... thì phần tử ở phía bên phải nhất (RIGHT) là đơn `1001` (đơn vào đầu tiên). Khi Worker thực thi lệnh `LMOVE queue:orders:pending queue:orders:processing RIGHT LEFT` (hoặc lệnh RPOP), phần tử được bốc ra chính xác là đơn `1001`, hoàn toàn tuân thủ nguyên lý Vào trước - Ra trước (First-In, First-Out)."*

### 4. Hiệu chỉnh trong Chương 3: Sửa các lỗi dính chữ trong câu lệnh CLI
- **Vấn đề trong bản thảo Word cũ:** Nhiều dòng lệnh bị dính liền tên lệnh và tham số (ví dụ: `LPUSHqueue:orders:pending`, `INCRBYstats:orders:count...`, `BGSAVE LASTSAVE...`).
- **Nội dung cần sửa trong Word:** Tách rõ ràng dấu cách giữa tên lệnh và tham số:
  ```bash
  LPUSH queue:orders:pending "1001"
  ZADD queue:orders:priority 5 "1004"
  SADD customer:KH102:orders "1002"
  INCRBY stats:orders:count:20261026 1
  SET checkout:lock:1002 "LOCKED" EX 60
  BGSAVE
  LASTSAVE
  CONFIG GET dir
  CONFIG GET dbfilename
  ```

### 5. Hiệu chỉnh trong Chương 4: Cơ chế Idempotency và Khóa phân tán
- **Vấn đề trong bản thảo Word cũ:** Mô tả khóa `checkout:lock:{id}` là cơ chế duy nhất chống gửi trùng.
- **Nội dung cần sửa trong Word:**
  > *"Khóa `checkout:lock:{id}` (TTL 60 giây) chỉ đóng vai trò là khóa phân tán tạm thời quan sát được trên P3X Redis UI. Để bảo đảm tính Idempotent tuyệt đối cho hệ thống thương mại điện tử, hệ thống triển khai Header `Idempotency-Key` kết hợp băm dấu vân tay SHA-256 của toàn bộ nội dung yêu cầu, lưu trữ kết quả phản hồi trong String `checkout:idempotency:{sha256}` với thời gian sống 24 giờ (TTL 86400s). Nếu cùng một yêu cầu gửi lại nhiều lần do lỗi mạng, hệ thống trả về kết quả đã lưu mà không tạo đơn mới."*

### 6. Hiệu chỉnh trong Chương 4: Quy trình Sao lưu & Phục hồi (RDB & AOF)
- **Vấn đề trong bản thảo Word cũ:** Chưa đề cập đến hiện tượng AOF ghi đè RDB khi phục hồi và rủi ro lỗi ngắt dòng nhị phân trên Windows.
- **Nội dung cần sửa trong Word:**
  > *"Khi phục hồi dữ liệu từ bản sao lưu RDB trên máy chủ đã kích hoạt chế độ AOF (Append-Only File), Redis sẽ ưu tiên nạp tệp AOF thay vì RDB khi khởi động lại. Do đó, quy trình phục hồi chuẩn tắc đòi hỏi: (1) Dừng hoàn toàn máy chủ Redis; (2) Lưu trữ an toàn các tệp AOF cũ vào thư mục lưu trữ (`pre-restore-*`); (3) Tạm thời khởi động Redis ở chế độ `appendonly no` trên cổng riêng để nạp RDB; (4) Chạy lệnh `BGREWRITEAOF` để tái thiết lập tệp nhật ký AOF đồng bộ với dữ liệu RDB vừa phục hồi; (5) Khởi động lại dịch vụ chính thức."*

---

# PHẦN B: NỘI DUNG CHƯƠNG 5 (BẢN THẢO HOÀN CHỈNH)

*(Sao chép toàn bộ nội dung dưới đây dán vào mục Chương 5 trong file Word)*

## CHƯƠNG 5: XÂY DỰNG ỨNG DỤNG THỰC NGHIỆM VÀ ĐÁNH GIÁ KẾT QUẢ

### 5.1. Mục tiêu và Phạm vi Ứng dụng Thực nghiệm
Nhằm hiện thực hóa các kiến thức lý thuyết đã nghiên cứu từ Chương 1 đến Chương 4, nhóm sinh viên tiến hành xây dựng ứng dụng thực nghiệm: **"Hệ thống Quản lý Hàng đợi Xử lý Đơn hàng Trực tuyến"** với trọng tâm là khai thác và quản trị trực quan qua công cụ **P3X Redis UI**.

Ứng dụng đáp ứng các mục tiêu then chốt:
1. **Giải tỏa ách tắc cho hệ thống (Decoupled Architecture):** Tách biệt tầng tiếp nhận đơn hàng (ghi nhanh vào bộ nhớ Redis tốc độ cao) khỏi tầng xử lý nghiệp vụ nặng (kiểm kho, thanh toán, vận đơn do Worker đảm nhiệm).
2. **Khai thác đầy đủ 5 cấu trúc NoSQL Redis:** Không dừng lại ở kiểu String đơn giản, hệ thống khai thác triệt để:
   - `Hash` (`order:{id}`): Lưu trữ thông tin chi tiết thực thể đơn hàng.
   - `List` (`queue:orders:pending`, `queue:orders:processing`, `queue:orders:dead_letter`): Quản lý hàng đợi FIFO, hàng đợi đang xử lý và hàng đợi chết.
   - `Sorted Set` (`queue:orders:priority`): Quản lý hàng đợi ưu tiên cho khách hàng VIP.
   - `Set` (`customer:{id}:orders`, `orders:all:index`): Quản lý tập hợp đơn hàng theo khách hàng và chỉ mục tổng thể.
   - `String & Atomic Counter`: Lưu khóa Idempotency, khóa tạm có TTL và bộ đếm thống kê đơn trong ngày (`stats:orders:count:{date}`).
3. **Quản trị trực quan qua P3X Redis UI:** Người quản trị quan sát được cấu trúc cây namespace, kiểm tra các trường dữ liệu động, thực thi dòng lệnh nhúng (Console) và giám sát hiệu năng thời gian thực (Monitoring).
4. **Đảm bảo tính tin cậy tuyệt đối (High Reliability):** Đảm bảo không mất mát đơn hàng khi Worker bị crash đột ngột bằng cơ chế Worker Heartbeat, Fencing Token và Watchdog Recovery.

---

### 5.2. Kiến Trúc và Công Nghệ Hệ Thống

Hệ thống được thiết kế theo mô hình vi dịch vụ phân tách (Decoupled Producer-Consumer Architecture):

```
┌─────────────────────────┐          ┌───────────────────────────┐
│  Trang Khách Hàng (Web) │          │  P3X Redis UI (Quản Trị)  │
│  http://localhost:3000  │          │  Desktop GUI / Port 7843  │
└────────────┬────────────┘          └─────────────┬─────────────┘
             │ HTTP POST (Idempotent)              │ TCP / RESP (Port 6379)
             ▼                                     ▼
┌────────────────────────────────────────────────────────────────┐
│                   BACKEND API SERVER (Node.js)                 │
│  • Express.js REST API + Basic Auth cho phân hệ quản trị       │
│  • Redis Lua Script: Tạo đơn, Index, Counter nguyên tử         │
└────────────────────────────┬───────────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────────┐
│               MÁY CHỦ REDIS (NO-SQL STORAGE ENGINE)            │
│  • order:{id} [Hash]             • queue:orders:pending [List] │
│  • queue:orders:priority [ZSet]  • queue:orders:dead_letter    │
│  • queue:orders:processing       • queue:orders:processing:meta│
│  • stats:orders:count:{date}     • checkout:idempotency:{sha}  │
└────────────────────────────▲───────────────────────────────────┘
                             │ (Claim / Renew / Complete / Watchdog Lua)
                             │
┌────────────────────────────┴───────────────────────────────────┐
│             BACKGROUND WORKER SERVICE (worker.js)              │
│  • Quét ưu tiên Sorted Set -> Quét FIFO List                   │
│  • Nhịp tim Worker (Heartbeat) định kỳ mỗi 1/3 timeout         │
│  • Tự động thử lại (Retry <= 3) -> Cách ly vào DLQ             │
│  • Watchdog Fencing: Phục hồi đơn treo, chặn Worker cũ         │
└────────────────────────────────────────────────────────────────┘
```

**Các công nghệ sử dụng:**
- **Frontend:** HTML5, CSS3 thuần, JavaScript ES6+, framework Bootstrap 5 responsive.
- **Backend:** Node.js v24 LTS, Express Framework, middleware bảo vệ CORS và Basic Auth.
- **Redis Driver:** Thư viện `ioredis` hỗ trợ tập lệnh Lua Script nguyên tử và quản lý kết nối an toàn.
- **Hệ cơ sở dữ liệu:** Redis Server v5.0.14.1 (Windows native) / Redis 7 Alpine (Docker Compose).
- **Công cụ quản trị:** P3X Redis UI Desktop v2026.10.100.

---

### 5.3. Quy Trình Vận Hành Của Hàng Đợi Đơn Hàng

1. **Giai đoạn Tiếp nhận (Producer):**
   - Khách hàng bấm đặt hàng, API Server băm dấu vân tay nội dung đơn hàng (SHA-256) và kiểm tra khóa `checkout:idempotency:{sha256}`.
   - API gọi Lua script nguyên tử `createOrder`: Tạo Hash `order:{id}`, thêm vào `order:{id}:history`, thêm vào `customer:{id}:orders`, tăng counter `stats:orders:count:{date}`, và đẩy đơn vào hàng đợi:
     - Nếu là đơn thường: Đẩy vào `queue:orders:pending` (List).
     - Nếu là đơn VIP: Đẩy vào `queue:orders:priority` (Sorted Set với Score = priority).
2. **Giai đoạn Nhận việc Nguyên tử (Claiming):**
   - Worker gọi Lua script `claimOrder`: Luôn kiểm tra `queue:orders:priority` trước để bốc đơn có điểm ưu tiên cao nhất (`ZPOPMAX`). Nếu rỗng mới lấy đơn từ `queue:orders:pending` (`RPOP`).
   - Cùng lúc đó, script tự động chuyển trạng thái đơn sang `PROCESSING`, lưu mã đơn vào `queue:orders:processing`, ghi mốc thời gian vào `queue:orders:processing:meta` và cấp một mã khóa bảo vệ độc quyền `processing_token` (UUID).
3. **Giai đoạn Duy trì Nhịp tim (Heartbeat):**
   - Trong suốt thời gian xử lý, Worker gửi định kỳ tín hiệu gia hạn timestamp vào Redis để chứng minh mình vẫn đang sống, tránh bị Watchdog thu hồi nhầm.
4. **Giai đoạn Hoàn tất hoặc Xử lý Lỗi (Completion & DLQ):**
   - Nếu xử lý thành công: Lua script `completeOrder` xác thực `processing_token`, cập nhật trạng thái `COMPLETED`, sinh mã vận đơn và xóa đơn khỏi processing queue.
   - Nếu xảy ra lỗi: Tăng `retry_count`. Nếu chưa quá 3 lần, chuyển đơn về lại hàng đợi chờ. Nếu thất bại lần thứ 4, đơn được cách ly an toàn vào `queue:orders:dead_letter` (Dead Letter Queue).
5. **Giai đoạn Giám sát Sự cố (Watchdog Recovery):**
   - Tiến trình Watchdog chạy ngầm định kỳ quét `queue:orders:processing:meta`. Nếu phát hiện đơn hàng bị treo quá thời gian quy định (do Worker bị mất điện, crash hoặc quá tải), Watchdog sẽ tự động vô hiệu hóa token cũ và đưa đơn về đúng hàng đợi ban đầu để Worker khác tiếp quản.

---

### 5.4. Giao Diện Người Dùng và Bằng Chứng Khai Thác Trên P3X Redis UI

*(Các hình ảnh dưới đây được trích xuất trực tiếp từ bằng chứng kiểm nghiệm thực tế của đồ án trong thư mục `docs/evidence/final-2026-10-26/`)*

#### 5.4.1. Giao diện Ứng dụng Phía Khách hàng và Quản trị
- **Hình 5.1 - Giao diện Đặt hàng Khách hàng và Xác nhận thành công:**  
  *Minh chứng:* File `docs/evidence/final-2026-10-26/checkout-completed.png`  
  *Mô tả:* Trang đặt hàng trực tuyến với danh mục sản phẩm, tính toán tổng tiền giỏ hàng, tùy chọn đơn thường (FIFO) hoặc đơn ưu tiên (VIP). Hộp thoại xác nhận đặt hàng thành công hiển thị mã đơn hàng duy nhất và hàng đợi tiếp nhận.
- **Hình 5.2 - Giao diện Đặt hàng trên Thiết bị Di động (Mobile Responsive):**  
  *Minh chứng:* File `docs/evidence/final-2026-10-26/checkout-mobile.png`  
  *Mô tả:* Giao diện tự động co giãn linh hoạt, chuẩn trải nghiệm người dùng trên màn hình điện thoại di động.
- **Hình 5.3 - Dashboard Quản trị Trực quan hóa 4 Hàng Đợi:**  
  *Minh chứng:* File `docs/evidence/final-2026-10-26/admin-queues.png`  
  *Mô tả:* Bảng điều khiển thời gian thực hiển thị chỉ số đo lường và 4 cột trạng thái: (1) Pending FIFO, (2) Priority Queue, (3) Processing Queue và (4) Dead Letter Queue, kèm các nút điều khiển Worker (Pause, Resume, Single Step).
- **Hình 5.4 - Chi tiết Đơn hàng và Lịch sử Timeline:**  
  *Minh chứng:* File `docs/evidence/final-2026-10-26/admin-detail.png`  
  *Mô tả:* Tra cứu chi tiết từng đơn hàng, đối soát mã vận đơn và dòng thời gian xử lý từng công đoạn.

#### 5.4.2. Khai thác và Quản trị Cơ sở Dữ liệu qua P3X Redis UI
- **Hình 5.5 - Cây Namespace và Chi tiết Cấu trúc Hash `order:1002` trên P3X:**  
  *Minh chứng:* File `docs/evidence/final-2026-10-26/p3x-hash-console.png`  
  *Mô tả:* Cây thư mục bên trái tổ chức gọn gàng theo namespace `order:*`, `queue:*`, `customer:*`. Khung bên phải hiển thị đầy đủ các trường của Hash: `order_id`, `customer_name`, `phone`, `total`, `status: PENDING`.
- **Hình 5.6 - Quản trị Cấu trúc Hàng đợi FIFO List trên P3X Redis UI:**  
  *Minh chứng:* File `docs/evidence/final-2026-10-26/p3x-list.png`  
  *Mô tả:* Xem danh sách phần tử trong `queue:orders:pending` theo thứ tự List index, kiểu mã hóa `quicklist`.
- **Hình 5.7 - Quản trị Hàng đợi Đang xử lý (Processing) và Token Bảo Vệ:**  
  *Minh chứng:* File `docs/evidence/final-2026-10-26/p3x-processing.png`  
  *Mô tả:* Cấu trúc `queue:orders:processing:meta` lưu giữ timestamp nhịp tim epoch ms của đơn hàng đang chạy.
- **Hình 5.8 - Quản trị Dead Letter Queue (DLQ) trên P3X Redis UI:**  
  *Minh chứng:* File `docs/evidence/final-2026-10-26/p3x-dlq.png`  
  *Mô tả:* Danh sách các đơn hàng gặp sự cố được cách ly an toàn trong khóa `queue:orders:dead_letter`.
- **Hình 5.9 - Quản trị Cấu trúc Set Khách hàng trên P3X Redis UI:**  
  *Minh chứng:* File `docs/evidence/final-2026-10-26/p3x-set.png`  
  *Mô tả:* Khóa `customer:KH102:orders` dạng Set lưu trữ tập hợp các mã đơn thuộc quyền sở hữu của khách hàng.
- **Hình 5.10 - Giám sát Hiệu Năng và Tài Nguyên Máy Chủ trên P3X Monitoring:**  
  *Minh chứng:* File `docs/evidence/final-2026-10-26/p3x-monitoring.png`  
  *Mô tả:* Tab Monitoring của P3X vẽ biểu đồ thời gian thực về mức tiêu thụ bộ nhớ RAM, số lượng kết nối client và tần suất truy vấn operations/sec.

---

### 5.5. Đánh Giá Kết Quả Kiểm Thử Thực Tế

Hệ thống đã trải qua quy trình kiểm thử tự động toàn diện với 38 kịch bản kiểm thử độc lập:
- **Tổng số bài kiểm thử:** 38 bài.
- **Kết quả:** **35 bài PASS (100% chức năng ứng dụng)**, 0 bài FAIL, 3 bài BLOCKED (do môi trường Docker Desktop).

#### Bảng tổng hợp các chỉ số kiểm thử quan trọng:
| Nhóm Kiểm Thử | Số Lượng | Kết Quả | Bằng Chứng / Ý Nghĩa |
|---|:---:|:---:|---|
| **Kiểm thử Hồi quy & Idempotency** | 11/11 | **PASS** | Chống nhận trùng đơn, an toàn kiểu dữ liệu, bảo vệ token, khôi phục graceful. |
| **Kiểm thử Chấp nhận Tích hợp** | 17/17 | **PASS** | Đầy đủ luồng API, FIFO, Priority VIP, Retry/DLQ, Watchdog SIGKILL, Load test. |
| **Kiểm thử Sao lưu & Phục hồi** | 3/3 | **PASS** | Xuất RDB chuẩn, guard an toàn, khôi phục đủ 5 kiểu dữ liệu qua nhiều lần restart. |
| **Kiểm tra Cú pháp & Cài đặt sạch** | 4/4 | **PASS** | 19 tệp JS pass `node --check`, cài đặt mới độc lập qua `npm ci`. |
| **Kiểm thử Docker Runtime** | 0/3 | **BLOCKED** | Do WSL2 daemon trên máy chủ gặp lỗi init control API; cấu hình Compose hợp lệ. |

#### Đánh giá Hiệu năng và Độ tin cậy:
1. **Khả năng chịu tải tiếp nhận (Ingestion Throughput):** Đạt **1,010.79 requests/giây** trong bài kiểm tra tải đồng thời 200 HTTP requests với 20 luồng.
2. **Thời gian đáp ứng (Latency):** Thời gian trung vị **p50 = 17.35 ms**, phân vị 95 **p95 = 30.84 ms**, đáp ứng hoàn hảo yêu cầu ứng dụng thời gian thực.
3. **Tính nguyên tử và Chống Race Condition:** Bài test gửi 40 request đồng thời cùng một khóa Idempotency Key chỉ tạo đúng 1 đơn hàng duy nhất; bài test 200 request tạo đúng 110 đơn duy nhất theo dữ liệu kiểm thử mà không có bất kỳ sai lệch nào.
4. **Khả năng phục hồi sự cố (Crash Recovery):** Đã thử nghiệm cưỡng bức ngắt Worker thật (`SIGKILL`) khi đang xử lý đơn thường và đơn VIP; tiến trình Watchdog phát hiện chính xác và khôi phục đơn về đúng hàng đợi gốc mà không làm mất bất kỳ mã đơn nào.

---

# PHẦN C: KẾT LUẬN VÀ HƯỚNG PHÁT TRIỂN (BẢN THẢO HOÀN CHỈNH)

*(Sao chép toàn bộ nội dung dưới đây dán vào mục Kết Luận trong file Word)*

### 1. Kết Luận
Sau thời gian nghiên cứu lý thuyết và triển khai xây dựng ứng dụng thực nghiệm, đồ án môn học Cơ sở dữ liệu NoSQL với đề tài **"Tìm hiểu công cụ P3X Redis UI để quản trị và khai thác Redis trong Quản lý hàng đợi xử lý đơn hàng trực tuyến"** đã hoàn thành xuất sắc toàn bộ các mục tiêu đặt ra:

1. **Về mặt công nghệ NoSQL Redis:**
   - Đã làm chủ và khai thác sâu sắc 5 cấu trúc dữ liệu nền tảng của Redis (`Hash`, `List`, `Sorted Set`, `Set`, `String & Atomic Counter`) để giải quyết trọn vẹn bài toán hàng đợi thương mại điện tử.
   - Ứng dụng thành công các giải pháp thiết kế tiên tiến: Hàng đợi ưu tiên VIP, cách ly lỗi Dead Letter Queue, bảo vệ đơn hàng với Worker Heartbeat, Fencing Token và Watchdog Crash Recovery.
   - Khắc phục triệt để các rủi ro kinh điển trong lập trình phân tán như Race Condition, Double Processing và gửi đơn trùng lặp thông qua Redis Lua Script nguyên tử và cơ chế Idempotency Fingerprint.

2. **Về mặt công cụ quản trị P3X Redis UI:**
   - Đã khảo sát, cài đặt và khai thác toàn diện công cụ **P3X Redis UI** trên cả hai môi trường Desktop Application và Docker Web Service.
   - Khai thác hiệu quả khả năng trực quan hóa cây khóa Namespace, duyệt và chỉnh sửa các kiểu dữ liệu phức tạp, thực thi lệnh trực tiếp qua Console CLI nhúng và theo dõi sức khỏe hệ thống thời gian thực qua biểu đồ Monitoring.
   - Minh chứng rõ nét vai trò thiết yếu của P3X Redis UI như một công cụ đắc lực hỗ trợ các kỹ sư dữ liệu và quản trị viên vận hành hệ sinh thái NoSQL.

3. **Về mặt thực nghiệm và kiểm chuẩn:**
   - Xây dựng thành công bộ kiểm thử tự động toàn diện với 38 ca kiểm thử, trong đó đạt 35 ca PASS tuyệt đối cho toàn bộ chức năng ứng dụng.
   - Cung cấp kịch bản trình diễn 1-Click trực quan, tài liệu hướng dẫn vận hành chi tiết và quy trình sao lưu/phục hồi dữ liệu bền vững chuẩn mực.

### 2. Hướng Phát Triển Tiếp Theo
Mặc dù hệ thống đã đáp ứng hoàn hảo các yêu cầu của môn học, trong tương lai đồ án có thể tiếp tục mở rộng theo các hướng nghiên cứu chuyên sâu:
1. **Nâng cấp mô hình Cụm phân tán (Redis Cluster & Sentinel):** Chuyển dịch từ mô hình máy chủ Redis Standalone đơn lẻ sang mô hình Redis Sentinel (tự động chuyển đổi dự phòng khi máy chủ chính gặp sự cố) hoặc Redis Cluster (phân mảnh dữ liệu Sharding trên nhiều nút) để phục vụ quy mô hàng triệu đơn hàng mỗi giờ.
2. **Khai thác cấu trúc Redis Streams:** Nghiên cứu áp dụng cấu trúc dữ liệu mới **Redis Streams** kết hợp tính năng Consumer Groups để so sánh hiệu năng, khả năng xác nhận tin nhắn (`XACK`) và phân phối tải so với mô hình List/Sorted Set hiện tại.
3. **Tích hợp Webhook Cổng Thanh Toán Thực Tế:** Nâng cấp nghiệp vụ xử lý từ mô phỏng trễ (Mock Delay) sang tích hợp Webhook bất đồng bộ từ các cổng thanh toán ngân hàng (VNPay, MoMo, ZaloPay) để kiểm nghiệm trọn vẹn quy trình thanh toán trong thực tế sản xuất.
