# THIẾT KẾ CƠ SỞ DỮ LIỆU REDIS (REDIS DATA DESIGN)

## 1. Giới thiệu và Nguyên tắc Thiết kế

Hệ thống quản lý hàng đợi xử lý đơn hàng trực tuyến sử dụng **Redis** làm cơ sở dữ liệu chính và tầng đệm phân phối hàng đợi. Thiết kế tuân thủ các nguyên tắc:
1. **Nhất quán với báo cáo môn học `DOAN_NoSQL.docx`**: Tận dụng triệt để các cấu trúc dữ liệu cốt lõi của Redis gồm `Hash`, `List`, `Sorted Set`, `Set`, `String (TTL)` và `Atomic Counter`.
2. **Khắc phục lỗi tiềm ẩn về race condition**: Phân định rõ ràng giữa hàng đợi FIFO và hàng đợi ưu tiên, áp dụng **Redis Lua Scripts** để đảm bảo tính nguyên tử (Atomicity).
3. **Namespace chuẩn hóa**: Khóa phân cấp bằng dấu hai chấm `:` để hiển thị dạng cây phân nhóm trực quan trên công cụ **P3X Redis UI**.

---

## 2. Danh mục Khóa Dữ liệu (Redis Key Directory)

| STT | Khóa Redis (Key Template) | Kiểu dữ liệu | Nhánh trên P3X Redis UI | Ý nghĩa & Nghiệp vụ |
|:---:|---|:---:|---|---|
| 1 | `order:{order_id}` | **Hash** | `order` > `{order_id}` | Lưu chi tiết thực thể đơn hàng (khách hàng, sản phẩm, giá trị, trạng thái, thời gian). |
| 2 | `queue:orders:pending` | **List** | `queue` > `orders` > `pending` | Hàng đợi **FIFO** chứa mã các đơn thường đang chờ xử lý (`LPUSH` / `LMOVE`). |
| 3 | `queue:orders:priority` | **Sorted Set** | `queue` > `orders` > `priority` | Hàng đợi **Ưu tiên** sắp xếp theo điểm số (Score = Priority). Đơn điểm cao được xử lý trước. |
| 4 | `queue:orders:processing` | **List** | `queue` > `orders` > `processing` | Hàng đợi các đơn đang được Worker xử lý thực tế (tránh mất đơn khi crash). |
| 5 | `queue:orders:dead_letter` | **List** | `queue` > `orders` > `dead_letter` | **Dead Letter Queue (DLQ)** chứa đơn lỗi vượt quá giới hạn thử lại (3 lần). |
| 6 | `customer:{customer_id}:orders` | **Set** | `customer` > `{customer_id}` > `orders` | Tập hợp các mã đơn thuộc về một khách hàng cụ thể (tra cứu nhanh O(1)). |
| 7 | `checkout:lock:{token/order_id}` | **String (TTL)** | `checkout` > `lock` > `{id}` | Khóa phân tán chống click đúp / chống tạo trùng đơn (Idempotency Lock), TTL 30-900 giây. |
| 8 | `stats:orders:count:{YYYYMMDD}` | **String** | `stats` > `orders` > `count` > `{date}` | Bộ đếm nguyên tử (`INCRBY`) tổng số đơn hàng phát sinh trong ngày. |
| 9 | `order:{order_id}:history` | **List** | `order` > `{order_id}` > `history` | Lịch sử timeline các sự kiện (Khởi tạo, Vào hàng đợi, Đang xử lý, Hoàn thành, Lỗi). |
| 10 | `worker:control:status` | **String** | `worker` > `control` > `status` | Trạng thái điều khiển Worker (`RUNNING` hoặc `PAUSED`) phục vụ demo giảng viên. |
| 11 | `worker:control:step_mode` | **String** | `worker` > `control` > `step_mode` | Cờ bật chế độ xử lý từng đơn (`1` hoặc `0`). |
| 12 | `queue:orders:processing:meta` | **Hash** | `queue` > `orders` > `processing` > `meta` | Lưu timestamp lúc bắt đầu xử lý của đơn để Worker Watchdog phát hiện đơn bị treo. |

---

