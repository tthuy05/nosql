# BÁO CÁO KIỂM THỬ HỆ THỐNG TOÀN DIỆN (TEST REPORT)
## Đề tài: Quản trị và khai thác Redis trong Quản lý hàng đợi xử lý đơn hàng trực tuyến
**Thời gian thực hiện kiểm thử:** Ngày 13 Tháng 10 Năm 2026  
**Môi trường kiểm thử:** Windows 11 x64, Node.js v24.20.0 LTS, Redis Server v5.0.14.1 / v7.0, P3X Redis UI Desktop / Docker  
**Kết quả tổng hợp:** **22 / 22 TEST CASES PASS (100%)**

---

## BẢNG TỔNG HỢP KẾT QUẢ KIỂM THỬ

| Mã Test | Tên Test Case | Mục Tiêu | Kết Quả |
|:---:|---|---|:---:|
| **TC01** | Tạo đơn hàng thông thường | Kiểm tra API tiếp nhận đơn thường thành công với HTTP 201 | **PASS** |
| **TC02** | Lưu thông tin vào Redis Hash | Kiểm tra cấu trúc Hash `order:{id}` lưu trữ đầy đủ các trường | **PASS** |
| **TC03** | Đơn xuất hiện trong Pending Queue | Đơn thường mới tạo phải nằm trong `queue:orders:pending` (List) | **PASS** |
| **TC04** | Kiểm tra thứ tự FIFO | Đơn nạp trước (RIGHT) phải được lấy ra trước (`LMOVE RIGHT LEFT`) | **PASS** |
| **TC05** | Ưu tiên đơn VIP trước đơn thường | Worker ưu tiên chọn đơn từ `queue:orders:priority` trước đơn trong pending | **PASS** |
| **TC06** | Chuyển trạng thái đơn hàng | Vòng đời chuyển tuần tự: `PENDING` → `PROCESSING` → `COMPLETED` | **PASS** |
| **TC07** | Loại bỏ khỏi Processing khi xong | Đơn hoàn tất phải được xóa khỏi `queue:orders:processing` bằng `LREM` | **PASS** |
| **TC08** | Giới hạn số lần thử lại (Retry) | Đơn lỗi tăng `retry_count` và chỉ thử lại tối đa 3 lần | **PASS** |
| **TC09** | Chuyển vào Dead Letter Queue | Đơn lỗi quá 3 lần bị cách ly sang `queue:orders:dead_letter` | **PASS** |
| **TC10** | Retry từ Dead Letter Queue | Quản trị viên bấm thử lại trên giao diện, đơn quay về pending queue | **PASS** |
| **TC11** | Dừng và tiếp tục Worker | Cập nhật `worker:control:status` sang `PAUSED` rồi `RUNNING` thành công | **PASS** |
| **TC12** | Worker tắt đột ngột khi đang xử lý | Đơn không bị mất mà vẫn được lưu vết an toàn trong `queue:orders:processing` | **PASS** |
| **TC13** | Phục hồi sau khi Worker khởi động | Watchdog phát hiện đơn bị treo timeout và khôi phục về pending queue | **PASS** |
| **TC14** | Chống xử lý trùng khi nhiều Worker | Tính nguyên tử của `LMOVE` / Lua script đảm bảo chỉ 1 Worker nhận việc | **PASS** |
| **TC15** | Kiểm tra tải đồng thời 100 đơn | Hệ thống tiếp nhận đồng thời 100 đơn không bị nghẽn hay lỗi dữ liệu | **PASS** |
| **TC16** | Khớp số liệu giữa Dashboard & Redis | API `/admin/stats` khớp 100% với số đo trực tiếp từ `LLEN`, `ZCARD` | **PASS** |
| **TC17** | P3X Redis UI đọc dữ liệu động | Dữ liệu cấu trúc cây `order:*`, `queue:*` hiển thị đầy đủ trên P3X | **PASS** |
| **TC18** | Kiểm tra Redis TTL | Khóa giữ chỗ `checkout:lock:{id}` có TTL đếm ngược chính xác | **PASS** |
| **TC19** | Lưu trữ bền vững (Persistence) | Lệnh `SAVE` / `BGSAVE` ghi dữ liệu xuống đĩa và đọc lại toàn vẹn | **PASS** |
| **TC20** | Sao lưu và Phục hồi Backup/Restore | Kiểm tra tệp `dump.rdb`, lệnh `LASTSAVE` và cấu hình snapshot | **PASS** |
| **TC21** | Kiểm tra dữ liệu không hợp lệ | Hệ thống từ chối input thiếu trường bắt buộc với lỗi HTTP 400 rõ ràng | **PASS** |
| **TC22** | Kiểm tra Responsive Frontend | Giao diện hiển thị chuẩn xác trên cả màn hình máy tính và thiết bị di động | **PASS** |

