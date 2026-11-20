# Tình trạng ảnh riêng theo màu — 19/11/2026

Đang tạm dừng vì ImageGen trả lỗi hạn mức; xem bằng chứng trong checkpoint. **Toàn bộ 380 bộ màu chưa hoàn tất.** Chỉ tính bộ đã được xem đủ 24 góc, duyệt và cập nhật vào database. Dùng **ImageGen tích hợp**, không dùng CLI/API trả phí dự phòng hoặc ảnh nhuộm bằng bộ lọc.

ImageGen trả lỗi HTTP 429 `usage_limit_reached`; công cụ báo thời điểm mở lại **2026-11-20 12:23:29–12:23:30 +07:00**. Đây là thời điểm do công cụ trả về, không phải cam kết tự chạy lại. Đã kết thúc tất cả cell tạo ảnh; bảy phần PNG của năm bộ đang dở được lưu cùng prompt, nguồn và hash trong `partial-checkpoints-final.json`.

| Phạm vi | Kết quả |
|---|---:|
| Mẫu sản phẩm | 90 |
| Bộ màu đang bán | 380 |
| Bộ màu riêng đã đưa vào website/database | 281 |
| Bộ còn thiếu | 99 |
| Mẫu đã đủ mọi màu | 54/90 |
| PNG nguyên bản đã đưa vào website | 1124 |
| Góc ảnh danh nghĩa đã đưa vào website | 6744 |
| Bộ mới thêm trong lần tiếp tục sau 12:00 | 88 |
| Phần PNG đã lưu của các bộ còn thiếu | 7 |
| Lượt tạo phần ảnh còn cần, chưa tính tạo lại khi không đạt | 389 |

Số liệu lấy từ [coverage.json](coverage.json); cập nhật 2026-11-19T11:05:33.792Z. Bộ đang tạo hoặc chưa duyệt không tính vào số đã hoàn thành. Ảnh AI là mô phỏng thiết kế và các góc danh nghĩa, không phải ảnh chụp hàng hóa thật hoặc bộ quay đã hiệu chuẩn.

## Ảnh, prompt và checkpoint

- Ảnh cuối: `apps/web/public/collection-spin/<slug>/native-<hex>-v1/part-0..3.png`. Mỗi bộ có bốn PNG, sáu góc mỗi PNG; yêu cầu tối thiểu 450 pixel nguyên bản mỗi ô, không nâng ảnh nhỏ để tính đủ chuẩn.
- [Danh sách duyệt](../photo-spin/approved.json) liên kết hồ sơ từng bộ trong `docs/photo-spin`, gồm prompt cuối, nguồn tham chiếu, ghi chú duyệt, kích thước và SHA-256.
- Ghi chú duyệt mới: `.local/native-colours/reviewed-batch-10.json` trở đi. Checkpoint từng phần ở `.local/native-colours/generated/<id>/part-N.json`; PNG nguyên byte được sao lưu trong `.local/native-colours/staged`.
- Kết quả theo lượt này: `.local/native-colours/resume-20261119/progress.json`, log publish từng batch, HTTP/browser và snapshot dữ liệu. Báo cáo trước khi tiếp tục được giữ tại `.local/native-colours/resume-20261119/STATUS-before-resume.md`.

## Kiểm tra đã có bằng chứng

- Publish dùng `npm run assets:photos` rồi `npm run db:seed:photos`. Chỉ cấu hình trình bày và ảnh do hệ thống quản lý được cập nhật; không seed lại catalog gốc.
- Verifier toàn thư viện lần chốt: PASS, 281 bộ / 6744 góc / 1124 PNG; đối chiếu SHA-256, kích thước, ô góc không trùng nguyên byte và đường dẫn ảnh trong database. Log `verify-published-final.log`.
- Verifier ảnh phân phối WebP lần chốt: PASS; 1213 nguồn, 3904 ảnh WebP. Đối chiếu giải mã, kích thước, tỷ lệ và sai số pixel với ảnh nguồn. Gồm hai phạm vi không trùng nhau: 1.185 nguồn trước batch cuối và 28 PNG cuối kiểm tra riêng bằng cùng verifier. Log `verify-media-base-274.log`, `verify-media-tail.log`; báo cáo gộp `media-verification-final.json`.
- HTTP mới nhất: PASS, 88 bộ màu mới, 1087 request; đối chiếu nội dung PNG/WebP nhận được với file local, kích thước nguyên bản và hash URL.
- Chromium mới nhất: PASS_APPROVED_SUBSET, 3 sản phẩm, 10 màu có bộ riêng; bốn nhóm góc mỗi màu, đúng màu native, không canvas nhuộm/GLB, 0 lỗi JavaScript. Đây là kiểm tra trên bản development hiện tại, không phải build production mới. Request hồ sơ ẩn danh được mock tại trình duyệt để không ghi thêm AuditLog lên DB cửa hàng; API sản phẩm và ảnh dùng dữ liệu thật local.
- Tổng hợp bằng chứng Chromium của cả lượt: PASS, bao phủ 88 bộ màu mới trên 31 mẫu; xem `browser-evidence-matrix.json`. Các mẫu chưa thay đổi giữ bằng chứng đã đạt, không gán phạm vi ba mẫu cuối cho toàn bộ catalog.
- Đối chiếu 38 mô hình dữ liệu kinh doanh trước/sau: hash không đổi, gồm giá, tồn kho, đơn hàng và tài khoản; loại trừ riêng ảnh quản lý và cấu hình trình bày sản phẩm. Snapshot của lượt này nằm trong thư mục resume-20261119.
- Kiểm tra bắt buộc đủ màu riêng `audit-rotation-coverage.ts --require-native` vẫn chưa đạt: còn 99 bộ màu thiếu; 54/90 mẫu đã đủ mọi màu. Không tính bảy phần PNG đang dở là bộ hoàn thành. Log `coverage-final.log`.
- Backup đầy đủ trước đợt ảnh: `.local/backups/milo-2026-11-19T03-55-54-485Z.dump`, đã được restore và đối chiếu 42 bảng trong đợt audit ngay trước đó.

Các kiểm thử 48 unit, 42 integration, 71 E2E và build/typecheck đạt thuộc đợt [security audit](../security/AUDIT-20261119.md) trước khi thêm các ảnh lần này; không coi đó là kết quả chạy lại sau mọi batch ảnh. Không thay đổi mã nghiệp vụ hoặc thư viện trong lượt tạo ảnh này. Audit bắt buộc đủ mọi màu vẫn chưa đạt khi còn bộ thiếu; không hạ tiêu chuẩn kiểm tra để báo hoàn thành.

## Tiếp tục

Làm mới kế hoạch bằng `npx tsx scripts/plan-native-colours.ts` rồi `node scripts/prepare-native-colour-resume.mjs`. Tiếp tục các phần còn thiếu bằng công cụ ImageGen, bỏ qua checkpoint có sẵn, kiểm tra trực quan trước khi đăng ký. Không khởi chạy trùng với một cell ImageGen còn hoạt động. Xem [quy trình](README.md) và [sửa phản hồi nút màu](SWATCH-FIX.md).
