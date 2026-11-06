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
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { projectRoot, Db, AuthGuard, AppRequest, fail, env } from "./core";
@ApiTags("returns")
@ApiCookieAuth()
@UseGuards(AuthGuard)
@Controller("returns")
export class AttachmentsController {
  constructor(@Inject(Db) private db: Db) {}
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  @Post("attachments")
  async upload(@UploadedFile() file: any, @Req() r: AppRequest) {
    if (!file?.buffer) fail("FILE_REQUIRED", "Vui lòng chọn ảnh.");
    let buffer: Buffer;
    try {
      const meta = await sharp(file.buffer, {
        limitInputPixels: 24000000,
      }).metadata();
      if (!["jpeg", "png", "webp", "avif"].includes(meta.format || ""))
        throw new Error();
      buffer = await sharp(file.buffer, { limitInputPixels: 24000000 })
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      fail(
        "INVALID_IMAGE",
        "Chỉ chấp nhận ảnh JPEG, PNG, WebP hoặc AVIF hợp lệ dưới 5MB.",
        422,
      );
    }
    const count = await this.db.userUpload.count({
      where: {
        userId: r.actor!.id,
        createdAt: { gte: new Date(Date.now() - 86400000) },
      },
    });
    if (count >= 20)
      fail("UPLOAD_LIMIT", "Tối đa 20 ảnh đổi trả mỗi ngày.", 429);
    const fileName = `${randomUUID()}.webp`,
      dir = resolve(
        projectRoot,
        env.RETURN_UPLOAD_DIR || ".local/return-images",
      );
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, fileName), buffer);
    const row = await this.db.userUpload.create({
      data: { userId: r.actor!.id, fileName },
    });
    return { url: `/api/v1/returns/attachments/${row.id}` };
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
      resolve(
        projectRoot,
        env.RETURN_UPLOAD_DIR || ".local/return-images",
        row.fileName,
      ),
    );
  }
}
