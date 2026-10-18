import { AlertCircle, Check, Loader2 } from 'lucide-react';

export interface AutosaveStatusProps {
  saving: boolean;
  saved: boolean;
  error: string | null;
  /** What the line says before anything has been edited. */
  idleText?: string;
}

/**
 * The save state of an autosaving dialog, shown beside its Close button.
 *
 * "no toast when it saves? i get no confirmation at all" (sysop, 2026-10-19).
 * The toast did fire, but in the top-right corner, away from the dialog the
 * sysop was typing in, and it closes on its own. A dialog with no Save button
 * has to say "Saved" where the eyes already are.
 */
export function AutosaveStatus({ saving, saved, error, idleText = 'Changes save themselves' }: AutosaveStatusProps) {
  if (saving) {
    return (
      <span role="status" className="flex items-center gap-1.5 text-sm text-content-secondary">
        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
        Saving...
      </span>
    );
  }
  if (error) {
    return (
      <span role="status" className="flex items-center gap-1.5 text-sm text-status-danger">
        <AlertCircle size={14} aria-hidden="true" />
        Not saved: {error}
      </span>
    );
  }
  if (saved) {
    return (
      <span role="status" className="flex items-center gap-1.5 text-sm text-status-ok">
        <Check size={14} aria-hidden="true" />
        Saved
      </span>
    );
  }
  return (
    <span role="status" className="text-sm text-content-secondary">
      {idleText}
    </span>
  );
}
