// The SVG is the source of truth; rebuild with `node scripts/build-favicons.mjs`.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const assets = new URL('../apps/web/public/', import.meta.url);
const svg = await readFile(new URL('favicon.svg', assets));
const png = await sharp(svg).resize(512, 512).png().toBuffer();
const size = 32;
const rgba = await sharp(svg).resize(size, size).ensureAlpha().raw().toBuffer();

// Single 32-bit, 32x32 Windows icon: BGRA bitmap and transparency mask.
// A bitmap payload also supports icon readers that do not accept embedded PNGs.
const maskStride = Math.ceil(size / 32) * 4;
const pixelBytes = size * size * 4;
const payloadBytes = 40 + pixelBytes + maskStride * size;
const ico = Buffer.alloc(6 + 16 + payloadBytes);
ico.writeUInt16LE(1, 2); // ICO file type.
ico.writeUInt16LE(1, 4); // One image.
ico[6] = size;
ico[7] = size;
ico.writeUInt16LE(1, 10); // Colour planes.
ico.writeUInt16LE(32, 12); // Bits per pixel.
ico.writeUInt32LE(payloadBytes, 14);
ico.writeUInt32LE(22, 18); // Bitmap offset.
ico.writeUInt32LE(40, 22); // BITMAPINFOHEADER size.
ico.writeInt32LE(size, 26);
ico.writeInt32LE(size * 2, 30); // Colour bitmap + mask height.
ico.writeUInt16LE(1, 34);
ico.writeUInt16LE(32, 36);
ico.writeUInt32LE(pixelBytes, 42);
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const source = (y * size + x) * 4;
    const row = size - y - 1;
    const target = 62 + (row * size + x) * 4;
    ico[target] = rgba[source + 2];
    ico[target + 1] = rgba[source + 1];
    ico[target + 2] = rgba[source];
    ico[target + 3] = rgba[source + 3];
    if (rgba[source + 3] < 128) {
      ico[62 + pixelBytes + row * maskStride + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
}
await writeFile(new URL('favicon-512.png', assets), png);
await writeFile(new URL('favicon.ico', assets), ico);
console.log(`Created ${fileURLToPath(new URL('favicon-512.png', assets))} (512x512)`);
console.log(`Created ${fileURLToPath(new URL('favicon.ico', assets))} (32x32)`);
