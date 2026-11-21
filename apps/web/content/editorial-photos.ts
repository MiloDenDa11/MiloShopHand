// AI editorial concepts wearing MiloShopHand designs; separate from catalogue photos.
// Exact prompts, sources and hashes: docs/vintage-editorial/images.json.
const root = "/editorial/branded-20261120-v2";
export const editorialPhotos = {
  "everyday-basic": { src: `${root}/everyday-basic.webp`, alt: "Airy Cotton Tee màu ngà với logo ML trước ngực, phối quần nâu xếp ly", position: "50% 45%" },
  "vintage-bomber": { src: `${root}/vintage-bomber.webp`, alt: "ML Flight MA1 Bomber olive viền ngà có logo ML, phối Airy Cotton Tee", position: "50% 45%" },
  "oversized-outfit": { src: `${root}/oversized-outfit.webp`, alt: "Mono Boxy Tee màu kem có logo ML, phom rộng phối quần charcoal và giày vải", position: "50% 45%" },
  "streetwear-outfit": { src: `${root}/streetwear-outfit.webp`, alt: "ML Racer Clean Jacket charcoal viền ngà có logo ML, phối quần cargo olive", position: "50% 45%" },
  "order-packaging": { src: `${root}/order-packaging.webp`, alt: "Gói Airy Cotton Tee có logo ML trong giấy lụa và hộp kraft trên bàn gỗ", position: "50% 55%" },
  "parcel-delivery": { src: `${root}/parcel-delivery.webp`, alt: "Người mặc Airy Cotton Tee logo ML nhận kiện hàng MiloShopHand ở cửa boutique", position: "100% 50%" },
  "size-measurement": { src: `${root}/size-measurement.webp`, alt: "Đo ngang ngực Airy Cotton Tee trải phẳng, logo ML ở ngực trái", position: "50% 50%" },
  "garment-care": { src: `${root}/garment-care.webp`, alt: "Giặt nhẹ Airy Cotton Tee có logo ML bằng tay trong chậu men", position: "65% 50%" },
  "boutique-atmosphere": { src: `${root}/boutique-atmosphere.webp`, alt: "Boutique ý tưởng trưng bày bomber và tee có logo ML cùng họa tiết MiloShopHand", position: "50% 50%" },
  "customer-service": { src: `${root}/customer-service.webp`, alt: "Tư vấn tại boutique ý tưởng với Airy Cotton Tee logo ML và bomber họa tiết MiloShopHand", position: "50% 45%" },
  "quality-inspection": { src: `${root}/quality-inspection.webp`, alt: "Kiểm tra đường may Airy Cotton Tee có logo ML trên bàn gỗ", position: "100% 50%" },
  "privacy-still-life": { src: `${root}/privacy-still-life.webp`, alt: "Sổ và phong bì đóng kín cạnh Airy Cotton Tee gấp gọn có logo ML", position: "100% 50%" },
} as const;
export type EditorialPhotoId = keyof typeof editorialPhotos;
export const styleEdits = [
  { no: "01", title: "Everyday basic.", sub: "Ít chi tiết. Dễ phối. Mặc mỗi ngày.", href: "/san-pham?style=minimal", label: "BASIC", photo: "everyday-basic" },
  { no: "02", title: "An old soul.", sub: "Cảm hứng retro từ những lớp bomber.", href: "/san-pham?category=ao-bomber", label: "VINTAGE INSPIRED", photo: "vintage-bomber" },
  { no: "03", title: "Room to move.", sub: "Phom rộng, thoải mái theo nhịp của bạn.", href: "/san-pham?fit=Oversized", label: "OVERSIZED", photo: "oversized-outfit" },
  { no: "04", title: "Street, your way.", sub: "Tự tin bước ra đường theo cách riêng.", href: "/san-pham?style=streetwear", label: "STREETWEAR", photo: "streetwear-outfit" },
] as const;
export const journalPhotoIds = { everyday: "everyday-basic", vintage: "vintage-bomber", care: "garment-care" } as const;
