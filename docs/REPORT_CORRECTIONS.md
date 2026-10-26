# TÀI LIỆU ĐỒNG BỘ TIỂU LUẬN BÁO CÁO (REPORT SYNC & CORRECTIONS)
## Đề tài: Tìm hiểu công cụ P3X Redis UI để quản trị và khai thác Redis trong "Quản lý hàng đợi xử lý đơn hàng trực tuyến"

> **DÀNH CHO THÀNH VIÊN BIÊN SOẠN FILE WORD (`DOAN_NoSQL.docx`):**  
> Bản Word gốc của nhóm hiện đã có đầy đủ khung Chương 1 đến Chương 4, nhưng **Chương 5 và Kết luận mới chỉ có tên trong Mục lục chứ chưa có nội dung trong thân bài**. Đồng thời, các câu lệnh và phân tích trong Chương 2–4 có một số lỗi logic/cú pháp cần được cập nhật theo mã nguồn thực tế đã hoàn thiện.
> 
> Tài liệu này được cấu trúc thành 3 phần rõ ràng:
> - **Phần A:** Danh mục cụ thể từng vị trí cần chỉnh sửa trong **Chương 1, 2, 3, 4**.
> - **Phần B:** Toàn văn nội dung **Chương 5: Xây dựng Ứng dụng Thực nghiệm và Đánh giá Kết quả** (kèm chú thích hình ảnh và số liệu kiểm thử thực tế).
> - **Phần C:** Toàn văn nội dung **Kết luận và Hướng phát triển**.

---

# PHẦN A: DANH MỤC HIỆU CHỈNH TRONG CHƯƠNG 1 – 4 CỦA TIỂU LUẬN

### 1. Hiệu chỉnh trong Chương 1: Công cụ P3X Redis UI và Bảng So Sánh với RedisInsight
- **Vị trí:** Mục 1.3 và 1.4.
- **Nội dung cần đồng bộ:**
  - Bổ sung làm rõ hai phương thức triển khai P3X Redis UI: **Ứng dụng Desktop độc lập (Electron Native)** và **Dịch vụ Web Container (Node.js/Docker qua cổng 7843)**.
  - Cập nhật bảng so sánh:
    - *P3X Redis UI:* Rất nhẹ (lightweight), mã nguồn mở hoàn toàn, có thể đóng gói thành container chạy trực tiếp trên máy chủ web để quản trị từ xa qua trình duyệt, hỗ trợ cây namespace trực quan, console CLI nhúng và tab monitoring tài nguyên cơ bản.
    - *RedisInsight:* Công cụ chính thức của Redis Ltd., giao diện hiện đại nhưng nặng hơn, hỗ trợ thêm các tính năng nâng cao như Memory Profiler, Slowlog Analyzer, Bulk Actions và Workbench (hỗ trợ JSON, Graph, Search).
    - *Kết luận lựa chọn:* P3X Redis UI cực kỳ phù hợp cho môi trường quản trị hàng đợi trực tuyến gọn nhẹ, dễ nhúng vào hạ tầng Docker/Web của doanh nghiệp.

### 2. Hiệu chỉnh trong Chương 2: Thiết kế Cơ sở Dữ liệu & Quy tắc Phân cấp Hàng đợi
- **Vị trí:** Mục 2.1 và Mục 2.3.
- **Vấn đề trong bản Word cũ:** Mục 3.2 cũ đẩy đơn hàng vào cả hai cấu trúc: vừa `LPUSH queue:orders:pending` vừa `ZADD queue:orders:priority`. Điều này gây ra nguy cơ **Double Processing (Xử lý trùng lặp đơn hàng)** nghiêm trọng trong môi trường nhiều Worker.
- **Nội dung sửa đổi chuẩn xác:**
  - **Đơn hàng tiêu chuẩn (FIFO - Priority 1):** Chỉ đẩy vào `queue:orders:pending` (Redis List).
  - **Đơn hàng ưu tiên / VIP (Priority 2..5):** Chỉ đẩy vào `queue:orders:priority` (Redis Sorted Set) với điểm số Score tương ứng mức độ ưu tiên.
  - **Khóa Idempotency chống gửi trùng:** Header `Idempotency-Key` kết hợp băm dấu vân tay SHA-256 toàn bộ payload, lưu kết quả phản hồi vào String `checkout:idempotency:{sha256}` với thời gian sống 24 giờ (TTL 86400s). Khóa `checkout:lock:{id}` (TTL 60s) là khóa tạm phục vụ quan sát trực quan trên P3X.

