# ĐỒ ÁN MÔN HỌC DỮ LIỆU NOSQL: QUẢN LÝ HÀNG ĐỢI XỬ LÝ ĐƠN HÀNG TRỰC TUYẾN
## "Tìm hiểu công cụ P3X Redis UI để quản trị và khai thác Redis trong Quản lý hàng đợi xử lý đơn hàng trực tuyến"

> **Giảng viên hướng dẫn:** ThS. Trần Thị Vân Anh  
> **Sinh viên thực hiện:**  
> 1. Nguyễn Hoàng Lộc - MSSV: 2001230472  
> 2. Nguyễn Long Vỹ - MSSV: 2001231073  
> 3. Nguyễn Đẩu Thủy - MSSV: 2001230951  
> **Trường:** Đại học Công Thương TP. Hồ Chí Minh (HUIT) - Khoa Công Nghệ Thông Tin  
> **Thời gian:** Tháng 10 Năm 2026

---

## 1. Giới Thiệu Đề Tài

Hệ thống được xây dựng nhằm minh họa thực tế việc ứng dụng cơ sở dữ liệu **NoSQL Redis** làm tầng đệm điều phối hàng đợi xử lý đơn hàng bất đồng bộ, kết hợp với công cụ quản trị trực quan **P3X Redis UI**.

Thay vì chỉ đưa ra lý thuyết hoặc mô hình giả lập, ứng dụng là một hệ thống web full-stack hoàn chỉnh, có kết nối Redis thật, Worker xử lý hàng đợi chạy độc lập và P3X Redis UI trực quan hóa toàn bộ biến động dữ liệu theo thời gian thực.

### Các Tính Năng Cốt Lõi:
- **Đầy đủ luồng đặt hàng**: 10 sản phẩm mẫu, giỏ hàng, thông tin khách hàng, chọn loại đơn thường (FIFO) hoặc đơn ưu tiên (VIP).
- **Hàng đợi FIFO tin cậy**: Sử dụng Redis List kết hợp lệnh nguyên tử `LMOVE` (hoặc `RPOPLPUSH`), không làm mất đơn hàng.
- **Hàng đợi Ưu tiên (Priority Queue)**: Sử dụng Redis Sorted Set, ưu tiên xử lý đơn có điểm số cao trước bằng Redis Lua script nguyên tử.
- **Worker bất đồng bộ độc lập**: Mô phỏng quá trình tiếp nhận, kiểm kho, xác nhận và tạo vận đơn với độ trễ 2.5s.
- **Xử lý lỗi & Dead Letter Queue (DLQ)**: Thử lại tối đa 3 lần; nếu quá số lần, đơn được cách ly vào DLQ; quản trị viên có thể xem và bấm "Thử lại" trực tiếp từ giao diện.
- **Phục hồi sự cố (Crash Recovery)**: Khi Worker bị tắt đột ngột lúc đang xử lý, đơn hàng vẫn nằm an toàn trong Redis; Watchdog tự động phát hiện và khôi phục khi khởi động lại.
- **Bảo vệ chống tạo trùng đơn (Idempotency Lock)**: Khóa tạm thời với thời gian sống (TTL) 60 giây.
- **Bộ đếm nguyên tử**: Thống kê số đơn trong ngày bằng `INCR`.
- **Tích hợp P3X Redis UI**: Quan sát trực quan cấu trúc cây (Tree View), Hash, List, Sorted Set, Set, TTL và tương tác Console CLI.

---

## 2. Kiến Trúc Công Nghệ

