# KIẾN TRÚC HỆ THỐNG QUẢN LÝ HÀNG ĐỢI XỬ LÝ ĐƠN HÀNG TRỰC TUYẾN
## (ORDER QUEUE MANAGEMENT SYSTEM ARCHITECTURE)

> Cập nhật 26/10/2026: mã thực thi dùng `queueScripts.js` với `createOrderAtomic`, `claimOrder`, `transitionOrder`, `renewOrder`. FIFO dùng RPOP + LPUSH trong Lua cùng metadata; priority dùng ZREVRANGE + ZREM trong cùng Lua. Heartbeat lưu epoch milliseconds, token sở hữu chặn Worker cũ; lỗi/crash phục hồi theo priority và giới hạn retry cấu hình. Idempotency giữ kết quả 24 giờ theo key của client; `checkout:lock:*` chỉ giữ để quan sát TTL. Xem [CODEX_HANDOFF.md](CODEX_HANDOFF.md) cho hợp đồng hiện hành; các sơ đồ cũ bên dưới là tài liệu cần Antigravity đồng bộ.

---

## 1. Tổng Quan Kiến Trúc (High-Level Architecture)

Hệ thống được thiết kế theo mô hình **Khai thác hàng đợi phân tán bất đồng bộ (Asynchronous Distributed Queue Pattern)** nhằm tách rời hoàn toàn luồng tiếp nhận đơn hàng (Order Ingestion) và luồng xử lý đơn hàng chuyên sâu (Order Processing & Fulfillment).

Cơ sở dữ liệu trung tâm là **Redis In-Memory Database**, kết hợp với công cụ quản trị trực quan **P3X Redis UI**.

```mermaid
graph TB
    subgraph Client_Layer ["1. TẦNG KHÁCH HÀNG & QUẢN TRỊ"]
        CustomerUI["Giao diện Khách hàng (index.html)<br/>• Danh mục 10 sản phẩm<br/>• Giỏ hàng & Form đặt hàng<br/>• Tra cứu trạng thái đơn"]
        AdminDashboard["Giao diện Quản trị (admin.html)<br/>• Giám sát độ dài hàng đợi<br/>• Điều khiển Worker (Pause/Resume)<br/>• Xử lý từng đơn (Step-by-step)<br/>• Tạo batch 10/50/100 đơn & Retry DLQ"]
        P3XUI["P3X Redis UI (Cổng 7843)<br/>• Trình duyệt khóa cây (Tree View)<br/>• Console CLI nhúng<br/>• Giám sát tài nguyên máy chủ<br/>• Đối soát & Xuất JSON"]
    end

    subgraph App_Layer ["2. TẦNG ỨNG DỤNG (EXPRESS API & STATIC SERVER)"]
        APIServer["Node.js / Express Web Server (Cổng 3000)<br/>• Endpoint: /api/orders (POST - Đặt hàng)<br/>• Endpoint: /api/orders/:id (GET - Tra cứu)<br/>• Endpoint: /api/admin/* (Điều khiển & Thống kê)"]
        IdempotencyLock["Idempotency Lock Service<br/>(SET checkout:lock:{id} NX EX 60)"]
    end

    subgraph Redis_Layer ["3. TẦNG DỮ LIỆU & HÀNG ĐỢI REDIS (PORT 6379)"]
        OrderHash[("order:{order_id}<br/>Hash lưu thông tin đơn")]
        PendingQueue[("queue:orders:pending<br/>List hàng đợi FIFO")]
        PriorityQueue[("queue:orders:priority<br/>Sorted Set hàng đợi Ưu tiên")]
        ProcessingQueue[("queue:orders:processing<br/>List hàng đợi Đang xử lý")]
        DLQueue[("queue:orders:dead_letter<br/>List Dead Letter Queue")]
        CustSet[("customer:{cust_id}:orders<br/>Set đơn hàng của khách")]
        StatsCount[("stats:orders:count:{date}<br/>Atomic Counter")]
        WorkerControl[("worker:control:status<br/>Trạng thái RUNNING/PAUSED")]
    end

    subgraph Worker_Layer ["4. TẦNG XỬ LÝ NỀN ĐỘC LẬP (BACKGROUND WORKER)"]
        WorkerProcess["Worker Service (worker.js)<br/>• Chạy độc lập với Web Server<br/>• Ưu tiên quét Priority Queue trước<br/>• Quét FIFO Pending Queue bằng LMOVE<br/>• Cơ chế Retry tối đa 3 lần<br/>• Đẩy đơn lỗi vào DLQ"]
        CrashRecovery["Watchdog & Crash Recovery Engine<br/>• Quét đơn bị treo trong processing<br/>• Phục hồi khi Worker khởi động lại"]
    end

    CustomerUI -->|Gửi yêu cầu đặt hàng| APIServer
    AdminDashboard -->|Gửi lệnh điều khiển & lấy thống kê| APIServer
    APIServer --> IdempotencyLock
    IdempotencyLock --> OrderHash
    APIServer --> PendingQueue
    APIServer --> PriorityQueue
    APIServer --> CustSet
    APIServer --> StatsCount

    WorkerProcess -->|Quét & Lấy đơn ưu tiên (Lua Script)| PriorityQueue
    WorkerProcess -->|Quét & Chuyển đơn thường (LMOVE)| PendingQueue
    WorkerProcess -->|Đưa vào đang xử lý| ProcessingQueue
    WorkerProcess -->|Cập nhật trạng thái| OrderHash
    WorkerProcess -->|Đơn lỗi quá 3 lần| DLQueue
    CrashRecovery -.->|Giám sát đơn bị kẹt| ProcessingQueue

    P3XUI -->|Kết nối trực tiếp ioredis| Redis_Layer
```

