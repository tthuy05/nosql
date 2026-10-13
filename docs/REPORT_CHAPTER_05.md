# CHƯƠNG 5: XÂY DỰNG ỨNG DỤNG MINH HỌA
## (NỘI DUNG BÁO CÁO MÔN HỌC DỮ LIỆU NOSQL)

---

## 5.1. Mục Tiêu Của Ứng Dụng Minh Họa

Trong khuôn khổ đề tài môn học *“Tìm hiểu công cụ P3X Redis UI để quản trị và khai thác Redis trong Quản lý hàng đợi xử lý đơn hàng trực tuyến”*, nhóm tiến hành xây dựng ứng dụng thực nghiệm nhằm hiện thực hóa các kiến thức lý thuyết đã trình bày từ Chương 1 đến Chương 4.

Mục tiêu cụ thể của ứng dụng bao gồm:
1. **Minh chứng giải pháp giảm tải cho hệ thống:** Tách rời hoàn toàn luồng tiếp nhận đơn hàng (ghi vào bộ nhớ đệm Redis tốc độ cao) khỏi luồng xử lý đơn hàng thực tế (ghi sổ kho, gọi cổng thanh toán, tạo vận đơn đóng gói).
2. **Khai thác toàn diện các cấu trúc dữ liệu NoSQL Redis:** Không giới hạn ở kiểu String cơ bản, ứng dụng khai thác thực tế 5 kiểu dữ liệu cốt lõi gồm: `Hash` (thực thể đơn hàng), `List` (hàng đợi FIFO và DLQ), `Sorted Set` (hàng đợi ưu tiên VIP), `Set` (danh mục đơn của khách hàng), `String kết hợp TTL` (khóa phân tán Idempotency) và `Atomic Counter` (thống kê biến động theo ngày).
3. **Hiện thực hóa quy trình quản trị qua P3X Redis UI:** Mọi thao tác phát sinh từ giao diện người dùng và tiến trình Worker đều phản ánh trực tiếp và tức thì lên không gian bộ nhớ Redis, từ đó người quản trị có thể giám sát cấu trúc cây, đối soát trường dữ liệu và thực thi dòng lệnh nhúng trên P3X Redis UI.
4. **Đảm bảo tính tin cậy cao:** Giải quyết triệt để nguy cơ mất đơn hàng khi Worker gặp sự cố mất điện bằng lệnh nguyên tử `LMOVE`, cơ chế tự động thử lại (Retry) và cách ly đơn hàng lỗi vào Dead Letter Queue.

---

## 5.2. Công Nghệ Sử Dụng

Kiến trúc ứng dụng được lựa chọn dựa trên tiêu chí gọn nhẹ, chuẩn mực công nghiệp, dễ cài đặt và tối ưu cho môi trường thực hành:

- **Frontend (Tầng giao diện người dùng):** Xây dựng bằng HTML5, CSS3, JavaScript thuần và framework Bootstrap 5. Giao diện được thiết kế theo phong cách hiện đại, nền sáng, hiển thị trực quan và đáp ứng đầy đủ trên cả máy tính lẫn thiết bị di động (Responsive Web Design).
- **Backend API Server:** Nền tảng Node.js kết hợp Express Framework. Đóng vai trò là cổng API tiếp nhận đơn hàng, cung cấp các endpoint điều phối, kiểm tra khóa chống trùng lặp và phục vụ dữ liệu thống kê cho Dashboard.
- **Tầng lưu trữ & Hàng đợi (Redis):** Máy chủ Redis (Standalone Server kết hợp tệp cấu hình `redis.conf`). Cấu hình kích hoạt đồng thời hai cơ chế lưu trữ bền vững: chụp ảnh snapshot RDB định kỳ và ghi nhật ký thao tác AOF mỗi giây (`appendfsync everysec`).
- **Thư viện giao tiếp Redis (ioredis):** Thư viện chuẩn công nghiệp cho Node.js, hỗ trợ Pipeline thực thi đa lệnh, định nghĩa các tập lệnh nguyên tử **Redis Lua Scripts** và tự động kết nối lại khi có sự cố.
- **Tiến trình xử lý nền (Background Queue Worker):** Tiến trình Node.js chạy hoàn toàn độc lập với Web Server (`worker.js`). Đóng vai trò là Consumer liên tục rút việc từ các hàng đợi Redis để xử lý bất đồng bộ.
- **Công cụ quản trị đồ họa (P3X Redis UI):** Ứng dụng Desktop / Docker Web Service kết nối trực tiếp vào máy chủ Redis để duyệt cây namespace và kiểm tra biến động của các hàng đợi.

