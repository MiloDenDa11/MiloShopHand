# Bổ sung bộ áo xoay nhiều góc — 17/11/2026

> Báo cáo lịch sử. Từ 18/11/2026, lớp nhuộm màu tự động đã được tắt vì gây lỗi màu và logo. Viewer hiện chỉ dùng bộ ảnh riêng đúng màu đã duyệt; màu chưa có bộ riêng được ghi rõ đang bổ sung. Theo dõi danh sách ảnh tại `docs/colour-assets/coverage.json`.

Theo lựa chọn của chủ cửa hàng, tiếp tục dùng ảnh AI nhiều góc. Không thay gallery bằng GLB hoặc xoay một tấm ảnh phẳng. Mỗi mẫu cần bộ 24 góc riêng được duyệt; bộ dở không được đăng ký vào viewer.

## Tài nguyên và nguồn gốc

Ảnh tạo bằng **ImageGen tích hợp**, tham chiếu đúng plate trước/sau của từng sản phẩm. Mỗi bộ gồm bốn PNG nguyên bản, mỗi PNG chứa sáu góc theo lưới 3×2, ô 512px. Lưu tại `apps/web/public/collection-spin/<slug>/original/part-0..3.png`. Bản PNG giữ nguyên byte; WebP là bản tối ưu để truyền tới trình duyệt.

Toàn bộ prompt, ảnh tham chiếu, SHA256, kích thước và ghi chú duyệt của từng bộ nằm trong `docs/photo-spin/<slug>-original.json`. Danh sách duyệt ở `docs/photo-spin/approved.json`, manifest chạy thật ở `apps/web/content/photo-spins.json`. Các thư mục tạo dở không tự trở thành dữ liệu đã duyệt.

Đây là ảnh mô phỏng thiết kế AI. Góc 15° là góc danh nghĩa, không phải phép chụp sản phẩm thật đã hiệu chuẩn. Chỉ ảnh thực tế của đúng hàng hóa mới xác nhận được màu, chất vải và kích thước sản xuất.

## Chọn màu và tương tác

Ưu tiên bộ ảnh riêng đúng màu. Màu chưa có bộ riêng dùng lớp phối màu xem trước từ bộ 24 góc của chính mẫu áo, không mượn áo khác. Lớp này chỉ dành cho catalog được quản lý và màu biến thể thực sự tồn tại. UI ghi “Phối màu xem trước”; không tính bản phối màu thành bộ PNG gốc đã tạo.

Phối màu chạy khi người dùng mở viewer hoặc chủ động xem trên thẻ. Canvas 2D xử lý nền/áo từ ảnh gốc, không đòi hỏi WebGL. Kết quả là blob tạm trong bộ nhớ trình duyệt; không sửa file, database hoặc màu của SKU. Có cache giới hạn cho bộ đã ngừng dùng và thu hồi blob cũ. Tải lỗi không hiển thị ảnh sai màu; có thử lại. Kết quả của màu cũ không được ghi đè màu mới.

Kéo/vuốt ngang để xoay quanh Oy; áo đứng thẳng. Có bàn phím, trước/sau, zoom và reset. Giữ nguyên góc khi đổi màu. Tôn trọng reduced motion, không tự chạy vòng render. Thẻ chỉ tải ảnh xoay sau tương tác, vẫn cho cuộn dọc và mở chi tiết bằng click/Enter.

## Chạy và kiểm tra

Không cần migration hoặc reset database. Chỉ bổ sung metadata ảnh và các ProductImage được quản lý, giữ ảnh merchant upload và file nguồn cũ để đơn hàng cũ vẫn xem được ảnh.

```powershell
npm run assets:photos
npm run db:backup
npm run db:seed:photos
npm run assets:photos:verify -- --require-all
npm run assets:rotation:verify
npm test
npm run typecheck
npm run build
npm run test:e2e:production
```

`assets:photos:verify -- --require-all` yêu cầu đủ màu gốc của cả 60 mẫu thiết kế và 30 mẫu catalog cũ. `assets:rotation:verify` yêu cầu tất cả màu đang bán có bộ xoay hoặc phối màu xem trước hợp lệ. Dùng `npx tsx scripts/audit-rotation-coverage.ts --require-native` nếu muốn yêu cầu PNG riêng cho từng màu; đây là tiêu chí khác.

