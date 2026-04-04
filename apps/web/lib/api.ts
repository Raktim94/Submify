export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api/v1';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('submify_access_token') : null;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(init?.headers || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
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
