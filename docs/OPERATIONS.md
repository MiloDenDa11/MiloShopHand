# Vận hành

Môi trường Desktop hiện dùng PostgreSQL/Redis Docker. Xem [đồng bộ, volumes và lệnh backup/restore](DOCKER-SYNC.md) cho cấu hình đã chuyển ngày 05/11/2026.

## Tài khoản Admin

Tạo mới bằng `npm run admin:create`, hoặc cấp vai trò ADMIN cho tài khoản đã đăng ký bằng `npm run admin:grant -- email@example.com`. Admin đăng nhập bằng email/mật khẩu; nếu tài khoản đã bật 2FA thì phải hoàn thành mã TOTP hoặc mã khôi phục. Tài khoản bị khóa vẫn bị chặn. 2FA là tùy chọn và không tự bật cho tài khoản cũ. Cấp quyền không thay mật khẩu hay tự xác minh email. Các thao tác nhạy cảm giữ xác thực lại bằng mật khẩu trong 10 phút. Giữ biến `MFA_ENCRYPTION_KEY` vì còn dùng mã hóa email chờ gửi; không cần đổi schema hoặc xóa dữ liệu MFA cũ.

## payOS

Đặt PAYMENT_PROVIDER=payos và PAYOS_CLIENT_ID/API_KEY/CHECKSUM_KEY ở backend. Tạo kênh theo tài khoản payOS thật, dùng HTTPS APP_URL và webhook `/api/v1/webhooks/payos`. Đăng ký webhook bằng dashboard/công cụ chính thức của payOS. Mã link dùng providerCode sequence unique, amount backend, expiresAt chung với reservation. `@payos/node` verify chữ ký, không tự viết thuật toán chữ ký production. Không giả định tài khoản có sandbox; mock là adapter nội bộ phát triển. Không chuyển tiền thật trong bộ test.

Webhook sample để kiểm tra URL cần được kiểm tra theo hướng dẫn payOS của tài khoản, không ghi PAID nếu không khớp một payment hợp lệ. Trước production: xác minh tạo link, code không tìm thấy khi retry, callback mẫu, giao dịch đúng/sai/trùng, reconcile mất webhook và link hết hạn. Chưa có bằng chứng test thật trong phiên triển khai này. API hoàn tự động không được giả định: refund là thao tác ngân hàng thủ công, approve rồi complete cùng chứng từ và audit.

## GHN và dữ liệu địa chỉ

Đặt SHIPPING_PROVIDER=ghn, GHN_TOKEN, SHOP_ID, FROM_DISTRICT_ID, FROM_WARD_CODE và BASE_URL phù hợp tài khoản. Sender/pickup lấy từ ShopId đã cấu hình với GHN. Không dùng token trên frontend. Master data được tải từ provider, không hardcode hành chính Việt Nam. Các mã district/ward là mapping của provider, không tuyên bố tên hành chính cũ là dữ liệu quốc gia hiện hành.

Callback GHN công khai chỉ tạo job reconcile; worker tra API bằng token trước khi áp dụng. Chưa giả định provider có chữ ký callback. Lookup theo client_order_code trước retry create; không nhận tracking giả trong production. GHN API staging tách với production theo tài liệu chính thức; cần tài khoản được cấp quyền. Quote địa chỉ ngoài vùng hoặc provider lỗi hiển thị lỗi, không trả giao hàng thành công giả. Phí mock được công khai, không dùng production.

## Google Maps

Đặt NEXT_PUBLIC_GOOGLE_MAPS_KEY và MAPS_ID, bật Maps JavaScript, Places API (New), Geocoding, billing/quota; giới hạn browser key theo domain/API. Rebuild web sau khi đổi key. Khóa browser được công khai theo thiết kế Google, backend/payment keys tuyệt đối không đưa vào NEXT_PUBLIC. Widget gợi ý địa chỉ, drag/click pin, reverse geocode và Browser Geolocation chỉ sau bấm cho phép. Luôn giữ địa chỉ thủ công, hiển thị accuracy, không theo dõi GPS liên tục hoặc giả lập vị trí shipper.

