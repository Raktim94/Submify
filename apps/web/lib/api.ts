export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api/v1';

let refreshInFlight: Promise<string | null> | null = null;

/** Parse JSON from a response body string; avoids "Unexpected end of JSON input" on empty bodies. */
function parseJsonBody<T>(text: string, context: string): T {
  const t = text.trim();
  if (!t) {
    throw new Error(`${context}: empty response body`);
  }
  try {
    return JSON.parse(t) as T;
  } catch {
    throw new Error(t.length > 280 ? `${t.slice(0, 280)}…` : t);
  }
}

function errorMessageFromBody(text: string, status: number): string {
  const t = text.trim();
  if (!t) {
    return `Request failed (${status})`;
  }
  if (t.startsWith('<!DOCTYPE') || t.startsWith('<html')) {
    return `API returned an HTML error page (${status}) instead of JSON — usually a bad gateway or wrong base URL. Self-hosted: keep NEXT_PUBLIC_API_BASE=/api/v1 (default) and rebuild the web image; do not point the dashboard at api.nodedr.com unless that service is up.`;
  }
  try {
    const j = JSON.parse(t) as { error?: string };
    return j.error ?? t;
  } catch {
    return t.length > 500 ? `${t.slice(0, 280)}…` : t;
  }
}

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/** Server clears HttpOnly cookies; clears non-sensitive client hints. */
export async function logoutSession(): Promise<void> {
  if (!isBrowser()) return;
  try {
    await fetch(`${API_BASE}/auth/logout`, {
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

  const res = await fetch(`${API_BASE}/auth/refresh`, {
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
    return fetch(`${API_BASE}${path}`, {
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
    throw new Error(errorMessageFromBody(text, res.status));
  }
  return parseJsonBody<T>(text, path);
}

/** True if the browser has a valid session (HttpOnly cookies). */
export async function isSessionValid(): Promise<boolean> {
  if (!isBrowser()) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include', cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getBootstrapStatus(): Promise<{ setup_required: boolean }> {
  const res = await fetch(`${API_BASE}/system/bootstrap-status`, { cache: 'no-store' });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(errorMessageFromBody(text, res.status));
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
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
    cache: 'no-store'
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(errorMessageFromBody(text, res.status));
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
