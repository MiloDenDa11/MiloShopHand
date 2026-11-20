# Triển khai bảo mật và rollback

Đây là hướng dẫn cho operator trên hạ tầng thật. Đợt audit chỉ kiểm tra local/QA; chưa đổi domain, DNS, certificate, credentials, tài khoản DB hoặc firewall của hệ thống cửa hàng.

## 1. Điều kiện trước triển khai

1. Đọc báo cáo audit, chốt người phê duyệt, maintenance window và rollback. Không public cấu hình Compose development hiện tại: nó dùng NODE_ENV development, Mailpit/mock và migration kèm seed.
2. Backup mới database và các thư mục upload/private return photos. Mã hóa backup, sao lưu ở nơi khác tài khoản/host, giữ khóa mã hóa email/outbox trong secret backup riêng. Restore thử vào database mới, so sánh số lượng/checksum và kiểm tra ảnh. Không khởi chạy worker/outbox từ bản restore để tránh gửi email/vận đơn lặp.
3. Dùng phiên bản image đã vá và pin digest đã kiểm tra. Nginx trong Compose đã nâng 1.30.7-alpine và pin digest; vẫn phải quét toàn bộ OS packages trước release. Docker Scout trên máy audit chưa chạy được vì cần đăng nhập Docker; không coi npm audit 0 là OS image scan 0.
4. Xác minh tài khoản Admin do shop sở hữu, email được xác minh và mật khẩu riêng đủ mạnh (tối thiểu 15 ký tự). Thay mật khẩu demo đã sử dụng, thu hồi phiên không còn cần thiết. Không chép mật khẩu vào issue, command-line, source hoặc ảnh chụp.

## 2. Database runtime ít quyền

`infra/postgres-runtime-role.sql` là script cần review và xác nhận trước khi áp dụng vào database đang có dữ liệu. Đợt audit đã thử script trên bản restore trong transaction rồi rollback, không để lại role thử nghiệm.

Script tạo role mới có quyền kết nối, USAGE schema/sequences và DML nghiệp vụ; không cho superuser, CREATEROLE, CREATEDB, BYPASSRLS, quyền owner/DDL, đọc migration metadata hay xóa/sửa AuditLog.

Thực hiện bằng connection DBA/migration riêng, không đặt credentials DBA vào môi trường API/worker. Ví dụ trong phiên psql đã kết nối an toàn:

```sql
\set app_role milo_runtime
\set db_name milo
\i infra/postgres-runtime-role.sql
\password milo_runtime
```

`\password` hỏi mật khẩu tương tác; không ghi mật khẩu vào file SQL. Trước khi tạo phải kiểm tra role chưa tồn tại; script sẽ dừng nếu đã có, không ghi đè role cũ.

- Kiểm tra role không được thừa hưởng quyền CREATE từ PUBLIC/role khác. Production sẽ dừng nếu phát hiện role quản trị, owner hoặc quyền CREATE trên database/public schema. DBA cần review việc thu hồi PUBLIC privileges vì nó có thể ảnh hưởng ứng dụng khác; không tự áp dụng trên cluster dùng chung.
- Chuyển DATABASE_URL riêng cho API/worker sang runtime role sau khi được phê duyệt. Giữ migration connection ở job deploy riêng; không dùng cùng env_file chứa cả hai loại secrets cho runtime.
- Dùng connection_limit phù hợp (ví dụ 5 mỗi process) và tổng pool không vượt giới hạn role/database. Kiểm tra SSL DB qua CA tin cậy khi đi qua mạng; không tắt xác minh certificate.
- Mỗi migration sau này dùng migration owner; kiểm tra/re-apply giới hạn AuditLog và `_prisma_migrations` sau migration. Không seed lại database cửa hàng để "sửa quyền".
- Smoke test đọc sản phẩm, đăng nhập, tạo đơn QA, giữ/xuất tồn, refund/return và audit trước khi chuyển traffic. Không tạo đơn/giao dịch thật để thử trong hệ thống đang bán.

Lệnh test/seed/migrate không nên nhận runtime credentials production. Runners hiện là công cụ local development tạo database `_test`, cần một cấu hình QA/migration riêng được kiểm soát. Không đưa thông tin DBA của production vào máy test.

## 3. Cấu hình ứng dụng và secrets

API và worker kiểm tra cấu hình production khi boot:

- NODE_ENV=production, APP_URL là HTTPS origin chuẩn, không chứa userinfo/path/query.
- SESSION_SECRET ngẫu nhiên ít nhất 64 ký tự; MFA_ENCRYPTION_KEY đúng 32 byte hex, giữ nguyên khóa đang dùng khi nâng cấp để không làm hỏng outbox đã mã hóa. Không tự rotate khóa mã hóa khi còn payload chưa chuyển khóa.
- DATABASE_URL runtime ít quyền; REDIS_URL bắt buộc, bảo vệ Redis bằng ACL/TLS và mạng riêng. API fail closed khi Redis không khả dụng.
- PAYMENT_PROVIDER=payos, SHIPPING_PROVIDER=ghn và keys phía server đầy đủ. GHN_BASE_URL chỉ nhận HTTPS hostname GHN chính thức. Hạn chế egress theo nhà cung cấp và DNS/resolver của hạ tầng.
- EMAIL_PROVIDER=smtp, host thật. SMTP production yêu cầu TLS/STARTTLS với xác minh certificate, cấu hình SPF/DKIM/DMARC và kiểm thử riêng bằng tài khoản được cấp.
- STORAGE_PROVIDER theo dịch vụ thật; private return photos không đưa vào public bucket/thư mục. Bucket ảnh công khai không cho liệt kê/ghi từ bên ngoài, và dùng role scoped theo bucket/prefix.
- ENABLE_API_DOCS mặc định false ở production. Nếu bật, chỉ session ADMIN được đọc docs/schema. Không dùng Swagger như cơ chế cấp quyền cho API.