## SMTP và ảnh

EMAIL_PROVIDER=smtp; SMTP_HOST/PORT/SECURE/USER/PASSWORD/MAIL_FROM. Development Compose dùng Mailpit. Production dùng SMTP TLS phù hợp (465 secure, hoặc 587 STARTTLS theo dịch vụ), xác nhận SPF/DKIM/DMARC và kiểm thử gửi/nhận. Không trả liên kết xác minh/token qua API hoặc log. `.local/mail` chỉ dev, không đưa vào public/backups không mã hóa.

STORAGE_PROVIDER=local ghi ảnh catalog WebP dưới UPLOAD_DIR; random UUID, 5MB request, 24MP, bỏ metadata, resize 1800px. Bộ giải mã kiểm tra format thật JPEG/PNG/WebP/AVIF, không tin tên file. S3 cần endpoint/region/bucket/access keys/public URL, bucket chỉ phục vụ ảnh, chặn thực thi và liệt kê bucket. Public image domain cần thêm CSP img-src qua cấu hình web khi triển khai.

Ảnh đổi trả lưu riêng ngoài thư mục public tại RETURN_UPLOAD_DIR, mặc định `.local/return-images` theo root dự án. GET `/api/v1/returns/attachments/:id` kiểm tra owner/Admin, Cache-Control private/no-store; không phục vụ static. Tối đa 5 ảnh/yêu cầu và 20 upload/ngày/khách. Compose có volume `return_uploads` riêng. Backup cả DB, ảnh catalog và ảnh đổi trả; giới hạn quyền đọc thư mục private. File đã upload nhưng bỏ khỏi form có thể còn ở kho; cần job dọn orphan theo chính sách lưu ảnh của shop.

## HTTPS và production

Compose là local development; giữ DB/Redis private network. Triển khai Nginx/Caddy TLS, APP_URL=https://..., NODE_ENV=production, secrets ngẫu nhiên khác dev, PAYOS/GHN thật, Redis bắt buộc và SMTP thật. Cookie Secure tự bật. Forward X-Forwarded-Proto và Host; đặt TRUST_PROXY bằng đúng IP/CIDR ingress, không dùng số hop hoặc wildcard. Bật HSTS ở TLS terminator khi domain đã sẵn sàng HTTPS. `.env` không vào image/git; inject secrets bằng secret manager. Phân quyền DB ứng dụng tối thiểu, migration bằng user riêng; không chạy ứng dụng bằng superuser PostgreSQL như local demo. Admin chỉ bootstrap qua terminal riêng tin cậy.

Xem [hướng dẫn triển khai bảo mật](security/PRODUCTION.md) để chuyển runtime DB role, áp dụng template Nginx HTTPS, kiểm tra CSP nonce và rollback. Thay đổi USER thành ADMIN thu hồi phiên cũ; tài khoản cần đăng nhập lại. Đợt audit chỉ kiểm tra local/QA, chưa triển khai các cấu hình này lên hạ tầng production.

API port 4000, web 3000; same-origin reverse proxy /api và /uploads. Production cần resource limits, monitoring, gửi cảnh báo khi Outbox FAILED hoặc payment EXCEPTION, không chỉ xem màn Admin. Triển khai worker là tiến trình riêng được supervisor restart, dừng graceful và giữ lease/retry. Theo dõi worker heartbeat, thời gian job cũ nhất, pending QR quá hạn, tồn reserved lâu, COD chưa chuyển về, dung lượng DB/ảnh.

## Backup/restore

Ví dụ PostgreSQL tools với DATABASE_URL được cung cấp kín qua môi trường:

```powershell
pg_dump --format=custom --file=milo-backup.dump $env:DATABASE_URL
# Restore vào database MỚI, không ghi đè database đang chạy
createdb milo_restore
pg_restore --dbname=milo_restore --no-owner milo-backup.dump
```

