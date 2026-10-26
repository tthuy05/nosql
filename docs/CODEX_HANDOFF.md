# Bàn giao Codex → Antigravity (26/10/2026)

## 1. Điểm bắt đầu

- Repository thực tế nằm trong thư mục con `nosql/` của workspace.
- HEAD ban đầu: `00b6eb2529a589bf7670cf1f78984a26dbe43c81`; working tree ban đầu sạch; không tìm thấy AGENTS.md áp dụng.
- Nhánh bàn giao: `fix/queue-reliability-handoff`. Xem `git log -1` để lấy commit bàn giao. Không push/merge.
- Chỉ dùng tài liệu kiến trúc/schema và mã liên quan; không viết lại tiểu luận, không dùng chỉ dẫn trong DOCX làm yêu cầu thực thi.

## 2. Lỗi đã xác nhận trên mã ban đầu

1. Priority ghi ISO vào metadata nhưng Watchdog dùng tonumber → không phục hồi được.
2. FIFO chuyển queue rồi mới ghi metadata → crash để lại processing không timestamp, Watchdog bỏ qua.
3. Watchdog luôn đưa về FIFO, cố định retry=3; không có heartbeat và token chống Worker cũ ghi đè.
4. Complete/fail/DLQ retry dùng pipeline nhiều bước; không nguyên tử, không kiểm tra lỗi từng lệnh; có thể mất hoặc nhân đôi đơn khi crash/concurrency.
5. Single-step và cờ giả lập lỗi GET/DEL riêng → nhiều Worker cùng tiêu thụ.
6. Tạo đơn dùng ID sinh lại mỗi request nên khóa theo ID không chống gửi trùng; hết khóa 60s có thể ghi đè Hash cũ.
7. Tạo Hash/index/counter/queue qua pipeline có thể ghi một phần; validation chấp nhận total âm, items rỗng, priority sai kiểu.
8. API quản trị/reset không xác thực; Redis/P3X/API Docker công bố mọi interface; Redis local bind 0.0.0.0/protected-mode no; Docker context chứa .env/dữ liệu.
9. Backup Docker lấy file host, chờ BGSAVE bằng delay cố định. Restore không xử lý volume Docker, cưỡng bức kill mọi redis-server.exe và có thể nạp AOF cũ thay RDB vừa phục hồi.
10. Tài liệu dùng step_mode thay step_trigger; mô tả sai TTL/idempotency và FIFO trong nhóm priority đồng điểm. Dữ liệu khách/lịch sử được nội suy HTML trực tiếp.

## 3. File thay đổi và lý do

| File | Thay đổi |
|---|---|
| `src/config/queueScripts.js` (mới) | Lua create/claim/transition/renew; kiểm tra kiểu key trước ghi, token sở hữu, phục hồi đúng queue. |
| `src/config/redis.js`, `src/config/constants.js` | Đăng ký command; timeout, không đệm/gửi lại lệnh mất kết nối; thêm key idempotency. |
| `src/worker/worker.js` | Luồng nhận/complete/retry nguyên tử, heartbeat, Watchdog, shutdown; import không tự chạy Worker. |
| `src/services/orderService.js` | Validation, UUID, idempotency fingerprint/response, tạo đơn nguyên tử, ngày thống kê UTC+7. |
| `src/services/queueService.js` | Retry DLQ nguyên tử, validation delay; vô hiệu hóa reset nguy hiểm; đồng bộ lời giải thích FIFO. |
| `src/config/adminAuth.js` (mới), `src/routes/api.js`, `src/server.js` | HTTP Basic admin, chặn Origin khác cho ghi, status 400/409/503 khi tạo đơn, bind localhost, reset trả 403. |
| `src/public/js/app.js`, `src/public/js/admin.js` | Checkout giữ idempotency key qua lỗi mạng; chống submit đồng thời; escape dữ liệu và render lịch sử bằng textContent. |
| `docker-compose.yml`, `redis/redis.conf`, `.env.example` | Localhost ports, Redis local protected mode; Redis Docker lưu /data; yêu cầu ADMIN_PASSWORD. |
| `.dockerignore`, `.gitignore`, `Dockerfile.backend`, `Dockerfile.worker` | Loại secrets/persistence khỏi image, bỏ qua AOF directory; npm ci theo lockfile. |
| `scripts/redis_snapshot.js` (mới), `scripts/backup_redis.bat`, `scripts/restore_redis.bat` | Export RDB chờ hoàn tất, dùng Docker cp/volume đúng; restore offline, lưu persistence cũ, dựng lại AOF. |
| `tests/queue_regression.test.js` (mới), `package.json` | npm test dùng Redis process/cổng/thư mục tạm riêng; không FLUSHDB. |
| `tests/test_runner.js`, `tests/seed_data.js` | Khóa bộ E2E phá dữ liệu/lệnh cũ; seed chờ Redis ready sau thay đổi connection policy. |
| `README.md`, `docs/ARCHITECTURE.md`, `docs/REDIS_DATA_DESIGN.md`, file này | Cấu hình chạy, hợp đồng queue/schema và bàn giao. |

