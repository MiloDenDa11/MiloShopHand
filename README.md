# MILOSHOPHAND

**Cập nhật ảnh, font, hiệu năng và 360°:** bộ 60 thiết kế AI, Inter/Lora tiếng Việt local, ảnh trước/sau và viewer GLB tải theo yêu cầu. Xem [báo cáo nâng cấp và cách kiểm tra](docs/COLLECTION-UPGRADE.md).

**Giao diện mới:** vintage magazine, streetwear và everyday basic. Xem [báo cáo UI/UX](docs/ui-redesign/README.md), [ảnh chụp và kiểm thử](docs/ui-redesign/VERIFICATION.md), [ảnh thật cần bổ sung](docs/ui-redesign/ASSET-CHECKLIST.csv). Chưa có file Baket Fashion hoặc ảnh chụp thật; đã chuẩn bị điểm tích hợp, không dùng ảnh minh họa thay ảnh hàng hóa. Nâng cấp frontend này không cần migrate/seed lại dữ liệu đang dùng.

Cửa hàng thời trang tiếng Việt, VND, mobile first. Next.js App Router + NestJS modular monolith + PostgreSQL/Prisma, worker transactional outbox/BullMQ. Chạy local, lưu dữ liệu thật. QR và vận chuyển mặc định **mô phỏng phát triển**, không chuyển tiền hoặc gửi hàng thật.

Phiên bản pin trong manifest và package-lock: Next 16.4.5, React 19.1.10, Nest 12.3.3, Swagger 12.1.0, Prisma/Client 6.19.3, TypeScript 5.9.3, Tailwind 4.3.4, Motion 14.9.1, Three 0.180.0, Fiber 9.8.2, Drei 10.7.9, BullMQ 6.6.0, Playwright 1.64.1, Zod 4.6.7. Nest được nâng lên 12 để dùng bộ dependency có bản vá upload; dùng Node 24 LTS.

## Chạy nhanh trên Windows

Yêu cầu Node.js 24 LTS (đã kiểm tra 24.14.0), npm 11 và Docker Desktop đang chạy Linux engine. Mở terminal tại thư mục làm việc chính:

```powershell
cd C:\Users\LOQ\OneDrive\Desktop\MiloShopHand
npm ci
npm run setup
npm run infra:up
npm run infra:configure-local
npm run db:generate
npm run db:migrate
# Chỉ seed khi dựng database mới. Bản đã chuyển từ ổ D không cần seed lại.
npm run db:seed
npm run dev
```

PostgreSQL 18.6 và Redis 7.4.11 chạy nền trong Docker; API/web/worker chạy trên máy để tiếp tục phát triển. PostgreSQL dùng volume `miloshophand_postgres18_data`; Redis dùng `miloshophand_redis_data`, AOF `everysec`, chính sách `noeviction`. Hai dịch vụ chỉ mở cổng loopback 5432/6379 và tự khởi động lại cùng Docker. Dùng `npm run infra:status`, `npm run infra:logs`, `npm run infra:stop`; lệnh stop giữ dữ liệu. Không dùng `docker compose down -v` nếu cần giữ database/Redis.

Đã đồng bộ bản mới từ `D:\MiloShopHand` và chuyển cả hai database cũ vào Docker. Database chính `milo` lấy từ ổ D; bản Desktop trước đồng bộ được giữ riêng tại `milo_desktop_archive_20261105`. Xem [chi tiết đồng bộ, backup và khôi phục](docs/DOCKER-SYNC.md). PostgreSQL native `.local/postgres` được giữ lại để đối chiếu; `npm run db:local` chỉ là phương án dự phòng, không chạy cùng Docker trên cổng 5432.

- Cửa hàng: <http://localhost:3000>
- Quản trị: <http://localhost:3000/admin>
- Swagger cùng origin: <http://localhost:3000/api/docs>
- OpenAPI: <http://localhost:3000/api/openapi.json>
- API trực tiếp: <http://localhost:4000/api/v1>

`npm run setup` tạo `.env` bỏ qua Git với secret ngẫu nhiên. Không dùng secret phát triển cho production. Thiếu Redis ở development: API giới hạn tần suất trong bộ nhớ; worker dùng outbox PostgreSQL bền vững. Production bắt buộc Redis và cấm mock adapters.

`infra:configure-local` sao lưu `.env` riêng tư rồi đổi địa chỉ PostgreSQL/Redis local từ `localhost` sang `127.0.0.1`, khớp cổng Docker. Lệnh giữ nguyên mật khẩu, port, tên database và Redis DB; không sửa host dịch vụ trong Compose hoặc host từ xa. Trên máy Windows này, phép đo kết nối PostgreSQL mới giảm từ khoảng 2.065 ms xuống 18 ms. `npm run dev` dùng Turbopack; asset mới đăng ký bằng `npm run assets:photos`, còn production build tự chuẩn bị ảnh WebP. Xem [đo tốc độ và kiểm tra](docs/PERFORMANCE-TICKETS-COMPARISON.md).

## Email và tài khoản

Không có tài khoản/mật khẩu Admin mặc định. Đăng ký từ giao diện rồi mở email xác minh. Khi `EMAIL_PROVIDER=file`, email nằm ở `.local/mail/*.json`; liên kết xác minh có thời hạn 24 giờ. File email chỉ dùng local, không phục vụ qua HTTP. Khi dùng SMTP/Mailpit, email được gửi qua SMTP. Token trong bảng AuthToken được hash; nội dung email đang chờ gửi được mã hóa trong outbox, xóa payload sau giao thành công.

Tạo Admin trong terminal (tự chọn email, mật khẩu dài ít nhất 15 ký tự):

```powershell
npm run admin:create
```