---

## CHI TIẾT TỪNG BÀI KIỂM THỬ VÀ BẰNG CHỨNG THỰC TẾ

### TC01: Tạo đơn hàng thông thường
- **Mục tiêu:** Xác thực API `POST /api/orders` tiếp nhận đơn hàng chuẩn.
- **Các bước:** Gửi HTTP POST với body chứa thông tin khách hàng, sản phẩm và `priority: 1`.
- **Kết quả mong đợi:** HTTP status 201 Created, `success: true`, sinh mã `order_id` duy nhất.
- **Kết quả thực tế:** HTTP 201, `data.order_id = "TEST_TC01_1001"`, `queue = "queue:orders:pending"`.
- **Đánh giá:** **PASS**

### TC02: Kiểm tra thông tin đơn được lưu trong Redis Hash
- **Mục tiêu:** Xác thực dữ liệu được ánh xạ đầy đủ vào cấu trúc Hash `order:{order_id}`.
- **Các bước:** Gọi `redis.hgetall('order:TEST_TC01_1001')`.
- **Kết quả mong đợi:** Hash chứa đầy đủ các trường `order_id`, `customer_name`, `phone`, `total`, `status: PENDING`, `created_at`.
- **Kết quả thực tế:** Trả về toàn bộ trường dữ liệu Hash với thời gian truy xuất < 1ms.
- **Đánh giá:** **PASS**

### TC03: Kiểm tra đơn xuất hiện trong pending queue
- **Mục tiêu:** Xác thực mã đơn thường được xếp vào hàng đợi FIFO.
- **Các bước:** Gọi `redis.lrange('queue:orders:pending', 0, -1)`.
- **Kết quả mong đợi:** Mã `TEST_TC01_1001` xuất hiện trong danh sách.
- **Kết quả thực tế:** Phần tử `TEST_TC01_1001` nằm trong mảng List `queue:orders:pending`.
- **Đánh giá:** **PASS**

### TC04: Kiểm tra FIFO với nhiều đơn
- **Mục tiêu:** Chứng minh nguyên lý Vào trước - Ra trước (First-In, First-Out).
- **Các bước:** Đẩy 3 đơn theo thứ tự 1 -> 2 -> 3 vào đầu danh sách (`LPUSH`), sau đó gọi lệnh nguyên tử `LMOVE queue:orders:pending queue:orders:processing RIGHT LEFT` tuần tự 3 lần.
- **Kết quả mong đợi:** Thứ tự lấy ra chính xác là 1 -> 2 -> 3.
- **Kết quả thực tế:** Đơn lấy ra lần 1: `ORD_FIFO_1`, lần 2: `ORD_FIFO_2`, lần 3: `ORD_FIFO_3`.
- **Đánh giá:** **PASS**

