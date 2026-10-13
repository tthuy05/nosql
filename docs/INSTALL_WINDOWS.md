# HƯỚNG DẪN CÀI ĐẶT VÀ KHỞI CHẠY HỆ THỐNG TRÊN WINDOWS
## (WINDOWS 1-CLICK DEPLOYMENT & AUTOMATION GUIDE)

---

## 1. TỔNG QUAN VỀ KHẢ NĂNG TƯƠNG THÍCH TRÊN MÁY WINDOWS KHÁC

Toàn bộ hệ thống tập lệnh khởi chạy (`.bat`) đã được chuẩn hóa và tái cấu trúc triệt để theo tiêu chuẩn Windows DevOps & Automation:
- **Tự động nhận diện thư mục:** Sử dụng `%~dp0` động, người dùng có thể giải nén project vào bất kỳ thư mục hay ổ đĩa nào (`C:`, `D:`, thư mục Desktop, thư mục chứa khoảng trắng như `C:\Do An NoSQL\nosql`).
- **Triệt tiêu hoàn toàn lỗi font và lỗi phân giải lệnh:** Toàn bộ file script được lưu ở định dạng **ASCII thuần túy với ký tự xuống dòng Windows CRLF (`\r\n`)**, không dùng `chcp 65001` gây trượt con trỏ tệp, không chứa ký tự tiếng Việt có dấu trong luồng lệnh, triệt tiêu 100% các lỗi `'BOT' is not recognized`, `'kiem'`, `'indstr'`, `'/nobreak'`.
- **Hỗ trợ 2 chế độ khởi chạy linh hoạt:** Tự động phát hiện môi trường để chọn giữa **Docker Compose Mode** (chạy container) hoặc **Local Standalone Mode** (chạy trực tiếp bằng Node.js + Redis nhúng sẵn trong `redis-bin`).
- **Không bao giờ tự đóng CMD khi lỗi:** Mọi thông báo lỗi đều đi kèm giải thích nguyên nhân rõ ràng và lệnh `pause` để người dùng dễ dàng khắc phục.

---

## 2. HỆ THỐNG CÁC TẬP LỆNH KHỞI CHẠY (.BAT)

| Tên tập lệnh | Vị trí | Chức năng chính |
|---|---|---|
| **`start.bat`** | **Thư mục gốc** | **TẬP LỆNH CHÍNH (KHUYÊN DÙNG):** Tự kiểm tra môi trường, hiển thị menu thông minh, cho phép chọn chạy Docker hoặc Local chỉ với 1 phím bấm. |
| `scripts\start-all.bat` | `scripts/` | Tập lệnh đồng bộ gọi `start.bat` từ thư mục `scripts/`. |
| `scripts\start-local.bat` | `scripts/` | **Chế độ Local Standalone:** Chạy trực tiếp Node.js + `redis-bin\redis-server.exe` (không cần Docker). |
| `scripts\start-docker.bat` | `scripts/` | **Chế độ Docker Compose:** Kiểm tra Docker daemon, tải container và khởi chạy 4 service chuẩn. |
| `scripts\check-env.bat` | `scripts/` | **Công cụ chẩn đoán:** Kiểm tra nhanh tình trạng cài đặt Node.js, Docker, cổng 6379, 3000 và P3X. |
| `scripts\stop-all.bat` | `scripts/` | **Dừng hệ thống:** Tắt sạch các container Docker và tiến trình Node/Redis đang chạy nền an toàn. |
| `scripts\backup_redis.bat` | `scripts/` | **Sao lưu dữ liệu:** Gọi `BGSAVE` và copy snapshot sang thư mục `backup/` (không phụ thuộc lệnh `wmic`). |
| `scripts\restore_redis.bat` | `scripts/` | **Phục hồi dữ liệu:** Khôi phục `dump_latest.rdb` và nạp lại vào Redis an toàn. |

---

## 3. HƯỚNG DẪN DÀNH CHO NGƯỜI DÙNG KHÔNG CÓ KIẾN THỨC LẬP TRÌNH

### Bước 1: Giải nén thư mục project
Giải nén tệp `.zip` của project vào bất kỳ thư mục nào trên máy tính (ví dụ: `D:\nosql` hoặc `C:\Users\TenBan\Desktop\nosql`).

### Bước 2: Chạy file khởi động
Mở thư mục vừa giải nén, nhấp đúp chuột trực tiếp vào file:
```cmd
start.bat
```

### Bước 3: Chọn chế độ phù hợp với máy của bạn
Màn hình CMD sẽ hiển thị giao diện kiểm tra:

- **Trường hợp máy ĐÃ BẬT Docker Desktop:**
  - Nhấn phím `1` (hoặc nhấn `Enter`): Hệ thống tự động khởi chạy 4 container qua Docker Compose.
