# ĐỒ ÁN MÔN HỌC DỮ LIỆU NOSQL: QUẢN LÝ HÀNG ĐỢI XỬ LÝ ĐƠN HÀNG TRỰC TUYẾN
## "Tìm hiểu công cụ P3X Redis UI để quản trị và khai thác Redis trong Quản lý hàng đợi xử lý đơn hàng trực tuyến"

> **Giảng viên hướng dẫn:** ThS. Trần Thị Vân Anh  
> **Sinh viên thực hiện:**  
> 1. Nguyễn Hoàng Lộc - MSSV: 2001230472  
> 2. Nguyễn Long Vỹ - MSSV: 2001231073  
> 3. Nguyễn Đẩu Thủy - MSSV: 2001230951  
> **Trường:** Đại học Công Thương TP. Hồ Chí Minh (HUIT) - Khoa Công Nghệ Thông Tin  
> **Thời gian:** Tháng 10 Năm 2026  
> **Nhánh làm việc chính thức:** `fix/queue-reliability-handoff`  

---

### BẢN TIN KỸ THUẬT VÀ TÌNH TRẠNG NGHIỆM THU (26/10/2026)

- **Kết quả kiểm định chất lượng:** Hệ thống đạt **35 PASS, 0 FAIL, 3 BLOCKED** trên bộ kiểm thử tự động đa tầng và **14/14 BƯỚC PASS (100%)** trên kịch bản tổng duyệt Demo E2E thực tế.
- **Môi trường hoạt động chính thức:** Đã kiểm nghiệm hoàn tất trên môi trường **Windows Local Standalone** (Node.js v22/v24, Redis Server v5.0.14.1 trên cổng 6379, P3X Redis UI Desktop).
- **Trạng thái Docker Desktop:** Tệp `docker-compose.yml` đạt chuẩn cú pháp, tuy nhiên runtime trên máy chủ kiểm thử đang ở trạng thái **BLOCKED** do lỗi hệ thống WSL2 Init Control API timeout (xem chi tiết tại [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md)). Không ảnh hưởng đến môi trường Local.
- **Bảo mật Quản trị:** API `/admin` và `/api/admin/*` bắt buộc xác thực **HTTP Basic Auth** (`admin` / `ADMIN_PASSWORD` cấu hình trong `.env`). Nếu thiếu mật khẩu, hệ thống trả về HTTP 503.
- **Tài liệu bàn giao & Báo cáo tiểu luận:** Xem toàn văn nội dung bổ sung Chương 5 và Kết luận tại [docs/REPORT_CORRECTIONS.md](docs/REPORT_CORRECTIONS.md); biên bản nghiệm thu tại [docs/FINAL_ACCEPTANCE.md](docs/FINAL_ACCEPTANCE.md).

---

## 1. MỤC ĐÍCH CỦA DỰ ÁN

### 1.1. Bài toán thực tế: Quá tải hệ thống trong đợt cao điểm Flash Sale
Trong các nền tảng thương mại điện tử, tại thời điểm khuyến mãi lớn có hàng chục nghìn lượt khách hàng nhấn nút **"Đặt hàng"** cùng một lúc:
- **Nguy cơ nghẽn CSDL quan hệ:** Nếu ghi đồng thời trực tiếp vào RDBMS truyền thống (MySQL, PostgreSQL, SQL Server), ổ cứng gặp tình trạng nghẽn I/O, cạn kiệt Connection Pool và khóa bảng (Table Lock), khiến hệ thống bị treo hoặc từ chối phục vụ.
- **Giải pháp hàng đợi đệm:** Cần một tầng trung gian phi trạng thái hoạt động trên **bộ nhớ RAM** với tốc độ cực nhanh để tiếp nhận yêu cầu đặt hàng, sau đó chuyển giao cho các tiến trình xử lý ngầm (Worker) bốc đơn ra giải quyết với tốc độ kiểm soát an toàn.

### 1.2. Giải pháp kỹ thuật: Redis Message Queue & Quản trị trực quan qua P3X Redis UI
- **Tầng tiếp nhận (HTTP Ingestion):** Sử dụng cấu trúc dữ liệu trên RAM của Redis, kết hợp cơ chế kiểm tra trùng lặp (Idempotency Fingerprint SHA-256) để tiếp nhận yêu cầu tức thì với độ trễ thấp (**p50 = 17.35 ms, Throughput đạt ~1,010 req/s**).
- **Tầng xử lý bất đồng bộ (Worker Consumer):** Tiến trình Worker chạy ngầm độc lập bốc đơn theo quy tắc ưu tiên và FIFO, xử lý nghiệp vụ kiểm kho, thanh toán với năng lực xử lý ổn định (~30 đơn/giây trên 4 Worker).
- **Độ tin cậy cao (At-Least-Once Delivery):** Đơn hàng chuyển sang `queue:orders:processing` kèm token sở hữu và nhịp tim `heartbeat`. Khi Worker bị sập nguồn đột ngột, tiến trình **Watchdog** sẽ tự động phát hiện, tước quyền token cũ và cấp lại đơn an toàn.
- **Quản trị trực quan:** Khai thác công cụ **P3X Redis UI** để theo dõi cây khóa namespace (`order:*`, `queue:*`, `workers:*`), quan sát biến động hàng đợi và thực thi lệnh cấp thấp.

