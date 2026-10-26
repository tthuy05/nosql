# BẢNG MA TRẬN ĐỐI CHIẾU YÊU CẦU ĐỀ TÀI (REQUIREMENTS COVERAGE)
## Đề tài: Tìm hiểu công cụ P3X Redis UI để quản trị và khai thác Redis trong "Quản lý hàng đợi xử lý đơn hàng trực tuyến"

Tài liệu này đối chiếu toàn bộ các yêu cầu học thuật của đề tài môn học Cơ sở dữ liệu NoSQL với các tính năng kỹ thuật, cấu trúc dữ liệu và bằng chứng thực tế đã triển khai trong đồ án.

---

## 1. MA TRẬN ĐỐI CHIẾU CÁC YÊU CẦU CỐT LÕI

| STT | Nhóm Yêu Cầu Đề Tài | Yêu Cầu Kỹ Thuật Cụ Thể | Hiện Thực Trong Mã Nguồn | Bằng Chứng Thực Tế & Test Case | Trạng Thái |
|:---:|---|---|---|---|:---:|
| **1** | **Khai thác công cụ P3X Redis UI** | Kết nối an toàn tới máy chủ Redis (Desktop / Web Service) | Kết nối tới `127.0.0.1:6379` (hoặc cổng cấu hình). Hỗ trợ xác thực qua mật khẩu. | `docs/evidence/final-2026-10-26/p3x-hash-console.txt`, `p3x-hash-console.png` | **100% COVERED** |
| | | Trực quan hóa cấu trúc cây khóa Namespace | Cấu trúc phân cấp dấu hai chấm `:` (`order:*`, `queue:orders:*`, `customer:*`, `stats:*`). | `docs/evidence/final-2026-10-26/p3x-list.png`, `p3x-list.txt` | **100% COVERED** |
| | | Quản trị và kiểm tra 5 cấu trúc dữ liệu NoSQL | Xem chi tiết Hash, List, Sorted Set, Set, String có TTL. | `p3x-hash-console.png`, `p3x-list.png`, `p3x-zset.txt`, `p3x-set.png`, `p3x-console-ttl.txt` | **100% COVERED** |
| | | Khai thác cửa sổ dòng lệnh nhúng (Console CLI) | Thực thi các lệnh `PING`, `HGETALL`, `LRANGE`, `ZCARD`, `TTL`, `BGSAVE`, `LASTSAVE`. | `docs/evidence/final-2026-10-26/p3x-hash-console.txt`, `p3x-console-ttl.txt` | **100% COVERED** |
| | | Giám sát hiệu năng và tài nguyên máy chủ (Monitoring) | Theo dõi CPU, Memory usage, Connected Clients, Total Commands/sec qua tab Monitoring. | `docs/evidence/final-2026-10-26/p3x-monitoring.png`, `p3x-monitoring.txt` | **100% COVERED** |
| **2** | **Hàng đợi FIFO tuần tự** | Xếp hàng theo nguyên tắc Vào trước - Ra trước | Sử dụng Redis `List` với cơ chế `LPUSH` khi nạp và lấy đơn từ đuôi danh sách. | Test case `QUEUE-01`, `REG-03` | **100% COVERED** |
| | | Chuyển dịch nguyên tử không mất đơn khi nhận việc | Sử dụng Redis Lua Script `claimOrder` kết hợp đưa vào `queue:orders:processing` cùng timestamp. | `src/config/queueScripts.js`, Test `QUEUE-01` | **100% COVERED** |
| **3** | **Hàng đợi Ưu tiên (Priority Queue)** | Phân cấp đơn hàng VIP theo điểm số ưu tiên | Sử dụng Redis `Sorted Set` (`queue:orders:priority`) với điểm số Score (mức 2 đến 5). | Test case `QUEUE-02`, `REG-03` | **100% COVERED** |
| | | Đơn ưu tiên luôn được bốc trước đơn thường | Lua Script kiểm tra và vét hết đơn trong Sorted Set trước khi bốc đơn trong List FIFO. | `claimOrder` script, Test `QUEUE-02` | **100% COVERED** |
| **4** | **Xử lý lỗi & Dead Letter Queue** | Tự động thử lại (Retry) khi phát sinh sự cố | Đếm số lần thất bại bằng trường `retry_count` trong Hash, hỗ trợ cấu hình `maxRetries` linh hoạt. | Test case `QUEUE-03`, `RETRY-LIMIT-0`, `RETRY-LIMIT-3` | **100% COVERED** |
| | | Cách ly đơn lỗi nghiêm trọng vào Dead Letter Queue | Vượt quá ngưỡng thử lại (mặc định 3 lần), đơn được chuyển sang `queue:orders:dead_letter`. | `docs/evidence/final-2026-10-26/p3x-dlq.png`, Test `QUEUE-03` | **100% COVERED** |
| | | Khôi phục đơn lỗi thủ công (Admin DLQ Retry) | API `/api/admin/retry-dlq/:id` nguyên tử reset retry count và trả về đúng hàng đợi gốc. | `src/routes/api.js`, Test `QUEUE-03` | **100% COVERED** |
| **5** | **Độ tin cậy & Chống Crash** | Giám sát nhịp tim Worker (Worker Heartbeat) | Worker định kỳ gia hạn timestamp heartbeat vào Hash `queue:orders:processing:meta`. | `src/worker/worker.js`, Test `HEARTBEAT-01`, `REG-05` | **100% COVERED** |
| | | Cơ chế tự phục hồi sự cố (Watchdog Recovery) | Watchdog định kỳ quét `queue:orders:processing`, thu hồi đơn bị treo/crash về đúng hàng đợi ban đầu. | Test case `CRASH-1`, `CRASH-5`, `REG-04` | **100% COVERED** |
| | | Chặn Worker cũ ghi đè (Fencing Token) | Cấp UUID `processing_token` mỗi lượt claim; lệnh `completeOrder` chỉ chấp nhận token hợp lệ. | `completeOrder` Lua script, Test `CRASH-1` | **100% COVERED** |
| **6** | **Chống gửi đơn trùng lặp (Idempotency)** | Header `Idempotency-Key` và Fingerprint SHA-256 | Lưu kết quả phản hồi trong String `checkout:idempotency:{hash}` với TTL 24 giờ. | Test case `IDEM-01`, `IDEM-02`, `REG-01` | **100% COVERED** |
| | | Chống xung đột khi gửi đồng thời (Concurrency) | Dùng Lua script nguyên tử tạo Hash + Index + Counter + Queue trong duy nhất 1 bước. | `createOrder` script, Test `IDEM-01` (40 requests đồng thời) | **100% COVERED** |
| **7** | **Lưu trữ & Khai thác 5 cấu trúc NoSQL** | `Hash` - Thực thể đơn hàng | `order:{id}` lưu chi tiết khách, số tiền, trạng thái, token, thời gian. | `p3x-hash-console.png`, Test `CONSISTENCY-01` | **100% COVERED** |
| | | `List` - Hàng đợi tuần tự & Lịch sử | `queue:orders:pending`, `dead_letter`, `processing`, `order:{id}:history`. | `p3x-list.png`, Test `QUEUE-01`, `CONSISTENCY-01` | **100% COVERED** |
| | | `Sorted Set` - Hàng đợi ưu tiên VIP | `queue:orders:priority` xếp theo Score ưu tiên. | `p3x-zset.txt`, Test `QUEUE-02` | **100% COVERED** |
| | | `Set` - Danh mục đơn khách hàng & Chỉ mục tổng | `customer:{id}:orders` và `orders:all:index`. | `p3x-set.png`, Test `CONSISTENCY-01` | **100% COVERED** |
| | | `String` - Khóa tạm, Idempotency & Counter | `checkout:lock:{id}` (TTL 60s), `checkout:idempotency:*`, `stats:orders:count:{date}`. | `p3x-console-ttl.txt`, Test `PERSIST-01`, `CONSISTENCY-01` | **100% COVERED** |
| **8** | **Lưu trữ bền vững & Sao lưu** | Kết hợp RDB Snapshot và AOF Journal | Cấu hình `appendfsync everysec` và lưu RDB định kỳ trong `redis.conf`. | Test case `PERSIST-01` | **100% COVERED** |
| | | Script sao lưu RDB an toàn không lỗi định dạng | `scripts/redis_snapshot.js backup` xuất bản snapshot nhị phân RDB chuẩn. | Test case `BACKUP-01` | **100% COVERED** |
| | | Phục hồi offline, bảo toàn AOF cũ, guard an toàn | `scripts/redis_snapshot.js restore --confirm-restore` lưu archive trước khi nạp RDB. | Test case `RESTORE-GUARD`, `RESTORE-01` | **100% COVERED** |
| **9** | **Giao diện & Trải nghiệm (UI/UX)** | Trang đặt hàng phía khách hàng (Storefront) | Danh mục sản phẩm, giỏ hàng, chọn mức ưu tiên, tra cứu timeline trạng thái. | `checkout-completed.png`, `checkout-mobile.png`, Test `API-01` | **100% COVERED** |
| | | Dashboard Quản trị hệ thống (Admin Portal) | Trực quan 4 hàng đợi, chỉ số thời gian thực, nút điều khiển Worker (Pause/Resume/Step). | `admin-queues.png`, `admin-detail.png`, Test `CONTROL-01` | **100% COVERED** |
| **10** | **An toàn & Bảo mật** | Xác thực phân hệ quản trị | HTTP Basic Auth với mật khẩu `ADMIN_PASSWORD` bắt buộc; chặn Origin lạ ghi đè. | Test case `SEC-01`, `SEC-02`, `REG-09` | **100% COVERED** |
| | | Xử lý an toàn khi mất kết nối Redis | Trả về HTTP 503 ngay lập tức, không buffer âm thầm gây nghẽn bộ nhớ. | Test case `OUTAGE-01`, `REG-10` | **100% COVERED** |

