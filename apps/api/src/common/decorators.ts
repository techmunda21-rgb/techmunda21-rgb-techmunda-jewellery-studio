import { SetMetadata, createParamDecorator, type ExecutionContext, applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation } from '@nestjs/swagger';
import type { RoleName } from '@techmunda/shared';
import type { ZodType } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { AuthUser } from './types';

export const IS_PUBLIC = 'isPublic';
export const ROLES_KEY = 'roles';
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);
export const ClientIp = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest();
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
});

/** OpenAPI summary + (optionally) the Zod schema rendered as the request body schema. */
export function Doc(summary: string, bodySchema?: ZodType<any, any, any>) {
  const decos = [ApiOperation({ summary }), ApiBearerAuth()];
  if (bodySchema) decos.push(ApiBody({ schema: (zodToJsonSchema as any)(bodySchema, { target: 'openApi3', $refStrategy: 'none' }) }));
  return applyDecorators(...decos);
}
