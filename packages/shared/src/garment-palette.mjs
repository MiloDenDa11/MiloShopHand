/** Shared by the interactive viewer, offline product renders and validation. */
export const CORE_GARMENT_COLORS = [
  { key: "BLACK", name: "Đen", hex: "#151515" },
  { key: "WHITE", name: "Trắng", hex: "#f8f7f2" },
  { key: "BURGUNDY", name: "Đỏ mận", hex: "#722f37" },
];
export const GARMENT_BRAND_VERSION = "floral-v2";

/** @param {string} hex */
export function luminance(hex) {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) throw new Error(`Invalid fabric colour: ${hex}`);
  const rgb = [0, 2, 4].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16) / 255)
    .map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
}
/** @param {string} a @param {string} b */
export function contrastRatio(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
/** @param {string} fabricHex @param {string | undefined} accentHex */
export function garmentPalette(fabricHex, accentHex) {
  const candidates = ["#ffffff", "#000000"];
  const ink = candidates.sort((a, b) => contrastRatio(fabricHex, b) - contrastRatio(fabricHex, a))[0];
  const isCore = CORE_GARMENT_COLORS.some((color) => color.hex.toLowerCase() === fabricHex.toLowerCase());
  const seams = "#" + [1, 3, 5].map((offset) => Math.round(parseInt(fabricHex.slice(offset, offset + 2), 16) * .70).toString(16).padStart(2, "0")).join("");
  return { fabric: fabricHex, ink, trim: !isCore && accentHex ? accentHex : ink, seams, contrast: contrastRatio(fabricHex, ink) };
}

/** No Three.js import: usable in both build scripts and browser code.
 * @param {any} root @param {string} fabricHex @param {string | undefined} accentHex */
export function applyGarmentPalette(root, fabricHex, accentHex) {
  const palette = garmentPalette(fabricHex, accentHex);
  root.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material.name === "Fabric") material.color.set(palette.fabric);
      if (material.name === "FabricLining") material.color.set(palette.fabric).multiplyScalar(.48);
      if (material.name === "Trim") material.color.set(palette.trim);
      if (material.name === "Seams") material.color.set(palette.seams);
      if (/^Brand(ML|Word|Back)$/.test(material.name)) { material.color.set(palette.ink); material.alphaTest = .04; }
    }
  });
  root.userData.selectedColor = fabricHex;
  root.userData.logoContrast = palette.contrast;
  return palette;
}
