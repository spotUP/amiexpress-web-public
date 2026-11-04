# Console v2: Sysop Control Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Ink TUI console into a full sysop control center — animated live dashboard, conference management (toggle/health/fix), door management, system node controls, and a quiet mode toggle.

**Architecture:** Expand the existing `dev/console/` Ink package with 3 new tabs (Dashboard, Doors, System), enhanced ConfsTab, and updated TabBar/Footer/App wiring. All data comes from the existing `/api/*` endpoints — no backend changes. The Dashboard uses animated counters and a Unicode block-char sparkline built from `/api/stats/last-callers` hourly bucketing.

**Tech Stack:** Ink v4, React 18, ink-big-text (new), existing chalk/ink-gradient/ink-spinner. All new files in `dev/console/src/`.

---

## File Map

**Modified:**
- `dev/console/package.json` — add `ink-big-text`
- `dev/console/src/api/types.ts` — add `DoorInfo`, `SystemConfig`, `ConferenceHealth`
- `dev/console/src/api/client.ts` — add 11 new API functions
- `dev/console/src/components/TabBar.tsx` — 8 tabs instead of 5
- `dev/console/src/components/Footer.tsx` — hints for 8 tabs
- `dev/console/src/App.tsx` — wire 3 new tabs
- `dev/console/src/components/tabs/ConfsTab.tsx` — add toggle/health/auto-fix

**New:**
- `dev/console/src/hooks/useDashboardStats.ts` — polls stats + nodes for dashboard
- `dev/console/src/utils/sparkline.ts` — compute 24h sparkline from callers array
- `dev/console/src/components/tabs/DashboardTab.tsx` — animated live dashboard
- `dev/console/src/components/tabs/DoorsTab.tsx` — door list + reload
- `dev/console/src/components/tabs/SystemTab.tsx` — node controls + system info

---

## Task 1: Add ink-big-text, new API types and client functions

**Files:**
- Modify: `dev/console/package.json`
- Modify: `dev/console/src/api/types.ts`
- Modify: `dev/console/src/api/client.ts`

- [ ] **Step 1: Install ink-big-text**

```bash
cd ~/Code/AmiExpress/amiexpress-web/dev/console && npm install ink-big-text
```

Expected: ink-big-text added to node_modules with no errors.

- [ ] **Step 2: Add new types to `dev/console/src/api/types.ts`**

Append to the end of the existing types.ts:

```typescript
export interface DoorInfo {
  id: string | number;
  door_name: string;
  door_command?: string;
  door_type: string;
  door_path?: string;
  enabled: boolean;
  description?: string;
}

export interface ConferenceHealth {
  conferenceId: number;
  name: string;
  healthy: boolean;
  issues: string[];
  fixable: boolean;
}

export interface SystemConfig {
  bbs_name: string;
  sysop_name: string;
  max_nodes: number;
  new_user_sec_level: number;
  telnet_port: number;
  ssh_port?: number;
  [key: string]: unknown;
}
```

- [ ] **Step 3: Add new functions to `dev/console/src/api/client.ts`**

Append these functions to the end of the existing client.ts:

```typescript
export async function updateConference(id: number, updates: Record<string, unknown>) {
  return request<{ success: boolean }>(`/api/config/conferences/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function getConferenceHealth(id: number) {
  const res = await request<{ success: boolean; data: import('./types.js').ConferenceHealth }>(`/api/config/conferences/${id}/health`);
  return res.data;
}

export async function fixConference(id: number) {
  return request<{ success: boolean; message?: string }>(`/api/config/conferences/${id}/auto-fix`, {
    method: 'POST',
  });
}

export async function getDoors() {
  const res = await request<{ success: boolean; data: import('./types.js').DoorInfo[] }>('/api/config/doors');
  return res.data ?? [];
}

export async function reloadDoors() {
  return request<{ success: boolean; message?: string }>('/api/config/doors/reload', {
    method: 'POST',
  });
}

export async function getSystemConfig() {
  const res = await request<{ success: boolean; data: import('./types.js').SystemConfig }>('/api/config/system');
  return res.data;
}

export async function startNode(nodeId: number) {
  return request<{ success: boolean }>(`/api/nodes/${nodeId}/start`, { method: 'POST' });
}

export async function exitNode(nodeId: number) {
  return request<{ success: boolean }>(`/api/nodes/${nodeId}/exit`, { method: 'POST' });
}