---

## 2. ĐÁNH GIÁ MỨC ĐỘ ĐÁP ỨNG MỤC TIÊU HỌC THUẬT

1. **Hiểu và vận dụng xuất sắc công cụ P3X Redis UI:**
   - Hệ thống được thiết kế tối ưu hóa cho cấu trúc hiển thị của P3X Redis UI với quy ước phân cấp khóa chuẩn mực (`namespace:subspace:id`).
   - Minh chứng sinh động việc quan sát dữ liệu biến động tức thì giữa các hàng đợi List, Sorted Set và Hash.
   - Sử dụng hiệu quả tính năng Console và Monitoring của P3X để quản trị cơ sở dữ liệu ở tầng thấp (low-level).

2. **Giải quyết triệt để các bài toán kinh điển của Message Queue:**
   - Đảm bảo tính **Nguyên tử (Atomicity)** thông qua các tập lệnh Redis Lua Scripts.
   - Đảm bảo cơ chế **Exactly-Once Semantics ở tầng Ingestion** nhờ Idempotency Fingerprint.
   - Đảm bảo **Độ tin cậy (At-Least-Once Delivery & Crash Recovery)** nhờ sự kết hợp giữa Processing Queue, Heartbeat và Watchdog Fencing.
   - Cách ly lỗi an toàn bằng mô hình **Dead Letter Queue (DLQ)**.

3. **Tính trung thực và độ tin cậy khoa học:**
   - Toàn bộ các kiểm thử đều thực hiện trên mã nguồn thực tế và máy chủ Redis thật.
   - Mọi số liệu đo lường, thời gian trễ, tỷ lệ throughput và ảnh chụp màn hình đều có file log và artifact gốc đối chứng trong thư mục `docs/evidence/final-2026-10-26/`.
