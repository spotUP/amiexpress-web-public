/**
 * A single number, with the label under it and an optional footnote.
 *
 * The number is mono with tabular figures so a row of tiles lines up and a
 * changing value does not shift the ones beside it.
 */

import type { LucideIcon } from 'lucide-react';
import type { StatusTone } from '../../types/ui';

const TONE_TEXT: Record<StatusTone, string> = {
  ok: 'text-status-ok',
  warn: 'text-status-warn',
  danger: 'text-status-danger',
  info: 'text-status-info',
  neutral: 'text-content-primary',
  hollow: 'text-content-muted',
};

interface StatTileProps {
  label: string;
  value: string;
  icon?: LucideIcon;
  tone?: StatusTone;
  footnote?: string;
  loading?: boolean;
}

export function StatTile({ label, value, icon: Icon, tone = 'neutral', footnote, loading = false }: StatTileProps) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-content-muted">{label}</span>
        {Icon && <Icon size={14} className="text-content-muted" aria-hidden="true" />}
      </div>
      {loading ? (
        <div className="mt-2 h-7 w-20 animate-pulse rounded bg-surface-3" />
      ) : (
        <p className={`mt-1 font-mono text-2xl tabular-nums ${TONE_TEXT[tone]}`}>{value}</p>
      )}
      {footnote && <p className="mt-1 text-xs text-content-muted">{footnote}</p>}
    </div>
  );
}
