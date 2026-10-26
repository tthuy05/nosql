# HƯỚNG DẪN TRÌNH DIỄN ĐỒ ÁN THỰC TẾ (DEMO GUIDE)
## Đề tài: Tìm hiểu công cụ P3X Redis UI để quản trị và khai thác Redis trong "Quản lý hàng đợi xử lý đơn hàng trực tuyến"

Tài liệu này cung cấp kịch bản thực nghiệm từng bước chuẩn xác phục vụ thuyết trình và bảo vệ đồ án trước Giảng viên và Hội đồng chấm thi.

---

## 1. PHÂN BIỆT RÕ RÀNG HAI CÔNG CỤ TRONG HỆ THỐNG

Trước khi tiến hành trình diễn, sinh viên cần làm rõ sự khác biệt giữa hai công cụ quản trị:

| Tiêu Chí So Sánh | **P3X Redis UI** (Trọng tâm đề tài) | **Giao Diện Quản Trị Web Nội Bộ** (`/admin`) |
|---|---|---|
| **Bản chất** | Công cụ mã nguồn mở độc lập, kết nối trực tiếp vào máy chủ Redis tầng Database (Low-level Redis GUI). | Giao diện web nghiệp vụ thuộc tầng ứng dụng (Application Layer), do nhóm tự lập trình bằng HTML/JS/Bootstrap. |
| **Giao thức kết nối** | Kết nối trực tiếp qua TCP Socket Redis (cổng 6379), gửi nhận lệnh RESP (Redis Serialization Protocol). | Kết nối qua HTTP REST API tới Backend Node.js (cổng 3000). |
| **Góc nhìn dữ liệu** | Nhìn dưới dạng các cấu trúc dữ liệu gốc NoSQL: Hash, List, Sorted Set, Set, String, Key TTL, Memory Info. | Nhìn dưới dạng đối tượng nghiệp vụ: Đơn hàng, Khách hàng, Cột trạng thái, Nút bấm điều khiển quy trình. |
| **Mục đích sử dụng** | Quản trị viên cơ sở dữ liệu (DBA) kiểm tra tính toàn vẹn, debug lệnh Redis, xem cấu trúc cây namespace và giám sát hiệu năng CPU/RAM. | Nhân viên vận hành (Operations/Admin) xử lý đơn hàng, điều phối hàng đợi và can thiệp quy trình nghiệp vụ. |

---

## 2. CHUẨN BỊ MÔI TRƯỜNG VÀ KHỞI ĐỘNG HỆ THỐNG

### 2.1. Cấu hình tệp môi trường `.env`
Đảm bảo tệp `.env` tại thư mục gốc có cấu hình an toàn:
```env
PORT=3000
HOST=127.0.0.1
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
ADMIN_PASSWORD=acceptance-local-only
WORKER_DELAY_MS=2000
WORKER_MAX_RETRIES=3
```

### 2.2. Khởi động hệ thống (Chế độ Local Windows Khuyến Nghị)
1. Mở cửa sổ dòng lệnh (Terminal / CMD) tại thư mục dự án và chạy:
   ```cmd
   scripts\start-local.bat
   ```
   *Script sẽ khởi chạy 3 thành phần trong các cửa sổ riêng biệt:*
   - **Cửa sổ 1:** Máy chủ `redis-server.exe` (lắng nghe tại `127.0.0.1:6379`).
   - **Cửa sổ 2:** Backend API Server (`node src/server.js`, cổng `3000`).
   - **Cửa sổ 3:** Background Worker (`node src/worker/worker.js`).
