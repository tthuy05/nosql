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

## 1. MỤC ĐÍCH CỦA DỰ ÁN (GIẢI QUYẾT BÀI TOÁN GÌ?)

### 1.1. Bài toán thực tế: Hiện tượng "Sập Web Ngày Săn Sale"
Trong các hệ thống thương mại điện tử (Shopee, Tiki, Lazada, bán vé concert), tại những thời điểm Flash Sale có hàng trăm nghìn khách hàng bấm nút **"Đặt hàng"** cùng một lúc:
- Nếu ghi trực tiếp vào cơ sở dữ liệu quan hệ truyền thống (MySQL, PostgreSQL, SQL Server): Ổ cứng bị nghẽn I/O, cạn kiệt connection pool, khóa bảng (table lock) dẫn tới **máy chủ bị treo và sập web hoàn toàn**.
- Yêu cầu đặt ra: Cần một tầng đệm trung gian phi trạng thái hoạt động trên **bộ nhớ RAM** với tốc độ cực nhanh (< 1ms) để tiếp nhận đơn hàng ngay lập tức, sau đó phân phối cho các tiến trình xử lý ngầm phía sau bốc ra giải quyết với tốc độ ổn định.

### 1.2. Giải pháp của Đồ án: Redis Queue & Worker bất đồng bộ
Đồ án ứng dụng **Redis** làm hàng đợi đệm và **P3X Redis UI** làm công cụ quản trị trực quan:
- **Tiếp nhận tức thì:** Khách bấm đặt hàng, đơn được ghi vào Redis trên RAM trong **0.001 giây** và trả về thông báo *"Đã tiếp nhận đơn hàng thành công!"*. Web luôn mượt mà, không bao giờ bị nghẽn.
- **Xử lý bất đồng bộ:** Tiến trình **Worker độc lập** chạy ngầm phía sau sẽ tuần tự bốc đơn ra để kiểm kho, gọi ngân hàng và in vận đơn với tốc độ an toàn.

---

## 2. VÍ DỤ ĐỜI THƯỜNG DỄ HIỂU: MÔ HÌNH QUÁN TRÀ SỮA

Để dễ hình dung bản chất của dự án, hãy so sánh với **Một quán trà sữa giờ tan tầm**:

| Thành phần trong Quán Trà Sữa | Tương ứng trong Hệ thống của Đồ án | Chức năng nghiệp vụ |
|---|---|---|
| **Khách hàng gọi món** | Giao diện Khách hàng (`index.html`) | Chọn sản phẩm, chọn đơn thường hoặc đơn VIP |
| **Nhân viên Thu Ngân** | Backend API Server (`server.js`) | Kiểm tra chống bấm đúp (Lock TTL), nhận đơn tức thì |
| **Giỏ đựng phiếu gọi món** | **Hàng đợi Redis (Queue trên RAM)** | Nơi xếp hàng các đơn chờ làm |
| **Nhân viên Pha Chế trong quầy** | **Worker độc lập (`worker.js`)** | Rút từng đơn ra làm theo năng lực cho phép |
| **Bảng điều khiển của Quản Lý Quán** | **P3X Redis UI & Dashboard Admin** | Quan sát số lượng đơn đang chờ, xử lý đơn lỗi |

---

## 3. CÁCH HOẠT ĐỘNG CHI TIẾT CỦA MỘT ĐƠN HÀNG

