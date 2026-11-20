# Checklist bảo mật cho Admin

## Mỗi ngày / khi có cảnh báo

- [ ] Kiểm tra login thất bại/cooldown, truy cập Admin bị từ chối, rate-limit và sự kiện đăng nhập đa nguồn; đối chiếu requestId trước khi kết luận tấn công.
- [ ] Kiểm tra đơn/payment bất thường, outbox FAILED, Redis/API/worker health và tồn reserved lâu; không sửa PAID/tồn qua database thủ công.
- [ ] Kiểm tra backup mới hoàn tất, dung lượng đĩa và quyền đọc backup/private photos; không gửi dump/secret qua chat/email.
- [ ] Không ghi password/token/cookie vào ảnh chụp, issue hoặc log; giữ tài khoản quản trị riêng, đăng xuất trên thiết bị dùng chung.

## Mỗi tuần

- [ ] Chạy npm audit và security:scan trên source/release được quản lý; rà dependency/image advisory từ nguồn chính thức.
- [ ] Rà tài khoản ADMIN và phiên đang mở; thu hồi quyền/phiên không còn cần thiết theo quy trình được phê duyệt.
- [ ] Rà upload bất thường, dung lượng, quota và file orphan; chỉ xóa theo retention đã được chốt, không xóa ảnh gắn đơn/đổi trả tùy ý.
- [ ] Kiểm tra cảnh báo đã đến người trực thực tế; có log không có nghĩa là đã có người nhận cảnh báo.

## Mỗi tháng

- [ ] Restore một backup vào database mới, so sánh số bảng/count/hash, kiểm tra ảnh và tắt worker/outbox trên bản restore.
- [ ] Kiểm tra certificate/TLS, HTTPS redirect, HSTS/CSP/security headers và cookie trên domain thật.
- [ ] Rà firewall, cổng public, TRUST_PROXY, DB/Redis ACL, quyền file và thay đổi hạ tầng; API/DB/Redis không public trực tiếp.
- [ ] Rà secret manager, thời hạn khóa provider, browser Maps restrictions và quyền bucket. Rotate có kế hoạch, không đổi khóa mã hóa khi chưa xử lý dữ liệu đang dùng khóa cũ.
- [ ] Xác minh phiên bản Node/framework/base images còn được hỗ trợ và đã quét CVE.

## Mỗi release

- [ ] Backup, snapshot source/lockfile, image digests và kế hoạch rollback được xác nhận.
- [ ] Unit/integration/browser QA/typecheck/build và dependency/secret scan đạt; không chạy test checkout trên database cửa hàng.
- [ ] USER/khách bị chặn Admin và giá nhập; không tự thay role, giá, tồn, refund, chủ đơn hoặc chủ ảnh.
- [ ] XSS payload vô hại không thực thi; CSP nonce đổi từng phản hồi; HTML không bị cache dùng chung.
- [ ] Origin/CSRF sai bị chặn; session cũ mất hiệu lực sau logout/reset/grant; login rate-limit không bị giả header forwarding vượt qua.
- [ ] Upload raster/MIME/dung lượng/dimensions và quota đúng; SVG/executable/path traversal bị chặn.
- [ ] Runtime production dùng DB role ít quyền, SMTP/provider thật, Redis bắt buộc; debug/docs không mở công khai.
- [ ] Có người chịu trách nhiệm theo dõi sau deploy và phương án quay lại release trước.

## Khi nghi ngờ sự cố

Giữ bằng chứng đã che dữ liệu nhạy cảm, giới hạn đúng tài khoản/phiên/route bị ảnh hưởng và liên hệ người phụ trách. Không tự xóa audit/đơn hoặc replay webhook/outbox để "sửa" số liệu. Đối soát tiền và kho trước khi phục hồi, kiểm thử bản vá trên QA rồi mới triển khai được phê duyệt.
