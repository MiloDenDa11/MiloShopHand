# MiloShopHand — Vintage Editorial Experience

**Bản cập nhật hình ảnh mới nhất:** cả 12 ảnh editorial đã được chỉnh bằng ImageGen tích hợp để sử dụng thiết kế áo có logo MiloShopHand từ catalog. Xem [báo cáo ảnh thương hiệu](BRANDED-IMAGES.md), [prompt và nguồn ảnh hiện tại](images.json), [kiểm chứng bản ảnh mới](branded-verification.json). Các kết quả UI bên dưới và `verification.json` ghi nhận lần triển khai giao diện đầu tiên; kết quả kiểm tra lại sau đổi ảnh được ghi riêng.

Đã triển khai giao diện mới trong dự án local: card phong cách có ảnh outfit riêng, Milo Journal có hình ảnh theo chủ đề, và trung tâm chăm sóc khách hàng có bố cục điều hướng / nội dung / góc đọc trực quan. Giữ bảng màu ivory, espresso, olive và font Lora/Inter đang dùng. Chưa commit, đẩy GitHub hoặc triển khai website production.

## Những khu vực thay đổi

| Khu vực | Trải nghiệm mới |
|---|---|
| Trang chủ | Bìa ảnh outfit; bốn card Basic, Vintage Inspired, Oversized, Streetwear có bốn ảnh khác nhau; lookbook có ảnh phối đồ; chỉ mục bộ sưu tập giữ liên kết và bổ sung minh họa khí hậu. |
| Card Journal | Ba chủ đề có ảnh phù hợp: phối đồ hằng ngày, bomber/90s, chăm áo. Giữ nguyên liên kết đến từng bài. |
| `/phong-cach` | Bài viết theo dạng editorial ảnh / nội dung, đánh số và giữ các anchor `everyday`, `vintage`, `care`, `brand-story`. |
| `/chinh-sach` | Desktop ba cột, menu trái có icon và sticky; nội dung chính có ảnh và phân cấp; rail phải thay đổi theo từng mục. Tablet đưa rail xuống dưới; mobile có menu ngang và nội dung xếp dọc. |
| Giao hàng | Chính sách từ API; thông tin phí theo cấu hình mô phỏng được ghi rõ; quy trình ba bước; phần giải thích thanh toán có thể mở rộng. Không đưa phí mô phỏng thành cam kết phí giao hàng thật. |
| Đổi trả & size | Chính sách từ API, ảnh đo áo, hướng dẫn vai/ngực/dài áo, bảng số đo mẫu dùng chung với trang sản phẩm, quy trình gửi và xử lý yêu cầu. |
| Quyền riêng tư | Chính sách từ API, các khối về lựa chọn vị trí, marketing và quản lý phiên; giữ các giải thích chính sách đang có. |
| FAQ | Tìm kiếm có/không dấu tiếng Việt, lọc chủ đề, accordion hỗ trợ bàn phím, số kết quả, trạng thái không tìm thấy và nút đặt lại. Câu hỏi phí giao hàng và đổi trả lấy nguyên nội dung cấu hình. |
| Liên hệ | Ảnh boutique ý tưởng, chỉ dẫn tìm mã đơn và kênh hỗ trợ; không công khai email `.local` hoặc tạo số điện thoại/địa chỉ/giờ hỗ trợ giả. |

Hover ảnh 1.035×, nâng card 3 px, mũi tên dịch nhẹ, fade khi đổi mục. Các hiệu ứng mới tôn trọng `prefers-reduced-motion`. Liên kết đến bài đọc và bảng size có xử lý fragment sau khi nội dung/font sẵn sàng để tránh đứng ở đầu trang khi mở trực tiếp.

## Nội dung và dữ liệu

`shippingPolicy`, `returnPolicy`, `privacyPolicy`, phí cấu hình và email tiếp tục lấy từ `/api/v1/config`. Trang chính sách dùng `serverApi` hiện có để lấy nội dung ban đầu, cùng cơ chế client loading/error/retry khi cần. Không sửa backend, API, schema, giá, tồn kho, đơn hàng, đăng nhập hoặc thanh toán.

Bảng size vốn được khai báo trong trang sản phẩm đã chuyển sang `content/size-guide.ts` và dùng chung ở hai nơi; giữ nguyên các số đo mẫu S/M/L/XL. Thông tin mẫu được ghi rõ, ưu tiên hướng dẫn riêng của sản phẩm. FAQ về ảnh được làm rõ để phản ánh đúng việc website đang có ảnh Milo Design/editorial do AI tạo.

