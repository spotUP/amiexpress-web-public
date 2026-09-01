/**
 * Activity - the live feed of what the board is doing.
 *
 * Seeded on mount from the last callers, uploads and downloads endpoints, so
 * it is not an empty box on a quiet board, then extended by `bbs:event` as
 * things happen. The buffer is capped: a busy board emits several events a
 * second and an unbounded list is a memory leak with a scrollbar.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  DoorOpen,
  Download,
  LogIn,
  LogOut,
  Pause,
  Play,
  Upload,
  Zap,
  Terminal,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { useBbsEvents, useRealtime } from '../realtime/RealtimeProvider';
import { useLastCallers, useLastDownloads, useLastUploads, useNodeStatus } from '../hooks/useBoardData';
import { whoIsDoingWhat } from './who-is-doing-what';
import { formatBytes, formatClockTime, formatRelativeTime } from '../lib/format';
import { StatusDot } from '../components/ui/StatusDot';
import { EmptyState } from '../components/ui/states';
import type { BBSEvent, BBSEventType } from '../types/realtime';
import { describeCommand, describeDoorActivity, describeTransfer, isGameCategory } from './activity-phrasing';
import type { StatusTone } from '../types/ui';

/** A busy board fills this in a few minutes; older entries fall off the end. */
const MAX_ENTRIES = 500;

/**
 * Put the newest entry on the front and hold the buffer at its cap.
 *
 * A pure function rather than an inline setState body so a busy board can be
 * simulated against it: the feed runs for as long as the tab is open, and
 * "several events a second, indefinitely" is the one condition this page has
 * never actually met.
 */
export function appendEntry(
  current: ActivityEntry[],
  entry: ActivityEntry,
  max: number = MAX_ENTRIES
): ActivityEntry[] {
  return [entry, ...current].slice(0, max);
}

export interface ActivityEntry {
  id: string;
  type: BBSEventType;
  username: string;
  nodeId: number;
  timestamp: number;
  detail: string;
  /** True for the rows read from the statistics endpoints on mount. */
  seeded?: boolean;
}

const TYPE_ICON: Record<BBSEventType, LucideIcon> = {
  user_login: LogIn,
  user_logout: LogOut,
  upload: Upload,
  download: Download,
  door_activity: DoorOpen,
  custom_door_event: Zap,
  command: Terminal,
};

const TYPE_TONE: Record<BBSEventType, StatusTone> = {
  user_login: 'ok',
  user_logout: 'neutral',
  upload: 'info',
  download: 'info',
  door_activity: 'warn',
  custom_door_event: 'warn',
  // What a user is DOING is the ordinary case, not an alert.
  command: 'neutral',
};

const TYPE_LABEL: Record<BBSEventType, string> = {
  user_login: 'Logged on',
  user_logout: 'Logged off',
  upload: 'Upload',
  download: 'Download',
  door_activity: 'Door',
  custom_door_event: 'Door event',
  command: 'Command',
};

const FILTERS: { id: 'all' | BBSEventType; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'user_login', label: 'Logons' },
  { id: 'upload', label: 'Uploads' },
  { id: 'download', label: 'Downloads' },
  { id: 'door_activity', label: 'Doors' },
  { id: 'command', label: 'Commands' },
];

function describe(
  event: BBSEvent,
  conferenceName: (id: number | undefined) => string | undefined,
): string {
  switch (event.type) {
    case 'user_login':
      return event.data?.location ? `from ${event.data.location}` : '';
    case 'user_logout':
      return '';
    case 'upload':
    case 'download': {
      const size = event.data?.fileSize;
      return describeTransfer(
        event.type,
        event.data?.fileName,
        size ? formatBytes(size) : undefined,
        event.data?.conferenceName ?? conferenceName(event.data?.conferenceId),
      );
    }
    case 'door_activity':
      // A door the board knows to be a game is played; anything else - and
      // any 68K door, which has no package.json to declare one - is opened.
      return describeDoorActivity(
        event.data?.doorName,
        event.data?.action,
        isGameCategory(event.data?.category),
      );
    case 'custom_door_event':
      return event.data?.message ?? event.data?.eventType ?? '';
    case 'command':
      return describeCommand(event.data?.command, conferenceName(event.data?.conferenceId));
  }
}

