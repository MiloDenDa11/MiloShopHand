# Ảnh thiết kế, font và xem 360° — 05/11/2026

> Mới nhất: [ảnh gốc và bộ ảnh 24 góc quanh Oy](PHOTO-SPIN.md). Cách dựng/hiển thị GLB bên dưới đã được thay trên giao diện.

> Cập nhật mới hơn: [logo hoa, ba màu và dialog 360°](BRAND-COLOR-360.md). Các số lượng asset/SKU và gallery bên dưới ghi lại mốc triển khai ban đầu.

Thực hiện tại `C:\Users\LOQ\OneDrive\Desktop\MiloShopHand`, sử dụng PostgreSQL/Redis Docker đang có. Không đồng bộ đè lại từ ổ D.

## Các lỗi đã xác định

- Bộ lọc `isRealPhoto` loại SVG và ảnh có mô tả minh họa, khiến toàn bộ ảnh seed biến mất dù file tồn tại. Hiện ảnh thiết kế được hiển thị và có nhãn nguồn riêng.
- Font Baket Fashion chưa có file được dùng qua `local(...)`, rồi rơi về Georgia. Tracking âm tới `-0.1em` làm dấu/khoảng cách tiếng Việt khó đọc. Hiện dùng Inter và Lora regular/italic WOFF2 trong dự án, tải bằng `next/font/local`; CDP xác nhận toàn bộ glyph “Chất riêng ấy.” dùng Lora.
- Trang đợi JavaScript rồi mới lấy dữ liệu sản phẩm. Hiện trang chủ, danh sách và chi tiết có dữ liệu SSR; metadata/HTML dùng chung request-scoped loader. `no-store` giữ dữ liệu mới ở mỗi lần tải, hook chỉ gộp request đang thực hiện.
- API từng hydrate đến 1.000 sản phẩm khi xếp hạng và đọc đến 10.000 đánh giá. Hiện PostgreSQL xếp hạng/phân trang trước; một truy vấn JSON chỉ đọc dữ liệu công khai của trang. Giá/tồn kho không đưa vào cache kết quả.
- GLB có ảnh nhúng dạng blob; CSP cần `connect-src blob:` cho ImageBitmapLoader. Viewer chỉ báo sẵn sàng khi cả hai texture thương hiệu đã tải.
- Ảnh AI là plate 1774×887 với hai ô vuông. CSS giữ tỷ lệ ảnh, dùng khung ổn định và crop từng ô; không kéo áo dài theo khung 3:4. Ảnh trước/sau chia sẻ cùng nguồn tối ưu/cache.
- Next Image cần `images.localPatterns` cho đường dẫn ảnh local có query version. Ảnh render dùng hash nội dung để tránh cache nhầm phiên bản cũ.

## Bộ thiết kế và tài nguyên

60 thiết kế AI riêng, chia đều 15 áo phông basic, 15 jacket, 15 bomber và 15 hoodie. Mỗi thiết kế có prompt riêng, khác cấu trúc cổ/tay/túi/panel/phom, kèm hai mặt cùng một áo. Bản gốc do built-in ImageGen tạo được giữ nguyên tại `apps/web/public/collection-ai/`; không dùng ảnh tải ngẫu nhiên từ web.

- Danh mục: `apps/web/content/collection-designs.json`.
- Prompt nguyên văn: `docs/ai-collection/prompts.json`.
- File, kích thước và SHA-256: `docs/ai-collection/assets.json`.
- Nguồn tạo built-in: `docs/ai-collection/provenance.json`.
- Nhận diện vector: `apps/web/public/brand/ml-monogram.svg`, `miloshophand-signature.svg`.
- GLB bộ AI: `apps/web/public/collection-3d/`.
- GLB theo màu sản phẩm cũ: `apps/web/public/collection-3d/legacy/`.
- Ảnh render trước/sau theo màu cũ: `apps/web/public/collection-legacy/`.

Ảnh AI được gắn nhãn “Thiết kế / mockup AI”. 30 sản phẩm cũ giữ tên, ID, SKU, màu và tồn kho, có ảnh native 3D gắn nhãn riêng; 60 thiết kế AI được thêm thành sản phẩm mới. Dữ liệu ban đầu của SKU mới là tồn mẫu phát triển, không phải kiểm kê hàng thực tế.

## Viewer 360°

Mỗi sản phẩm có GLB gồm geometry thể tích: thân áo, vai/cổ, tay, hood, túi, viền và chi tiết theo spec; logo ML phía trước và chữ MiloShopHand phía sau là texture alpha nhúng. Đây là mô hình xem kiểu dáng, không phải ảnh phẳng xoay bằng CSS. Mô hình dựng từ thông số thiết kế, không phải phép quét 3D của áo thực hoặc mô phỏng vật lý vải.