## 3. Chi tiết Cấu trúc Từng Kiểu Dữ Liệu

### 3.1. Cấu trúc `order:{order_id}` (Hash)
- **Cơ chế:** Lưu trữ dạng bảng băm (Field-Value). Cho phép cập nhật từng trường độc lập bằng `HSET`, đọc toàn bộ bằng `HGETALL` với độ phức tạp $O(1)$.
- **Các trường dữ liệu (Fields):**
  - `order_id`: Mã định danh đơn hàng duy nhất (ví dụ: `1001`, `ORD-1728800000000-842`).
  - `customer_id`: Mã khách hàng (ví dụ: `CUST_01`).
  - `customer_name`: Tên khách hàng (ví dụ: `Nguyễn Văn A`).
  - `phone`: Số điện thoại liên hệ.
  - `address`: Địa chỉ giao hàng.
  - `items`: Danh sách sản phẩm dạng JSON chuỗi (hoặc tóm tắt ngắn).
  - `total`: Tổng số tiền đơn hàng (VNĐ).
  - `payment_method`: Phương thức thanh toán (`COD`, `MOMO`, `VNPAY`, `BANK_TRANSFER`).
  - `status`: Trạng thái xử lý (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `DLQ`).
  - `priority`: Mức độ ưu tiên (`1`: Bình thường, `2-5`: Ưu tiên / Hỏa tốc / VIP).
  - `is_priority`: Cờ đánh dấu (`0`: Đơn thường, `1`: Đơn ưu tiên).
  - `created_at`: Thời điểm tạo đơn (ISO string hoặc timestamp).
  - `updated_at`: Thời điểm cập nhật trạng thái gần nhất.
  - `finished_at`: Thời điểm hoàn thành xử lý.
  - `tracking_code`: Mã vận đơn giả lập sau khi đóng gói (ví dụ: `VNPOST-8839219`).
  - `retry_count`: Số lần thử lại sau khi xử lý thất bại (mặc định: `0`).
  - `error_reason`: Nguyên nhân xử lý thất bại (nếu có).

### 3.2. Cấu trúc Hàng đợi FIFO: `queue:orders:pending` (List)
- **Cơ chế:** Danh sách liên kết đôi (Doubly Linked List).
- **Thao tác ghi (Enqueue):** Khách đặt đơn thường, API thực hiện `LPUSH queue:orders:pending {order_id}`.
- **Thao tác lấy an toàn (Dequeue):** Worker sử dụng `LMOVE queue:orders:pending queue:orders:processing RIGHT LEFT`. Thao tác này đưa đơn từ đuôi danh sách chờ vào đầu danh sách đang xử lý một cách **nguyên tử**. Nếu Worker bị crash, đơn hàng vẫn nằm an toàn trong `queue:orders:processing`.

### 3.3. Cấu trúc Hàng đợi Ưu tiên: `queue:orders:priority` (Sorted Set)
- **Cơ chế:** Tập hợp có thứ tự bằng cấu trúc SkipList kết hợp Hash Table. Điểm số (Score) quyết định thứ tự.
- **Công thức tính điểm (Score Calculation):**
  - Để đảm bảo: **Điểm ưu tiên cao hơn luôn được xử lý trước**, đồng thời **các đơn có cùng điểm ưu tiên thì đơn đến trước được xử lý trước** (FIFO trong cùng priority):
    $$\text{Score} = \text{priority} \times 10^{13} + (10^{13} - \text{timestamp})$$
    *(Hoặc đơn giản: gán score = priority, nếu cùng score thì ZPOPMAX xử lý ổn định).*
- **Thao tác lấy nguyên tử (Atomic Pop & Process):**
  - Do Redis không có lệnh đơn `ZMOVE` tích hợp sẵn, hệ thống dùng **Lua Script** để thực thi:
    `ZPOPMAX` 1 đơn -> Ngay lập tức `LPUSH` vào `queue:orders:processing` -> Cập nhật `HSET order:{id} status PROCESSING`.

