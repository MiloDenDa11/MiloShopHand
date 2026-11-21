# Milo Polo — mở bán ngày 21/11/2026

Đã mở bán **10 mẫu polo, mỗi mẫu 4 màu, đủ size S/M/L/XL**, theo xác nhận của chủ cửa hàng: **20 chiếc cho từng tổ hợp mẫu × màu × size**. Tổng cộng **160 SKU bán hàng và 3.200 chiếc tồn ban đầu**.

[Xem danh mục Áo polo trên shop local](http://localhost:3000/san-pham?category=ao-polo).

## Trạng thái sau mở bán

- Bỏ nhãn trưng bày và giá dự kiến; sản phẩm có nút **Thêm vào giỏ hàng** và **Mua ngay**.
- Giá bán hiện tại được giữ nguyên trong khoảng **500.000–600.000đ**. Giá vốn được giữ nguyên trong dữ liệu nội bộ.
- Mỗi mẫu có 16 SKU đang bán; 4 SKU giữ chỗ cũ được ngừng bán, bảo toàn ID và dữ liệu lịch sử.
- Giữ nguyên 80 tham chiếu ảnh trước/sau và 40 bộ ảnh xoay theo màu, mỗi bộ 24 góc.
- JSON-LD của sản phẩm có Offer, giá và tình trạng còn hàng.

Đây là cập nhật trên mã nguồn và database local đang chạy. Chưa đẩy GitHub hoặc triển khai lên máy chủ công khai.

## Dữ liệu và khả năng chạy lặp

Lệnh mở bán kiểm tra đủ thiết kế, ảnh đã duyệt, giá hiện tại và trạng thái tồn kho nháp. Toàn bộ chuyển đổi nằm trong một giao dịch Serializable có khóa chung với lệnh tạo/hiển thị polo.

Đã thêm 160 dòng tồn kho, 160 bút toán khởi tạo kho và 10 audit log mở bán sản phẩm. Giá, giá vốn, các ID cũ, ảnh, dữ liệu khách hàng, đơn hàng và các sản phẩm khác được giữ nguyên. Đối chiếu **42 bảng** với bản sao trước cập nhật đã đạt.

Chạy lặp cùng cấu hình trả về `changed: 0`, `createdVariants: 0`, `initializedStockUnits: 0`; không nhập thêm hàng hoặc đặt lại tồn sau giao dịch phát sinh. Thay đổi tồn kho tiếp theo dùng chức năng quản lý kho hiện có. Lệnh hiển thị bản trưng bày từ chối đưa sản phẩm đang bán trở lại trạng thái nháp.

Bản sao lưu riêng tư trước mở bán: `.local/polo-sale-20261121/launch/database-before.rows.json.gz`, gồm **42 bảng / 5.833 hàng**, đã kiểm tra đọc lại. Đây là bản sao hàng dữ liệu theo schema hiện có; chưa kiểm thử phục hồi toàn máy chủ. Các thao tác khôi phục cần được đối chiếu với phát sinh sau mở bán trước khi thực hiện.

## Các file liên quan

| File | Thay đổi |
|---|---|
| `prisma/polo-sale.json` — mới | Cấu hình đã xác nhận: S/M/L/XL, 20 chiếc/màu/size. |
| `prisma/polo.ts` | Lập kế hoạch và mở bán theo cấu hình; xác minh nguồn ảnh; tạo SKU/kho/sổ kho/audit trong giao dịch; bảo vệ chạy lặp và ngăn chuyển ngược về trưng bày. |
| `package.json` | Lệnh `db:polo:publish-sale` dùng cấu hình đã xác nhận. |
| `tests/polo-catalog.test.ts` | Kiểm tra size/tồn kho bắt buộc, SKU duy nhất, định danh cấu hình và chặn database ngoài phạm vi local. |
| `scripts/smoke-polo-sale.mjs` — mới | Kiểm tra API, size, giá, giỏ khách và điều hướng thanh toán ở desktop/mobile. Chặn việc tạo đơn hoặc thanh toán trong bài kiểm tra. |
| `scripts/smoke-polo-spins.mjs` | Hỗ trợ cả trưng bày và sản phẩm đang bán; chụp ảnh kiểm tra với `caret: 'initial'` để giữ nguyên thuộc tính input trong lúc React hydrate. |
| `docs/polo-20261121/README.md`, `docs/polo-spin-20261121/README.md` | Trỏ tới trạng thái mở bán mới, giữ nguyên hồ sơ kiểm tra lịch sử. |

Không thay dependency, schema database hoặc nghiệp vụ đặt hàng/thanh toán.

## Kiểm tra đã hoàn tất

- **57 bài kiểm thử** và **typecheck API/worker/web** đều đạt.
- API trả về 10 sản phẩm đang bán, 160 SKU đúng màu/size, mỗi SKU có thể bán 20 chiếc; tổng 3.200. Không trả giá vốn ra API công khai.
- **320 lượt chọn màu/size** trên desktop và mobile: nút thêm giỏ và mua ngay hoạt động, không còn trạng thái chưa mở bán.
- **20 lượt thêm sản phẩm vào giỏ khách**: đúng ID biến thể, tên, màu, size, giá và ảnh.
- Điều hướng **Mua ngay → Thanh toán** đạt; không tạo đơn, giữ kho hoặc thực hiện thanh toán thật.
- Không ghi nhận lỗi JavaScript/hydration hoặc ảnh 404 trong lượt kiểm tra cuối.
- Chạy lặp lệnh mở bán giữ nguyên dữ liệu và không cộng thêm tồn.
- Đối chiếu trước/sau 42 bảng: chỉ có những thay đổi mở bán và nhập kho nêu trên.

Chi tiết: [verification.json](verification.json). Ảnh thực tế: [desktop](previews/catalogue-desktop.png), [mobile](previews/detail-mobile.png).

Lượt kiểm tra đầu đã thực hiện đủ thao tác mua nhưng công cụ chụp ảnh tự chèn `caret-color: transparent` vào input, gây cảnh báo hydrate khi ranh giới React đang tải. Đã chỉnh cấu hình chụp ảnh để giữ nguyên caret và chạy lại; lượt cuối đạt, không thay mã ứng dụng để che cảnh báo này.

Các kiểm tra chạy trên Chromium desktop và mobile mô phỏng. Chưa thử trên thiết bị vật lý hoặc thanh toán với nhà cung cấp thật. Số lượng 20/SKU trong báo cáo là tại thời điểm mở bán; giao dịch sau đó sẽ làm thay đổi tồn theo nghiệp vụ hiện có.

## Lệnh sử dụng

```powershell
# Xem kế hoạch, không ghi database
npx tsx prisma/polo.ts --plan-sale --sale-config prisma/polo-sale.json

# Mở bán lần đầu; chạy lại cùng cấu hình giữ nguyên dữ liệu
npm run db:polo:publish-sale

# Kiểm tra cấu hình và luồng giao diện tại thời điểm mở bán
node scripts/smoke-polo-sale.mjs
```