---

## 5.3. Kiến Trúc Hệ Thống

Hệ thống được tổ chức theo mô hình phân tách tầng trách nhiệm (Decoupled Architecture):

```
[ Khách Hàng (Web UI) ]        [ Quản Trị Viên (Dashboard) ]        [ P3X Redis UI ]
           │                                 │                             │
           ▼                                 ▼                             │
┌─────────────────────────────────────────────────────────────┐            │
│               Backend Web Server (Express.js)               │            │
│   • Kiểm tra Lock tạm thời (checkout:lock:{id} - TTL 60s)   │            │
│   • Tạo Hash thông tin đơn (order:{id})                     │            │
│   • Phân phối vào hàng đợi thích hợp                        │            │
└──────────────────────────────┬──────────────────────────────┘            │
                               │                                           │
                               ▼                                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                    KHÔNG GIAN DỮ LIỆU REDIS (PORT 6379)                      │
│  • order:{id} [Hash]                     • queue:orders:pending [List FIFO]  │
│  • queue:orders:priority [Sorted Set]    • queue:orders:processing [List]    │
│  • queue:orders:dead_letter [List DLQ]   • customer:{id}:orders [Set]        │
│  • stats:orders:count:{date} [Counter]   • worker:control:status [String]    │
└──────────────────────────────▲───────────────────────────────────────────────┘
                               │ (Lấy việc nguyên tử qua LMOVE / Lua Script)
                               │
┌──────────────────────────────┴──────────────────────────────┐
│          Tiến Trình Xử Lý Độc Lập (Background Worker)        │
│   • Quét hàng đợi Ưu tiên (ZSet) -> Quét hàng đợi FIFO (List)│
│   • Mô phỏng xử lý (2.5 giây): Kiểm kho, Thanh toán, Vận đơn │
│   • Cơ chế Thử lại (Retry <= 3) -> Chuyển vào DLQ khi quá tải│
│   • Watchdog Crash Recovery: Quét phục hồi đơn bị treo       │
└─────────────────────────────────────────────────────────────┘
```

---

## 5.4. Các Chức Năng Đã Triển Khai

### 5.4.1. Phân hệ Khách hàng (Customer Module)
1. **Hiển thị danh mục sản phẩm:** Hiển thị 10 sản phẩm mẫu đa dạng thuộc các ngành hàng (Thời trang, Gia dụng, Điện tử, Phụ kiện) với đầy đủ hình ảnh vector SVG sắc nét, tên, danh mục và giá thành niêm yết chuẩn Việt Nam Đồng.
2. **Quản lý giỏ hàng:** Cho phép khách hàng thêm sản phẩm vào giỏ, điều chỉnh tăng giảm số lượng, tự động tính tổng tiền thanh toán và xóa sạch giỏ hàng.
3. **Lựa chọn phân cấp hàng đợi (Redis Queue Selection):** Khách hàng có thể lựa chọn loại đơn phục vụ kịch bản kiểm thử:
   - *Đơn hàng tiêu chuẩn (FIFO):* Điểm ưu tiên bằng 1, đẩy vào danh sách chờ thông thường `queue:orders:pending`.
   - *Đơn hàng ưu tiên (VIP):* Điểm ưu tiên bằng 3 hoặc 5, đẩy vào hàng đợi ưu tiên `queue:orders:priority`.
4. **Bảo vệ chống tạo trùng đơn (Idempotency Lock):** Khi khách hàng gửi yêu cầu đặt hàng, hệ thống thiết lập khóa tạm thời với thời gian sống 60 giây. Nếu người dùng bấm liên tục nhiều lần (Double Click), các yêu cầu trùng lặp sẽ bị từ chối ngay lập tức với mã lỗi HTTP 409.
5. **Tra cứu trạng thái đơn hàng thời gian thực:** Người dùng nhập mã đơn hàng để theo dõi trạng thái hiện tại (`PENDING`, `PROCESSING`, `COMPLETED`, `DLQ`), thời gian sống còn lại của khóa thanh toán, mã vận đơn đóng gói và dòng thời gian lịch sử chi tiết (Timeline).

