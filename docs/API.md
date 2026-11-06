# API và quy tắc nghiệp vụ

Prefix `/api/v1`, Swagger `/api/docs`, JSON `/api/openapi.json`. Lỗi thống nhất `{code,message,fieldErrors?,requestId}`. HTTP 401 cần đăng nhập, 403 quyền/CSRF/email/reauth, 404 tài nguyên không thuộc chủ sở hữu cũng trả 404, 409 xung đột kho/trạng thái/key, 422 validation, 429 rate limit, 503 provider thiếu cấu hình/tạm lỗi. Không trả passwordHash, token, MFA secret, giá vốn hoặc ghi chú nội bộ qua DTO cửa hàng.

GET `/auth/csrf` nhận cookie và token. Mọi mutation cookie cần header `X-CSRF-Token`, cookie và `Origin` khớp APP_URL. Webhook có xác thực provider riêng. Swagger nên mở qua cổng frontend cùng origin. ADMIN có TOTP bắt buộc; các thao tác thu tiền, hoàn tiền, khóa khách, đối soát cần reauth trong 10 phút bằng POST `/auth/reauth`.

| Nhóm | Endpoint chính |
|---|---|
| auth | POST register, verify, login, logout, forgot, reset, password, reauth; GET csrf |
| me | GET/PATCH /me; sessions GET/DELETE; notifications; wishlist GET/POST/DELETE; recommendations |
| catalog | GET /config, /catalog, /products, /products/:slug |
| cart | GET/PATCH /cart, POST /cart/merge |
| checkout | POST /checkout/quote; POST /checkout với Idempotency-Key |
| orders | GET /orders, /orders/:id; POST /orders/:id/cancel |
| addresses | GET/POST /addresses; PATCH/DELETE /addresses/:id |
| shipping | GET /shipping/areas?type=province|district|ward&parent=... lấy từ GHN |
| reviews | POST /reviews (mỗi OrderItem một đánh giá đã giao) |
| returns | GET/POST /returns; GET /exchanges; POST /exchanges/:id/accept |
| webhooks | POST /webhooks/payos, /webhooks/ghn |
| admin | dashboard, orders/status/note/shipment/reconcile, products, inventory/adjust, data, settings, uploads, COD, returns, exchanges, refunds, jobs/retry, export.csv |

Catalog limit ≤48, page ≤100; q ≤100 ký tự; kết hợp size/color/material/fit/category/collection/style/season/min/max/stock, sort newest/price-asc/price-desc/bestseller/rating. Search text đã bỏ dấu, có pg_trgm index. Không cache tồn kho checkout. Dashboard cohort theo ngày tạo đơn, hiển thị thời gian Việt Nam; đây không phải báo cáo kế toán theo ngày phát sinh tiền mặt.

## Tính tiền

Tiền dùng Int PostgreSQL (VND), không float. Tổng = subtotal − goods discount + shippingFee − shippingDiscount + tax. Mặc định tax=0, shippingDiscount=0, không có phụ phí ẩn. Một coupon mỗi đơn, không cộng dồn. Scope sản phẩm và user kiểm tra backend; hạn, lượt tổng, lượt mỗi khách được kiểm soát transaction và khóa coupon row. Lượt dùng tiêu thụ tại tạo đơn, không tự trả lại sau hủy để tránh lạm dụng.

Giảm % làm tròn xuống trên tổng đủ điều kiện, chặn maxDiscount và giá trị đủ điều kiện. Phân bổ giảm theo tỷ lệ giá trị dòng bằng largest remainder, phần dư ưu tiên dòng theo thứ tự SKU xác định. Hoàn q sản phẩm từ dòng Q dùng floor((price*Q−discount)*q/Q); với nhiều lần hoàn, lần cuối cần đối soát phần dư để tổng hoàn không vượt giá trị dòng. Backend luôn chặn tổng Refund pending + completed so với received. Admin phải nêu chứng từ và kiểm tra phần tiền hàng/phí được hoàn.

## Đồng thời và worker

