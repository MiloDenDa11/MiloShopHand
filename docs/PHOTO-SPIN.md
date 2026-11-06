# Xoay ảnh quanh Oy — 06/11/2026

> UI mới nhất: [Milo Design, nút bo tròn, nền hoa lá và preview đổi màu](MILO-DESIGN-UI.md). Màu thiếu ảnh riêng nay có lớp phối màu xem trước; số bộ ảnh 24 góc gốc bên dưới giữ nguyên. Các mô tả nhãn “AI” trong báo cáo này ghi nguồn gốc asset, không phải nhãn hiện trên giao diện.

Theo yêu cầu mới, giao diện sản phẩm đã trở lại ảnh AI gốc. Cửa sổ 360° hiện dùng bộ ảnh nhiều góc, thay cho GLB dựng hình. Các báo cáo GLB trước đây là lịch sử, không mô tả giao diện hiện tại.

Đã bổ sung xoay trực tiếp trên **ảnh thẻ sản phẩm** ở danh sách/trang chủ: di chuột ngang qua ảnh để xem đủ24 góc, hoặc vuốt ngang trên điện thoại. Bấm ảnh/Enter vẫn mở chi tiết; phím trái/phải và Home điều khiển được khi focus ảnh. Khi ra khỏi ảnh hoặc ảnh ra khỏi vùng nhìn, khung xoay dừng và trả lại ảnh tĩnh. Không tự chạy animation, nên reduced motion vẫn giữ nguyên thao tác thủ công.

Mỗi thẻ chỉ tải bộ atlas sau khi hover có chủ đích, focus hoặc chạm; không tải toàn bộ bộ xoay của cả danh sách khi mở trang. Bộ ảnh khớp màu đang chọn, tải lỗi giữ ảnh tĩnh và rê chuột lại sẽ thử lại. Vuốt ngang chặn click nhầm nhưng vẫn cho cuộn dọc. Thẻ chưa đủ bộ ảnh có nhãn **“Ảnh xoay đang cập nhật”**, gồm Zip Pocket Hood trong ảnh tham chiếu; Drop Shoulder Hood và Double Hood đã xoay được.

Áo giữ phương thẳng đứng; kéo chuột/vuốt ngang thay đổi góc quanh Oy. Kéo dọc không làm nghiêng áo. Có nút trước/sau, xoay từng góc, zoom, chụm hai ngón, reset và phím mũi tên/Home. Bấm ảnh sau mở ngay mặt sau; Escape đóng và trả focus. Không tự xoay và không có vòng render liên tục.

Mỗi bộ đã duyệt có 24 góc, lưu thành bốn PNG nguyên bản, mỗi ảnh chứa sáu góc. Mỗi ô tối thiểu 450px theo cả hai chiều. Viewer chỉ tải mã và ảnh lớn khi mở; Next Image phục vụ bản tối ưu. Gallery/giỏ/đơn hàng cắt đúng một ô bằng bố cục CSS, không hiển thị cả tấm sáu áo. Bounding box riêng từng góc cân chỉnh chiều cao/tâm áo mà không kéo méo ảnh. Không dùng CSS xoay một ảnh phẳng để giả 360°.

Đây là mockup AI, không phải ảnh hàng thật hoặc ảnh camera đã hiệu chuẩn. Các bước 15° là góc danh nghĩa của chuỗi AI; độ rủ/nếp vải có thể lệch nhẹ giữa ảnh. Mặt trước dùng ML, mặt sau dùng floral M + MiloShopHand với mực tương phản theo màu vải. Provenance lưu prompt, ảnh nguồn, kích thước và kiểm tra từng góc tại `docs/photo-spin/`.

## Dữ liệu và phạm vi

Danh sách được duyệt nằm ở `docs/photo-spin/approved.json`. Chỉ bộ đủ 24 góc được đưa vào `apps/web/content/photo-spins.json`; không tự nhận thư mục tạo dở là hoàn chỉnh. Viewer khớp chính xác màu đang chọn. Màu chưa có bộ riêng hiển thị thông báo đang bổ sung, giữ gallery tham chiếu có nhãn rõ ràng.

Đã giữ 60 thiết kế AI gốc, 15 mỗi nhóm tee/jacket/bomber/hoodie, và 30 sản phẩm mẫu cũ. Hiện tích hợp **48 bộ ×24 =1.152 góc ảnh**, **192 PNG nguyên bản**, thuộc **37 thiết kế riêng biệt**. Các màu thêm không được tính thành thiết kế mới.

| Nhóm | Thiết kế màu gốc đủ 24 góc | Tổng bộ tính cả màu thêm |
| --- | ---: | ---: |
| Áo phông | 13/15 | 16 |
| Jacket | 7/15 | 10 |
| Bomber | 6/15 | 8 |
| Hoodie | 11/15 | 14 |