### 5.4.2. Phân hệ Quản trị (Admin Dashboard Module)
1. **Giám sát thời gian thực (Real-time Metrics):** Hiển thị tổng số đơn trong hệ thống, độ dài từng hàng đợi (`pending`, `priority`, `processing`, `dead_letter`), số đơn hoàn tất và bộ đếm đơn phát sinh trong ngày.
2. **Trực quan hóa 4 hàng đợi (Queue Visualizer):** Hiển thị chi tiết từng mã đơn đang xếp hàng trong 4 cột riêng biệt; cập nhật tự động mỗi 2 giây mà không cần tải lại toàn bộ trang web.
3. **Bảng điều khiển Worker phục vụ trình diễn (Demo Controls):**
   - *Nút Tạm dừng (Pause):* Cho phép quản trị viên giữ các đơn hàng tích tụ lại trong Redis List/ZSet để mở P3X Redis UI chỉ cho giảng viên thấy dữ liệu chờ.
   - *Nút Tiếp tục (Resume):* Kích hoạt Worker tiếp tục xử lý tự do.
   - *Nút Xử lý 1 đơn (Single Step):* Cho phép Worker bốc và hoàn tất duy nhất 1 đơn hàng để người chấm thi quan sát từng bước chuyển dịch dữ liệu.
4. **Khởi tạo dữ liệu kiểm thử (Data Generators):**
   - *5 Đơn Chuẩn Báo Cáo:* Nạp đúng các đơn từ `1001` đến `1005` theo đúng mô tả của tài liệu lý thuyết.
   - *Batch 10, 50, 100 Đơn:* Kiểm thử khả năng chịu tải cao và đồng thời của hàng đợi Redis.
5. **Mô phỏng lỗi & Thử lại Dead Letter Queue:**
   - Kích hoạt chế độ giả lập lỗi cổng thanh toán / hết hàng tồn kho.
   - Quan sát đơn hàng được thử lại 3 lần rồi chuyển sang Dead Letter Queue.
   - Nút **"Retry"** trực tiếp trên từng đơn lỗi trong DLQ để khôi phục đơn quay lại hàng đợi chờ xử lý.
6. **Làm mới dữ liệu (Reset Demo):** Dọn dẹp an toàn toàn bộ dữ liệu kiểm thử trên Redis để chuẩn bị cho lượt thuyết trình mới.

---

## 5.5. Luồng Xử Lý Đơn Hàng Chi Tiết

Quy trình xử lý đơn hàng diễn ra qua các bước kỹ thuật chặt chẽ:

1. **Bước 1 - Tiếp nhận & Khóa Idempotency:** API Server nhận yêu cầu, thực thi lệnh `SET checkout:lock:{order_id} "LOCKED" NX EX 60`. Nếu thành công, tiến trình tiếp tục; nếu thất bại, từ chối yêu cầu trùng lặp.
2. **Bước 2 - Lưu trữ thực thể & Bộ đếm:** Sử dụng Redis Pipeline thực hiện đồng thời:
   - `HSET order:{id} ...` lưu các trường dữ liệu chi tiết của đơn.
   - `SADD customer:{id}:orders {order_id}` ghi nhận quyền sở hữu của khách hàng.
   - `INCR stats:orders:count:{date}` tăng bộ đếm số đơn trong ngày.
   - `RPUSH order:{id}:history "Tiếp nhận đơn hàng..."` lưu vết sự kiện ban đầu.
3. **Bước 3 - Điều phối vào Hàng đợi:**
   - Nếu là đơn thường: Gọi `LPUSH queue:orders:pending {order_id}`.
   - Nếu là đơn VIP: Gọi `ZADD queue:orders:priority {score} {order_id}`.
4. **Bước 4 - Worker bốc việc nguyên tử:**
   - Worker luôn kiểm tra hàng đợi ưu tiên trước thông qua Lua script: Lấy đơn điểm số cao nhất (`ZPOPMAX`) và đẩy ngay lập tức vào `queue:orders:processing`.
   - Nếu hàng đợi ưu tiên rỗng, Worker gọi lệnh nguyên tử `LMOVE queue:orders:pending queue:orders:processing RIGHT LEFT` để lấy đơn FIFO lâu nhất.
5. **Bước 5 - Thực thi tính toán & Hoàn thành:**
   - Giả lập trễ 2.5 giây cho các công đoạn kiểm tra và đóng gói.
   - Khi hoàn thành: Cập nhật Hash sang `COMPLETED`, sinh mã vận đơn `VNPOST_...`, xóa đơn khỏi `queue:orders:processing` bằng lệnh `LREM` và dọn dẹp metadata.