2. Mở sẵn 3 tab trình duyệt:
   - **Tab 1 - Trang Khách Hàng:** [http://localhost:3000](http://localhost:3000)
   - **Tab 2 - Dashboard Quản Trị:** [http://localhost:3000/admin](http://localhost:3000/admin) *(Nhập User: `admin`, Password: `acceptance-local-only` khi có popup Basic Auth)*
   - **Tab 3 - Ứng dụng P3X Redis UI:** Khởi động ứng dụng **P3X Redis UI Desktop** (hoặc Web Client tại [http://localhost:7843](http://localhost:7843) nếu chạy container).

---

## 3. KỊCH BẢN TRÌNH DIỄN 11 BƯỚC CHI TIẾT

```
[B1: Khởi động] ──> [B2: Kết nối P3X] ──> [B3: Đặt hàng Web] ──> [B4: Soi Hash P3X]
                                                                        │
[B8: Lỗi & DLQ] <── [B7: Worker chạy] <── [B6: Ưu tiên VIP] <── [B5: FIFO Tuần tự]
       │
       └──> [B9: Retry DLQ] ──> [B10: Watchdog Crash] ──> [B11: Backup & Monitoring]
```

---

### BƯỚC 1: Khởi động hệ thống và Kiểm tra trạng thái
- **Mục tiêu:** Chứng minh toàn bộ các service (Redis, API, Worker) hoạt động trơn tru.
- **Thao tác:**
  1. Quan sát log khởi động trên 3 console:
     - Redis: `Ready to accept connections`.
     - API: `Web Server dang hoat dong tai http://127.0.0.1:3000`.
     - Worker: `[Worker] Khoi chay thanh cong voi Delay: 2000ms, Max Retries: 3`.
- **Kết quả mong đợi:** Cả 3 tiến trình đều sẵn sàng, không có lỗi kết nối.

---

### BƯỚC 2: Kết nối P3X Redis UI vào máy chủ Redis
- **Mục tiêu:** Trực quan hóa công cụ quản trị P3X Redis UI theo đúng trọng tâm đề tài.
- **Thao tác:**
  1. Mở P3X Redis UI Desktop.
  2. Bấm nút **[New Connection]**, nhập:
     - Connection Name: `Local-Order-Queue`
     - Host / IP: `127.0.0.1`
     - Port: `6379`
     - Password: *(để trống theo .env local)*
  3. Bấm **[Save]** và bấm **[Connect]**.
- **Kết quả mong đợi:**
  - P3X hiển thị thanh trạng thái màu xanh: `Connected: Local-Order-Queue`.
  - Khung bên trái (Tree View) hiển thị các namespace phân cấp bởi dấu hai chấm: `order:`, `queue:`, `customer:`, `stats:`.

---

### BƯỚC 3: Tạo đơn hàng từ Trang Khách hàng (Storefront)
- **Mục tiêu:** Minh họa luồng tiếp nhận đơn hàng phía người dùng và cơ chế bảo vệ Idempotency.
- **Thao tác:**
  1. Tại Tab 1 ([http://localhost:3000](http://localhost:3000)), chọn 2 sản phẩm (ví dụ: Áo Thun và Tai Nghe).
  2. Nhập họ tên: `Nguyễn Văn A`, Số điện thoại: `0901234567`.
  3. Chọn loại đơn: **Đơn thường (FIFO)**.
  4. Bấm nút **[XÁC NHẬN ĐẶT HÀNG]**.
- **Kết quả mong đợi:**
  - Nút bấm hiển thị trạng thái đang xử lý, ngăn chặn bấm liên tiếp (chống duplicate click).
  - Modal thông báo thành công xuất hiện với mã đơn (ví dụ: `DH_...`), hiển thị trạng thái ban đầu là `PENDING`.

---

### BƯỚC 4: Quan sát Redis Hash và List lịch sử trên P3X Redis UI
- **Mục tiêu:** Chứng minh dữ liệu thực tế được tổ chức chặt chẽ trong Redis theo đúng thiết kế NoSQL.
- **Thao tác:**
  1. Chuyển sang P3X Redis UI, bấm nút **Refresh** (hoặc tìm kiếm `order:`).
  2. Bấm vào khóa `order:{MÃ_ĐƠN_VỪA_TẠO}`:
     - Quan sát bảng Hash gồm: `order_id`, `customer_name`, `phone`, `total`, `status: PENDING`, `created_at`.
  3. Bấm vào khóa `order:{MÃ_ĐƠN_VỪA_TẠO}:history`:
     - Quan sát cấu trúc kiểu `List` ghi nhận sự kiện khởi tạo đầu tiên kèm dấu mốc thời gian UTC+7.
- **Kết quả mong đợi:**
  - Cấu trúc dữ liệu trực quan, rõ ràng, không bị lỗi encoding hay dính chuỗi.

---

### BƯỚC 5: Trình diễn Hàng đợi FIFO Tuần tự (First-In, First-Out)
- **Mục tiêu:** Chứng minh nguyên lý hàng đợi FIFO thông qua cấu trúc Redis List và lệnh bốc đơn nguyên tử.
- **Thao tác:**
  1. Trên Dashboard Quản Trị ([http://localhost:3000/admin](http://localhost:3000/admin)), bấm nút **[TẠM DỪNG WORKER]** (chuyển sang `PAUSED`).
  2. Tạo liên tiếp 3 đơn thường: `DH_FIFO_1`, `DH_FIFO_2`, `DH_FIFO_3`.
  3. Trên P3X Redis UI, mở khóa `queue:orders:pending` (Kiểu List):
     - Thấy danh sách chứa 3 phần tử. Phần tử vào trước nhất nằm ở đuôi danh sách.
  4. Trên Dashboard Quản Trị, bấm nút **[XỬ LÝ 1 ĐƠN (STEP)]**:
     - Quan sát thấy đúng đơn `DH_FIFO_1` được bốc ra xử lý và chuyển sang cột `Processing`.
  5. Bấm **[STEP]** lần 2 và lần 3: các đơn tiếp theo được xử lý tuần tự theo đúng thứ tự nạp vào.
- **Kết quả mong đợi:**
  - Thứ tự xử lý chuẩn xác 100% theo nguyên lý FIFO: Đơn vào trước ra trước.

---

### BƯỚC 6: Trình diễn Hàng đợi Ưu tiên VIP (Priority Queue)
- **Mục tiêu:** Chứng minh giải thuật điều phối đơn VIP bằng Redis Sorted Set bốc trước đơn thường.
- **Thao tác:**
  1. Giữ Worker ở trạng thái **[PAUSED]**.
  2. Tạo 1 đơn thường (Priority = 1) vào `queue:orders:pending`.
  3. Tạo 1 đơn VIP (Samsung Galaxy S24, chọn mức ưu tiên **VIP 5 Sao**) vào `queue:orders:priority`.
  4. Mở P3X Redis UI:
     - Mở khóa `queue:orders:priority` (Kiểu Sorted Set): thấy đơn VIP có Score = `5`.
  5. Bấm nút **[XỬ LÝ 1 ĐƠN (STEP)]** trên Dashboard:
     - Worker gọi Lua script `claimOrder`: Đơn VIP (5 sao) được bốc ra xử lý TRƯỚC dù đơn thường đã chờ sẵn trong pending queue!
- **Kết quả mong đợi:**
  - Hệ thống ưu tiên tuyệt đối cho đơn hàng giá trị cao / hội viên VIP.

---

### BƯỚC 7: Worker xử lý và Giám sát vòng đời trạng thái
- **Mục tiêu:** Chứng minh vòng đời xử lý đơn hàng diễn ra khép kín, nhất quán.
- **Thao tác:**
  1. Bấm **[TIẾP TỤC (RESUME)]** để Worker chạy tự do.
  2. Quan sát bảng Dashboard và P3X Redis UI:
     - Trạng thái Hash của đơn đổi từ `PENDING` → `PROCESSING` → `COMPLETED`.
     - Trường `processing_started_at` và `processing_token` được thiết lập khi nhận việc và tự động xóa sạch khi hoàn thành.
     - Bộ đếm thống kê ngày `stats:orders:count:{YYYYMMDD}` tự động tăng thêm 1 đơn.
- **Kết quả mong đợi:**
  - Không có hiện tượng rò rỉ token hoặc sót rác trong `queue:orders:processing:meta`.

---

### BƯỚC 8: Mô phỏng lỗi, Thử lại tự động (Retry) & Dead Letter Queue (DLQ)
- **Mục tiêu:** Chứng minh khả năng tự phục hồi lỗi và cách ly đơn hỏng theo chuẩn Reliable Queue.
- **Thao tác:**
  1. Trên Dashboard, bấm nút **[BẬT GIẢ LẬP LỖI (MOCK FAILURE)]**.
  2. Tạo 1 đơn hàng mới.
  3. Quan sát bảng Dashboard:
     - Đơn thất bại lần 1 (`retry_count: 1`) → Đẩy lại chờ thử tiếp.
     - Thất bại lần 2 (`retry_count: 2`) → Thử lại tiếp.
     - Thất bại lần 3 (`retry_count: 3`) → Đạt ngưỡng tối đa (`maxRetries=3`).
     - Lần thất bại thứ 4: Đơn tự động được cách ly sang cột **4. Dead Letter Queue** với trạng thái màu đỏ `DLQ`.
  4. Mở P3X Redis UI, xem khóa `queue:orders:dead_letter` (Kiểu List) để xác nhận đơn đã nằm trong DLQ.
- **Kết quả mong đợi:**
  - Đơn lỗi không bị mất và không gây tắc nghẽn các đơn hàng bình thường khác.

---

### BƯỚC 9: Phục hồi đơn lỗi thủ công từ Dead Letter Queue
- **Mục tiêu:** Thao tác can thiệp của Quản trị viên đối với đơn hàng sự cố.
- **Thao tác:**
  1. Trên Dashboard, tắt nút giả lập lỗi.
  2. Tại cột Dead Letter Queue, bấm nút **[🔄 RETRY]** bên cạnh đơn lỗi.
  3. Quan sát:
     - Đơn lập tức rời khỏi `queue:orders:dead_letter`.
     - `retry_count` được reset về 0, chuyển ngược về hàng đợi ban đầu (nếu là VIP về lại priority, nếu thường về pending).
     - Worker bốc lại và xử lý thành công sang trạng thái `COMPLETED`.
- **Kết quả mong đợi:**
  - Đơn được cứu hộ thành công, toàn bộ lịch sử lỗi và phục hồi được ghi vết đầy đủ vào timeline.

---

### BƯỚC 10: Trình diễn Watchdog Crash Recovery khi Worker bị ngắt đột ngột
- **Mục tiêu:** Chứng minh hệ thống không bị mất đơn hàng ngay cả khi mất điện hoặc máy chủ Worker bị sập.
- **Thao tác:**
  1. Tạm dừng Worker hoặc chỉnh trễ xử lý lên 10 giây trên giao diện.
  2. Đặt 1 đơn hàng mới; chờ đơn chuyển sang trạng thái `PROCESSING`.
  3. Vào Task Manager (hoặc CMD), cưỡng bức tắt tiến trình Worker bằng lệnh:
     ```cmd
     taskkill /f /im node.exe
     ```
     *(Lưu ý: chỉ tắt tiến trình Worker hoặc cửa sổ Worker)*.
  4. Đơn hàng lúc này vẫn nằm an toàn trong `queue:orders:processing`.
  5. Bật lại tiến trình Worker:
     ```cmd
     npm run worker
     ```
  6. Quan sát log Worker:
     - Tiến trình Watchdog phát hiện đơn hàng bị quá hạn heartbeat (`stale timeout`), tự động thu hồi đơn và cấp phát cho Worker mới xử lý hoàn tất!
- **Kết quả mong đợi:**
  - Đơn hàng không bị "nuốt chửng", tự động hồi phục 100%.

---

### BƯỚC 11: Sao lưu (Backup RDB), Phục hồi dữ liệu & Giám sát Monitoring trên P3X
- **Mục tiêu:** Hoàn thiện quy trình quản trị dữ liệu bền vững và theo dõi tài nguyên.
- **Thao tác:**
  1. **Thực hiện Sao lưu (Backup):**
     - Mở terminal chạy:
       ```cmd
       node scripts/redis_snapshot.js backup --local
       ```
     - Hệ thống gọi `BGSAVE`, kiểm tra hoàn tất và lưu file `backup/dump_latest.rdb` hợp lệ.
  2. **Kiểm tra trên P3X Console:**
     - Mở tab **Console** trên P3X Redis UI, gõ:
       ```text
       LASTSAVE
       ```
     - Nhận về timestamp snapshot mới nhất.
  3. **Giám sát thời gian thực trên P3X Monitoring:**
     - Bấm vào tab **Monitoring** (biểu tượng nhịp tim) trên thanh menu P3X:
     - Giảng viên sẽ thấy biểu đồ thời gian thực về:
       - **Memory Usage:** Dung lượng RAM tiêu thụ (khoảng vài MB).
       - **Operations / sec:** Tần suất truy vấn thực tế.
       - **Connected Clients:** Số lượng kết nối client đồng thời.
- **Kết quả mong đợi:**
  - Minh chứng đầy đủ năng lực quản trị, vận hành và khai thác toàn diện của công cụ P3X Redis UI.
