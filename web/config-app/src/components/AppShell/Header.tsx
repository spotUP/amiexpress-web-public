/**
 * Page title, the system pill, and the density control.
 *
 * The pill is honest about where its numbers come from: this phase polls, so
 * it says "Polling" and shows when it last heard from the board. When the
 * realtime layer lands it becomes "Live" with the seconds since the last
 * event, and nothing else here changes.
 */

import { useLocation } from 'react-router-dom';
import { AlignJustify, Rows } from 'lucide-react';
import { useDensity } from '../../hooks/useDensity';
import { NODE_BACKGROUND_POLL_MS, useNodeStatus, useSessionStats } from '../../hooks/useBoardData';
import { formatClockTime, formatDuration } from '../../lib/format';
import { StatusDot } from '../ui/StatusDot';
import { navItemForPath } from './nav-config';

export function Header() {
  const location = useLocation();
  const { density, toggleDensity } = useDensity();
  const { data: nodeStatus, dataUpdatedAt, isError } = useNodeStatus(NODE_BACKGROUND_POLL_MS);
  const { data: sessionStats } = useSessionStats();

  const item = navItemForPath(location.pathname);
  const onlineNodes = nodeStatus?.onlineNodes ?? 0;
  const totalNodes = nodeStatus?.totalNodes ?? 0;
  const uptime = sessionStats?.data?.uptime;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface-1 px-5">
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold text-content-primary">
          {item?.label ?? 'Administration'}
        </h1>
        {item?.description && (
          <p className="truncate text-xs text-content-muted">{item.description}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <div className="flex items-center gap-3 rounded border border-border bg-surface-2 px-3 py-1.5 text-xs">
          <StatusDot
            tone={isError ? 'danger' : 'info'}
            label={isError ? 'Disconnected' : 'Polling'}
          />
          <span className="text-content-muted">|</span>
          <span className="text-content-secondary">
            Nodes <span className="font-mono text-content-primary">{onlineNodes}</span>
            <span className="text-content-muted"> of </span>
            <span className="font-mono text-content-primary">{totalNodes}</span>
          </span>
          {uptime !== undefined && (
            <>
              <span className="text-content-muted">|</span>
              <span className="text-content-secondary">
                Uptime <span className="font-mono text-content-primary">{formatDuration(uptime)}</span>
              </span>
            </>
          )}
          {dataUpdatedAt > 0 && (
            <>
              <span className="text-content-muted">|</span>
              <span className="font-mono text-content-muted">{formatClockTime(dataUpdatedAt)}</span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={toggleDensity}
          className="flex h-control items-center gap-2 rounded border border-border bg-surface-2 px-3 text-xs text-content-secondary transition-colors hover:bg-surface-3 hover:text-content-primary"
          aria-pressed={density === 'compact'}
          title={density === 'compact' ? 'Switch to comfortable rows' : 'Switch to compact rows'}
        >
          {density === 'compact' ? <AlignJustify size={14} aria-hidden="true" /> : <Rows size={14} aria-hidden="true" />}
          {density === 'compact' ? 'Compact' : 'Comfortable'}
        </button>
      </div>
    </header>
  );
}