export function ActivityPage() {
  const { status } = useRealtime();
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<'all' | BBSEventType>('all');
  const [live, setLive] = useState<ActivityEntry[]>([]);
  const sequence = useRef(0);

  // Conference NAMES, so an event can say "Joined Amiga Elite" rather than
  // "J in conference 2". Cached hard: the list changes when a sysop edits it,
  // not while a feed is being watched.
  const conferences = useQuery({
    queryKey: ['config', 'conferences'],
    queryFn: () => apiClient.getConferenceConfigs(),
    staleTime: 5 * 60 * 1000,
  });

  const conferenceName = useCallback(
    (id: number | undefined): string | undefined => {
      if (id === undefined) return undefined;
      const rows = (conferences.data as { data?: { id?: number; conferenceNumber?: number; name?: string }[] } | undefined)?.data ?? [];
      const found = rows.find(c => c.conferenceNumber === id || c.id === id);
      return found?.name;
    },
    [conferences.data],
  );

  const callers = useLastCallers(20);
  const uploads = useLastUploads(10);
  const downloads = useLastDownloads(10);

  useBbsEvents((event) => {
    if (paused) return;
    sequence.current += 1;
    const entry: ActivityEntry = {
      id: `live-${sequence.current}`,
      type: event.type,
      username: event.username,
      nodeId: event.nodeId,
      timestamp: event.timestamp || Date.now(),
      detail: describe(event, conferenceName),
    };
    setLive((current) => appendEntry(current, entry));
  });

  const seeded = useMemo<ActivityEntry[]>(() => {
    const rows: ActivityEntry[] = [];

    for (const caller of callers.data?.data ?? []) {
      rows.push({
        id: `caller-${caller.id}`,
        type: 'user_login',
        username: caller.username,
        nodeId: caller.nodeId,
        timestamp: new Date(caller.timestamp).getTime(),
        detail: caller.location ? `from ${caller.location}` : '',
        seeded: true,
      });
    }
    for (const file of uploads.data?.data ?? []) {
      rows.push({
        id: `upload-${file.id}`,
        type: 'upload',
        username: file.uploader,
        nodeId: 0,
        timestamp: new Date(file.uploadDate).getTime(),
        detail: describeTransfer('upload', file.filename, formatBytes(file.size), file.areaName),
        seeded: true,
      });
    }
    for (const file of downloads.data?.data ?? []) {
      rows.push({
        id: `download-${file.id}`,
        type: 'download',
        username: file.uploader,
        nodeId: 0,
        timestamp: new Date(file.uploadDate).getTime(),
        detail: describeTransfer('download', file.filename, formatBytes(file.size), file.areaName),
        seeded: true,
      });
    }

    return rows
      .filter((row) => Number.isFinite(row.timestamp))
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [callers.data, uploads.data, downloads.data]);

  // Who is on, joined with the last thing each of them did. Both halves are
  // already on this page; nothing new is fetched.
  const nodeStatus = useNodeStatus();
  const onBoardNow = useMemo(
    () => whoIsDoingWhat(nodeStatus.data?.data, [...live, ...seeded]),
    [nodeStatus.data, live, seeded],
  );

  const entries = useMemo(
    () => [...live, ...seeded].filter((entry) => filter === 'all' || entry.type === filter).slice(0, MAX_ENTRIES),
    [live, seeded, filter]
  );

  return (
    <div className="space-y-4">
      {/* Who is on, and what each of them is doing.

          The feed below answers "what happened"; this answers "what is
          Phantasm doing", which is the question actually being asked and the
          one a scrolling feed makes harder the more it carries. Nothing is
          fetched for it - it joins the node status the admin already polls
          with the events already on screen. */}
      {onBoardNow.length > 0 && (
        <div className="rounded border border-border bg-surface-2">
          <div className="border-b border-border px-3 py-2 text-xs uppercase tracking-wide text-content-secondary">
            On the board now ({onBoardNow.length})
          </div>
          <ul className="divide-y divide-border">
            {onBoardNow.map((caller) => (
              <li key={caller.nodeId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className="w-10 shrink-0 font-mono text-xs text-content-secondary">
                  {caller.nodeId}
                </span>
                <span className="font-medium text-content-primary">{caller.username}</span>
                <span className="text-content-secondary">{caller.doing}</span>
                {caller.lastDetail && (
                  <span className="text-xs text-content-secondary">
                    &middot; last: {caller.lastDetail}
                    {caller.lastAt ? ` (${formatRelativeTime(caller.lastAt)})` : ''}
                  </span>
                )}
                {caller.lastActivityAt && (
                  <span className="text-xs text-content-muted">
                    &middot; idle {formatRelativeTime(caller.lastActivityAt).replace(' ago', '')}
                  </span>
                )}
                {typeof caller.timeRemaining === 'number' && caller.timeRemaining >= 0 && (
                  <span className="text-xs text-content-muted">
                    &middot; {caller.timeRemaining}m left
                  </span>
                )}
                {caller.location && (
                  <span className="ml-auto text-xs text-content-secondary">{caller.location}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1">
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              className={`h-control rounded border px-3 text-xs transition-colors ${
                filter === option.id
                  ? 'border-border-strong bg-surface-3 text-content-primary'
                  : 'border-border bg-surface-2 text-content-secondary hover:bg-surface-3 hover:text-content-primary'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <StatusDot
            tone={status === 'live' ? 'ok' : status === 'reconnecting' ? 'warn' : 'neutral'}
            label={status === 'live' ? 'Live feed' : 'Feed offline'}
            className="text-xs"
          />
          <button
            type="button"
            onClick={() => setPaused((current) => !current)}
            className="flex h-control items-center gap-2 rounded border border-border bg-surface-2 px-3 text-xs text-content-secondary transition-colors hover:bg-surface-3 hover:text-content-primary"
            aria-pressed={paused}
          >
            {paused ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}
            {paused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface-1">
        {entries.length === 0 ? (
          <EmptyState
            icon={Zap}
            message={
              status === 'live'
                ? 'Nothing has happened yet. This fills as callers log on, run doors and transfer files.'
                : 'No recent activity, and the live feed is not connected.'
            }
          />
        ) : (
          <ul>
            {entries.map((entry) => {
              const Icon = TYPE_ICON[entry.type];

              return (
                <li
                  key={entry.id}
                  className="flex h-row items-center gap-3 border-b border-border px-3 text-sm last:border-b-0"
                >
                  <Icon size={14} className="shrink-0 text-content-muted" aria-hidden="true" />
                  <StatusDot tone={TYPE_TONE[entry.type]} label={TYPE_LABEL[entry.type]} labelHidden />
                  <span className="w-24 shrink-0 text-xs text-content-muted">{TYPE_LABEL[entry.type]}</span>
                  <span className="w-32 shrink-0 truncate font-mono text-content-primary">{entry.username}</span>
                  <span className="min-w-0 flex-1 truncate text-content-secondary">{entry.detail}</span>
                  {entry.nodeId > 0 && (
                    <span className="shrink-0 font-mono text-xs text-content-muted">Node {entry.nodeId}</span>
                  )}
                  <span
                    className="w-20 shrink-0 text-right font-mono text-xs tabular-nums text-content-muted"
                    title={formatClockTime(entry.timestamp)}
                  >
                    {formatRelativeTime(entry.timestamp)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {paused && (
        <p className="text-xs text-content-muted">
          Paused. Events are being discarded while paused, not queued.
        </p>
      )}
    </div>
  );
}
