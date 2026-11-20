# Phòng thử đồ AI — 18/11/2026

Đã triển khai giai đoạn trải nghiệm của tính năng **Dùng thử sản phẩm với AI**, theo yêu cầu để phần tạo ảnh AI lại sau. Không gọi ImageGen, không lấy thêm ảnh catalog và không tích hợp API tạo ảnh trong tính năng này.

## Những gì đã xác minh từ dự án

- Storefront dùng Next.js App Router/React; API NestJS, PostgreSQL/Prisma và worker outbox/BullMQ đã có.
- Catalog hiện có bốn nhóm áo: áo phông, hoodie, áo khoác, bomber. Chưa có danh mục phụ kiện để chứng minh khả năng dùng thử phụ kiện.
- Trước thay đổi này, thẻ sản phẩm và trang chi tiết chưa có nút dùng thử. Hai điểm vào này nay đều có liên kết đến `/dung-thu/<slug>`.
- Màu và size thuộc SKU hiện hữu. Ảnh một màu khác không được dùng làm đầu vào thay cho màu đang chọn. Ảnh trong catalog hiện tại là ảnh mô phỏng thiết kế; tính năng không gọi chúng là ảnh hàng hóa chụp thật.

## Trải nghiệm đã thực hiện

1. **Chọn sản phẩm:** bấm Dùng thử trên thẻ hoặc trang chi tiết; URL mang đúng slug, màu và size nếu đã chọn. Màu hoặc size không hợp lệ được bỏ qua. Quay về sản phẩm giữ lựa chọn hiện tại.
2. **Ảnh của bạn:** chọn từ thiết bị, kéo thả hoặc dùng tùy chọn chụp ảnh của trình duyệt trên thiết bị hỗ trợ. Hướng dẫn một người, rõ mặt và phần thân trên, đủ sáng, không che vùng áo. Ảnh chân dung có chế độ riêng, giải thích vóc dáng trong kết quả tương lai có thể do AI mô phỏng.
3. **Kiểm tra ảnh:** chấp nhận JPG/PNG/WebP, tối đa 8 MB; kiểm tra chữ ký nội dung, khả năng giải mã, mỗi cạnh ít nhất 512 px và tổng không quá 32 megapixel. Hiển thị lỗi và cho chọn lại. Chưa có phân tích AI xác nhận số người, độ rõ mặt hay tư thế.
4. **Xác nhận:** đặt ảnh cá nhân và ảnh đúng màu sản phẩm cạnh nhau. Checkbox đồng ý không được chọn sẵn. Thay ảnh/màu/size/chế độ hủy xác nhận trước đó. Màu chưa có ảnh riêng hoặc nhóm chưa hỗ trợ không được đi tiếp.
5. **Kết quả:** có khu vực kết quả với trạng thái **chưa có ảnh kết quả** và nút tạo ảnh bị khóa, ghi rõ AI sắp ra mắt. Không giả xử lý, không đưa ảnh có sẵn vào vị trí kết quả cá nhân hóa. Chưa có ảnh kết quả để phóng to hoặc tải xuống.
6. **Tiếp tục mua sắm:** đổi ảnh, đổi màu, chọn sản phẩm khác, xem bảng size hoặc thêm đúng SKU còn hàng vào giỏ hiện hữu. Tính năng không xác định size từ ảnh. Size không bắt buộc để chuẩn bị dùng thử nhưng bắt buộc khi thêm vào giỏ.

Giao diện dùng tiếng Việt, giữ tông giấy/olive và kiểu chữ hiện tại, hỗ trợ màn hình nhỏ và thao tác bàn phím. Trang dùng thử không được lập chỉ mục tìm kiếm.

## Ảnh cá nhân ở giai đoạn này

Ảnh chỉ tồn tại trong bộ nhớ của trang và URL `blob:` nội bộ trình duyệt. Không tải lên backend, không lưu localStorage/sessionStorage, không gắn vào giỏ hay đơn hàng, không ghi vào cơ sở dữ liệu. URL ảnh cũ được thu hồi khi thay/xóa ảnh, tháo trang hoặc sự kiện `pagehide`. Kết quả đọc ảnh cũ đến muộn bị bỏ qua sau khi người dùng thay/xóa ảnh hoặc rời trang.

Không có lựa chọn lưu lâu dài vì chưa có hệ thống lưu ảnh cá nhân. Checkbox đồng ý chỉ xác nhận bước xem trước hiện tại; không được sử dụng lại làm sự đồng ý gửi ảnh tới nhà cung cấp AI khi bổ sung dịch vụ sau này.

## Phân chia mã nguồn

| Phần | Tệp |
| --- | --- |
| Route, metadata, dữ liệu sản phẩm | `apps/web/app/dung-thu/[slug]/page.tsx` |
| Giao diện các bước, lựa chọn, giỏ | `apps/web/components/try-on.tsx` |
| Đọc/xóa ảnh tạm, bỏ kết quả đọc muộn | `apps/web/hooks/use-try-on-photo.ts` |
| Quy tắc ảnh, nhóm hỗ trợ, ảnh đúng màu, URL | `apps/web/lib/try-on.ts` |
| Màu/size qua các trang | `apps/web/lib/product-selection.ts` |
| Giao diện responsive | `apps/web/app/try-on.css` |

Không cần migration, seed hoặc cấu hình secret mới. Backend và worker chưa thay đổi.

## Giai đoạn tích hợp AI tiếp theo — đề xuất, chưa triển khai

