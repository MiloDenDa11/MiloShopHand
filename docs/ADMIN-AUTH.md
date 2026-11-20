# Đăng nhập và cấp quyền Admin — 19/11/2026

Admin đăng nhập bằng email và mật khẩu như tài khoản thường. Quyền quản trị dựa trên vai trò `ADMIN` trong database; không yêu cầu OTP/TOTP hoặc mã khôi phục, kể cả tài khoản còn dữ liệu MFA cũ.

## Cách dùng

- Tạo Admin mới: `npm run admin:create`.
- Cấp quyền cho tài khoản có sẵn: `npm run admin:grant -- email@example.com`.
- CLI cấp quyền giữ nguyên mật khẩu, trạng thái xác minh email và dữ liệu tài khoản; ghi audit trong cùng transaction, chạy lặp không tạo audit trùng. Tài khoản không tồn tại hoặc bị khóa bị từ chối.
- Khi chuyển USER thành ADMIN, CLI thu hồi các phiên cũ trong cùng transaction. Người dùng cần đăng nhập lại để nhận quyền quản trị; không sử dụng lại cookie trước khi nâng quyền.
- Thao tác nhạy cảm vẫn cần xác thực lại bằng mật khẩu hiện tại qua `/auth/reauth`, có hiệu lực 10 phút.

## Phạm vi thay đổi

- `apps/api/src/auth.ts`: bỏ kiểm tra MFA khi đăng nhập và xác thực lại; giữ xác minh mật khẩu, khóa tài khoản, giới hạn đăng nhập và session/CSRF. Trường `otp` từ client cũ được chấp nhận nhưng bỏ qua.
- `apps/api/src/openapi.ts`: mô tả login và reauth chỉ cần mật khẩu, thêm schema reauth.
- `apps/web/components/account.tsx`: bỏ ô mã xác thực và trường OTP trong request ở cả login và SecurityForm.
- `apps/web/components/admin.tsx`: sửa hướng dẫn đăng nhập theo quyền Admin.
- `scripts/admin.ts`, `package.json`: tạo Admin không sinh MFA, thêm lệnh `admin:grant`.
- `tests/integration.test.ts`, `tests/e2e/admin-login.spec.ts`, `tests/e2e/shop.spec.ts`: kiểm thử chính sách mới và cập nhật mô tả fixture.
- README, tài liệu API/kiến trúc/vận hành và chú thích các báo cáo kiểm thử cũ được đồng bộ.

Không thay database schema hoặc xóa dữ liệu MFA cũ. Giữ `MFA_ENCRYPTION_KEY` vì cơ chế mã hóa email chờ gửi vẫn sử dụng biến này. Không cấp quyền cho tài khoản cụ thể trong database cửa hàng khi chưa có email được chỉ định.

## Kiểm chứng trước đợt security audit

- TypeScript: đạt.
- Integration: 26/26 đạt trên `milo_integration_test`, Redis DB1. Bao gồm cấp quyền qua CLI, mật khẩu sai, xác thực lại, đăng nhập Admin mới/cũ, quyền thay đổi trong phiên hiện tại, chặn USER/Admin bị khóa, chặn đăng ký tự cấp ADMIN và CSRF.
- Chromium E2E: 1/1 đạt trên `milo_redesign_test`, Redis DB2, cổng 3100/4100 riêng. Đi từ trang Admin chưa đăng nhập → email/mật khẩu → dashboard → xác thực lại → trang bảo mật tài khoản; không có ô OTP ở login hoặc SecurityForm, request chỉ gửi email/mật khẩu tương ứng, không có lỗi JavaScript. Runner tự dừng dịch vụ QA.
- Unit/regression hiện có: 39/39 đạt.
- Build đầy đủ shared/API/worker/web: đạt, 17 trang được tạo thành công.
- Cửa hàng phát triển tại 3000 và API 4000 vẫn trả HTTP 200.

Kết quả trên thuộc lần thay đổi chính sách đăng nhập trước audit. Quy tắc giữ quyền trong phiên đã được thay bằng thu hồi phiên khi nâng quyền; kết quả kiểm thử mới nhất ở [báo cáo bảo mật](security/AUDIT-20261119.md). Kiểm thử trình duyệt bằng Chromium; chưa kiểm tra thiết bị iOS/Android thật.

Sử dụng thư viện có sẵn (NestJS, Next.js/React, Prisma, Argon2, Zod, Playwright); không cài thư viện mới. Bộ kiểm thử chỉ dùng database QA riêng, không thay dữ liệu cửa hàng hoặc gọi nhà cung cấp thật.