Serializable transaction retry cả Prisma P2034, unique race và PostgreSQL serialization/deadlock 40001/40P01 bọc P2010. Giữ kho UPDATE có điều kiện `onHand-reserved >= qty`. UNIQUE user/key; khác requestHash trả 409. Cùng key trả đơn cũ trước khi gọi provider. Snapshot giữ nguyên lịch sử kể cả sản phẩm/địa chỉ đổi sau này.

Reservation ACTIVE → CONSUMED khi xuất, ACTIVE → RELEASED khi hủy; journal reference unique. Order, Payment, Shipment có trạng thái riêng. Callback GHN chỉ kích hoạt API reconcile, không tin trạng thái công khai. Payment reference unique toàn cục; kiểm chữ ký SDK, orderCode, link nếu có, tiền, VND, code thành công. Webhook trùng trong transaction không nhân đôi received; đã PAID không bị event cũ ghi lùi, khoản bổ sung bất thường chuyển EXCEPTION giữ bằng chứng.

Worker quét deadline 30 giây: lookup provider, xử lý transactions, cancel link và lookup lại trước hủy. Provider lỗi → hoãn kết luận, không giải phóng khi chưa đối soát. Tiền đến sau khi hủy không tự khôi phục kho. QR link/hold dùng cùng expiresAt. COD chờ xác nhận quá 48 giờ tự hủy, đơn đã CONFIRMED được quản trị theo dõi.

Outbox cùng DB commit tránh mất tác vụ. BullMQ retry exponential, hoặc DB polling khi dev thiếu Redis. Job lease 120s, tối đa 8 lần trong outbox rồi FAILED, xem/làm lại từ Admin. Provider calls dùng mã đơn client ổn định, truy vấn đơn cũ trước retry tạo. Email có thể lặp trong cửa sổ crash sau SMTP gửi và trước đánh dấu DONE; dùng Message-ID ổn định, không tuyên bố exactly-once email. Stock/payment/refund state effects idempotent trong DB.

## Báo cáo

createdValue gồm mọi đơn tạo; sales chỉ tiền hàng của DELIVERED/COMPLETED sau ưu đãi. Refund lưu riêng goodsAmount/shippingAmount/taxAmount, tổng phải khớp amount ở database. netSales = sales + chênh lệch tăng giá đổi size đã giao − tiền hàng hoàn của các đơn đã ghi nhận sales; hoàn phí ship/thuế không giảm doanh số hàng hóa. Đơn hủy chưa ghi nhận doanh số không làm giảm netSales lần nữa khi hoàn tiền trả trước.

grossReceived gồm QR verified và COD carrier có chứng cứ; ExchangeReceipt trình bày riêng. bankCash = QR received + COD remitted + tiền bổ sung đổi size đã đối soát − carrier fees − completed refunds. COD collected/remitted/pending tách riêng. costOfGoods dựa snapshot, trừ giá vốn hàng đã QC và nhập lại, cộng giá vốn hàng thay thế đã giao. estimatedGrossMargin = netSales − costOfGoods, chưa gồm vận chuyển, marketing, vận hành và thuế, **không phải lợi nhuận ròng**. Báo cáo dùng cohort ngày tạo đơn/đề nghị đổi; chưa phải sổ kế toán theo ngày giá trị ngân hàng. Khoản tiền thừa/không khớp cần đối soát phân loại trước khi đưa vào báo cáo kế toán chính thức.

## Nguồn tích hợp chính thức

- Next.js: https://nextjs.org/docs/app/getting-started/installation
- NestJS: https://docs.nestjs.com/
- payOS SDK: https://payos.vn/docs/sdks/back-end/node/
- payOS API: https://payos.vn/docs/api/
- GHN: https://developer.ghn.dev/en/docs/getting-started/overview và https://api.ghn.vn/home/docs/detail?id=84
- Google Places: https://developers.google.com/maps/documentation/javascript/place-autocomplete-new

Hợp đồng provider còn cần xác nhận bằng tài khoản thật; adapter mock không phải sandbox nhà cung cấp.
