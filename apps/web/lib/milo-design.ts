// Public presentation only. Source/provenance data stays intact in storage.
export function miloDesignText(value:string="") {
  return value
    .replace(/ML Atelier\s*[—–-]\s*thiết kế AI/gi,"Milo Design")
    .replace(/thiết kế\s*\/\s*mockup AI(?:\s*·\s*MiloShopHand)?/gi,"Milo Design")
    .replace(/thiết kế mockup AI(?:\s+MiloShopHand)?/gi,"Milo Design")
    .replace(/(?:ảnh ý tưởng AI gốc|thiết kế AI nhiều góc|thiết kế AI|mockup AI|AI-generated)/gi,"Milo Design");
}
