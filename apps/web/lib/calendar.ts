import { api, apiBase, userFacingApiError } from './api';

export type EventType = {
  id: string;
  organization_id: string;
  host_user_id: string;
  slug: string;
  title: string;
  description: string;
  duration_minutes: number;
  location: string;
  timezone: string;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  min_notice_minutes: number;
  max_advance_days: number;
  slot_interval_minutes: number;
  is_active: boolean;
  created_at: string;
};

export type AvailabilityRule = {
  weekday: number; // 0=Sunday..6=Saturday
  start_minute: number;
  end_minute: number;
};

export type AvailabilityOverride = {
  date: string;
  blocked: boolean;
  start_minute?: number;
  end_minute?: number;
};

export type Booking = {
  id: string;
  organization_id: string;
  event_type_id: string;
  starts_at: string;
  ends_at: string;
  attendee_name: string;
  attendee_email: string;
  attendee_timezone: string;
  notes: string;
  status: 'confirmed' | 'cancelled';
  manage_token?: string;
  created_at: string;
  cancelled_at?: string;
};

export type CreateEventTypeInput = {
  slug: string;
  title: string;
  description?: string;
  duration_minutes: number;
  location?: string;
  timezone: string;
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;
  min_notice_minutes?: number;
  max_advance_days?: number;
  slot_interval_minutes?: number;
  rules: AvailabilityRule[];
};

export async function listEventTypes(): Promise<{ event_types: EventType[] }> {
  return api('/event-types');
}

export async function createEventType(input: CreateEventTypeInput): Promise<{ event_type: EventType; rules: AvailabilityRule[] }> {
  return api('/event-types', { method: 'POST', body: JSON.stringify(input) });
}

export async function getEventType(
  id: string
): Promise<{ event_type: EventType; rules: AvailabilityRule[]; overrides: AvailabilityOverride[] }> {
  return api(`/event-types/${encodeURIComponent(id)}`);
}

export async function deleteEventType(id: string): Promise<{ status: string }> {
  return api(`/event-types/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function upsertEventTypeOverride(
  id: string,
  body: { date: string; blocked: boolean; start_minute?: number; end_minute?: number }
): Promise<{ status: string }> {
  return api(`/event-types/${encodeURIComponent(id)}/overrides`, { method: 'PUT', body: JSON.stringify(body) });
}

export async function listOrgBookings(from?: string, to?: string): Promise<{ bookings: Booking[] }> {
  const q = new URLSearchParams();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  const qs = q.toString();
  return api(`/bookings${qs ? `?${qs}` : ''}`);
}

export async function cancelOrgBooking(id: string): Promise<{ booking: Booking }> {
  return api(`/bookings/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
}

// --- Public booking flow (no auth cookie needed, but harmless if sent) ---

export type PublicEventType = {
  id: string;
  title: string;
  description: string;
  duration_minutes: number;
  location: string;
  timezone: string;
};

export type PublicSlot = { start: string; end: string };

async function publicGet<T>(path: string): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, { cache: 'no-store' });
  const text = await res.text();
  if (!res.ok) throw new Error(userFacingApiError(text, res.status));
  return JSON.parse(text) as T;
}

async function publicPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store'
  });
  const text = await res.text();
  if (!res.ok) throw new Error(userFacingApiError(text, res.status));
  return JSON.parse(text) as T;
}

export async function getPublicEventType(id: string): Promise<PublicEventType> {
  return publicGet(`/public/event-types/${encodeURIComponent(id)}`);
}

export async function getPublicSlots(id: string): Promise<{ slots: PublicSlot[]; timezone: string }> {
  return publicGet(`/public/event-types/${encodeURIComponent(id)}/slots`);
}

export async function createPublicBooking(
  eventTypeId: string,
  body: { starts_at: string; attendee_name: string; attendee_email: string; attendee_timezone?: string; notes?: string }
): Promise<{ booking: Booking; manage_url: string }> {
  return publicPost(`/public/event-types/${encodeURIComponent(eventTypeId)}/bookings`, body);
}

export async function getPublicBooking(token: string): Promise<{ booking: Booking }> {
  return publicGet(`/public/bookings/${encodeURIComponent(token)}`);
}

export async function reschedulePublicBooking(token: string, startsAt: string): Promise<{ booking: Booking }> {
  return publicPost(`/public/bookings/${encodeURIComponent(token)}/reschedule`, { starts_at: startsAt });
}

export async function cancelPublicBooking(token: string): Promise<{ booking: Booking }> {
  return publicPost(`/public/bookings/${encodeURIComponent(token)}/cancel`, {});
}
