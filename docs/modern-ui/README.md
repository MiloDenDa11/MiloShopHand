# Modern Vintage — MiloShopHand

Giao diện được nâng cấp trên source hiện tại cho toàn bộ cửa hàng, tài khoản, checkout, đơn hàng, phòng thử đồ và 18 mục quản trị. Giữ nguyên API, schema database, giá/tồn kho, luồng thanh toán và dữ liệu cửa hàng. [Audit trước triển khai](AUDIT.md) và [kiểm kê source](inventory.json) ghi rõ phạm vi.

## Hệ thống thiết kế

| Thuộc tính | Giá trị / cách dùng |
| --- | --- |
| Primary | Nâu cà phê `#76533c`, hover `#5e402e` |
| Nền / bề mặt | Ivory `#f8f5ef`, trắng kem `#fffdfa`, beige `#f1ebe2` |
| Chữ / accent | Charcoal `#302b26`, chữ phụ `#756d63`, olive `#626c4c` |
| Border | Neutral ấm `#e4dcd1`, 1 px |
| Radius | 8, 12, 16, 22, 24 px; chỉ dùng circle/pill cho icon, badge, tab phù hợp |
| Control | Input/select/button mặc định 48 px; nút phụ 40 px |
| Khoảng cách | Tokens 4, 8, 12, 16, 20, 24, 32, 40, 48 px |
| Font | Giữ Inter/Lora local và font tiếng Việt/italic hiện có |
| Shadow | Ba cấp nhẹ cho card, popup, modal |
| Chuyển động | 150–250 ms; hover/focus/active, popup, drawer, skeleton, yêu thích |
| Giảm chuyển động | Tắt marquee/scroll mượt; giảm toàn bộ transition/animation khi `prefers-reduced-motion` |

`layout.tsx` tải `globals.css` và `fashion.css` làm nền bố cục, sau đó `design-system.css` cung cấp tokens và các component thống nhất. Lớp `milo-ui.css` cũ không còn được import; bỏ quy tắc ép mọi nút thành pill và nền hoa lặp. Ảnh logo, font, sản phẩm và 360° vẫn dùng bộ hiện hữu.

## Component và trải nghiệm

- **Input/textarea:** border/radius/padding, placeholder, focus ring, disabled, `aria-invalid`, `:user-invalid` và `:user-valid`. Checkbox/radio có biểu tượng và trạng thái chọn rõ, hỗ trợ focus và forced-colors. File input, date/datetime input dùng cùng theme.
- **Select dùng chung:** 19 vị trí source ở bộ lọc, sắp xếp, checkout, tài khoản, giỏ, quản trị và đổi size. Popup bo góc, tìm kiếm tiếng Việt không dấu khi có hơn 7 lựa chọn, hỗ trợ lựa chọn disabled, Arrow/Home/End/Enter/Escape/Tab, focus và nhãn. Giữ native select cho `name`, `FormData`, required, reset và onChange hiện có; chỉ có một combobox tương tác để tránh chọn nhầm control trong lúc hydrate. Popup định vị lại khi cuộn và đóng khi resize/nhấn ngoài.
- **Button:** primary/secondary/outline/ghost/icon/danger, disabled, hover/active, spinner từ trạng thái `busy` sẵn có. Không thêm thao tác nghiệp vụ hoặc nút nổi không có mục đích sử dụng.
- **DataTable dùng chung:** thay bảng quản trị cũ, không tạo hai phiên bản. Tìm nhanh trong các dòng đã tải, không dấu, 10/20/50 dòng/trang, số dòng/trang hiện tại, bảng có vùng cuộn nhận focus, header, zebra, hover và nút tác vụ. Giữ nguyên cell/action handler và dữ liệu API.
- **Card/navigation:** thẻ sản phẩm, ảnh, giá, badges, yêu thích và Dùng thử; hero, bộ sưu tập/journal, menu/search/header, breadcrumb, tabs và pagination. Footer chuyển sang nền nâu đậm với chữ đủ tương phản.
- **Account/commerce:** avatar từ tên tài khoản thật, sidebar/tabs, địa chỉ, phiên đăng nhập, thông báo, giỏ, đổi SKU, checkout, voucher, QR/COD, timeline đơn, đánh giá, đổi trả, trạng thái và file upload.
- **Modal/feedback:** dialog/drawer có radius/overlay/motion thống nhất; modal quản trị có tên và khóa cuộn; toast, alert, success, empty state và skeleton.
- **Admin:** sidebar có icon cho đủ 18 mục, thu gọn trên desktop, cuộn ngang trên mobile. Dashboard/stat/chart, toolbar, form, table, dialog, CRUD dùng cùng theme. Chặn dữ liệu trả muộn/khác tab để việc chuyển giữa đơn hàng/sản phẩm và các mục khác không làm lỗi render.
- **Phòng thử đồ/360°:** đồng bộ bề mặt, control, hướng dẫn, xác nhận và nút; giữ nguyên chọn/xóa ảnh cá nhân, consent, ảnh đúng màu, xoay ảnh, giỏ và trạng thái AI để sau.

## Phủ toàn bộ trang