API hiện chỉ cung cấp email liên hệ; giá trị local là địa chỉ phát triển. Trang liên hệ hiển thị rõ các thông tin chưa được cửa hàng công bố. Trước mở bán thật, cửa hàng cần cấu hình email thực và công bố thông tin kinh doanh, địa chỉ, điện thoại, giờ hỗ trợ qua nguồn nội dung được hỗ trợ; không tự thêm trường database trong lượt này.

## Bộ ảnh riêng

**12 ảnh được chỉnh bằng ImageGen tích hợp, chế độ edit**, từ bộ ảnh editorial ban đầu và ảnh tham chiếu mặt trước/sau của Airy Cotton Tee, Mono Boxy Tee, ML Flight MA1 Bomber và ML Racer Clean Jacket trong dự án. Gồm bốn outfit, đóng gói, trao kiện hàng, đo áo, giặt/chăm áo, không gian boutique, tư vấn khách hàng, kiểm tra đường may và tĩnh vật quyền riêng tư.

- Ảnh cuối dùng trên website: `apps/web/public/editorial/branded-20261120-v2/<id>.webp`.
- PNG nguyên bản: `apps/web/public/editorial/branded-20261120-v2/sources/<id>.png`, tổng 12 file, giữ nguyên byte từ công cụ.
- [Bộ prompt cuối, nguồn, kích thước, SHA-256 và ghi chú duyệt](images.json).
- WebP tổng 1.572.990 byte cho 12 ảnh; Next Image phân phối kích thước phù hợp theo màn hình. Có kích thước khung, alt mô tả, lazy loading ngoài ảnh bìa đang nhìn thấy.
- Ảnh và không gian boutique được ghi là ảnh ý tưởng AI; không coi là ảnh chụp sản phẩm/cửa hàng/khách hàng thực. Ảnh sản phẩm và ảnh cộng đồng đang có được giữ riêng.

Tạo lại bản nén từ PNG đã duyệt bằng `node scripts/build-editorial-media.mjs`; script kiểm tra SHA-256 ảnh gốc và chỉ tạo ảnh phân phối. Khi thay artwork sau này, dùng tên/thư mục phiên bản mới để tránh cache cũ. Không cần khóa API cho ImageGen tích hợp.

Bộ ảnh không logo ban đầu được giữ tại `vintage-20261120` cùng [manifest v1](images-v1.json) để có thể khôi phục. Tham chiếu ảnh bìa dự phòng dùng chung metadata với các card, tránh còn sót đường dẫn ảnh cũ.

## File mã nguồn

| File | Vai trò |
|---|---|
| `apps/web/components/customer-care.tsx` | Trung tâm hỗ trợ, quy trình, size guide, FAQ, liên hệ và rail theo mục. |
| `apps/web/components/editorial-photo.tsx` | Khung ảnh Next Image dùng lại. |
| `apps/web/content/customer-care.ts` | Metadata từng mục, các giải thích chính sách cũ, FAQ và gợi ý đọc theo ngữ cảnh. |
| `apps/web/content/editorial-photos.ts` | Ánh xạ ảnh/alt và bốn phong cách; không đổi dữ liệu catalog. |
| `apps/web/content/size-guide.ts` | Số đo mẫu hiện hữu dùng chung. |
| `apps/web/hooks/use-editorial-fragment.ts` | Điều hướng fragment khi phần nội dung đã sẵn sàng. |
| `apps/web/app/vintage-editorial.css` | Bố cục, responsive và hiệu ứng giới hạn trong các khu vực editorial. |
| `apps/web/components/fashion-home.tsx` | Tích hợp ảnh vào bìa, phong cách, lookbook và Journal; giữ link và dữ liệu sản phẩm. |
| `apps/web/components/fashion-editorial.tsx` | Ảnh bài đọc và giữ điều hướng đến nội dung. |
| `apps/web/components/editorial.tsx` | Giữ export hiện có, chuyển Policies sang component mới. |
| `apps/web/components/fashion-product.tsx` | Chỉ đổi nguồn bảng size sang module dùng chung. |
| `apps/web/content/brand.ts` | Làm rõ ảnh merchant tùy chọn và bộ editorial AI riêng. |
| `apps/web/app/chinh-sach/page.tsx` | Lấy cấu hình ban đầu qua server API hiện có. |
| `apps/web/app/layout.tsx` | Import CSS mới. |
| `apps/web/next.config.mjs` | Cho phép Next Image tối ưu đường dẫn local `/editorial/**`. |
| `scripts/build-editorial-media.mjs` | Nén ảnh phân phối, bảo toàn PNG gốc. |
| `tests/e2e/vintage-editorial.spec.ts` | Kiểm tra card, chính sách, FAQ, ảnh, fragment, responsive và motion. |
| `tests/e2e/vintage-editorial-commerce.spec.ts` | Hồi quy giỏ khách, SKU/giá thật và trang đăng nhập/checkout/admin ẩn danh. |
| `.gitignore` | Bỏ qua các thư mục build QA riêng `.next-vintage-qa/`, `.next-vintage-final/`. |