```
[ Khách hàng bấm Đặt hàng ]
            │
            ▼
 1. Backend kiểm tra Khóa chống click đúp (checkout:lock:{id} - TTL 60s)
            │
            ▼
 2. Lưu chi tiết đơn vào Redis Hash (order:{id})
 3. Tăng bộ đếm đơn trong ngày (stats:orders:count:{date})
 4. Thêm mã đơn vào Set của khách hàng (customer:{id}:orders)
            │
       ┌────┴──────────────────────────┐
       ▼                               ▼
 [ ĐƠN HÀNG THƯỜNG ]             [ ĐƠN HÀNG VIP / HỎA TỐC ]
 Xếp vào List FIFO               Xếp vào Sorted Set (Có Score)
 (queue:orders:pending)          (queue:orders:priority)
       │                               │
       └───────────────┬───────────────┘
                       ▼
 5. WORKER BỐC ĐƠN RA XỬ LÝ (Ưu tiên kiểm tra đơn VIP trước)
                       │
                       ▼ (Dùng lệnh nguyên tử LMOVE / Lua Script)
  Chuyển sang List "Đang xử lý" (queue:orders:processing)
  để nếu LỠ MẤT ĐIỆN thì đơn KHÔNG BỊ MẤT!
                       │
            ┌──────────┴──────────┐
            ▼                     ▼
     [ Xử lý THÀNH CÔNG ]   [ Xử lý THẤT BẠI ]
     • Cập nhật status      • Tăng retry_count (1..3)
       sang COMPLETED       • Nếu <= 3 lần: Đẩy lại pending
     • Tạo mã vận đơn       • Nếu > 3 lần: Chuyển vào
     • Xóa khỏi processing    Dead Letter Queue (queue:orders:dead_letter)
```

---

## 4. TẠI SAO LẠI CHỌN TỪNG CẤU TRÚC DỮ LIỆU REDIS NÀY?

Đây là phần **trọng tâm kiến thức NoSQL** của đề tài:

| Khóa Redis | Kiểu Dữ Liệu | Lý do kỹ thuật & Nghiệp vụ |
|---|:---:|---|
| `order:{id}` | **Hash** | Lưu trữ thực thể đơn hàng dạng bảng băm (Field-Value) như một bản ghi CSDL. Cho phép đọc/cập nhật từng trường (`status`, `tracking_code`) với tốc độ $O(1)$ mà không cần phân tích toàn bộ chuỗi JSON. |
| `queue:orders:pending` | **List** | Cấu trúc Danh sách liên kết đôi (Doubly Linked List). Tối ưu hoàn hảo cho hàng đợi FIFO: thêm vào đầu bằng `LPUSH` và lấy ra ở cuối bằng `LMOVE` với độ phức tạp $O(1)$. |
| `queue:orders:priority` | **Sorted Set** | Tập hợp sắp thứ tự theo điểm số (Score = Priority). Điểm càng cao càng được ưu tiên; lấy ra bằng `ZPOPMAX` với thời gian chỉ $O(\log N)$. |
| `queue:orders:processing` | **List** | Hàng đợi tin cậy (Reliable Queue Pattern). Tạm giữ các đơn đang được Worker xử lý thực tế; loại bỏ hoàn toàn nguy cơ mất đơn hàng nếu Worker bị sập nguồn giữa chừng. |
| `queue:orders:dead_letter` | **List** | Dead Letter Queue (DLQ) dùng để cách ly an toàn các đơn hàng bị lỗi quá 3 lần, tránh làm nghẽn các đơn bình thường khác. |
| `customer:{id}:orders` | **Set** | Tập hợp các đơn thuộc sở hữu của 1 khách hàng. Tự động loại bỏ trùng lặp, kiểm tra quyền sở hữu bằng `SISMEMBER` tức thì $O(1)$. |
| `checkout:lock:{id}` | **String (TTL)** | Khóa phân tán Idempotency Lock tự động biến mất sau 60 giây (`EX 60`), ngăn chặn khách hàng bấm liên tục nhiều lần gây tạo đơn trùng. |
| `stats:orders:count:{date}` | **String (Counter)** | Bộ đếm nguyên tử (`INCR`) an toàn tuyệt đối khi có hàng trăm luồng đặt hàng đồng thời, không bị đè số. |

---

## 5. VAI TRÒ CỦA CÔNG CỤ P3X REDIS UI

P3X Redis UI là công cụ đồ họa mã nguồn mở (Open-source Web & Desktop GUI) giúp người quản trị:
1. **Duyệt cây khóa trực quan (Tree View):** Gom nhóm tự động theo chuẩn namespace dấu hai chấm `:` (`order:*`, `queue:*`, `customer:*`).
2. **Quan sát biến động hàng đợi:** Thấy rõ các đơn hàng nhảy từ `pending` sang `processing` rồi sang `completed` khi Worker chạy.
3. **Giám sát thời gian sống (TTL):** Xem đồng hồ đếm ngược của các khóa tạm thời.
4. **Console CLI nhúng:** Tái hiện môi trường `redis-cli` thực thụ để chạy các lệnh quản trị, sao lưu (`BGSAVE`, `INFO`).

