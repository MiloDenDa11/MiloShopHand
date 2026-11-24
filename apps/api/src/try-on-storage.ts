import { mkdir, readFile, writeFile, unlink, stat, readdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import sharp from 'sharp';
import { projectRoot } from './core';
import { TryOnError, TRY_ON_MAX_BYTES } from './try-on-policy';

let decoders = 0;
export async function tryOnPerson(file: { buffer: Buffer; mimetype: string }) {
  if (decoders >= 2) throw new TryOnError('TRY_ON_FAILED', 429);
  decoders++;
  try {
    const formats: Record<string, string> = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
    if (!Buffer.isBuffer(file?.buffer) || !file.buffer.length || file.buffer.length > TRY_ON_MAX_BYTES || !formats[file.mimetype]) throw Error();
    const pipeline = sharp(file.buffer, { limitInputPixels: 32000000, animated: false, failOn: 'warning' });
    const meta = await pipeline.metadata();
    if (meta.format !== formats[file.mimetype] || (meta.pages || 1) > 1 || Math.min(meta.width || 0, meta.height || 0) < 512) throw Error();
    return await pipeline.rotate().resize({ width: 1536, height: 1536, fit: 'inside', withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
  } catch { throw new TryOnError('TRY_ON_INVALID_IMAGE', 422); }
  finally { decoders--; }
}
export class TryOnStorage {
  readonly root: string;
  constructor(directory = '.local/try-on-private', uploadDirectory = 'uploads') {
    this.root = resolve(projectRoot, directory || '.local/try-on-private');
    const normalized = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
    for (const publicRoot of [resolve(projectRoot, 'apps/web/public'), resolve(projectRoot, uploadDirectory || 'uploads')]) {
      if (normalized(this.root) === normalized(publicRoot) || normalized(this.root).startsWith(normalized(publicRoot) + sep) || normalized(publicRoot).startsWith(normalized(this.root) + sep)) throw new TryOnError('TRY_ON_UNAVAILABLE');
    }
    if (this.root === resolve(projectRoot) || this.root === resolve(this.root, '..')) throw new TryOnError('TRY_ON_UNAVAILABLE');
  }
  path(name: string) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/i.test(name)) throw new TryOnError('TRY_ON_NOT_FOUND', 404);
    return resolve(this.root, name);
  }
  async put(name: string, bytes: Buffer) {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await writeFile(this.path(name), bytes, { flag: 'wx', mode: 0o600 });
  }
  async read(name: string) {
    const path = this.path(name);
    if ((await stat(path)).size > 12 * 1024 * 1024) throw new TryOnError('TRY_ON_NOT_FOUND', 404);
    return readFile(path);
  }
  async remove(names: string[]) { for (const name of names) await unlink(this.path(name)).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  async sweepOrphans(liveNames: Set<string>, now: Date) {
    const names = await readdir(this.root).catch(() => []);
    for (const name of names) {
      if (!/^[a-f0-9-]{36}\.webp$/i.test(name) || liveNames.has(name)) continue;
      const meta = await stat(this.path(name)).catch(() => undefined);
      if (meta && meta.mtimeMs < now.getTime() - 86400000) await this.remove([name]);
    }
  }
}