| Thành phần | Công nghệ sử dụng | Chức năng |
|---|---|---|
| **Frontend** | HTML5, CSS3, JavaScript, Bootstrap 5, Bootstrap Icons | Giao diện Mua Hàng & Dashboard Quản Trị responsive |
| **Backend API** | Node.js (v24 LTS / v20), Express 4 | RESTful API tiếp nhận đơn, điều phối hàng đợi, thống kê |
| **Database & Queue** | Redis In-Memory Database (v5.0+ / v7.0) | Lưu trữ Hash, List FIFO, Sorted Set, Set, Key TTL |
| **Background Worker** | Node.js độc lập (`worker.js`) | Điều phối hàng đợi, xử lý đơn, Retry, DLQ, Watchdog |
| **Redis GUI** | P3X Redis UI (Desktop App & Docker Web UI) | Quản trị, duyệt cây khóa, thực thi CLI, kiểm tra TTL |
| **Triển khai** | Docker Compose / Windows Standalone Batch | Khởi chạy toàn bộ hệ thống bằng 1 thao tác |

---

## 3. Hướng Dẫn Khởi Chạy Nhanh

Hệ thống hỗ trợ 2 cách khởi chạy:

### Cách 1: Khởi Chạy 1-Click trên Windows (Khuyên Dùng Cho Demo)
Mở thư mục dự án và nhấp đúp vào tệp:
```bash
scripts\start-all.bat
```
Script sẽ tự động khởi động:
1. Máy chủ **Redis Server** cổng `6379`.
2. **Web Server Express** cổng `3000`.
3. Tiến trình **Queue Worker** độc lập.
4. Ứng dụng **P3X Redis UI**.

### Cách 2: Khởi Chạy Bằng Docker Compose
Chạy một lệnh duy nhất:
```bash
docker compose up -d --build
```
Lệnh trên sẽ khởi chạy 4 container cô lập:
- `nosql_redis`: Redis Server cổng 6379 kèm AOF và RDB persistence.
- `nosql_p3x_redis_ui`: Web UI cổng 7843.
- `nosql_backend`: Express API cổng 3000.
- `nosql_worker`: Queue Worker xử lý nền.

---

## 4. Địa Chỉ Truy Cập Dịch Vụ

