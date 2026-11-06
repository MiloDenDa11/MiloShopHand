# Hiệu năng MiloShopHand — 06/11/2026

Đã đối chiếu mã nguồn Flight Tickets Platform (React/Vite/React Router) với MiloShopHand. Điểm phản hồi nhanh áp dụng được là cập nhật URL/bộ lọc ở trình duyệt rồi lấy dữ liệu cần thiết. Không chạy hoặc thay đổi database của Tickets; dịch vụ Tickets không đang hoạt động trong phiên này nên chưa có phép đo giao dịch tương đương giữa hai hệ thống.

Nguyên nhân lớn nhất được xác minh là đường kết nối PostgreSQL local: Docker chỉ publish trên IPv4 loopback, trong khi URL cũ dùng localhost. Ba lần tạo PrismaClient mới và SELECT 1 trên database kiểm thử cho median **2066 ms với localhost, 18 ms với 127.0.0.1**. Đã sửa .env sau khi sao lưu riêng tư và sửa .env.example; npm run infra:configure-local giúp cập nhật máy cũ mà giữ mật khẩu, port, tên DB, query và Redis DB. Không thay host Compose/remote hoặc TLS cần xác minh hostname.

Không sửa schema, index, giá, tồn kho, tài khoản hay đơn hàng chính. Không tăng timeout. Docker PostgreSQL/Redis và thư mục Desktop tiếp tục được dùng; không chép dữ liệu cũ từ ổ D.

Thay đổi giao diện và tài nguyên:

- Bộ lọc/phân trang dùng History API tích hợp với Next, một request dữ liệu mới; không dựng lại cả trang RSC theo mỗi query. Có trạng thái đang tải, hủy request cũ, giữ Back/Forward và URL tải trực tiếp. Giá/tồn kho không thêm cache kết quả; checkout vẫn xác minh trên server.
- Trang chủ, danh sách, chi tiết tiếp tục nhận dữ liệu mới từ server; hook không fetch lại khi hydration. Ảnh bìa dùng một thiết kế đã duyệt để ổn định bố cục.
- Tạo 1.264 WebP phân phối từ 333 nguồn giữ nguyên. Gallery tải một góc với srcset đúng kích thước; 360 dùng atlas riêng cho thẻ (tối đa 960 px) và chi tiết (tối đa 1.536 px). Chỉ tải bộ xoay sau hover/vuốt/mở viewer. Giữ đủ 24 góc, Oy thẳng đứng, zoom, reduced motion, thông báo lỗi và gallery dự phòng.
- Cache ảnh theo hash nội dung; version chưa có derivative dùng pipeline cũ. Mỗi ảnh WebP đã decode, kiểm tra kích thước và so pixel với đúng nguồn/góc. Mask đổi màu nhận ảnh đã cắt sẵn, tránh decode cả atlas.
- Font Latin/Việt local giữ glyph dựng sẵn, dấu tổ hợp, variable weights và italic. Tổng 528.760 → 305.280 byte, giảm 42%. Giữ nguồn và OFL; đổi tên họ font dẫn xuất MiloSans/MiloEditorial để tôn trọng Reserved Font Name.
- npm run dev dùng Turbopack. Asset đã chuẩn bị được lưu trong dự án; npm run assets:photos cập nhật khi thêm thiết kế và npm run build tự chuẩn bị derivative.

Đo Next production build/next start trên Windows/i5-12450HX (12 logical CPU), Chromium headless, desktop 1440×1000/mobile 390×844, reduced motion, loopback không throttle CPU/mạng. API/worker là phiên local TSX/development với mock adapter trong cả hai mốc; đây không phải hạ tầng production triển khai. Mã cũ từ Git HEAD e7aad7c được dựng riêng trong .local/performance/baseline-head, public gốc dùng chung chỉ để đọc; không chép đè thư mục làm việc. Bản cũ trên cổng 3102 và bản mới trên 3100 cùng API 4100, QA DB 90 sản phẩm, Redis DB 2, đều được làm nóng route trước khi đo tuần tự sát nhau. Backend trong phép đối chiếu frontend này đã dùng 127.0.0.1 cho cả hai phiên bản; lợi ích kết nối lạnh được đo riêng ở trên. Không so các mốc cách nhau nhiều giờ để kết luận hồi quy do mã. Các JSON cũ vẫn được giữ để đối chiếu.