export async function reserveNode(nodeId: number) {
  return request<{ success: boolean }>(`/api/nodes/${nodeId}/reserve`, { method: 'POST' });
}

export async function sysopLoginNode(nodeId: number) {
  return request<{ success: boolean }>(`/api/nodes/${nodeId}/sysop-login`, { method: 'POST' });
}

export async function setQuietMode(enabled: boolean) {
  return request<{ success: boolean }>('/api/nodes/quiet-mode', {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  });
}
```

- [ ] **Step 4: Typecheck**

```bash
cd ~/Code/AmiExpress/amiexpress-web/dev/console && npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: empty (no errors in the modified files).

- [ ] **Step 5: Commit**

```bash
cd ~/Code/AmiExpress/amiexpress-web
git add dev/console/package.json dev/console/package-lock.json dev/console/src/api/types.ts dev/console/src/api/client.ts
git commit -m "feat(console-v2): add ink-big-text, DoorInfo/ConferenceHealth types, 11 new API functions"
```

---

## Task 2: Dashboard hooks and sparkline utility

**Files:**
- Create: `dev/console/src/hooks/useDashboardStats.ts`
- Create: `dev/console/src/utils/sparkline.ts`

- [ ] **Step 1: Create `dev/console/src/utils/sparkline.ts`**

```typescript
import type { CallerRecord } from '../api/types.js';

const BLOCKS = ' ▁▂▃▄▅▆▇█';

export function buildSparkline(callers: CallerRecord[], hours = 24): string {
  const now = Date.now();
  const buckets = Array(hours).fill(0) as number[];

  for (const c of callers) {
    const age = (now - new Date(c.timestamp).getTime()) / 3_600_000;
    const bucket = hours - 1 - Math.floor(age);
    if (bucket >= 0 && bucket < hours) buckets[bucket]++;
  }

  const max = Math.max(...buckets, 1);
  return buckets
    .map(n => BLOCKS[Math.round((n / max) * (BLOCKS.length - 1))])
    .join('');
}
```

- [ ] **Step 2: Create `dev/console/src/hooks/useDashboardStats.ts`**

```typescript
import { useState, useEffect } from 'react';
import { getSystemStats, getNodes, getLastCallers } from '../api/client.js';
import type { SystemStats, NodeStatus, CallerRecord } from '../api/types.js';

export interface DashboardData {
  stats: SystemStats | null;
  nodes: NodeStatus[];
  recentCallers: CallerRecord[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

export function useDashboardStats(intervalMs = 10_000): DashboardData {
  const [data, setData] = useState<DashboardData>({
    stats: null,
    nodes: [],
    recentCallers: [],
    loading: true,
    error: null,
    lastUpdated: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const [stats, nodes, recentCallers] = await Promise.all([
          getSystemStats(),
          getNodes(),
          getLastCallers(100),
        ]);
        if (!cancelled) {
          setData({
            stats: stats ?? null,
            nodes,
            recentCallers,
            loading: false,
            error: null,
            lastUpdated: new Date(),
          });
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setData(d => ({
            ...d,
            loading: false,
            error: err instanceof Error ? err.message : 'Failed',
          }));
        }
      }
    }

    poll();
    const id = setInterval(poll, intervalMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [intervalMs]);

  return data;
}
```

- [ ] **Step 3: Create the utils directory and typecheck**

