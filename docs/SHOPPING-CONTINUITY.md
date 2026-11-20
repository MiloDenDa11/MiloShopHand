# Hoàn thiện luồng mua sắm — 17/11/2026

Thực hiện tại `C:\Users\LOQ\OneDrive\Desktop\MiloShopHand`, là bản làm việc chính theo README và các cập nhật sau lần đồng bộ từ ổ D. Giữ các cập nhật ảnh, font, Milo Design và bộ xoay hiện có; không đồng bộ đè source từ ổ D.

## Thay đổi

**Yêu thích khớp dữ liệu đã lưu.** Trước đây mỗi thẻ luôn khởi tạo trái tim ở trạng thái chưa lưu. Sau reload, người dùng có thể thấy sai trạng thái hoặc gửi thêm một yêu cầu lưu thay vì bỏ lưu. Nay Providers chia sẻ một danh sách ID đọc từ `/me/wishlist`, gộp request đang chạy, cập nhật tất cả thẻ sau khi API thành công. Các yêu cầu lặp trên cùng sản phẩm đang xử lý được chặn. Đăng xuất/đổi tài khoản không hiển thị danh sách của người trước; không lưu danh sách riêng tư vào localStorage. Nếu lần đọc ban đầu lỗi, thao tác sau sẽ thử đọc lại trước khi quyết định thêm hay xóa.

**Giữ màu từ danh sách đến giỏ.** Các đường dẫn ảnh, tên và nút chi tiết trên thẻ mang `?color=` theo màu đã chọn. Trang chi tiết nhận màu qua server, kiểm tra màu thuộc các biến thể rồi khởi tạo đúng lựa chọn; tải lại vẫn giữ màu. Query không hợp lệ trở về màu hợp lệ đầu tiên. Màu trong query không quyết định giá hoặc tồn kho: giỏ tiếp tục gửi ID biến thể và backend kiểm tra như trước. Canonical sản phẩm vẫn là URL không có query.

**Ảnh lỗi và xem phóng to.** Gallery/thẻ không tạo nút thử lại bên trong một nút hoặc liên kết khác. Ảnh không tải được có thông báo; cửa sổ phóng to có nút thử lại độc lập. Component kiểm tra cả ảnh SSR bị lỗi trước khi React gắn `onError`, tránh để lại khung ảnh hỏng mà không có trạng thái lỗi. Mở ảnh phóng to khóa cuộn nền, Escape/đóng/unmount khôi phục lại trạng thái cuộn.

**Đổi biến thể trong giỏ.** Chọn lại biến thể hiện tại không cộng đôi số lượng. Nếu API lưu giỏ thất bại, giao diện không phát thêm thông báo đổi thành công. Ảnh giỏ được chọn với chính biến thể vừa xác nhận.

## Kiểm tra

- `npm test`: **28/28** đạt, gồm nghiệp vụ, media, xoay ảnh, palette, cấu hình local, hình học và đồng bộ. Bổ sung kiểm thử mã hóa màu URL, giữ đúng màu và fallback cho màu không tồn tại.
- `npm run typecheck`: đạt cho API, worker và web.
- Production web build: đạt qua `scripts/redesign-preview.mjs --production --test`, dùng thư mục build riêng `.next-redesign-production`.
- `npm run build` tại root: đạt cho shared, API, worker và web; bản `.next` thông thường cũng đã được cập nhật, không chỉ bản QA.
- Bốn E2E mới đã đạt trên development: màu từ thẻ → chi tiết → reload → chọn size → giỏ; URL màu sai; yêu thích giữ sau reload và tách hai tài khoản; chặn tải ảnh rồi phục hồi, thử lại, Escape và kiểm tra không có lỗi lồng nút/hydration.
- Toàn bộ E2E production: **43/43** đạt, gồm kiểm tra ảnh/360°, font, responsive, phân trang, tính mới của dữ liệu SSR, COD/QR mock, Admin và bốn tình huống mới.
- Đối chiếu trước/sau bằng số bản ghi và checksum trên các bảng Product, ProductVariant, ProductImage, Inventory, Order, OrderItem, User, Wishlist: **không thay đổi**. Database chính vẫn có 90 sản phẩm, 1.520 biến thể, 204 ảnh gallery, 1.520 dòng tồn kho, 4 đơn và 10 tài khoản. Snapshot đối chiếu ở `.local/continuation-20261117/`, không chứa trong Git.
- Kiểm tra diff: không sửa API, worker, Prisma/schema/migration/seed, infra, shared, package manifest hoặc lockfile. Không thực hiện seed/migrate vào database chính.

Kiểm thử mới sử dụng sản phẩm/ảnh hiện có. Chỉ chặn request ảnh trong kịch bản mất mạng; không gắn ảnh giả hay sửa dữ liệu sản phẩm để tạo ảnh lỗi. Các tài khoản/wishlist/giỏ thử nằm trong database `milo_redesign_test`, Redis DB 2. Database cửa hàng chỉ được đọc để đối chiếu trước/sau.

## Chạy lại

```powershell
cd C:\Users\LOQ\OneDrive\Desktop\MiloShopHand
npm run infra:up
npm run dev
```

Cửa hàng: <http://localhost:3000>. Hạ tầng PostgreSQL/Redis dùng Docker và volume hiện có; không cần migrate/seed lại database cửa hàng cho thay đổi frontend này.

Kiểm tra độc lập bằng production web và dịch vụ QA:

```powershell
npm run test:e2e:production
# Chỉ chạy các tình huống mới:
node scripts/redesign-preview.mjs --production --test tests/e2e/shopping-continuity.spec.ts
```

QR và giao hàng trong QA vẫn là mock. Các điều kiện còn cần tài nguyên/tài khoản thật như payOS, GHN, Google Maps, SMTP và font Baket Fashion không thay đổi trong đợt này. Không tạo ảnh mới, không thay font hoặc nguồn media hiện có.
