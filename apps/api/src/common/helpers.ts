import { NotFoundException } from '@nestjs/common';

export function pageArgs(page: number, pageSize: number) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}
export function paged<T>(items: T[], total: number, page: number, pageSize: number) {
  return { data: items, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}
export function found<T>(row: T | null | undefined, what = 'Record'): T {
  if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: `${what} not found` });
  return row;
}
/** Prisma Decimal → number for JSON responses. */
export const num = (d: unknown): number | null => (d == null ? null : Number(d));
