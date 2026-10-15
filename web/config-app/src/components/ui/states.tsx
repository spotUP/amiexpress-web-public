/**
 * The three states every data surface needs besides its data.
 *
 * A centred "Loading..." string tells a sysop nothing and moves the layout
 * when it is replaced; a blank panel where an empty list should be looks like
 * a bug. These are what those cases render instead.
 */

import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-1" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-row animate-pulse rounded bg-surface-2" />
      ))}
    </div>
  );
}

interface EmptyStateProps {
  icon?: LucideIcon;
  message: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      {Icon && <Icon size={20} className="text-content-muted" aria-hidden="true" />}
      <p className="text-sm text-content-secondary">{message}</p>
      {action}
    </div>
  );
}

interface ErrorPanelProps {
  /** The message the API actually returned, not a friendly rewrite of it. */
  message: string;
  onRetry?: () => void;
}

export function ErrorPanel({ message, onRetry }: ErrorPanelProps) {
  return (
    <div className="flex items-start gap-3 rounded border border-status-danger/40 bg-status-danger/10 p-3">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-status-danger" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-content-primary">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="flex h-control shrink-0 items-center gap-1.5 rounded border border-border bg-surface-2 px-2 text-xs text-content-secondary transition-colors hover:bg-surface-3 hover:text-content-primary"
        >
          <RefreshCw size={12} aria-hidden="true" />
          Retry
        </button>
      )}
    </div>
  );
}