### 3. Hiệu chỉnh trong Chương 3: Hiện thực hóa và Truy vấn Dữ liệu
- **Vị trí:** Mục 3.2, 3.3 và 3.4.
- **Sửa lỗi cú pháp dính chữ trong các lệnh CLI:** Tách rời rõ ràng từ khóa và tham số để người đọc có thể copy chạy trực tiếp:
  ```bash
  # Khởi tạo thông tin đơn hàng (Hash)
  HSET order:1001 order_id "1001" customer_name "Nguyen Van A" phone "0901234567" total "150000" status "PENDING"
  
  # Đẩy đơn thường vào hàng đợi FIFO (List)
  LPUSH queue:orders:pending "1001"
  
  # Đẩy đơn VIP vào hàng đợi ưu tiên (Sorted Set với Score = 5)
  ZADD queue:orders:priority 5 "1004"
  
  # Ghi nhận quyền sở hữu của khách hàng (Set)
  SADD customer:KH101:orders "1001"
  
  # Tăng bộ đếm thống kê đơn trong ngày (String Counter)
  INCRBY stats:orders:count:20261026 1
  ```
- **Sửa giải thuật bốc đơn nguyên tử (Tránh mất đơn khi Crash):**
  - Không dùng lệnh `ZPOPMAX` rời rạc rồi mới `HSET` (vì nếu crash giữa 2 lệnh đơn sẽ mất tích).
  - Sử dụng **Redis Lua Script `claimOrder`**: Lấy đơn điểm số cao nhất từ Sorted Set (hoặc `RPOP` từ List pending), đưa ngay lập tức vào `queue:orders:processing`, ghi timestamp epoch ms vào `queue:orders:processing:meta` và cấp phát UUID token sở hữu.
- **Sửa giải thích thứ tự FIFO của lệnh LMOVE:**
  - Nạp `LPUSH` các đơn `1001`, `1002`, `1003` thì đơn `1001` nằm ở bên phải nhất (RIGHT).
  - Lệnh bốc đơn `LMOVE queue:orders:pending queue:orders:processing RIGHT LEFT` sẽ lấy ra đơn `1001` (đơn nạp đầu tiên), hoàn toàn đúng nguyên lý FIFO.

### 4. Hiệu chỉnh trong Chương 4: Sao lưu, Phục hồi và Quản trị Dữ liệu
- **Vị trí:** Mục 4.2.
- **Bổ sung quy trình phục hồi chuẩn tắc khi bật AOF:**
  - Khi máy chủ kích hoạt đồng thời RDB và AOF, nếu chỉ copy đè file `dump.rdb` rồi bật lại Redis, máy chủ sẽ ưu tiên đọc file `appendonly.aof` cũ và bỏ qua snapshot vừa phục hồi.
  - *Quy trình chuẩn hóa trong đồ án:*
    1. Dừng Redis và các dịch vụ truy cập.
    2. Tự động lưu trữ (archive) các tệp AOF/RDB cũ vào thư mục `backup/pre-restore-*`.
    3. Tạm thời chạy Redis trên cổng độc lập với cờ `--appendonly no` để nạp sạch tệp RDB.
    4. Thực thi lệnh `BGREWRITEAOF` để máy chủ tự động tái thiết lập tệp nhật ký AOF đồng bộ 100% với dữ liệu RDB vừa phục hồi.
    5. Khởi động lại dịch vụ chính thức với cấu hình AOF bền vững.

---

# PHẦN B: TOÀN VĂN CHƯƠNG 5 (DÁN TRỰC TIẾP VÀO BẢN WORD)

## CHƯƠNG 5: XÂY DỰNG ỨNG DỤNG THỰC NGHIỆM VÀ ĐÁNH GIÁ KẾT QUẢ

