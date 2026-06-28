'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from './button';
import { Input } from './field';

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  /** When set, the confirm button stays disabled until the user types this exact string. */
  confirmText?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setTyped('');
      return;
    }
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [open, onCancel]);

  if (!open) return null;

  const confirmDisabled = Boolean(confirmText) && typed !== confirmText;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl focus:outline-none"
      >
        <h2 id="confirm-dialog-title" className="font-display text-lg font-bold text-slate-900">
          {title}
        </h2>
        {description ? <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{description}</p> : null}
        {confirmText ? (
          <div className="mt-4">
            <Input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={`Type ${confirmText} to confirm`}
              aria-label={`Type ${confirmText} to confirm`}
            />
          </div>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} disabled={confirmDisabled} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
