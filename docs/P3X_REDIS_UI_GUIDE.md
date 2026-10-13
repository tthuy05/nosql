# HƯỚNG DẪN KẾT NỐI VÀ THAO TÁC TRÊN P3X REDIS UI
## (P3X REDIS UI OPERATIONS & ADMINISTRATION GUIDE)

P3X Redis UI là công cụ đồ họa mã nguồn mở (Open-source Web & Desktop GUI) được xây dựng trên nền tảng Node.js / Express backend và Angular Material frontend. Đây là công cụ trọng tâm trong đề tài môn học NoSQL của nhóm.

---

## 1. Thiết Lập Kết Nối Tới Redis Server

### Bước 1: Mở giao diện P3X Redis UI
- **Nếu dùng bản Desktop:** Mở ứng dụng `P3X-Redis-UI` từ màn hình hoặc Start Menu.
- **Nếu dùng Docker:** Mở trình duyệt web truy cập địa chỉ [http://localhost:7843](http://localhost:7843).

### Bước 2: Tạo hồ sơ kết nối mới
1. Nhấp vào nút **"Add / Settings"** (biểu tượng bánh răng) trên thanh điều hướng.
2. Điền thông tin cấu hình mạng:
   - **Name (Tên kết nối):** `Order-Queue-Redis`
   - **Host (Địa chỉ máy chủ):** `127.0.0.1` (Nếu dùng Docker kết nối mạng nội bộ giữa các container thì điền `redis`)
   - **Port (Cổng lắng nghe):** `6379`
   - **Password (Mật khẩu):** Để trống (trừ khi file `redis.conf` có cấu hình `requirepass`)
3. Nhấp nút **"Test Connection"**:
   - Khi hệ thống hiển thị thông báo màu xanh `Connected successfully`, nhấp nút **"Save & Connect"**.

---

## 2. Thao Tác Khai Thác Trên Các Cấu Trúc Dữ Liệu Thực Tế

### 2.1. Quan sát Trình duyệt Khóa theo Cấu trúc Cây (Tree View)
- Nhờ áp dụng chuẩn đặt tên phân tách bằng dấu hai chấm (`:`), P3X Redis UI sẽ tự động gom nhóm các khóa thành các nhánh logic:
  - Nhánh `order`: Chứa các bản ghi đơn hàng chi tiết (ví dụ: `1001`, `1002`, `1003`...).
  - Nhánh `queue` > `orders`: Chứa 4 hàng đợi điều phối gồm `pending`, `priority`, `processing`, `dead_letter`.
  - Nhánh `customer`: Chứa danh sách đơn của từng khách hàng (`CUST_01`, `CUST_02`...).
  - Nhánh `checkout` > `lock`: Chứa các khóa phân tán giữ chỗ đang đếm ngược thời gian sống.
  - Nhánh `stats` > `orders` > `count`: Chứa bộ đếm số lượng đơn theo ngày.

### 2.2. Quan sát & Biên tập Dữ liệu Hash (`order:{id}`)
1. Nhấp vào một khóa bất kỳ thuộc nhánh `order`, ví dụ `order:1002`.
2. Màn hình bên phải hiển thị toàn bộ danh sách các trường (Field) và giá trị (Value):
   - `customer_name`: Tran Thi Mai
   - `total`: 1200000
   - `payment_method`: VNPAY
   - `status`: PENDING / PROCESSING / COMPLETED
   - `priority`: 3
3. **Thao tác thêm/sửa trường:** Người dùng có thể chỉnh sửa trực tiếp giá trị của trường hoặc thêm trường mới và nhấn nút **Save**.

### 2.3. Quan sát Hàng đợi FIFO List (`queue:orders:pending`)
1. Nhấp vào khóa `queue:orders:pending`.
2. Giao diện hiển thị danh sách các phần tử theo thứ tự chỉ mục (Index 0, 1, 2...).
3. Người quản trị có thể:
   - Quan sát số lượng phần tử hiện diện trong hàng đợi bằng lệnh `LLEN`.
   - Xem mã các đơn hàng đang chờ xử lý.
   - Thêm phần tử vào đầu danh sách (Push Head) hoặc cuối danh sách (Push Tail) để kiểm thử luồng hàng đợi.

### 2.4. Quan sát Hàng đợi Ưu tiên Sorted Set (`queue:orders:priority`)
1. Nhấp vào khóa `queue:orders:priority`.
2. P3X Redis UI hiển thị bảng gồm 2 cột rõ ràng:
   - Cột **Member (Mã đơn hàng):** Ví dụ `1004`, `1005`, `1002`...
   - Cột **Score (Điểm ưu tiên):** Điểm số thực tương ứng (ví dụ: `5` cho đơn hỏa tốc VIP, `3` cho đơn giao nhanh).
3. Các phần tử được sắp xếp tự động dựa trên Score, giúp dễ dàng nhận biết đơn hàng nào sẽ được Worker bốc ra trước.

### 2.5. Kiểm tra Thời gian sống của Khóa tạm (TTL Countdown)
1. Khi có đơn hàng vừa được bấm đặt trên website, mở nhánh `checkout:lock:{id}` trên P3X.
2. Góc trên bên phải của bảng hiển thị trường **TTL**:
   - Đồng hồ đếm ngược số giây còn lại (ví dụ: `58s`, `45s`, `12s`...).
   - Khi hết 60 giây, khóa tự động biến mất khỏi cây danh mục, giải phóng bộ nhớ RAM tức thì.

---

## 3. Thực Thi Dòng Lệnh Trên Console CLI Nhúng

P3X Redis UI tích hợp sẵn một cửa sổ dòng lệnh nhúng, tái hiện 100% môi trường làm việc của công cụ `redis-cli`.

1. Nhấp vào biểu tượng **"Console"** (dấu nhắc lệnh `>_`) trên thanh công cụ góc phải.
2. Thực thi các câu lệnh nghiệp vụ mẫu:

```bash
# 1. Kiem tra do dai hang doi cho
LLEN queue:orders:pending

# 2. Xem 5 don co diem uu tien cao nhat
ZREVRANGE queue:orders:priority 0 4 WITHSCORES

# 3. Doc toan bo thong tin don hang 1001
HGETALL order:1001

# 4. Kiem tra cac don hang cua khach hang CUST_01
SMEMBERS customer:CUST_01:orders

# 5. Xem bo dem so don trong ngay
GET stats:orders:count:20261013

# 6. Kiem tra thong tin may chu va bo nho su dung
INFO memory

# 7. Kiem tra thoi gian chup anh snapshot gan nhat
LASTSAVE
```

---

## 4. Xuất Dữ Liệu Ra Định Dạng JSON Để Đối Soát

P3X Redis UI hỗ trợ tính năng xuất đối tượng khóa ra định dạng JSON:
1. Nhấp vào khóa cần đối soát (ví dụ `order:1001`).
2. Chọn chế độ xem **JSON View** trên thanh hiển thị dữ liệu.
3. Nhấp nút **Download** hoặc nút **Copy** để lưu trữ toàn bộ cấu trúc dữ liệu ra tệp JSON phục vụ báo cáo.
