# MILOSHOPHAND — The Everyday Issue

Giao diện được nâng cấp trực tiếp trong `D:\MiloShopHand`, theo tinh thần vintage magazine, classic streetwear và everyday basic. Phạm vi thay đổi là frontend, tài liệu và công cụ kiểm thử. API, worker, schema, migration, seed và lockfile được giữ nguyên.

## Thiết kế và trải nghiệm

- Cream `#F2EFE7`, washed black `#252522`, olive `#777D55`, brown `#8A6850`, beige `#D8CEBB`, warm white `#FAF9F5`. Olive đậm `#505738` được dùng cho chữ để dễ đọc. Token nằm ở đầu `apps/web/app/fashion.css`.
- Hero “Wear your own story.” với bố cục bìa tạp chí, đường kẻ, số ấn phẩm và hai CTA. Khi chưa có ảnh lookbook thật, bìa dùng typography thương hiệu; không dựng hình áo thay ảnh sản phẩm.
- Header sticky, đủ năm mục điều hướng, tìm kiếm có gợi ý từ API, menu riêng cho điện thoại với focus trap của native dialog, Escape và trả focus về nút mở.
- Hàng mới lọc trực tiếp bằng API theo danh mục. Sản phẩm bán chạy giữ nguyên cách xếp hạng của backend; không thêm số lượt mua hoặc danh hiệu bán chạy cho từng sản phẩm khi chưa có bằng chứng.
- Trang chủ có câu chuyện thương hiệu, bốn hướng phối đồ, bộ sưu tập theo khí hậu, lookbook, ba bài Journal và lời mời cộng đồng. Vintage được ghi là hướng phối đồ, không tạo thêm một tag hay bộ sưu tập giả trong database.
- Card có giá, giá gốc khi phù hợp, tồn kho, màu, yêu thích và xem chi tiết. Ảnh thật dùng tỷ lệ 3:4, `object-fit: contain`, ảnh thứ hai thuộc cùng màu. Màu chưa có ảnh không dùng ảnh của màu khác.
- Chi tiết giữ lựa chọn SKU, số lượng và thêm giỏ; bổ sung “Mua ngay”, bảng size, thông tin bảo quản, chính sách, đánh giá và sản phẩm liên quan. Gallery thật có thumbnail, phóng to, phím mũi tên và Escape khi đã có asset. Trên điện thoại, sản phẩm thiếu ảnh đưa phần chọn mua lên trước ghi chú thương hiệu.
- Giỏ, tài khoản, checkout, đơn hàng và Admin dùng cùng bảng màu, form, nút, typography. Logic định giá, giữ kho, xác thực, QR/COD và xử lý đơn tiếp tục gọi API cũ.
- Reveal theo vùng nhìn, hover nhẹ, drawer và marquee CSS; tôn trọng reduced motion, không giữ quyền cuộn. Không tải Three.js trên trang chủ mới.

## Phần còn phụ thuộc tài nguyên thương hiệu

**Chưa có ảnh chụp thật và chưa có file Baket Fashion được cấp phép.** Vì vậy bản hiện tại là giao diện hoạt động với bố cục chữ, chưa phải bản lookbook có ảnh hoàn chỉnh.

Tại thời điểm kiểm kê, database đang dùng có 30 sản phẩm, 274 biến thể và 60 ảnh SVG minh họa; 34 biến thể bổ sung đã tồn tại trước đợt nâng cấp. Toàn bộ bản ghi được giữ lại. Các SVG vẫn có trong source và Admin để quản lý dữ liệu cũ, nhưng không được dùng làm ảnh hàng hóa trên storefront mới.

Checklist [ASSET-CHECKLIST.csv](ASSET-CHECKLIST.csv) liệt kê 94 nhóm sản phẩm/màu thực có, gồm SKU và bốn tên file đề xuất: mặt trước, mặt sau, chi tiết vải và ảnh mặc trên người. Đây là danh sách cần chụp, không phải ảnh mới được tạo. Một số màu trong database là biến thể kiểm thử; quản trị nên duyệt lại danh mục thực bán trước khi tổ chức chụp ảnh.

Ngoài checklist, cần bổ sung:

| Asset | Yêu cầu |
| --- | --- |
| Hero | 1 ảnh lookbook dọc, đề xuất 1500×2000, đúng thiết kế đang bán; ảnh mặt đứng, đủ khoảng thở quanh người mẫu |
| Lookbook | 3–6 ảnh phối đồ thật, tỷ lệ 3:4, mỗi ảnh gắn sản phẩm hoặc bộ sưu tập thực có |
| Bộ sưu tập | 1 ảnh thật cho mỗi bộ sưu tập nếu muốn dùng ảnh tại trang danh mục |
| Cộng đồng | 4–6 ảnh khách hàng đã đồng ý đăng, kèm quyền dùng ảnh và caption được duyệt |
| Instagram, liên hệ | URL chính thức và thông tin cửa hàng được xác nhận; hiện không tự đặt tài khoản mạng xã hội |
| Baket Fashion | File có quyền nhúng web và kiểm tra đủ glyph tiếng Việt |

