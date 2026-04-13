export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api/v1';

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

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed with ${res.status}`);
  }
  return res.json();
}

export async function getBootstrapStatus(): Promise<{ setup_required: boolean }> {
  const res = await fetch(`${API_BASE}/system/bootstrap-status`, { cache: 'no-store' });
  return res.json();
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
  if (!res.ok) {
    const text = await res.text();
    try {
      const j = JSON.parse(text) as { error?: string };
      throw new Error(j.error ?? text);
    } catch (e) {
      if (e instanceof Error && e.message !== text) throw e;
      throw new Error(text || `Request failed with ${res.status}`);
    }
  }
  return res.json() as Promise<{
    access_token: string;
    refresh_token: string;
    api_key: string;
    email: string;
    full_name: string;
    phone: string;
  }>;
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
