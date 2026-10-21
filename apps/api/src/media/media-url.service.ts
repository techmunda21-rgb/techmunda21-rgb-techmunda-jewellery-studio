import { Inject, Injectable } from '@nestjs/common';
import { signPayload } from '@techmunda/core';
import { ENV, STORAGE, type AppEnv, type AppStorage } from '../common/tokens';

/** Issues short-lived signed URLs so <img> tags can load private media without bearer headers. */
@Injectable()
export class MediaUrlService {
  constructor(@Inject(ENV) private readonly env: AppEnv, @Inject(STORAGE) private readonly storage: AppStorage) {}

  async viewUrl(tenantId: string, key: string, mimeType = 'image/png', opts: { download?: boolean; ttl?: number } = {}): Promise<string> {
    const ttl = opts.ttl ?? 900;
    if (this.storage.kind === 's3') {
      const url = await this.storage.presignGet(key, ttl);
      if (url) return url;
    }
    const token = signPayload({ k: key, t: tenantId, m: mimeType, d: !!opts.download }, this.env.URL_SIGNING_SECRET, ttl);
    return `${this.env.API_PUBLIC_URL}/api/v1/media/file/${token}`;
  }
}
