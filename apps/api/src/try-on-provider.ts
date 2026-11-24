import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { TryOnError, tryOnApiPrompt, type TryOnPayload } from './try-on-policy';

export type ImageEditProvider = (input: { job: TryOnPayload; person: Buffer; garment: Buffer; apiKey: string; timeoutMs: number }) => Promise<{ images: Buffer[]; usage?: TryOnPayload['usage'] }>;
// One HTTP request, n=2, no retries, no alternate hosts or billable fallbacks.
export function openAIImageEditor(fetcher: typeof fetch = fetch): ImageEditProvider {
  return async ({ job, person, garment, apiKey, timeoutMs }) => {
    const form = new FormData();
    form.set('model', job.model); form.set('n', '2');
    form.set('quality', 'medium'); form.set('size', '1024x1536'); form.set('output_format', 'webp');
    form.set('prompt', tryOnApiPrompt(job));
    form.set('safety_identifier', createHash('sha256').update(`miloshophand:${job.userId}`).digest('hex'));
    form.append('image[]', new Blob([Uint8Array.from(person)], { type: 'image/webp' }), 'person.webp');
    form.append('image[]', new Blob([Uint8Array.from(garment)], { type: 'image/webp' }), 'garment.webp');
    let response: Response;
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      response = await fetcher('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal, redirect: 'error' });
    } catch { throw new TryOnError('TRY_ON_PROVIDER_UNCERTAIN'); }
    if (!response.ok) {
      await response.body?.cancel();
      throw new TryOnError(response.status === 429 ? 'TRY_ON_PROVIDER_LIMIT' : response.status >= 500 ? 'TRY_ON_PROVIDER_UNCERTAIN' : 'TRY_ON_PROVIDER_REJECTED');
    }
    try {
      const reader = response.body?.getReader();
      if (!reader) throw Error();
      const chunks: Uint8Array[] = []; let length = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          length += value.length; if (length > 24 * 1024 * 1024) throw Error();
          chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => {}); }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!Array.isArray(body.data) || body.data.length !== 2) throw Error();
      const images: Buffer[] = [];
      for (const item of body.data) {
        if (typeof item.b64_json !== 'string' || item.b64_json.length > 12 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(item.b64_json)) throw Error();
        const bytes = Buffer.from(item.b64_json, 'base64');
        const image = sharp(bytes, { limitInputPixels: 8000000, animated: false, failOn: 'warning' });
        const meta = await image.metadata();
        if (!['png', 'jpeg', 'webp'].includes(meta.format || '') || (meta.pages || 1) > 1 || Math.min(meta.width || 0, meta.height || 0) < 512) throw Error();
        images.push(await image.rotate().webp({ quality: 90 }).toBuffer());
      }
      const usage = body.usage;
      const safeUsage = usage && ['input_tokens', 'output_tokens', 'total_tokens'].every(key => Number.isSafeInteger(usage[key]) && usage[key] >= 0)
        ? { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, total_tokens: usage.total_tokens } : undefined;
      return { images, usage: safeUsage };
    } catch { throw new TryOnError(signal.aborted ? 'TRY_ON_PROVIDER_UNCERTAIN' : 'TRY_ON_PROVIDER_RESPONSE'); }
  };
}