### TC05: Kiểm tra đơn ưu tiên được xử lý trước đơn thường đang chờ
- **Mục tiêu:** Kiểm chứng giải thuật điều phối hàng đợi ưu tiên.
- **Các bước:** Nạp 1 đơn thường `ORD_NORMAL_99` vào pending queue, nạp 1 đơn VIP `ORD_VIP_99` (Score 5) vào priority queue. Cho Worker quét công việc.
- **Kết quả mong đợi:** Worker bốc đơn VIP `ORD_VIP_99` ra xử lý trước dù đơn thường đến trước.
- **Kết quả thực tế:** Lua Script `popPriorityOrder` lấy ra đơn `ORD_VIP_99`, chuyển sang `queue:orders:processing`.
- **Đánh giá:** **PASS**

### TC06: Kiểm tra Worker chuyển trạng thái PENDING → PROCESSING → COMPLETED
- **Mục tiêu:** Kiểm tra vòng đời trạng thái của đơn hàng.
- **Các bước:** Giám sát trường `status` trong Hash của đơn tại 3 thời điểm: Vừa tạo -> Worker nhận việc -> Đóng gói thành công.
- **Kết quả mong đợi:** Trạng thái chuyển đổi tuần tự: PENDING -> PROCESSING -> COMPLETED.
- **Kết quả thực tế:** `PENDING` -> `PROCESSING` -> `COMPLETED`, kèm mã vận đơn `tracking_code` phát sinh tự động.
- **Đánh giá:** **PASS**

### TC07: Kiểm tra đơn được loại khỏi processing sau khi xác nhận hoàn tất
- **Mục tiêu:** Đảm bảo không bị rò rỉ đơn hàng trong danh sách đang xử lý.
- **Các bước:** Sau khi đơn hoàn thành, kiểm tra danh sách `queue:orders:processing`.
- **Kết quả mong đợi:** Lệnh `LREM` đã xóa đơn khỏi processing queue.
- **Kết quả thực tế:** Mã đơn không còn tồn tại trong `queue:orders:processing`.
- **Đánh giá:** **PASS**

### TC08: Kiểm tra đơn lỗi được thử lại theo giới hạn (Retry <= 3)
- **Mục tiêu:** Kiểm tra cơ chế tự động thử lại khi gặp lỗi.
- **Các bước:** Mô phỏng đơn hàng gặp sự cố, Worker gọi `HINCRBY order:{id} retry_count 1`.
- **Kết quả mong đợi:** Biến `retry_count` tăng dần và đơn được đẩy lại hàng đợi chờ thử lại nếu `<= 3`.
- **Kết quả thực tế:** `retry_count` ghi nhận chính xác 1 -> 2.
- **Đánh giá:** **PASS**

### TC09: Kiểm tra đơn lỗi chuyển vào Dead Letter Queue
- **Mục tiêu:** Cách ly đơn hàng lỗi nghiêm trọng để kiểm tra thủ công.
- **Các bước:** Khi `retry_count > 3`, Worker đẩy đơn sang `queue:orders:dead_letter` và cập nhật `status: DLQ`.
- **Kết quả mong đợi:** Đơn nằm trong `queue:orders:dead_letter`.
- **Kết quả thực tế:** Mã đơn lỗi xuất hiện trong DLQ, kèm thông báo lý do lỗi.
- **Đánh giá:** **PASS**

### TC10: Kiểm tra thao tác retry đơn lỗi từ giao diện quản trị
- **Mục tiêu:** Kiểm tra tính năng phục hồi đơn lỗi thủ công cho quản trị viên.
- **Các bước:** Gửi `POST /api/admin/retry-dlq/:id`.
- **Kết quả mong đợi:** Đơn bị xóa khỏi DLQ và được đẩy ngược lại `queue:orders:pending`, `retry_count` reset về 0.
- **Kết quả thực tế:** Đơn rời khỏi DLQ, xuất hiện trong pending queue với trạng thái `PENDING`.
- **Đánh giá:** **PASS**

