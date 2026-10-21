import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, PayloadTooLargeException, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { ALLOWED_IMAGE_MIME, MAX_UPLOAD_BYTES } from '@techmunda/shared';
import { sha256, signPayload, verifyPayload } from '@techmunda/core';
import { AuditService } from '../audit/audit.service';
import { found } from '../common/helpers';
import { ENV, PRISMA, STORAGE, type AppEnv, type AppStorage, type PrismaDb } from '../common/tokens';
import type { AuthUser } from '../common/types';
import { MediaUrlService } from './media-url.service';

interface UploadToken {
  tenantId: string;
  userId: string;
  productId: string;
  key: string;
  mimeType: string;
  fileSize: number;
  kind: string;
  sortOrder: number;
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const FORMAT_TO_MIME: Record<string, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const MAX_DIMENSION = 12_000;

/** Pluggable malware-scan hook. The default only verifies the file really is a decodable image. */
export interface MediaScanner {
  scan(buf: Buffer): Promise<{ ok: boolean; reason?: string }>;
}

@Injectable()
export class MediaService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaDb,
    @Inject(ENV) private readonly env: AppEnv,
    @Inject(STORAGE) private readonly storage: AppStorage,
    private readonly urls: MediaUrlService,
    private readonly audit: AuditService,
  ) {}

  async createUploadUrl(user: AuthUser, input: { productId: string; fileName: string; mimeType: string; fileSize: number; kind?: string; sortOrder?: number }) {
    found(await this.prisma.product.findFirst({ where: { id: input.productId, tenantId: user.tenantId }, select: { id: true } }), 'Product');
    const key = `${user.tenantId}/originals/${randomUUID()}.${EXT[input.mimeType]}`;
    const token = signPayload({ tenantId: user.tenantId, userId: user.id, productId: input.productId, key, mimeType: input.mimeType, fileSize: input.fileSize, kind: input.kind ?? 'PHOTO', sortOrder: input.sortOrder ?? 0 } satisfies Omit<UploadToken, never>, this.env.URL_SIGNING_SECRET, 900);
    const presigned = await this.storage.presignPut(key, input.mimeType, 900);
    return {
      uploadUrl: presigned ?? `${this.env.API_PUBLIC_URL}/api/v1/media/upload/${token}`,
      method: 'PUT' as const,
      headers: { 'Content-Type': input.mimeType },
      uploadToken: token,
      expiresInSeconds: 900,
      maxBytes: Math.min(MAX_UPLOAD_BYTES, input.fileSize),
    };
  }

  /** Receives bytes for the local-driver signed URL. Token-authenticated (no bearer), size-capped. */
  async receiveLocalUpload(token: string, body: unknown, contentType: string | undefined) {
    const t = verifyPayload<UploadToken>(token, this.env.URL_SIGNING_SECRET);
    if (!t) throw new ForbiddenException({ code: 'UPLOAD_URL_INVALID', message: 'Upload link is invalid or expired' });
    if (this.storage.kind !== 'local') throw new BadRequestException({ code: 'NOT_LOCAL', message: 'Use the pre-signed storage URL' });
    if (!Buffer.isBuffer(body) || body.length === 0) throw new BadRequestException({ code: 'EMPTY_UPLOAD', message: 'No file data received' });
    if (body.length > MAX_UPLOAD_BYTES || body.length > t.fileSize + 1024) throw new PayloadTooLargeException({ code: 'FILE_TOO_LARGE', message: 'File exceeds the declared/maximum size (10 MB)' });
    if (contentType && contentType.split(';')[0] !== t.mimeType) throw new BadRequestException({ code: 'MIME_MISMATCH', message: 'Content-Type does not match the declared type' });
    await this.storage.put(t.key, body, t.mimeType);
  }

  /** Validates the stored object (magic bytes, decodability, dimensions) and registers it. Invalid objects are deleted. */
  async confirm(user: AuthUser, uploadToken: string) {
    const t = verifyPayload<UploadToken>(uploadToken, this.env.URL_SIGNING_SECRET);
    if (!t || t.tenantId !== user.tenantId || t.userId !== user.id) throw new ForbiddenException({ code: 'UPLOAD_TOKEN_INVALID', message: 'Upload token invalid or expired' });
    const existing = await this.prisma.productMedia.findFirst({ where: { tenantId: user.tenantId, storageKey: t.key } });
    if (existing) return this.view(user.tenantId, existing);
    found(await this.prisma.product.findFirst({ where: { id: t.productId, tenantId: user.tenantId }, select: { id: true } }), 'Product');
    if (!(await this.storage.exists(t.key))) throw new UnprocessableEntityException({ code: 'UPLOAD_MISSING', message: 'The file has not been uploaded yet' });

    const buf = await this.storage.get(t.key);
    const reject = async (code: string, message: string): Promise<never> => {
      await this.storage.remove(t.key).catch(() => undefined);
      throw new UnprocessableEntityException({ code, message });
    };
    if (buf.length > MAX_UPLOAD_BYTES) return reject('FILE_TOO_LARGE', 'File exceeds the 10 MB limit');

    let meta: sharp.Metadata;
    try {
      meta = await sharp(buf, { failOn: 'error', limitInputPixels: MAX_DIMENSION * MAX_DIMENSION }).metadata();
      await sharp(buf, { failOn: 'error' }).resize(64, 64, { fit: 'inside' }).toBuffer(); // forces a real decode
    } catch {
      return reject('INVALID_IMAGE', 'The file is not a valid image');
    }
    const realMime = meta.format ? FORMAT_TO_MIME[meta.format] : undefined;
    if (!realMime || !(ALLOWED_IMAGE_MIME as readonly string[]).includes(realMime)) return reject('UNSUPPORTED_TYPE', 'Only JPG, PNG or WebP images are accepted');
    if (realMime !== t.mimeType) return reject('MIME_MISMATCH', 'File content does not match its declared type');
    if ((meta.width ?? 0) > MAX_DIMENSION || (meta.height ?? 0) > MAX_DIMENSION) return reject('IMAGE_TOO_LARGE', 'Image dimensions are too large');

    try {
      const row = await this.prisma.productMedia.create({
        data: {
          tenantId: user.tenantId, productId: t.productId, storageKey: t.key, mimeType: realMime, fileSize: buf.length, checksum: sha256(buf),
          width: meta.width, height: meta.height, mediaType: 'ORIGINAL', isOriginal: true, rightsConfirmed: true, mediaKind: t.kind ?? 'PHOTO', sortOrder: t.sortOrder ?? 0, reviewStatus: 'APPROVED', uploadedBy: user.id,
        },
      });
      await this.audit.audit({ tenantId: user.tenantId, actorId: user.id, action: 'media.uploaded', resourceType: 'product_media', resourceId: row.id, metadata: { productId: t.productId, rightsConfirmed: true } });
      return this.view(user.tenantId, row);
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException({ code: 'ALREADY_CONFIRMED', message: 'Upload already confirmed' });
      throw e;
    }
  }

  async remove(user: AuthUser, id: string) {
    const m = found(await this.prisma.productMedia.findFirst({ where: { id, tenantId: user.tenantId }, include: { jobs: { select: { id: true }, take: 1 } } }), 'Media');
    if (m.jobs.length) throw new ConflictException({ code: 'MEDIA_IN_USE', message: 'This image is the source of a creative job and cannot be deleted' });
    await this.prisma.productMedia.delete({ where: { id } });
    await this.storage.remove(m.storageKey).catch(() => undefined);
    await this.audit.audit({ tenantId: user.tenantId, actorId: user.id, action: 'media.deleted', resourceType: 'product_media', resourceId: id, metadata: { kind: m.mediaKind } });
  }

  async get(user: AuthUser, id: string) {
    return this.view(user.tenantId, found(await this.prisma.productMedia.findFirst({ where: { id, tenantId: user.tenantId } }), 'Media'));
  }

  private async view(tenantId: string, m: { id: string; productId: string; storageKey: string; mimeType: string; fileSize: number; width: number | null; height: number | null; checksum: string; mediaKind: string; sortOrder: number; isOriginal: boolean; rightsConfirmed: boolean; createdAt: Date }) {
    return { id: m.id, productId: m.productId, mimeType: m.mimeType, fileSize: m.fileSize, width: m.width, height: m.height, checksum: m.checksum, mediaKind: m.mediaKind, sortOrder: m.sortOrder, isOriginal: m.isOriginal, rightsConfirmed: m.rightsConfirmed, createdAt: m.createdAt, url: await this.urls.viewUrl(tenantId, m.storageKey, m.mimeType) };
  }

  /** Serves a signed local file. nosniff + forced image types so uploads can never execute as HTML. */
  async readSigned(token: string) {
    const t = verifyPayload<{ k: string; t: string; m: string; d: boolean }>(token, this.env.URL_SIGNING_SECRET);
    if (!t || !t.k.startsWith(`${t.t}/`)) throw new ForbiddenException({ code: 'LINK_INVALID', message: 'Link is invalid or expired' });
    try {
      return { data: await this.storage.get(t.k), mimeType: t.m, download: t.d, name: t.k.split('/').pop()! };
    } catch {
      throw new BadRequestException({ code: 'NOT_FOUND', message: 'File not found' });
    }
  }
}