Không dùng ảnh stock ngẫu nhiên, ảnh AI, ảnh của sản phẩm khác, khách hàng hoặc đánh giá tự tạo để lấp chỗ trống.

## Tích hợp Baket Fashion

Xem [hướng dẫn font](../../apps/web/public/fonts/README.md). Đặt file được cấp phép vào `apps/web/public/fonts/baket-fashion-regular.woff2`; có thể thêm `baket-fashion-oblique.woff2`. WOFF, TTF và OTF cũng được nhận. Restart/rebuild để component `BrandFont` phát hiện file.

Chưa có file: CSS chỉ kiểm tra Baket Fashion cài trong máy; nếu không có, trình duyệt dùng Georgia có sẵn làm fallback kỹ thuật. Không tải một font thương hiệu thay thế và không gửi request tới file vắng mặt. Nội dung sử dụng Arial/Helvetica. Bản preview được chụp **chưa sử dụng Baket Fashion**. Cần kiểm tra lại kích thước chữ, xuống dòng và dấu tiếng Việt sau khi thêm font.

Nguồn nhà phát hành: [Baket Fashion — Nirmana Visual / MyFonts](https://www.myfonts.com/collections/baket-fashion-font-nirmana-visual), [Nirmana Visual](https://nirmanavisual.com/). Giấy phép phải phù hợp với việc nhúng web của cửa hàng; không đưa bản demo personal-use vào production.

## Bổ sung ảnh thật

1. Trong Admin → Sản phẩm → Chỉnh sửa, tải ảnh đúng sản phẩm qua bộ upload hiện có. Điền alt mô tả và **màu chính xác trùng tên màu của biến thể**. Ảnh không gắn màu chỉ dùng khi thực sự áp dụng cho mọi màu. Bỏ SVG khỏi danh sách hiển thị bằng luồng quản trị thông thường khi đã có ảnh thật phù hợp, sau khi kiểm tra lịch sử nghiệp vụ.
2. Dùng cùng khung 3:4, đề xuất 1200×1600 hoặc 1500×2000, ánh sáng trung tính, giữ màu thật. Xuất WebP, JPEG hoặc PNG cho bộ chọn file Admin hiện có; tối đa 5 MB mỗi file. Chọn ảnh trước/sau đứng cạnh nhau để hiệu ứng hover đúng màu. Không đặt thông tin size hay giá thành một phần của ảnh.
3. Khai báo hero, lookbook, cộng đồng và Instagram trong `apps/web/content/brand.ts`. Các trường hiện để trống có chủ đích. `src` dùng đường dẫn cùng origin hoặc URL S3 được cấu hình; không sửa CSP để cho phép nguồn ảnh tùy ý. `href` trỏ đến sản phẩm/bộ sưu tập thực có. Banner có ảnh thật cấu hình trong Admin cũng có thể làm ảnh hero.
4. Kiểm tra desktop, mobile, gallery, hover và zoom với các file thật sau khi bổ sung. Bộ lọc media chỉ loại SVG và nhãn minh họa, không tự xác minh quyền ảnh hoặc nội dung của một file JPEG.

## Chạy bản nâng cấp

Chạy cửa hàng với dữ liệu đang dùng theo [README chính](../../README.md). Giao diện mới đã được đồng bộ sang `C:\Users\LOQ\OneDrive\Desktop\MiloShopHand`; tiếp tục chạy và sửa tại thư mục Desktop. Xem [báo cáo chuyển Docker](../DOCKER-SYNC.md).

Để xem và kiểm thử độc lập, sau khi đã cài dependencies và tạo `.env` bằng hướng dẫn chính:

```powershell
cd C:\Users\LOQ\OneDrive\Desktop\MiloShopHand
npm run infra:up
node scripts/redesign-preview.mjs
```

Mở <http://localhost:3100>. Swagger: <http://localhost:4100/api/docs>. Lệnh tạo database riêng `milo_redesign_test` trên PostgreSQL Docker và dùng Redis DB 2, API 4100, frontend 3100 và worker riêng. Chỉ migrate/seed database kiểm thử này. QR và vận chuyển là mock được gắn nhãn phát triển; không chuyển tiền hay gửi hàng thật. Ctrl+C dừng các tiến trình do lệnh này tạo. Các cổng phải đang trống trước khi chạy.

Trong terminal thứ hai, khi preview đang chạy:

```powershell
node scripts/redesign-preview.mjs --tests-only
```

Hoặc `node scripts/redesign-preview.mjs --test` để khởi động, kiểm thử rồi dừng. Dữ liệu QA có thể tồn tại qua lần chạy; đây không phải dữ liệu bán hàng. Không dùng tài khoản hoặc dữ liệu khách hàng thật trong môi trường QA.

## Kết quả xác minh

Xem [VERIFICATION.md](VERIFICATION.md) cho kiểm thử, phạm vi bảo toàn và giới hạn. Ảnh chụp giao diện nằm trong [previews](previews/), gồm trang chủ, danh sách, sản phẩm, bộ sưu tập, Journal, tài khoản, giỏ, checkout, đơn QR và quản trị. Ảnh đơn/checkout dùng fixture kiểm thử và ghi rõ thanh toán mô phỏng.
