# Audit và kế hoạch Modern Vintage

Đọc cấu trúc và phân tích 97 tệp source/config trong apps, packages, prisma, infra trước khi chỉnh mã giao diện.

## Kiến trúc đã xác minh

Next.js 16.4.5 App Router, React 19.1.10, TypeScript; NestJS API, Prisma/PostgreSQL, Redis/BullMQ worker. Frontend dùng globals.css → fashion.css → milo-ui.css; CSS riêng cho 360° và phòng thử đồ. Font Inter/Lora tiếng Việt local; Lucide và Motion đã có. Giữ nguyên kiến trúc, schema, endpoint, dữ liệu và adapter thanh toán/vận chuyển.

## Các điểm cần sửa

- Lớp milo-ui.css ép mọi nút thành pill bằng !important; chưa có cấp radius, surface, shadow và trạng thái thống nhất.
- Select native ở catalog, checkout, tài khoản, giỏ và admin; cần một component duy nhất giữ nguyên native form value, tìm kiếm và bàn phím.
- Footer nền sáng nhưng chữ trắng từ lớp cũ gây khó đọc. Form, bảng và vùng tác vụ quản trị chưa đồng bộ storefront.
- Modal, loading, empty state, tabs, upload và trang dùng thử đang dùng nhiều kiểu border/spacing riêng.

## Phạm vi trang

- `/`
- `/admin`
- `/bo-suu-tap`
- `/chinh-sach`
- `/dang-ky`
- `/dang-nhap`
- `/dat-lai-mat-khau`
- `/don-hang/[id]`
- `/dung-thu/[slug]`
- `/gio-hang`
- `/phong-cach`
- `/quen-mat-khau`
- `/san-pham`
- `/san-pham/[slug]`
- `/tai-khoan`
- `/thanh-toan`
- `/xac-minh`

## Kiểm kê JSX

| Thành phần | Số vị trí source |
| --- | ---: |
| input | 92 |
| select | 19 |
| textarea | 7 |
| table | 2 |
| dialog | 6 |
| details | 16 |
| button | 133 |
| progress | 0 |

Chi tiết từng file và export trong inventory.json. Các type date/time được nâng cấp tại control hiện có; không thêm Date/Time picker không phục vụ nghiệp vụ.

## Kế hoạch triển khai

1. Tokens nâu cà phê/ivory/olive, radius 8/12/16/22/24, khoảng cách 4–48, shadow nhẹ, focus ring và chuyển động 150–250 ms.
2. Chuẩn hóa input, textarea, checkbox/radio/switch, file/date/time input; nút primary/secondary/outline/ghost/icon/danger/loading.
3. Select dùng chung có popup, tìm kiếm khi danh sách dài, phím mũi tên/Enter/Escape, giữ native select cho FormData/required/automation.
4. Nâng cấp thẻ sản phẩm, hero, header/menu/search, breadcrumb, tabs, phân trang, modal/drawer, toast, alert, skeleton và accordion.
5. Nâng cấp trang auth/tài khoản/checkout/đơn/đổi trả/chính sách/phòng thử đồ; bảng và tất cả tab quản trị. Sidebar quản trị có biểu tượng và thu gọn.
6. QA desktop/laptop/tablet/mobile, reduced-motion; kiểm tra tính tương phản, overflow, console, dropdown và đầy đủ luồng catalog/CRUD/QR/COD. Dùng database QA riêng, giữ dữ liệu cửa hàng.

## Ràng buộc

Không tạo/lấy ảnh mới; giữ ảnh/font/360° và luồng dùng thử hiện hữu, AI vẫn để sau. Không cài thêm thư viện khi React/CSS/Lucide hiện có đáp ứng. Không thay đổi nghiệp vụ và database schema.
