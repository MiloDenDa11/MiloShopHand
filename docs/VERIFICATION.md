# Báo cáo bàn giao — 05/11/2026 (Asia/Ho_Chi_Minh)

> Cập nhật UI ngày 06/11/2026: [Milo Design — nút bo tròn, nền hoa lá, đổi màu và chuyển động Three.js](MILO-DESIGN-UI.md), kèm kết quả kiểm thử mới. Các mốc bàn giao bên dưới được giữ làm lịch sử.

> Cập nhật mới nhất: [ảnh gốc và bộ ảnh 24 góc xoay quanh Oy](PHOTO-SPIN.md). Viewer GLB đã được thay trên giao diện; báo cáo GLB bên dưới là lịch sử. Phạm vi ảnh mới và số còn thiếu được ghi riêng, không coi toàn bộ danh mục đã có ảnh 360°.

Thư mục làm việc hiện tại: `C:\Users\LOQ\OneDrive\Desktop\MiloShopHand`. Đã đồng bộ mã nguồn mới từ ổ D và chuyển dữ liệu sang Docker ngày 05/11/2026. Xem [báo cáo đồng bộ và backup](DOCKER-SYNC.md).

## Cập nhật ảnh, font, hiệu năng và 360°

Mốc mới nhất: logo hoa mặt sau trên 90 sản phẩm, đủ đen/trắng/đỏ mận cho từng sản phẩm; 1.520 SKU, 760 gallery WebP và 90 GLB dùng chung theo thiết kế. Bấm ảnh mở dialog xoay/zoom/đổi màu; 64/64 kiểm thử lần cuối qua. Xem [báo cáo logo/màu/360° và giới hạn đã ghi nhận](BRAND-COLOR-360.md). Các số dưới đây là mốc trước cập nhật logo hoa.

Đã thêm 60 thiết kế AI (15 mỗi nhóm), tổng 90 sản phẩm và 480 SKU. Đủ 120 GLB, ảnh trước/sau; giữ 240 SKU/tồn và bốn đơn cũ. Seed chạy lặp giữ nguyên checksum bản ghi. Font local, SSR và API paging đã sửa; viewer chỉ tải khi mở, có fallback/retry và giải phóng tài nguyên khi đóng.

Build/TypeScript đạt; unit/media 7/7, sync 6/6, integration 22/22, Playwright 24/24. API/web/worker bản biên dịch đã khởi động. Xem [báo cáo nâng cấp](COLLECTION-UPGRADE.md), [số đo production](PERFORMANCE-WEB.md) và [số đo API](PERFORMANCE-API.md). Các kết quả Docker và bàn giao ban đầu bên dưới được giữ làm lịch sử.

## Xác minh sau chuyển Docker

- PostgreSQL `18.6-alpine` và Redis `7.4.11-alpine`: chạy thực tế, cả hai healthy, chỉ mở cổng loopback 5432/6379.
- Database chính `milo`: 30 sản phẩm, 240 SKU, 8 tài khoản, 4 đơn khi chuyển; database Desktop cũ được giữ riêng trong `milo_desktop_archive_20261105` với 23 tài khoản và 39 đơn.
- Toàn bộ 42 bảng của mỗi database khớp số dòng và SHA-256 nội dung từng hàng sau restore; timezone được chuẩn hóa khi đối chiếu timestamp.
- Tạo lại cả hai container bằng `up --force-recreate --wait`: hai database giữ nguyên 42/42 bảng; khóa Redis thử vẫn còn nhờ AOF/volume, sau đó đã xóa khóa thử.
- Backup Docker → restore database mới → so sánh 42 bảng: **PASS**. Restore vào database `milo` đang có dữ liệu: bị từ chối đúng thiết kế.
- Typecheck và build shared/API/worker/Next: **PASS**.
- Unit nghiệp vụ: **5/5**; đồng bộ tệp/secrets/backup/chặn xung đột: **6/6**.
- Integration API: **16/16**, trên `milo_integration_test`, Redis DB 1.
- Playwright Chromium: **9/9** (1,7 phút), trên `milo_redesign_test`, Redis DB 2, API 4100/frontend 3100 và worker kết nối BullMQ/Redis thực.
- `docker compose --env-file .env -f infra/compose.yaml config --quiet`: **PASS**. Phạm vi Docker đã chạy là PostgreSQL/Redis; toàn bộ ứng dụng Compose chưa được build/up trong lần cập nhật này.

Các kết quả dưới đây ghi lại lần bàn giao trước khi đồng bộ. Mã nguồn lúc đó ở `D:\MiloShopHand`, database native tại `.local/postgres`; các bản native gốc vẫn được giữ lại.

## Sáu giai đoạn

| Giai đoạn | Bàn giao |
|---|---|
| 1. Kiến trúc | Modular monolith, ERD, ma trận quyền, bảng trạng thái, money/state functions |
| 2. Database/auth/kho | Prisma schema, 7 SQL migrations có FK/unique/check/index, session/CSRF/Argon2id/token hash/TOTP, stock ledger/reservation |
| 3. Storefront | Trang chủ, catalog, lọc URL, tìm không dấu, chi tiết/màu/size, giỏ local/server, wishlist/recent, gợi ý có lý do |
| 4. Checkout/tích hợp | Giá backend, voucher atomic, idempotency, QR/COD, webhook/reconcile, maps/address manual, ShippingProvider/PaymentProvider, outbox worker |
| 5. Quản trị/hậu mãi | Dashboard/CSV, catalog/variants, metadata/coupon, kho, đơn, COD/refund, QC/nhập hàng hoàn, đổi size giữ kho, ảnh hoàn private, audit và nội dung |
| 6. UI/hiệu năng/QA | Lazy R3F, DPR giới hạn, dừng tab/canvas ẩn, fallback/reduced motion, responsive 360px, skeleton/error/empty, SEO, unit/integration/E2E, tài liệu vận hành |