---

## 2. QUY TRÌNH VẬN HÀNH CỦA MỘT ĐƠN HÀNG

```
[ Khách hàng gửi yêu cầu Đặt hàng (POST /api/orders) ]
                       │
                       ▼
 1. Backend kiểm tra Idempotency qua Header hoặc Băm SHA-256 giỏ hàng
    (Key: checkout:idempotency:{sha} - TTL 24h)
    • Nếu trùng lặp: Trả ngay kết quả đã lưu trong 24 giờ.
    • Nếu hợp lệ: Tiếp tục khởi tạo đơn bằng Lua Script nguyên tử.
                       │
                       ▼
 2. Ghi chi tiết đơn vào Redis Hash (order:{id})
 3. Tăng bộ đếm đơn hàng trong ngày (stats:orders:count:{date})
 4. Thêm ID đơn vào Set đơn của khách hàng (customer:{id}:orders)
 5. Thiết lập khóa hiển thị trực quan (checkout:lock:{id} - TTL 60s)
                       │
        ┌──────────────┴──────────────┐
        ▼                             ▼
 [ ĐƠN HÀNG THƯỜNG ]            [ ĐƠN HÀNG VIP / HỎA TỐC ]
 Xếp vào List FIFO              Xếp vào Sorted Set (Có Score 2..5)
 (queue:orders:pending)         (queue:orders:priority)
        │                             │
        └──────────────┬──────────────┘
                       ▼
 6. WORKER BỐC ĐƠN BẰNG LUA SCRIPT NGUYÊN TỬ (`claimOrder`)
    • Quét và bốc đơn trong Sorted Set (ZREVRANGE + ZREM) trước.
    • Nếu Sorted Set rỗng, bốc đơn đầu tiên từ đuôi List (RPOP).
    • Chuyển đơn sang List Đang Xử Lý (queue:orders:processing)
      và lưu metadata nhịp tim vào queue:orders:processing:meta.
                       │
        ┌──────────────┴──────────────┐
        ▼                             ▼
 [ Xử lý THÀNH CÔNG ]          [ Xử lý THẤT BẠI ]
 • Cập nhật status COMPLETED   • Tăng retry_count (1..3)
 • Tạo mã vận đơn giao hàng    • Nếu <= 3 lần: Đẩy lại pending/priority
 • Xóa metadata xử lý          • Nếu > 3 lần: Chuyển sang Dead Letter Queue
                                 (queue:orders:dead_letter)
```

> **Lưu ý kỹ thuật quan trọng về tương thích Redis:**  
> Hệ thống **không sử dụng lệnh `LMOVE`**, vì `LMOVE` chỉ xuất hiện từ Redis 6.2 và chỉ hỗ trợ giữa 2 List (không lấy được từ Sorted Set sang List). Toàn bộ thao tác bốc đơn và chuyển hàng đợi được bao bọc trong **Redis Lua Script nguyên tử (`claimOrder`)** sử dụng `RPOP`, `ZREM`, `LPUSH` và kiểm tra type guard, đảm bảo hoạt động an toàn và nguyên tử 100% trên cả **Redis 5.0.14.1 (Windows Local)** và **Redis 7.0 (Docker)**.

---

## 3. THIẾT KẾ CÁC CẤU TRÚC DỮ LIỆU REDIS TRONG ĐỀ TÀI