---

## 2. Luồng Tiếp Nhận Đơn Hàng (Order Ingestion Flow)

```mermaid
sequenceDiagram
    autonumber
    actor User as Khách hàng
    participant UI as Giao diện Web
    participant API as Express API Server
    participant Redis as Redis Server

    User->>UI: Chọn sản phẩm, bấm "Đặt hàng"
    UI->>API: POST /api/orders (Dữ liệu đơn hàng, loại đơn)
    
    API->>Redis: SET checkout:lock:{order_id} "LOCKED" NX EX 60
    alt Đã có lock (Trùng request / Spam)
        Redis-->>API: Trả về nil (Lock thất bại)
        API-->>UI: 429 / 409: Đơn hàng đang được xử lý, không gửi trùng lặp!
    else Khóa thành công
        Redis-->>API: OK
        API->>Redis: HSET order:{id} (Chi tiết đơn hàng, status="PENDING")
        API->>Redis: SADD customer:{cust_id}:orders {id}
        API->>Redis: INCR stats:orders:count:{YYYYMMDD}
        
        alt Là Đơn Ưu Tiên (Priority Order)
            API->>Redis: ZADD queue:orders:priority {score} {id}
        else Là Đơn Thông Thường (Standard Order)
            API->>Redis: LPUSH queue:orders:pending {id}
        end
        
        API-->>UI: 201 Created: Đặt hàng thành công! Mã đơn: {id}
        UI-->>User: Hiển thị thông báo thành công & Mã đơn hàng
    end
```

---

## 3. Luồng Xử Lý Hàng Đợi của Worker (Worker Processing Lifecycle)

Worker là tiến trình nền chạy vòng lặp liên tục độc lập với Web Server:

