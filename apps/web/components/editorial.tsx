"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { useResource } from "./store";
import { useShop, ErrorBox } from "./client";
export {
  FashionCollections as Collections,
  FashionJournal as Journal,
} from "./fashion-editorial";
export function Policies() {
  const params = useSearchParams(),
    { config } = useShop();
  const tab = params.get("tab") || "giao-hang";
  const links = [
    ["giao-hang", "Giao hàng & thanh toán"],
    ["doi-tra", "Đổi trả & chọn size"],
    ["bao-mat", "Quyền riêng tư"],
    ["faq", "Câu hỏi thường gặp"],
    ["lien-he", "Liên hệ"],
  ];
  return (
    <div className="container section">
      <p className="eyebrow">WE'RE HERE FOR YOU</p>
      <h1>Milo luôn ở đây.</h1>
      <div className="policy-layout" style={{ marginTop: 35 }}>
        <nav className="policy-nav">
          {links.map(([id, label]) => (
            <Link key={id} href={`/chinh-sach?tab=${id}`}>
              {label}
            </Link>
          ))}
        </nav>
        <article className="prose">
          <h2>{links.find((l) => l[0] === tab)?.[1]}</h2>
          {tab === "giao-hang" && (
            <>
              <p>{config?.shippingPolicy}</p>
              <p>
                Tổng thanh toán = tiền hàng − giảm hàng hóa + phí vận chuyển −
                giảm phí vận chuyển + thuế/phụ phí được công bố trước khi xác
                nhận. Chỉ áp dụng một mã ưu đãi mỗi đơn; không cộng dồn. Mức
                giảm phần trăm làm tròn xuống theo VND nguyên, phần dư phân bổ
                theo giá trị các dòng đủ điều kiện.
              </p>
              <p>
                QR chỉ được xác nhận khi backend nhận và xác minh dữ liệu từ nhà
                cung cấp. Với COD, trạng thái giao thành công, tiền đơn vị vận
                chuyển đã thu và tiền chuyển về cửa hàng được theo dõi riêng.
              </p>
              <p>
                Phiếu đơn hàng trong hệ thống là chứng từ bán hàng nội bộ; chưa
                phải hóa đơn điện tử do cơ quan có thẩm quyền chấp nhận.
              </p>
            </>
          )}
          {tab === "doi-tra" && (
            <>
              <p>{config?.returnPolicy}</p>
              <p>
                Tạo yêu cầu từ trang chi tiết đơn đã giao, chọn dòng hàng, số
                lượng và lý do. Đổi size được cửa hàng kiểm tra tồn, xác nhận
                chênh lệch giá và phí trước khi xử lý. Hoàn tiền được phê duyệt
                riêng và chỉ hoàn tất khi có chứng từ chi trả.
              </p>
              <p>
                Giảm giá khi hoàn một phần được phân bổ từ snapshot của dòng
                hàng, không dùng giá sản phẩm hiện tại. Hàng giao thất bại không
                đồng nghĩa đã quay lại kho; hàng hoàn chỉ được bán lại sau thực
                nhận và kiểm tra chất lượng.
              </p>
              <p>
                Bảng size sản phẩm mẫu dùng cm; đo một chiếc áo bạn đang mặc
                thoải mái để so sánh.
              </p>
            </>
          )}
          {tab === "bao-mat" && (
            <>
              <p>{config?.privacyPolicy}</p>
              <p>
                Thông tin bắt buộc: email, họ tên, mật khẩu; địa chỉ và điện
                thoại khi mua hàng. Tọa độ là tùy chọn, chỉ lấy khi bạn chủ động
                cấp quyền, không theo dõi liên tục. Marketing cần lựa chọn đồng
                ý riêng.
              </p>
              <p>
                Phiên đăng nhập có thời hạn tuyệt đối 7 ngày và hết hiệu lực sau
                30 phút không hoạt động. Bạn có thể xem và thu hồi trong tài
                khoản. Token xác minh hết hạn sau 24 giờ, token đặt lại mật khẩu
                sau 30 phút.
              </p>
              <p>
                Bạn có thể xóa địa chỉ đã lưu hoặc liên hệ để yêu cầu dữ liệu.
                Snapshot giao dịch, đối soát và nhật ký cần được giữ theo chính
                sách vận hành và yêu cầu áp dụng. Cửa hàng phải công bố thời hạn
                lưu cụ thể trước khi hoạt động thật.
              </p>
            </>
          )}
          {tab === "faq" && (
            <>
              {[
                [
                  "Làm sao đặt hàng?",
                  "Chọn màu, size và số lượng, thêm vào giỏ, đăng nhập và xác minh email, nhập địa chỉ, kiểm tra phí, rồi xác nhận.",
                ],
                [
                  "Thêm vào giỏ đã giữ hàng chưa?",
                  "Chưa. Hàng chỉ được giữ nguyên tử khi backend tạo đơn thành công.",
                ],
                [
                  "Tôi từ chối định vị có mua được không?",
                  "Có. Luôn có form nhập địa chỉ thủ công.",
                ],
                [
                  "Tôi đã chuyển khoản nhưng chưa được xác nhận?",
                  "Chờ cập nhật từ nhà cung cấp. Không chuyển lần nữa khi chưa kiểm tra. Liên hệ cửa hàng kèm mã đơn; ảnh chuyển khoản không tự xác nhận thanh toán.",
                ],
                [
                  "Đơn đã gửi có hủy trực tiếp được không?",
                  "Sau bàn giao vận chuyển, vui lòng liên hệ hỗ trợ hoặc tạo yêu cầu đổi trả khi đã nhận hàng.",
                ],
                [
                  "Hình ảnh hiện tại là ảnh thật?",
                  "Các thiết kế chưa có ảnh chụp đang hiển thị thông tin sản phẩm, không dùng hình minh họa thay ảnh thật. Ảnh thực tế sẽ được cập nhật theo từng sản phẩm và màu sắc.",
                ],
              ].map(([q, a]) => (
                <details key={q}>
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </>
          )}
          {tab === "lien-he" && (
            <>
              <p>
                Email:{" "}
                <a
                  href={`mailto:${config?.contactEmail || "hello@miloshophand.local"}`}
                >
                  {config?.contactEmail || "hello@miloshophand.local"}
                </a>
              </p>
              <p>
                Khi liên hệ về đơn hàng, vui lòng cung cấp mã đơn và mô tả vấn
                đề. Không gửi mật khẩu, mã TOTP hoặc mã khôi phục.
              </p>
              <p className="development-note">
                Cửa hàng đang ở môi trường phát triển. Thông tin pháp nhân, địa
                chỉ kinh doanh, điện thoại và giờ hỗ trợ cần được quản trị cấu
                hình trước khi mở bán thật.
              </p>
            </>
          )}
        </article>
      </div>
    </div>
  );
}