---

## 6. ĐOẠN "VĂN MẪU" 1 PHÚT ĐỂ TRẢ LỜI GIẢNG VIÊN

> *"Thưa cô, đề tài của nhóm em giải quyết bài toán: **Làm sao để hệ thống bán hàng không bị quá tải, sập web khi có lượng lớn người cùng đặt hàng một lúc**.*  
>  
> *Giải pháp của nhóm là dùng **Redis làm tầng hàng đợi đệm bất đồng bộ**. Khi khách đặt hàng, đơn được tiếp nhận tức thì vào Redis trên bộ nhớ RAM. Sau đó, tiến trình **Worker độc lập** sẽ rút đơn ra xử lý tuần tự theo cơ chế **FIFO (bằng Redis List)** và **Ưu tiên cho đơn VIP (bằng Redis Sorted Set)**.*  
>  
> *Nhóm sử dụng công cụ **P3X Redis UI** để trực quan hóa toàn bộ dữ liệu đa cấu trúc (Hash, List, Sorted Set, Set, TTL), giúp người quản trị theo dõi biến động các hàng đợi theo thời gian thực mà không cần thao tác dòng lệnh phức tạp."*

---

## 7. KIẾN TRÚC CÔNG NGHỆ

| Thành phần | Công nghệ sử dụng | Chức năng |
|---|---|---|
| **Frontend** | HTML5, CSS3, JavaScript, Bootstrap 5 | Giao diện Mua Hàng & Dashboard Quản Trị responsive |
| **Backend API** | Node.js (v24 LTS / v20), Express 4 | RESTful API tiếp nhận đơn, điều phối hàng đợi, thống kê |
| **Database & Queue** | Redis In-Memory Database (v5.0+ / v7.0) | Lưu trữ Hash, List FIFO, Sorted Set, Set, Key TTL |
| **Background Worker** | Node.js độc lập (`worker.js`) | Điều phối hàng đợi, xử lý đơn, Retry, DLQ, Watchdog |
| **Redis GUI** | P3X Redis UI (Desktop App & Docker Web UI) | Quản trị, duyệt cây khóa, thực thi CLI, kiểm tra TTL |
| **Triển khai** | Docker Compose / Windows Standalone Batch | Khởi chạy toàn bộ hệ thống bằng 1 thao tác |

---

## 8. HƯỚNG DẪN KHỞI CHẠY HỆ THỐNG TRÊN WINDOWS

### Cách 1: Khởi chạy 1-Click thông minh (Khuyên dùng khi thuyết trình & nộp bài)
Giải nén project vào bất kỳ thư mục nào trên máy Windows, nhấp đúp trực tiếp vào tệp ngay tại thư mục gốc:
```cmd
start.bat
```
Script sẽ tự động kiểm tra môi trường máy tính và cho bạn lựa chọn:
- **Tự động nhận diện Docker:** Nếu máy đang bật Docker Desktop, khởi chạy ngay 4 container qua Docker Compose.
- **Tự động hỗ trợ Local:** Nếu máy chưa bật Docker, có thể chạy ngay bằng **Chế độ Local Standalone** (chỉ cần Node.js, Redis đã có sẵn trong project tại `redis-bin\redis-server.exe`).
- **Tự động mở P3X Redis UI:** Mở ứng dụng Desktop hoặc hiển thị link Web UI trực quan.

*(Bạn cũng có thể chạy file `scripts\start-all.bat` hoặc `scripts\start-local.bat` / `scripts\start-docker.bat` tùy nhu cầu).*

### Cách 2: Khởi chạy thủ công bằng Docker Compose
```bash
docker compose up -d --build
```

### Cách 3: Dừng toàn bộ hệ thống khi dùng xong
Nhấp đúp vào tệp:
```cmd
scripts\stop-all.bat
```
*(Xem chi tiết toàn bộ hướng dẫn tại [docs/INSTALL_WINDOWS.md](docs/INSTALL_WINDOWS.md)).*