CLI xuất URI TOTP và 10 mã khôi phục dùng một lần **chỉ lúc tạo**. Thêm URI vào ứng dụng xác thực, lưu mã khôi phục vào trình quản lý mật khẩu. Admin đăng nhập cần mật khẩu và TOTP/mã khôi phục. Có thể cung cấp mật khẩu qua biến `ADMIN_PASSWORD` trong phiên terminal, xóa biến sau khi tạo; không đặt mật khẩu trong tham số lệnh hoặc commit `.env`.

## Docker Compose

Docker Desktop Linux engine phải đang chạy:

```powershell
npm run setup
docker compose --env-file .env -f infra/compose.yaml up --build
```

Lệnh trên chạy toàn bộ ứng dụng trong Docker. Với quy trình phát triển dùng `npm run infra:up` ở trên, chỉ PostgreSQL/Redis vào Docker. Compose đầy đủ gồm Mailpit, migration/seed, API, worker, Next và Nginx cùng origin cổng 3000. Dừng các tiến trình `npm run dev` trước khi chạy toàn bộ Compose để tránh trùng cổng. Mailpit: <http://localhost:8025>. Volumes giữ DB, Redis và ảnh upload qua restart. Đây là cấu hình **development**.

Seed nền có 30 sản phẩm/240 SKU. Bộ sưu tập bổ sung 60 thiết kế AI, mỗi nhóm áo phông/jacket/bomber/hoodie có 15 thiết kế. Sản phẩm cũ giữ SKU/tồn kho và được bổ sung ảnh render cùng 360 theo màu. Seed chạy lặp an toàn, không ghi đè tồn/giá của SKU có sẵn; không có đánh giá giả. Xem `npm run assets:verify` để xác minh đầy đủ file và dữ liệu.

## Kiểm tra và build

```powershell
npm test
npm run test:integration
npx playwright install chromium
# Tự chạy API/web/worker kiểm thử riêng; cần Docker PostgreSQL/Redis đang chạy.
npm run test:e2e
npm run typecheck
npm run build
npm audit --omit=dev
```

Integration runner tự tạo `milo_integration_test`, migrate/seed, dùng Redis DB 1 và khởi động API cổng 4001. E2E tạo database `milo_redesign_test` trên PostgreSQL Docker, dùng Redis DB 2, frontend 3100 và API 4100; không thay DATABASE_URL trong `.env`. Cửa hàng dùng Redis DB 0. E2E có tiền tố `e2e-` và bắt buộc database có hậu tố `_test` cho các bài tạo đơn. Fixture bổ sung tồn cho SKU kiểm thử khi cần để chạy lặp không hết hàng. Fixture Admin E2E chỉ tạo qua test truy cập database, không có endpoint bootstrap công khai. Kiểm thử thật với payOS/GHN/Google/SMTP được tách, chưa được chứng minh khi chưa có khóa nhà cung cấp.

Production build:

```powershell
npm run build
npm run start -w @milo/api
npm run start -w @milo/worker
npm run start -w @milo/web
```

Chạy ba lệnh start ở ba tiến trình riêng. Cấu hình HTTPS/Redis/provider thật trước khi bật NODE_ENV=production.

## Luồng nghiệp vụ

- Khách tạo giỏ local; đăng nhập hợp nhất với giỏ database. Session HttpOnly, không lưu secret ở localStorage.
- Checkout yêu cầu email verified, tính lại toàn bộ giá/phí/voucher, giữ kho có điều kiện trong transaction Serializable, Idempotency-Key gắn user + hash request.
- QR tạo link bằng outbox; worker retry. Chỉ webhook SDK xác minh/đối soát API mới ghi PAID. Sai tiền/đến muộn/đã hủy → EXCEPTION; return URL không có quyền xác nhận.
- COD giữ kho, giới hạn giá trị và 3 đơn chưa bàn giao mỗi khách. Giao hàng, carrier thu tiền và chuyển tiền về cửa hàng là ba sự kiện độc lập.
- Admin xác nhận → đóng gói → sẵn sàng → tạo vận đơn → bàn giao (xuất kho đúng một lần) → giao → hoàn tất. Mỗi bước có lý do, history, audit.
- User hủy trực tiếp khi chưa được xác nhận. Đơn đã có vận đơn cần hủy provider trước; đã bàn giao dùng hỗ trợ/đổi trả.
- Hoàn tiền có request, approve, complete với chứng từ; tổng không vượt số thực nhận. Adapter không giả định có API hoàn tiền payOS: dùng chuyển khoản thủ công đã đối soát.
- Hàng hoàn chỉ nhập lại khi thực nhận và QC PASS; thao tác trùng không nhập hai lần. Đổi size giữ SKU mới 48 giờ, khách chấp nhận chênh lệch/phí; xuất thay thế cần vận đơn và khoản bổ sung đã đối soát. Phần cần hoàn mở Refund riêng.

## Tài liệu

- [Kiến trúc, ERD, ma trận quyền và state machine](docs/ARCHITECTURE.md)
- [API, tính tiền, đối soát và giới hạn](docs/API.md)
- [Cấu hình dịch vụ, HTTPS, worker, backup/restore](docs/OPERATIONS.md)
- [Báo cáo xác minh và phụ thuộc còn thiếu](docs/VERIFICATION.md)
- [Đồng bộ ổ D → Desktop, Docker và sao lưu dữ liệu](docs/DOCKER-SYNC.md)
- [Nguồn và quyền sử dụng assets](docs/ASSETS.md)

Phiếu đóng gói/CSV là chứng từ nội bộ, chưa phải hóa đơn điện tử chính thức. UI dùng mockup AI và ảnh mô phỏng 3D; bổ sung ảnh hàng hóa, số đo theo thiết kế và chính sách cửa hàng trước khi mở bán.
# MiloShopHand
