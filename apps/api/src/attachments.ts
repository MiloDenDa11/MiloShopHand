import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  Res,
  UseGuards,
  Inject,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags, ApiCookieAuth } from "@nestjs/swagger";
import { Response } from "express";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { imageUpload, uploadLimits, privateImagePath } from "./upload-policy";
import { projectRoot, Db, AuthGuard, AppRequest, fail, env } from "./core";
@ApiTags("returns")
@ApiCookieAuth()
@UseGuards(AuthGuard)
@Controller("returns")
export class AttachmentsController {
  constructor(@Inject(Db) private db: Db) {}
  @UseInterceptors(
    FileInterceptor("file", {
      limits: uploadLimits,
    }),
  )
  @Post("attachments")
  async upload(@UploadedFile() file: any, @Req() r: AppRequest) {
    if (!file?.buffer) fail("FILE_REQUIRED", "Vui lòng chọn ảnh.");
    const count = await this.db.userUpload.count({
      where: {
        userId: r.actor!.id,
        createdAt: { gte: new Date(Date.now() - 86400000) },
      },
    });
    if (count >= 20)
      fail("UPLOAD_LIMIT", "Tối đa 20 ảnh đổi trả mỗi ngày.", 429);
    const buffer = await imageUpload(file, 1600);
    const fileName = `${randomUUID()}.webp`,
      dir = resolve(
        projectRoot,
        env.RETURN_UPLOAD_DIR || ".local/return-images",
      );
    await mkdir(dir, { recursive: true });
    const target = resolve(dir, fileName);
    await writeFile(target, buffer, { flag: 'wx' });
    try {
      const row = await this.db.$transaction(async tx => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`upload:${r.actor!.id}`},0))`;
        const count = await tx.userUpload.count({ where: { userId: r.actor!.id, createdAt: { gte: new Date(Date.now() - 86400000) } } });
        if (count >= 20) fail('UPLOAD_LIMIT', 'Tối đa 20 ảnh đổi trả mỗi ngày.', 429);
        return tx.userUpload.create({ data: { userId: r.actor!.id, fileName } });
      });
      return { url: `/api/v1/returns/attachments/${row.id}` };
    } catch (error) { await unlink(target).catch(() => {}); throw error; }
  }
  @Get("attachments/:id") async download(
    @Param("id") id: string,
    @Req() r: AppRequest,
    @Res() res: Response,
  ) {
    const row = await this.db.userUpload.findFirst({
      where: {
        id,
        ...(r.actor!.role === "ADMIN" ? {} : { userId: r.actor!.id }),
      },
    });
    if (!row) fail("NOT_FOUND", "Không tìm thấy ảnh.", 404);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", row.mime);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'");
    return res.sendFile(
      privateImagePath(resolve(projectRoot, env.RETURN_UPLOAD_DIR || ".local/return-images"), row.fileName),
    );
  }
}