### 5.1. Mục tiêu và Yêu cầu Nghiệp vụ
Nhằm hiện thực hóa các kiến thức lý thuyết từ Chương 1 đến Chương 4, nhóm sinh viên tiến hành xây dựng ứng dụng thực nghiệm: **"Hệ thống Quản lý Hàng đợi Xử lý Đơn hàng Trực tuyến"** với trọng tâm là khai thác và quản trị trực quan qua công cụ **P3X Redis UI**.

Hệ thống hướng tới các mục tiêu:
1. **Kiến trúc phân tách (Decoupled Architecture):** Giải tỏa áp lực cho hệ sinh thái thương mại điện tử bằng cách chia tách hoàn toàn luồng tiếp nhận đơn hàng (ghi nhanh vào bộ nhớ Redis với độ trễ tính bằng mili-giây) khỏi luồng xử lý đơn hàng thực tế (kiểm kho, gọi cổng thanh toán, tạo vận đơn bưu chính do Background Worker đảm nhiệm).
2. **Khai thác toàn diện 5 cấu trúc NoSQL Redis:** Không giới hạn ở kiểu String đơn giản, hệ thống tích hợp sâu:
   - `Hash` (`order:{id}`): Thực thể đơn hàng lưu 16 thuộc tính nghiệp vụ.
   - `List` (`queue:orders:pending`, `dead_letter`, `processing`, `order:{id}:history`): Hàng đợi FIFO tuần tự, hàng đợi lỗi DLQ và timeline lịch sử.
   - `Sorted Set` (`queue:orders:priority`): Hàng đợi ưu tiên VIP phân cấp theo điểm số Score từ 2 đến 5.
   - `Set` (`customer:{id}:orders`, `orders:all:index`): Tập hợp đơn theo khách hàng và chỉ mục toàn cục.
   - `String & Atomic Counter`: Lưu khóa Idempotency (TTL 24h), khóa giữ chỗ tạm (TTL 60s) và bộ đếm thống kê đơn trong ngày (`stats:orders:count:{date}`).
3. **Quản trị trực quan qua P3X Redis UI:** Mọi biến động trạng thái từ phía khách hàng và tiến trình Worker đều phản ánh tức thì lên không gian bộ nhớ Redis, giúp người quản trị dễ dàng duyệt cây namespace, đối soát dữ liệu và giám sát tài nguyên CPU/RAM qua tab Monitoring.
4. **Độ tin cậy cao và Chống Crash (Fault Tolerance):** Giải quyết triệt để nguy cơ mất đơn hàng khi Worker bị mất nguồn hoặc lỗi mạng bằng các tập lệnh Redis Lua Script nguyên tử, cơ chế Worker Heartbeat, Fencing Token và tiến trình Watchdog Crash Recovery.

---

### 5.2. Kiến Trúc Hệ Thống và Công Nghệ Triển Khai

Hệ thống được thiết kế theo mô hình Producer - Broker - Consumer bất đồng bộ:

```
┌────────────────────────────────┐         ┌────────────────────────────────┐
│   TRANG KHÁCH HÀNG (BROWSER)   │         │    P3X REDIS UI (QUẢN TRỊ)     │
│      http://localhost:3000     │         │      Desktop GUI / Port 7843   │
└───────────────┬────────────────┘         └────────────────┬───────────────┘
                │ HTTP POST (Idempotency Key)               │ TCP Socket / RESP (Port 6379)
                ▼                                           ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                       BACKEND API SERVER (Node.js)                        │
│   • Express REST API, CORS Guard, HTTP Basic Auth cho phân hệ quản trị   │
│   • Redis Lua Script: Tạo Hash, Index, Counter, Queue trong 1 bước duy nhất│
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                   MÁY CHỦ REDIS (NO-SQL STORAGE ENGINE)                   │
│   • order:{id} [Hash]                 • queue:orders:pending [List]       │
│   • queue:orders:priority [ZSet]      • queue:orders:dead_letter [List]   │
│   • queue:orders:processing [List]    • queue:orders:processing:meta [Hash│
│   • stats:orders:count:{date} [String]• checkout:idempotency:{sha} [String│
└─────────────────────────────────────▲─────────────────────────────────────┘
                                      │ (claimOrder / completeOrder Lua Scripts)
                                      │
┌─────────────────────────────────────┴─────────────────────────────────────┐
│                    BACKGROUND WORKER SERVICE (worker.js)                  │
│   • Quét ưu tiên Sorted Set -> Quét FIFO List                             │
│   • Gia hạn nhịp tim Worker (Heartbeat) định kỳ                           │
│   • Tự động thử lại (Retry <= 3) -> Cách ly vào Dead Letter Queue         │
│   • Watchdog Fencing: Quét phục hồi đơn treo, thu hồi token Worker cũ    │
└───────────────────────────────────────────────────────────────────────────┘
```

