# Quản lý kho MiloShopHand — 19/11/2026

Vào **Admin → Tồn kho** tại `http://localhost:3000/admin`. Giao diện và API sử dụng PostgreSQL thực, tái sử dụng Product, ProductVariant, Inventory, InventoryReservation và StockMovement; không tạo kho hoặc bảng sản phẩm trùng lặp.

## Giao diện và cách dùng

- Năm thẻ thống kê toàn bộ kho MAIN: số sản phẩm, tổng tồn thực tế, sản phẩm có SKU sắp hết, sản phẩm không còn SKU nào có thể bán, số SKU màu/size.
- Bảng sản phẩm có ảnh, tên, SKU, tổng từng size, tồn thực tế, đã bán, trạng thái và thao tác. Bấm tên để mở toàn bộ màu/size ngay bên dưới.
- Mỗi SKU hiển thị tồn thực tế, đang giữ, có thể bán, đã bán, ngưỡng cảnh báo; hỗ trợ nhập, xuất và chỉnh sửa.
- Nhập/xuất từ thanh công cụ cho phép chọn sản phẩm và SKU trong dropdown có tìm kiếm khi danh sách dài. Các nút trên dòng tự chọn sẵn sản phẩm/SKU.
- Modal có nút +/−, số lượng nguyên, lý do bắt buộc, Hủy, bước kiểm tra tồn trước/sau và xác nhận lưu. Sau lưu, bảng/thống kê được tải lại và thông báo kết quả.
- Tìm tiếng Việt có/không dấu hoặc mã SKU; kết hợp lọc size/trạng thái, sắp xếp theo tồn thực tế, phân trang 10/20/50 sản phẩm. Bộ lọc chọn sản phẩm có SKU phù hợp; bảng mở rộng vẫn giữ đủ màu/size của sản phẩm.
- Lịch sử có phân trang, lọc sản phẩm/loại giao dịch, thời gian Việt Nam, sản phẩm/SKU, màu/size, lượng thay đổi, tồn trước/sau, tên người thực hiện và ghi chú.
- Dùng theme Modern Vintage hiện có, Lucide, Select dùng chung và AdminDialog được tách từ modal cũ để tái sử dụng cho toàn bộ Admin. Bảng cuộn trong vùng riêng trên màn hình nhỏ; có trạng thái tải, rỗng, lỗi và hỗ trợ reduced motion.

## Ý nghĩa số liệu

- **Tồn thực tế** = `Inventory.onHand`.
- **Đang giữ** = `Inventory.reserved` cho đơn/đổi size đang xử lý.
- **Có thể bán** = `onHand - reserved`. Đỏ khi bằng 0; cam khi lớn hơn 0 nhưng không vượt `lowThreshold`; xanh khi vượt ngưỡng. Một sản phẩm có thể đồng thời có size còn hàng và size hết hàng.
- **Đã bán** = tổng lượng xuất theo đơn giao vận (movement `SALE`), chưa trừ hàng hoàn và không cộng hàng thay thế đổi size. Không dùng doanh số dự đoán hoặc dữ liệu giả.
- Thẻ thống kê không bị giới hạn bởi bộ lọc hoặc trang đang xem. SKU bao gồm cả màu và size; tồn từng size ở dòng sản phẩm cộng qua các màu, khi mở rộng tách từng SKU.

## API

Mọi endpoint dưới đây yêu cầu ADMIN; mutation giữ CSRF/Origin như các chức năng hiện tại.

| Endpoint dưới `/api/v1` | Chức năng |
|---|---|
| GET `/admin/inventory/overview` | `q`, `size`, `status=IN_STOCK/LOW/OUT`, `sort=name/stock-asc/stock-desc`, `productId`, `page`, `pageSize≤50`; trả sản phẩm/biến thể và thống kê |
| GET `/admin/inventory/options` | Danh sách tên/id sản phẩm trong MAIN để chọn giao dịch |
| GET `/admin/inventory/history` | `productId`, `inventoryId`, `kind`, `page`, `pageSize≤50` |
| POST `/admin/inventory/:id/movements` | Nhập/xuất/điều chỉnh theo inventory ID |
| GET `/admin/inventory` | API danh sách cũ được giữ để tương thích |
| POST `/admin/inventory/:id/adjust` | API delta cũ được giữ, sử dụng cùng transaction và ledger |

