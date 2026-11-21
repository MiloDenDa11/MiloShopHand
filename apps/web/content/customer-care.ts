import type { EditorialPhotoId } from "./editorial-photos";

export const careSections = [
  { id: "giao-hang", label: "Giao hàng & thanh toán", kicker: "FROM OUR HANDS TO YOURS", intro: "Từ lúc chọn được món đồ yêu thích đến khi nhận hàng. Những điều bạn cần biết, ở ngay đây.", photo: "order-packaging" },
  { id: "doi-tra", label: "Đổi trả & chọn size", kicker: "A FIT THAT FEELS LIKE YOU", intro: "Chọn phom áo bạn thấy thoải mái. Tìm đúng số đo, hoặc xem cách gửi yêu cầu đổi trả.", photo: "size-measurement" },
  { id: "bao-mat", label: "Quyền riêng tư", kicker: "YOUR INFORMATION, YOUR CHOICE", intro: "Hiểu thông tin nào được sử dụng và những lựa chọn bạn có khi mua sắm cùng Milo.", photo: "privacy-still-life" },
  { id: "faq", label: "Câu hỏi thường gặp", kicker: "A LITTLE HELP, EVERYDAY", intro: "Một vài câu trả lời để việc mua sắm nhẹ nhàng hơn. Bạn có thể tìm nhanh theo điều mình cần.", photo: "customer-service" },
  { id: "lien-he", label: "Liên hệ", kicker: "LET’S HAVE A CONVERSATION", intro: "Về một chiếc áo, một đơn hàng, hay điều bạn muốn hỏi. Tìm kênh hỗ trợ được cửa hàng công bố tại đây.", photo: "boutique-atmosphere" },
] as const;
export type CareTab = typeof careSections[number]["id"];

// Existing policy explanations retained; configurable policy text stays in /config.
export const policyDetails = {
  shipping: [
    { title: "Các khoản trong thanh toán", text: "Tổng thanh toán = tiền hàng − giảm hàng hóa + phí vận chuyển − giảm phí vận chuyển + thuế/phụ phí được công bố trước khi xác nhận. Chỉ áp dụng một mã ưu đãi mỗi đơn; không cộng dồn. Mức giảm phần trăm làm tròn xuống theo VND nguyên, phần dư phân bổ theo giá trị các dòng đủ điều kiện." },
    { title: "Xác nhận thanh toán", text: "QR chỉ được xác nhận khi backend nhận và xác minh dữ liệu từ nhà cung cấp. Với COD, trạng thái giao thành công, tiền đơn vị vận chuyển đã thu và tiền chuyển về cửa hàng được theo dõi riêng." },
    { title: "Chứng từ đơn hàng", text: "Phiếu đơn hàng trong hệ thống là chứng từ bán hàng nội bộ; chưa phải hóa đơn điện tử do cơ quan có thẩm quyền chấp nhận." },
  ],
  returns: [
    { title: "Gửi và xử lý yêu cầu", text: "Tạo yêu cầu từ trang chi tiết đơn đã giao, chọn dòng hàng, số lượng và lý do. Đổi size được cửa hàng kiểm tra tồn, xác nhận chênh lệch giá và phí trước khi xử lý. Hoàn tiền được phê duyệt riêng và chỉ hoàn tất khi có chứng từ chi trả." },
    { title: "Hoàn một phần & kiểm tra hàng", text: "Giảm giá khi hoàn một phần được phân bổ từ snapshot của dòng hàng, không dùng giá sản phẩm hiện tại. Hàng giao thất bại không đồng nghĩa đã quay lại kho; hàng hoàn chỉ được bán lại sau thực nhận và kiểm tra chất lượng." },
  ],
  privacy: [
    { title: "Dữ liệu & sự đồng ý", text: "Thông tin bắt buộc: email, họ tên, mật khẩu; địa chỉ và điện thoại khi mua hàng. Tọa độ là tùy chọn, chỉ lấy khi bạn chủ động cấp quyền, không theo dõi liên tục. Marketing cần lựa chọn đồng ý riêng." },
    { title: "Phiên đăng nhập của bạn", text: "Phiên đăng nhập có thời hạn tuyệt đối 7 ngày và hết hiệu lực sau 30 phút không hoạt động. Bạn có thể xem và thu hồi trong tài khoản. Token xác minh hết hạn sau 24 giờ, token đặt lại mật khẩu sau 30 phút." },
    { title: "Truy cập & quản lý thông tin", text: "Bạn có thể xóa địa chỉ đã lưu hoặc liên hệ để yêu cầu dữ liệu. Snapshot giao dịch, đối soát và nhật ký cần được giữ theo chính sách vận hành và yêu cầu áp dụng. Cửa hàng phải công bố thời hạn lưu cụ thể trước khi hoạt động thật." },
  ],
};