Everyday Crew, Field Four và Cloud Pullover có bộ riêng cho **đen #151515, trắng #f8f7f2, đỏ mận #722f37**, ngoài màu gốc. Flight MA1 có đen/trắng; đỏ mận mới có sáu góc, chưa được đưa vào viewer. Đây là màu của các mẫu nêu tên, **chưa phải toàn bộ 60 thiết kế đều đủ ba màu**. Còn 23/60 thiết kế AI gốc thiếu bộ 24 góc; 30 mẫu minh họa cũ cũng chưa có photo 360.

Ảnh tích hợp lưu bền vững tại `apps/web/public/collection-spin/<slug>/<colour>/part-0..3.png`; 60 ảnh plate trước/sau ban đầu tại `apps/web/public/collection-ai/`. Tạo bằng công cụ **ImageGen tích hợp**; toàn bộ prompt set, reference, SHA256, kích thước và ghi chú QA nằm trong `docs/photo-spin/*-original.json` và `*-black/white/burgundy.json`. Bản PNG AI giữ nguyên byte, chỉ phân tích bounds đọc và crop lúc hiển thị bằng CSS.

ImageGen trả `429 usage_limit_reached` khi đang làm các bộ tiếp theo, báo mở lại **10:40:55 ngày 06/11/2026, Asia/Saigon**. Đã dừng tạo, không đổi công cụ/model để vượt hạn mức. Henley đã lưu 12/24 góc; Contrast Sleeve 18/24; Racer Clean và Zip Pocket Hood mỗi mẫu 6/24; Flight MA1 đỏ mận 6/24. Các bộ dở có provenance `incomplete`, không thuộc manifest đã duyệt. Danh sách thiếu ở `docs/photo-spin/remaining-originals.json`; ảnh/prompt dở giữ trong public hoặc `.local/photo-spin/` như provenance chỉ rõ.

Seed ảnh không đổi ID, giá, SKU, tồn kho, tài khoản hoặc đơn. Ảnh merchant upload được giữ. Các tài nguyên render cũ vẫn lưu để đường dẫn ảnh trong đơn cũ hoạt động. Seed thương hiệu không đưa sản phẩm đã chuyển ảnh trở về gallery 3D. Không thêm migration.

Trước các đợt tích hợp đã tạo backup Docker; backup trước đợt 48 bộ: `.local/backups/milo-2026-11-05T17-13-24-634Z.dump`. Snapshot thương mại tại `.local/photo-spin/commerce-before.private.json`: 90 sản phẩm, 1.520 SKU và bản ghi tồn kho, 4 đơn, 8 tài khoản. Đối chiếu sau seed không thay đổi các bản ghi đó.

```powershell
npm run assets:photos
npm run db:backup
npm run db:seed:photos
npm run assets:photos:verify
# Kiểm tra bắt buộc đủ ảnh gốc cả 60 thiết kế; hiện sẽ báo thiếu.
npm run assets:photos:verify -- --require-all
# HTTP/UI, sau khi bản preview production ở cổng 3100 sẵn sàng:
npm run assets:photos:smoke
```

Khi thêm file public vào một server production đang chạy, cần build/khởi động lại server sau seed để Next nhận danh sách asset mới. Nếu không, file đã có trên đĩa vẫn có thể trả 404 từ server cũ. Trong development dùng `npm run dev`; không chạy thêm bản Nest thứ hai trên cùng cổng 4000.

## Kiểm tra phần đã tích hợp