Payload mới:

```json
{
  "operation": "RECEIPT",
  "quantity": 3,
  "expectedOnHand": 15,
  "reason": "Nhập bổ sung từ nhà cung cấp",
  "key": "một UUID riêng cho giao dịch"
}
```

`RECEIPT` tăng, `ISSUE` giảm theo số lượng dương; `ADJUSTMENT` đặt số tồn thực tế đích (cho phép 0 nếu không có hàng giữ). Số lượng tối đa 100.000 mỗi thao tác. Lý do 5–1.000 ký tự. Gửi lại cùng key/nội dung trả giao dịch cũ; thay nội dung với key cũ trả 409. UI giữ cùng key khi thử lại sau lỗi mạng.

Giao dịch dùng Serializable transaction, khóa dòng Inventory, kiểm tra `expectedOnHand`, ghi StockMovement và AuditLog cùng commit. Tồn thay đổi từ khi mở form trả `STOCK_CHANGED`; xuất/kiểm kê thấp hơn hàng đang giữ trả `INVALID_STOCK`. Không ghi dữ liệu khi kiểm tra thất bại.

## Database và luồng đơn

Migration cộng thêm `kind`, `onHandBefore`, `onHandAfter`, `requestHash` và index lịch sử vào StockMovement. Trigger PostgreSQL ghi mốc tồn chính xác khi chèn movement sau cập nhật Inventory trong cùng transaction. Cách này bao phủ cả nhập/xuất thủ công, giữ/xuất theo đơn và nhập lại sau QC mà không thay đổi quy trình đơn hàng.

Luồng hiện có được giữ: tạo đơn tăng reserved; xác nhận/đóng gói chưa giảm onHand; SHIPPED giảm onHand và reserved đúng một lần, dựa trên trạng thái reservation và reference duy nhất. Hủy giải phóng hàng giữ; hàng hoàn chỉ nhập lại sau QC đạt.

Nhật ký trước migration chưa có mốc tồn chính xác nên giữ NULL và hiển thị “—”, không suy đoán tồn lịch sử. `kind` của các giao dịch cũ được phân loại từ reference. Snapshot chỉ áp dụng cho giao dịch mới; mọi dữ liệu tồn và lịch sử cũ được giữ.

Database chính đã được backup trước migration tại `.local/backups/milo-2026-11-18T18-29-08-271Z.dump`. Migration đã áp dụng cho database chính và hai database QA. Không seed dữ liệu thử nghiệm vào database cửa hàng.

## File và thư viện

- API: `apps/api/src/inventory.ts`, `admin.ts`, `main.ts`, `openapi.ts`.
- UI: `apps/web/components/inventory.tsx`, `components/ui/admin-dialog.tsx`, `components/admin.tsx`, `app/inventory.css`, `app/layout.tsx`.
- Database: `prisma/schema.prisma`, `prisma/migrations/202611190009_inventory_ledger/migration.sql`.
- Kiểm thử: `tests/inventory.integration.test.ts`, `tests/e2e/inventory.spec.ts`, điều chỉnh runner integration và kiểm tra điều hướng Admin hiện có.
- Tài liệu: báo cáo này, README, API và Architecture.

Sử dụng NestJS, Prisma/PostgreSQL, Zod, Next.js/React, CSS variables, Lucide, Playwright hiện có. Không cài thư viện mới, không lấy/tạo ảnh mới.

## Kiểm chứng

Đã hoàn tất bàn giao ngày 19/11/2026. [Báo cáo tổng hợp có thể đọc bằng máy](inventory/verification.json) tách kết quả triển khai lúc 01:46–01:47 khỏi kiểm tra chỉ đọc khi tiếp tục bàn giao lúc 10:37 (giờ Việt Nam).