export const careFaqs = [
  { id: "ordering", topic: "Mua hàng", question: "Làm sao đặt hàng?", answer: "Chọn màu, size và số lượng, thêm vào giỏ, đăng nhập và xác minh email, nhập địa chỉ, kiểm tra phí, rồi xác nhận." },
  { id: "reservation", topic: "Mua hàng", question: "Thêm vào giỏ đã giữ hàng chưa?", answer: "Chưa. Hàng chỉ được giữ khi hệ thống tạo đơn thành công." },
  { id: "location", topic: "Giao hàng", question: "Tôi từ chối định vị có mua được không?", answer: "Có. Luôn có form nhập địa chỉ thủ công." },
  { id: "payment", topic: "Thanh toán", question: "Tôi đã chuyển khoản nhưng chưa được xác nhận?", answer: "Chờ cập nhật từ nhà cung cấp. Không chuyển lần nữa khi chưa kiểm tra. Liên hệ cửa hàng kèm mã đơn; ảnh chuyển khoản không tự xác nhận thanh toán." },
  { id: "cancellation", topic: "Đổi trả & size", question: "Đơn đã gửi có hủy trực tiếp được không?", answer: "Sau bàn giao vận chuyển, vui lòng liên hệ hỗ trợ hoặc tạo yêu cầu đổi trả khi đã nhận hàng." },
  { id: "photos", topic: "Mua hàng", question: "Hình ảnh hiện tại là ảnh thật?", answer: "Ảnh gắn nhãn Milo Design và ảnh editorial là hình ảnh mô phỏng thiết kế bằng AI, không phải ảnh chụp hàng hóa thực tế. Màu sắc thực tế có thể khác theo ánh sáng và màn hình." },
  { id: "measurements", topic: "Đổi trả & size", question: "Tôi nên chọn size thế nào?", answer: "Bảng size sản phẩm mẫu dùng cm; đo một chiếc áo bạn đang mặc thoải mái để so sánh.", href: "/chinh-sach?tab=doi-tra#size-guide", cta: "Xem bảng size & cách đo" },
];

export type CareVisual = { photo: EditorialPhotoId; kicker: string; title: string; text: string; href: string; cta: string; tall?: boolean };
export const careVisuals: Record<CareTab, CareVisual[]> = {
  "giao-hang": [
    { photo: "parcel-delivery", kicker: "ORDER CARE", title: "Một đơn hàng. Từng bước rõ ràng.", text: "Xem lại thông tin và trạng thái đơn hàng trong tài khoản của bạn.", href: "/tai-khoan", cta: "Đến tài khoản", tall: true },
    { photo: "quality-inspection", kicker: "WHEN IT ARRIVES", title: "Khi món đồ đến tay.", text: "Nếu cần hỗ trợ về sản phẩm nhận được, hãy chuẩn bị mã đơn và mô tả vấn đề.", href: "/chinh-sach?tab=lien-he", cta: "Liên hệ Milo" },
  ],
  "doi-tra": [
    { photo: "quality-inspection", kicker: "ORDER CARE", title: "Chú ý những chi tiết nhỏ.", text: "Xem điều kiện đổi trả và cách cửa hàng kiểm tra sản phẩm hoàn về.", href: "#return-process", cta: "Quy trình đổi trả", tall: true },
    { photo: "garment-care", kicker: "WEAR LONGER", title: "Chăm một chiếc áo, mặc thêm nhiều ngày.", text: "Đọc nhãn chăm sóc và hướng dẫn riêng của từng chất liệu.", href: "/phong-cach#care", cta: "Đọc hướng dẫn" },
  ],
  "bao-mat": [
    { photo: "privacy-still-life", kicker: "YOUR CHOICE", title: "Chủ động với thông tin của mình.", text: "Xem tài khoản, địa chỉ đã lưu và các phiên đăng nhập.", href: "/tai-khoan", cta: "Quản lý tài khoản", tall: true },
    { photo: "customer-service", kicker: "WE’RE LISTENING", title: "Có điều bạn muốn hỏi?", text: "Liên hệ cửa hàng khi cần hỗ trợ về dữ liệu cá nhân.", href: "/chinh-sach?tab=lien-he", cta: "Kênh liên hệ" },
  ],
  "faq": [
    { photo: "customer-service", kicker: "NEED A HAND?", title: "Mỗi câu hỏi đều có một chỗ ở đây.", text: "Chưa thấy điều bạn cần? Xem kênh hỗ trợ hiện có của Milo.", href: "/chinh-sach?tab=lien-he", cta: "Liên hệ Milo", tall: true },
    { photo: "size-measurement", kicker: "SIZE GUIDE", title: "Một chút đo đạc. Vừa ý hơn.", text: "So sánh với chiếc áo bạn đang mặc thoải mái.", href: "/chinh-sach?tab=doi-tra#size-guide", cta: "Xem bảng size" },
  ],
  "lien-he": [
    { photo: "customer-service", kicker: "MILO CUSTOMER CARE", title: "Bắt đầu bằng một lời chào.", text: "Chuẩn bị mã đơn nếu cần hỗ trợ về lần mua hàng của bạn.", href: "/tai-khoan", cta: "Tìm đơn hàng", tall: true },
    { photo: "order-packaging", kicker: "BEFORE YOU ASK", title: "Có thể câu trả lời ở ngay đây.", text: "Tìm thông tin về giao hàng, thanh toán và đổi trả.", href: "/chinh-sach?tab=faq", cta: "Đọc câu hỏi thường gặp" },
  ],
};