- Typecheck và build shared/API/worker/web: PASS.
- Unit/media/photo/palette: 13/13; đồng bộ và bộ dựng hình lưu trữ: 8/8.
- Integration: 24/24, database `milo_integration_test`, Redis DB 1. Có kiểm tra seed ảnh/thương hiệu chạy lặp không đổi gallery, SKU, tồn, giá và quan hệ; checkout lưu ảnh đúng màu.
- Playwright: **27/27 PASS** trên Next **production build**, database `milo_redesign_test`, Redis DB 2; API/worker dùng adapter development mock. Có kéo ngang/dọc, 24 ô khác nhau, touch thật qua Chromium, WebGL bị tắt, retry ảnh, đổi màu/giữ góc, 360px, font tiếng Việt, giỏ và checkout COD/QR mock.
- Thêm4 bài kiểm tra xoay ngay trên thẻ: 24 vị trí ảnh khác nhau và đủ4 atlas, tải theo tương tác, đổi đúng đen/trắng/đỏ mận, gallery thay thế khi chưa có ảnh, vuốt thật ở360px/cuộn dọc, bàn phím/mở chi tiết và tải lỗi/thử lại. Sau tách phần căn ảnh dùng chung giữa thẻ và viewer, 27 bài cũ vẫn PASS; 4 bài mới PASS sau sửa tọa độ phép đo chuột do Playwright cuộn vào vùng nhìn. Không tăng timeout.
- Phát hiện Playwright bỏ qua ba tệp kiểm thử OneDrive vì Node nhận là symbolic link. `scripts/prepare-e2e.mjs` materialize riêng các tệp đó, sao lưu và kiểm tra hash giữ nguyên để toàn bộ suite được phát hiện. Locator bộ lọc được giới hạn trong `#main`, tránh bản HTML đang stream nằm ngoài nội dung đang hiển thị.
- `scripts/verify-photo-spins.ts` kiểm tra ảnh tồn tại, kích thước/hash, đủ ô/góc/bounding box và mapping database. Báo số còn thiếu riêng; chế độ mặc định chỉ chứng nhận bộ đã duyệt.
- Lần kiểm tra 48 bộ: **PASS**, 192 atlas có hash đúng, 1.152 ô không bị trùng nguyên ảnh trong cùng bộ; mọi đường dẫn ảnh local của 90 sản phẩm có file. Chế độ `--require-all` vẫn báo thiếu 23 thiết kế gốc, đúng với phạm vi hiện tại.
- `scripts/smoke-photo-spins.mjs` kiểm tra giao diện production cho **từng sản phẩm và từng màu** đã duyệt: tải viewer khi mở, đủ24góc, đúng atlas tại mỗi góc, không GLB/canvas, không tràn mobile, ảnh trả HTTP thành công. Gallery trước/sau được phép dùng chung hai atlas với viewer. Kết quả và ảnh QA lưu ở `.local/photo-spin/production/`.
- Smoke trên toàn bộ **48 bộ/1.152 góc**: PASS, 192 atlas trả HTTP thành công, không lỗi JavaScript/GLB/canvas. HTTP audit gallery toàn catalog: **90 sản phẩm, 179 ảnh local riêng biệt, không 404**, đúng MIME ảnh (`gallery-http.json`).

## Hiệu năng production hiện tại

Đã sửa các khoảng trống loading quá ngắn ở route và Suspense của catalog, margin bị tràn khỏi `main`, giỏ rỗng bị co chiều cao sau tải và thanh thông báo mobile đổi số dòng khi font local tải xong. Đây là những nguyên nhân làm nội dung/footer nhảy đáng kể dù API đã phản hồi. Giỏ nay giữ chiều cao tương ứng loading; thanh thông báo chừa hai dòng.

Đo trước khi thêm tương tác hover trên thẻ bằng `scripts/benchmark-web.mjs`: Windows, i5-12450HX/12 logical CPU, Chromium headless, Next production, loopback không giới hạn mạng/CPU, reduced motion. Desktop1440×1000 và mobile390×844, mỗi trang ba lần (cold browser +hai warm browser), 700ms quan sát giống nhau; bảng là median sáu mẫu mỗi trang. “Sẵn sàng” là nội dung/font hiển thị, không phải INP hoặc số đo người dùng thật.

| Trang | Ảnh xoay bản đầu (ms) | Hiện tại (ms) | LCP hiện tại (ms) |
| --- | ---: | ---: | ---: |
| Trang chủ | 301 | 141 | 106 |
| Danh sách | 304 | 160 | 122 |
| Tìm kiếm | 308 | 108 | 78 |
| Chi tiết | 316 | 142 | 94 |
| Giỏ hàng | 107 | 84 | 66 |

Hai lần đều có 90 sản phẩm và ảnh đã hoạt động. Bản đầu dùng frontend3200/API compiled4000 với DB cửa hàng; bản cuối frontend3100/API development4100 với DB/Redis thử nghiệm riêng. Bản cuối đo riêng sau khi các suite khác kết thúc, server/image cache đã được làm nóng; cold browser không đồng nghĩa cold server. Vì khác tiến trình API, trạng thái cache và dữ liệu đơn thử, đây là số liệu local để theo dõi, **không quy toàn bộ chênh lệch cho code hoặc cam kết tốc độ production thực tế**.

Bản cuối: 30/30 mẫu tải ảnh trong vùng nhìn, không lỗi JavaScript/request API trùng; JS tải ở cold browser khoảng187–191KiB tùy trang. CLS cao nhất mỗi trang 0,00035–0,00074; giỏ trước sửa cuối từng đạt0,123. Chọn size đến hai frame sau commit median25ms; điều hướng client trang chủ→catalog425ms. Trong audit48 bộ ảnh riêng, median mở viewer867ms; bốn atlas tối ưu khoảng104–347KiB/bộ, tải mã viewer khi mở. Gallery có thể dùng chung atlas trước/sau trước đó.

Raw trước/sau: `.local/photo-spin/performance/photo-spin.json` và `photo-spin-complete-check.json`; bảng tổng hợp `summary.json`. Bản trung gian trước sửa giỏ/header lưu `photo-spin-final.json`; audit chi tiết CLS giỏ sau sửa tại `.local/photo-spin/cart-layout-audit.json`. Không tăng timeout để che lỗi.

Các server QA được dừng sau kiểm tra để giải phóng cổng cho `npm run dev`. PostgreSQL/Redis Docker được giữ chạy.