```bash
mkdir -p ~/Code/AmiExpress/amiexpress-web/dev/console/src/utils
cd ~/Code/AmiExpress/amiexpress-web/dev/console && npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: empty.

- [ ] **Step 4: Commit**

```bash
cd ~/Code/AmiExpress/amiexpress-web
git add dev/console/src/hooks/useDashboardStats.ts dev/console/src/utils/sparkline.ts
git commit -m "feat(console-v2): useDashboardStats hook and sparkline utility"
```

---

## Task 3: DashboardTab — animated live stats

**Files:**
- Create: `dev/console/src/components/tabs/DashboardTab.tsx`

The dashboard shows three stat cards (Live / Today / All Time), a 24h call sparkline, and a recent callers ticker. Numbers animate (briefly highlight cyan) when they change.

- [ ] **Step 1: Create `dev/console/src/components/tabs/DashboardTab.tsx`**

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';
import Spinner from 'ink-spinner';
import { useDashboardStats } from '../../hooks/useDashboardStats.js';
import { buildSparkline } from '../../utils/sparkline.js';

function useFlash(value: unknown): boolean {
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value && prev.current !== undefined) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 800);
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [value]);
  return flash;
}

function StatCard({
  title,
  lines,
}: {
  title: string;
  lines: { label: string; value: string | number; flash?: boolean }[];
}) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={0} minWidth={22}>
      <Text bold color="cyan">{title}</Text>
      {lines.map(({ label, value, flash }) => (
        <Box key={label}>
          <Text dimColor>{label.padEnd(12)}</Text>
          <Text color={flash ? 'yellow' : 'white'} bold={flash}>
            {String(value)}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

function fmt(n: number | undefined): string {
  if (n === undefined || n === null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtBytes(b: number | undefined): string {
  if (!b) return '—';
  if (b >= 1_073_741_824) return `${(b / 1_073_741_824).toFixed(1)} GB`;
  if (b >= 1_048_576) return `${(b / 1_048_576).toFixed(1)} MB`;
  return `${(b / 1024).toFixed(0)} KB`;
}

export function DashboardTab() {
  const { stats, nodes, recentCallers, loading, error, lastUpdated } = useDashboardStats(10_000);

  const onlineCount = nodes.filter(n => n.online).length;
  const flashOnline = useFlash(onlineCount);
  const flashCalls = useFlash(stats?.today.calls);

  const sparkline = buildSparkline(recentCallers, 24);
  const latestCaller = recentCallers.find(c => c.action === 'Logged on');

  if (loading && !stats) {
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center" paddingY={4}>
        <Text color="yellow"><Spinner type="dots" /></Text>
        <Text dimColor> Loading dashboard...</Text>
      </Box>
    );
  }

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      {/* Banner */}
      <Box justifyContent="center" marginBottom={0}>
        <Gradient name="rainbow">
          <BigText text="SYSOP" font="tiny" />
        </Gradient>
      </Box>

      {/* Stat cards */}
      <Box gap={2} marginBottom={1} flexWrap="wrap">
        <StatCard
          title="LIVE"
          lines={[
            { label: 'Online', value: onlineCount, flash: flashOnline },
            { label: 'Nodes', value: nodes.length },
            { label: 'Active', value: stats?.today.activeUsers ?? '—' },
          ]}
        />
        <StatCard
          title="TODAY"
          lines={[
            { label: 'Calls', value: stats?.today.calls ?? '—', flash: flashCalls },
            { label: 'Active users', value: stats?.today.activeUsers ?? '—' },
          ]}
        />
        <StatCard
          title="ALL TIME"
          lines={[
            { label: 'Users', value: fmt(stats?.allTime.totalUsers) },
            { label: 'Messages', value: fmt(stats?.allTime.totalMessages) },
            { label: 'Files', value: fmt(stats?.allTime.totalFiles) },
            { label: 'Storage', value: fmtBytes(stats?.allTime.totalBytes) },
            { label: 'Downloads', value: fmt(stats?.allTime.totalDownloads) },
            { label: 'Total calls', value: fmt(stats?.allTime.totalCalls) },
          ]}
        />
      </Box>

      {/* Sparkline */}
      <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">CALLS — last 24h</Text>
        <Text color="green">{sparkline || '(no data)'}</Text>
        <Text dimColor>{'└' + '─'.repeat(24) + '┘  now →'}</Text>
      </Box>

      {/* Recent activity */}
      <Box flexDirection="column">
        <Text bold color="cyan" dimColor>RECENT CALLERS</Text>
        {recentCallers.slice(0, 5).map(c => (
          <Box key={c.id}>
            <Text color={c.action === 'Logged on' ? 'green' : 'gray'}>
              {c.action === 'Logged on' ? '→' : '←'}
            </Text>
            <Text> {c.username.padEnd(14)}</Text>
            <Text dimColor>{new Date(c.timestamp).toLocaleTimeString().slice(0, 8)}</Text>
          </Box>
        ))}
      </Box>

      {lastUpdated && (
        <Box marginTop={1}>
          <Text dimColor>Updated {lastUpdated.toLocaleTimeString()}</Text>
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd ~/Code/AmiExpress/amiexpress-web/dev/console && npm run build 2>&1 | grep "error TS"
```

Expected: empty. If `ink-big-text` has no type declarations, add a shim:
```bash
# Only if you see "Cannot find module 'ink-big-text'"
echo "declare module 'ink-big-text' { const BigText: any; export default BigText; }" \
  > ~/Code/AmiExpress/amiexpress-web/dev/console/src/ink-big-text.d.ts
```

- [ ] **Step 3: Commit**

