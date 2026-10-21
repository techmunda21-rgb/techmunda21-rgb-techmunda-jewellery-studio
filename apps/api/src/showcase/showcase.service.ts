import { BadRequestException, Inject, Injectable, PayloadTooLargeException, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, type PDFObject } from 'pdf-lib';
import { sha256 } from '@techmunda/core';
import { AuditService } from '../audit/audit.service';
import { found } from '../common/helpers';
import { PRISMA, STORAGE, type AppStorage, type PrismaDb } from '../common/tokens';
import type { AuthUser } from '../common/types';
import { MediaUrlService } from '../media/media-url.service';

export const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_PAGES = 200;
/** PDF features that can run code or reach outside the document. Uploads containing them are refused. */
const ACTIVE_CONTENT = /\/(JavaScript|JS|Launch|OpenAction|AA|EmbeddedFile|RichMedia|SubmitForm|ImportData)\b/;

const FORBIDDEN_NAMES = new Set(['JavaScript', 'JS', 'Launch', 'OpenAction', 'AA', 'EmbeddedFile', 'EmbeddedFiles', 'RichMedia', 'SubmitForm', 'ImportData', 'GoToR', 'GoToE']);

/** Walks every parsed object (including ones hidden inside compressed object streams, which a raw-byte scan cannot see). */
function hasActiveContent(doc: PDFDocument): boolean {
  const visit = (o: PDFObject | undefined, depth: number): boolean => {
    if (!o || depth > 12) return false;
    if (o instanceof PDFName) return FORBIDDEN_NAMES.has(o.decodeText());
    if (o instanceof PDFArray) return o.asArray().some((x) => visit(x, depth + 1));
    const dict = o instanceof PDFDict ? o : o instanceof PDFRawStream ? o.dict : null;
    if (!dict) return false;
    return dict.entries().some(([k, v]) => FORBIDDEN_NAMES.has(k.decodeText()) || visit(v, depth + 1));
  };
  return doc.context.enumerateIndirectObjects().some(([, obj]) => visit(obj, 0)) || visit(doc.catalog, 0);
}

@Injectable()
export class ShowcaseService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaDb, @Inject(STORAGE) private readonly storage: AppStorage, private readonly urls: MediaUrlService, private readonly audit: AuditService) {}

  async upload(user: AuthUser, title: string, body: unknown) {
    if (!Buffer.isBuffer(body) || body.length === 0) throw new BadRequestException({ code: 'EMPTY_UPLOAD', message: 'Send the PDF as the request body (Content-Type: application/pdf)' });
    if (body.length > MAX_PDF_BYTES) throw new PayloadTooLargeException({ code: 'FILE_TOO_LARGE', message: 'PDF exceeds the 25 MB limit' });
    if (body.subarray(0, 5).toString('latin1') !== '%PDF-') throw new UnprocessableEntityException({ code: 'NOT_A_PDF', message: 'The file is not a PDF' });
    if (ACTIVE_CONTENT.test(body.toString('latin1'))) throw new UnprocessableEntityException({ code: 'ACTIVE_CONTENT', message: 'This PDF contains scripts, launch actions or embedded files. Export a flattened PDF and try again.' });
    let pageCount: number;
    try {
      const doc = await PDFDocument.load(body, { ignoreEncryption: false, updateMetadata: false });
      if (hasActiveContent(doc)) throw new UnprocessableEntityException({ code: 'ACTIVE_CONTENT', message: 'This PDF contains scripts, launch actions or embedded files. Export a flattened PDF and try again.' });
      pageCount = doc.getPageCount();
    } catch (e) {
      if (e instanceof UnprocessableEntityException) throw e;
      throw new UnprocessableEntityException({ code: 'INVALID_PDF', message: 'The PDF is corrupt or password-protected' });
    }
    if (pageCount > MAX_PAGES) throw new UnprocessableEntityException({ code: 'TOO_MANY_PAGES', message: `PDF has ${pageCount} pages (maximum ${MAX_PAGES})` });

    const key = `${user.tenantId}/showcase/${randomUUID()}.pdf`;
    await this.storage.put(key, body, 'application/pdf');
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.showcaseDocument.updateMany({ where: { tenantId: user.tenantId, isActive: true }, data: { isActive: false } });
      return tx.showcaseDocument.create({ data: { tenantId: user.tenantId, title: title.slice(0, 120), storageKey: key, fileSize: body.length, pageCount, checksum: sha256(body), uploadedBy: user.id } });
    });
    await this.audit.audit({ tenantId: user.tenantId, actorId: user.id, action: 'showcase.uploaded', resourceType: 'showcase_document', resourceId: row.id, metadata: { pages: pageCount, bytes: body.length } });
    return this.view(user.tenantId, row);
  }

  async list(user: AuthUser) {
    const rows = await this.prisma.showcaseDocument.findMany({ where: { tenantId: user.tenantId }, orderBy: { createdAt: 'desc' }, take: 20 });
    return { data: await Promise.all(rows.map((r) => this.view(user.tenantId, r))) };
  }

  async activate(user: AuthUser, id: string) {
    found(await this.prisma.showcaseDocument.findFirst({ where: { id, tenantId: user.tenantId }, select: { id: true } }), 'Showcase');
    await this.prisma.$transaction([
      this.prisma.showcaseDocument.updateMany({ where: { tenantId: user.tenantId }, data: { isActive: false } }),
      this.prisma.showcaseDocument.updateMany({ where: { id, tenantId: user.tenantId }, data: { isActive: true } }),
    ]);
    return { id, isActive: true };
  }

  async remove(user: AuthUser, id: string) {
    const d = found(await this.prisma.showcaseDocument.findFirst({ where: { id, tenantId: user.tenantId } }), 'Showcase');
    await this.prisma.showcaseDocument.delete({ where: { id } });
    await this.storage.remove(d.storageKey).catch(() => undefined);
    await this.audit.audit({ tenantId: user.tenantId, actorId: user.id, action: 'showcase.deleted', resourceType: 'showcase_document', resourceId: id });
  }

  private async view(tenantId: string, r: { id: string; title: string; storageKey: string; fileSize: number; pageCount: number; isActive: boolean; createdAt: Date }) {
    return { id: r.id, title: r.title, fileSize: r.fileSize, pageCount: r.pageCount, isActive: r.isActive, createdAt: r.createdAt, url: await this.urls.viewUrl(tenantId, r.storageKey, 'application/pdf', { ttl: 3600 }) };
  }
}