## 4. Luồng sau sửa

1. API validate trước khi ghi. Header `Idempotency-Key` (hoặc body idempotency_key/custom order_id) xác định yêu cầu; Lua lưu kết quả 24h. Cùng key/nội dung → cùng response; khác nội dung hoặc order_id đã tồn tại → 409. Không key/custom ID thì mỗi request là đơn mới. Redis không sẵn sàng/kết quả không chắc chắn → 503; client phải retry cùng key.
2. Lua ghi Hash, lịch sử, customer/global index, counter và queue trong một lần thực thi. Kiểm tra kiểu key và counter trước mutation để tránh lỗi Lua ghi dở do WRONGTYPE/INCR.
3. Lua claim kiểm tra pause/step; ưu tiên score lớn trước, rồi FIFO RPOP. Đồng thời ghi processing, heartbeat ms, PROCESSING và UUID token. Không còn khoảng trống giữa move và metadata.
4. Worker renew heartbeat tối đa mỗi timeout/3; complete/fail chỉ ghi khi token còn sở hữu. Redis lỗi không bị coi là lỗi nghiệp vụ; ngừng heartbeat rồi để Watchdog phục hồi.
5. Watchdog quét processing kể cả lúc PAUSED; kiểm tra lại trong Lua, tăng retry và đưa về đúng priority/FIFO hoặc DLQ. Metadata ISO/mất metadata được cấp một timeout grace rồi phục hồi. Hash mất được cách ly DLQ với data_missing=1, không cho retry tự động dữ liệu thiếu.
6. MAX_RETRIES=3 nghĩa là lượt đầu + tối đa 3 lượt retry; thất bại thứ 4 vào DLQ. Retry DLQ của admin reset retry_count=0 và chuyển queue đúng priority, chỉ một request thành công. Token cũ bị xóa nên không thể complete lượt đã được giao lại.

## 5. Redis keys/trạng thái

- `order:{id}` Hash; `order:{id}:history` List; trạng thái dùng: PENDING, PROCESSING, COMPLETED, DLQ. FAILED còn là hằng tương thích/thống kê, Worker không phát sinh.
- `queue:orders:pending` List LPUSH/RPOP; `queue:orders:priority` ZSet score=priority (2..5), đồng điểm theo từ điển Redis, không cam kết FIFO.
- `queue:orders:processing`, `queue:orders:dead_letter`: List IDs.
- `queue:orders:processing:meta`: Hash order_id → **heartbeat epoch milliseconds**. Hash đơn có processing_started_at=epoch ms và processing_token=UUID; xóa khi kết thúc lượt.
- created_at/updated_at/finished_at: ISO; counter `stats:orders:count:{YYYYMMDD}`: ngày UTC+7.
- `customer:{id}:orders`, `orders:all:index`: Set.
- `checkout:idempotency:{sha256(key)}`: String JSON fingerprint/response, TTL 86400s. `checkout:lock:{id}`: LOCKED/TTL60s chỉ để quan sát.
- `worker:control:status` RUNNING/PAUSED; `worker:control:step_trigger` one-shot; `worker:control:delay_ms` 100..10000; `demo:simulate_failure_once` one-shot/TTL300s.

## 6. Lệnh kiểm tra đã chạy

```powershell
npm test
npm ls --depth=0
rg --files src scripts tests -g '*.js' | ForEach-Object { node --check $_ }
$env:ADMIN_PASSWORD='compose-validation-only'; docker compose config --quiet
git diff --check
docker info --format '{{.ServerVersion}}'
.\redis-bin\redis-server.exe --version
```

## 7. Kết quả thực tế

