# Hiệu năng production — 05/11/2026

> Đo và tối ưu mới ngày 06/11/2026: [đối chiếu Tikets Platform, kết nối Docker, phản hồi bộ lọc, font và ảnh](PERFORMANCE-TICKETS-COMPARISON.md). Số liệu dưới đây là lịch sử; giá và tồn kho tiếp tục được lấy mới trên server cho lượt mở trang và trên client khi đổi bộ lọc.

> Giao diện hiện đã chuyển sang ảnh xoay quanh Oy. Xem số đo và phạm vi mới nhất tại [PHOTO-SPIN.md](PHOTO-SPIN.md). Các số đo GLB/logo trước đó và báo cáo bên dưới là lịch sử.

Máy Windows, Intel i5-12450HX/12 logical CPU, Chromium headless, loopback không throttle mạng/CPU, reduced motion. Next production trước thay đổi ở cổng 3200, bản sau ở cổng 3000; cùng PostgreSQL/Redis Docker. Desktop 1440×1000 và mobile 390×844, ba lượt mỗi trang trên mỗi thiết bị (một cold browser, hai warm browser). Bảng là median của sáu mẫu/trang.

“Nội dung sẵn sàng” được đo đến khi nội dung chính và font hiển thị; không phải INP hoặc chỉ số thực địa. Cùng cửa sổ quan sát 700 ms được áp dụng trước/sau.

| Trang | Nội dung trước (ms) | Nội dung sau (ms) | LCP trước (ms) | LCP sau (ms) |
| --- | ---: | ---: | ---: | ---: |
| Trang chủ | 499 | 231 | 140 | 212 |
| Danh sách | 454 | 232 | 90 | 196 |
| Tìm kiếm | 345 | 110 | 80 | 100 |
| Chi tiết | 335 | 145 | 226 | 126 |
| Giỏ hàng | 110 | 72 | 62 | 50 |

Before có 30 sản phẩm và **không tải ảnh sản phẩm do lỗi lọc**. After có 90 sản phẩm, ảnh đầy đủ và font local. LCP của trang chủ/danh sách/tìm kiếm tăng khi có ảnh; không coi baseline thiếu ảnh là trải nghiệm đã tải đầy đủ. Tất cả mẫu after đã tải được ảnh trong vùng nhìn, không có lỗi JavaScript hoặc request API trùng.

Thao tác chọn size ở bản sau đến hai frame sau commit: median **24 ms**; đây là phép đo tương tác riêng, không phải INP. Điều hướng client từ trang chủ đến catalog đo được **266 → 453 ms**, chưa cải thiện trong lần đo này. Đường tải đã đổi sang SSR dữ liệu mới và có ảnh; không khẳng định mọi chỉ số đều nhanh hơn.

## Tái lập và dữ liệu

- `.local/performance/before.json`, `after.json`: 30 mẫu mỗi phiên bản.
- `.local/performance/summary.json`: tổng hợp, điều kiện và giới hạn phép đo.
- `scripts/benchmark-web.mjs`: benchmark chỉ đọc, giỏ thử nằm trong browser context.
- Ảnh QA production: `docs/collection-upgrade/previews/`.

```powershell
# Khi npm start đang phục vụ bản đã build tại cổng 3000.
$env:BENCHMARK_URL='http://localhost:3000'
node scripts/benchmark-web.mjs after
```

Để so sánh API cũ/mới trên cùng 90 sản phẩm, xem [báo cáo API](PERFORMANCE-API.md). Seed chạy lặp không đổi bản ghi sản phẩm/ảnh/SKU/tồn kho đã có, đã đối chiếu checksum toàn bộ các nhóm đó.