```bash
cd ~/Code/AmiExpress/amiexpress-web
git add dev/console/src/components/tabs/DashboardTab.tsx dev/console/src/ink-big-text.d.ts 2>/dev/null || true
git add dev/console/src/components/tabs/DashboardTab.tsx
git commit -m "feat(console-v2): animated Dashboard tab — live stats, sparkline, recent callers"
```

---

## Task 4: Enhanced ConfsTab — toggle, health check, auto-fix

**Files:**
- Modify: `dev/console/src/components/tabs/ConfsTab.tsx`

Replace the stub entirely:

- [ ] **Step 1: Replace ConfsTab with full implementation**

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getConferences, updateConference, getConferenceHealth, fixConference } from '../../api/client.js';
import type { ConferenceConfig, ConferenceHealth } from '../../api/types.js';

type Mode = 'list' | 'health-result' | 'fix-result';

export function ConfsTab() {
  const [confs, setConfs] = useState<ConferenceConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  const [healthResult, setHealthResult] = useState<ConferenceHealth | null>(null);
  const [fixResult, setFixResult] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getConferences();
      setConfs(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selected = confs[selectedIdx];

  useInput((input, key) => {
    if (mode !== 'list') {
      if (key.escape || input === 'q') { setMode('list'); setHealthResult(null); setFixResult(null); }
      return;
    }

    if (key.upArrow) setSelectedIdx(i => Math.max(0, i - 1));
    if (key.downArrow) setSelectedIdx(i => Math.min(confs.length - 1, i + 1));

    if (input === 't' && selected && !actionLoading) {
      const currentEnabled = (selected as any).enabled !== false;
      setActionLoading(true);
      updateConference(selected.conference_id, { enabled: !currentEnabled })
        .then(() => {
          setStatus(`Conf ${selected.conference_id} ${currentEnabled ? 'disabled' : 'enabled'}`);
          load();
        })
        .catch((e: Error) => setStatus(`Error: ${e.message}`))
        .finally(() => setActionLoading(false));
    }

    if (input === 'h' && selected && !actionLoading) {
      setActionLoading(true);
      getConferenceHealth(selected.conference_id)
        .then(result => {
          setHealthResult(result ?? null);
          setMode('health-result');
        })
        .catch((e: Error) => setStatus(`Error: ${e.message}`))
        .finally(() => setActionLoading(false));
    }

    if (input === 'f' && selected && !actionLoading) {
      setActionLoading(true);
      fixConference(selected.conference_id)
        .then(result => {
          setFixResult(result.message ?? 'Auto-fix complete');
          setMode('fix-result');
          load();
        })
        .catch((e: Error) => setStatus(`Error: ${e.message}`))
        .finally(() => setActionLoading(false));
    }

    if (input === 'r') load();
  });

  if (loading) return <Box><Text color="yellow"><Spinner type="dots" /></Text><Text> Loading...</Text></Box>;
  if (error) return <Text color="red">Error: {error}</Text>;

  if (mode === 'health-result' && healthResult) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={healthResult.healthy ? 'green' : 'yellow'} padding={1}>
        <Text bold color={healthResult.healthy ? 'green' : 'yellow'}>
          Conf {healthResult.conferenceId}: {healthResult.name}
        </Text>
        <Text color={healthResult.healthy ? 'green' : 'red'}>
          {healthResult.healthy ? '✓ Healthy' : '✗ Issues found'}
        </Text>
        {healthResult.issues.map((issue, i) => (
          <Text key={i} color="yellow">  • {issue}</Text>
        ))}
        {healthResult.fixable && <Text dimColor>  Press [f] to auto-fix</Text>}
        <Box marginTop={1}><Text dimColor>[esc] back</Text></Box>
      </Box>
    );
  }

  if (mode === 'fix-result') {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="green" padding={1}>
        <Text bold color="green">Auto-fix complete</Text>
        <Text>{fixResult}</Text>
        <Box marginTop={1}><Text dimColor>[esc] back</Text></Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {'  #'.padEnd(6)}{'NAME'.padEnd(30)}{'DIRS'.padEnd(6)}{'STATUS'}
        </Text>
      </Box>

      {confs.map((c, i) => {
        const enabled = (c as any).enabled !== false;
        return (
          <Box key={c.id}>
            <Text color={i === selectedIdx ? 'cyan' : enabled ? 'white' : 'gray'} bold={i === selectedIdx}>
              {i === selectedIdx ? '▶ ' : '  '}
              {String(c.conference_id).padEnd(4)}
              {c.name.slice(0, 28).padEnd(30)}
              {String(c.ndirs).padEnd(6)}
              {enabled ? '' : '(disabled)'}
            </Text>
          </Box>
        );
      })}

      {actionLoading && (
        <Box marginTop={1}>
          <Text color="yellow"><Spinner type="dots" /></Text>
          <Text> Working...</Text>
        </Box>
      )}

      {status && <Box marginTop={1}><Text color="green">{status}</Text></Box>}
    </Box>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd ~/Code/AmiExpress/amiexpress-web/dev/console && npm run build 2>&1 | grep "error TS"
```

Expected: empty.

- [ ] **Step 3: Commit**

```bash
cd ~/Code/AmiExpress/amiexpress-web
git add dev/console/src/components/tabs/ConfsTab.tsx
git commit -m "feat(console-v2): Confs tab — toggle, health check, auto-fix"
```

---

## Task 5: DoorsTab

**Files:**
- Create: `dev/console/src/components/tabs/DoorsTab.tsx`

- [ ] **Step 1: Create `dev/console/src/components/tabs/DoorsTab.tsx`**

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getDoors, reloadDoors } from '../../api/client.js';
import { ConfirmDialog } from '../shared/ConfirmDialog.js';
import type { DoorInfo } from '../../api/types.js';

export function DoorsTab() {
  const [doors, setDoors] = useState<DoorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getDoors();
      setDoors(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useInput((input, key) => {
    if (confirming) return;
    if (key.upArrow) setSelectedIdx(i => Math.max(0, i - 1));
    if (key.downArrow) setSelectedIdx(i => Math.min(doors.length - 1, i + 1));
    if (input === 'R') setConfirming(true);
    if (input === 'r') load();
  });

  if (loading) return <Box><Text color="yellow"><Spinner type="dots" /></Text><Text> Loading doors...</Text></Box>;
  if (error) return <Text color="red">Error: {error}</Text>;

  const enabledCount = doors.filter(d => d.enabled).length;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {'  COMMAND'.padEnd(20)}{'TYPE'.padEnd(10)}{'NAME'.padEnd(30)}{'STATUS'}
        </Text>
        <Text dimColor>  ({enabledCount}/{doors.length} enabled)</Text>
      </Box>

      {doors.map((d, i) => (
        <Box key={String(d.id)}>
          <Text color={i === selectedIdx ? 'cyan' : d.enabled ? 'white' : 'gray'} bold={i === selectedIdx}>
            {i === selectedIdx ? '▶ ' : '  '}
            {(d.door_command ?? String(d.id)).slice(0, 17).padEnd(18)}
            {(d.door_type ?? '—').slice(0, 8).padEnd(10)}
            {d.door_name.slice(0, 28).padEnd(30)}
            {d.enabled ? '' : '(disabled)'}
          </Text>
        </Box>
      ))}

      {reloading && (
        <Box marginTop={1}>
          <Text color="yellow"><Spinner type="dots" /></Text>
          <Text> Reloading all doors...</Text>
        </Box>
      )}

      {status && <Box marginTop={1}><Text color="green">{status}</Text></Box>}

      {confirming && (
        <Box marginTop={1}>
          <ConfirmDialog
            message="Reload all doors? (briefly restarts door watcher)"
            onConfirm={() => {
              setConfirming(false);
              setReloading(true);
              reloadDoors()
                .then(() => setStatus('All doors reloaded'))
                .catch((e: Error) => setStatus(`Error: ${e.message}`))
                .finally(() => { setReloading(false); load(); });
            }}
            onCancel={() => setConfirming(false)}
          />
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd ~/Code/AmiExpress/amiexpress-web/dev/console && npm run build 2>&1 | grep "error TS"
```

Expected: empty.

- [ ] **Step 3: Commit**

```bash
cd ~/Code/AmiExpress/amiexpress-web
git add dev/console/src/components/tabs/DoorsTab.tsx
git commit -m "feat(console-v2): Doors tab — list and reload all doors"
```

---

## Task 6: SystemTab — node controls, system config, quiet mode

**Files:**
- Create: `dev/console/src/components/tabs/SystemTab.tsx`

- [ ] **Step 1: Create `dev/console/src/components/tabs/SystemTab.tsx`**

```tsx
import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import {
  getSystemConfig, getNodes,
  startNode, exitNode, reserveNode, sysopLoginNode, setQuietMode,
} from '../../api/client.js';
import { ConfirmDialog } from '../shared/ConfirmDialog.js';
import type { SystemConfig, NodeStatus } from '../../api/types.js';

type Panel = 'nodes' | 'config';
type NodeAction = 'start' | 'exit' | 'reserve' | 'sysop';

export function SystemTab() {
  const [panel, setPanel] = useState<Panel>('nodes');
  const [nodes, setNodes] = useState<NodeStatus[]>([]);
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [pendingAction, setPendingAction] = useState<NodeAction | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [quietMode, setQuietModeState] = useState(false);

  useEffect(() => {
    Promise.all([getNodes(), getSystemConfig()])
      .then(([n, c]) => { setNodes(n); setConfig(c ?? null); })
      .catch((e: Error) => setStatus(`Error: ${e.message}`))
      .finally(() => setLoading(false));

    const id = setInterval(() => {
      getNodes().then(setNodes).catch(() => {});
    }, 5_000);
    return () => clearInterval(id);
  }, []);

  const selected = nodes[selectedIdx];

  useInput((input, key) => {
    if (pendingAction) return;

    if (input === 'n') setPanel('nodes');
    if (input === 'c') setPanel('config');

    if (panel === 'nodes') {
      if (key.upArrow) setSelectedIdx(i => Math.max(0, i - 1));
      if (key.downArrow) setSelectedIdx(i => Math.min(nodes.length - 1, i + 1));
      if (input === 's') setPendingAction('start');
      if (input === 'x') setPendingAction('exit');
      if (input === 'v') setPendingAction('reserve');
      if (input === 'o') setPendingAction('sysop');
      if (input === 'Q') {
        setActionLoading(true);
        setQuietMode(!quietMode)
          .then(() => { setQuietModeState(q => !q); setStatus(`Quiet mode ${!quietMode ? 'ON' : 'OFF'}`); })
          .catch((e: Error) => setStatus(`Error: ${e.message}`))
          .finally(() => setActionLoading(false));
      }
    }
  });

  function doNodeAction(action: NodeAction) {
    if (!selected) return;
    const nodeId = selected.nodeId;
    const fns: Record<NodeAction, (id: number) => Promise<unknown>> = {
      start: startNode,
      exit: exitNode,
      reserve: reserveNode,
      sysop: sysopLoginNode,
    };
    const labels: Record<NodeAction, string> = {
      start: 'started', exit: 'exited', reserve: 'reserved', sysop: 'sysop login sent',
    };
    setActionLoading(true);
    fns[action](nodeId)
      .then(() => setStatus(`N${nodeId} ${labels[action]}`))
      .catch((e: Error) => setStatus(`Error: ${e.message}`))
      .finally(() => setActionLoading(false));
    setPendingAction(null);
  }

  if (loading) return <Box><Text color="yellow"><Spinner type="dots" /></Text><Text> Loading...</Text></Box>;

  return (
    <Box flexDirection="column">
      {/* Panel switcher */}
      <Box marginBottom={1} gap={3}>
        <Text color={panel === 'nodes' ? 'cyan' : 'white'} bold={panel === 'nodes'} underline={panel === 'nodes'}>[n] Nodes</Text>
        <Text color={panel === 'config' ? 'cyan' : 'white'} bold={panel === 'config'} underline={panel === 'config'}>[c] Config</Text>
        <Text dimColor>  Quiet mode: </Text>
        <Text color={quietMode ? 'yellow' : 'green'}>{quietMode ? 'ON' : 'OFF'}</Text>
        <Text dimColor>  [Q] toggle</Text>
      </Box>

      {panel === 'nodes' && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="cyan">{'  NODE'.padEnd(7)}{'USER'.padEnd(16)}{'STATE'.padEnd(20)}{'ACTIVITY'}</Text>
          </Box>
          {nodes.map((n, i) => (
            <Box key={n.nodeId}>
              <Text color={i === selectedIdx ? 'cyan' : n.online ? 'white' : 'gray'} bold={i === selectedIdx}>
                {i === selectedIdx ? '▶ ' : '  '}
                {`N${n.nodeId}`.padEnd(5)}
                {(n.username ?? '—').padEnd(16)}
                {(n.state ?? 'idle').padEnd(20)}
                {n.currentActivity ?? '—'}
              </Text>
            </Box>
          ))}
          <Box marginTop={1}>
            <Text dimColor>[s]tart  [x]exit  [v]reserve  [o]sysop-login</Text>
          </Box>
        </Box>
      )}

      {panel === 'config' && config && (
        <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
          <Text bold color="cyan">System Configuration</Text>
          {[
            ['BBS Name', config.bbs_name],
            ['Sysop', config.sysop_name],
            ['Max Nodes', String(config.max_nodes)],
            ['New User SL', String(config.new_user_sec_level)],
            ['Telnet Port', String(config.telnet_port)],
            ['SSH Port', String(config.ssh_port ?? '—')],
          ].map(([label, val]) => (
            <Box key={label}>
              <Text dimColor>{label!.padEnd(16)}</Text>
              <Text color="white">{val}</Text>
            </Box>
          ))}
        </Box>
      )}

      {actionLoading && (
        <Box marginTop={1}>
          <Text color="yellow"><Spinner type="dots" /></Text>
          <Text> Executing...</Text>
        </Box>
      )}

      {status && <Box marginTop={1}><Text color="green">{status}</Text></Box>}

      {pendingAction && selected && (
        <Box marginTop={1}>
          <ConfirmDialog
            message={`${pendingAction} node N${selected.nodeId}${selected.username ? ` (${selected.username})` : ''}?`}
            onConfirm={() => doNodeAction(pendingAction)}
            onCancel={() => setPendingAction(null)}
          />
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd ~/Code/AmiExpress/amiexpress-web/dev/console && npm run build 2>&1 | grep "error TS"
```

Expected: empty.

- [ ] **Step 3: Commit**

```bash
cd ~/Code/AmiExpress/amiexpress-web
git add dev/console/src/components/tabs/SystemTab.tsx
git commit -m "feat(console-v2): System tab — node controls, system config, quiet mode"
```

---

## Task 7: Wire everything — TabBar, Footer, App

**Files:**
- Modify: `dev/console/src/components/TabBar.tsx`
- Modify: `dev/console/src/components/Footer.tsx`
- Modify: `dev/console/src/App.tsx`

- [ ] **Step 1: Update TabBar.tsx**

Replace the TABS constant and the component. The new tabs are 8: Dashboard, Nodes, Users, Confs, Callers, Logs, Doors, System.

Full new file content:

```tsx
import React from 'react';
import { Box, Text, useInput } from 'ink';

export const TABS = ['Dashboard', 'Nodes', 'Users', 'Confs', 'Callers', 'Logs', 'Doors', 'System'] as const;
export type TabName = (typeof TABS)[number];

interface Props {
  active: TabName;
  onChange: (tab: TabName) => void;
}

export function TabBar({ active, onChange }: Props) {
  useInput((input, key) => {
    const idx = TABS.indexOf(active);
    if (key.leftArrow && idx > 0) onChange(TABS[idx - 1]!);
    if (key.rightArrow && idx < TABS.length - 1) onChange(TABS[idx + 1]!);
    const n = parseInt(input);
    if (n >= 1 && n <= TABS.length) onChange(TABS[n - 1]!);
  });

  return (
    <Box borderStyle="single" borderColor="cyan" paddingX={1} flexWrap="wrap">
      {TABS.map((tab, i) => (
        <Box key={tab} marginRight={1}>
          <Text
            color={tab === active ? 'cyan' : 'white'}
            bold={tab === active}
            underline={tab === active}
          >
            [{i + 1}]{tab}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
```

- [ ] **Step 2: Update Footer.tsx**

Replace with full new file:

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { TabName } from './TabBar.js';

const HINTS: Record<TabName, string> = {
  Dashboard: 'live stats + 24h sparkline  auto-refresh 10s',
  Nodes:     '[k]ick  [c]hat  [↑↓] select',
  Users:     '[e]dit SL  [b]an  [d]el  [/]search  [↑↓] scroll',
  Confs:     '[t]oggle  [h]ealth  [f]ix  [r]efresh  [↑↓] scroll',
  Callers:   '[↑↓] scroll  auto-refresh 30s',
  Logs:      '[b]ackend  [p]review  [d]oor-watcher  [6]8k',
  Doors:     '[r]efresh  [R]eload all doors  [↑↓] scroll',
  System:    '[n]odes  [c]onfig  [s]tart  [x]exit  [v]reserve  [o]sysop  [Q]uiet',
};

interface Props {
  activeTab: TabName;
}

export function Footer({ activeTab }: Props) {
  return (
    <Box borderStyle="single" borderColor="cyan" paddingX={1} justifyContent="space-between">
      <Text dimColor>{HINTS[activeTab]}</Text>
      <Text dimColor>[?]help  [q]quit</Text>
    </Box>
  );
}
```

- [ ] **Step 3: Update App.tsx**

Replace with full new file (adds 3 new tab imports and renders them):

```tsx
import React, { useState, useEffect } from 'react';
import { Box, useInput, useApp } from 'ink';
import { Header } from './components/Header.js';
import { TabBar, type TabName } from './components/TabBar.js';
import { Footer } from './components/Footer.js';
import { DashboardTab } from './components/tabs/DashboardTab.js';
import { NodesTab } from './components/tabs/NodesTab.js';
import { UsersTab } from './components/tabs/UsersTab.js';
import { ConfsTab } from './components/tabs/ConfsTab.js';
import { CallersTab } from './components/tabs/CallersTab.js';
import { LogsTab } from './components/tabs/LogsTab.js';
import { DoorsTab } from './components/tabs/DoorsTab.js';
import { SystemTab } from './components/tabs/SystemTab.js';
import { getNodes } from './api/client.js';

interface Props {
  username: string;
}

export function App({ username }: Props) {
  const { exit } = useApp();
  const [activeTab, setActiveTab] = useState<TabName>('Dashboard');
  const [backendUp, setBackendUp] = useState(false);

  useInput((input, key) => {
    if (input === 'q' && !key.ctrl) exit();
  });

  useEffect(() => {
    async function checkBackend() {
      try { await getNodes(); setBackendUp(true); }
      catch { setBackendUp(false); }
    }
    checkBackend();
    const id = setInterval(checkBackend, 10_000);
    return () => clearInterval(id);
  }, []);

  return (
    <Box flexDirection="column" height="100%">
      <Header username={username} backendUp={backendUp} previewUp={true} watchUp={true} />
      <TabBar active={activeTab} onChange={setActiveTab} />
      <Box flexGrow={1} flexDirection="column" paddingX={1}>
        {activeTab === 'Dashboard' && <DashboardTab />}
        {activeTab === 'Nodes'     && <NodesTab />}
        {activeTab === 'Users'     && <UsersTab />}
        {activeTab === 'Confs'     && <ConfsTab />}
        {activeTab === 'Callers'   && <CallersTab />}
        {activeTab === 'Logs'      && <LogsTab />}
        {activeTab === 'Doors'     && <DoorsTab />}
        {activeTab === 'System'    && <SystemTab />}
      </Box>
      <Footer activeTab={activeTab} />
    </Box>
  );
}
```

- [ ] **Step 4: Full build**

```bash
cd ~/Code/AmiExpress/amiexpress-web/dev/console && npm run build 2>&1 | grep "error TS"
```

Expected: empty. Fix any TypeScript errors before committing.

- [ ] **Step 5: Commit**

```bash
cd ~/Code/AmiExpress/amiexpress-web
git add dev/console/src/components/TabBar.tsx dev/console/src/components/Footer.tsx dev/console/src/App.tsx
git commit -m "feat(console-v2): wire 8-tab layout — Dashboard, Doors, System added"
```

---

## Task 8: Strip rebuild + handoff update

**Files:**
- Modify: `handoff.md`

- [ ] **Step 1: Full rebuild including strip**

```bash
cd ~/Code/AmiExpress/amiexpress-web/dev/console && npm run build 2>&1 | grep -E "error TS|Error"
ls dist/src/index.js dist/strip/strip.js
```

Expected: both files exist, no errors.

- [ ] **Step 2: Update handoff.md**

Read handoff.md and prepend a brief console v2 section:

```
## Console v2 (2026-04-28)
Expanded TUI to full sysop control center (8 tabs):
- Dashboard: animated live stats, 24h sparkline, recent callers ticker
- Nodes: kick/chat (unchanged)
- Users: edit SL/ban/delete (unchanged)
- Confs: +toggle/health-check/auto-fix
- Callers: (unchanged)
- Logs: (unchanged)
- Doors: list all doors, [R] reload all
- System: per-node start/exit/reserve/sysop-login, quiet mode, system config view
Tab keys: 1=Dash 2=Nodes 3=Users 4=Confs 5=Callers 6=Logs 7=Doors 8=System
```

- [ ] **Step 3: Commit handoff**

```bash
cd ~/Code/AmiExpress/amiexpress-web
git add handoff.md
git commit -m "docs: update handoff for console v2 control center"
```