- Node 24.20.0; Redis Windows 5.0.14.1. npm test: **11 PASS, 0 FAIL** (1 test cha + 10 subtest), trên process Redis tạm có kiểm tra PID, cổng ngẫu nhiên, persistence tắt. Có thể có ECONNREFUSED ngắn lúc process test đang khởi động, sau đó tự kết nối và test qua.
- Đã xác nhận idempotency 12 request đồng thời, conflict/ID trùng sau bỏ khóa, validation/WRONGTYPE/counter không hợp lệ không ghi dở, FIFO/priority/duplicate entries, competing claims, recovery/fencing, heartbeat, retry DLQ đồng thời, legacy ISO/mất metadata/Hash, single-step, admin auth/Origin, offline 503.
- Toàn bộ JS syntax qua; npm ls qua (cors 2.8.6, dotenv 16.6.1, express 4.22.3, ioredis 5.11.1); Compose config qua với password tạm; diff check qua. Không có build script riêng.
- Docker info thất bại do Docker Desktop daemon chưa chạy. Không chạy Docker build, full E2E, browser/P3X, stress/benchmark; không chạy reset, seed, backup hoặc restore trên dữ liệu hiện hữu.

## 8. Chưa kiểm chứng

- Container build/runtime Redis 7, P3X và restore Docker/local; các script chỉ qua syntax/review, không coi là đã chạy thành công.
- Kill Worker thật giữa từng thời điểm, cắt mạng/Redis restart giữa claim/ack/create, Redis OOM/disk full, graceful shutdown khi Redis chết.
- Browser checkout retry/sessionStorage, popup Basic Auth, dashboard và XSS rendering; chưa kiểm thử giao diện thủ công theo yêu cầu.

## 9. Antigravity bắt buộc kiểm thử

1. Dùng môi trường Redis/volume riêng, chạy nhiều Worker; kill sau claim/trước complete, kiểm tra đúng một queue, không mất ID, token cũ không ghi được.
2. Thử Worker delay lớn hơn timeout, heartbeat ngắt/hồi lại; nhiều Watchdog; PAUSED/single-step khi queue rỗng và khi có đơn.
3. Retry/crash FIFO và priority tới ngưỡng với max=0,1,3; retry DLQ đồng thời; đơn thiếu Hash phải cách ly và cần sửa dữ liệu trước khi retry.
4. API qua HTTP: 400/409/503, cùng key sau mất response/refresh, khác payload, custom ID sau TTL; đối chiếu Hash/history/index/customer/counter/queue. Thử Redis mất kết nối giữa create và response.
5. Docker localhost-only ports, ADMIN_PASSWORD thiếu/sai/đúng, chặn Origin khác, reset403; P3X host redis:6379; không expose Docker network.
6. Snapshot/restore trên dữ liệu test có RDB + AOF khác nhau: phải nạp snapshot mới, AOF rebuild xong, restart vẫn đúng; lỗi restore giữ archive và không báo thành công. Kiểm thử Windows path có khoảng trắng và Docker Redis7 appendonlydir.
7. Chuyển bộ TC01..TC22 cũ sang môi trường test riêng và các command mới trước khi chạy; cập nhật tài liệu, hình minh họa, báo cáo và nghiệm thu do Antigravity đảm nhận.

## 10. Giới hạn/vấn đề còn lại

- Hệ thống mô phỏng xử lý; token chỉ bảo vệ ghi Redis, không cam kết exactly-once với thanh toán/vận chuyển thật. Redis AOF everysec vẫn có cửa sổ mất ghi khi máy chủ mất điện.
- Idempotency TTL24h; sau TTL, request không custom ID có thể tạo đơn mới. Thống nhất cùng WORKER_MAX_RETRIES/timeout giữa các Worker.
- Redis Docker không password trong bridge riêng; P3X có quyền Redis trực tiếp. Basic Auth chỉ phù hợp localhost hiện tại; chưa thêm ACL/TLS/đa người dùng vì ngoài phạm vi.
- API tra cứu đơn/khách vẫn là chức năng demo công khai, chưa có cơ chế tài khoản khách hàng. Không triển khai thêm hệ thống phân quyền ngoài đề tài.
- Không tự đối soát/quét sửa toàn bộ dữ liệu cũ đã hỏng; Hash đã mất không thể khôi phục payload bằng code. Metadata lỗi được grace/recover; trường hợp key WRONGTYPE cần quản trị sửa đúng kiểu trước.
- Watchdog hiện LRANGE rồi kiểm tra membership trong Lua theo từng đơn; phù hợp demo, chưa tối ưu hàng đợi lớn theo yêu cầu không benchmark.
- Reset demo bị khóa có chủ đích; bộ E2E cũ bị khóa để tránh FLUSHDB. Các sơ đồ kiến trúc/thuyết trình cũ còn cần Antigravity đồng bộ theo hợp đồng ở trên.