`Product360` chỉ import Three.js/viewer và tải GLB sau khi bấm mở. Kéo/vuốt, zoom, mặt trước/sau, reset và phím mũi tên/+/-/Home đều có hỗ trợ. Không tự quay; render theo sự kiện, dừng khi ngoài màn hình hoặc tab ẩn, giới hạn DPR 1,5. Đóng viewer giải phóng geometry/material/texture/context. Thiếu WebGL hoặc tải lỗi vẫn giữ gallery; có thông báo và nút thử lại.

## Dữ liệu và chạy lại

Migration `202611050008_design_media` chỉ thêm `Product.design`, `ProductImage.view/crop`. Không thay khóa sản phẩm/biến thể hay các bảng đơn hàng.

Backup trước thay đổi: `.local/backups/milo-2026-11-05T03-38-14-834Z.dump`. Cấu hình và ảnh chụp ID/đơn/tồn kho trước cập nhật ở `.local/collection-upgrade/`, được loại khỏi Git.

```powershell
npm run infra:up
npm run db:generate
npm run db:migrate
npm run db:seed:collection
npm run assets:verify -- --check-original-data
```

Seed chỉ thêm SKU còn thiếu; SKU có sẵn dùng `update: {}` để giữ số lượng, giá và ID. Rerun cập nhật metadata/ảnh do bộ sưu tập quản lý, giữ ảnh upload của quản trị; chỉ thay các SVG seed cũ. `db:seed` cũng tích hợp bộ sưu tập sau seed nền. Seed mặc định từ chối nếu chưa có đủ 60 ảnh AI và GLB; `--ready-only` chỉ dành cho giai đoạn dựng asset dở dang.

Để dựng lại GLB và ảnh native (không phát sinh thêm ảnh AI):

```powershell
npm run assets:models
```

Ảnh AI gốc và font đã lưu trong dự án, trình duyệt không cần tải font từ Google. Source/license của font nằm cùng thư mục font.

## Kiểm tra và đo tốc độ

Kết quả cuối: 90 sản phẩm (60 thiết kế AI mới + 30 cũ), 480 SKU, 240 gallery entries, 60 PNG AI hai mặt, 120 PNG native trước/sau và 120 GLB theo thiết kế/màu. Bộ xác minh file/database đạt; 240 SKU/tồn kho cũ và bốn đơn ban đầu được giữ nguyên. Seed chạy lại không đổi checksum sản phẩm, biến thể, ảnh hoặc tồn kho.

Typecheck và build đạt. 7 unit nghiệp vụ/media, 6 kiểm thử đồng bộ, 22 integration và 24 Playwright đều đạt (**59/59**). Web/API/worker bản biên dịch đã chạy thành công qua `npm start`. Các bài mobile phân trang, font Việt, media, 360, COD/QR đều qua.

Median nội dung trang chủ 499→231 ms, catalog 454→232 ms; xem [báo cáo production đầy đủ và các chỉ số chưa cải thiện](PERFORMANCE-WEB.md). Phép đo API cuối dùng cùng 90 sản phẩm: tìm kiếm 40,67→15,22 ms, bán chạy 72,55→13,45 ms, chi tiết 57,37→17,67 ms.

API được đo trước/sau bằng Node biên dịch trên cùng Docker; xem [báo cáo API](PERFORMANCE-API.md). Benchmark trang dùng Next production, Chromium desktop 1440×1000/mobile 390×844, ba lượt/trang, loopback không throttle, giảm chuyển động. Các trang: chủ, catalog, tìm kiếm, chi tiết và giỏ hàng.

Before chưa tải ảnh sản phẩm do lỗi lọc; after có ảnh/font đầy đủ và catalog lớn hơn. Vì vậy báo riêng thời gian nội dung, ảnh/LCP và tương tác; không coi ảnh bị thiếu trước đây là một trạng thái tải nhanh hợp lệ. `optionResponseMs` là phép đo thao tác chọn size đến hai frame sau commit, không được gọi là INP thực địa.

```powershell
npm test
npm run test:integration
npm run test:e2e
npm run typecheck
npm run build
```

Integration dùng database riêng và Redis DB 1; E2E dùng `milo_redesign_test`, Redis DB 2. Các bài 360 kiểm tra tải theo nhu cầu, kéo/bàn phím, mặt sau, zoom/reset, mobile, reduced motion, không có WebGL và retry khi lỗi tải.

Để xem nhanh bằng bản biên dịch sau build, dùng `npm start` tại root. `npm run dev` phục vụ chỉnh mã; lần đầu mở route ở chế độ dev vẫn có chi phí biên dịch.

Worker biên dịch vào `apps/api/dist` vì dùng chung các module backend và dependency của API; lệnh start local/Compose đã được sửa theo đúng vị trí này. Phân trang danh mục được phép xuống dòng, giữ grid trong màn hình 360px khi danh mục có tám trang.