Không thay dependency hoặc package lock. Các thay đổi ảnh Tee từ lượt trước vẫn được giữ; chúng được báo cáo riêng trong `docs/colour-assets/TEE-20261120.md`.

## Kiểm chứng

Kết quả cuối, phạm vi kiểm tra và đường dẫn log được ghi trong [verification.json](verification.json). Bằng chứng local chi tiết ở `.local/vintage-editorial/`; ảnh nghiệm thu trong [previews](previews).

| Kiểm tra | Kết quả |
|---|---|
| Typecheck và build web production | PASS, gồm kiểm tra TypeScript cuối sau khi khôi phục file type môi trường development. |
| Unit hiện có | 48/48 PASS. |
| Chromium | 12 kịch bản chức năng PASS; hai kiểm tra trang chủ chạy lại PASS sau chỉnh góc bo ảnh bìa cuối cùng. |
| Microsoft Edge | 11 kịch bản đạt ở lượt đầu; kiểm tra 768 px gặp DOM chuyển tiếp khi reload. Đã thêm chờ đúng một nội dung và chạy lại ba kiểm tra liên quan: 3/3 PASS. Bằng chứng gộp bao phủ đủ 12 kịch bản; không tuyên bố lượt chạy toàn bộ mới trên Edge. |
| Ảnh qua HTTP production | 12 ảnh, 36 request PNG/WebP/Next Image, không 404; hash PNG, ảnh phân phối, kích thước và nội dung giải mã đúng nguồn. |
| Dữ liệu | 38 mô hình dữ liệu kinh doanh giữ nguyên hash, gồm ảnh sản phẩm và cấu hình. Mô hình thứ 39 là AuditLog: thêm một sự kiện 401 ẩn danh; các bản ghi cũ được giữ nguyên và đã đối chiếu hash. |
| Responsive và thao tác | Các chiều rộng 360, 768, 1024, 1440 px; năm mục hỗ trợ; FAQ có/không dấu, mở bằng bàn phím; bảng size và liên kết trực tiếp/reload; giảm chuyển động; giỏ khách dùng đúng SKU/giá. |

Trong quá trình kiểm tra đã sửa việc mở fragment trước khi nội dung streamed sẵn sàng, hiệu chỉnh crop ảnh và bảo toàn tỷ lệ người mẫu. Ảnh nghiệm thu cuối đã được xem trực quan. Safari/Firefox chưa được chạy; bằng chứng trình duyệt là Chromium và Edge.

```powershell
npm run typecheck
npm test
npx playwright test tests/e2e/vintage-editorial.spec.ts tests/e2e/vintage-editorial-commerce.spec.ts
```

Hai bộ E2E mới chỉ đọc API sản phẩm/cấu hình, thao tác giỏ khách trong trình duyệt và mock hồ sơ ẩn danh `/api/v1/me`. Không tạo tài khoản, xác nhận đơn, đăng nhập quản trị hoặc chạy thanh toán thật. So sánh hash trước/sau bao phủ mọi mô hình dữ liệu; báo cáo tách rõ các bản ghi bảo mật phát sinh, giữ nguyên log thay vì xóa để làm sạch kết quả.

Kiểm thử production dùng một build riêng và server tạm chỉ lắng nghe `127.0.0.1:3110`; không thay server development đang dùng trên cổng 3000. Không chạy các fixture ghi dữ liệu của bộ integration/admin cũ trên database cửa hàng.

## Triển khai và khôi phục

Đưa đủ mã UI, 12 WebP, PNG nguồn và hồ sơ ảnh vào cùng phiên bản. Build lại ứng dụng web theo quy trình đang dùng rồi khởi động lại web để nhận CSS, component và cấu hình Next Image mới. Thay đổi này không cần migrate hoặc seed database.

Kiểm tra lại năm mục hỗ trợ, ba liên kết Journal, bảng size, giỏ hàng và thông tin liên hệ sau triển khai. Nếu cần khôi phục, khôi phục riêng các file UI trong bảng trên về phiên bản trước; giữ các asset đã phát hành để tránh ảnh hưởng tham chiếu cũ. Bảo toàn các thay đổi ảnh sản phẩm từ lượt Tee và các dữ liệu kinh doanh hiện tại.