Chọn nhà cung cấp sau khi thử nghiệm thực tế với bốn nhóm áo; đánh giá chất lượng giữ diện mạo, logo, màu, đường may và tư thế. Kiểm tra điều kiện sử dụng, chính sách lưu/xóa ảnh và chi phí của dịch vụ được chọn trước khi ghi cam kết trong giao diện. Chưa xác nhận một công nghệ xử lý tốt cả áo lẫn phụ kiện.

Đề xuất một adapter phía máy chủ tách khỏi giao diện, nhận đầu vào do backend xác minh: người sở hữu phiên, ID sản phẩm/SKU, màu, ảnh tham chiếu từ catalog và chế độ ảnh người dùng. Không tin URL ảnh sản phẩm hoặc giá do client gửi. Ảnh cá nhân và ảnh kết quả phải ở kho riêng tư, kiểm tra quyền cho mọi lần đọc/xóa, không đặt dưới `public` hay dùng URL lâu dài công khai.

API đề xuất (hiện chưa tồn tại):

| API | Trách nhiệm |
| --- | --- |
| `GET /try-on/capabilities` | Nhóm hỗ trợ, trạng thái dịch vụ, giới hạn và thông tin xử lý ảnh |
| `POST /try-on/photos` | Nhận ảnh sau đồng ý mới; xác thực nội dung ở máy chủ, lưu tạm riêng tư |
| `POST /try-on/jobs` | Tạo tác vụ với khóa chống trùng, kiểm tra sản phẩm và quyền ảnh |
| `GET /try-on/jobs/:id` | Chỉ chủ ảnh xem trạng thái/kết quả, trả URL có hạn |
| `DELETE /try-on/jobs/:id` | Hủy tác vụ và yêu cầu xóa ảnh liên quan |
| `DELETE /try-on/photos/:id` | Xóa ảnh gốc và hủy tác vụ đang dùng ảnh |

Tác vụ dự kiến: `QUEUED → PROCESSING → SUCCEEDED / FAILED / TIMED_OUT`, kèm `CANCELLED` và `EXPIRED`. Worker dùng hàng đợi hiện hữu, có giới hạn lượt, timeout, retry có điều kiện và dọn dữ liệu. Không tự gửi lại ảnh tới nhà cung cấp sau khi người dùng hủy/xóa.

Đề xuất lưu tạm tối đa 24 giờ, cho xóa ngay, không tự lưu vào hồ sơ; đây là thiết kế cần triển khai và kiểm chứng với nhà cung cấp, không phải cam kết hiện tại. Không log ảnh, URL có chữ ký hoặc nội dung nhận dạng trong audit. Quyền lưu để dùng lại phải là lựa chọn riêng, không gộp với đồng ý dùng thử một lượt.

Khi AI được nối, bổ sung trạng thái chờ/xử lý/lỗi/quá hạn và màn hình kết quả có phóng to, đối chiếu, tải xuống, thử lại. Tất cả kết quả phải gắn chú thích: “Ảnh mô phỏng bằng AI, dùng để tham khảo cách phối và diện mạo. Vui lòng xem thông tin kích thước của sản phẩm trước khi mua.” Không kết luận chính xác kích cỡ hoặc bảo đảm vừa vặn từ ảnh.

## Nghiệm thu giai đoạn trải nghiệm

- Đi vào từ thẻ và chi tiết giữ đúng sản phẩm/màu/size; về sản phẩm và thêm giỏ giữ đúng SKU.
- Không đi tiếp khi chưa có ảnh hợp lệ, thiếu ảnh sản phẩm đúng màu hoặc chưa đồng ý ở bước xác nhận.
- Tệp giả MIME, hỏng, quá nhỏ hoặc quá nặng có lỗi cụ thể và chọn lại được.
- Thay/xóa/rời trang thu hồi ảnh tạm; tải lại không khôi phục ảnh; không có request tải ảnh cá nhân lên máy chủ.
- Chân dung có giải thích rõ; kết quả không có ảnh giả và không có nút tải xuống một kết quả chưa tồn tại.
- Màn hình 360 px không tràn ngang, có nhãn cho trường chọn ảnh, trạng thái bước và focus sau chuyển bước.

Kết quả kiểm tra:

- `npm test`: 39/39 đạt, gồm 5 kiểm tra mới về ảnh/biến thể cho Dùng thử.
- `npm run typecheck`: đạt.
- `npm run build`: shared/API/worker/web đều đạt; có route động `/dung-thu/[slug]`.
- 12/12 Playwright production đạt: 8 bài Dùng thử và 4 hồi quy mua sắm/yêu thích/gallery. Chạy trên database riêng `milo_redesign_test`, Redis DB2; runner tự dừng cổng QA 3100/4100.
- Không lỗi JavaScript/hydration trong các bài Dùng thử; kiểm tra 360 px không tràn ngang, giữ đúng biến thể trong giỏ, consent và giải phóng URL ảnh tạm đều đạt.
- Ảnh kiểm tra desktop chọn ảnh/kết quả và mobile xác nhận: `.local/try-on/desktop-upload.png`, `desktop-result.png`, `mobile-confirm.png`. Ảnh đầu vào QA chỉ là một PNG màu phẳng, không dùng ảnh người thật.
- Sau QA, mở cửa hàng bằng `npm run dev`; web 3000, API 4000, worker. Route Dùng thử và API cấu hình đều phản hồi HTTP 200.