Compose:

```powershell
docker compose -f infra/compose.yaml exec -T postgres pg_dump -U milo -d milo -Fc -f /tmp/milo.dump
docker compose -f infra/compose.yaml cp postgres:/tmp/milo.dump ./milo-backup.dump
```

Sao lưu upload volume đồng thời, mã hóa backup và tách quyền truy cập. Giữ MFA encryption key trong secret backup riêng để giải mã MFA/email chờ gửi. Đề xuất backup hàng ngày, lưu 7 bản ngày/4 bản tuần/12 bản tháng, rà chính sách lưu trữ thực tế với cửa hàng. Diễn tập restore vào DB mới, kiểm số order/payment/reservation, kiểm checksum ảnh, chạy health/đơn thử trước chuyển kết nối. Không replay webhook hoặc outbox DONE tùy tiện sau restore; đối soát provider trước khi mở bán lại.

Session hết hạn được loại khỏi quyền truy cập ngay cả khi chưa purge; nên job bảo trì xóa Session hết hạn và token used/expired sau 30 ngày, outbox DONE sau kỳ vận hành. Không tự xóa lịch sử order/payment/refund/audit khi chưa có chính sách lưu chứng từ. Chủ shop cần công bố pháp nhân, liên hệ, địa chỉ, thời hạn lưu dữ liệu và quy trình xử lý yêu cầu dữ liệu trước khi bán thật.


## Nâng cấp trải nghiệm và vận hành 24/11/2026

Phạm vi triển khai gồm bảng size riêng, mua không tài khoản, nút mua trên mobile, thống kê có đồng ý, theo dõi worker, bàn hỗ trợ và nhập hàng. Các tích hợp Google/Gmail, thanh toán và vận chuyển thật được để lại theo yêu cầu của chủ shop. Không tự bật provider hoặc gọi thử dịch vụ tính phí.

Migration `202611240014_shopping_growth` thêm 12 bảng và cho phép đơn thuộc tài khoản hoặc phiên khách, luôn có đúng một chủ sở hữu. Chỉ triển khai migration sau khi được chủ shop duyệt; kết quả đã được chủ shop duyệt và áp dụng thành công vào database shop được ghi ở `shopping-growth-20261124/migration-application.json`. Không dùng seed để nâng cấp database shop. Bản rehearsal phục hồi vào database mới và đối chiếu checksum của toàn bộ 46 bảng hiện có; không ghi đè shop.

Trong Admin, chọn **Bảng size**, chọn sản phẩm rồi nhập cm từ phép đo thực tế. Mỗi size cần ít nhất một số đo; bảng công bố cần đủ size đang bán. Vòng ngực/eo/mông là số đo vòng. Chiều cao và size người mẫu là tùy chọn, không dùng số liệu AI hoặc số liệu của mẫu khác. Chưa công bố thì khách chỉ thấy hướng dẫn đo và thông báo chưa có số đo riêng.

Khách không tài khoản đặt đơn qua phiên HttpOnly ngẫu nhiên 30 ngày; đường dẫn đơn không đủ để xem đơn ở trình duyệt khác. Nếu mất phiên, cần liên hệ shop; chưa có tra cứu bằng OTP vì dịch vụ email thật chưa bật. Liên kết vào tài khoản cần đúng phiên mua gốc, cùng email đã xác minh và xác thực gần đây. Mã ưu đãi có giới hạn theo tài khoản vẫn yêu cầu đăng nhập. Người bán nhận đơn khách như các đơn khác, giữ quy tắc khóa tự hủy ngay khi duyệt.

**Hành trình mua** đếm sự kiện, không phải người dùng duy nhất; mẫu trình duyệt chỉ ghi sau khi đồng ý và tôn trọng DNT/GPC. Đơn tạo/thanh toán xác nhận được ghi ở transaction phía server và hiển thị nguồn riêng. Không gửi tên, email, ảnh, IP hay URL đầy đủ vào bảng đo trải nghiệm. Báo cáo LCP/INP/CLS là phân bố rating, chưa phải p75 hay Lighthouse. Chưa tự xóa sự kiện hoặc lịch sử kinh doanh khi chưa có chính sách lưu trữ được duyệt.

