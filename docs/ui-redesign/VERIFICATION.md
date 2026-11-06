# Xác minh UI/UX — 05/11/2026

Giao diện đã đồng bộ sang `C:\Users\LOQ\OneDrive\Desktop\MiloShopHand`. Đã chạy lại Chromium/Playwright **9/9 đạt** với frontend 3100, API 4100, worker, database `milo_redesign_test` trên PostgreSQL Docker 5432 và Redis DB 2. Integration **16/16 đạt** trên database riêng và Redis DB 1. Xem [báo cáo chuyển Docker](../DOCKER-SYNC.md).

Bảng dưới ghi nhận lần xác minh UI ban đầu ở ổ D, khi PostgreSQL QA dùng cổng 5433. Không gọi nhà cung cấp thanh toán/vận chuyển thật.

| Kiểm tra | Kết quả |
| --- | --- |
| `npm run typecheck` | Đạt cho API, worker, web |
| `npm run build` | Đạt cho shared, API, worker, web; 19 route được Next liệt kê |
| `npm test` | 5/5 đạt: tiền VND, phân bổ giảm giá, hoàn từ snapshot, chuyển trạng thái, validation |
| Integration | 16/16 đạt trên database `milo_integration_test` trong PostgreSQL QA cổng 5433 |
| Playwright | 9/9 đạt, gồm 5 bài UI mới và 4 bài mua hàng/bộ lọc hiện có |
| Responsive | 360, 768, 1440px trên 10 route chính; checkout và Admin đã đăng nhập được kiểm tra thêm ở 360px |
| Console/Network | Không lỗi JavaScript hoặc HTTP ngoài 401 `/me` dự kiến khi chưa đăng nhập trong kịch bản guest; không request ảnh SVG merchandise hoặc font vắng mặt |
| Bảo toàn mã nguồn | SHA256 của 33 file API/worker/shared/Prisma/infra/manifest/lockfile trùng trước và sau |
| Bảo toàn asset | 60/60 SVG gốc trùng byte với bản sao trước nâng cấp |

## Các luồng đã chạy

- Mobile menu: mở bằng bàn phím, Escape, focus trả về, chọn đường dẫn.
- Tìm kiếm: gợi ý từ API, submit, URL chứa query và giữ sau reload.
- Bộ lọc mobile: đóng/mở, kết hợp danh mục/size, giữ lựa chọn sau reload. Đã sửa lỗi defaultValue của select khi taxonomy tải bất đồng bộ.
- Admin mobile: form tìm kiếm xuống hàng, bảng cuộn trong khung; đã sửa min-width của sidebar và grid để không làm tràn toàn trang.
- “Mua ngay”: chưa chọn size có thông báo và focus; chọn size, tăng số lượng, tới checkout; giỏ khách giữ đúng số lượng sau reload.
- Tắt WebGL, reduced motion, màn hình 360px: xem sản phẩm và thêm giỏ vẫn hoạt động.
- Đăng nhập → địa chỉ thủ công sau khi không có vị trí → xác nhận phí → COD/QR mock → tạo đơn → webhook phát triển có chữ ký cho QR → Admin xác nhận đơn.
- Integration kiểm tra lại đăng ký/xác minh/reset, MFA, phân quyền, chống sửa giá, checkout idempotency, tranh SKU cuối, giới hạn voucher, webhook trùng/sai/đến muộn, hủy và hoàn một phần, tách COD đã thu/đã chuyển, quyền ảnh đổi trả và lỗi JSON.

Luồng “Mua ngay” dùng giỏ hiện có: thêm biến thể đã chọn rồi chuyển tới checkout. Các món có sẵn trong giỏ tiếp tục được thanh toán cùng nhau, tương thích API checkout hiện tại.

## Phạm vi bảo toàn dữ liệu

Đã chụp snapshot trước thay đổi với 30 sản phẩm, 274 biến thể, 60 ảnh; không thực hiện cập nhật, xóa, migrate hoặc seed vào database cửa hàng. Những lần E2E tạo người dùng, đơn và tác động tồn chỉ xảy ra ở database QA riêng. Không có sửa schema/API để phục vụ giao diện.

Các bài tạo đơn có chốt kiểm tra database phải mang hậu tố `_test`. Fixture bổ sung tồn SKU thử trong database này khi lượng có thể bán thấp để chạy lặp không làm bài kiểm thử thất bại vì đơn QA cũ vẫn giữ hàng. Không có cơ chế bổ sung tồn như vậy trên ứng dụng hoặc database cửa hàng.

Database local cũ ở cổng 5432 đã ngừng kết nối trong quá trình làm việc. Vì vậy không thực hiện được lần so sánh SQL trực tiếp cuối cùng trên database đó; không tự khởi động lại hoặc ghi đè dữ liệu của nó. Bằng chứng bảo toàn gồm snapshot trước, đối chiếu file bảo vệ, asset gốc và cấu hình runner ép database QA riêng. Không diễn giải việc kiểm thử thành kiểm chứng số dư tồn live sau cùng.

## Giới hạn đã ghi nhận

- Chưa có file Baket Fashion: preview dùng fallback hệ thống. Cần giấy phép nhúng web, kiểm tra glyph tiếng Việt và kiểm tra lại bố cục khi file được cung cấp.
- Chưa có ảnh chụp thật: card hiển thị thông tin và trạng thái thiếu ảnh; hero là bìa typography. Không thay ảnh bằng minh họa áo. Gallery/zoom/hover và slideshow đã có code, nhưng chưa thể xác nhận chất lượng hiển thị với asset thật khi chưa nhận được chúng.
- Chưa có Instagram chính thức hay ảnh khách hàng được đồng ý sử dụng. Community là lời mời chia sẻ; không có tài khoản hoặc ảnh giả.
- Bảng size và mô tả trong seed là nội dung mẫu tồn tại sẵn. Cần chủ cửa hàng xác nhận số đo và thông tin thật trước mở bán; lần redesign không ghi đè nội dung database.
- Browser QA tự động dùng Chromium. Chưa chạy máy iOS/Safari thật hoặc kiểm chứng production với payOS/GHN/Google Maps/SMTP.
- Các ảnh trong `previews` là ảnh chụp local của source đã nâng cấp, không chứng minh dịch vụ production đã được triển khai.

## Ảnh chụp

- [Trang chủ desktop](previews/home-1440.png), [mobile](previews/home-360.png).
- [Danh sách desktop](previews/catalog-1440.png), [mobile](previews/catalog-360.png).
- [Chi tiết desktop](previews/product-1440.png), [mobile](previews/product-360.png).
- [Tìm kiếm](previews/search-desktop.png), [menu mobile](previews/mobile-menu.png).
- [Đăng nhập](previews/login-1440.png), [đăng ký mobile](previews/register-360.png), [giỏ](previews/cart-desktop.png).
- [Checkout COD](previews/checkout-COD.png), [checkout QR](previews/checkout-QR.png), [checkout mobile](previews/checkout-COD-mobile.png), [đơn QR](previews/order-QR.png).
- [Admin COD](previews/admin-COD.png), [Admin QR](previews/admin-QR.png), [Admin mobile](previews/admin-COD-mobile.png).
- [Bộ sưu tập](previews/collections-1440.png), [Journal](previews/journal-1440.png).
