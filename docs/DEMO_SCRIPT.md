# KỊCH BẢN TRÌNH DIỄN ĐỒ ÁN TRƯỚC GIẢNG VIÊN (DEMO SCRIPT)
## Đề tài: Quản trị và khai thác Redis trong Quản lý hàng đợi xử lý đơn hàng trực tuyến qua P3X Redis UI
**Thời lượng đề xuất:** 7 – 10 phút

---

## 1. Chuẩn Bị Trước Khi Thuyết Trình (1 phút)

1. Mở sẵn các cửa sổ trên màn hình máy tính:
   - **Cửa sổ 1:** Trình duyệt truy cập [http://localhost:3000](http://localhost:3000) (Trang Mua Hàng)
   - **Cửa sổ 2:** Trình duyệt truy cập [http://localhost:3000/admin](http://localhost:3000/admin) (Dashboard Quản Trị)
   - **Cửa sổ 3:** Ứng dụng **P3X Redis UI** (Đã kết nối tới `127.0.0.1:6379`)
2. Nếu hệ thống chưa chạy, nhấp đúp vào `scripts\start-all.bat` để khởi động toàn bộ chỉ trong 5 giây.

---

## 2. Kịch Bản Trình Diễn Từng Bước

### BƯỚC 1: Giới thiệu Kiến trúc & Thiết kế Khóa trên P3X Redis UI (1.5 phút)
- **Lời thoại mở đầu:**  
  *"Kính thưa cô và các bạn, nhóm em đã xây dựng một hệ thống xử lý đơn hàng trực tuyến bất đồng bộ bằng Redis. Thay vì ghi trực tiếp vào cơ sở dữ liệu quan hệ gây nghẽn cổ chai lúc cao điểm, hệ thống dùng Redis làm hàng đợi đệm. Toàn bộ dữ liệu được quản trị trực quan qua công cụ P3X Redis UI."*
- **Thao tác:**
  1. Trên **P3X Redis UI**, bấm nút **Refresh Tree**.
  2. Chỉ vào cây danh mục khóa (Tree View) và giải thích chuẩn namespace:
     - Nhánh `order:*`: Cấu trúc **Hash** lưu chi tiết thực thể đơn hàng.
     - Nhánh `queue:orders:*`: Các hàng đợi điều phối gồm `pending` (List FIFO), `priority` (Sorted Set VIP), `processing` (List đang tính toán) và `dead_letter` (List đơn lỗi).
     - Nhánh `customer:*:orders`: Cấu trúc **Set** lưu danh mục đơn theo từng khách hàng.
     - Nhánh `checkout:lock:*`: Khóa tạm thời có **TTL** chống tạo trùng đơn (Idempotency).
     - Nhánh `stats:orders:count:*`: Bộ đếm nguyên tử **INCR** thống kê đơn trong ngày.

---

### BƯỚC 2: Chứng minh Cơ chế Xếp Hàng Đợi FIFO và Ưu Tiên (2 phút)
- **Mục tiêu:** Chứng minh Redis thực sự lưu trữ và phân loại đơn hàng vào đúng hàng đợi, không phải giao diện giả lập.
- **Thao tác:**
  1. Chuyển sang **Dashboard Quản Trị** ([http://localhost:3000/admin](http://localhost:3000/admin)), bấm nút **"Tạm Dừng (Pause)"** để Worker không tự động bốc đơn.
  2. Chuyển sang **Trang Mua Hàng** ([http://localhost:3000](http://localhost:3000)):
     - Thêm 1 sản phẩm vào giỏ hàng.
     - Chọn loại **"Đơn Thường (FIFO)"** -> Bấm **Xác nhận đặt hàng**.
     - Thêm tiếp 1 sản phẩm giá trị cao (ví dụ Samsung S24 Ultra), chọn **"Đơn Ưu Tiên (VIP / 5★)"** -> Bấm **Xác nhận đặt hàng**.
  3. Mở ngay **P3X Redis UI**:
     - Mở List `queue:orders:pending`: Thấy mã đơn thường vừa vào danh sách.
     - Mở Sorted Set `queue:orders:priority`: Thấy mã đơn VIP đi kèm điểm số (Score = 5).
     - Mở khóa `checkout:lock:{id}`: Chỉ cho giảng viên thấy đồng hồ đếm ngược **TTL** (Time To Live).

---

### BƯỚC 3: Trình diễn Xử lý Từng Bước (Single Step Execution) (2 phút)
- **Mục tiêu:** Chứng minh giải thuật điều phối hàng đợi: Worker luôn ưu tiên đơn VIP trước đơn thường, và thao tác chuyển trạng thái nguyên tử không làm mất đơn.
- **Thao tác:**
  1. Trên **Dashboard Quản Trị**, bấm nút **"Xử Lý 1 Đơn (Step)"**:
     - Quan sát cột **Priority Queue**: Đơn VIP điểm số 5 ngay lập tức biến mất và chuyển sang cột **Đang Xử Lý (Processing)**.
     - Sau 2.5 giây giả lập, đơn chuyển sang **Hoàn Thành (Completed)** và được sinh mã vận đơn `VNPOST_...`.
     - *Nhấn mạnh với giảng viên:* Đơn thường đến trước nhưng đơn VIP có điểm ưu tiên cao hơn đã được giải thuật Lua Script bốc ra giải quyết trước.
  2. Bấm nút **"Xử Lý 1 Đơn (Step)"** lần thứ 2:
     - Worker gọi lệnh nguyên tử `LMOVE` chuyển đơn từ `pending` sang `processing` rồi sang `completed`.
     - Chỉ vào P3X Redis UI: Cho thấy đơn hàng được dọn sạch khỏi `processing` bằng lệnh `LREM` an toàn.

---

### BƯỚC 4: Trình diễn Xử lý Lỗi & Dead Letter Queue (DLQ) (2 phút)
- **Mục tiêu:** Chứng minh cơ chế xử lý ngoại lệ tin cậy, tự động retry tối đa 3 lần và cách ly vào Dead Letter Queue.
- **Thao tác:**
  1. Trên **Dashboard Quản Trị**:
     - Bấm nút **"Tiếp Tục (Resume)"** để Worker chạy tự do.
     - Bấm nút **"Mô Phỏng Đơn Lỗi (DLQ)"** (Hệ thống bật cờ giả lập lỗi cổng thanh toán / hết hàng tồn kho).
  2. Chuyển sang **Trang Mua Hàng** đặt 1 đơn hàng mới.
  3. Quan sát **Dashboard Quản Trị**:
     - Thấy đơn hàng được thử lại: Lần 1 -> Lần 2 -> Lần 3 (Số lần thử tăng dần trên bảng).
     - Sau lần 3 thất bại, đơn tự động nhảy vào cột **Dead Letter Queue (DLQ)** với trạng thái màu đỏ `DLQ`.
  4. Mở **P3X Redis UI**, chọn List `queue:orders:dead_letter` để chứng minh đơn lỗi đã bị cách ly trong Redis.
  5. Quay lại Dashboard, bấm nút **"Retry"** ngay trên đơn lỗi:
     - Đơn được reset số lần thử và chuyển ngược về hàng đợi `pending` để Worker xử lý lại thành công!

---

### BƯỚC 5: Trình diễn Tải Đồng Thời & Chống Race Condition (1.5 phút)
- **Mục tiêu:** Chứng minh hệ thống chịu tải cao và đảm bảo tính nhất quán dữ liệu.
- **Thao tác:**
  1. Trên Dashboard, bấm nút **"+100 Đơn (Tải Cao)"**.
  2. Hệ thống đẩy đồng thời 100 đơn hàng mẫu vào Redis trong tích tắc.
  3. Độ dài hàng đợi tăng vọt lên 100 đơn, Worker liên tục bốc và xử lý tuần tự mà không bị treo hay xung đột tài nguyên.
  4. Bộ đếm `stats:orders:count:{date}` trên P3X tự động nhảy số nguyên tử tương ứng.

---

### BƯỚC 6: Trình diễn Sao Lưu Dữ Liệu RDB & Khôi Phục (1 phút)
- **Mục tiêu:** Minh họa nội dung Chương 4 của báo cáo.
- **Thao tác:**
  1. Mở cửa sổ dòng lệnh Terminal hoặc P3X Console CLI:
     ```bash
     BGSAVE
     LASTSAVE
     ```
  2. Mở thư mục dự án, chạy script `scripts\backup_redis.bat` để tạo tệp sao lưu snapshot `dump_latest.rdb`.
  3. Trình bày ngắn gọn: *"Redis kết hợp cơ chế RDB chụp ảnh trạng thái định kỳ với nhật ký AOF ghi nối mỗi giây, đảm bảo tính toàn vẹn dữ liệu khi máy chủ khởi động lại."*

---

## 3. Câu Hỏi Thường Gặp Của Giảng Viên & Cách Trả Lời

**Q1: Tại sao không dùng RPOP thông thường mà phải dùng LMOVE?**  
- *Trả lời:* Lệnh `RPOP` lấy đơn ra khỏi Redis ngay lập tức. Nếu Worker bị sập nguồn hay mất mạng giữa chừng, đơn hàng sẽ biến mất vĩnh viễn. Lệnh `LMOVE` chuyển đơn từ `pending` sang `processing` một cách **nguyên tử**, đảm bảo đơn hàng không bao giờ bị mất; khi Worker khởi động lại, tiến trình Watchdog sẽ phát hiện và xử lý tiếp.

**Q2: Làm sao đảm bảo không bị xử lý trùng lặp giữa hàng đợi thường và ưu tiên?**  
- *Trả lời:* Trong báo cáo cũ có điểm mâu thuẫn là đẩy cùng lúc một đơn vào cả 2 hàng đợi. Nhóm em đã sửa đổi thiết kế kỹ thuật: Đơn thường chỉ vào `queue:orders:pending`, đơn VIP chỉ vào `queue:orders:priority`. Worker luôn ưu tiên kiểm tra Sorted Set trước; chỉ khi rỗng mới quét List FIFO. Nhờ đó, mỗi đơn chỉ nằm ở duy nhất một hàng đợi tại một thời điểm.

**Q3: P3X Redis UI có ưu điểm gì so với RedisInsight?**  
- *Trả lời:* P3X Redis UI hỗ trợ triển khai linh hoạt dưới dạng Web UI tập trung qua Docker lẫn bản Desktop nhẹ nhàng. Công cụ hiển thị cây namespace rất trực quan, giúp nhóm dễ dàng quan sát trạng thái các hàng đợi List, ZSet và Hash theo thời gian thực mà không tiêu tốn nhiều RAM.