6. **Bước 6 - Xử lý ngoại lệ (Exception Handling):**
   - Nếu xảy ra lỗi: Tăng `retry_count`.
   - Nếu `retry_count <= 3`: Đẩy ngược lại hàng đợi ban đầu để thử lại.
   - Nếu `retry_count > 3`: Đẩy vào `queue:orders:dead_letter` và cập nhật trạng thái `DLQ`.

---

## 5.6. Giao Diện Ứng Dụng Minh Họa

*(Nhóm sinh viên chụp ảnh màn hình từ ứng dụng đang chạy thực tế tại cổng 3000 và chèn vào các vị trí dưới đây)*

### 5.6.1. Giao diện Trang Mua Hàng Khách Hàng (index.html)
- **Hình 5.1:** *Giao diện danh mục sản phẩm mẫu, giỏ hàng và form chọn loại đơn hàng (FIFO vs Priority).*  
  *[VỊ TRÍ CHÈN ẢNH: Chụp màn hình trang chủ http://localhost:3000 gồm danh sách sản phẩm và giỏ hàng]*

- **Hình 5.2:** *Hộp thoại thông báo tiếp nhận đơn hàng thành công, hiển thị mã đơn và tên hàng đợi Redis tương ứng.*  
  *[VỊ TRÍ CHÈN ẢNH: Chụp màn hình modal đặt hàng thành công]*

- **Hình 5.3:** *Giao diện tra cứu trạng thái đơn hàng thời gian thực, đồng hồ đếm ngược TTL và dòng thời gian lịch sử.*  
  *[VỊ TRÍ CHÈN ẢNH: Chụp màn hình modal tra cứu đơn hàng hiển thị Timeline]*

### 5.6.2. Giao diện Dashboard Quản Trị Hệ Thống (admin.html)
- **Hình 5.4:** *Tổng quan Dashboard với các thẻ chỉ số đo lường (Metrics) và thanh công cụ điều khiển Worker (Pause, Resume, Single Step).*  
  *[VỊ TRÍ CHÈN ẢNH: Chụp toàn cảnh nửa trên trang http://localhost:3000/admin]*

- **Hình 5.5:** *Khu vực trực quan hóa 4 hàng đợi Redis (FIFO Pending, Priority Queue, Processing Queue và Dead Letter Queue).*  
  *[VỊ TRÍ CHÈN ẢNH: Chụp 4 cột hàng đợi đang chứa các mã đơn]*

- **Hình 5.6:** *Bảng danh sách đơn hàng chi tiết, bộ lọc trạng thái và chức năng thử lại đơn lỗi từ Dead Letter Queue.*  
  *[VỊ TRÍ CHÈN ẢNH: Chụp bảng dữ liệu danh sách đơn hàng]*

---

## 5.7. Minh Họa Dữ Liệu Redis Trên P3X Redis UI

*(Nhóm sinh viên mở ứng dụng P3X Redis UI tại cổng 7843 hoặc ứng dụng Desktop, kết nối tới 127.0.0.1:6379 và chụp ảnh các màn hình thực tế)*

- **Hình 5.7:** *Cây danh mục khóa theo cấu trúc phân cấp namespace trên P3X Redis UI (`order:*`, `queue:*`, `customer:*`, `checkout:*`, `stats:*`).*  
  *[VỊ TRÍ CHÈN ẢNH: Chụp cây khóa Tree View bên thanh điều hướng trái của P3X Redis UI]*

- **Hình 5.8:** *Chi tiết cấu trúc Hash của đơn hàng `order:1002` hiển thị đầy đủ các trường dữ liệu trên P3X Redis UI.*  
  *[VỊ TRÍ CHÈN ẢNH: Chụp màn hình chi tiết Hash của khóa order:1002]*

- **Hình 5.9:** *Hiển thị cấu trúc List của hàng đợi FIFO `queue:orders:pending` và hàng đợi đang xử lý `queue:orders:processing` trên P3X Redis UI.*  
  *[VỊ TRÍ CHÈN ẢNH: Chụp màn hình xem dữ liệu kiểu List]*

- **Hình 5.10:** *Hiển thị cấu trúc Sorted Set của hàng đợi ưu tiên `queue:orders:priority` với cột mã đơn và điểm số ưu tiên Score trên P3X Redis UI.*  
  *[VỊ TRÍ CHÈN ẢNH: Chụp màn hình xem dữ liệu kiểu Sorted Set]*

- **Hình 5.11:** *Quan sát đồng hồ đếm ngược thời gian sống (TTL) của khóa giữ chỗ `checkout:lock:{id}` trên P3X Redis UI.*  
  *[VỊ TRÍ CHÈN ẢNH: Chụp màn hình khóa checkout:lock đang có TTL]*

- **Hình 5.12:** *Thực thi lệnh kiểm tra lưu trữ `BGSAVE`, `LASTSAVE` trên cửa sổ Console CLI nhúng của P3X Redis UI.*  
  *[VỊ TRÍ CHÈN ẢNH: Chụp cửa sổ Console CLI trong P3X]*

---

## 5.8. Kết Quả Kiểm Thử Hệ Thống

Toàn bộ 22 tiêu chí kiểm thử kỹ thuật (từ TC01 đến TC22) được thực thi tự động qua tập lệnh `tests/test_runner.js` với kết quả **đạt 100% (22/22 Test Cases PASS)**:

1. **Khả năng điều phối hàng đợi:** Kiểm thử FIFO nạp 3 đơn ra đúng thứ tự 1 -> 2 -> 3; kiểm thử Priority Queue lấy chính xác đơn điểm số 5 xử lý trước đơn thường; hoàn toàn loại bỏ nguy cơ xử lý trùng lặp giữa các Worker song song.
2. **Khả năng chịu lỗi & Phục hồi:** Khi tiến trình Worker bị dừng đột ngột, đơn hàng vẫn nằm an toàn trong bộ nhớ Redis; tiến trình Watchdog tự động khôi phục đơn bị kẹt quá thời gian quy định về hàng đợi chờ để xử lý tiếp mà không gây thất thoát bất kỳ giao dịch nào.
3. **Khả năng chịu tải cao:** Hệ thống tiếp nhận và xử lý mượt mà 100 đơn hàng phát sinh đồng thời trong cùng một thời điểm mà không bị nghẽn CPU hay cạn kiệt kết nối.
4. **Tính nhất quán dữ liệu:** Số liệu hiển thị trên Dashboard quản trị hoàn toàn trùng khớp với kết quả truy vấn thực tế bằng các câu lệnh `LLEN`, `ZCARD`, `HGETALL` trên máy chủ Redis.

---

## 5.9. Đánh Giá Kết Quả Và Hạn Chế Của Đồ Án

### 5.9.1. Các kết quả đã đạt được:
- Xây dựng thành công một ứng dụng web hoàn chỉnh, có giao diện đẹp, chạy trên dữ liệu Redis thật 100%, không sử dụng dữ liệu giả lập tĩnh.
- Triển khai đầy đủ và chính xác các cấu trúc dữ liệu theo thiết kế đề tài: Hash, List, Sorted Set, Set, String có TTL và Atomic Counter.
- Tích hợp thành công công cụ **P3X Redis UI** phục vụ công tác quản trị, trực quan hóa và khai thác dữ liệu hàng đợi.
- Đảm bảo tính nguyên tử và an toàn dữ liệu thông qua lệnh `LMOVE` và Redis Lua Script.
- Có cơ chế xử lý lỗi hoàn thiện: giới hạn thử lại 3 lần, cách ly Dead Letter Queue và phục hồi sự cố Worker crash.
- Cung cấp đầy đủ kịch bản trình diễn, bộ kiểm thử tự động 22 test cases và script khởi chạy 1-click cho giảng viên và sinh viên.

### 5.9.2. Các hạn chế còn tồn tại và hướng phát triển:
- Ứng dụng hiện tại hoạt động trên mô hình máy chủ Redis Standalone đơn lẻ. Trong các hệ thống thương mại điện tử quy mô siêu lớn (hàng triệu đơn mỗi giờ), cần nâng cấp lên mô hình **Redis Sentinel** (tự động chuyển đổi dự phòng khi máy chủ chính gặp sự cố) hoặc **Redis Cluster** (phân mảnh dữ liệu trên nhiều node phân tán).
- Nghiệp vụ kho vận và cổng thanh toán ngân hàng đang ở mức mô phỏng độ trễ (Mock Delay 2.5 giây); chưa tích hợp Webhook phản hồi từ các cổng thanh toán ngân hàng thực tế.
- Trong tương lai, có thể mở rộng nghiên cứu thêm tính năng **Redis Streams** kết hợp Consumer Groups để so sánh hiệu năng trực tiếp với mô hình Redis List và Sorted Set hiện tại.
