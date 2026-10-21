import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { RoleName } from '@techmunda/shared';
import { IS_PUBLIC, ROLES_KEY } from './decorators';
import { PRISMA, type PrismaDb } from './tokens';

/** Authenticates every non-@Public route and re-checks the user/tenant are still active. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly jwt: JwtService, @Inject(PRISMA) private readonly prisma: PrismaDb) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Authentication required' });
    let payload: { sub: string; tid: string };
    try {
      payload = await this.jwt.verifyAsync(header.slice(7));
    } catch {
      throw new UnauthorizedException({ code: 'TOKEN_INVALID', message: 'Session expired or token invalid' });
    }
    // tenant comes from the verified token + DB row, never from the browser
    const user = await this.prisma.user.findFirst({ where: { id: payload.sub, tenantId: payload.tid, status: 'ACTIVE', tenant: { status: 'ACTIVE' } } });
    if (!user) throw new UnauthorizedException({ code: 'ACCOUNT_DISABLED', message: 'Account not available' });
    req.user = { id: user.id, tenantId: user.tenantId, role: user.role as RoleName, email: user.email, fullName: user.fullName };
    return true;
  }
}

/** @Roles() allow-list + global read-only rule for VIEWER. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (!user) return false;
    const roles = this.reflector.getAllAndOverride<RoleName[] | undefined>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (roles && !roles.includes(user.role)) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Your role is not permitted to perform this action' });
    if (user.role === 'VIEWER' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.path.endsWith('/auth/logout')) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Viewers have read-only access' });
    }
    return true;
  }
}