## Kết quả xác minh ở lần bàn giao ban đầu

- `npm ci` thành công tại thư mục bàn giao.
- 7 migrations áp dụng được trên PostgreSQL UTF8 mới; seed idempotent, 30 sản phẩm/240 SKU trước khi chạy E2E.
- TypeScript: API, worker và web kiểm tra thành công.
- Unit: **5/5** qua (VND nguyên, phân bổ ưu đãi, hoàn một phần, state machine, tiếng Việt/schema).
- Integration: **16/16** qua trên database `milo_integration_test` riêng, với API thật cổng 4001. Có đăng ký/verify/reset/session; TOTP/replay; USER/Admin/IDOR/CSRF; sửa tiền; concurrent last SKU; idempotency; concurrent coupon; signed duplicate webhook; invalid signature/late/underpayment; COD collection/remittance; partial refund; QC/replenish; exchange stock; private image ownership/invalid file; JSON lỗi trả 400/requestId, không stack.
- E2E Playwright: **4/4** qua tại ổ D (Chromium, 1.5 phút). Mobile 360px/reduced motion/WebGL tắt/giỏ qua reload; mua COD; mua QR mô phỏng có webhook ký và Admin xác nhận; filter URL tiếng Việt.
- Sau chỉnh first frame Motion để tránh lệch SSR khi giảm chuyển động: build web lại, chạy `next start`, kiểm tra console không có lỗi hydration/runtime và kiểm thử mobile **1/1** qua trên bản production build.
- Build Next production, API và worker: **thành công**. Build frontend được chạy lại sau các thay đổi cuối; API/worker được biên dịch lại sau bản sửa xử lý lỗi Nest 12.
- `npm audit --omit=dev`: **0** vulnerabilities tại lúc kiểm tra. Đây không phải chứng nhận an toàn tuyệt đối.
- `docker compose -f infra/compose.yaml config --quiet`: qua kiểm tra cấu hình. **Chưa chạy build/up toàn bộ Compose** vì Docker engine trên máy chưa hoạt động.
- PostgreSQL được dừng và khởi động lại tại thư mục bàn giao: **PASS**, giữ nguyên 30 sản phẩm, 240 SKU, 4 đơn E2E và 8 tài khoản E2E sau restart.

Đã phát hiện và sửa lỗi retry PostgreSQL khi hai webhook cùng khóa một đơn; kiểm thử đồng thời xác nhận không nhân đôi tiền. Đã sửa metadata SSR đọc nhầm hằng client, xử lý UTF8 PostgreSQL Windows, giỏ đăng nhập lại không merge lặp, private upload ownership, và tách phân loại hoàn tiền khỏi số thu COD.

Ảnh QA: [desktop](previews/desktop.png), [chi tiết sản phẩm 360px](previews/mobile-product.png). Không tràn ngang ở 360px. OpenAPI có 65 path, schema checkout/địa chỉ/giỏ/auth và lỗi chung; PostgreSQL có 42 bảng tính cả migration metadata.

## Chưa có bằng chứng giao dịch thật

payOS, GHN, Google Maps, SMTP production và S3 chưa có API key/tài khoản để chạy thật. Adapter và cấu hình có mã nguồn, không được coi là đã nghiệm thu production. Mock QR ghi rõ không chuyển tiền; mock shipping không tạo vận đơn GHN. Production từ chối mock. Luồng refund là chuyển khoản thủ công có phê duyệt, bằng chứng và audit; chưa có refund API payOS tự động. Không có theo dõi shipper GPS thật hoặc viewer 360° sản phẩm vì chưa có nguồn/asset phù hợp.

Lần bàn giao ban đầu dùng durable PostgreSQL outbox fallback development. Sau chuyển Docker, worker đã chạy với Redis/BullMQ thực và các bài mua COD/QR đã qua. Email phát triển vẫn lưu file; SMTP production, bounce/delivery và gửi trùng sau crash cần kiểm thử thực tế.

## Giới hạn vận hành cần shop hoàn thiện

- Số đo đang là bảng mẫu dùng chung, hình sản phẩm là SVG minh họa. Cần số đo và ảnh thực tế theo từng thiết kế trước khi bán.
- Đổi size cùng sản phẩm đã có giữ tồn, chấp thuận chi phí, chứng từ khoản bổ sung và vận đơn thay thế. Khoản phát sinh thủ công cần quy trình đối soát ngân hàng của shop; trường hợp đã thu tiền/đã tạo vận đơn rồi cần hủy được chặn để nhân viên xử lý provider/refund có chứng từ, không tự hủy giả.
- Báo cáo theo cohort ngày tạo đơn, có giá vốn snapshot/đổi trả, tách hoàn hàng hóa/phí/thuế; không thay thế sổ kế toán hoặc hóa đơn điện tử. Chứng từ thiếu/thừa tiền cần phân loại thủ công.
- Seed chính sách/liên hệ là bản phát triển; shop cần công bố thông tin pháp nhân, địa chỉ kinh doanh, hotline, phạm vi phục vụ, chính sách lưu/xử lý dữ liệu áp dụng thật.
- Cần thiết lập HTTPS, SMTP thật, alert ra kênh vận hành, lịch backup/purge/orphan uploads và diễn tập restore; tài liệu có hướng dẫn, các thao tác production đó chưa được thực hiện.
- E2E để lại tài khoản có email `e2e-...@example.test` và các đơn liên quan trong database phát triển. Các fixture Admin không có mật khẩu đăng nhập dùng được. Integration dùng database riêng và không xóa dữ liệu cửa hàng.
