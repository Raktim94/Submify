export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api/v1';

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
  try {
    const j = JSON.parse(t) as { error?: string };
    return j.error ?? t;
  } catch {
    return t;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('submify_access_token') : null;
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: 'no-store'
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(errorMessageFromBody(text, res.status));
  }
  return parseJsonBody<T>(text, path);
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
  update_available: boolean;
  latest_version: string;
  current_version: string;
  update_trigger_enabled?: boolean;
  latest_submission: {
    at: string;
    project_id: string;
    project_name: string;
  } | null;
};

/** Pass refresh=true on first load so the API contacts GitHub when needed (rate-limited server-side). */
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
