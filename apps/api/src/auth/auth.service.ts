import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'crypto';
import { sha256 } from '@techmunda/core';
import { AuditService } from '../audit/audit.service';
import { ENV, PRISMA, type AppEnv, type PrismaDb } from '../common/tokens';

// A valid bcrypt hash of a random string: keeps login timing equal for unknown e-mails.
const DUMMY_HASH = bcrypt.hashSync(randomBytes(16).toString('hex'), 12);

@Injectable()
export class AuthService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaDb, @Inject(ENV) private readonly env: AppEnv, private readonly jwt: JwtService, private readonly audit: AuditService) {}

  private invalid(): never {
    throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
  }

  async login(email: string, password: string, tenantSlug: string | undefined, ip: string) {
    const candidates = await this.prisma.user.findMany({
      where: { email, status: 'ACTIVE', tenant: { status: 'ACTIVE', ...(tenantSlug ? { slug: tenantSlug } : {}) } },
      take: 2,
    });
    // Same generic failure for unknown user, wrong password, or ambiguous tenant (avoid enumeration).
    const user = candidates.length === 1 ? candidates[0] : null;
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      if (user) await this.audit.audit({ tenantId: user.tenantId, actorId: user.id, action: 'auth.login_failed', resourceType: 'user', resourceId: user.id, ipAddress: ip });
      this.invalid();
    }
    await this.audit.audit({ tenantId: user.tenantId, actorId: user.id, action: 'auth.login', resourceType: 'user', resourceId: user.id, ipAddress: ip });
    return this.issueTokens(user.id, user.tenantId, user.role, randomUUID(), user);
  }

  /** Starts a session for an already-authenticated user (e.g. right after OTP-verified signup). */
  async startSession(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.issueTokens(user.id, user.tenantId, user.role, randomUUID(), user);
  }

  private async issueTokens(userId: string, tenantId: string, role: string, familyId: string, user: { id: string; email: string; fullName: string; role: string; tenantId: string }) {
    const accessToken = await this.jwt.signAsync({ sub: userId, tid: tenantId, role });
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: { userId, familyId, tokenHash: sha256(refreshToken), expiresAt: new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000) },
    });
    return { accessToken, refreshToken, user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, tenantId: user.tenantId } };
  }

  /** Rotation with reuse detection: presenting an already-rotated token revokes the whole family. */
  async refresh(token: string) {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!row) this.invalid();
    if (row.revokedAt) {
      await this.prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.audit({ tenantId: row.user.tenantId, actorId: row.userId, action: 'auth.refresh_reuse_detected', resourceType: 'user', resourceId: row.userId });
      throw new UnauthorizedException({ code: 'TOKEN_REUSED', message: 'Session revoked, please sign in again' });
    }
    if (row.expiresAt < new Date() || row.user.status !== 'ACTIVE') this.invalid();
    // Atomic claim so two concurrent refreshes cannot both succeed
    const claimed = await this.prisma.refreshToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (claimed.count !== 1) this.invalid();
    const next = await this.issueTokens(row.userId, row.user.tenantId, row.user.role, row.familyId, row.user);
    return next;
  }

  async logout(token: string | undefined) {
    if (!token) return;
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (row) await this.prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}