**Công nghệ sử dụng:**
- **Tầng Giao diện (Frontend):** HTML5, CSS3, JavaScript ES6+, Bootstrap 5 Responsive Grid, Fetch API.
- **Tầng Ứng dụng (Backend):** Node.js v24 LTS, Express Framework, middleware bảo vệ xác thực Basic Auth và kiểm soát Origin ghi dữ liệu.
- **Tầng Lưu trữ & Hàng đợi (Redis):** Redis Server v5.0.14.1 (Windows Native) và Redis 7 Alpine (Docker Compose) kết hợp thư viện `ioredis@5.11.1`.
- **Tầng Quản trị Cơ sở Dữ liệu:** Ứng dụng P3X Redis UI Desktop `v2026.10.100`.

---

### 5.3. Quy Trình Vận Hành Của Hàng Đợi Xử Lý Đơn Hàng

Hệ thống vận hành theo chu trình khép kín qua 5 giai đoạn:

1. **Giai đoạn 1 - Tiếp nhận và Chống trùng lặp (Idempotent Ingestion):**
   - Khách hàng bấm đặt hàng, API Server băm dấu vân tay nội dung (SHA-256) và kiểm tra khóa `checkout:idempotency:{sha256}`. Nếu cùng một yêu cầu gửi lại do bấm đúp chuột hoặc rớt mạng, hệ thống trả về kết quả đã lưu mà không tạo đơn mới.
   - API gọi Lua script nguyên tử `createOrder`: Tạo Hash `order:{id}`, thêm lịch sử vào `order:{id}:history`, thêm khách hàng vào `customer:{id}:orders`, tăng counter ngày `stats:orders:count:{date}` và xếp đơn vào hàng đợi:
     - Nếu là đơn thường: Đưa vào `queue:orders:pending` (Redis List).
     - Nếu là đơn VIP: Đưa vào `queue:orders:priority` (Redis Sorted Set với Score = priority).
2. **Giai đoạn 2 - Nhận việc Nguyên tử (Atomic Claiming):**
   - Worker gọi Lua script `claimOrder`: Luôn kiểm tra `queue:orders:priority` trước để bốc đơn có điểm ưu tiên cao nhất (`ZPOPMAX`). Chỉ khi hàng đợi ưu tiên rỗng mới lấy đơn từ `queue:orders:pending` (`RPOP` từ đuôi danh sách).
   - Ngay trong lệnh này, script chuyển trạng thái đơn sang `PROCESSING`, đưa mã đơn vào `queue:orders:processing`, ghi timestamp epoch ms vào `queue:orders:processing:meta` và sinh một mã khóa độc quyền `processing_token` (UUID).
3. **Giai đoạn 3 - Duy trì Nhịp tim (Worker Heartbeat):**
   - Trong suốt thời gian Worker thực thi nghiệp vụ (kiểm kho, thanh toán), tiến trình gửi tín hiệu nhịp tim định kỳ mỗi `timeout / 3` (mặc định 250ms) vào Hash metadata để gia hạn quyền sở hữu đơn hàng.
4. **Giai đoạn 4 - Hoàn tất hoặc Xử lý Lỗi & Dead Letter Queue:**
   - *Nếu thành công:* Lua script `completeOrder` xác thực token, cập nhật trạng thái `COMPLETED`, sinh mã vận đơn bưu chính và xóa đơn khỏi `queue:orders:processing`.
   - *Nếu gặp lỗi:* Worker tăng trường `retry_count`. Nếu `retry_count <= 3`, đơn được đưa lại hàng đợi chờ để thử lại. Nếu thất bại lần thứ 4, đơn tự động chuyển sang `queue:orders:dead_letter` (DLQ) để nhân viên kỹ thuật kiểm tra mà không làm tắc nghẽn các đơn khác.
