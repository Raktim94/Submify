// Shared helpers for rendering/exporting submission `data` (JSON) as flat table cells.

export type AnySubmission = {
  id: string;
  data: unknown;
  files: unknown;
  client_ip?: string;
  user_agent?: string;
  created_at: string;
};

export function normalizeDataObject(data: unknown): Record<string, unknown> {
  if (data === null || data === undefined) return {};
  if (typeof data === 'string') {
    try {
      const p = JSON.parse(data) as unknown;
      if (p && typeof p === 'object' && !Array.isArray(p)) return p as Record<string, unknown>;
    } catch {
      return { message: data };
    }
    return {};
  }
  if (typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>;
  return { value: data };
}

export function cellString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function dataAsFlatRecord(data: unknown): Record<string, string> {
  const raw = normalizeDataObject(data);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = cellString(v);
  }
  return out;
}

export function fieldLabel(key: string): string {
  const s = key.trim();
  if (!s) return key;
  const spaced = s.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced
    .split(/\s+/)
    .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}

export function sortedDataKeysForRow(data: unknown): string[] {
  return Object.keys(dataAsFlatRecord(data)).sort((a, b) => a.localeCompare(b));
}

export function filesSummary(files: unknown): string {
  if (files === null || files === undefined) return '';
  if (Array.isArray(files)) return files.length === 0 ? '—' : `${files.length} file(s)`;
  return cellString(files);
}

export function allDataKeys(items: AnySubmission[]): string[] {
  const keys = new Set<string>();
  for (const item of items) {
    Object.keys(dataAsFlatRecord(item.data)).forEach((k) => keys.add(k));
  }
  return Array.from(keys).sort((a, b) => a.localeCompare(b));
}

export function buildCsv(items: AnySubmission[], dataKeys: string[]): string {
  const baseCols = ['submitted_at', 'submission_id', 'client_ip', 'user_agent'];
  const cols = [...baseCols, ...dataKeys, 'files'];
  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const lines: string[] = [];
  lines.push(cols.map(esc).join(','));
  for (const item of items) {
    const d = dataAsFlatRecord(item.data);
    const row = cols.map((c) => {
      if (c === 'submitted_at') return new Date(item.created_at).toISOString();
      if (c === 'submission_id') return item.id;
      if (c === 'client_ip') return item.client_ip ?? '';
      if (c === 'user_agent') return item.user_agent ?? '';
      if (c === 'files') return filesSummary(item.files);
      return d[c] ?? '';
    });
    lines.push(row.map(esc).join(','));
  }
  return '\uFEFF' + lines.join('\n');
}

/** Triggers a browser download for a text/blob payload. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function safeFileStem(name: string): string {
  return (name || 'project').replace(/[^\w-]+/g, '_').slice(0, 40);
}