Mỗi trang/thiết bị một cold browser và hai warm browser. Bảng là median 6 mẫu. “Sẵn sàng” đợi nội dung sản phẩm thực tế và font, không tính skeleton là đã xong; không phải chỉ số INP thực địa. Cùng cửa sổ quan sát 700 ms. Giá trị imagesSettledMs có gồm cửa sổ này.

| Trang | Sẵn sàng trước (ms) | Sẵn sàng sau (ms) | LCP trước (ms) | LCP sau (ms) |
| --- | ---: | ---: | ---: | ---: |
| Trang chủ | 322 | 244 | 246 | 156 |
| Danh sách | 411 | 368 | 344 | 212 |
| Tìm kiếm | 171 | 203 | 122 | 134 |
| Chi tiết | 319 | 273 | 234 | 148 |
| Giỏ hàng | 96 | 107 | 70 | 76 |

Đổi sắp xếp, median 5 thao tác: URL/control **156 → 29 ms**, kết quả mới **195 → 141 ms**. Đây là thao tác trang, không phải INP. Điều hướng home → catalog đo riêng một lần: **497 → 438 ms**; số mẫu này ít, không dùng để khẳng định mọi lượt điều hướng đều nhanh hơn.

Tổng encodedBodySize tài nguyên sau network idle, trình duyệt mới cho mỗi route (KiB; không gồm HTML navigation):

| Route | Trước (KiB) | Sau (KiB) | Giảm |
| --- | ---: | ---: | ---: |
| / | 863 | 595 | 31% |
| /san-pham | 931 | 683 | 27% |
| /gio-hang | 747 | 534 | 29% |

Đo engine dev riêng trên cùng source và API tại thời điểm đo, hai vòng đảo thứ tự, thư mục build mới cho từng engine: HTTP trang chủ đầu tiên median **29.1 s Webpack → 12.5 s Turbopack**. Phép đo gồm khởi tạo compiler, không phải tốc độ production hoặc số đo sau mọi chỉnh sửa import. Cache được dọn từng lượt. Lần thử trước bị ENOSPC đã bị loại, cache kiểm thử đã dọn; không loại outlier trong các JSON production được công bố. Thời gian trên máy local còn dao động do tải hệ thống/I/O; bảng giữ cả những chỉ số không cải thiện, không khẳng định tốc độ ngang Tickets ở mọi điều kiện.

Kiểm tra cuối: build monorepo và production web, typecheck, 27 unit, 25 API integration, 39 browser E2E. Các test DB/Redis dùng milo_integration_test/Redis 1 và milo_redesign_test/Redis 2. Luồng size, màu, giỏ, COD/QR, quản trị, font thật qua CDP, Back/Forward, request chậm/đến sai thứ tự, lỗi ảnh và xoay 24 góc đều được kiểm tra. Gallery HTTP: 90 sản phẩm, 163 URL local, không lỗi; derivative: 1.264 file/333 nguồn đều hợp lệ. Đối chiếu snapshot thương mại chính: 90 sản phẩm, 1.520 SKU, 1.520 bản ghi tồn và 4 đơn giữ nguyên; 8 tài khoản cũ còn đầy đủ. Có thêm 1 tài khoản so với mốc snapshot trước, đã giữ lại tài khoản này; không khôi phục đè từ snapshot cũ.

Ảnh bìa và phông chữ đã kiểm tra ở 360/768/1440 px. Không có GLB/canvas được tải cho lần xem thông thường; đổi màu bằng Three.js hoặc canvas fallback vẫn hoạt động. Phạm vi bộ xoay hiện có: 61 bộ màu, 49 sản phẩm; tối ưu tốc độ không có nghĩa đã tạo nốt các thiết kế còn thiếu.

JSON đo thô nằm ở [performance/2026-11-06](performance/2026-11-06). Tái lập: khởi động node scripts/redesign-preview.mjs --production, đợi QA READY, đặt BENCHMARK_URL=http://localhost:3100 rồi chạy node scripts/benchmark-web.mjs <label> và node scripts/benchmark-interactions.mjs <label>. Phép đo kết nối chỉ dùng SELECT 1; không đọc hoặc ghi nội dung đơn hàng.