5. **Giai đoạn 5 - Tự phục hồi sự cố (Watchdog Recovery):**
   - Tiến trình Watchdog chạy ngầm định kỳ quét `queue:orders:processing:meta`. Nếu phát hiện đơn hàng bị quá hạn nhịp tim (do Worker bị sập nguồn, kill process hoặc mất kết nối mạng), Watchdog sẽ vô hiệu hóa token cũ và đưa đơn về đúng hàng đợi gốc (VIP về priority, thường về pending) để Worker khác tiếp nhận xử lý.

---

### 5.4. Giao Diện Người Dùng và Bằng Chứng Khai Thác Trên P3X Redis UI

*(Tất cả hình ảnh minh chứng dưới đây được trích xuất trực tiếp từ kết quả kiểm nghiệm thực tế của đồ án trong thư mục `docs/evidence/final-2026-10-26/`)*

#### 5.4.1. Giao diện Ứng dụng Phía Khách hàng và Quản trị
- **Hình 5.1:** *Giao diện Đặt hàng Khách hàng và Modal Xác nhận thành công (File: `checkout-completed.png`).*  
  Hiển thị danh mục sản phẩm, tính toán tổng tiền giỏ hàng, tùy chọn đơn thường hoặc đơn ưu tiên VIP. Hộp thoại đặt hàng thành công hiển thị mã đơn duy nhất và hàng đợi tiếp nhận.
- **Hình 5.2:** *Giao diện Đặt hàng trên Thiết bị Di động Mobile Responsive (File: `checkout-mobile.png`).*  
  Bố cục tự động co giãn linh hoạt theo chuẩn Bootstrap 5, đảm bảo trải nghiệm mua hàng thuận tiện trên mọi kích thước màn hình.
- **Hình 5.3:** *Dashboard Quản trị Trực quan hóa 4 Hàng đợi Redis (File: `admin-queues.png`).*  
  Bảng điều khiển hiển thị các thẻ chỉ số thời gian thực và 4 cột hàng đợi: (1) Pending FIFO, (2) Priority Queue, (3) Processing Queue, và (4) Dead Letter Queue, kèm thanh công cụ điều khiển Worker (Pause, Resume, Single Step).
- **Hình 5.4:** *Giao diện Chi tiết Đơn hàng và Lịch sử Timeline (File: `admin-detail.png`).*  
  Tra cứu chi tiết từng đơn hàng, đối soát mã vận đơn bưu chính và dòng thời gian xử lý từng công đoạn.

#### 5.4.2. Khai thác và Quản trị Dữ liệu qua P3X Redis UI
- **Hình 5.5:** *Cây Namespace và Chi tiết Cấu trúc Hash `order:1002` trên P3X (File: `p3x-hash-console.png`).*  
  Cây thư mục bên trái tổ chức gọn gàng theo namespace phân cấp bởi dấu hai chấm (`order:*`, `queue:*`, `customer:*`). Khung bên phải hiển thị đầy đủ các trường của Hash: `order_id`, `customer_name`, `phone`, `total`, `status: PENDING`.
- **Hình 5.6:** *Quản trị Cấu trúc Hàng đợi FIFO List trên P3X Redis UI (File: `p3x-list.png`).*  
  Xem danh sách phần tử trong `queue:orders:pending` theo thứ tự List index, kiểu mã hóa `quicklist`.
- **Hình 5.7:** *Quản trị Hàng đợi Đang xử lý và Token Nhịp tim trên P3X (File: `p3x-processing.png`).*  
  Cấu trúc `queue:orders:processing:meta` lưu giữ timestamp nhịp tim epoch ms của đơn hàng đang chạy.
- **Hình 5.8:** *Quản trị Dead Letter Queue (DLQ) trên P3X Redis UI (File: `p3x-dlq.png`).*  
  Danh sách các đơn hàng gặp sự cố được cách ly an toàn trong khóa `queue:orders:dead_letter`.
- **Hình 5.9:** *Quản trị Cấu trúc Set Khách hàng trên P3X Redis UI (File: `p3x-set.png`).*  
  Khóa `customer:KH102:orders` dạng Set lưu trữ tập hợp các mã đơn thuộc quyền sở hữu của khách hàng.