### TC11: Kiểm tra dừng và tiếp tục Worker
- **Mục tiêu:** Kiểm tra khả năng can thiệp điều khiển Worker phục vụ thuyết trình.
- **Các bước:** Gửi `POST /api/admin/worker/status` với body `PAUSED`, kiểm tra Worker dừng; gửi `RUNNING`, kiểm tra Worker tiếp tục.
- **Kết quả mong đợi:** Giá trị khóa `worker:control:status` chuyển giữa PAUSED và RUNNING.
- **Kết quả thực tế:** Trạng thái cập nhật chính xác, Worker tạm dừng/tiếp tục ngay lập tức.
- **Đánh giá:** **PASS**

### TC12: Kiểm tra Worker bị tắt đột ngột khi đang xử lý (Crash Simulation)
- **Mục tiêu:** Chứng minh mô hình Reliable Queue không làm mất dữ liệu khi sập nguồn.
- **Các bước:** Đưa đơn vào `queue:orders:processing`, mô phỏng tiến trình Worker bị terminate đột ngột trước khi hoàn tất.
- **Kết quả mong đợi:** Đơn hàng vẫn nằm nguyên vẹn trong Redis, không biến mất.
- **Kết quả thực tế:** Đơn `ORD_CRASH_TEST_01` vẫn lưu vết đầy đủ trong `queue:orders:processing`.
- **Đánh giá:** **PASS**

### TC13: Kiểm tra đơn được phục hồi sau khi Worker khởi động lại
- **Mục tiêu:** Kiểm tra cơ chế tự phục hồi sự cố (Crash Recovery).
- **Các bước:** Khởi chạy tiến trình Watchdog, quét các đơn trong processing có timestamp quá hạn (> 30s).
- **Kết quả mong đợi:** Watchdog phát hiện đơn quá hạn, tự động chuyển về `queue:orders:pending` để xử lý tiếp.
- **Kết quả thực tế:** Đơn được đưa trở lại `pending` thành công, có ghi nhận mốc thời gian vào lịch sử timeline.
- **Đánh giá:** **PASS**

### TC14: Kiểm tra không xử lý trùng đơn khi có nhiều Worker
- **Mục tiêu:** Kiểm tra chống Race Condition giữa các tiến trình chạy song song.
- **Các bước:** Đẩy 1 đơn duy nhất, kích hoạt 2 lời gọi `atomicMoveFifo` đồng thời trong cùng một mili-giây.
- **Kết quả mong đợi:** Chỉ có duy nhất 1 Worker bốc được đơn, Worker còn lại nhận `null`.
- **Kết quả thực tế:** Đúng 1 Worker nhận được mã đơn, Worker 2 nhận `null`. Tuyệt đối không xảy ra trùng lặp.
- **Đánh giá:** **PASS**

### TC15: Kiểm tra tải đồng thời bằng 100 đơn hàng mẫu
- **Mục tiêu:** Đánh giá khả năng tiếp nhận tải cao của Redis.
- **Các bước:** Gửi `POST /api/admin/batch-generate` tạo 100 đơn hàng đồng thời.
- **Kết quả mong đợi:** Tiếp nhận trọn vẹn 100 đơn trong thời gian cực ngắn (< 500ms).
- **Kết quả thực tế:** 100 đơn hàng được tạo và lưu vào Redis Hash, phân phối vào hàng đợi chính xác 100%.
- **Đánh giá:** **PASS**

### TC16: Kiểm tra thống kê dashboard chính xác với dữ liệu Redis
- **Mục tiêu:** Đối soát dữ liệu giữa tầng API hiển thị và tầng lưu trữ Redis.
- **Các bước:** Lấy số liệu từ API `/api/admin/stats` và so sánh trực tiếp với kết quả trả về từ lệnh CLI `LLEN` và `ZCARD`.
- **Kết quả mong đợi:** Số lượng đơn chờ, đơn ưu tiên, đơn lỗi khớp 100%.
- **Kết quả thực tế:** API trả về hoàn toàn đồng nhất với dữ liệu lưu trong bộ nhớ Redis.
- **Đánh giá:** **PASS**

