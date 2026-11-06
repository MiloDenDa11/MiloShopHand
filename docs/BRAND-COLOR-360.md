# Logo hoa, màu áo và cửa sổ 360° — 05/11/2026

> Đã thay cách hiển thị theo yêu cầu mới: [ảnh gốc, 24 góc và trục Oy thẳng đứng](PHOTO-SPIN.md). Phần GLB/gallery render dưới đây lưu mốc trước; không mô tả viewer hiện tại.

Đã thực hiện trên `C:\Users\LOQ\OneDrive\Desktop\MiloShopHand`. PostgreSQL/Redis Docker được giữ nguyên. Backup trước cập nhật: `.local/backups/milo-2026-11-05T06-44-27-585Z.dump`. Không chép lại mã hoặc dữ liệu từ ổ D.

## Kết quả

- 90 sản phẩm có logo hoa MiloShopHand ở lưng, ML đan xen trước ngực. Bộ 60 ý tưởng AI riêng biệt vẫn giữ đủ 15 tee, 15 jacket, 15 bomber, 15 hoodie; 30 sản phẩm cũ giữ nguyên ID.
- Mỗi sản phẩm có Đen, Trắng, Đỏ mận, size S/M/L/XL. Giữ màu cũ và SKU cũ; bổ sung 1.040 SKU màu/size, tổng 1.520 SKU. Tổng 380 lựa chọn màu, không tính chúng thành thiết kế mới.
- Một bản logo PNG alpha do built-in ImageGen tạo từ mẫu người dùng. Nét trắng được GPU đổi thành mực trắng hoặc đen theo độ sáng vải; tỷ lệ tương phản màu cơ sở nhỏ nhất trong toàn bộ danh mục là **4,67:1**. Đây là kiểm tra màu, không phải chứng nhận độ tương phản trên vải in thực tế.
- 90 GLB mới và 760 ảnh WebP trước/sau; mỗi ảnh 720×960. Một GLB dùng chung cho mọi màu của cùng thiết kế, đổi vật liệu trên GPU. Mô hình và gallery dùng cùng palette, geometry và logo. Tài nguyên có đường dẫn phiên bản để tránh cache ảnh cũ.
- Ảnh AI gốc giữ nguyên làm tư liệu ý tưởng. Gallery hiện dùng ảnh render từ mô hình để màu và logo khớp cửa sổ 360°. Giao diện ghi rõ nguồn AI/mô phỏng 3D; đây chưa phải ảnh chụp hàng thực tế.

## Tương tác

Bấm ảnh lớn mở dialog 360°; bấm ảnh mặt sau sẽ mở ở góc sau. Có kéo chuột/vuốt, mặt trước/sau, zoom, reset, bàn phím, đổi màu ngay trong dialog. Đổi màu giữ góc và không tải lại GLB. Escape/nút đóng trả focus về nút đã mở. Có nút phóng to ảnh tĩnh riêng.

Three.js + GLB được tải theo nhu cầu. Không tự xoay; render khi có thao tác hoặc thay đổi kích thước, dừng khi ẩn. Đóng viewer giải phóng WebGL/material/texture/geometry. Có loading, retry, thông báo thiếu WebGL và gallery thay thế. Dialog kiểm tra tại 360px, reduced motion và sự kiện touch thực trên Chromium mobile.

Các mô hình là mô phỏng kiểu dáng có thể tích; không phải scan 3D hoặc mô phỏng vật lý vải. Hình và màu thực tế cần shop đối chiếu trước sản xuất/bán hàng.

## Dữ liệu

Không thêm migration: sử dụng metadata JSON và cột media hiện có. Seed đọc trước dữ liệu, chỉ ghi khi khác; không hạ phiên bản logo mới về bộ cũ. Màu đã có tái sử dụng SKU, không sửa giá/tồn kho. Chỉ thay gallery do script quản lý, giữ ảnh merchant upload. SKU bổ sung được tạo với tồn **mẫu phát triển** 12, không phải số lượng đã kiểm kê thực tế. Seed từ chối NODE_ENV=production.

Đã đối chiếu snapshot trước cập nhật: giữ 90 ID/tên/giá sản phẩm, toàn bộ 480 SKU và 480 tồn kho cũ, 4 đơn và 8 tài khoản. Checkout được sửa để snapshot ảnh đúng màu khách chọn.

## Kiểm tra