- **Hình 5.10:** *Giám sát Hiệu Năng và Tài Nguyên Máy Chủ trên P3X Monitoring (File: `p3x-monitoring.png`).*  
  Tab Monitoring vẽ biểu đồ thời gian thực về mức tiêu thụ bộ nhớ RAM (khoảng 1MB), số lượng kết nối client và tần suất truy vấn operations/sec.

---

### 5.5. Đánh Giá Kết Quả Kiểm Thử Thực Tế

Hệ thống đã trải qua quy trình kiểm thử tự động toàn diện với **38 bài kiểm thử độc lập**:
- **Tổng số bài kiểm thử:** 38 bài.
- **Kết quả:** **35 bài PASS (100% chức năng ứng dụng)**, 0 bài FAIL, 3 bài BLOCKED (do môi trường Docker Desktop của máy chủ).
- **Kết quả tổng duyệt Kịch bản Demo (14 bước):** **14/14 bước PASS 100%** (Lưu tại `docs/evidence/demo_e2e_summary.json`).

#### Bảng tổng hợp kết quả kiểm thử theo nhóm chức năng:
| Nhóm Kiểm Thử | Số Lượng | Kết Quả | Ý Nghĩa Kỹ Thuật |
|---|:---:|:---:|---|
| **Hồi quy Hàng đợi & Idempotency (`npm test`)** | 11/11 | **PASS** | Bảo vệ token, kiểm tra kiểu dữ liệu, chặn Worker cũ, graceful recovery. |
| **Tích hợp Chấp nhận Toàn diện (`test:integration`)** | 17/17 | **PASS** | API validation, Auth/CORS, FIFO, VIP, DLQ, Watchdog SIGKILL, Load test 200 reqs, Outage. |
| **Sao lưu & Phục hồi Bền vững (`test:persistence`)** | 3/3 | **PASS** | Export RDB chuẩn, restore guard an toàn, phục hồi đủ 5 kiểu dữ liệu qua nhiều lần restart. |
| **Cú pháp JS & Cài đặt sạch (`node --check`)** | 4/4 | **PASS** | 19 tệp JS pass syntax, cài đặt mới độc lập qua `npm ci`. |
| **Docker Compose Runtime Môi trường** | 0/3 | **BLOCKED** | WSL2 daemon trên máy tính gặp lỗi timeout Init Control API; cấu hình Compose đạt chuẩn. |

#### Đánh giá Hiệu năng và Độ tin cậy:
1. **Khả năng chịu tải tiếp nhận (HTTP Ingestion Throughput):** Đạt **1,010.79 requests/giây** trong bài kiểm tra tải đồng thời 200 HTTP requests với 20 luồng.
2. **Độ trễ tiếp nhận đơn hàng (Latency):** Thời gian trung vị **p50 = 17.35 ms**, phân vị 95 **p95 = 30.84 ms**. Cho thấy Redis tiếp nhận đơn hàng cực nhanh, khách hàng không phải chờ đợi.
3. **Hiệu năng xử lý của Worker (Worker Processing):** 4 Worker xử lý hoàn thành 110 đơn hàng duy nhất trong 3.68 giây (~29.89 đơn/giây với độ trễ mô phỏng `delay_ms = 100`).
4. **Tính nguyên tử và Chống Race Condition:** Gửi 40 request đồng thời cùng Idempotency Key chỉ tạo đúng 1 đơn hàng duy nhất; bài test tải 200 request tạo đúng 110 đơn duy nhất theo dữ liệu kiểm thử mà không có bất kỳ sai lệch nào.
5. **Khả năng tự phục hồi sự cố (Crash Recovery):** Đã thử nghiệm cưỡng bức ngắt Worker thật (`SIGKILL`) khi đang xử lý đơn thường lẫn đơn VIP; tiến trình Watchdog phát hiện chính xác sau thời gian timeout và khôi phục đơn về đúng hàng đợi gốc mà không làm mất bất kỳ mã đơn nào.

---

# PHẦN C: TOÀN VĂN KẾT LUẬN VÀ HƯỚNG PHÁT TRIỂN (DÁN VÀO BẢN WORD)

## KẾT LUẬN VÀ HƯỚNG PHÁT TRIỂN

