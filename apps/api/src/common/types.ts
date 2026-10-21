import type { RoleName } from '@techmunda/shared';

export interface AuthUser {
  id: string;
  tenantId: string;
  role: RoleName;
  email: string;
  fullName: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      rawBody?: Buffer;
    }
  }
}

export {};
