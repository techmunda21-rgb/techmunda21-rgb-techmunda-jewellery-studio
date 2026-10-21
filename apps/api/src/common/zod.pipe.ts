import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T, any, any>) {}
  transform(value: unknown): T {
    const res = this.schema.safeParse(value ?? {});
    if (!res.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: res.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return res.data;
  }
}
export const zod = <T>(schema: ZodType<T, any, any>) => new ZodPipe<T>(schema);