---

## 9. ĐỊA CHỈ TRUY CẬP DỊCH VỤ

| Dịch vụ | Địa chỉ URL | Mô tả |
|---|---|---|
| **Trang Mua Hàng Khách Hàng** | [http://localhost:3000](http://localhost:3000) | **Đã có thanh Đặt Hàng Nhanh 1-Click** (Đơn thường FIFO, Đơn VIP 5★, Đơn lỗi DLQ) |
| **Dashboard Quản Trị** | [http://localhost:3000/admin](http://localhost:3000/admin) | **Trung tâm Kịch bản Demo 1-Click + Hộp Teleprompter gợi ý câu thoại cho Thầy/Cô** + Chỉnh tốc độ Worker (🐢 Chậm 3.5s / 🚶 Vừa 1.5s / ⚡ Siêu Tốc 0.3s) |
| **P3X Redis UI (Web)** | [http://localhost:7843](http://localhost:7843) | Giao diện đồ họa P3X chạy trên trình duyệt (Host: `host.docker.internal`, Port: `6379`) |
| **P3X Redis UI (Desktop)** | Cửa sổ Desktop trên máy | Mở từ Taskbar hoặc Start Menu |

---

## 10. CHẠY KIỂM THỬ TỰ ĐỘNG (22 TEST CASES PASS 100%)

Để kiểm chứng toàn bộ 22 tiêu chí kỹ thuật:
```bash
npm test
```
*Kết quả: 22/22 Test Cases PASS (100%), bao gồm cả kiểm thử tải đồng thời 100 đơn, crash recovery và chống race condition.*

---

## 11. DANH MỤC TÀI LIỆU CHI TIẾT BÀN GIAO

Toàn bộ tài liệu chi tiết nằm trong thư mục `docs/`:
1. [docs/ARCHITECTURE.md](file:///c:/Users/nguye/OneDrive/Desktop/Project/nosql/nosql/docs/ARCHITECTURE.md) – Sơ đồ và kiến trúc hệ thống toàn diện.
2. [docs/REDIS_DATA_DESIGN.md](file:///c:/Users/nguye/OneDrive/Desktop/Project/nosql/nosql/docs/REDIS_DATA_DESIGN.md) – Chi tiết thiết kế các cấu trúc khóa Redis.
3. [docs/DEMO_SCRIPT.md](file:///c:/Users/nguye/OneDrive/Desktop/Project/nosql/nosql/docs/DEMO_SCRIPT.md) – **Kịch bản trình diễn trước giảng viên (5–10 phút)**.
4. [docs/TEST_REPORT.md](file:///c:/Users/nguye/OneDrive/Desktop/Project/nosql/nosql/docs/TEST_REPORT.md) – Báo cáo kiểm thử 22 Test Cases có bằng chứng thực tế.
5. [docs/REPORT_CHAPTER_05.md](file:///c:/Users/nguye/OneDrive/Desktop/Project/nosql/nosql/docs/REPORT_CHAPTER_05.md) – **Nội dung hoàn chỉnh Chương 5 để đưa vào báo cáo Word/PDF**.
6. [docs/REPORT_CORRECTIONS.md](file:///c:/Users/nguye/OneDrive/Desktop/Project/nosql/nosql/docs/REPORT_CORRECTIONS.md) – Bảng tổng hợp các điểm sửa đổi trong báo cáo cũ.
7. [docs/P3X_REDIS_UI_GUIDE.md](file:///c:/Users/nguye/OneDrive/Desktop/Project/nosql/nosql/docs/P3X_REDIS_UI_GUIDE.md) – Hướng dẫn thao tác trên P3X Redis UI.
8. [docs/INSTALL_WINDOWS.md](file:///c:/Users/nguye/OneDrive/Desktop/Project/nosql/nosql/docs/INSTALL_WINDOWS.md) – Hướng dẫn cài đặt trên Windows.
9. [docs/PROJECT_STATUS.md](file:///c:/Users/nguye/OneDrive/Desktop/Project/nosql/nosql/docs/PROJECT_STATUS.md) – Tình trạng hoàn thành dự án.
