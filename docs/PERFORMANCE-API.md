# Catalog API — đo và sửa ngày 05/11/2026

## Đối chiếu cuối trên cùng 90 sản phẩm

Hai bản API biên dịch chạy lần lượt trên cổng 4200/4201, cùng database cửa hàng 90 sản phẩm, Redis QA riêng DB 6/7; mỗi endpoint một warmup và 12 request tuần tự, không chạy cùng build/kiểm thử. API trước dùng snapshot compiled giữ trước khi sửa; đo chỉ GET, không sửa dữ liệu.

| Endpoint | P50 trước (ms) | P50 sau (ms) |
| --- | ---: | ---: |
| Danh sách 12 sản phẩm | 31,78 | 31,51 |
| Tìm kiếm + tồn + size M | 40,67 | 15,22 |
| Bán chạy | 72,55 | 13,45 |
| Đánh giá | 63,84 | 16,21 |
| Chi tiết hoodie | 57,37 | 17,67 |
| Config | 6,50 | 31,43 |
| Taxonomy | 14,10 | 9,54 |

Danh sách thông thường gần như không đổi trong lần đo này; config tăng, không có thay đổi thuật toán ở endpoint đó. Các đường aggregate/tìm kiếm/chi tiết được cải thiện. Payload sau có thêm metadata 360. Số liệu là local benchmark, không phải cam kết độ trễ production trên Internet.

Dữ liệu: `.local/performance/api-before-90.json`, `api-after-90.json`. Tái lập trên máy còn snapshot: `node scripts/benchmark-api-pair.mjs`. Script khởi động/dừng hai API QA riêng, giữ nguyên API/worker đang dùng.

## Phép đo ban đầu trước khi thêm bộ sưu tập

Đã đo trên cùng database 30 sản phẩm của cửa hàng, PostgreSQL 18.6 và Redis 7.4.11 trong Docker. Hai phiên bản API đều được biên dịch TypeScript rồi chạy bằng Node 24, với cấu hình provider phát triển hiện có. Mỗi endpoint có một lượt làm nóng và 12 request tuần tự qua loopback, không giới hạn CPU/mạng, không đăng nhập; thời gian bao gồm đọc toàn bộ body.

| Endpoint | Median trước (ms) | Median sau (ms) |
| --- | ---: | ---: |
| Danh sách 12 sản phẩm | 104,65 | 27,28 |
| Tìm kiếm + còn hàng + size M | 68,41 | 28,02 |
| Bán chạy | 58,68 | 32,90 |
| Đánh giá | 69,26 | 27,35 |
| Chi tiết sản phẩm | 62,40 | 28,47 |

Số liệu thô: `.local/performance/api-before.json`, `api-after-initial.json`; script tái lập `node scripts/benchmark-api.mjs <nhãn> <API-base-URL>`. Đây là phép đo API cục bộ; phép đo trang production được lưu riêng tại `.local/performance/`.

## Các thay đổi

- PostgreSQL lọc, tính điểm bán chạy/đánh giá, sắp xếp và phân trang ID trước khi tải quan hệ. Mỗi trang hydrate tối đa 48 sản phẩm; bỏ giới hạn cũ tải 1.000 sản phẩm và 10.000 đánh giá rồi sắp xếp trong ứng dụng.
- Một truy vấn JSON cho các trường công khai, ảnh, biến thể đang bán và tồn kho của cả trang, thay cho nhiều lượt truy vấn quan hệ. Giá vốn, searchText và thông tin nội bộ kho không được hydrate/trả về.
- Gợi ý cá nhân tính điểm trong PostgreSQL và chỉ tải bốn sản phẩm kết quả, thay cho tối đa 500 bộ ảnh/biến thể/tồn kho.
- Giá và tồn kho được đọc trực tiếp từ PostgreSQL ở mỗi lần tải. Checkout tiếp tục định giá và giữ kho trong transaction; không dùng dữ liệu cache để quyết định thanh toán.
- Chỉ taxonomy được cache Redis 30 giây. Admin thay đổi/xóa metadata tăng revision của cache; loader cũ đang chạy không thể ghi đè revision mới. Các request trùng trong cùng tiến trình dùng chung loader.
- API cung cấp metadata thiết kế 360 và mặt/crop của ảnh; Admin giữ metadata ảnh khi lưu lại sản phẩm.

EXPLAIN trên dữ liệu hiện tại cho thời gian truy vấn ảnh 0,308 ms, tìm kiếm 0,087 ms và lookup đánh giá 0,046 ms. Báo cáo tại `.local/performance/api-query-plans.json`; chưa có bằng chứng cần thêm index cho tập dữ liệu này.

Kiểm thử bổ sung bao phủ phân trang/lọc kết hợp, thứ hạng bán chạy/đánh giá, giá và tồn kho mới nhất, gợi ý cá nhân, invalidation taxonomy qua tiến trình và race giữa loader với invalidation. Các fixture chỉ tạo trong database có hậu tố `_test`.
