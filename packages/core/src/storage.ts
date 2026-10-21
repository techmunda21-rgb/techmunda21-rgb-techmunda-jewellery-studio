import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { promises as fs } from 'fs';
import path from 'path';
import type { Env } from './env';

export interface StorageDriver {
  readonly kind: 'local' | 's3';
  put(key: string, body: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
  /** Pre-signed direct upload URL. Null for the local driver (the API signs its own URL). */
  presignPut(key: string, mimeType: string, ttlSeconds: number): Promise<string | null>;
  presignGet(key: string, ttlSeconds: number): Promise<string | null>;
}

/** Keys are always tenant-prefixed: `<tenantId>/<area>/<uuid>.<ext>`. Reject traversal. */
function safeKey(key: string): string {
  if (key.includes('..') || key.startsWith('/') || key.includes('\\')) throw new Error('Invalid storage key');
  return key;
}

export class LocalStorageDriver implements StorageDriver {
  readonly kind = 'local' as const;
  constructor(private readonly root: string) {}
  private full(key: string) {
    return path.resolve(this.root, safeKey(key));
  }
  async put(key: string, body: Buffer) {
    const file = this.full(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
  }
  get(key: string) {
    return fs.readFile(this.full(key));
  }
  async exists(key: string) {
    return fs.access(this.full(key)).then(() => true, () => false);
  }
  async remove(key: string) {
    await fs.rm(this.full(key), { force: true });
  }
  async presignPut() {
    return null;
  }
  async presignGet() {
    return null;
  }
}

export class S3StorageDriver implements StorageDriver {
  readonly kind = 's3' as const;
  private readonly client: S3Client;
  constructor(private readonly env: Env) {
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: env.S3_ACCESS_KEY && env.S3_SECRET_KEY ? { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY } : undefined,
    });
  }
  async put(key: string, body: Buffer, mimeType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.env.S3_BUCKET, Key: safeKey(key), Body: body, ContentType: mimeType }));
  }
  async get(key: string) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.env.S3_BUCKET, Key: safeKey(key) }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }
  async exists(key: string) {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.env.S3_BUCKET, Key: safeKey(key) }));
      return true;
    } catch {
      return false;
    }
  }
  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.env.S3_BUCKET, Key: safeKey(key) }));
  }
  presignPut(key: string, mimeType: string, ttlSeconds: number) {
    return getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.env.S3_BUCKET, Key: safeKey(key), ContentType: mimeType }), { expiresIn: ttlSeconds });
  }
  presignGet(key: string, ttlSeconds: number) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.env.S3_BUCKET, Key: safeKey(key) }), { expiresIn: ttlSeconds });
  }
}

export function createStorage(env: Env): StorageDriver {
  return env.STORAGE_DRIVER === 's3' ? new S3StorageDriver(env) : new LocalStorageDriver(env.LOCAL_STORAGE_DIR);
}
