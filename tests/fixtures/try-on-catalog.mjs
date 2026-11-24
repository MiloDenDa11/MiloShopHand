// Isolated UI fixtures. Never seeded into a database or shown by the shop server.
import { readFileSync } from 'node:fs';
const designs = JSON.parse(readFileSync('apps/web/content/polo-designs.json', 'utf8'));
export const polos = designs.map(design => ({
  id: `fixture-${design.id}`, slug: design.slug, name: design.name, price: 550000,
  material: design.material, fit: design.fit, description: design.description,
  category: { id: 'fixture-polo', name: 'Áo polo', slug: 'ao-polo' },
  design: { kind: 'polo', commercialStatus: 'active', pricingStatus: 'published', mediaPresentation: 'photo' },
  images: design.colors.map(color => ({ url: `${color.image}?view=front`, color: color.name, alt: `${design.name} — ${color.name}` })),
  variants: design.colors.flatMap((color, index) => ['S', 'M', 'L', 'XL'].map(size => ({ id: `fixture-${design.id}-${index}-${size}`, sku: `FIXTURE-${design.id}-${index}-${size}`, color: color.name, colorHex: color.hex, size, price: 550000, available: 20 }))),
  reviews: [], collections: [], styles: [], related: [], care: 'Thông tin chăm sóc trong dữ liệu kiểm thử.',
}));
export const missingColorProduct = {
  ...polos[0], id: 'fixture-missing', slug: 'fixture-missing-color', name: 'Fixture áo thiếu ảnh màu',
  images: [{ url: '/collection-ai/ml-hoodie-minimal-no-pocket.png?view=front', color: 'Đen' }],
  category: { id: 'fixture-hoodie', name: 'Áo hoodie', slug: 'ao-hoodie' }, design: { kind: 'hoodie' },
  variants: ['Đen', 'Trắng'].map(color => ({ id: `fixture-missing-${color}`, color, colorHex: '#222222', size: 'M', price: 550000, available: 20 })),
};
export const products = [...polos, missingColorProduct];