| Khóa Redis (Key) | Kiểu Dữ Liệu | Vai Trò & Lý Do Kỹ Thuật NoSQL |
|---|:---:|---|
| `order:{id}` | **Hash** | Lưu trữ thực thể đơn hàng dạng bảng băm (Field-Value). Cho phép đọc và cập nhật từng trường nghiệp vụ (`status`, `retry_count`, `tracking_code`) với chi phí $O(1)$ mà không cần phân tích toàn bộ chuỗi JSON. |
| `order:{id}:history` | **List** | Nhật ký tiến trình đơn hàng (Audit Trail). Ghi nhận dấu mốc thời gian của từng bước chuyển trạng thái qua `RPUSH`. |
| `queue:orders:pending` | **List** | Hàng đợi đơn thường tuần tự (FIFO). Nạp vào đầu bằng `LPUSH` và bốc ra ở cuối bằng `RPOP` nguyên tử trong Lua Script. |
| `queue:orders:priority` | **Sorted Set** | Hàng đợi ưu tiên đơn VIP. Sắp xếp tự động theo điểm ưu tiên (`Score = 2..5`). Worker luôn bốc đơn có điểm cao nhất trước bằng `ZREVRANGE` + `ZREM`. |
| `queue:orders:processing` | **List** | Hàng đợi tin cậy (Reliable Queue Pattern). Tạm giữ các đơn Worker đang thực hiện; phối hợp cùng metadata để Watchdog phục hồi nếu Worker gặp sự cố. |
| `queue:orders:processing:meta` | **Hash** | Lưu trữ mốc thời gian nhận việc và heartbeat của Worker để Watchdog kiểm tra trạng thái sống còn. |
| `queue:orders:dead_letter` | **List** | Hàng đợi cách ly (Dead Letter Queue - DLQ). Chứa các đơn gặp lỗi quá 3 lần để quản trị viên kiểm tra và kích hoạt phục hồi (`retry-dlq`). |
| `customer:{id}:orders` | **Set** | Tập hợp các đơn của từng khách hàng. Tự động khử trùng lặp và tra cứu quyền sở hữu tức thời bằng `SISMEMBER` $O(1)$. |
| `checkout:idempotency:{sha}` | **String (TTL 24h)** | Bản ghi kiểm tra trùng lặp. Lưu trữ kết quả JSON của đơn hàng kèm fingerprint băm giỏ hàng để bảo đảm tính chất Idempotent Ingestion. |
| `checkout:lock:{id}` | **String (TTL 60s)** | Khóa phân tán trực quan có thời gian sống tự hủy, phục vụ quan sát đồng hồ đếm ngược trên P3X Redis UI. |
| `stats:orders:count:{date}` | **String (Counter)** | Bộ đếm đơn hàng trong ngày sử dụng lệnh nguyên tử `INCR`, không bị sai lệch số liệu khi tải cao. |

---

## 4. VAI TRÒ CỦA CÔNG CỤ P3X REDIS UI

P3X Redis UI là công cụ đồ họa trực quan (Web & Desktop GUI) giúp người quản trị:
1. **Duyệt cây khóa theo Namespace:** Tự động phân cấp thư mục theo dấu hai chấm `:` (`order:`, `queue:`, `customer:`).
2. **Theo dõi biến động hàng đợi:** Quan sát số lượng phần tử List và Sorted Set thay đổi tức thì khi Worker bốc đơn.
3. **Giám sát thời gian sống (TTL):** Xem đồng hồ đếm lùi của các khóa tạm thời (`checkout:lock:*`, `checkout:idempotency:*`).
4. **Console CLI cấp thấp:** Chạy các lệnh kiểm tra cấu hình, kiểm tra mốc sao lưu (`LASTSAVE`, `BGSAVE`, `INFO memory`).
5. **Giám sát tài nguyên (Monitoring Tab):** Vẽ biểu đồ thời gian thực về mức tiêu thụ RAM, số lượng client kết nối và số lệnh thực thi mỗi giây.

---

## 5. HƯỚNG DẪN KHỞI CHẠY HỆ THỐNG TRÊN WINDOWS LOCAL (CHÍNH THỨC)

### Bước 1: Chuẩn bị tệp cấu hình môi trường
Sao chép tệp cấu hình mẫu và đặt mật khẩu quản trị:
```cmd
copy .env.example .env
```
Mở tệp `.env` và thiết lập mật khẩu cho quản trị viên:
```env
PORT=3000
HOST=127.0.0.1
ADMIN_PASSWORD=acceptance-local-only
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
WORKER_DELAY_MS=2000
WORKER_MAX_RETRIES=3
```

### Bước 2: Cài đặt thư viện phụ thuộc
```cmd
npm ci
```

### Bước 3: Khởi chạy 1-Click thông minh
Nhấp đúp chuột vào tệp:
```cmd
start.bat
```
Chọn **[1] KHOI CHAY BANG CHE DO LOCAL STANDALONE**.  
*(Hoặc bạn có thể nhấp đúp trực tiếp vào `scripts\start-local.bat`).*

