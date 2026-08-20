import { api } from '@/lib/api';

export type PersonalEventKind = 'event' | 'task' | 'reminder';

export type PersonalEvent = {
  id: string;
  organization_id: string;
  user_id: string;
  title: string;
  description: string;
  kind: PersonalEventKind;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  color: string;
  is_completed: boolean;
  remind_at: string | null;
  reminder_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PersonalEventInput = {
  title: string;
  description?: string;
  kind?: PersonalEventKind;
  starts_at: string;
  ends_at?: string | null;
  all_day?: boolean;
  color?: string;
  remind_at?: string | null;
};

export type PersonalEventPatch = Partial<PersonalEventInput> & { is_completed?: boolean };

export async function listPersonalEvents(from: string, to: string): Promise<{ items: PersonalEvent[] }> {
  return api<{ items: PersonalEvent[] }>(`/calendar/items?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
}

export async function createPersonalEvent(input: PersonalEventInput): Promise<{ item: PersonalEvent }> {
  return api<{ item: PersonalEvent }>('/calendar/items', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

// The backend treats ends_at/remind_at as "leave unchanged" when the key is
// absent from the JSON body, and "clear it" when sent as an explicit empty
// string — it cannot distinguish absent from JSON null. Never send `null`
// for these two fields; omit the key to leave unchanged, or send '' to clear.
export async function updatePersonalEvent(id: string, patch: PersonalEventPatch): Promise<{ item: PersonalEvent }> {
  return api<{ item: PersonalEvent }>(`/calendar/items/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
}

export async function deletePersonalEvent(id: string): Promise<{ status: string }> {
  return api<{ status: string }>(`/calendar/items/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}
