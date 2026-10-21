export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const KEY = 'tm_session';

export interface Session {
  accessToken: string;
  refreshToken: string;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: Array<{ path: string; message: string }>) {
    super(message);
  }
}

/* The access token lives in memory + localStorage. See docs/SECURITY.md for the trade-off vs httpOnly cookies. */
let session: Session | null = null;
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

export function loadSession(): Session | null {
  if (session) return session;
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    session = raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    session = null;
  }
  return session;
}
export function saveSession(s: Session | null) {
  session = s;
  try {
    if (s) window.localStorage.setItem(KEY, JSON.stringify(s));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable (private mode) — session lasts for this tab only */
  }
  listeners.forEach((l) => l());
}
export const onSessionChange = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

async function refresh(): Promise<boolean> {
  const s = loadSession();
  if (!s) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: s.refreshToken }) });
      if (!res.ok) return false;
      const data = await res.json();
      saveSession({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

interface Opts {
  method?: string;
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined | null>;
}

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const { method = 'GET', body, auth = true, signal, query } = opts;
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString() : '';
  const run = async () => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const s = loadSession();
    if (auth && s) headers.Authorization = `Bearer ${s.accessToken}`;
    return fetch(`${API_URL}${path}${qs === '?' ? '' : qs}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal });
  };
  let res: Response;
  try {
    res = await run();
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
  }
  if (res.status === 401 && auth && (await refresh())) res = await run();
  if (res.status === 401 && auth) {
    saveSession(null);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return data as T;
}

export async function login(email: string, password: string) {
  const data = await api<{ accessToken: string; refreshToken: string; user: any }>('/auth/login', { method: 'POST', body: { email, password }, auth: false });
  saveSession({ accessToken: data.accessToken, refreshToken: data.refreshToken });
  return data.user;
}

export async function logout() {
  const s = loadSession();
  saveSession(null);
  if (s) await fetch(`${API_URL}/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: s.refreshToken }) }).catch(() => undefined);
}

/** 3-step signed upload: request URL → PUT bytes (with progress) → confirm (server validates the image). */
export async function uploadProductImage(productId: string, file: File, onProgress?: (pct: number) => void) {
  const up = await api<{ uploadUrl: string; uploadToken: string; headers: Record<string, string> }>('/media/upload-url', {
    method: 'POST',
    body: { productId, fileName: file.name, mimeType: file.type, fileSize: file.size, rightsConfirmed: true },
  });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', up.uploadUrl);
    for (const [k, v] of Object.entries(up.headers ?? {})) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 90));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError(xhr.status, 'UPLOAD_FAILED', parseXhrError(xhr))));
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK', 'Upload failed. Check your connection.'));
    xhr.send(file);
  });
  const media = await api('/media/confirm', { method: 'POST', body: { uploadToken: up.uploadToken } });
  onProgress?.(100);
  return media;
}
function parseXhrError(xhr: XMLHttpRequest) {
  try {
    return JSON.parse(xhr.responseText)?.error?.message ?? `Upload failed (${xhr.status})`;
  } catch {
    return `Upload failed (${xhr.status})`;
  }
}

export const errorMessage = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong');