| Dịch vụ | Địa chỉ URL | Mô tả |
|---|---|---|
| **Giao diện Mua Hàng** | [http://localhost:3000](http://localhost:3000) | Chọn mua sản phẩm, đặt đơn thường/ưu tiên, tra cứu đơn hàng |
| **Dashboard Quản Trị** | [http://localhost:3000/admin](http://localhost:3000/admin) | Giám sát độ dài 4 hàng đợi, điều khiển Worker (Pause/Step), tạo batch 10/50/100 đơn, Retry DLQ |
| **P3X Redis UI (Web)** | [http://localhost:7843](http://localhost:7843) | Giao diện đồ họa P3X chạy trên trình duyệt (khi dùng Docker) |
| **P3X Redis UI (Desktop)** | Ứng dụng cài sẵn trên máy | Mở từ Start Menu hoặc qua `scripts\start-all.bat` |

---

## 5. Cấu Hình Kết Nối P3X Redis UI

Khi mở P3X Redis UI:
1. Nhấn nút **"Add / Settings"** để tạo kết nối mới.
2. Điền thông tin:
   - **Name:** `Order-Queue-Redis`
   - **Host:** `127.0.0.1` (hoặc `redis` nếu chạy P3X trong mạng Docker)
   - **Port:** `6379`
   - **Password:** Để trống
3. Nhấn **"Test Connection"** -> Khi hiển thị thông báo thành công, nhấn **"Save & Connect"**.

---

## 6. Chạy Kiểm Thử Tự Động (22 Test Cases)

Để kiểm chứng toàn bộ 22 tiêu chí kỹ thuật (từ TC01 đến TC22):
```bash
npm test
```
*Kết quả: 22/22 Test Cases PASS (100%), bao gồm cả kiểm thử tải đồng thời 100 đơn, crash recovery và chống race condition.*

---

## 7. Cấu Trúc Thư Mục Dự Án

```
nosql/
├── DOAN_NoSQL.docx              # Tài liệu báo cáo gốc của môn học
├── package.json                 # Cấu hình Node.js dependencies & scripts
├── docker-compose.yml           # Khởi chạy Redis, P3X, Backend, Worker
├── Dockerfile.backend           # Dockerfile cho Express Web API
├── Dockerfile.worker            # Dockerfile cho Background Queue Worker
├── .env                         # Cấu hình biến môi trường
├── redis/
│   └── redis.conf               # Cấu hình máy chủ Redis (RDB + AOF)
├── src/
│   ├── config/
│   │   ├── constants.js         # Định nghĩa các Redis keys & statuses
│   │   └── redis.js             # Kết nối ioredis, Lua scripts, fallback LMOVE
│   ├── data/
│   │   └── sample_products.js   # 10 sản phẩm mẫu có ảnh SVG vector
│   ├── services/
│   │   ├── orderService.js      # Nghiệp vụ tạo đơn, khóa TTL, đọc Hash
│   │   └── queueService.js      # Thống kê hàng đợi, điều khiển Worker, Retry DLQ
│   ├── worker/
│   │   └── worker.js            # Tiến trình Worker độc lập: FIFO, Priority, DLQ, Watchdog
│   ├── routes/
│   │   └── api.js               # REST API endpoints cho Client và Admin
│   ├── public/
│   │   ├── index.html           # Giao diện Khách hàng
│   │   ├── admin.html           # Dashboard Quản trị viên
│   │   ├── css/                 # style.css & admin.css
│   │   └── js/                  # app.js & admin.js
│   └── server.js                # Express Web Server chính
├── tests/
│   ├── test_runner.js           # Bộ kiểm thử 22 Test Cases (TC01-TC22)
│   └── seed_data.js             # Nạp 5 đơn 1001-1005 chuẩn báo cáo
├── scripts/
│   ├── start-all.bat            # 1-Click khởi chạy toàn bộ trên Windows
│   ├── backup_redis.bat         # Sao lưu RDB snapshot xuống đĩa
│   └── restore_redis.bat        # Phục hồi dữ liệu từ bản sao lưu
└── docs/
    ├── ARCHITECTURE.md          # Sơ đồ và kiến trúc hệ thống
    ├── REDIS_DATA_DESIGN.md     # Chi tiết thiết kế các cấu trúc khóa Redis
    ├── INSTALL_WINDOWS.md       # Hướng dẫn cài đặt chi tiết trên Windows
    ├── P3X_REDIS_UI_GUIDE.md    # Hướng dẫn thao tác và khai thác P3X Redis UI
    ├── DEMO_SCRIPT.md           # Kịch bản trình diễn trước giảng viên (5-10 phút)
    ├── TEST_REPORT.md           # Báo cáo kiểm thử thực tế có bằng chứng
    ├── REPORT_CHAPTER_05.md     # Nội dung hoàn chỉnh Chương 5 đưa vào báo cáo
    ├── REPORT_CORRECTIONS.md    # Các điểm cần chỉnh sửa trong báo cáo cũ
    └── PROJECT_STATUS.md        # Bảng theo dõi tình trạng hoàn thành
```

---

## 8. Danh Mục Tài Liệu Bàn Giao

Vui lòng đọc các tài liệu chi tiết trong thư mục `docs/`:
- [Kiến trúc hệ thống](file:///c:/Users/nguye/OneDrive/Desktop/Project/nosql/nosql/docs/ARCHITECTURE.md)
- [Thiết kế dữ liệu Redis](file:///c:/Users/nguye/OneDrive/Desktop/Project/nosql/nosql/docs/REDIS_DATA_DESIGN.md)
- [Kịch bản Demo trước Giảng viên](file:///c:/Users/nguye/OneDrive/Desktop/Project/nosql/nosql/docs/DEMO_SCRIPT.md)
- [Báo cáo kiểm thử 22 Test Cases](file:///c:/Users/nguye/OneDrive/Desktop/Project/nosql/nosql/docs/TEST_REPORT.md)
- [Nội dung hoàn chỉnh Chương 5](file:///c:/Users/nguye/OneDrive/Desktop/Project/nosql/nosql/docs/REPORT_CHAPTER_05.md)
- [Tổng hợp điểm sửa đổi báo cáo cũ](file:///c:/Users/nguye/OneDrive/Desktop/Project/nosql/nosql/docs/REPORT_CORRECTIONS.md)
