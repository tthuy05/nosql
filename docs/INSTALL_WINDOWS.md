# HƯỚNG DẪN CÀI ĐẶT VÀ VẬN HÀNH HỆ THỐNG TRÊN WINDOWS
## (WINDOWS INSTALLATION & DEPLOYMENT GUIDE)

---

## 1. Yêu Cầu Hệ Thống Tối Thiểu
- **Hệ điều hành:** Windows 10 hoặc Windows 11 (64-bit).
- **RAM:** Tối thiểu 4 GB (Khuyên dùng 8 GB trở lên).
- **Ổ đĩa trống:** Tối thiểu 1 GB.
- **Quyền hạn:** Quyền User thông thường hoặc Administrator.

---

## 2. Phương Án 1: Khởi Chạy Nhanh Bằng Standalone Script (Khuyên Dùng)

Phương án này chạy trực tiếp trên Windows mà không phụ thuộc vào Docker, cực kỳ nhẹ và khởi động chỉ mất 2-3 giây.

### Bước 2.1: Kiểm tra môi trường Node.js
Mở PowerShell hoặc CMD và kiểm tra phiên bản:
```powershell
node -v
npm -v
```
- Nếu máy chưa có Node.js, bạn có thể cài đặt tự động qua lệnh winget:
  ```powershell
  winget install OpenJS.NodeJS.LTS
  ```
  *(Sau khi cài đặt xong, khởi động lại PowerShell/CMD để nhận lệnh `node`).*

### Bước 2.2: Khởi động toàn bộ hệ thống
Trong thư mục gốc của đồ án, bạn chỉ cần nhấp đúp vào tệp:
```cmd
scripts\start-all.bat
```
Script sẽ tự động:
1. Chạy máy chủ `redis-server.exe` tại cổng `6379`.
2. Chạy ứng dụng Web Express tại cổng `3000`.
3. Chạy tiến trình Background Queue Worker độc lập.
4. Tự động mở ứng dụng P3X Redis UI Desktop đã cài đặt.

---

## 3. Phương Án 2: Khởi Chạy Bằng Docker Compose

Nếu giảng viên hoặc người chấm thi yêu cầu chạy toàn bộ môi trường container hóa chuẩn:

### Bước 3.1: Kiểm tra Docker Desktop
Đảm bảo phần mềm **Docker Desktop** đã được bật và đang chạy trên khay hệ thống (System Tray).
Kiểm tra bằng lệnh:
```powershell
docker ps
docker compose version
```

### Bước 3.2: Khởi chạy các container
Tại thư mục gốc của dự án, chạy lệnh:
```powershell
docker compose up -d --build
```

Lệnh trên sẽ tự động tải các image và khởi chạy 4 service:
1. `nosql_redis` (Cổng 6379)
2. `nosql_p3x_redis_ui` (Cổng 7843)
3. `nosql_backend` (Cổng 3000)
4. `nosql_worker` (Chạy nền)

Để xem log của hệ thống:
```powershell
docker compose logs -f
```

Để dừng toàn bộ hệ thống:
```powershell
docker compose down
```

---

## 4. Hướng Dẫn Cài Đặt P3X Redis UI Trên Windows

Dự án hỗ trợ 2 hình thức sử dụng P3X Redis UI:

### Hình thức A: Bản Desktop App (.exe)
- Nếu máy chưa cài, bạn có thể cài tự động qua lệnh winget:
  ```powershell
  winget install PatrikLaszlo.P3XRedisUI
  ```
- Hoặc tải trực tiếp bản cài đặt từ GitHub:
  Truy cập: [https://github.com/patrikx3/redis-ui/releases](https://github.com/patrikx3/redis-ui/releases) -> Tải tệp `p3x-redis-ui-setup-x.x.x.exe` và tiến hành cài đặt bình thường.

### Hình thức B: Bản Docker Web UI
- Khi khởi chạy bằng `docker compose up -d`, P3X Redis UI Web sẽ tự động lắng nghe tại:
  [http://localhost:7843](http://localhost:7843)

---

## 5. Kiểm Tra Hoạt Động Của Hệ Thống

Sau khi khởi chạy, mở trình duyệt và kiểm tra:
1. **Trang Mua Hàng:** [http://localhost:3000](http://localhost:3000) -> Hiển thị danh mục 10 sản phẩm mẫu.
2. **Dashboard Quản Trị:** [http://localhost:3000/admin](http://localhost:3000/admin) -> Hiển thị các khối Metric và cột hàng đợi.
3. **P3X Redis UI:** [http://localhost:7843](http://localhost:7843) (hoặc ứng dụng Desktop).
4. **Chạy kiểm thử 22 Test Cases:**
   ```powershell
   npm test
   ```
   Kết quả trả về đạt 100% PASS.
