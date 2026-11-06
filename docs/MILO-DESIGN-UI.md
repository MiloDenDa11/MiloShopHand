# Milo Design — cập nhật UI/UX ngày 06/11/2026

Đã cập nhật trực tiếp tại bản Desktop. Nút, lựa chọn màu/size, ô nhập liệu, dialog và khung ảnh được bo tròn; giữ font và bố cục vintage magazine. Nền SVG có hoa, lá và cỏ tông nhạt, bố trí quanh khoảng trống và chân trang. SVG không thêm vòng render hoặc thư viện hoạt ảnh.

Nhãn hiển thị trên trang chủ, danh sách, bộ lọc, chi tiết, gallery, gợi ý và trình sửa nội dung quản trị được chuẩn hóa thành **Milo Design**. Mô tả SEO và chữ thay thế của ảnh cũng dùng tên này. Dữ liệu nguồn/provenance được giữ nguyên; không sửa hàng loạt database chỉ để đổi nhãn.

## Đổi màu và chuyển động

- Có ảnh đúng màu thì ưu tiên ảnh đó. Khi chưa có ảnh màu riêng, URL mang công thức phối màu `miloColor`/`baseColor`, không ghi đè asset gốc. Gallery, giỏ hàng và ảnh snapshot đơn mới đều giữ công thức này.
- Preview lớn tải Three.js theo nhu cầu. Shader đổi màu vùng vải trên ảnh gốc, giữ sáng tối/nếp vải và tạo tương phản cho logo; đây là lớp ảnh trên mặt phẳng, không dựng lại hình học áo. Phối màu này có nhãn “Phối màu … xem trước”.
- Preview nhỏ hoặc thiết bị không có WebGL dùng một lượt Canvas 2D. Chỉ khởi tạo khi ảnh ở trong vùng nhìn; giải phóng texture/context khi rời vùng nhìn. Chuyển màu dùng `MathUtils.damp`, ngừng render khi ổn định hoặc tab bị ẩn.
- Xoay áo tiếp tục dùng bộ ảnh 24 góc thật đã duyệt, đứng thẳng theo Oy. Nội suy góc bằng toán Three.js và hòa hai góc ảnh kế tiếp; không xoay một ảnh phẳng để giả 360°. Tôn trọng reduced motion. Màu thiếu bộ ảnh riêng vẫn báo đang cập nhật, không mượn ảnh xoay màu khác.
- Khóa các nút màu trong thời gian hydrate ban đầu để tránh mất lần bấm đầu tiên.

## Xác minh

| Kiểm tra | Kết quả |
| --- | --- |
| TypeScript | Qua |
| Build cuối cùng của shared/API/worker/web | Qua; `npm run build`, đủ 17 trang Next |
| Unit/media/đồng bộ | 24/24 qua |
| API integration | 25/25 qua, PostgreSQL `milo_integration_test`, Redis DB 1 |
| Playwright trên production build | 35/35 qua, PostgreSQL `milo_redesign_test`, Redis DB 2 |
| Kiểm tra UI sau tinh chỉnh mask/caption | 4/4 qua trên preview development |
| Rà trực tiếp 4 loại áo × đen/trắng/đỏ mận | 12/12 preview Three.js sẵn sàng, không có page error hoặc hydration warning trong lượt cuối |
| Phân tích vùng vải trên dữ liệu hiện tại | 87 nguồn ảnh cần phối màu đều có mask hợp lệ; 3 sản phẩm còn lại đã có ảnh đủ màu |
| Đối chiếu dữ liệu thương mại chính | Giữ nguyên 90 sản phẩm, 1.520 SKU/tồn kho, 4 đơn và 8 tài khoản |

Playwright kiểm tra kích thước 360/768/1440px, nhãn và nút, màu thực tế trong pixel ảnh, WebGL/Canvas fallback, reduced motion, xoay ảnh, thêm giỏ và checkout. Bộ 35 bài production chạy trước lượt tinh chỉnh cuối của mask logo/caption; sau đó đã chạy lại 4 bài liên quan và rà hình ảnh cả bốn loại áo. Không dùng database hoặc Redis chính cho kiểm thử ghi dữ liệu.

Ảnh rà UI ở `.local/photo-spin/milo-ui-<slug>-<white|black|burgundy>.png`, ảnh danh sách ở `.local/photo-spin/milo-ui-catalog.png`; kết quả ở `.local/photo-spin/milo-ui-report.json` và `colour-mask-audit.json`. Đây là tệp QA cục bộ, không phải asset sản phẩm mới.

Không có migration hoặc seed trên database chính trong đợt UI này. PostgreSQL/Redis Docker và volume hiện tại được giữ. Số asset xoay gốc vẫn là **48 bộ × 24 góc, thuộc 37 thiết kế**; phối màu thời gian chạy không được tính thành ảnh gốc hoặc bộ 360 mới. Xem [phạm vi ảnh xoay và phần còn thiếu](PHOTO-SPIN.md).
