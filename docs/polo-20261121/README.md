# MiloShopHand — Polo Studio, 21/11/2026

> Trạng thái mới nhất: **10 mẫu đã mở bán trên shop local**, đủ S/M/L/XL, mỗi màu/size 20 chiếc. Xem [báo cáo mở bán](../polo-sale-20261121/README.md) và [hồ sơ 40 bộ ảnh xoay](../polo-spin-20261121/README.md). Nội dung bên dưới ghi lại đợt tạo nháp ban đầu.

Đã thêm **10 mẫu polo có cổ, mỗi mẫu 4 màu**, tổng 40 phối màu và 80 ảnh mặt trước/sau, vào dự án và database local. Mỗi thiết kế có cấu trúc riêng; logo ML nhỏ ở ngực trái và sau gáy, lấy ảnh logo thương hiệu trong catalog làm tham chiếu. Bộ ảnh theo hướng lịch sự, trưởng thành, Vintage/Old Money, không phải ảnh chụp sản phẩm thực tế.

Theo lựa chọn của chủ cửa hàng, **tất cả sản phẩm, SKU và bộ sưu tập đang ẩn, chưa mở bán**. Giá dự kiến được phân bổ trong khung đã cung cấp: bán 500–600 nghìn, vốn 200–250 nghìn. Tồn kho bằng 0, không tạo lượng hàng mẫu. Size chưa được cung cấp nên 40 SKU nháp có size “Chưa chốt”, đều ngừng bán; chưa tự tạo S/M/L/XL. Không thay đổi sản phẩm hoặc nghiệp vụ đang có.

## Xem bộ mẫu

- [Thư viện tương tác: chọn đủ bốn màu và xem hai mặt từng áo](preview.html).
- [Ảnh xem trước desktop](previews/studio-1440.png), [mobile](previews/studio-360.png).
- Trong website local: Admin → Sản phẩm, tìm tên mẫu hoặc “Polo”; các mẫu thuộc danh mục **Áo polo** và bộ sưu tập **Milo Polo — The Quiet Gentleman**. Không hiển thị trong danh sách hàng bán cho khách.

Thư viện HTML là hồ sơ xem mẫu trong repository, dùng ảnh WebP thật của bộ mới; không thêm một trang bán hàng hoặc thay giao diện website.

## 10 thiết kế / 40 màu

| Mẫu | Bốn phối màu | Giá bán dự kiến | Giá vốn dự kiến |
|---|---|---:|---:|
| ML Heritage Piqué Polo | Trắng ngà · Xanh navy · Xanh olive · Nâu espresso | 500.000 đ | 200.000 đ |
| ML Riviera Open Collar Polo | Yến mạch · Kem · Nâu chocolate · Đen | 550.000 đ | 225.000 đ |
| ML Club Tipped Polo | Xanh navy · Trắng ngà · Đỏ rượu · Xanh rêu đậm | 530.000 đ | 215.000 đ |
| ML Milano Rib Polo | Cát · Nâu caramel · Xám than · Xanh sage | 560.000 đ | 230.000 đ |
| ML Mercer Zip Polo | Xanh mực · Xám đá · Xanh olive đậm · Đen | 550.000 đ | 225.000 đ |
| ML Oxford Pocket Polo | Xanh nhạt · Trắng ngà · Nâu tobacco · Xanh navy | 540.000 đ | 220.000 đ |
| ML Regatta Breton Polo | Ngà kẻ navy · Navy kẻ ngà · Sage kẻ kem · Taupe kẻ nâu | 530.000 đ | 215.000 đ |
| ML Court Raglan Polo | Xanh olive · Xám than · Cát · Đỏ rượu | 520.000 đ | 210.000 đ |
| ML Atelier Side Panel Polo | Ngà phối camel · Navy phối charcoal · Mocha phối kem · Sage phối olive | 560.000 đ | 235.000 đ |
| ML Cable Heritage Polo | Kem · Xanh navy · Xanh rừng · Nâu walnut | 600.000 đ | 250.000 đ |

Các thiết kế khác nhau ở piqué hai nút, cổ mở Riviera không nút, cổ/bo viền đôi Club, gân dọc Milano, khóa kéo Mercer, nẹp ẩn/túi ngực Oxford, kẻ Breton, raglan viền mảnh, phối mảng dọc và dệt vặn thừng nhỏ. Chất liệu ghi trong sản phẩm là định hướng thiết kế; cần đối chiếu hàng thực tế trước mở bán.

## Ảnh và mã nguồn

