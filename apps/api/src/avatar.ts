import { Controller, Get, Post, Delete, Req, Body, Inject, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { v2 as cloudinary } from 'cloudinary';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { Db, env, AuthGuard, AppRequest, fail, parse, transaction, audit, outbox } from './core';
import { imageUpload, uploadLimits } from './upload-policy';

export const avatarIdValid = (value: string) => /^miloshophand\/avatars\/[a-f0-9]{32}\/[a-f0-9-]{36}$/.test(value);
type Avatar = { publicId: string; url: string };
export interface AvatarProvider { enabled: boolean; upload(buffer: Buffer, userId: string): Promise<Avatar>; remove(publicId: string): Promise<void> }
export function cloudinaryAvatars(settings: Record<string, string | undefined> = env, uploader = cloudinary.uploader): AvatarProvider {
  const options = { cloud_name: settings.CLOUDINARY_CLOUD_NAME, api_key: settings.CLOUDINARY_API_KEY, api_secret: settings.CLOUDINARY_API_SECRET, secure: true, timeout: 30000 };
  const enabled = !!options.cloud_name && /^[a-z0-9_-]{1,100}$/i.test(options.cloud_name) && !!options.api_key && !!options.api_secret;
  const required = () => { if (!enabled) fail('AVATAR_UNAVAILABLE', 'Ảnh đại diện chưa được kết nối Cloudinary. Vui lòng quay lại sau.', 503); };
  return {
    enabled,
    async upload(buffer, userId) {
      required();
      const publicId = `miloshophand/avatars/${createHash('sha256').update(userId).digest('hex').slice(0, 32)}/${randomUUID()}`;
      const result = await new Promise<any>((resolve, reject) => {
        uploader.upload_stream({ ...options, resource_type: 'image', type: 'upload', public_id: publicId, overwrite: false, allowed_formats: ['webp'] }, (error, value) => error ? reject(error) : resolve(value)).end(buffer);
      }).catch(() => fail('AVATAR_UPLOAD_FAILED', 'Chưa tải được ảnh đại diện. Vui lòng thử lại sau.', 503));
      let valid = false;
      try { const url = new URL(result.secure_url); valid = url.protocol === 'https:' && url.hostname === 'res.cloudinary.com' && !url.port && !url.username && !url.password && url.pathname.startsWith(`/${options.cloud_name}/image/upload/`); } catch {}
      if (!valid || result.public_id !== publicId || result.resource_type !== 'image' || result.format !== 'webp') {
        await this.remove(publicId).catch(() => {});
        fail('AVATAR_UPLOAD_FAILED', 'Dịch vụ chưa trả ảnh đại diện hợp lệ.', 503);
      }
      return { publicId, url: result.secure_url };
    },
    async remove(publicId) {
      required();
      if (!avatarIdValid(publicId)) throw Error('Invalid managed avatar id');
      const result = await uploader.destroy(publicId, { ...options, resource_type: 'image', type: 'upload', invalidate: true });
      if (!['ok', 'not found'].includes(result.result)) throw Error('Avatar cleanup unavailable');
    },
  };
}
export class AvatarService {
  constructor(private db: Db, private provider: AvatarProvider = cloudinaryAvatars()) {}
  config() { return { enabled: this.provider.enabled, maxBytes: uploadLimits.fileSize, formats: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] }; }
  async upload(userId: string, file: any) {
    const buffer = await imageUpload(file, 512);
    if (!this.provider.enabled) fail('AVATAR_UNAVAILABLE', 'Ảnh đại diện chưa được kết nối Cloudinary. Vui lòng quay lại sau.', 503);
    const image = await this.provider.upload(buffer, userId);
    try {
      await transaction(this.db, async tx => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        if (user.disabled) fail('UNAUTHENTICATED', 'Vui lòng đăng nhập.', 401);
        await tx.user.update({ where: { id: userId }, data: { avatarUrl: image.url, avatarPublicId: image.publicId } });
        if (user.avatarPublicId) await outbox(tx, 'AVATAR_DELETE', `avatar-delete:${user.avatarPublicId}`, { publicId: user.avatarPublicId });
        await audit(tx, userId, 'AVATAR_UPDATED', 'User', userId);
      });
    } catch (error) {
      await outbox(this.db, 'AVATAR_DELETE', `avatar-delete:${image.publicId}`, { publicId: image.publicId }).catch(() => {});
      throw error;
    }
    return { avatarUrl: image.url };
  }
  async remove(userId: string) {
    await transaction(this.db, async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      await tx.user.update({ where: { id: userId }, data: { avatarUrl: null, avatarPublicId: null } });
      if (user.avatarPublicId) await outbox(tx, 'AVATAR_DELETE', `avatar-delete:${user.avatarPublicId}`, { publicId: user.avatarPublicId });
      await audit(tx, userId, 'AVATAR_REMOVED', 'User', userId);
    });
    return { avatarUrl: null };
  }
}
@UseGuards(AuthGuard)
@Controller('me/avatar')
export class AvatarController {
  private avatars: AvatarService;
  constructor(@Inject(Db) db: Db) { this.avatars = new AvatarService(db); }
  @Get('config') config() { return this.avatars.config(); }
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { ...uploadLimits, fields: 0, parts: 1 } }))
  upload(@Req() r: AppRequest, @UploadedFile() file: any) { return this.avatars.upload(r.actor!.id, file); }
  @Delete() remove(@Req() r: AppRequest, @Body() body: unknown) { parse(z.object({}).strict(), body || {}); return this.avatars.remove(r.actor!.id); }
}
