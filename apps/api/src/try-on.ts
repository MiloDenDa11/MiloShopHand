import { Controller, Get, Post, Delete, Param, Body, Headers, Req, Res, Inject, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import type { Response } from 'express';
import { Db, AuthGuard, type AppRequest, fail, parse } from './core';
import { TryOnService } from './try-on-service';
import { TryOnError, tryOnMessages, TRY_ON_MAX_BYTES } from './try-on-policy';

const input = z.object({ productSlug: z.string().min(1).max(160).regex(/^[a-z0-9-]+$/), color: z.string().min(1).max(80), mode: z.enum(['upper-body', 'portrait']), consent: z.literal('true') }).strict();
const jobId = z.string().min(1).max(80).regex(/^[a-zA-Z0-9-]+$/);
@Controller('try-on')
export class TryOnController {
  private jobs: TryOnService;
  constructor(@Inject(Db) db: Db) { this.jobs = new TryOnService(db); }
  private async perform<T>(fn: () => Promise<T>): Promise<T> {
    try { return await fn(); }
    catch (error) {
      if (error instanceof TryOnError) fail(error.code, tryOnMessages[error.code] || tryOnMessages.TRY_ON_FAILED, error.status);
      throw error;
    }
  }
  @Get('config') config() { return this.jobs.config(); }
  @UseGuards(AuthGuard) @Get('quota') quota(@Req() request: AppRequest) { return this.perform(() => this.jobs.quota(request.actor!.id)); }
  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: TRY_ON_MAX_BYTES, files: 1, fields: 4, fieldSize: 1024, parts: 5, headerPairs: 32 } }))
  @Post('jobs') create(@Req() request: AppRequest, @Body() body: unknown, @UploadedFile() file: any, @Headers('idempotency-key') key: string) {
    const data = parse(input, body);
    const token = parse(z.uuid(), key);
    return this.perform(() => this.jobs.submit(request.actor!.id, token, data, file));
  }
  @UseGuards(AuthGuard) @Get('jobs/:id') get(@Req() request: AppRequest, @Param('id') id: string) { return this.perform(() => this.jobs.get(request.actor!.id, parse(jobId, id))); }
  @UseGuards(AuthGuard) @Delete('jobs/:id') remove(@Req() request: AppRequest, @Param('id') id: string) { return this.perform(() => this.jobs.remove(request.actor!.id, parse(jobId, id))); }
  @UseGuards(AuthGuard) @Get('jobs/:id/images/:index') async image(@Req() request: AppRequest, @Param('id') id: string, @Param('index') index: string, @Res() response: Response) {
    const bytes = await this.perform(() => this.jobs.image(request.actor!.id, parse(jobId, id), Number(parse(z.enum(['0', '1']), index))));
    response.setHeader('Cache-Control', 'private, no-store'); response.setHeader('Pragma', 'no-cache');
    response.setHeader('Content-Type', 'image/webp'); response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Disposition', `inline; filename="milo-try-on-${index}.webp"`);
    response.send(bytes);
  }
}