- **ImageGen tích hợp**: 10 ảnh mẫu gốc có tham chiếu logo, 30 lần chỉnh màu riêng từ mẫu tương ứng. Không dùng API/CLI ngoài hoặc cần API key.
- 40 PNG nguyên bản 1536×1024: `apps/web/public/collection-ai/polo-20261121/<slug>-<hex>.png`. Mỗi PNG có hai khung bằng nhau: trước bên trái, sau bên phải; giữ nguyên byte từ công cụ.
- 240 WebP: `apps/web/public/product-media/<hash>-v1-<front|back>-<256|512|768>.webp`, tạo bằng pipeline crop/nén hiện có. Không nhuộm màu hoặc ghép logo bằng code.
- [Prompt chính xác của từng ảnh, đường dẫn nguồn/tham chiếu, hash và ghi chú duyệt](images.json); [toàn bộ file mới và file sửa](files.json).
- `apps/web/content/polo-designs.json`: 10 thiết kế và bốn màu riêng; không chứa giá vốn.
- `prisma/polo-pricing.json`: cấu hình giá dự kiến nội bộ cho importer; không đưa vào thư mục public, metadata ảnh hay bundle giao diện.
- `prisma/polo.ts`: nhập bổ sung bằng transaction, chỉ database local; không ghi đè bản ghi đã có khi chạy lại. Ghi 10 AuditLog tạo mẫu nháp, không nới ràng buộc giá trong database.
- `scripts/build-product-media.mjs`: nhận thêm các plate polo đã duyệt; mọi ánh xạ media cũ giữ nguyên.
- `scripts/build-polo-preview.mjs`: dựng thư viện xem mẫu. `tests/polo-catalog.test.ts` thêm năm kiểm tra vào `npm test`; package.json có lệnh plan/import/preview. Không đổi dependency, backend, schema hoặc UI hiện hữu.

Không tạo hoặc quảng cáo ảnh xoay 360°/mô hình 3D cho bộ polo: phạm vi lần này là ảnh từng mẫu/màu và mặt trước/sau. Các ảnh Tee, editorial và favicon từ các lượt trước được giữ nguyên.

## Kết quả kiểm tra

| Kiểm tra | Kết quả |
|---|---|
| TypeScript ứng dụng và importer | PASS. |
| npm test | **53/53 PASS**, gồm năm bài kiểm tra polo: số mẫu/màu, ghép ảnh đúng màu, trạng thái nháp, khung giá/giá vốn riêng và chặn import production/remote. |
| Ảnh gốc và ảnh phân phối | **40 PNG / 240 WebP / 320 request HTTP PASS**, không 404. SHA-256 ảnh gốc khớp nguồn; crop/tỷ lệ/kích thước đúng, sai số pixel trung bình tối đa 2.413. |
| Thư viện xem mẫu | **160 trạng thái PASS**: 10 mẫu × 4 màu × 2 mặt × desktop/mobile. Không lỗi page hoặc tràn ngang ở 1440/360 px. |
| Trạng thái nháp | 10 sản phẩm, 40 SKU, bộ sưu tập đều tắt; 40 dòng kho mới có onHand/reserved bằng 0; API danh mục áo polo trả 0 hàng công khai. |
| Chạy importer lại | PASS: tạo 0, giữ 10; hash sản phẩm/SKU/ảnh/kho giữ nguyên, không thêm AuditLog tạo trùng. |
| Dữ liệu trước đó | **42 bảng, không bản ghi cũ nào bị thay đổi hoặc mất**, bao gồm bảng liên kết. Chỉ bổ sung các bản ghi cho bộ polo và nhật ký tương ứng. |

[Bằng chứng tổng hợp và giới hạn kiểm tra](verification.json). Có thêm một AuditLog bảo mật 401 tại /me do hệ thống local đang chạy; đã phân loại riêng, không quy nguồn request và không xóa log. Bộ kiểm tra đếm log ban đầu đã phát hiện sự kiện này; các hash của log cũ đều được giữ nguyên.

Trước khi ghi dữ liệu đã sao lưu 42 bảng cùng quan hệ vào `.local/polo-20261121/database-before.rows.json.gz`, xác nhận đọc/giải nén khớp. Đây là backup hàng dữ liệu cho schema hiện tại, không phải pg_dump hoặc một bài phục hồi toàn máy chủ. Nội dung nhạy cảm nằm trong .local đã bỏ qua Git; báo cáo chỉ công bố số lượng/hash. Không chạy checkout, tạo đơn, đăng nhập quản trị hay kiểm thử ghi dữ liệu khác. Không chạy build production hoặc E2E Admin có xác thực trong lượt chỉ thêm dữ liệu/ảnh này.

## Dùng lại và hoàn thiện trước mở bán

`npm run db:polo:plan` chỉ kiểm tra kế hoạch. `npm run assets:media` tạo lại WebP; `npm run assets:polo:preview` tạo lại thư viện. `npm run db:seed:polo` nhập bổ sung **chỉ trên database development local**, không sửa giá, kho hoặc ảnh mẫu đã tồn tại. Không chạy seed catalog tổng để cập nhật riêng polo.

Trước mở bán: kiểm tra hàng thật và bảng size; thay/hoàn thiện các SKU “Chưa chốt” theo size thực tế cho từng màu; duyệt lại giá bán/giá vốn; nhập tồn qua chức năng quản lý kho có lý do; sau đó mới bật SKU, sản phẩm và bộ sưu tập phù hợp. SKU nháp không dùng nữa có thể tiếp tục để tắt, không cần xóa. Không bật hàng loạt khi chưa kiểm tra ảnh và dữ liệu.

Mã và ảnh mới cần đi cùng nhau trong bản phát hành; build lại web theo quy trình triển khai hiện có để nhận manifest ảnh. Importer này chủ động chặn môi trường production/DB từ xa; đưa danh mục đã duyệt lên production qua quy trình quản trị/import được cửa hàng cho phép, không bỏ chặn hoặc seed production tự động.

Nếu cần ngừng sử dụng bộ mới, giữ các mẫu ở trạng thái ẩn và giữ asset để không phá tham chiếu. Sao lưu source/manifest trước lượt này và bằng chứng chi tiết ở `.local/polo-20261121/`. **Chưa commit, push GitHub hoặc triển khai production.**
