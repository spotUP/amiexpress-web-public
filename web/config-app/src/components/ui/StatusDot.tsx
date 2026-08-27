/**
 * An 8 px status dot that is always accompanied by a text label.
 *
 * Colour is never the only channel carrying the state - a requirement, not a
 * nicety. Pass `labelHidden` only when the same word is already on screen
 * beside the dot, and it still reaches a screen reader.
 */

import type { StatusTone } from '../../types/ui';

const TONE_CLASS: Record<StatusTone, string> = {
  ok: 'bg-status-ok',
  warn: 'bg-status-warn',
  danger: 'bg-status-danger',
  info: 'bg-status-info',
  neutral: 'bg-status-neutral',
  // Offline: an empty ring reads as absence rather than as another colour.
  hollow: 'bg-transparent border border-status-neutral',
};

interface StatusDotProps {
  tone: StatusTone;
  label: string;
  labelHidden?: boolean;
  className?: string;
}

export function StatusDot({ tone, label, labelHidden = false, className = '' }: StatusDotProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_CLASS[tone]}`} aria-hidden="true" />
      <span className={labelHidden ? 'sr-only' : 'text-content-secondary'}>{label}</span>
    </span>
  );
}