Hệ thống sẽ tự động mở 3 cửa sổ điều khiển độc lập:
1. **Redis Server Local:** Chạy nhị phân `redis-bin\redis-server.exe` trên cổng `6379`.
2. **Backend API Server:** Chạy `src/server.js` trên cổng `3000`.
3. **Background Worker Service:** Chạy `src/worker/worker.js` lắng nghe hàng đợi.

### Bước 4: Mở P3X Redis UI và Giao diện Web
- **P3X Redis UI Desktop:** Mở ứng dụng từ Start Menu, kết nối vào `127.0.0.1:6379` (Name: `Redis Local NoSQL`).
- **Giao diện Đặt hàng (Khách hàng):** [http://localhost:3000/](http://localhost:3000/)
- **Dashboard Quản trị:** [http://localhost:3000/admin](http://localhost:3000/admin) (Đăng nhập: `admin` / mật khẩu đã đặt ở Bước 1).

### Bước 5: Dừng hệ thống an toàn
Nhấp đúp chuột vào tệp:
```cmd
scripts\stop-all.bat
```

---

## 6. KIỂM ĐỊNH CHẤT LƯỢNG VÀ KẾT QUẢ KIỂM THỬ

Hệ thống được kiểm định tự động bằng bộ test đa tầng, phân tách rõ ràng giữa kiểm tra hồi quy, kiểm tra tải và kiểm tra chấp nhận:

```bash
# 1. Chạy kiểm thử hồi quy hàng đợi (Unit & Logic Regressions) - 11 Subtests PASS
npm test

# 2. Chạy kiểm thử chấp nhận và tải tích hợp (Integration & Concurrency) - 17 Tests PASS
npm run test:integration

# 3. Chạy kiểm thử bền vững và phục hồi dữ liệu (RDB Persistence) - 3 Tests PASS
npm run test:persistence

# 4. Chạy toàn bộ 3 bộ test chính thức (35 PASS, 0 FAIL, 3 BLOCKED)
npm run test:all

# 5. Chạy tổng duyệt toàn bộ 14 bước Demo E2E thực tế
node tests/demo_e2e_verification.js
```

### Bảng số liệu hiệu năng đối chiếu thực tế (Test LOAD-01):
* **Số lượng HTTP requests tiếp nhận:** 200 requests đồng thời từ 20 luồng.
* **Số lượng đơn hợp lệ duy nhất:** 110 đơn (90 requests trùng lặp bị chặn bởi Idempotency).
* **Throughput tiếp nhận HTTP:** **1,010.79 requests/giây**.
* **Độ trễ tiếp nhận (Ingestion Latency):** **p50 = 17.35 ms**, **p95 = 30.84 ms**, **max = 56.40 ms**.
* **Thời gian Worker rút cạn (Drain Time):** 4 Worker xử lý tuần tự 110 đơn trong **3,680.14 ms** (~29.89 đơn/giây, tương ứng thời gian mô phỏng kiểm kho 100ms/đơn).

---

## 7. DANH MỤC TÀI LIỆU CHI TIẾT BÀN GIAO

Toàn bộ tài liệu chính thức nằm trong thư mục `docs/`:

1. [docs/FINAL_ACCEPTANCE.md](docs/FINAL_ACCEPTANCE.md) – **Báo cáo nghiệm thu và bàn giao chính thức cuối cùng của đồ án**.
2. [docs/REQUIREMENTS_COVERAGE.md](docs/REQUIREMENTS_COVERAGE.md) – **Ma trận đối chiếu 5 nhóm yêu cầu đề tài (A đến E) và phân định phạm vi P3X vs Code**.
3. [docs/DEMO_GUIDE.md](docs/DEMO_GUIDE.md) – **Kịch bản trình diễn 11 bước có lời thoại gợi ý chi tiết cho buổi bảo vệ**.
4. [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md) – **Báo cáo chi tiết kết quả 35 PASS / 0 FAIL / 3 BLOCKED kèm log đối chứng**.
5. [docs/REPORT_CORRECTIONS.md](docs/REPORT_CORRECTIONS.md) – **Bản thảo toàn văn Chương 5 và Kết luận chuẩn bị đồng bộ vào tệp Word tiểu luận**.
6. [docs/CODEX_HANDOFF.md](docs/CODEX_HANDOFF.md) – **Biên bản bàn giao kỹ thuật giữa Codex và Antigravity**.
7. [docs/INSTALL_WINDOWS.md](docs/INSTALL_WINDOWS.md) – **Hướng dẫn cài đặt chi tiết trên môi trường Windows**.
8. [docs/P3X_REDIS_UI_GUIDE.md](docs/P3X_REDIS_UI_GUIDE.md) – **Hướng dẫn quản trị và khai thác Redis bằng P3X Redis UI**.
