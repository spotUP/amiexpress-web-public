import type { ReactNode } from 'react';

/**
 * An MCI code is a thing the board RUNS, not part of the picture. Drawn in the
 * board's own font it reads as art, which is how a sysop comes to paint over
 * one; drawn as a chip it reads as a control. Red when it points at nothing.
 *
 * One component because the editor and the file panel show the same codes, and
 * a copy in each is a copy that drifts.
 */
export function CodeChip({ children, dead = false }: { children: ReactNode; dead?: boolean }) {
  return (
    <code
      className={`rounded px-2 py-0.5 font-mono text-xs ${
        dead ? 'bg-status-danger/15 text-status-danger' : 'bg-surface-2 text-content-primary'
      }`}
    >
      {children}
    </code>
  );
}
