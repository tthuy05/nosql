# MA TRẬN ĐỐI CHIẾU YÊU CẦU ĐỀ TÀI (REQUIREMENTS COVERAGE MATRIX)
## Đề tài: Tìm hiểu công cụ P3X Redis UI để quản trị và khai thác Redis trong "Quản lý hàng đợi xử lý đơn hàng trực tuyến"

Tài liệu này đánh giá chi tiết mức độ đáp ứng của đồ án đối với các mục tiêu học thuật theo 5 nhóm trọng tâm (A, B, C, D, E), phân định rõ ràng các chức năng do **P3X Redis UI hỗ trợ trực tiếp** với các chức năng do **Redis CLI / Scripts dự án** thực hiện.

---

## BẢNG TỔNG HỢP THEO 5 NHÓM YÊU CẦU

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TỔNG HỢP ĐỐI CHIẾU 5 NHÓM                       │
│  • Nhóm A: Tìm hiểu công cụ P3X Redis UI               --> 100% COVERED│
│  • Nhóm B: Thiết kế và khai thác cấu trúc NoSQL Redis  --> 100% COVERED│
│  • Nhóm C: Ứng dụng quản lý hàng đợi xử lý đơn hàng    --> 100% COVERED│
│  • Nhóm D: Quản trị, Sao lưu và Lưu trữ bền vững       --> 100% COVERED│
│  • Nhóm E: Triển khai, Kiểm thử và Trình diễn Thực tế  --> 100% COVERED│
└────────────────────────────────────────────────────────────────────────┘
```

---

### NHÓM A: TÌM HIỂU VÀ KHAI THÁC CÔNG CỤ P3X REDIS UI

| Tiêu Chí | Nội Dung Yêu Cầu | Hiện Thực Trong Đồ Án | Công Cụ Thực Hiện | Bằng Chứng Kiểm Nghiệm | Đánh Giá |
|---|---|---|---|---|:---:|
| **A1. Cài đặt & Môi trường** | Khảo sát các hình thức cài đặt P3X Redis UI | Cài đặt ứng dụng P3X Desktop (`v2026.10.100`) trên Windows và container image `patrikx3/p3x-redis-ui` trong Docker Compose | **P3X Native / Docker** | `docs/evidence/final-2026-10-26/p3x-hash-console.txt` | **COVERED** |
| **A2. Kết nối máy chủ** | Kết nối an toàn qua TCP Socket tới Redis | Cấu hình kết nối tới `127.0.0.1:6379`, hỗ trợ mật khẩu REDIS_PASSWORD, hiển thị trạng thái `Connected: Acceptance-Isolated` | **P3X UI trực tiếp** | `p3x-hash-console.png`, `p3x-hash-console.txt` | **COVERED** |
| **A3. Quản trị cấu trúc dữ liệu** | Trực quan hóa cây namespace và chỉnh sửa dữ liệu | Cây khóa phân cấp dấu `:` (`order:*`, `queue:*`, `customer:*`). Xem chi tiết và nội dung từng key | **P3X UI trực tiếp** | `p3x-hash-console.png`, `p3x-list.png`, `p3x-processing.png`, `p3x-dlq.png`, `p3x-set.png` | **COVERED** |
| **A4. Thực thi dòng lệnh Console** | Nhúng cửa sổ CLI thực thi trực tiếp lệnh Redis | Cửa sổ Console của P3X hỗ trợ auto-complete, thực thi `PING`, `HGETALL`, `LRANGE`, `ZCARD`, `TTL`, `BGSAVE`, `LASTSAVE` | **P3X Console CLI** | `p3x-hash-console.txt`, `p3x-console-ttl.txt` | **COVERED** |
| **A5. Giám sát hệ thống (Monitoring)** | Theo dõi sức khỏe máy chủ thời gian thực | Tab Monitoring vẽ biểu đồ Real-time về Memory Usage, Connected Clients, Total Operations/sec | **P3X Monitoring Tab** | `p3x-monitoring.png`, `p3x-monitoring.txt` | **COVERED** |

---

### NHÓM B: THIẾT KẾ VÀ KHAI THÁC CẤU TRÚC DỮ LIỆU REDIS

| Tiêu Chí | Cấu Trúc NoSQL | Mục Đích Sử Dụng | Các Lệnh Tương Tác Cốt Lõi | Bằng Chứng Kiểm Thử | Đánh Giá |
|---|---|---|---|---|:---:|
| **B1. String & TTL** | `String` | Khóa Idempotency (`checkout:idempotency:{sha}`), Khóa tạm (`checkout:lock:{id}` - TTL 60s), Điều khiển Worker (`worker:control:status`) | `SET ... EX`, `GET`, `TTL`, `DEL` | Test `IDEM-01`, `IDEM-02`, `REG-01`, `p3x-console-ttl.txt` | **COVERED** |
| **B2. Hash** | `Hash` | Thực thể đơn hàng `order:{id}` lưu 16 trường: khách, tiền, trạng thái, token, thời gian | `HSET`, `HGET`, `HGETALL`, `HINCRBY` | `p3x-hash-console.png`, Test `CONSISTENCY-01`, `DEMO-06` | **COVERED** |
| **B3. List** | `List` | Hàng đợi tuần tự (`queue:orders:pending`, `dead_letter`, `processing`) và Nhật ký lịch sử (`order:{id}:history`) | `LPUSH`, `RPOP`, `LMOVE`, `LREM`, `LRANGE`, `LLEN` | `p3x-list.png`, `p3x-dlq.png`, Test `QUEUE-01`, `DEMO-06` | **COVERED** |
| **B4. Sorted Set** | `Sorted Set` | Hàng đợi ưu tiên VIP (`queue:orders:priority`) với Score từ 2 (Ưu tiên) đến 5 (VIP Đặc biệt) | `ZADD`, `ZPOPMAX`, `ZSCORE`, `ZCARD`, `ZREVRANGE` | `p3x-zset.txt`, Test `QUEUE-02`, `DEMO-08` | **COVERED** |
| **B5. Set** | `Set` | Danh mục đơn của khách (`customer:{id}:orders`) và Chỉ mục toàn bộ đơn (`orders:all:index`) | `SADD`, `SMEMBERS`, `SISMEMBER`, `SCARD` | `p3x-set.png`, Test `CONSISTENCY-01`, `DEMO-06` | **COVERED** |
| **B6. Counter** | `String Counter` | Thống kê số đơn phát sinh theo ngày (`stats:orders:count:{YYYYMMDD}`) múi giờ UTC+7 | `INCR`, `INCRBY`, `GET` | Test `CONSISTENCY-01`, `DEMO-06` | **COVERED** |

---

### NHÓM C: ỨNG DỤNG QUẢN LÝ HÀNG ĐỢI XỬ LÝ ĐƠN HÀNG

| Tiêu Chí | Nghiệp Vụ Hàng Đợi | Cơ Chế Hiện Thực Kỹ Thuật | Phân Định Thực Hiện | Bằng Chứng Kiểm Thử | Đánh Giá |
|---|---|---|---|---|:---:|
| **C1. Tiếp nhận đơn** | Idempotent Ingestion, chống tạo đơn trùng lặp | Header `Idempotency-Key` + SHA-256 fingerprint, trả kết quả đã lưu trong 24h nếu gửi lặp | **Backend Lua Script** | Test `IDEM-01` (40 reqs đồng thời), Test `LOAD-01` (110 đơn duy nhất) | **COVERED** |
| **C2. Hàng đợi FIFO** | Đơn thường xử lý theo thứ tự Vào trước - Ra trước | Nạp `LPUSH` vào pending list, bốc `RPOP` nguyên tử từ đuôi danh sách | **Backend Lua Script** | Test `QUEUE-01`, `DEMO-07` | **COVERED** |
| **C3. Hàng đợi Ưu tiên** | Đơn VIP luôn được xử lý trước đơn thường | Lua `claimOrder` kiểm tra và vét hết đơn trong Sorted Set trước khi lấy đơn List FIFO | **Backend Lua Script** | Test `QUEUE-02`, `DEMO-08` | **COVERED** |
| **C4. Background Worker** | Tiến trình Consumer xử lý độc lập bất đồng bộ | Vòng lặp `worker.js`, trễ xử lý điều chỉnh linh hoạt, gia hạn nhịp tim `Heartbeat` | **Worker Node.js** | Test `HEARTBEAT-01`, `DEMO-03` | **COVERED** |
| **C5. Trạng thái & Vòng đời** | Quản lý trạng thái khép kín | `PENDING` → `PROCESSING` → `COMPLETED` (kèm mã vận đơn và dọn dẹp metadata) | **Backend / Redis Hash** | `admin-queues.png`, `admin-detail.png`, Test `DEMO-09` | **COVERED** |
| **C6. Xử lý lỗi & DLQ** | Tự động thử lại và cách ly đơn hỏng | Đếm `retry_count`. Thất bại > 3 lần cách ly sang `queue:orders:dead_letter` | **Worker / Redis List** | `p3x-dlq.png`, Test `QUEUE-03`, `DEMO-10` | **COVERED** |
| **C7. Phục hồi DLQ** | Quản trị viên can thiệp phục hồi đơn lỗi | API `/api/admin/retry-dlq/:id` nguyên tử reset retry count và trả về đúng hàng đợi gốc | **Admin Web / Lua** | Test `QUEUE-03`, `DEMO-11` | **COVERED** |
| **C8. Watchdog Recovery** | Tự phục hồi sự cố khi Worker crash đột ngột | Watchdog quét nhịp tim quá hạn, tước quyền token cũ, cấp lại đơn cho Worker mới | **Watchdog Lua Fencing** | Test `CRASH-1`, `CRASH-5`, `DEMO-12` | **COVERED** |

---

### NHÓM D: QUẢN TRỊ DỮ LIỆU, SAO LƯU VÀ PHỤC HỒI

| Tiêu Chí | Hạng Mục Quản Trị | Cơ Chế Hiện Thực Kỹ Thuật | Phân Định Thực Hiện | Bằng Chứng Kiểm Thử | Đánh Giá |
|---|---|---|---|---|:---:|
| **D1. Lưu trữ RDB & AOF** | Bền vững hóa dữ liệu bộ nhớ xuống đĩa | Kích hoạt snapshot định kỳ trong `redis.conf` và ghi nhật ký thao tác `appendfsync everysec` | **Cấu hình Redis Engine** | Test `PERSIST-01` | **COVERED** |
| **D2. Sao lưu (Backup RDB)** | Chụp snapshot an toàn không lỗi định dạng Windows | Script `scripts/redis_snapshot.js backup` gọi BGSAVE qua client, kiểm tra chữ ký `REDIS0009` | **Script Dự Án / P3X CLI** | Test `BACKUP-01`, `DEMO-13` (File: `backup/dump_latest.rdb`) | **COVERED** |
| **D3. Phục hồi (Restore)** | Nạp lại dữ liệu, bảo toàn AOF cũ, guard an toàn | Script `redis_snapshot.js restore --confirm-restore` lưu archive, nạp RDB, chạy `BGREWRITEAOF` | **Script Dự Án** | Test `RESTORE-GUARD`, `RESTORE-01` | **COVERED** |
| **D4. Giám sát trên P3X** | Kiểm tra mốc lưu trữ và thông số bộ nhớ | Dùng P3X Console kiểm tra `LASTSAVE`, `CONFIG GET dir`, xem dung lượng RAM tiêu thụ | **P3X Console & Monitor** | `p3x-monitoring.png`, `p3x-console-ttl.txt`, `DEMO-14` | **COVERED** |

---

### NHÓM E: TRIỂN KHAI, KIỂM THỬ VÀ TRÌNH DIỄN THỰC TẾ

| Tiêu Chí | Hạng Mục Triển Khai | Hiện Trạng Thực Tế | Bằng Chứng & Tài Liệu | Đánh Giá |
|---|---|---|---|:---:|
| **E1. Cài đặt & Khởi chạy** | Script khởi động tự động trên môi trường Windows | File `scripts/start-local.bat` khởi chạy trọn vẹn 3 tiến trình (Redis, API, Worker) trên các cổng độc lập | `scripts/start-local.bat`, `docs/INSTALL_WINDOWS.md` | **COVERED** |
| **E2. Triển khai Docker** | Đóng gói hệ thống bằng Docker Compose (4 services) | File `docker-compose.yml` và `docker-compose.test.yml` đạt chuẩn cú pháp. Runtime bị chặn do WSL2 daemon của máy chủ | `docs/TEST_RESULTS.md`, `environment-results.json` | **BLOCKED (Môi trường)** |
| **E3. Bộ kiểm thử tự động** | Bộ test đa tầng: Hồi quy, Tích hợp, Chấp nhận, Tải | 35 bài test PASS, kiểm tra đầy đủ mọi tình huống biên, đo độ trễ p50/p95, phục hồi sập nguồn | `docs/TEST_RESULTS.md`, `results.json` | **COVERED** |
| **E4. Kịch bản Trình diễn** | Kịch bản demo chuẩn xác 11 bước cho buổi bảo vệ | Quy trình 11 bước có dữ liệu mẫu, thao tác cụ thể, lời thoại hướng dẫn và đối chứng P3X | `docs/DEMO_GUIDE.md`, `demo_e2e_summary.json` | **COVERED** |
| **E5. Tài liệu Bàn giao** | Báo cáo hiệu chỉnh, ma trận yêu cầu, biên bản kỹ thuật | Đầy đủ 6 tài liệu chi tiết, chuẩn hóa thuật ngữ và chuẩn bị sẵn nội dung cập nhật tiểu luận | Thư mục `docs/` | **COVERED** |

---

## PHÂN BIỆT RÕ RÀNG: CHỨC NĂNG P3X REDIS UI VS CODE DỰ ÁN

| Chức Năng | Do P3X Redis UI Thực Hiện Trực Tiếp | Do Backend API / Worker / Scripts Dự Án Thực Hiện |
|---|---|---|
| **Duyệt khóa dữ liệu** | Trực quan hóa cây namespace (`order:*`, `queue:*`), lọc theo tiền tố, xem số lượng item | Cung cấp quy ước đặt tên dấu hai chấm `:` để P3X nhóm thư mục tự động |
| **Xem chi tiết Hash** | Hiển thị bảng thuộc tính trực quan (key, value, type, encoding, ttl) | Tạo và cập nhật 16 trường nghiệp vụ của đơn hàng trong Hash |
| **Quản trị List / ZSet** | Xem từng index phần tử List, xem Score của từng member trong Sorted Set | Thực thi giải thuật FIFO (`RPOP`), Priority (`ZPOPMAX`) và chuyển hàng đợi |
| **Dòng lệnh & Debug** | Cửa sổ Console nhúng cho phép gõ trực tiếp mọi lệnh Redis nguyên thủy | Đăng ký và gọi các tập lệnh nguyên tử Redis Lua Scripts phức tạp |
| **Giám sát Sức khỏe** | Tab Monitoring vẽ biểu đồ RAM, Connected Clients, Ops/sec theo thời gian | Tối ưu hóa truy vấn để giảm thiểu tải bộ nhớ và thời gian phản hồi |
| **Xử lý nghiệp vụ đơn** | *Không can thiệp logic nghiệp vụ* | Tiếp nhận HTTP, xác thực Basic Auth, kiểm kho, tính toán, mô phỏng trễ, giao vận |