### 3.4. Cấu trúc Đang xử lý: `queue:orders:processing` (List)
- **Mục đích:** Lưu trữ các mã đơn hàng đang nằm trong vòng đời tính toán của Worker.
- Khi Worker xử lý thành công:
  - Cập nhật Hash `order:{id}` sang `COMPLETED`.
  - Gọi lệnh `LREM queue:orders:processing 1 {order_id}` để xóa đơn khỏi danh sách xử lý.
  - Xóa metadata trong `queue:orders:processing:meta`.

### 3.5. Cấu trúc Dead Letter Queue: `queue:orders:dead_letter` (List)
- **Mục đích:** Cách ly các đơn hàng xử lý thất bại quá 3 lần (ví dụ tài khoản thanh toán không hợp lệ, lỗi kho hàng, lỗi kết nối giả lập).
- **Thao tác:**
  - `LREM queue:orders:processing 1 {order_id}`
  - `LPUSH queue:orders:dead_letter {order_id}`
  - Cập nhật `HSET order:{id} status DLQ error_reason "..." retry_count "3"`
- Quản trị viên trên Dashboard có thể bấm nút **Thử lại đơn lỗi** (Retry from DLQ): Hệ thống chuyển đơn từ DLQ về lại hàng đợi tương ứng để Worker tiếp tục thử lại.

### 3.6. Cấu trúc Danh sách đơn của khách: `customer:{id}:orders` (Set)
- **Thao tác:** `SADD customer:{cust_id}:orders {order_id}` khi tạo đơn.
- **Truy vấn:**
  - `SMEMBERS customer:{cust_id}:orders`: Trả về tất cả mã đơn của khách hàng.
  - `SISMEMBER customer:{cust_id}:orders {order_id}`: Kiểm tra quyền sở hữu đơn hàng (trả về 1 hoặc 0).

### 3.7. Cấu trúc Khóa Giữ Chỗ / Chống Trùng: `checkout:lock:{id}` (String có TTL)
- **Thao tác:** `SET checkout:lock:{id} "LOCKED" NX EX 60` (NX: Chỉ đặt nếu khóa chưa tồn tại, EX 60: Hết hạn sau 60 giây).
- **Tác dụng:** Ngăn chặn người dùng bấm liên tục nút "Đặt hàng" (Double Submission) hoặc giữ chỗ sản phẩm trong giỏ hàng. Khi hết thời gian, Redis tự động giải phóng bộ nhớ nhờ cơ chế TTL.

### 3.8. Cấu trúc Thống kê Đơn trong ngày: `stats:orders:count:{date}` (String)
- **Thao tác:** `INCR stats:orders:count:20261013` mỗi khi một đơn hàng được tiếp nhận.
- Đảm bảo tính nguyên tử tuyệt đối, không bị xung đột dù có hàng trăm luồng đặt hàng đồng thời.

---

## 4. Vòng Đời Trạng Thái Đơn Hàng (Order State Machine)

```
[Khách bấm Đặt hàng]
        │
        ▼
   Kiểm tra Lock ────(Đã có lock)───> [Từ chối: Đang xử lý yêu cầu]
        │
        ▼ (Chưa có lock: Tạo Lock EX 60)
  Tạo Hash `order:{id}`
  Tăng `stats:orders:count:{date}`
  Ghi Set `customer:{id}:orders`
        │
  ┌─────┴──────────────────────┐
  │                            │
[Đơn thường]             [Đơn ưu tiên]
  │                            │
  ▼                            ▼
LPUSH pending            ZADD priority (Score)
  │                            │
  └─────┬──────────────────────┘
        │
        ▼
Worker lấy việc (Atomic LMOVE hoặc Lua Script)
        │
        ▼
  Chuyển sang `queue:orders:processing`
  Cập nhật Hash status = "PROCESSING"
        │
        ├──────────────────────────────────────┐
        ▼ (Thành công)                         ▼ (Lỗi / Mô phỏng lỗi)
  status = "COMPLETED"                 Tăng retry_count (1..3)
  Tạo `tracking_code`                          │
  LREM khỏi processing                 ┌───────┴───────┐
                                       ▼ (<= 3 lần)    ▼ (> 3 lần)
                                  Đẩy lại pending   LPUSH dead_letter
                                  chờ thử lại       status = "DLQ"
```
