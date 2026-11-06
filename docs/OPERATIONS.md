# Vận hành

Môi trường Desktop hiện dùng PostgreSQL/Redis Docker. Xem [đồng bộ, volumes và lệnh backup/restore](DOCKER-SYNC.md) cho cấu hình đã chuyển ngày 05/11/2026.

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

Compose là local development; giữ DB/Redis private network. Triển khai Nginx/Caddy TLS, APP_URL=https://..., NODE_ENV=production, secrets ngẫu nhiên khác dev, PAYOS/GHN thật, Redis bắt buộc và SMTP thật. Cookie Secure tự bật. Forward X-Forwarded-Proto và Host, tin đúng một reverse proxy. Bật HSTS ở TLS terminator khi domain đã sẵn sàng HTTPS. `.env` không vào image/git; inject secrets bằng secret manager. Phân quyền DB ứng dụng tối thiểu, migration bằng user riêng; không chạy ứng dụng bằng superuser PostgreSQL như local demo. Admin chỉ bootstrap qua terminal riêng tin cậy.

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