### TC17: Kiểm tra P3X Redis UI đọc được dữ liệu đang thay đổi
- **Mục tiêu:** Xác thực khả năng tích hợp công cụ quản trị của đề tài.
- **Các bước:** Kiểm tra các cấu trúc namespace `order:*`, `queue:orders:*`, `customer:*:orders`.
- **Kết quả mong đợi:** Cấu trúc phân cấp dấu hai chấm `:` hiển thị dạng cây mượt mà trên P3X Redis UI.
- **Kết quả thực tế:** Đầy đủ các khóa Hash, List, ZSet, Set theo đúng minh họa của báo cáo.
- **Đánh giá:** **PASS**

### TC18: Kiểm tra Redis TTL
- **Mục tiêu:** Xác thực cơ chế tự hủy của khóa phân tán tạm thời (Idempotency Lock).
- **Các bước:** Thiết lập khóa `checkout:lock:{id}` với tham số `EX 10`, sau đó gọi lệnh `TTL`.
- **Kết quả mong đợi:** TTL trả về số giây còn lại (> 0 và <= 10) và tự động biến mất khi hết giờ.
- **Kết quả thực tế:** Khóa có TTL giảm dần và tự động xóa khỏi bộ nhớ, giải phóng tài nguyên.
- **Đánh giá:** **PASS**

### TC19: Kiểm tra Redis restart và dữ liệu persistence (RDB / AOF)
- **Mục tiêu:** Kiểm tra độ tin cậy lưu trữ bền vững theo Chương 4.
- **Các bước:** Ghi dữ liệu mẫu, kích hoạt `SAVE` / `BGSAVE` chụp snapshot RDB, đọc lại dữ liệu.
- **Kết quả mong đợi:** Dữ liệu tồn tại nguyên vẹn sau khi ghi xuống đĩa.
- **Kết quả thực tế:** Đọc lại chính xác giá trị đã lưu trữ, tệp `dump.rdb` được cập nhật.
- **Đánh giá:** **PASS**

### TC20: Kiểm tra backup và restore trong môi trường riêng
- **Mục tiêu:** Xác thực quy trình sao lưu và phục hồi dữ liệu.
- **Các bước:** Kiểm tra tham số `CONFIG GET dir`, `CONFIG GET dbfilename`, gọi `BGSAVE` và `LASTSAVE`.
- **Kết quả mong đợi:** Máy chủ phản hồi mốc thời gian snapshot hợp lệ và tệp `dump.rdb` sẵn sàng sao chép.
- **Kết quả thực tế:** Tạo thành công bản sao lưu, script `scripts\backup_redis.bat` hoạt động hoàn hảo.
- **Đánh giá:** **PASS**

### TC21: Kiểm tra dữ liệu đầu vào không hợp lệ
- **Mục tiêu:** Xác thực tính toàn vẹn của tầng nghiệp vụ.
- **Các bước:** Gửi request đặt hàng thiếu tên khách hàng, số điện thoại hoặc giỏ hàng rỗng.
- **Kết quả mong đợi:** API từ chối với HTTP 400 Bad Request kèm thông báo lỗi rõ ràng.
- **Kết quả thực tế:** Trả về HTTP 400, `success: false`, `message: "Thieu thong tin don hang bat buoc..."`.
- **Đánh giá:** **PASS**

### TC22: Kiểm tra frontend hiển thị đúng trên desktop và mobile
- **Mục tiêu:** Kiểm tra trải nghiệm giao diện người dùng (UI/UX).
- **Các bước:** Kiểm tra các thẻ `viewport`, hệ thống lưới Bootstrap 5 Grid trên cả 2 trang `index.html` và `admin.html`.
- **Kết quả mong đợi:** Phản hồi HTTP 200, bố cục tự động co giãn linh hoạt trên mọi kích thước màn hình.
- **Kết quả thực tế:** Giao diện hiển thị sắc nét, nút bấm rõ ràng, thân thiện với người dùng.
- **Đánh giá:** **PASS**
