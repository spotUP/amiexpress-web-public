/**
 * Overview - the landing page.
 *
 * The admin used to open on a 1 729-line configuration form. The first screen
 * a sysop sees should be the state of the board.
 *
 * Every figure comes from an endpoint that already existed. The shared socket
 * does not feed this page directly: it invalidates the query keys behind it,
 * so a caller logging on moves these tiles without any of them subscribing to
 * anything.
 */

import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Download,
  Gauge,
  HardDrive,
  Phone,
  PhoneCall,
  Server,
  Upload,
  Users,
} from 'lucide-react';
import {
  useHealthReport,
  useLastCallers,
  useLastDownloads,
  useLastUploads,
  useNodeStatus,
  useSystemStats,
} from '../hooks/useBoardData';
import { NODE_STATE_TONE, nodeState, nodeStateLabel } from '../lib/node-state';
import { formatBytes, formatCount, formatMinutes, formatRelativeTime } from '../lib/format';
import { useRealtime } from '../realtime/RealtimeProvider';
import { StatTile } from '../components/ui/StatTile';
import { StatusDot } from '../components/ui/StatusDot';
import { EmptyState, ErrorPanel, SkeletonRows } from '../components/ui/states';
import type { NodeStatus } from '../types/bbs';

function NodeCard({ node }: { node: NodeStatus }) {
  const state = nodeState(node);
  const label = nodeStateLabel(state);

  return (
    <div className="rounded-lg border border-border bg-surface-1 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm text-content-primary">Node {node.nodeId}</span>
        <StatusDot tone={NODE_STATE_TONE[state]} label={label} className="text-xs" />
      </div>

      <p className="mt-2 truncate font-mono text-sm text-content-primary">
        {node.username ?? <span className="text-content-muted">No caller</span>}
      </p>

      <dl className="mt-1 space-y-0.5 text-xs">
        {node.currentActivity && (
          <div className="flex justify-between gap-2">
            <dt className="text-content-muted">Activity</dt>
            <dd className="truncate text-content-secondary">{node.currentActivity}</dd>
          </div>
        )}
        {node.timeRemaining !== undefined && node.online && (
          <div className="flex justify-between gap-2">
            <dt className="text-content-muted">Time left</dt>
            <dd className="font-mono tabular-nums text-content-secondary">{formatMinutes(node.timeRemaining)}</dd>
          </div>
        )}
        {node.reservedFor && (
          <div className="flex justify-between gap-2">
            <dt className="text-content-muted">Reserved for</dt>
            <dd className="truncate font-mono text-status-warn">{node.reservedFor}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function PanelHeading({ title, to, linkLabel }: { title: string; to?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold text-content-primary">{title}</h2>
      {to && (
        <Link
          to={to}
          className="flex items-center gap-1 text-xs text-accent transition-colors hover:text-accent-hover"
        >
          {linkLabel ?? 'Open'}
          <ArrowRight size={12} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

export function OverviewPage() {
  const { pendingPages } = useRealtime();
  const nodes = useNodeStatus();
  const stats = useSystemStats();
  const health = useHealthReport();
  const callers = useLastCallers(6);
  const uploads = useLastUploads(5);
  const downloads = useLastDownloads(5);

  const nodeList = nodes.data?.data ?? [];
  const onlineNodes = nodes.data?.onlineNodes ?? 0;
  const totalNodes = nodes.data?.totalNodes ?? 0;
  const occupied = nodeList.filter((node) => nodeState(node) === 'online').length;

  const allTime = stats.data?.data.allTime;
  const today = stats.data?.data.today;
  const report = health.data;

  const healthTone = report?.overallStatus === 'healthy'
    ? 'ok'
    : report?.overallStatus === 'warnings'
      ? 'warn'
      : report?.overallStatus === 'errors'
        ? 'danger'
        : 'neutral';

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile
          label="Nodes online"
          value={`${onlineNodes} / ${totalNodes}`}
          icon={Server}
          tone={onlineNodes > 0 ? 'ok' : 'neutral'}
          footnote={`${occupied} carrying a caller`}
          loading={nodes.isLoading}
        />
        <StatTile
          label="Callers today"
          value={formatCount(today?.calls)}
          icon={Phone}
          loading={stats.isLoading}
        />
        <StatTile
          label="Users active today"
          value={formatCount(today?.activeUsers)}
          icon={Users}
          footnote={allTime ? `${formatCount(allTime.totalUsers)} accounts` : undefined}
          loading={stats.isLoading}
        />
        <StatTile
          label="Files"
          value={formatCount(allTime?.totalFiles)}
          icon={HardDrive}
          footnote={allTime ? formatBytes(allTime.totalBytes) : undefined}
          loading={stats.isLoading}
        />
        <StatTile
          label="Callers waiting"
          value={formatCount(pendingPages)}
          icon={PhoneCall}
          tone={pendingPages > 0 ? 'warn' : 'neutral'}
          footnote={pendingPages > 0 ? 'Someone is paging the sysop' : 'Nobody is paging'}
        />
        <StatTile
          label="Health"
          value={report ? `${report.totalIssues}` : '-'}
          icon={Gauge}
          tone={healthTone}
          footnote={report ? `${report.autoFixableIssues} fixable automatically` : 'Checking the filesystem'}
          loading={health.isLoading}
        />
      </section>

      <section>
        <PanelHeading title="Nodes" to="/admin/nodes?tab=live" linkLabel="Node control" />
        {nodes.isError ? (
          <ErrorPanel
            message={nodes.error instanceof Error ? nodes.error.message : 'Node status could not be read'}
            onRetry={() => void nodes.refetch()}
          />
        ) : nodes.isLoading ? (
          <SkeletonRows rows={3} />
        ) : nodeList.length === 0 ? (
          <div className="card">
            <EmptyState icon={Server} message="No nodes are configured yet." />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {nodeList.map((node) => (
              <NodeCard key={node.nodeId} node={node} />
            ))}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card">
          <PanelHeading title="Last callers" to="/admin/statistics" linkLabel="Statistics" />
          {callers.isLoading ? (
            <SkeletonRows rows={4} />
          ) : (callers.data?.data.length ?? 0) === 0 ? (
            <EmptyState icon={Phone} message="Nobody has called yet." />
          ) : (
            <ul className="space-y-1">
              {callers.data?.data.map((caller) => (
                <li key={caller.id} className="flex h-row items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-mono text-content-primary">{caller.username}</span>
                  <span className="shrink-0 text-xs text-content-muted">
                    {formatRelativeTime(caller.timestamp)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <PanelHeading title="Recent uploads" />
          {uploads.isLoading ? (
            <SkeletonRows rows={4} />
          ) : (uploads.data?.data.length ?? 0) === 0 ? (
            <EmptyState icon={Upload} message="No uploads recorded." />
          ) : (
            <ul className="space-y-1">
              {uploads.data?.data.map((file) => (
                <li key={file.id} className="flex h-row items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-mono text-content-primary">{file.filename}</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-content-muted">
                    {formatBytes(file.size)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <PanelHeading title="Recent downloads" />
          {downloads.isLoading ? (
            <SkeletonRows rows={4} />
          ) : (downloads.data?.data.length ?? 0) === 0 ? (
            <EmptyState icon={Download} message="No downloads recorded." />
          ) : (
            <ul className="space-y-1">
              {downloads.data?.data.map((file) => (
                <li key={file.id} className="flex h-row items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-mono text-content-primary">{file.filename}</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-content-muted">
                    {formatCount(file.downloadCount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="card">
        <PanelHeading title="Health" to="/admin/health" linkLabel="Health Check" />
        {health.isLoading ? (
          <SkeletonRows rows={3} />
        ) : !report ? (
          <EmptyState icon={Gauge} message="The health report is not available." />
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {report.categories.map((category) => (
              <div
                key={category.category}
                className="flex h-row items-center justify-between gap-2 rounded border border-border px-2 text-sm"
              >
                <span className="truncate text-content-secondary">{category.category}</span>
                <StatusDot
                  tone={category.errorCount > 0 ? 'danger' : category.warningCount > 0 ? 'warn' : 'ok'}
                  label={
                    category.errorCount > 0
                      ? `${category.errorCount} errors`
                      : category.warningCount > 0
                        ? `${category.warningCount} warnings`
                        : 'Passed'
                  }
                  className="shrink-0 text-xs"
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