Audit trình duyệt chỉ đọc: chạy preview production với `node scripts/redesign-preview.mjs --production`, rồi `npm run assets:rotation:smoke` và `npm run assets:photos:smoke` ở terminal khác. Dừng preview sau kiểm tra. Các dịch vụ dùng database `milo_redesign_test` và Redis DB2; không dùng các test checkout trên database cửa hàng.

Khi thêm ảnh vào Next production đang chạy, build/khởi động lại web để nhận file public mới. Với development, chạy `npm run dev`.

## Kết quả xác minh

Đã bổ sung 41 mẫu thiếu bộ xoay, tương ứng 984 góc mới trong 164 PNG nguyên bản. Cả 90 sản phẩm hiện có bộ 24 góc màu gốc.

| Phạm vi | Trước | Hiện tại |
| --- | ---: | ---: |
| Sản phẩm có bộ xoay | 49/90 | 90/90 |
| Bộ màu PNG riêng | 61 | 102 |
| Tổng góc ảnh gốc | 1.464 | 2.448 |
| PNG atlas gốc | 244 | 408 |
| Màu có cơ chế xoay | 61/380 | 380/380 |

Trong 380 màu, 102 màu có bộ PNG riêng; 278 màu dùng phối màu xem trước. Số 380 không có nghĩa đã tạo 380 bộ PNG riêng. Cả hai danh sách thiếu `remaining-originals.json` và `remaining-legacy.json` đều rỗng.

- Kiểm tra SHA256, kích thước, 24 ô không trùng nguyên ảnh, bounding box và mapping database: đạt, đủ cả 90 mẫu.
- Unit/media/config: 34/34 đạt, gồm lỗi viền atlas chặn tách nền, sọc bị xử lý khác nhau giữa ngực/gấu, tay tương phản đổi vai trò vật liệu ở góc nghiêng và chữ in tối cần tách khỏi hai màu vải.
- Playwright production: 47/47 đạt, database `milo_redesign_test`, Redis DB2; checkout QR/COD dùng adapter mô phỏng phát triển. Sau chỉnh palette cuối, chạy lại bốn bài kiểm thử phối màu: 4/4 đạt.
- Snapshot hash 38 bảng thương mại trước/sau: không thay đổi (bỏ riêng metadata ảnh sản phẩm và bảng ảnh là phần được cập nhật). Vẫn 90 sản phẩm, 1.520 SKU, 4 đơn và 10 tài khoản. Ảnh merchant upload được giữ.
- Backup trước thao tác: `.local/backups/milo-2026-11-17T13-32-19-702Z.dump`. Snapshot không xuất nội dung riêng tư, chỉ lưu số lượng/hash tại `.local/spin-completion/commerce-before.json` và `commerce-after.json`.
- Audit ảnh gốc: 102 bộ/2.448 góc, 408 PNG trả HTTP thành công, 90 sản phẩm; không lỗi JavaScript hoặc tải GLB. Raw report: `.local/photo-spin/production/report.json`.
- Audit chức năng xoay toàn catalog: 90 sản phẩm/380 màu đạt; kiểm tra bốn góc chính, đúng loại native/preview, đủ bốn atlas và không tràn màn hình 360px. Raw report: `.local/spin-completion/browser/report.json`. Đây là kiểm tra tải/điều khiển ảnh, không chứng nhận màu vải sản xuất thực tế. Chỉnh palette tiếp theo được kiểm tra bằng unit, bốn E2E và ảnh QA trước/nghiêng/sau của Breton và Varsity.
- Build shared/API/worker/web và typecheck toàn monorepo: đạt sau chỉnh sửa cuối. Snapshot 38 bảng kiểm lại ở `commerce-final.json`: vẫn không thay đổi.
- Preview/API/worker kiểm thử được dừng sau QA; PostgreSQL và Redis Docker được giữ chạy. Các ảnh màn hình E2E mới lưu tại `.local/spin-completion/ui-qa/`, ảnh duyệt từng bộ và các góc phối màu ở `.local/spin-completion/`.

Lỗi đã sửa trong đợt này: viền trắng ở ô ảnh Safari Belt/Minimal No Pocket khiến bước tách nền nhận nhầm toàn ô; áo sọc cần xử lý họa tiết xuyên suốt thân thay vì giới hạn trong vùng logo ngực. Với áo hai màu, palette nguồn được giữ cố định qua cả vòng xoay; phần tay sáng và chữ in tối có vai trò riêng. Phối màu chỉ dùng tham khảo thiết kế, cần ảnh thực tế riêng để xác nhận chính xác chất vải và chi tiết. PNG nguyên bản được giữ.