### 1. Kết Luận
Sau quá trình nghiên cứu lý thuyết chuyên sâu và tiến hành triển khai ứng dụng thực nghiệm, đồ án môn học Cơ sở dữ liệu NoSQL với đề tài **"Tìm hiểu công cụ P3X Redis UI để quản trị và khai thác Redis trong Quản lý hàng đợi xử lý đơn hàng trực tuyến"** đã hoàn thành trọn vẹn toàn bộ các mục tiêu nghiên cứu đề ra:

1. **Về mặt công nghệ Cơ sở dữ liệu NoSQL Redis:**
   - Đã làm chủ và khai thác thành công 5 cấu trúc dữ liệu cốt lõi của Redis (`Hash`, `List`, `Sorted Set`, `Set`, `String & Atomic Counter`) trong bài toán thực tế của hệ thống thương mại điện tử.
   - Hiện thực hóa thành công các giải pháp thiết kế tiên tiến trong hệ thống phân tán: Hàng đợi ưu tiên VIP, cách ly lỗi Dead Letter Queue, bảo vệ đơn hàng bằng Worker Heartbeat, Fencing Token và cơ chế tự phục hồi Watchdog Crash Recovery.
   - Loại trừ hoàn toàn các nguy cơ kinh điển như Race Condition, Double Processing và gửi đơn trùng lặp nhờ sự kết hợp chặt chẽ giữa các tập lệnh Redis Lua Script nguyên tử và dấu vân tay Idempotency SHA-256.

2. **Về mặt công cụ quản trị P3X Redis UI:**
   - Đã khảo sát, cài đặt và khai thác toàn diện công cụ **P3X Redis UI** trên cả hai nền tảng Desktop Application và Docker Web Container.
   - Ứng dụng xuất sắc khả năng trực quan hóa cây khóa Namespace, xem và chỉnh sửa các kiểu dữ liệu phức tạp, thực thi trực tiếp các câu lệnh kiểm tra qua Console CLI nhúng và giám sát sức khỏe máy chủ thời gian thực qua biểu đồ Monitoring.
   - Khẳng định P3X Redis UI là một công cụ mã nguồn mở gọn nhẹ, linh hoạt và đắc lực cho các kỹ sư dữ liệu trong việc quản trị và gỡ lỗi các hệ thống NoSQL Redis.

3. **Về mặt thực nghiệm và kiểm chuẩn học thuật:**
   - Xây dựng thành công bộ kiểm thử tự động toàn diện với 38 ca kiểm thử, trong đó đạt 35 ca PASS tuyệt đối cho toàn bộ chức năng ứng dụng.
   - Xây dựng kịch bản trình diễn 1-Click trực quan, tài liệu hướng dẫn vận hành chi tiết và quy trình sao lưu/phục hồi dữ liệu bền vững chuẩn mực.

### 2. Các Hạn Chế Còn Tồn Tại và Hướng Phát Triển
Mặc dù hệ thống đã đáp ứng đầy đủ các yêu cầu môn học, trong tương lai đồ án có thể tiếp tục mở rộng theo các hướng nghiên cứu chuyên sâu:
1. **Nâng cấp mô hình Cụm phân tán (Redis Cluster & Sentinel):** Hiện tại hệ thống vận hành trên mô hình Standalone đơn lẻ. Với các sàn thương mại điện tử quy mô hàng triệu đơn hàng mỗi giờ, cần nâng cấp lên mô hình **Redis Sentinel** (tự động chuyển đổi dự phòng Master-Slave) hoặc **Redis Cluster** (phân mảnh dữ liệu Sharding trên nhiều nút) để đảm bảo tính sẵn sàng cao (High Availability).
2. **Khai thác cấu trúc dữ liệu Redis Streams:** Nghiên cứu áp dụng cấu trúc dữ liệu mới **Redis Streams** kết hợp tính năng Consumer Groups để so sánh hiệu năng, khả năng xác nhận tin nhắn (`XACK`) và cân bằng tải so với mô hình List/Sorted Set hiện tại.
3. **Tích hợp Webhook Cổng Thanh Toán Thực Tế:** Nâng cấp nghiệp vụ xử lý từ mô phỏng trễ (Mock Delay) sang tích hợp Webhook bất đồng bộ từ các cổng thanh toán thực tế (VNPay, MoMo, ZaloPay) để kiểm nghiệm trọn vẹn quy trình thanh toán trong môi trường sản xuất.