- **Trường hợp máy CHƯA BẬT hoặc CHƯA CÀI Docker:**
  - Nhấn phím `1` (hoặc nhấn `Enter`): Hệ thống tự động chuyển sang chạy **Chế độ Local Standalone** (chạy bằng Node.js và Redis có sẵn trong project, cực kỳ nhẹ và nhanh chỉ mất 2 giây).
- **Trường hợp muốn kiểm tra máy mình đã cài những gì:**
  - Nhấn phím `3`: Chạy công cụ kiểm tra và chẩn đoán môi trường.

### Bước 4: Mở trình duyệt sử dụng
Sau khi màn hình thông báo **"HE THONG DA KHOI CHAY HOAN TAT"**, mở trình duyệt web:
1. **Trang Mua Hàng Khách Hàng:** [http://localhost:3000](http://localhost:3000)
2. **Dashboard Quản Trị Hệ Thống:** [http://localhost:3000/admin](http://localhost:3000/admin)
3. **P3X Redis UI Quản Trị Khóa:**
   - Nếu chạy Docker: Truy cập giao diện Web tại [http://localhost:7843](http://localhost:7843)
   - Nếu chạy Local: Cửa sổ P3X Desktop đã tự động mở (nếu máy đã cài).

### Bước 5: Tắt hệ thống khi dùng xong
Khi thuyết trình hoặc chấm điểm xong, chỉ cần nhấp đúp chuột vào file:
```cmd
scripts\stop-all.bat
```
Toàn bộ cổng mạng và tiến trình sẽ được giải phóng an toàn.

---

## 4. YÊU CẦU PHẦN MỀM TỐI THIỂU TRÊN MÁY KHÁC

Bạn chỉ cần đáp ứng **MỘT TRONG HAI** điều kiện sau:

### LỰA CHỌN A: Chạy bằng Chế độ Local (Nhẹ nhất, khuyên dùng)
- **Chỉ cần cài đặt duy nhất:** [Node.js](https://nodejs.org/) (Phiên bản v18, v20 hoặc v24 LTS).
  - Cài nhanh qua PowerShell:
    ```powershell
    winget install OpenJS.NodeJS.LTS
    ```
- **Redis Server:** Đã được nhúng sẵn file thực thi 64-bit tại `redis-bin\redis-server.exe` trong project, **không cần cài thêm Redis**.
- **P3X Redis UI Desktop (Tùy chọn):**
  - Cài nhanh qua PowerShell:
    ```powershell
    winget install PatrikLaszlo.P3XRedisUI
    ```

### LỰA CHỌN B: Chạy bằng Docker Compose (Đầy đủ môi trường container)
- **Chỉ cần cài đặt duy nhất:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) cho Windows.
- Đảm bảo Docker Desktop đã được mở và biểu tượng cá voi ở khay hệ thống hiển thị màu xanh lá (*Docker Engine is running*).
- Không cần cài thêm Node.js hay Redis vì Docker sẽ tự tải image và đóng gói độc lập.

---

## 5. XỬ LÝ MỘT SỐ TÌNH HUỐNG THƯỜNG GẶP

### 1. Thông báo "Docker Engine chua hoat dong"
- **Nguyên nhân:** Phần mềm Docker Desktop trên máy chưa được mở.
- **Cách xử lý:** 
  - Mở ứng dụng "Docker Desktop" từ Desktop hoặc Start Menu, đợi khởi động xong rồi chạy lại `start.bat`.
  - Hoặc chọn ngay `Chế độ Local Standalone` để chạy mà không cần mở Docker.

### 2. Thông báo "Khong tim thay Node.js tren he thong" (khi chạy Local)
- **Nguyên nhân:** Máy chưa cài Node.js hoặc chưa cấu hình biến môi trường PATH.
- **Cách xử lý:** Cài đặt Node.js từ [https://nodejs.org/](https://nodejs.org/). Script đã tích hợp tính năng tự động tìm kiếm Node.js tại các thư mục cài đặt mặc định (`C:\Program Files\nodejs`) ngay cả khi PATH chưa được cập nhật.

### 3. Cổng 6379 hoặc 3000 báo "dang co tien trinh su dung"
- **Nguyên nhân:** Lần chạy trước chưa tắt tiến trình hoặc có dịch vụ khác chiếm cổng.
- **Cách xử lý:** Nhấp đúp chuột vào `scripts\stop-all.bat` để dọn dẹp toàn bộ cổng mạng đang bị chiếm dụng.

### 4. Kiểm tra độ chuẩn xác của hệ thống
- Mở PowerShell hoặc CMD tại thư mục gốc và chạy:
  ```powershell
  npm test
  ```
- Kết quả mong đợi: **22/22 Test Cases PASS (100%)**, bao gồm xác thực dữ liệu Hash, List FIFO, Priority Queue, TTL, Dead Letter Queue và BGSAVE Snapshot.
