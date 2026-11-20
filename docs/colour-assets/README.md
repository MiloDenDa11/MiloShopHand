# Bộ ảnh riêng theo màu — MILOSHOPHAND

**Tiến độ 19/11/2026:** 281/380 bộ màu đã được duyệt và cập nhật vào website local; còn 99 bộ. Lần tiếp tục này bổ sung 88 bộ, đồng thời lưu bảy phần PNG của năm bộ đang dở. ImageGen đã trả lỗi 429 `usage_limit_reached`, báo mở lại khoảng 12:23:29 ngày 20/11/2026 (giờ Việt Nam). Xem [báo cáo bàn giao hiện tại](STATUS.md); toàn bộ catalog chưa hoàn tất.

Ảnh được tạo bằng ImageGen tích hợp, chỉnh từ đúng bộ ảnh của từng mẫu áo. Mỗi màu có bốn PNG nguyên bản, mỗi PNG gồm sáu góc, tổng 24 góc danh nghĩa quanh trục đứng. Không dùng bộ lọc màu, canvas nhuộm vải hay blob tạm để giả lập màu mới. Đây là ảnh mô phỏng thiết kế, không phải ảnh chụp hàng hóa đã sản xuất.

Các màu đã có ảnh riêng được giữ. Bộ mới lưu tại `apps/web/public/collection-spin/<slug>/native-<hex>-v1/part-0..3.png`. Prompt, nguồn tham chiếu, ghi chú duyệt và SHA256 nằm trong `docs/photo-spin/<slug>-native-<hex>-v1.json`. Chỉ bộ đủ 24 góc được duyệt trong `docs/photo-spin/approved.json` mới xuất hiện trong storefront.

Nguồn PNG giữ nguyên byte. WebP tại `public/product-media` phục vụ tải ảnh; gallery trước/sau lấy đúng ô từ atlas của màu đã chọn. Giá, tên màu, SKU và kho không thay đổi khi cập nhật ảnh. URL ảnh của đơn cũ được bảo toàn; tham số nhuộm cũ được bỏ qua khi hiển thị.

Trên thẻ sản phẩm, khi chọn màu thiếu ảnh riêng, vùng ảnh chuyển sang thông báo theo đúng màu vừa chọn, kèm nút xem lại màu có ảnh; không giữ nguyên áo cũ khiến người dùng tưởng nút không hoạt động. Tên màu và đường dẫn chi tiết cập nhật cùng lựa chọn. Thư viện chi tiết vẫn có ảnh mẫu tham khảo với nhãn rõ. Nút xoay chỉ dùng được khi có đủ bộ màu tương ứng. Xem [kiểm tra nút chọn màu](SWATCH-FIX.md).

## Kiểm tra và bổ sung

`coverage.json` là báo cáo đọc từ database, ghi rõ thời điểm, số màu có PNG riêng và danh sách còn thiếu. Không tính bộ đang tạo hoặc ảnh phối màu tự động là ảnh đã hoàn thành.

```powershell
npx tsx scripts/plan-native-colours.ts
node scripts/review-native-colours.mjs --report
node scripts/prepare-native-colour-resume.mjs
node scripts/review-native-colours.mjs --prepare <product-slug--hex>
# Xem ảnh contact sheet và bốn PNG gốc, ghi review JSON rõ từng id/visualReview.
node scripts/review-native-colours.mjs --approve <reviews.json>
npm run assets:photos
npm run db:backup
npm run db:seed:photos
npm run assets:photos:verify -- --require-all
npx tsx scripts/audit-rotation-coverage.ts --require-native
npm test
npm run typecheck
npm run test:integration
npm run test:e2e:production
npm run build
```

Lệnh plan chỉ lập danh sách, không gọi API ảnh. Mã tạo ảnh tích hợp chạy trong phiên Codex; prompt và checkpoint từng phần được lưu ở `.local/native-colours/generated`. Không có API key trong source. Công cụ review không tự suy ra phê duyệt từ việc file tồn tại.

`assets:photos:verify -- --require-all` kiểm tra toàn bộ bộ đã duyệt và đủ màu gốc của 90 mẫu; tiêu chí đủ PNG riêng cho mọi màu đang bán là `--require-native`. Không báo hoàn tất toàn catalog nếu lệnh này còn thất bại.

Khi bổ sung file public cho Next production, cần build và khởi động lại web. Preview kiểm thử dùng database `milo_redesign_test`, Redis DB2; integration dùng `milo_integration_test`, Redis DB1. Không chạy test checkout trên database cửa hàng.