- TypeScript: chạy lại `npm run typecheck`, API/worker/web đều đạt.
- Integration: 29/29 đạt ở lần triển khai trước khi tạm dừng, trên `milo_integration_test`, Redis DB1. Bao gồm quyền USER/Admin/CSRF, tổng hợp toàn bộ SKU, lọc/phân trang, nhập/xuất/kiểm kê, lưu trùng, xung đột tồn, hai thao tác cạnh tranh, lịch sử và luồng đơn xuất một lần; các kiểm thử checkout/QR/COD/hoàn/đổi hiện có tiếp tục đạt. Không chạy lại integration trong bước bàn giao chỉ cập nhật tài liệu.
- Production frontend build: đạt; artifact `apps/web/.next-redesign-production/BUILD_ID` được tạo lúc 01:46:50 ngày 19/11/2026.
- Chromium: đối chiếu báo cáo Playwright được lưu từ lần chạy lúc 01:46:59, **14/14 đạt**, 0 lỗi, 0 flaky, 0 bỏ qua, khoảng 58 giây. Gồm 3 bài kho, 1 bài đăng nhập Admin không OTP, 6 bài Modern Vintage và 4 bài cửa hàng (bao gồm mua COD/QR). Chạy trên `milo_redesign_test`, Redis DB2, web 3100/API 4100; frontend dùng production build, các adapter thanh toán/vận chuyển là mô phỏng phát triển.
- Kiểm tra trực quan: đã xem đủ sáu ảnh ở dưới, gồm desktop 1280/1440 px, tablet 768 px, mobile 360 px, bảng mở rộng, lịch sử và xác nhận nhập kho. Trang không tràn ngang trong các kiểm tra tự động; bảng có vùng cuộn ngang riêng để xem các cột còn lại. Hỗ trợ reduced motion; kiểm thử kho không ghi nhận lỗi JavaScript/console ngoài phản hồi xung đột 409 được chủ động tạo trong bài kiểm tra.
- Khôi phục và đối chiếu checksum đủ 26 ảnh QA lịch sử đã có trước đợt kho. Chín ảnh hồi quy mới được giữ riêng trong `.local/inventory/regression-screenshots`.
- Kiểm tra chỉ đọc database chính `milo`: **90 sản phẩm, 1.520 SKU và 1.520 dòng kho MAIN**, migration ledger đã hoàn tất. Không có fixture `inventory-*`; không có số tồn âm, số giữ âm hoặc số giữ vượt tồn thực tế. Không seed/điều chỉnh tồn cửa hàng trong bước bàn giao.
- Đã mở lại PostgreSQL/Redis (healthy) và API/web/worker ở chế độ phát triển. Trang chủ, Admin và API config trả 200; ba API đọc kho qua cùng origin trả đúng 401 khi chưa đăng nhập. Có thể sử dụng tại `http://localhost:3000/admin` → **Tồn kho**.

Để chạy lại bộ kiểm thử production đã nghiệm thu (cần Docker PostgreSQL/Redis hoạt động):

```powershell
npm run test:e2e:production -- tests/e2e/inventory.spec.ts tests/e2e/admin-login.spec.ts tests/e2e/modern-ui.spec.ts tests/e2e/shop.spec.ts
```

### Ảnh nghiệm thu

Ảnh dưới đây dùng fixture trong database QA riêng; số liệu trong ảnh không phải số tồn của cửa hàng. Ảnh giao diện kiểm thử được lưu nguyên bản, không chỉnh sửa.

- [Bảng màu/size desktop 1440 px](inventory/previews/inventory-expanded-1440.png)
- [Bảng màu/size tablet 768 px](inventory/previews/inventory-expanded-768.png)
- [Bảng màu/size mobile 360 px](inventory/previews/inventory-expanded-360.png)
- [Tồn sau các thao tác nhập/xuất/kiểm kê](inventory/previews/inventory-expanded-desktop.png)
- [Lịch sử nhập kho, tồn trước/sau và người thực hiện](inventory/previews/inventory-history-desktop.png)
- [Xác nhận nhập kho sau khi xử lý xung đột tồn](inventory/previews/inventory-confirmation.png)

Giới hạn: một kho MAIN theo kiến trúc hiện tại; chưa bổ sung quản lý đa kho hoặc báo cáo giá trị kế toán. Nhật ký cũ không có snapshot trước/sau như đã nêu. Kiểm thử tự động bằng Chromium, chưa kiểm tra trên thiết bị iOS/Android thật.