- Build shared/API/worker/web và typecheck: PASS.
- Unit/media/palette 8/8, đồng bộ 6/6, integration 24/24, Playwright 26/26: **64/64**.
- Integration dùng `milo_integration_test`, Redis DB 1; E2E dùng `milo_redesign_test`, Redis DB 2. Kiểm tra seed chạy hai lần không đổi gallery, SKU, tồn, giá, quan hệ; checkout chọn ảnh đúng màu; luồng COD và QR mock qua.
- Xác minh 90 GLB nhúng đúng hash logo hoa, 760 WebP hợp lệ, đủ màu/size và mapping gallery/model: PASS.
- Production smoke cũ qua cả bốn loại áo, không lỗi JavaScript/network; chỉ tải 3D sau mở và giải phóng sau đóng. Kiểm tra mở rộng bằng `scripts/smoke-branded-products.mjs` kiểm tra 12 mặt sau (4 loại × 3 màu), vuốt thật, không refetch GLB khi đổi màu và HEAD toàn bộ 850 ảnh/mô hình.
- Một lượt E2E dev đầu có cảnh báo React “state update ... hasn't mounted yet” ở trang thanh toán. Không tái hiện trong 10 lượt mở lại và toàn bộ 26 E2E lần cuối; production smoke không lỗi. Chưa kết luận nguyên nhân, không ghi nhận là lỗi đã sửa.
- Khi chạy nhiều bộ QA đồng thời đã gặp lỗi Prisma không mở được transaction đúng hạn. Seed được sửa để bỏ truy vấn/ghi dư thừa và bỏ hạ dữ liệu v2 về v1; lần cuối seed chạy hai lượt giữ nguyên dữ liệu, integration qua. Không tăng timeout.

## Hiệu năng production hiện tại

Chromium headless trên Windows/i5-12450HX, loopback không throttle mạng/CPU, reduced motion, desktop 1440×1000 và mobile 390×844. Ba lượt mỗi trang/thiết bị, gồm cold/warm browser. Tạm dừng QA server trước đo. Median của sáu mẫu/trang, cùng script và cửa sổ quan sát 700ms như báo cáo cũ.

| Trang | Nội dung baseline trước sửa (ms) | Bản logo/màu hiện tại (ms) | LCP hiện tại (ms) |
| --- | ---: | ---: | ---: |
| Trang chủ | 499 | 157 | 112 |
| Danh sách | 454 | 288 | 254 |
| Tìm kiếm | 345 | 119 | 102 |
| Chi tiết | 335 | 125 | 116 |
| Giỏ hàng | 110 | 150 | 106 |

Baseline chỉ có 30 sản phẩm và ảnh lỗi không hiển thị. Bản hiện tại có 90 sản phẩm, ảnh và font đầy đủ; không so trạng thái thiếu ảnh như tải ảnh thành công. Không khẳng định mọi chỉ số cải thiện: giỏ hàng median cao hơn baseline, điều hướng client 433ms so baseline 266ms. Đây là phép đo local, không phải INP hoặc dữ liệu thực địa. Cả 30 mẫu mới không có lỗi JS/request API trùng; ảnh trong vùng nhìn đều tải thành công. Dữ liệu thô: `.local/performance/brand-v2.json`; lịch sử và API ở [PERFORMANCE-WEB.md](PERFORMANCE-WEB.md), [PERFORMANCE-API.md](PERFORMANCE-API.md).

## Tệp và lệnh

- Manifest: `apps/web/content/branded-colorways.json`.
- Asset hiện tại: `apps/web/public/collection-v2/014520139eb8/`.
- Logo: `apps/web/public/brand/floral-miloshophand-white-v2.png`; prompt/provenance: [ai-collection/floral-logo-v2.json](ai-collection/floral-logo-v2.json).
- Palette dùng chung: `packages/shared/src/garment-palette.mjs`.
- QA production: `docs/brand-v2/previews/`, `.local/brand-v2/production-smoke.json`; dữ liệu bảo toàn: `.local/brand-v2/verification.json`.

```powershell
npm run assets:brand       # Đọc DB và dựng GLB/WebP, không đổi DB
npm run db:seed:brand      # Áp dụng manifest; development, đã backup trước
npm run assets:brand:verify -- --check-original
npm run assets:verify -- --check-original-data
npm test
npm run test:integration
npm run test:e2e
npm run typecheck
npm run build
npm start
# Khi production localhost:3000 đang chạy:
node scripts/smoke-branded-products.mjs
$env:BENCHMARK_URL='http://localhost:3000'
node scripts/benchmark-web.mjs brand-v2
```

Ứng dụng chạy tại http://localhost:3000. PayOS/GHN/SMTP production vẫn cần cấu hình và nghiệm thu bằng tài khoản thật như [báo cáo bàn giao](VERIFICATION.md); lần cập nhật này không triển khai công khai.