Secret manager/injected environment phải tách khỏi source/image; `.env.*`, private keys và dump đã được thêm vào ignore. Google Maps browser key được công khai theo thiết kế, phải giới hạn domain/API/quota trong Google Cloud; không gán backend/provider secret vào NEXT_PUBLIC.

Admin tiếp tục email/mật khẩu, không OTP theo chính sách hiện tại. Cân nhắc VPN/access proxy/allowlist cho vùng quản trị; chỉ thay phương thức MFA khi có quyết định chính sách riêng.

## 4. Ingress HTTPS và proxy tin cậy

`infra/nginx.production.conf` là template đã kiểm tra syntax và handshake bằng certificate QA tự ký, chưa được cài đặt lên domain thật.

1. Thay mọi `shop.example.invalid` bằng hostname shop đã xác minh; đưa certificate thật vào `/etc/nginx/tls/fullchain.pem` và private key vào `/etc/nginx/tls/privkey.pem`, mount read-only với quyền file phù hợp. Certificate QA trong `.local` tuyệt đối không dùng production.
2. Chỉ ingress public cổng 80/443; API/web, PostgreSQL và Redis nằm trong private network. Host deployment bind API loopback; container API dùng API_HOST=0.0.0.0 nhưng không publish cổng API ra Internet.
3. Đặt TRUST_PROXY bằng đúng IP/CIDR ingress thực sự kết nối API. Không dùng `1`, `true`, wildcard hoặc subnet toàn Internet. Nginx ghi đè X-Forwarded-For bằng địa chỉ peer, không nối header tùy ý từ client. Nếu có CDN, cấu hình xác minh IP CDN ở lớp ingress trước; không tin toàn bộ X-Forwarded-For do client gửi.
4. Kiểm tra nginx -t rồi reload có kiểm soát. TLS 1.2/1.3 bật, TLS 1.0/1.1 tắt; kiểm tra redirect sang hostname cố định, HSTS, frame denial, nosniff, Referrer-Policy và Permissions-Policy. Chỉ thêm includeSubDomains/preload sau khi toàn bộ subdomain sẵn sàng HTTPS.
5. Giữ CSP động từ Next Proxy, không ghi đè bằng CSP tĩnh chứa unsafe-inline cho script. Không cache HTML nonce dùng chung trên CDN; static CSS/font/WebP vẫn có thể cache theo hash. Khi thêm SDK script phải kiểm tra nonce/CSP trước phát hành.
6. Thêm resource limits, autoscaling/capacity và CDN/WAF theo lưu lượng thật. Giới hạn app/ingress đã có không thay thế chống DDoS của nhà cung cấp.

Khuyến nghị quản trị host: SSH key, không root/password login, allowlist/VPN, tắt FTP nếu không dùng, cập nhật OS và kiểm tra inbound firewall. Các cấu hình host này chưa được thay đổi trong audit local.

## 5. Xác minh trước chuyển traffic

```powershell
npm ci
npm run security:scan
npm audit
npm test
npm run typecheck
npm run test:integration
npm run test:e2e:production
npm run build
```

Các lệnh test chạy trên cấu hình QA riêng, không dùng production DATABASE_URL. Rà pipeline npm lifecycle và integrity lockfile; chỉ nâng major khi có kế hoạch tương thích. Scan secret phải không in giá trị khớp ra log. Giữ kết quả quét, image digests và commit/source snapshot của release để truy nguyên.

Trước public: kiểm tra cookie Secure/HttpOnly/SameSite trên HTTPS thật, USER/khách không gọi được Admin, owner không đọc được tài nguyên người khác, request giả Origin/CSRF bị chặn, concurrency kho/giá không sai và session bị thu hồi khi logout/reset/grant.

Thiết lập thu thập JSON logs/AuditLog, cảnh báo SECURITY_LOGIN_THROTTLED, SECURITY_RATE_LIMITED, SECURITY_ACCESS_DENIED, SECURITY_MULTI_SOURCE_LOGIN, worker FAILED và payment EXCEPTION. Chỉ giữ ID/hashes/requestId, không chuyển cookie/token/password tới hệ thống log. Xác nhận retention và người có quyền đọc; chưa tự xóa chứng từ/audit của shop.

## 6. Rollback có kiểm soát

- Snapshot trước audit nằm ở `.local/security-audit-20261119/source-before`; manifest `source-before.json` chứa hash nguyên byte. Danh sách chỉ các file thay đổi trong đợt audit ở `docs/security/changes.json`. Không dùng git reset/checkout toàn dự án vì working tree đã có công việc chưa commit từ trước.
- Sau khi dừng release mới, khôi phục đúng các file từ snapshot và package-lock/package.json, chạy npm ci/build/tests rồi mở lại phiên bản được chọn. Giữ file mới chưa tham chiếu nếu cần đối chiếu; không xóa dữ liệu để rollback mã.
- Đợt audit không có migration/schema mới trên database cửa hàng, nên rollback code không cần restore DB. Bản backup phục vụ diễn tập/khẩn cấp; không restore đè vào DB đang bán để rollback giao diện.
- Nếu operator sau đó chuyển runtime DB role, rollback connection theo kế hoạch đã phê duyệt. Không xóa role cũ, tài khoản khách hàng hay đổi owner hàng loạt để xử lý sự cố.
- Thu hồi phiên do grant/password reset là thay đổi an ninh có chủ đích: người dùng đăng nhập lại; không khôi phục token phiên cũ từ backup.
