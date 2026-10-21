'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api, loadSession, saveSession, login as apiLogin, logout as apiLogout, onSessionChange } from './api';

export interface Me {
  user: { id: string; email: string; fullName: string; role: string; tenantId: string };
  tenant: { id: string; name: string; slug: string; country: string; currency: string; timezone: string };
}
interface AuthCtx {
  me: Me | null;
  loading: boolean;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  adoptSession(tokens: { accessToken: string; refreshToken: string }): Promise<void>;
  can(...roles: string[]): boolean;
}
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  const fetchMe = useCallback(async () => {
    if (!loadSession()) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      setMe(await api<Me>('/auth/me'));
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMe();
    return onSessionChange(() => {
      if (!loadSession()) setMe(null);
    });
  }, [fetchMe]);

  const value = useMemo<AuthCtx>(
    () => ({
      me,
      loading,
      async signIn(email, password) {
        qc.clear();
        await apiLogin(email, password);
        await fetchMe();
      },
      async adoptSession(tokens) {
        qc.clear();
        saveSession(tokens);
        await fetchMe();
      },
      async signOut() {
        await apiLogout();
        qc.clear();
        setMe(null);
      },
      can: (...roles) => !!me && roles.includes(me.user.role),
    }),
    [me, loading, qc, fetchMe],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
};

export function useRequireAuth() {
  const auth = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!auth.loading && !auth.me) router.replace('/login');
  }, [auth.loading, auth.me, router]);
  return auth;
}

export const ROLE_LABEL: Record<string, string> = { PLATFORM_ADMIN: 'Platform admin', TENANT_OWNER: 'Owner', MANAGER: 'Manager', DESIGNER: 'Designer', SALES_EXECUTIVE: 'Sales executive', VIEWER: 'Viewer' };
export const CAN_APPROVE_EMAIL = ['PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER'];
export const CAN_SEND_EMAIL = ['PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER', 'SALES_EXECUTIVE'];
export const CAN_APPROVE_ASSET = ['PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER', 'DESIGNER'];
export const CAN_MAKE_CREATIVE = CAN_APPROVE_ASSET;
export const CAN_SALES = ['PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER', 'SALES_EXECUTIVE'];
