import { api, apiBase, userFacingApiError } from './api';

export type RestoreResult = {
  status: string;
  tables: Record<string, number>;
  files_restored: number;
  file_warnings?: string[];
  safety_backup?: string;
  restored_from?: string;
};

export type S3BackupConfig = {
  endpoint: string;
  access_key: string;
  secret_key: string;
  bucket: string;
};

export type S3BackupObject = {
  key: string;
  size: number;
  last_modified: string;
};

export type UpdateCheckResult = {
  current_version: string;
  latest_version: string;
  update_available: boolean;
};

/**
 * Admin backup/restore/update requests, cookie-authenticated like the rest
 * of the dashboard. Deliberately not routed through `api()` for the file
 * download/upload calls below — `api()` always forces
 * `Content-Type: application/json`, which is wrong for a binary zip
 * response and would strip the browser's own multipart boundary from a
 * file upload.
 */
function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${apiBase()}${path}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store'
  });
}

function backupFilenameFromResponse(res: Response): string {
  const header = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^";]+)"?/.exec(header);
  return match?.[1] ?? `submify-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
}

/** Downloads a full-instance backup. Returns the blob and the filename the server suggested. */
export async function downloadBackup(): Promise<{ blob: Blob; filename: string }> {
  const res = await adminFetch('/system/backup', { method: 'POST' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(userFacingApiError(text, res.status));
  }
  return { blob: await res.blob(), filename: backupFilenameFromResponse(res) };
}

async function parseRestoreResponse(res: Response): Promise<RestoreResult> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(userFacingApiError(text, res.status));
  }
  return JSON.parse(text) as RestoreResult;
}

/** Restores an uploaded local backup file over the ALREADY-active install. Requires typed confirmation. */
export async function restoreBackupFromFile(file: File, confirm: string): Promise<RestoreResult> {
  const form = new FormData();
  form.set('confirm', confirm);
  form.set('backup', file);
  const res = await adminFetch('/system/restore/active', { method: 'POST', body: form });
  return parseRestoreResponse(res);
}

export async function setBackupS3Config(cfg: S3BackupConfig): Promise<{ status: string }> {
  return api<{ status: string }>('/system/backup/s3-config', {
    method: 'PUT',
    body: JSON.stringify(cfg)
  });
}

export async function backupToS3(): Promise<{ status: string; key: string; size: number }> {
  return api<{ status: string; key: string; size: number }>('/system/backup/s3', { method: 'POST' });
}

export async function listS3Backups(): Promise<{ backups: S3BackupObject[] }> {
  return api<{ backups: S3BackupObject[] }>('/system/backup/s3');
}

export async function restoreBackupFromS3(key: string, confirm: string): Promise<RestoreResult> {
  return api<RestoreResult>('/system/backup/s3/restore', {
    method: 'POST',
    body: JSON.stringify({ key, confirm })
  });
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  return api<UpdateCheckResult>('/system/update/check');
}

export async function applyUpdate(): Promise<{ status: string; message: string }> {
  return api<{ status: string; message: string }>('/system/update/apply', { method: 'POST' });
}

/**
 * Polls GET /system/health until it responds OK or the timeout elapses —
 * used after an update-apply to detect when the instance has come back.
 * Deliberately a plain unauthenticated fetch (the health endpoint itself
 * is public): cookies may briefly behave oddly across the exact moment the
 * container restarts, and this check only needs to know "is something
 * answering again," not "am I still logged in."
 */
export async function waitForHealthy(timeoutMs = 180_000, intervalMs = 3000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    try {
      const res = await fetch(`${apiBase()}/system/health`, { cache: 'no-store' });
      if (res.ok) return true;
    } catch {
      /* expected while the instance is restarting */
    }
  }
  return false;
}