| Phạm vi | Nâng cấp |
| --- | --- |
| `/` | Header, hero, nhóm sản phẩm, thẻ, category tabs, khối phong cách/journal/community, footer |
| `/san-pham`, `/san-pham/[slug]` | Bộ lọc/sắp xếp, phân trang, card, gallery/360°, chọn màu/size/số lượng, mua ngay, bảng size, đánh giá |
| `/bo-suu-tap`, `/phong-cach`, `/chinh-sach` | Card nội dung, typography, navigation, accordion, surface |
| `/dang-nhap`, `/dang-ky`, `/quen-mat-khau`, `/dat-lai-mat-khau`, `/xac-minh` | Art panel, form, field/error/success/disabled/loading |
| `/tai-khoan` | Hồ sơ, yêu thích, đơn, địa chỉ, phiên, thông báo, đổi trả, bảo mật |
| `/gio-hang`, `/thanh-toan`, `/don-hang/[id]` | SKU, số lượng, địa chỉ, checkbox/radio, voucher, tổng tiền, thanh toán, timeline |
| `/dung-thu/[slug]` | Ảnh cá nhân, lựa chọn sản phẩm, consent, kết quả chờ AI và responsive |
| `/admin` | Dashboard và toàn bộ 18 mục quản trị, CRUD, tìm/lọc/phân trang bảng, modal và sidebar |
| Loading/error/not-found dùng chung | Skeleton, alert, empty state, button và typography kế thừa theme |

## File thay đổi trong đợt Modern Vintage

| File | Mục đích |
| --- | --- |
| `apps/web/app/design-system.css` | Tokens và theme cho mọi nhóm UI/trang |
| `apps/web/app/layout.tsx` | Đổi entry stylesheet sang design system mới |
| `apps/web/next-env.d.ts` | Next CLI sinh lại tham chiếu route types khi build/typegen |
| `apps/web/components/ui/select.tsx` | Select dùng chung và popup |
| `apps/web/components/ui/data-table.tsx` | Bảng dùng chung, tìm nhanh và phân trang |
| `apps/web/components/admin.tsx` | Sidebar/icon, DataTable, modal, trạng thái, tải dữ liệu đúng tab |
| `apps/web/components/account.tsx` | Select, avatar, selected state, status và loading |
| `apps/web/components/checkout.tsx` | Select và trạng thái loading của thao tác có sẵn |
| `apps/web/components/store.tsx` | Select của bộ lọc/sắp xếp |
| `apps/web/components/exchanges.tsx` | Select đổi size và loading |
| `apps/web/components/variant-switcher.tsx` | Select đổi SKU trong giỏ |
| `apps/web/components/site-shell.tsx` | Active navigation và tooltip icon |
| `apps/web/components/editorial.tsx` | Active state chính sách |
| `apps/web/components/fashion-product.tsx` | aria-busy/spinner cho thêm giỏ/mua ngay |
| `apps/web/components/try-on.tsx` | aria-busy cho thêm giỏ trong phòng thử |
| `tests/e2e/modern-ui.spec.ts` | Dropdown, toàn bộ admin, CRUD, bảng, responsive, focus và tương phản |
| `tests/e2e/milo-design.spec.ts` | Nghiệm thu theme mới thay cho yêu cầu nền hoa của giao diện trước |
| `README.md`, `docs/modern-ui/*` | Audit, hướng dẫn theme, phạm vi và kết quả |

Các thay đổi source khác đã có từ các đợt ảnh/mua sắm/Dùng thử trước đó được giữ nguyên, không tính là thay đổi mới của đợt này.

## Công nghệ

Dùng React/TypeScript, CSS variables/transition/animation, HTML Popover API và Lucide đã có trong dự án. Giữ Next.js, Tailwind, Motion và các thư viện 3D hiện hữu. Không thêm dependency hay sửa package-lock; không thay kiến trúc.

## Kiểm tra

- 39/39 unit test: đạt.
- 25/25 integration tại mốc nâng cấp UI: đạt trên `milo_integration_test`, Redis DB1; gồm giá/checkout, giữ kho, idempotency, voucher, webhook, QR/COD, auth/MFA và ảnh riêng tư. Sau mốc này, yêu cầu MFA Admin đã được gỡ theo [cập nhật xác thực](../ADMIN-AUTH.md).
- Typecheck: đạt. Build đầy đủ shared/API/worker/web: đạt.
- Kiểm tra trực quan 16 trang tại 360/768/1440 px; ảnh/báo cáo nằm trong `.local/modern-ui`.
- Kiểm tra bổ sung menu tại 360/768/960/1440 px đạt; ảnh chụp bảng quản trị mobile chờ dữ liệu tải xong, 18 tab được kiểm tra cả phản hồi API và giao diện.
- **63/63 E2E production đạt** trên `milo_redesign_test`, Redis DB2, cổng 3100/4100 riêng. Bao gồm toàn bộ 18 mục quản trị, CRUD, dropdown, phân trang, tìm/lọc, QR/COD, tài khoản, yêu thích, gallery/360° và phòng thử đồ. Không lỗi JavaScript/hydration trong các kiểm tra UI mới.
- [Báo cáo máy đọc được](verification.json); 48 cấu hình trực quan không tràn ngang. Runner tự dừng dịch vụ QA; cửa hàng dev ở 3000/4000 được giữ chạy.

## Giới hạn hiện tại

- Popup chọn ngày/giờ vẫn theo trình duyệt/hệ điều hành; field dùng theme chung. Không bổ sung thư viện lịch để thay đổi cách nhập ngày và timezone nghiệp vụ hiện tại.
- Kiểm thử tự động bằng Chromium; chưa khẳng định đã kiểm tra trên thiết bị iOS/Android thật hoặc mọi trình duyệt.
- AI tạo ảnh trong phòng thử vẫn để sau theo yêu cầu trước đó. Không lấy/tạo thêm ảnh trong đợt này.
- Thanh toán/vận chuyển E2E dùng adapter phát triển hiện hữu; kết quả không chứng nhận giao dịch nhà cung cấp thật.
