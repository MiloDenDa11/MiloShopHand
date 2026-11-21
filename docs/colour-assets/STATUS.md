# Tình trạng ảnh riêng theo màu — 20/11/2026

**Nhóm Tee đã hoàn tất: 24 mẫu / 102 màu đang bán đều có bộ ảnh riêng 24 góc.** Lượt này bổ sung 40 bộ màu cho 18 mẫu, gồm No Rules Graphic Tee xanh navy và Sunday Club Tee xám trong ảnh người dùng gửi. Đã tích hợp vào website và database local, kiểm tra đổi màu và xoay ảnh. Xem [báo cáo Tee và danh sách file](TEE-20261120.md).

| Phạm vi | Kết quả |
|---|---:|
| Mẫu sản phẩm toàn catalog | 90 |
| Bộ màu đang bán | 380 |
| Bộ màu riêng đã duyệt và đưa vào website/database | 321 |
| Bộ còn thiếu, thuộc các nhóm ngoài Tee | 59 |
| Mẫu đã đủ mọi màu | 72/90 |
| PNG nguyên bản đã đưa vào website | 1284 |
| Góc ảnh danh nghĩa đã đưa vào website | 7704 |
| Bộ Tee mới trong lượt 20/11 | 40 |
| PNG mới / góc mới / WebP mới | 160 / 960 / 480 |
| Phần PNG giữ lại của các bộ ngoài Tee còn dở | 7 |
| Lượt tạo phần ảnh còn cần, chưa tính tạo lại | 229 |

Số liệu toàn catalog lấy từ [coverage.json](coverage.json), cập nhật 2026-11-20T09:12:54.452Z. Ảnh được tạo bằng **ImageGen tích hợp**, chế độ chỉnh từ ảnh tham chiếu của đúng mẫu; PNG giữ nguyên byte. Không dùng API/CLI trả phí dự phòng hoặc bộ lọc nhuộm màu. Đây là ảnh AI mô phỏng thiết kế và góc danh nghĩa, không phải ảnh chụp hàng hóa thật hay bộ quay đã hiệu chuẩn.

## Ảnh, prompt và checkpoint

- Ảnh cuối: `apps/web/public/collection-spin/<slug>/native-<hex>-v1/part-0..3.png`. Mỗi màu có bốn PNG 1536×1024, sáu ô 512×512 mỗi PNG.
- [Danh sách duyệt](../photo-spin/approved.json) liên kết hồ sơ từng bộ trong `docs/photo-spin`, gồm prompt cuối, nguồn tham chiếu, ghi chú duyệt, kích thước và SHA-256.
- Lượt Tee: `.local/native-colours/tee-20261120/`, review batch 40–46; checkpoint từng phần tại `.local/native-colours/generated/<id>/part-N.json`. Toàn bộ 160 PNG gốc được sao lưu nguyên byte trong `.local/native-colours/staged`.
- Báo cáo trước lượt Tee giữ tại `.local/native-colours/tee-20261120/STATUS-before-tee.md`. Lỗi hạn mức 429 ngày 19/11 thuộc lịch sử; lượt Tee ngày 20/11 đã tạo xong đủ ảnh.

## Kết quả kiểm tra

- Toàn thư viện đã duyệt: **PASS**, 321 bộ / 7704 góc / 1284 PNG; kiểm tra hash URL, kích thước, ô góc không trùng nguyên byte và đường dẫn ảnh trong DB. `assets:photos:verify -- --require-all` xác nhận đủ màu gốc của 90 mẫu; tiêu chí này khác với đủ mọi màu đang bán.
- WebP mới: **PASS**, giải mã và đối chiếu 480 ảnh phân phối với 160 PNG nguồn mới, kiểm tra SHA-256, kích thước, tỷ lệ và sai số pixel. 1213 nguồn / 3904 WebP trước lượt này giữ bằng chứng kiểm tra ngày 19/11; không tuyên bố đã chạy lại toàn bộ verifier WebP cũ.
- HTTP mới: **PASS**, 40 bộ màu / 18 mẫu / 498 request; nội dung PNG và WebP nhận từ web trùng file local, URL có hash mới, không có 404.
- Chromium trang chi tiết: **PASS**, toàn bộ 24 mẫu Tee / 102 màu / 0 màu thiếu; kiểm tra bốn nhóm góc 0, 6, 12, 18 ở mỗi màu trên màn hình 360 px, đúng màu native, không canvas hoặc GLB, 0 lỗi JavaScript.
- Chromium thẻ sản phẩm: **PASS**, 40 màu mới × 2 chiều rộng 1440/360 px = 80 lượt; ảnh tĩnh đúng hash màu, link chi tiết giữ màu, bốn nhóm góc xoay mỗi lượt, không ô báo đang cập nhật, không tràn ngang.
- Dữ liệu kinh doanh: **PASS**, hash 38 mô hình trước/sau không đổi; loại trừ riêng ảnh quản lý và cấu hình trình bày sản phẩm. Không đổi giá, variant, kho, đơn hàng hoặc tài khoản.
- Kiểm tra bắt buộc toàn catalog `audit-rotation-coverage.ts --require-native`: **chưa đạt**, còn 59 bộ ngoài Tee. Không hạ tiêu chuẩn hoặc tính bảy phần PNG dở thành bộ hoàn tất.

Bằng chứng có thể đọc trong [báo cáo kiểm tra Tee](TEE-20261120-verification.json); log và screenshot đầy đủ nằm trong thư mục local của lượt này. Kiểm tra trình duyệt dùng API sản phẩm và ảnh local thật, chỉ mock request hồ sơ ẩn danh `/api/v1/me` để không ghi thêm AuditLog. Đây là kiểm tra development hiện tại, chưa triển khai production hoặc đẩy GitHub.

## Tiếp tục các nhóm khác

Làm mới kế hoạch bằng `npx tsx scripts/plan-native-colours.ts` rồi `node scripts/prepare-native-colour-resume.mjs`. Tiếp tục 59 bộ ngoài Tee, bỏ qua checkpoint có sẵn và duyệt trực quan trước khi đăng ký. Xem [quy trình](README.md) và [sửa phản hồi nút màu](SWATCH-FIX.md).
