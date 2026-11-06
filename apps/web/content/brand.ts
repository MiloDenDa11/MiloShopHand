// Only add photographs of the corresponding MILOSHOPHAND garments, with usage rights.
// Null/empty values deliberately render an editorial text layout, never a substitute image.
export type EditorialPhoto = {
  src: string;
  alt: string;
  caption: string;
  href: string;
  credit?: string;
};
export const editorialAssets: {
  hero: EditorialPhoto | null;
  lookbook: EditorialPhoto[];
  community: EditorialPhoto[];
  instagram: string | null;
} = { hero: null, lookbook: [], community: [], instagram: null };

export const journalArticles = [
  {
    id: "everyday",
    category: "THE EVERYDAY GUIDE",
    title: "Một chiếc áo tốt. Nhiều cách là chính mình.",
    excerpt:
      "Bắt đầu từ những món đồ dễ mặc, để sự thoải mái dẫn lối cho phong cách mỗi ngày.",
    text: "Một chiếc tee, một phom áo vừa ý và một bảng màu bạn thích là điểm bắt đầu. Thử phối áo phông cùng lớp khoác nhẹ, thay đổi cách sơ vin hoặc xắn tay áo để tìm tỷ lệ khiến bạn thấy tự nhiên nhất.",
    href: "/san-pham?style=minimal",
    cta: "Khám phá đồ basic",
    readTime: "3 phút đọc",
  },
  {
    id: "vintage",
    category: "STYLE NOTES / 90s SPIRIT",
    title: "Chút hoài niệm, theo cách rất hôm nay.",
    excerpt:
      "Bomber, màu olive và những lớp áo trung tính. Tinh thần cũ trong một nhịp sống mới.",
    text: "Vintage là cảm hứng, không phải một công thức phải làm theo. Một lớp bomber trên nền tee đơn sắc tạo điểm nhấn vừa đủ. Giữ các lớp bên trong gọn gàng, thử tông kem, nâu và olive, rồi chọn tỷ lệ rộng vừa với cách bạn thích vận động.",
    href: "/san-pham?category=ao-bomber",
    cta: "Chọn một lớp bomber",
    readTime: "4 phút đọc",
  },
  {
    id: "care",
    category: "TAKE CARE / WEAR LONGER",
    title: "Mặc lâu hơn, bắt đầu từ cách chăm áo.",
    excerpt:
      "Đọc nhãn chăm sóc, giặt nhẹ và cất áo đúng cách. Những thói quen nhỏ cho món đồ yêu thích.",
    text: "Luôn ưu tiên hướng dẫn riêng trên nhãn sản phẩm. Với áo cotton, bạn có thể lộn trái khi giặt, tách màu và chọn chế độ nhẹ. Tránh dùng chất tẩy mạnh; phơi nơi thông thoáng. Với áo khoác có lớp phủ, kiểm tra hướng dẫn của từng chất liệu trước khi giặt máy.",
    href: "/chinh-sach?tab=doi-tra",
    cta: "Xem hướng dẫn & hỗ trợ",
    readTime: "3 phút đọc",
  },
];
