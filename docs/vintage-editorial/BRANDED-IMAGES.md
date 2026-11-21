# Ảnh editorial sử dụng thiết kế MiloShopHand

Đã thay cả 12 ảnh editorial bằng ảnh có áo MiloShopHand và logo tham chiếu từ catalog hiện có. Dùng **ImageGen tích hợp, chế độ edit**, với ảnh editorial cũ làm đối tượng chỉnh và ảnh mặt trước/sau của từng áo làm tham chiếu. Giữ tông Vintage, người mẫu, ánh sáng và chủ đề mỗi ảnh. Đây vẫn là hình ảnh ý tưởng AI được ghi rõ trên website, không phải ảnh chụp hàng hóa hoặc cửa hàng thực tế.

## Ảnh đã thay

| ID / tên file | Áo và dấu hiệu thương hiệu |
|---|---|
| `everyday-basic` | Airy Cotton Tee ngà, logo ML ngực trái. |
| `vintage-bomber` | ML Flight MA1 Bomber olive viền ngà, logo ML; Airy Cotton Tee bên trong. |
| `oversized-outfit` | Mono Boxy Tee kem, logo ML. |
| `streetwear-outfit` | ML Racer Clean Jacket charcoal viền ngà, logo ML. |
| `order-packaging` | Airy Cotton Tee có ML trong hộp và trên người đóng gói. |
| `parcel-delivery` | Airy Cotton Tee có ML trên người nhận; kiện hàng mang họa tiết MiloShopHand. |
| `size-measurement` | Airy Cotton Tee trải phẳng, logo đúng phía ngực trái. |
| `garment-care` | Airy Cotton Tee đang giặt và áo người chăm có ML. |
| `boutique-atmosphere` | Bomber và tee mang ML, một tee quay lưng có họa tiết hoa và MiloShopHand. |
| `customer-service` | Người tư vấn mặc tee ML; khách mặc bomber có họa tiết mặt sau; áo trên quầy có ML. |
| `quality-inspection` | Airy Cotton Tee có ML, kiểm tra gấu và đường may. |
| `privacy-still-life` | Áo Airy gấp gọn có ML bên cạnh sổ và phong bì đóng kín. |

## File và tích hợp

- 12 WebP dùng trên website: `apps/web/public/editorial/branded-20261120-v2/<id>.webp`.
- 12 PNG gốc: `apps/web/public/editorial/branded-20261120-v2/sources/<id>.png`. Giữ nguyên byte ImageGen, có SHA-256 kiểm chứng.
- [Prompt cuối cho từng ảnh, đường dẫn nguồn, tham chiếu sản phẩm, hash và kích thước](images.json).
- `apps/web/content/editorial-photos.ts`: đổi toàn bộ đường dẫn sang bộ mới, mô tả alt theo áo thương hiệu, căn ảnh nhận hàng/kiểm tra áo/tĩnh vật để logo không bị cắt trong card hẹp.
- `apps/web/components/fashion-home.tsx`: ảnh bìa dự phòng dùng metadata chung. Các card phong cách, lookbook, Journal, bài đọc và năm mục chăm sóc khách hàng nhận bộ ảnh mới qua metadata dùng chung.
- `docs/vintage-editorial/images-v1.json`: lưu nguyên manifest trước khi đổi. `verification.json` giữ kết quả kiểm tra giao diện trước đó và trỏ về manifest v1.
- [Ảnh nghiệm thu bộ mới](previews/branded), [kết quả kiểm chứng](branded-verification.json).

Không thêm thư viện, không đổi API, backend, schema, chính sách, giá, tồn kho hoặc ảnh catalog sản phẩm. Các thay đổi Tee và UI từ lượt trước được giữ nguyên.

## Kết quả kiểm tra

| Kiểm tra sau thay ảnh | Kết quả |
|---|---|
| TypeScript và build web production | PASS. File type môi trường do Next build tạo đã trả về đường dẫn development ban đầu. |
| Chromium / Microsoft Edge | 7/7 kịch bản mỗi trình duyệt PASS trên bản build production. |
| Tải ảnh | 12 ảnh, 36 request PNG/WebP/Next Image trả 200; hash PNG nguyên bản và kích thước bản nén đúng nguồn. |
| Responsive | 360, 768, 1024, 1440 px; năm mục chăm sóc khách hàng, card phong cách, Journal, link và chính sách hiện có. Không tràn ngang hoặc lỗi page/ảnh trong các ca đã chạy. |
| Căn ảnh | Đã xem ảnh gốc và ảnh hiển thị; chỉnh ba điểm căn về bên phải để logo xuất hiện trọn trong card hẹp. |
| Dữ liệu | 38/39 mô hình có hash trước/sau giống nhau, gồm sản phẩm, giá, tồn kho, đơn hàng, cấu hình và AuditLog. Session vẫn 12 bản ghi nhưng khác hash; xem ghi chú bên dưới. |

Database local đang chạy trong lúc kiểm tra. Cơ chế hiện hữu ở `apps/api/src/request-security.ts:70` có thể cập nhật `lastSeenAt` khi có request đăng nhập. Snapshot ban đầu chỉ lưu hash toàn mô hình nên không đủ bằng chứng để quy thay đổi Session cho trường hoặc request cụ thể. Không tuyên bố toàn bộ database giữ nguyên, không xóa/khôi phục phiên hay log để làm sạch kết quả. Không thay dữ liệu nghiệp vụ trong lượt chỉnh ảnh này.

Các ca trình duyệt dùng context ẩn danh mới, mock `/api/v1/me`, chỉ đọc sản phẩm/cấu hình. Không đăng nhập, tạo đơn, chạy thanh toán, migrate hoặc seed. Unit và bộ kiểm thử giao dịch từ lượt UI trước không chạy lại vì thay đổi hiện tại chỉ gồm ảnh và metadata. Firefox/Safari chưa được kiểm tra. Server QA production tạm chỉ lắng nghe `127.0.0.1:3110` đã được dừng; server development hiện có giữ nguyên.

## Cache, triển khai và khôi phục

Đường dẫn mới `branded-20261120-v2` tránh dùng lại cache ảnh cũ. Build và khởi động lại web bằng quy trình hiện có; đưa đủ asset mới cùng metadata vào bản triển khai. Không cần migration hoặc seed dữ liệu. Chưa commit, push GitHub hoặc triển khai production trong lượt này.

Nếu cần quay lại ảnh cũ, khôi phục root `/editorial/vintage-20261120` và metadata alt/căn ảnh trước thay đổi, đồng thời phục hồi manifest từ `images-v1.json`. Các asset cũ và PNG nguồn vẫn còn nguyên. Không xóa asset đã phát hành khi URL cũ vẫn có thể được dùng.