Bàn hỗ trợ tại `/ho-tro`: khách đăng nhập có thể chọn đơn của mình; khách không tài khoản mở từ trang đơn trong phiên gốc. Nhân viên nhận phụ trách, cập nhật trạng thái hỗ trợ và thêm ghi chú nội bộ. Ghi chú nội bộ bị lọc ở backend. Tin nhắn không tự duyệt đổi trả hoặc hoàn tiền; vẫn dùng nghiệp vụ hiện có. Danh sách khách tối đa 100 yêu cầu, danh sách nhân viên có nút Trước/Sau, 50 yêu cầu/trang.

**Nhập hàng** chỉ dành cho Admin. Tạo nhà cung cấp thật, nhập số chứng từ và các SKU nhận thực tế. Lưu nháp chưa cộng kho; xác nhận cộng toàn bộ phiếu bằng transaction, tạo lịch sử kho và chống cộng lặp. Giá vốn ghi trên phiếu để đối chiếu, chưa tự cập nhật giá vốn sản phẩm, giá bán hoặc kế toán bình quân. Chưa có hủy/đảo phiếu đã xác nhận; cần quy trình điều chỉnh có chứng từ riêng. Người bán xem danh sách SKU chạm ngưỡng, không được xem giá vốn phiếu.

**Vận hành** kiểm tra DB/Redis, heartbeat worker, job lỗi/chậm, giao dịch ngoại lệ và backup gần nhất. Worker tạo thông báo nội bộ cho mỗi đợt cảnh báo; khắc phục rồi tái diễn mới mở đợt tiếp. Chưa gửi cảnh báo ra email/SMS và chưa thay thế giám sát máy chủ.

### Backup mã hóa — chưa bật lịch

Chủ shop chưa có đích backup ngoài dự án, vì vậy `BACKUP_DESTINATION` và `BACKUP_ENCRYPTION_KEY` để trống và chưa tạo lịch. Công cụ không tự mua dung lượng, upload, xoay vòng hoặc xóa backup.

Khi có ổ lưu/NAS được duyệt, cấu hình kín đường dẫn tuyệt đối ngoài dự án và khóa hex 32 byte ngẫu nhiên. Cất khóa riêng với bản sao; mất khóa sẽ không giải mã được. Chạy `npm run db:backup:encrypted` để nhận file AES-256-GCM `.milobak` và checksum SHA-256. Công cụ hiện dùng PostgreSQL Docker của workspace. Đường dẫn ngoài dự án không bảo đảm là một ổ vật lý độc lập; cần kiểm tra hạ tầng thực tế.

Giải mã bằng `node scripts/managed-backup.mjs decrypt <file.milobak> <file.dump>` vào file mới, sau đó `npm run db:restore -- <file.dump> --database <ten_database_moi>`. Không giải mã đè file sẵn có hoặc phục hồi đè shop. Bản `.dump` đã giải mã là dữ liệu nhạy cảm; bảo vệ như database. Báo trạng thái backup không đánh dấu đã diễn tập restore nếu chưa có bằng chứng. Công cụ chỉ sao lưu database, chưa tự sao lưu ảnh/upload hoặc secret.

Workflow `.github/workflows/quality.yml` chuẩn bị kiểm tra trên pull request hoặc chạy thủ công, ghim action bằng commit và chỉ dùng mock/khóa test. Chưa push hoặc chạy workflow trên GitHub. SEO `ProductGroup` dùng SKU, màu, size, giá và tồn từng biến thể; không tự thêm đánh giá, phí vận chuyển hoặc điều khoản đổi trả vào structured data khi chưa có cấu hình xác nhận.
