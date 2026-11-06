# Quyền sử dụng asset
60 plate trong `apps/web/public/collection-ai` được tạo bằng built-in ImageGen theo 60 prompt riêng, mỗi plate chứa mặt trước/sau của cùng thiết kế. Chia đều 15 áo phông, 15 jacket, 15 bomber, 15 hoodie; nhãn storefront ghi rõ mockup AI. Prompt, nguồn và SHA-256 nằm trong `docs/ai-collection/`. Đây là thiết kế minh họa, không phải ảnh chụp áo đã sản xuất.

120 GLB trong `collection-3d` (60 bộ AI và 60 màu của sản phẩm cũ) dựng bằng geometry native theo thông số áo, có logo/chữ nhúng. 120 PNG trong `collection-legacy` là bản render trước/sau từ các GLB màu cũ. Hình ảnh 3D được gắn nhãn riêng; không phải quét vải hoặc ảnh áo thực. Artwork ML/MiloShopHand nằm tại `public/brand`. 60 SVG seed trước đây vẫn được giữ trong `public/products` để đối chiếu, gallery seed hiện chuyển sang ảnh render.

Font Inter Variable, Lora regular/italic WOFF2 được lưu local theo SIL OFL 1.1, kèm license và liên kết upstream trong [hướng dẫn font](../apps/web/public/fonts/README.md). Không phân phối hoặc trông chờ Baket Fashion. Icon Lucide theo ISC; license giữ trong dependency.

Trước mở bán, quản trị phải thay bằng ảnh hàng hóa có quyền sử dụng và số đo thật của từng thiết kế. Không có ảnh khách hàng hay đánh giá tự tạo trong seed.

Chi tiết triển khai và xác minh: [báo cáo nâng cấp ảnh/font/360](COLLECTION-UPGRADE.md).
