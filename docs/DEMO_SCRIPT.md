# KỊCH BẢN TRÌNH DIỄN ĐỒ ÁN TRƯỚC GIẢNG VIÊN (DEMO SCRIPT)
## Đề tài: Quản trị và khai thác Redis trong Quản lý hàng đợi xử lý đơn hàng trực tuyến qua P3X Redis UI
**Thời lượng đề xuất:** 5 – 7 phút (Đã tối ưu 1-Click cực kỳ nhanh gọn)

---

## 1. Chuẩn Bị Trước Khi Thuyết Trình (30 giây)

1. Mở sẵn 3 tab trình duyệt:
   - **Tab 1:** [http://localhost:3000](http://localhost:3000) (Trang Mua Hàng - Đã có thanh **Đặt hàng nhanh 1-Click**)
   - **Tab 2:** [http://localhost:3000/admin](http://localhost:3000/admin) (Dashboard Quản Trị - Đã có **Trung tâm Kịch bản Demo & Teleprompter**)
   - **Tab 3:** [http://localhost:7843](http://localhost:7843) (P3X Redis UI Web)
2. Nếu hệ thống chưa bật, chạy script `scripts\start-all.bat` (hoặc mở Redis và Web Server).

---

## 2. Các Kịch Bản Trình Diễn 1-Click (Siêu Tiện Lợi)

> [!TIP]
> **TÍNH NĂNG MỚI NÂNG CẤP:** Trên Dashboard Quản trị ([http://localhost:3000/admin](http://localhost:3000/admin)), bạn chỉ cần bấm vào **4 thẻ Kịch bản to** trên đầu trang. Hệ thống sẽ **tự động thiết lập trạng thái**, tạo đơn chuẩn và hiển thị ngay **Hộp hướng dẫn + Gợi ý lời thoại cho Thầy/Cô** để bạn đọc theo!

---

### KỊCH BẢN 1: Hàng Đợi FIFO Tuần Tự (Redis List: LPUSH / LMOVE) (1.5 phút)
- **Thao tác 1-Click:**
  1. Trên Dashboard Quản trị, nhấp vào thẻ **"1. Hàng Đợi FIFO"**:
     - Hệ thống tự động **Tạm dừng Worker** (PAUSED).
     - Hệ thống tự động tạo 3 đơn thường (`DH_FIFO_..._1`, `DH_FIFO_..._2`, `DH_FIFO_..._3`) xếp vào `queue:orders:pending`.
     - Hộp hướng dẫn màu xanh xuất hiện ngay bên dưới với nút bấm **[▶ Xử lý 1 đơn (Step)]**.
  2. Bấm nút **[▶ Xử lý 1 đơn (Step)]** ngay trong hộp hướng dẫn:
     - Quan sát thấy đơn thứ nhất (`..._1`) được bốc ra xử lý trước (vào `queue:orders:processing`).
  3. Bấm nút **[🔍 Xem Key trên P3X Redis UI]** để mở thẳng P3X kiểm tra List `queue:orders:pending`.
- **Lời thoại nói với Giảng viên (Đã hiện sẵn trên màn hình):**
  > *"Thưa thầy cô, đối với đơn thường, hệ thống sử dụng cấu trúc Redis List với lệnh LPUSH để xếp hàng. Khi Worker tiếp nhận, lệnh LMOVE (hoặc RPOPLPUSH) sẽ bốc đơn đầu tiên ra một cách nguyên tử chuyển sang queue:orders:processing mà không lo mất mát đơn."*

---

### KỊCH BẢN 2: Đơn VIP Ưu Tiên (Redis Sorted Set: ZADD / Lua Script) (1.5 phút)
- **Thao tác 1-Click:**
  1. Nhấp vào thẻ **"2. Đơn VIP Ưu Tiên"**:
     - Hệ thống tự động tạo 1 đơn thường (score = 1) vào List FIFO và 1 đơn VIP (Samsung S24 Ultra, score = 5) vào Sorted Set `queue:orders:priority`.
  2. Bấm nút **[▶ Xử lý 1 đơn (Step)]** trong hộp hướng dẫn:
     - Worker gọi Lua script nguyên tử `popPriorityOrder`. Đơn VIP (5 sao) được bốc ra xử lý TRƯỚC dù đơn thường vào trước!
- **Lời thoại nói với Giảng viên:**
  > *"Thưa thầy cô, thương mại điện tử cần ưu tiên đơn hàng giá trị cao hoặc hội viên VIP. Chúng em triển khai Redis Sorted Set với điểm số Score tương ứng cấp ưu tiên. Lua script nguyên tử bảo đảm Worker luôn kiểm tra và vét hết đơn ưu tiên cao nhất trước khi xử lý đơn thường."*

---

### KỊCH BẢN 3: Xử Lý Lỗi, Retry Tối Đa 3 Lần & Dead Letter Queue (DLQ) (1.5 phút)
- **Thao tác 1-Click:**
  1. Nhấp vào thẻ **"3. Lỗi & DLQ Retry"**:
     - Hệ thống tự động bật cờ mô phỏng lỗi (Simulate Failure) và Resume Worker.
     - Tạo đơn `DH_FAIL_TEST_...`.
     - Quan sát bảng: Đơn thất bại -> Thử lại lần 1 -> Thử lại lần 2 -> Thử lại lần 3 -> Chuyển vào cột **4. Dead Letter Queue**!
  2. Trong hộp hướng dẫn, bấm nút **[🔄 Thử lại đơn này (Retry)]**:
     - Đơn được khôi phục khỏi DLQ và xử lý thành công!
- **Lời thoại nói với Giảng viên:**
  > *"Thưa thầy cô, kiến trúc Message Queue chuẩn không được phép nuốt mất đơn hàng khi có lỗi mạng hay cổng thanh toán. Worker của chúng em theo dõi số lần thử lại (retry_count) trong Redis Hash. Khi vượt ngưỡng 3 lần, đơn được cách ly an toàn vào Dead Letter Queue (DLQ) để nhân viên kỹ thuật kiểm tra mà không làm tắc nghẽn các đơn khác."*

---

### KỊCH BẢN 4: Tải Đồng Thời & Chống Race Condition (1 phút)
- **Thao tác 1-Click:**
  1. Nhấp vào thẻ **"4. Tải Đồng Thời (25 Đơn)"**:
     - Hệ thống tự động đẩy 25 đơn hàng cùng lúc, tăng tốc Worker lên Siêu Tốc (0.3s/đơn).
     - Bộ đếm `stats:orders:count` tăng liên tục không bị sai lệch số liệu.
  2. Muốn xem chậm lại để phân tích? Chỉ cần bấm **[🐢 Chậm (3.5s)]** ở thanh trên cùng!
- **Lời thoại nói với Giảng viên:**
  > *"Thưa thầy cô, Redis là kiến trúc Single-Threaded Event Loop hoạt động trong bộ nhớ RAM, cho phép xử lý hàng chục nghìn thao tác mỗi giây. Mọi thao tác ghi nhận đơn (INCR, LPUSH, ZADD) đều diễn ra an toàn tuyệt đối, loại trừ hoàn toàn nguy cơ tranh chấp dữ liệu (Race Condition)."*

---

### KỊCH BẢN PHỤ: Đặt Hàng Nhanh 1-Click Từ Trang Khách Hàng (Customer Page)
Nếu thầy cô muốn xem trực tiếp luồng đặt hàng từ phía khách hàng:
1. Chuyển sang tab [http://localhost:3000](http://localhost:3000).
2. Không cần gõ form! Bấm ngay 1 trong 3 nút trên banner:
   - **[⚡ 1-Click: Đơn Thường (FIFO)]**
   - **[⭐ 1-Click: Đơn VIP (Ưu Tiên ★5)]**
   - **[⚠️ 1-Click: Đơn Lỗi (DLQ Demo)]**
3. Hộp thoại thông báo hiện ngay lập tức với mã đơn, hàng đợi Redis tương ứng và nút **[Theo dõi tiến trình xử lý ngay]**!

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
