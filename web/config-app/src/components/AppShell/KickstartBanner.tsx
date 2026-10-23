/**
 * Shown on every admin page while no Kickstart ROM is installed.
 *
 * 68K doors run on the AROS fallback until a sysop uploads a Kickstart 3.x
 * image, which the board cannot ship. The banner reads the same query as the
 * Health page's Kickstart card, so installing a ROM there removes it here.
 */

import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useKickstartStatus } from '../../hooks/useBoardData';

export function KickstartBanner() {
  const { data: status } = useKickstartStatus();
  if (!status || status.found) return null;

  return (
    <div
      role="alert"
      className="flex shrink-0 items-center gap-3 border-b border-status-warn/40 bg-status-warn/10 px-5 py-2"
    >
      <AlertTriangle size={16} className="shrink-0 text-status-warn" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm text-content-primary">
        No Kickstart ROM is installed. 68K doors run on the AROS fallback until you upload a Kickstart 3.x ROM.
      </p>
      <Link
        to="/admin/health"
        className="flex h-control shrink-0 items-center rounded border border-border bg-surface-2 px-2 text-xs text-content-secondary transition-colors hover:bg-surface-3 hover:text-content-primary"
      >
        Upload Kickstart ROM
      </Link>
    </div>
  );
}
