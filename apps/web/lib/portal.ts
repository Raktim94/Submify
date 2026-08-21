import { apiBase, userFacingApiError } from './api';

export type PortalSubmission = {
  id: string;
  data: unknown;
  files: unknown;
  client_ip?: string;
  user_agent?: string;
  created_at: string;
};

export type PortalLookup = {
  exists: boolean;
  project_name: string;
  owner_access: boolean;
  password_required: boolean;
};

/**
 * Portal requests are cookie-authenticated and project-scoped. They deliberately do NOT
 * use the dashboard `api()` helper, which redirects to /login on 401 — a client-portal
 * visitor has no dashboard account and must stay on /<slug>.
 */
function portalFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${apiBase()}/portal${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    credentials: 'include',
    cache: 'no-store'
  });
}

/** Returns null when no accessible portal exists at this slug. */
export async function portalLookup(slug: string): Promise<PortalLookup | null> {
  const res = await portalFetch(`/lookup?slug=${encodeURIComponent(slug)}`);
  if (res.status === 404) return null;
  const text = await res.text();
  if (!res.ok) throw new Error(userFacingApiError(text, res.status));
  return JSON.parse(text) as PortalLookup;
}

/** Returns null when the current visitor has no valid portal session yet. */
export async function portalInfo(): Promise<{ project_name: string; submission_count: number } | null> {
  const res = await portalFetch('/info');
  if (res.status === 401 || res.status === 403) return null;
  const text = await res.text();
  if (!res.ok) throw new Error(userFacingApiError(text, res.status));
  return JSON.parse(text) as { project_name: string; submission_count: number };
}

export async function portalLogin(slug: string, password: string): Promise<{ project_name: string }> {
  const res = await portalFetch('/login', {
    method: 'POST',
    body: JSON.stringify({ slug, password })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(userFacingApiError(text, res.status));
  return JSON.parse(text) as { project_name: string };
}

export async function portalLogout(): Promise<void> {
  try {
    await portalFetch('/logout', { method: 'POST', body: '{}' });
  } catch {
    /* ignore network errors on logout */
  }
}

export async function portalSubmissions(limit = 200): Promise<PortalSubmission[]> {
  const res = await portalFetch(`/submissions?limit=${limit}`);
  const text = await res.text();
  if (!res.ok) throw new Error(userFacingApiError(text, res.status));
  return (JSON.parse(text) as { submissions: PortalSubmission[] }).submissions;
}

export async function portalExport(format: 'xlsx' | 'pdf'): Promise<Blob> {
  const res = await portalFetch(`/export?format=${format}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(userFacingApiError(text, res.status));
  }
  return res.blob();
}

// --- Calendar (read-only) ---
// Bookings/event types are organization-scoped on the backend (no
// project_id column exists on either table), so a portal session's
// calendar view shows its whole organization's bookings, not just ones
// tied to this one project. See
// docs/decisions/0010-portal-calendar-read-only.md.

export type PortalEventType = {
  id: string;
  title: string;
  description: string;
  duration_minutes: number;
  location: string;
  timezone: string;
  is_active: boolean;
};

// Deliberately missing attendee_email/notes/manage_token compared to the
// dashboard's `Booking` (lib/calendar.ts) — the portal API never sends them.
export type PortalBooking = {
  id: string;
  event_type_id: string;
  event_type_title: string;
  location: string;
  starts_at: string;
  ends_at: string;
  attendee_name: string;
  status: 'confirmed' | 'cancelled';
  created_at: string;
  cancelled_at?: string;
};

export async function portalEventTypes(): Promise<PortalEventType[]> {
  const res = await portalFetch('/event-types');
  const text = await res.text();
  if (!res.ok) throw new Error(userFacingApiError(text, res.status));
  return (JSON.parse(text) as { event_types: PortalEventType[] }).event_types;
}

export async function portalBookings(from: string, to: string): Promise<PortalBooking[]> {
  const q = new URLSearchParams({ from, to });
  const res = await portalFetch(`/bookings?${q.toString()}`);
  const text = await res.text();
  if (!res.ok) throw new Error(userFacingApiError(text, res.status));
  return (JSON.parse(text) as { bookings: PortalBooking[] }).bookings;
}
