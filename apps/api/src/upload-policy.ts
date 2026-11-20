import sharp from 'sharp';
import { resolve, sep } from 'node:path';
import { fail } from './core';

export const uploadLimits = { fileSize: 5 * 1024 * 1024, files: 1, fields: 4, fieldSize: 1024, parts: 5, headerPairs: 32 };
const formats: Record<string, string[]> = { 'image/jpeg': ['jpeg'], 'image/png': ['png'], 'image/webp': ['webp'], 'image/avif': ['avif', 'heif'] };
let activeDecoders = 0;
export async function imageUpload(file: any, width: number): Promise<Buffer> {
  if (!Buffer.isBuffer(file?.buffer) || !file.buffer.length) fail('FILE_REQUIRED', 'Vui lòng chọn ảnh.', 422);
  if (activeDecoders >= 2) fail('IMAGE_BUSY', 'Hệ thống đang xử lý ảnh. Vui lòng thử lại sau.', 429);
  activeDecoders++;
  try {
    if (file.buffer.length > uploadLimits.fileSize || !formats[file.mimetype]) throw Error();
    const options = { limitInputPixels: 24000000, animated: false, failOn: 'warning' as const };
    const metadata = await sharp(file.buffer, options).metadata();
    if (!formats[file.mimetype].includes(metadata.format || '') || (metadata.format === 'heif' && metadata.compression !== 'av1')) throw Error();
    return await sharp(file.buffer, options).rotate().resize({ width, height: width, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch { fail('INVALID_IMAGE', 'Ảnh không hợp lệ. Chỉ nhận JPEG, PNG, WebP hoặc AVIF đúng nội dung, tối đa 5MB và 24 megapixel.', 422); }
  finally { activeDecoders--; }
}

export function privateImagePath(directory: string, name: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/i.test(name)) fail('NOT_FOUND', 'Không tìm thấy ảnh.', 404);
  const root = resolve(directory), target = resolve(root, name);
  if (!target.startsWith(root + sep)) fail('NOT_FOUND', 'Không tìm thấy ảnh.', 404);
  return target;
}