```mermaid
sequenceDiagram
    autonumber
    participant W as Worker (worker.js)
    participant Redis as Redis Server
    participant P3X as P3X Redis UI (Giám sát)

    loop Vòng lặp điều phối (Polling Loop)
        W->>Redis: GET worker:control:status
        alt Trạng thái là PAUSED
            W->>W: Tạm dừng xử lý, chờ Resume
        else Trạng thái là RUNNING
            Note over W,Redis: BƯỚC 1: KIỂM TRA HÀNG ĐỢI ƯU TIÊN
            W->>Redis: EVAL pop_priority.lua (ZPOPMAX + LPUSH processing)
            alt Có đơn Ưu Tiên
                Redis-->>W: Trả về order_id ưu tiên
                Note over W: Chuyển sang Bước Xử lý Đơn
            else Không có đơn Ưu Tiên
                Note over W,Redis: BƯỚC 2: KIỂM TRA HÀNG ĐỢI FIFO THƯỜNG
                W->>Redis: LMOVE queue:orders:pending queue:orders:processing RIGHT LEFT
                alt Có đơn Thường
                    Redis-->>W: Trả về order_id
                    W->>Redis: HSET order:{id} status "PROCESSING"
                else Không có đơn nào
                    W->>W: Sleep ngắn (500ms) rồi lặp lại
                end
            end

            opt Khi có đơn cần xử lý
                Note over W: Giả lập thời gian xử lý (2-5 giây)<br/>• Kiểm tra tồn kho<br/>• Xác nhận thanh toán<br/>• Tạo mã vận đơn
                alt Xử lý THÀNH CÔNG
                    W->>Redis: HSET order:{id} status "COMPLETED" finished_at {...} tracking_code {...}
                    W->>Redis: LREM queue:orders:processing 1 {id}
                    W->>Redis: RPUSH order:{id}:history "Hoàn tất đơn hàng"
                    Note over P3X: Quản trị viên thấy đơn biến mất khỏi processing
                else Xử lý THẤT BẠI (Lỗi mô phỏng hoặc logic)
                    W->>Redis: HINCRBY order:{id} retry_count 1
                    alt retry_count <= 3
                        W->>Redis: LREM queue:orders:processing 1 {id}
                        W->>Redis: LPUSH queue:orders:pending {id}
                        W->>Redis: HSET order:{id} status "PENDING" error_reason {...}
                    else retry_count > 3 (Vượt ngưỡng thử lại)
                        W->>Redis: LREM queue:orders:processing 1 {id}
                        W->>Redis: LPUSH queue:orders:dead_letter {id}
                        W->>Redis: HSET order:{id} status "DLQ" error_reason {...}
                        Note over P3X: Đơn xuất hiện trong Dead Letter Queue
                    end
                end
            end
        end
    end
```

---

## 4. Cơ Chế Phục Hồi Khi Worker Bị Dừng Đột Ngột (Crash Recovery)

Nếu Worker bị tắt (`Ctrl+C`, mất điện, Docker container restart) khi đang xử lý đơn hàng:

```mermaid
stateDiagram-v2
    [*] --> Đơn_trong_Pending_hoặc_Priority
    Đơn_trong_Pending_hoặc_Priority --> Đơn_trong_Processing: Worker nhận việc (LMOVE / Lua)
    
    state Đơn_trong_Processing {
        [*] --> Đang_thực_thi
        Đang_thực_thi --> Worker_bị_Crash: Worker sập nguồn đột ngột!
        Worker_bị_Crash --> Đơn_vẫn_còn_nguyên_trong_Redis: Dữ liệu được bảo toàn trong List processing!
    }

    Worker_bị_Crash --> Worker_Khởi_Động_Lại: Khởi động lại Worker (Watchdog Boot)
    
    state Worker_Khởi_Động_Lại {
        Quét_Processing_Queue: Quét tất cả đơn tồn trong queue:orders:processing
        Kiểm_tra_Timeout: Đơn có thời gian xử lý dở > 30 giây?
        Quét_Processing_Queue --> Kiểm_tra_Timeout
        Kiểm_tra_Timeout --> Phục_hồi_về_Pending: Tăng retry_count và đưa về pending
        Kiểm_tra_Timeout --> Đưa_vào_DLQ: Nếu đã retry quá 3 lần
    }

    Phục_hồi_về_Pending --> [*]: Đơn được xử lý lại an toàn, không bị mất mát
    Đưa_vào_DLQ --> [*]: Cách ly an toàn
```
