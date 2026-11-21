# Milo Polo — trưng bày và ảnh xoay quanh trục Y

> Cập nhật mới nhất: 10 mẫu đã mở bán, size S/M/L/XL, 20 chiếc/màu/size. Xem [báo cáo mở bán](../polo-sale-20261121/README.md). Nội dung dưới đây là hồ sơ thời điểm hiển thị bản trưng bày và tạo ảnh xoay, trước khi mở bán.

10 mẫu polo đã hiển thị trên shop local, đủ 4 màu mỗi mẫu. Mỗi màu có bộ ảnh xoay 24 góc, dùng logo ML theo bộ thiết kế đã duyệt. Đây là ảnh thiết kế AI; góc xoay mang tính minh họa, không phải bản quét hay mô hình 3D đo đạc.

Sản phẩm có nhãn **Mẫu trưng bày**, giá dự kiến và nút **Chưa mở bán**. Khách có thể chọn màu, xem ảnh trước/sau, kéo hoặc vuốt ngang để xoay áo. Size vẫn chưa chốt, tồn kho vẫn bằng 0. Giá vốn được giữ trong dữ liệu nội bộ.

## Xem trên website local

- [Danh mục Áo polo](http://localhost:3000/san-pham?category=ao-polo).
- [Bộ sưu tập Milo Polo](http://localhost:3000/san-pham?collection=milo-polo-studio-2026).
- [Mẫu Heritage Piqué](http://localhost:3000/san-pham/ml-polo-heritage-pique): chọn màu rồi bấm **Khám phá thiết kế 360°** hoặc bấm ảnh chính.
- Ở thẻ sản phẩm: di chuột ngang hoặc vuốt trên ảnh để xoay. Trong hộp xem 360° có nút trước/sau, xoay, phóng to, đặt lại và hỗ trợ phím mũi tên/Home.

Chỉ cập nhật mã nguồn, tài nguyên và database local; chưa đẩy GitHub hoặc triển khai lên máy chủ công khai.

## Bộ ảnh và nguồn tạo

- **40 bộ màu × 24 góc = 960 góc ảnh**, trong **160 PNG gốc**, mỗi PNG 1536×1024 với 6 ô ảnh 512×512.
- **480 WebP** phục vụ ảnh xoay trên thẻ/chi tiết và ảnh thu nhỏ. PNG gốc giữ nguyên; Sharp chỉ tạo bản phân phối, ảnh tổng hợp để rà soát và phân tích khung hiển thị.
- Công cụ tạo ảnh: **ImageGen tích hợp**. Prompt, ảnh tham chiếu, đường dẫn nguồn và SHA256 được lưu trong 40 hồ sơ `docs/photo-spin/ml-polo-*-polo-y-*-v1.json`.
- PNG trong `apps/web/public/collection-spin/ml-polo-*/polo-y-*-v1/part-0.png` đến `part-3.png`; WebP trong `apps/web/public/product-media/` với tên theo hash nội dung.
- Bốn nhóm góc danh nghĩa: 0–75°, 90–165°, 180–255°, 270–345°. Bộ xem dùng ảnh riêng của đúng mẫu/màu, giữ áo thẳng đứng quanh trục Y.
- Đã rà các nhóm ảnh gốc và contact sheet đủ 24 góc cho từng màu: cấu trúc cổ/tay/gấu, túi/khóa/kẻ/phối thân, logo ngực và logo gáy, độ che khuất tự nhiên, toàn thân áo nằm trong khung.
- Phân tích khung cho áo Breton cho phép nối tối đa 12 hàng ảnh bị ngắt bởi sọc sáng. Chỉ áp dụng theo cấu hình công việc đã rà soát; ảnh gốc không bị sửa.

Danh sách tài nguyên cụ thể và kết quả kiểm tra được ghi tại [verification.json](verification.json).

## Các thay đổi mã nguồn

| File | Nội dung |
|---|---|
| `apps/web/lib/product-preview.ts` — mới | Nhận diện mẫu trưng bày còn size nháp. |
| `apps/web/components/product-card.tsx` | Nhãn trưng bày, giá dự kiến, ẩn thử đồ với loại áo chưa hỗ trợ; tái sử dụng bộ xoay hiện có. |
| `apps/web/components/fashion-product.tsx` | Hiển thị tình trạng chưa chốt size; khóa mua mẫu; bỏ bảng size mẫu và Offer trong JSON-LD của mẫu trưng bày. |
| `apps/web/components/admin.tsx` | Thể hiện rõ trạng thái trưng bày/chưa mở bán. |
| `prisma/polo.ts` | Xuất bản bản trưng bày local và gắn 40 bộ xoay đã duyệt; giao dịch, kiểm tra quyền sở hữu thiết kế, tồn kho và ghi audit; chạy lặp giữ nguyên dữ liệu. |
| `package.json` | Lệnh `db:polo:publish-preview`. Không thay dependency. |
| `scripts/build-photo-spin-manifest.mjs` | Nhận diện thiết kế polo khi tạo manifest. |
| `scripts/register-photo-spin-color.mjs` | Tùy chọn nối khoảng hàng ngắn khi phân tích áo kẻ; mặc định giữ cách phân tích cũ. |
| `scripts/verify-photo-spins.ts` | Xác minh nguồn và tích hợp dữ liệu polo. |
| `scripts/smoke-polo-spins.mjs` — mới | Kiểm tra trình duyệt bằng dữ liệu shop thật, chỉ đọc; không tạo đơn hoặc sửa tồn. |
| `tests/polo-catalog.test.ts` | Kiểm tra nhận diện mẫu trưng bày và việc chuyển sang size thương mại. |
| `docs/photo-spin/approved.json`, `apps/web/content/photo-spins.json`, `apps/web/content/prepared-media.json` | Thêm 40 bộ xoay và mapping phân phối, giữ nguyên những bộ trước. |
| `docs/polo-20261121/README.md` | Trỏ đến trạng thái mới, giữ hồ sơ đợt tạo nháp ban đầu. |

## Dữ liệu và khôi phục

Đã tạo bản sao lưu logic trước thay đổi tại `.local/polo-spin-20261121/database-before.rows.json.gz`, kiểm tra đọc lại thành công: 42 bảng, 5.809 hàng. Đây là bản sao hàng dữ liệu theo schema hiện có, chưa chứng minh khả năng phục hồi toàn máy chủ.

Đối chiếu sau cập nhật cho phép đúng các trường hiển thị/mô tả/metadata của 10 polo, cờ hiển thị của 40 SKU nháp và ảnh/cờ hiển thị của một bộ sưu tập. Giá, giá vốn, ID, ảnh trước/sau, tồn kho, đơn hàng và các bảng còn lại giữ nguyên. Audit chỉ thêm 10 sự kiện hiển thị mẫu, 1 sự kiện bộ sưu tập và 10 sự kiện gắn ảnh xoay.

Muốn quay lại trạng thái cũ, dùng bản sao riêng tư để khôi phục có chọn lọc các trường đã thay đổi của đúng các ID polo/bộ sưu tập trong giao dịch, sau khi đối chiếu dữ liệu mới phát sinh. Giữ nguyên log và tài nguyên đã tạo. Việc khôi phục dữ liệu cần được chủ cửa hàng xác nhận trước khi thực hiện.

## Kiểm tra

Các phép kiểm tra đã hoàn tất và giới hạn của chúng được ghi trong [verification.json](verification.json). Ảnh màn hình thực tế nằm trong [previews](previews/). Các log chạy và bản đối chiếu chi tiết được giữ riêng tại `.local/polo-spin-20261121/`.

Kết quả: **54 bài kiểm thử**, typecheck toàn dự án và production build đều đạt. Đã kiểm tra 640 đường dẫn ảnh mới, 320 tư thế trên thẻ + 320 tư thế trong hộp xem ở hai kích thước màn hình, 80 thao tác vuốt, hai vòng đủ 24 khung, phóng to/đặt lại, khóa mua mẫu và hành vi size của Tee đang có. Không ghi nhận lỗi JavaScript hoặc ảnh lỗi trong lượt browser này. Lệnh xuất bản chạy lặp trả về `changed: 0`.

Lệnh tái kiểm tra trên shop local đang chạy:

```powershell
npm test
npm run typecheck
npm run assets:photos:verify
$env:PLAYWRIGHT_BASE_URL='http://localhost:3000'
node scripts/smoke-polo-spins.mjs
```

Ảnh 360° bổ sung cho nhóm polo. Các nhóm áo khác vẫn có tình trạng phủ ảnh riêng; báo cáo này không xác nhận toàn catalog đã đủ mọi màu.
