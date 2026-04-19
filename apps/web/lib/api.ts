/**
 * Resolves the dashboard → Go API base URL.
 * - Browser + default self-host: use `window.location.origin + /api/v1` so the request always
 *   matches the site you opened (avoids stale baked env or wrong hosts).
 * - If `NEXT_PUBLIC_API_BASE` is an absolute URL (split API host), use that (build-time value).
 */
export function apiBase(): string {
  const baked = process.env.NEXT_PUBLIC_API_BASE?.trim();
  if (baked && (baked.startsWith('http://') || baked.startsWith('https://'))) {
    return baked.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/v1`;
  }
  if (baked) {
    return baked;
  }
  return '/api/v1';
}

let refreshInFlight: Promise<string | null> | null = null;

function looksLikeHtml(text: string): boolean {
  const s = text.trimStart().slice(0, 800).toLowerCase();
  return (
    s.startsWith('<!doctype') ||
    s.startsWith('<html') ||
    s.startsWith('<head') ||
    /^<\s*html[\s>]/.test(s)
  );
}

/**
 * Maps an API error response body to a short message safe to show in the UI.
 * Never surfaces proxy/Cloudflare HTML error pages (502/503 bodies) to users.
 */
export function userFacingApiError(text: string, status: number): string {
  const t = text.trim();
  if (!t) {
    if (status >= 500 && status < 600) {
      return 'The service is temporarily unavailable. Please try again in a few minutes.';
    }
    return `Request failed (${status})`;
  }
  if (looksLikeHtml(t)) {
    if (status >= 500 && status < 600) {
      return 'The service is temporarily unavailable. Please try again in a few minutes.';
    }
    return 'The server returned an unexpected response. Please try again.';
  }
  try {
    const j = JSON.parse(t) as { error?: string };
    if (typeof j.error === 'string' && j.error.trim()) {
      return j.error.trim();
    }
  } catch {
    /* plain text */
  }
  return t.length > 500 ? `${t.slice(0, 280)}…` : t;
}

/** Parse JSON from a response body string; avoids "Unexpected end of JSON input" on empty bodies. */
function parseJsonBody<T>(text: string, context: string): T {
  const t = text.trim();
  if (!t) {
    throw new Error(`${context}: empty response body`);
  }
  try {
    return JSON.parse(t) as T;
  } catch {
    if (looksLikeHtml(t)) {
      throw new Error('The server returned an unexpected response. Please try again.');
    }
    throw new Error(t.length > 280 ? `${t.slice(0, 280)}…` : t);
  }
}

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/** Server clears HttpOnly cookies; clears non-sensitive client hints. */
export async function logoutSession(): Promise<void> {
  if (!isBrowser()) return;
  try {
    await fetch(`${apiBase()}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      credentials: 'include',
      cache: 'no-store'
    });
  } catch {
    /* ignore */
  }
  localStorage.removeItem('submify_user_name');
  localStorage.removeItem('submify_user_phone');
}

function clearSessionAndGoToLogin(): void {
  if (!isBrowser()) return;
  void logoutSession().finally(() => {
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  });
}

async function refreshAccessToken(): Promise<string | null> {
  if (!isBrowser()) return null;

  const res = await fetch(`${apiBase()}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    credentials: 'include',
    cache: 'no-store'
  });
  const text = await res.text();
  if (!res.ok) {
    return null;
  }
  const data = parseJsonBody<{ access_token?: string; refresh_token?: string }>(text, 'auth/refresh');
  if (!data.access_token) {
    return null;
  }
  // Tokens also live in HttpOnly cookies set by the server; JSON is for API clients.
  return data.access_token;
}

async function getRefreshedAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const request = async (bearer?: string | null): Promise<Response> => {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (bearer) {
      headers.set('Authorization', `Bearer ${bearer}`);
    }
    return fetch(`${apiBase()}${path}`, {
      ...init,
      headers,
      credentials: 'include',
      cache: 'no-store'
    });
  };

  // HttpOnly access cookie is sent automatically; Bearer is optional (CLI / API clients).
  let res = await request(null);
  let text = await res.text();

  if (!res.ok && res.status === 401) {
    const refreshed = await getRefreshedAccessToken();
    if (refreshed) {
      res = await request(null);
      text = await res.text();
    } else if (isBrowser()) {
      clearSessionAndGoToLogin();
    }
  }

  if (!res.ok) {
    throw new Error(userFacingApiError(text, res.status));
  }
  return parseJsonBody<T>(text, path);
}

/** True if the browser has a valid session (HttpOnly cookies). */
export async function isSessionValid(): Promise<boolean> {
  if (!isBrowser()) return false;
  try {
    const res = await fetch(`${apiBase()}/auth/me`, { credentials: 'include', cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getBootstrapStatus(): Promise<{ setup_required: boolean }> {
  const res = await fetch(`${apiBase()}/system/bootstrap-status`, { cache: 'no-store' });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(userFacingApiError(text, res.status));
  }
  return parseJsonBody<{ setup_required: boolean }>(text, 'bootstrap-status');
}

export type MeResponse = {
  email: string;
  api_key: string;
  full_name: string;
  phone: string;
  telegram_chat_id: string;
  s3_endpoint: string;
  s3_bucket: string;
  telegram_configured: boolean;
  s3_configured: boolean;
};

export async function getMe(): Promise<MeResponse> {
  return api<MeResponse>('/auth/me');
}

export type DashboardSummary = {
  latest_submission: {
    at: string;
    project_id: string;
    project_name: string;
  } | null;
};

/** Dashboard summary includes latest submission metadata. */
export async function getDashboardSummary(refresh = false): Promise<DashboardSummary> {
  const q = refresh ? '?refresh=1' : '';
  return api<DashboardSummary>(`/dashboard/summary${q}`);
}

export async function registerAccount(body: {
  full_name: string;
  phone: string;
  email: string;
  password: string;
}): Promise<{
  access_token: string;
  refresh_token: string;
  api_key: string;
  email: string;
  full_name: string;
  phone: string;
}> {
  const res = await fetch(`${apiBase()}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
    cache: 'no-store'
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(userFacingApiError(text, res.status));
  }
  return parseJsonBody(text, 'auth/register');
}

export type IntegrationsPatch = Partial<{
  telegram_bot_token: string;
  telegram_chat_id: string;
  s3_endpoint: string;
  s3_access_key: string;
  s3_secret_key: string;
  s3_bucket: string;
}>;

export async function updateIntegrations(patch: IntegrationsPatch): Promise<{ status: string }> {
  return api<{ status: string }>('/users/me/integrations', {
    method: 'PUT',
    body: JSON.stringify(patch)
  });
}
