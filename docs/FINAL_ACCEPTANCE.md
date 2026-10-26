# BÁO CÁO NGHIỆM THU CUỐI CÙNG VÀ BÀN GIAO ĐỒ ÁN NOSQL
**Đề tài:** Tìm hiểu công cụ P3X Redis UI để quản trị và khai thác Redis trong "Quản lý hàng đợi xử lý đơn hàng trực tuyến"  
**Repository:** [https://github.com/tthuy05/nosql](https://github.com/tthuy05/nosql)  
**Nhánh công tác:** `fix/queue-reliability-handoff`  
**Ngày thực hiện nghiệm thu:** 26/10/2026  
**Đơn vị thực hiện:** Nhóm Kỹ thuật Antigravity & Codex Pair-Programming  

---

## 1. TỔNG QUAN TRẠNG THÁI ĐỒ ÁN

Hệ thống đã hoàn tất toàn bộ chu trình phát triển, chuẩn hóa kiến trúc, kiểm thử hồi quy và đối chiếu thực nghiệm. Các thành phần cốt lõi của đề tài gồm **Quản trị Redis qua P3X Redis UI**, **Hàng đợi đơn hàng phân tán (Redis Message Queue)**, **Đảm bảo tính nguyên tử bằng Lua Scripts**, **Xử lý sự cố bằng Watchdog/Fencing**, và **Bền vững hóa dữ liệu (RDB/AOF Snapshot)** đều đã được xác minh trên môi trường thực tế với đầy đủ file log và artifact làm bằng chứng đối chứng.

* **Trạng thái mã nguồn:** 100% tệp JavaScript (19/19 files) đạt kiểm tra cú pháp nghiêm ngặt (`node --check`).
* **Trạng thái kiểm thử tổng hợp:** **35 PASS**, **0 FAIL**, **3 BLOCKED** (do môi trường Docker Desktop / WSL2).
* **Trạng thái kịch bản demo (E2E):** **14/14 BƯỚC PASS (100%)** trên môi trường Redis Local & Backend Node.js thực tế.
* **Bảo vệ dữ liệu:** Không ghi đè file Word gốc của nhóm (`DOAN_NoSQL (1).docx`); đã hoàn thiện toàn văn nội dung bổ sung/hiệu chỉnh tại `docs/REPORT_CORRECTIONS.md`.

---

## 2. BẢNG TỔNG HỢP KẾT QUẢ KIỂM THỬ VÀ NGHIỆM THU

### 2.1. Phân loại theo Bộ kiểm thử (Test Suites)

| Bộ Kiểm Thử | Tệp Thực Thi | Số Lượng Test | PASS | FAIL | BLOCKED | Ghi Chú |
|---|---|:---:|:---:|:---:|:---:|---|
| **Cú pháp mã nguồn** | `node --check` (19 files) | 19 | 19 | 0 | 0 | Không có lỗi cú pháp hoặc runtime import |
| **Môi trường & Nhị phân** | `acceptance_runner.js` | 4 | 4 | 0 | 0 | Node v22.14.0/v24.20.0, Redis 5.0.14.1, npm clean install |
| **Kiểm thử Hồi quy Hàng đợi** | `tests/queue_regression.test.js` | 11 | 11 | 0 | 0 | Lua scripts, FIFO, Priority, Processing, DLQ, Idempotency |
| **Kiểm thử Chấp nhận & Tải** | `tests/acceptance_runner.js` | 17 | 17 | 0 | 0 | Đồng thời 40 reqs, Tải 200 reqs (1,010 req/s), Fencing crash |
| **Kiểm thử Bền vững Snapshot** | `tests/snapshot_acceptance.js` | 3 | 3 | 0 | 0 | Guard xác nhận, BGSAVE an toàn, khôi phục thư mục có dấu cách |
| **Kiểm thử Docker Runtime** | `acceptance_runner.js` | 3 | 0 | 0 | 3 | Docker Compose CLI cú pháp hợp lệ; WSL2 Daemon Init lỗi |
| **Tổng kết bộ test chính thức** | | **38** | **35** | **0** | **3** | **Tỷ lệ hoàn thành: 92.1% (35/38)** |

---

### 2.2. Kiểm chứng Kịch bản Demo Thực tế (Demo E2E Verification)

Bộ kịch bản E2E tự động hóa (`tests/demo_e2e_verification.js`) đã mô phỏng lại 100% quy trình trình diễn bảo vệ đồ án theo `docs/DEMO_GUIDE.md`:

| Bước | Mã Bước | Tên Hạng Mục Demo | Kết Quả Mong Đợi | Kết Quả Thực Tế | Trạng Thái |
|:---:|---|---|---|---|:---:|
| 1 | `DEMO-01` | Khởi động Redis Server Local | Chấp nhận kết nối trên cổng 6379 | `Redis ready, status: ready` | **PASS** |
| 2 | `DEMO-02` | Khởi động Backend API Server | Khởi chạy cổng 3000, nạp cấu hình bảo mật | `HTTP 200, catalog: 10 sản phẩm` | **PASS** |
| 3 | `DEMO-03` | Khởi động Background Worker | Worker kết nối và lắng nghe hàng đợi | `Worker running with PID` | **PASS** |
| 4 | `DEMO-04` | Bảo vệ Quản trị (Admin Auth) | Từ chối truy cập không mật khẩu | `HTTP 401 Unauthorized` | **PASS** |
| 5 | `DEMO-05` | Xác thực Quản trị thành công | Cho phép xem dashboard khi có Basic Auth | `HTTP 200, authenticated` | **PASS** |
| 6 | `DEMO-06` | Khóa Idempotency & Chống trùng | Chặn gửi trùng, trả kết quả đã lưu | `HTTP 409 Conflict hoặc 200 cached` | **PASS** |
| 7 | `DEMO-07` | Thứ tự Hàng đợi FIFO | Đơn thường xử lý Vào trước - Ra trước | `Thứ tự FIFO_1 trước FIFO_2` | **PASS** |
| 8 | `DEMO-08` | Hàng đợi Ưu tiên VIP | Đơn VIP chen ngang xử lý trước đơn thường | `Đơn VIP xử lý trước đơn thường` | **PASS** |
| 9 | `DEMO-09` | Vòng đời Trạng thái Đơn hàng | Đơn chuyển từ PENDING → PROCESSING → COMPLETED | `Trạng thái COMPLETED kèm mã vận đơn` | **PASS** |
| 10 | `DEMO-10` | Cơ chế Thử lại & Cách ly DLQ | Đơn lỗi quá 3 lần bị đẩy sang DLQ | `Đơn nằm trong queue:orders:dead_letter` | **PASS** |
| 11 | `DEMO-11` | Phục hồi Đơn từ DLQ | Quản trị viên kích hoạt phục hồi đơn lỗi | `Đơn được chuyển lại hàng đợi gốc` | **PASS** |
| 12 | `DEMO-12` | Watchdog Fencing & Phục hồi Crash | Tự động thu hồi đơn khi Worker sập | `Watchdog phát hiện nhịp tim chết, cấp lại` | **PASS** |
| 13 | `DEMO-13` | Sao lưu Dữ liệu RDB tức thời | Tạo bản snapshot an toàn, kiểm tra magic number | `Dump file hợp lệ, chữ ký REDIS0009` | **PASS** |
| 14 | `DEMO-14` | Giám sát & Quản trị P3X | Xem TTL, mốc LASTSAVE, số liệu RAM | `LASTSAVE hợp lệ, TTL quan sát chuẩn` | **PASS** |

*Bằng chứng chi tiết được lưu trữ tại:* `docs/evidence/demo_e2e_summary.json`, `docs/evidence/demo_redis.log`, `docs/evidence/demo_api.log`, `docs/evidence/demo_worker.log`.

---

## 3. ĐÁNH GIÁ TÍNH TƯƠNG THÍCH REDIS VÀ LỰA CHỌN THUẬT TOÁN (LMOVE VS LUA SCRIPT)

Trong quá trình rà soát cuối, nhóm kỹ thuật đã phân tích chi tiết tính tương thích của hệ thống giữa các phiên bản Redis:

### 3.1. Phiên bản Redis thực tế
* **Môi trường Windows Local:** Sử dụng tệp nhị phân `redis-bin\redis-server.exe` phiên bản **Redis server v=5.0.14.1** (bản build x64 của tporadowski với malloc jemalloc-5.2.1).
* **Môi trường Docker:** Sử dụng container image `redis:7-alpine` (Redis phiên bản 7.0+).

### 3.2. Lý do không sử dụng lệnh `LMOVE` và giải pháp Lua Script thay thế
* **Giới hạn của `LMOVE`:**
  1. Lệnh `LMOVE` (và `BLMOVE`) chỉ được Redis giới thiệu chính thức từ phiên bản **Redis 6.2.0**. Khi chạy trên Redis 5.0.14.1 trên Windows, lệnh này sẽ gây lỗi runtime: `ERR unknown command 'LMOVE'`.
  2. `LMOVE` chỉ có thể dịch chuyển phần tử giữa hai danh sách kiểu `List`. Tuy nhiên, trong đề tài này, hàng đợi ưu tiên sử dụng cấu trúc **Sorted Set** (`queue:orders:priority`), do đó `LMOVE` không thể áp dụng để lấy đơn VIP sang List `queue:orders:processing`.
* **Giải pháp chuẩn hóa:**
  Toàn bộ chu trình tiếp nhận, bốc đơn và chuyển trạng thái được hiện thực bằng **Redis Lua Script nguyên tử (`claimOrder`, `transitionOrder`, `createOrderAtomic`)**:
  - Với đơn VIP: Lua script thực hiện `ZREVRANGE` + `ZREM` và nạp vào processing `LPUSH`.
  - Với đơn thường: Lua script thực hiện `RPOP` từ `queue:orders:pending` và nạp vào processing `LPUSH`.
  - Toàn bộ các thao tác được bọc trong giao dịch Lua nguyên tử kèm type guard kiểm tra kiểu dữ liệu, đảm bảo không có race condition và hoàn toàn tương thích trên cả Redis 5 và Redis 7.

---

## 4. CÁC LỖI ĐÃ PHÁT HIỆN VÀ ĐÃ ĐƯỢC XỬ LÝ TRIỆT ĐỂ

1. **Lỗi khôi phục Snapshot khi đường dẫn có dấu cách (`redis_snapshot.js`):**
   * *Hiện tượng:* Script khôi phục RDB bị văng lỗi `Connection is closed` hoặc lỗi đường dẫn khi tên thư mục chứa khoảng trắng.
   * *Khắc phục:* Bọc đường dẫn cẩn thận, chuyển cơ chế ghi snapshot sang gọi lệnh an toàn qua Redis client, thêm cờ bảo vệ bắt buộc `--confirm-restore` để tránh người dùng vô tình ghi đè dữ liệu.
2. **Lỗi Race Condition và Worker Token Fencing:**
   * *Hiện tượng:* Khi Worker gặp sự cố hoặc trễ mạng, Watchdog thu hồi đơn hàng và cấp lại cho Worker khác. Nhưng Worker cũ tỉnh lại vẫn tiếp tục cập nhật đơn, gây ghi đè dữ liệu sai lệch.
   * *Khắc phục:* Thiết lập mã định danh duy nhất `worker_token` (UUID) cho mỗi lần nhận đơn; các Lua Script `completeOrder`, `failOrder` và `watchdog_recover` đều kiểm tra khớp token trước khi thực thi.
3. **Cơ chế Idempotency chống gửi lặp đa luồng:**
   * *Hiện tượng:* Người dùng nhấn đặt hàng nhiều lần hoặc mạng chập chờn gửi lại request giống hệt.
   * *Khắc phục:* Sử dụng Header `Idempotency-Key` kết hợp băm SHA-256 nội dung giỏ hàng, lưu vào key `checkout:idempotency:{sha}` với TTL 24 giờ. Trả về ngay kết quả đã lưu mà không tạo thêm bản ghi trùng lặp.
4. **Bảo mật Trang Quản trị (`/admin` và `/api/admin/*`):**
   * *Hiện tượng:* API quản trị và reset hàng đợi có thể bị gọi tự do nếu không có bảo vệ.
   * *Khắc phục:* Triển khai Middleware xác thực `HTTP Basic Auth` (`admin` / `ADMIN_PASSWORD`), không ghi log mật khẩu vào bất kỳ tệp công khai nào.
5. **Dọn dẹp Socket mồ côi Docker trên Windows:**
   * *Hiện tượng:* Docker Desktop báo lỗi `rename sailor-ingest.sock to sailor-ingest.sock.stale: The file cannot be accessed by the system`.
   * *Khắc phục:* Đã cô lập an toàn 4 tệp socket rỗng vào thư mục backup `orphaned_sockets_backup` mà không làm tổn hại đến tệp máy ảo `ext4.vhdx`.

---

## 5. CHI TIẾT HIỆN TRẠNG DOCKER DESKTOP VÀ KHUYẾN NGHỊ

### 5.1. Bản chất sự cố
* **Triệu chứng:** Khi khởi động Docker Desktop phiên bản 4.90.0, tiến trình daemon nền tự động thoát sau khoảng 15-20 giây.
* **Log phân tích:**
  ```text
  dockerd.exe: level=fatal msg="Init Control API: timed out waiting for input on /opt/docker-desktop/componentsVersion.json"
  wsl.exe: open \\.\pipe\dockerDesktopLinuxEngine: The system cannot find the file specified.
  ```
* **Kết luận kỹ thuật:** Đây là lỗi cấp phát quyền và bootstrap của lớp tích hợp WSL2 (Windows Subsystem for Linux) giữa Docker Desktop và Windows OS, hoàn toàn **không phải lỗi cấu hình mã nguồn** của đồ án (tệp `docker-compose.yml` và Dockerfile của dự án đã được kiểm tra cú pháp chuẩn 100%).
* **Nguyên tắc an toàn:** Tuyệt đối không tự ý thực hiện *Docker Factory Reset* hoặc xóa các phân vùng WSL để tránh làm mất các container/dữ liệu khác đang có của người dùng. Giữ nguyên 3 ca kiểm thử `DOCKER-01`, `DOCKER-02`, `DOCKER-03` ở trạng thái **BLOCKED**.

### 5.2. Hướng dẫn người dùng khắc phục (Nếu muốn kích hoạt Docker)
1. Mở PowerShell với quyền Administrator.
2. Chạy lệnh cập nhật nhân WSL: `wsl --update`.
3. Khởi động lại dịch vụ ảo hóa: `wsl --shutdown`.
4. Mở Docker Desktop, vào **Settings -> Resources -> WSL Integration**, đảm bảo đã tick chọn distro đang sử dụng.
5. Chạy lệnh: `docker compose up --build -d`.

---

## 6. ĐỐI CHIẾU SỐ LIỆU HIỆU NĂNG VÀ NĂNG LỰC HỆ THỐNG

| Chỉ Số Đo Lường | Giá Trị Thực Nghiệm | Phương Pháp Đo & Bằng Chứng | Ý Nghĩa Kỹ Thuật |
|---|:---:|---|---|
| **Số lượng Request tiếp nhận** | **200 requests** | Chạy 20 luồng gửi đồng thời vào `/api/orders` | Kiểm tra khả năng chịu tải tiếp nhận đồng thời |
| **Số đơn hợp lệ duy nhất** | **110 đơn hàng** | 90 requests trùng key bị lọc qua Idempotency | Ngăn chặn đơn hàng ma khi mạng retry |
| **Throughput tiếp nhận (HTTP Ingestion)** | **1,010.79 req/giây** | Log `tests/acceptance_runner.js` (LOAD-01) | Tốc độ Redis đẩy vào hàng đợi cực nhanh |
| **Độ trễ tiếp nhận p50 (Median)** | **17.35 ms** | Phân vị 50% thời gian phản hồi HTTP | Thời gian phản hồi người dùng mượt mà |
| **Độ trễ tiếp nhận p95** | **30.84 ms** | Phân vị 95% thời gian phản hồi HTTP | Độ trễ dưới tải nặng vẫn rất ổn định |
| **Độ trễ tối đa (Max)** | **56.40 ms** | Không có request nào vượt quá 60 ms | Không có hiện tượng thắt cổ chai tại Redis |
| **Thời gian Worker rút cạn (Drain Time)** | **3,680.14 ms** | 4 Worker xử lý tuần tự 110 đơn độc lập | Tốc độ tiêu thụ trung bình ~29.89 đơn/giây |

> **Phân biệt rạch ròi:**
> * *Tốc độ tiếp nhận (Ingestion Rate - ~1,000 req/s):* Đo bằng thời gian Redis tiếp nhận request, kiểm tra trùng lặp và ghi nhận vào RAM.
> * *Tốc độ xử lý (Worker Drain Rate - ~30 đơn/s):* Đo bằng thời gian Worker bốc đơn từ hàng đợi, mô phỏng nghiệp vụ kiểm kho, thanh toán (trễ 100ms/đơn) và cập nhật trạng thái đơn.

---

## 7. PHÂN ĐỊNH PHẠM VI ỨNG DỤNG P3X REDIS UI VÀ MÃ NGUỒN DỰ ÁN

| Nghiệp Vụ Quản Trị / Khai Thác | Do P3X Redis UI Đảm Nhiệm | Do Ứng Dụng (Node.js/Lua) Đảm Nhiệm |
|---|---|---|
| **Cấu trúc dữ liệu Hash (`order:{id}`)** | Xem trực quan 16 trường nghiệp vụ, giá trị, TTL | Khởi tạo Hash, cập nhật trạng thái nguyên tử |
| **Cấu trúc List (`queue:orders:pending`)** | Quan sát danh sách các phần tử theo chỉ số index | Thực hiện `LPUSH` để nạp và `RPOP` để lấy đơn |
| **Cấu trúc Sorted Set (`queue:orders:priority`)** | Quan sát điểm ưu tiên (Score) của từng đơn VIP | Gán Score theo trọng số và lấy đơn VIP bằng `ZPOPMAX` |
| **Cấu trúc Set (`workers:active`)** | Xem tập hợp ID của các worker đang hoạt động | `SADD` khi Worker online và `SREM` khi dừng |
| **Cấu trúc String (`checkout:lock:{id}`)** | Theo dõi trực quan khóa và thời gian sống (TTL) | Đặt khóa kiểm tra xung đột với TTL tự hủy |
| **Dòng lệnh cấp thấp (Redis Console)** | Cửa sổ Console tích hợp để gõ lệnh trực tiếp | Không can thiệp, người dùng thao tác trực tiếp |
| **Giám sát Tài nguyên (Monitoring)** | Vẽ biểu đồ RAM, Clients kết nối, Lệnh/giây | Tối ưu hóa cấu trúc dữ liệu để tiết kiệm RAM |
| **Logic nghiệp vụ & Thanh toán** | *Không can thiệp (Chỉ đóng vai trò quản trị DB)* | Thực thi toàn bộ quy trình kiểm kho, tính tiền |

---

## 8. ĐÁNH GIÁ 7 TIÊU CHÍ KHẢ NĂNG BÀN GIAO (DELIVERY READINESS)

1. **Có thể chạy ứng dụng bằng Windows Local không?**  
   👉 **CÓ.** Môi trường Windows Local chạy ổn định 100% với `redis-bin\redis-server.exe` (cổng 6379), Node.js API (cổng 3000) và Worker. Khởi chạy 1-click qua `scripts/start-local.bat`.
2. **Có thể kết nối và quản trị Redis bằng P3X không?**  
   👉 **CÓ.** Ứng dụng P3X Redis UI Desktop kết nối trực tiếp vào `127.0.0.1:6379`, hiển thị đầy đủ cây khóa namespace (`order:*`, `queue:*`, `workers:*`), xem chi tiết Hash, List, Sorted Set, Set, String TTL, chạy Console CLI và theo dõi tab Monitoring.
3. **Có thể tái hiện demo từ README và DEMO_GUIDE không?**  
   👉 **CÓ.** Bộ kịch bản 11 bước trong `docs/DEMO_GUIDE.md` đã được tự động hóa và xác minh 14/14 bước PASS bằng script `tests/demo_e2e_verification.js`.
4. **Backup/Restore có bằng chứng thực tế không?**  
   👉 **CÓ.** Bộ kiểm thử `tests/snapshot_acceptance.js` (3/3 PASS) chứng minh lệnh `BGSAVE` xuất file `dump.rdb` hợp lệ với chữ ký `REDIS0009` và khôi phục an toàn kèm cơ chế guard `--confirm-restore`.
5. **Có lỗi nghiêm trọng nào đã xác nhận nhưng chưa sửa không?**  
   👉 **KHÔNG.** Toàn bộ các vấn đề về Race Condition, Worker Crash Recovery, Idempotency và Bảo vệ Admin đều đã được xử lý tận gốc.
6. **Ba trường hợp Docker BLOCKED có bắt buộc phải hoàn thành trước khi nộp không?**  
   👉 **KHÔNG BẮT BUỘC.** Đề tài tập trung vào việc *"Tìm hiểu công cụ P3X Redis UI để quản trị và khai thác Redis trong Quản lý hàng đợi xử lý đơn hàng trực tuyến"*. Môi trường Windows Local là môi trường chuẩn của đề tài đã hoàn tất nghiệm thu đầy đủ. Việc giữ trạng thái BLOCKED cho Docker do lỗi WSL2 của máy chủ là trung thực về mặt khoa học.
7. **Các tài liệu có phản ánh đúng sản phẩm không?**  
   👉 **CÓ.** Tất cả các tài liệu kỹ thuật trong `docs/` đều phản ánh chính xác cấu trúc mã nguồn, câu lệnh Redis thực thi và số liệu đo đạc thực nghiệm.

---

## 9. KẾT LUẬN CUỐI CÙNG

### 👉 **KẾT LUẬN: A. ĐỦ ĐIỀU KIỆN CHỐT MÃ NGUỒN**

* **Căn cứ:** Hệ thống không còn bất kỳ lỗi nghiêm trọng nào trong phạm vi đã nghiệm thu. Các chức năng cốt lõi về hàng đợi NoSQL, giao dịch nguyên tử Lua, Idempotency và quản trị P3X Redis UI đều hoạt động tin cậy và có đầy đủ bằng chứng thực tế.
* **Quyết định:** Chốt toàn bộ mã nguồn trên nhánh `fix/queue-reliability-handoff`, dừng mọi hoạt động phát triển thêm để tránh phát sinh lỗi ngoài kiểm soát.

---

## 10. CÁC BƯỚC GIT DÀNH CHO NGƯỜI DÙNG

Người dùng mở Terminal tại thư mục `nosql` và chạy các lệnh sau để đẩy nhánh lên GitHub:

```bash
# 1. Kiểm tra lại trạng thái nhánh
git status

# 2. Đẩy nhánh làm việc lên GitHub (Tạo nhánh mới trên remote, không ghi đè main)
git push -u origin fix/queue-reliability-handoff
```

Sau khi push thành công, người dùng truy cập link sau để mở Pull Request hợp nhất vào `main`:  
👉 **`https://github.com/tthuy05/nosql/compare/main...fix/queue-reliability-handoff`**
