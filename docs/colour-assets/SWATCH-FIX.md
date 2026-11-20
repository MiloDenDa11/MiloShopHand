# Phản hồi khi bấm chọn màu — 18/11/2026

Đã tái hiện hai trường hợp trên bản production local:

- Everyday Crew có ảnh riêng cho các màu: bấm đen, trắng, đỏ mận đổi đúng URL ảnh và tải được ngay, trước khi hover để xoay.
- Minimal No Pocket Hoodie chưa có ảnh riêng cho ba màu bổ sung: trạng thái lựa chọn đã đổi, nhưng hàm lấy ảnh trả về ảnh tham khảo ban đầu. Vì vậy áo đứng nguyên khi bấm, chỉ có dòng chú thích nhỏ bên dưới thay đổi.

Thẻ sản phẩm nay hiển thị tên màu được chọn. Màu có ảnh riêng vẫn đổi trực tiếp sang ảnh tương ứng; màu thiếu ảnh đổi toàn bộ vùng ảnh thành thông báo rõ theo đúng tên màu, có nút quay lại ảnh của màu sẵn có. Tooltip của chấm màu cũng ghi rõ khi thiếu ảnh. Liên kết chi tiết giữ đúng màu đang chọn. Có thể chọn bằng bàn phím và dùng từ màn hình 360px.

Không tạo thêm ảnh hoặc nhuộm lại ảnh trong lần sửa này. Thư viện vẫn có 193/380 bộ màu riêng, còn 187 bộ cần bổ sung; thay đổi giao diện không làm các bộ thiếu trở thành bộ đã hoàn thành. Không sửa giá, SKU, kho hoặc dữ liệu giao dịch của cửa hàng.

Kiểm tra: 10 Playwright E2E production đạt trên database QA riêng, gồm hai kiểm tra hồi quy mới cho ảnh tĩnh đổi ngay và phản hồi màu thiếu ở 360px. Kiểm tra lại hover xoay đủ 24 góc, thao tác cảm ứng/cuộn, ảnh tải lỗi, màu qua chi tiết/reload/giỏ, yêu thích theo tài khoản và ảnh gallery thử lại đều đạt.

Ảnh kiểm tra ở `.local/colour-switch/pending-mobile.png`; bản tái hiện ban đầu ở `.local/colour-switch/before.json`. Build production thông thường được chạy lại để cập nhật thư mục `.next`, bên cạnh bản build QA riêng.

Sau kiểm tra đã mở lại cửa hàng local bằng `npm run dev`: web cổng 3000, API cổng 4000 và worker. Các dịch vụ QA ở 3100/4100 đã tự dừng.
