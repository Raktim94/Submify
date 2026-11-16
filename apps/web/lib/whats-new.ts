export type WhatsNewEntry = {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  highlights: string[];
};

// Shown from the topbar's What's New menu (components/app-shell/whats-new-menu.tsx).
// Newest first. Keep entries factual and specific — this mirrors what's
// actually shipped, not marketing copy; cross-check docs/api.md before
// writing a new one.
export const whatsNewEntries: WhatsNewEntry[] = [
  {
    id: '2026-11-16-agent-api-keys',
    date: '2026-11-16',
    title: 'Run Submify from an AI agent',
    highlights: [
      'Settings → API keys for AI agents: create a master API key (smk_…) with an expiry, see when each key was last used, and revoke it instantly.',
      'Built-in MCP server at /api/v1/mcp: Claude Code, Codex or Cursor can create projects and website keys, generate the form snippet, set allowed origins, send a signed test submission, and manage calendars, team members, backups and updates.',
      'A key has exactly your permissions. Creating or revoking keys, adding team members, taking or restoring backups and changing your password stay dashboard-only.',
      'Removing a teammate no longer deletes the projects they created; those projects move to the organization owner.',
    ],
  },
  {
    id: '2026-08-20-calendar',
    date: '2026-08-20',
    title: 'Calendar & booking is here',
    highlights: [
      'A real day/week/month calendar in the app — your own tasks, events, and reminders alongside organization bookings.',
      'Event types: define a bookable service (duration, weekly hours, buffers, minimum notice) and share its public booking page — no login needed for the person booking.',
      'Attendees can reschedule or cancel from their own booking link, and download a .ics file for it. Double-booking is prevented at the database level.',
      'Optional Telegram reminders for both bookings and your personal calendar items, using the Telegram bot you already connected.',
    ],
  },
];
