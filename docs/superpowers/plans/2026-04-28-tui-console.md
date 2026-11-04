# AmiExpress TUI Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tmux-based sysop console: `start-servers.sh` creates a named tmux session with log panes and a full Ink TUI window for live BBS admin.

**Architecture:** `start-servers.sh` detects tmux + TTY and creates session `amiexpress` (3 windows: logs, shell, console). The `dev/console/` package is a standalone Ink (React-for-terminal) app that authenticates via `POST /auth/login` and queries the existing `/api/*` REST endpoints plus Socket.IO for live data. The status strip is a tiny plain-Node script in the same package.

**Tech Stack:** Ink v4, React 18, socket.io-client v4, chalk v5, TypeScript, Node 24. All API endpoints already exist on the backend — no backend changes needed.

---

## File Map

**New files (all in `dev/console/`):**
- `package.json` — package config, Ink/React deps
- `tsconfig.json` — ESM TypeScript config
- `src/index.tsx` — entry point: auth check, render App
- `src/App.tsx` — root component: Header + TabBar + active tab + Footer
- `src/components/Header.tsx` — gradient title, server pills, uptime counter
- `src/components/TabBar.tsx` — tab strip with keyboard navigation (1-5 / arrows)
- `src/components/Footer.tsx` — per-tab hotkey hints
- `src/components/LoginPrompt.tsx` — username/password fields before main UI
- `src/components/tabs/NodesTab.tsx` — live node list, kick/chat
- `src/components/tabs/UsersTab.tsx` — user list, edit SL, ban, delete
- `src/components/tabs/ConfsTab.tsx` — conference list, toggle, health check
- `src/components/tabs/CallersTab.tsx` — recent callers, read-only
- `src/components/tabs/LogsTab.tsx` — switchable log tail
- `src/components/shared/ConfirmDialog.tsx` — yes/no overlay
- `src/api/types.ts` — shared TypeScript types matching backend responses
- `src/api/client.ts` — fetch() wrapper with auth header injection
- `src/api/socket.ts` — Socket.IO client, reconnect logic
- `src/hooks/useAuth.ts` — JWT state, login/logout
- `src/hooks/useNodes.ts` — polling + socket hook → NodeInfo[]
- `src/hooks/useUptime.ts` — uptime counter from /api/stats/system
- `strip/strip.ts` — standalone status strip (no Ink, plain ANSI)

**Modified files:**
- `dev/scripts/start-servers.sh` — add tmux bootstrap block after arg parsing (line 97)

---

## Task 1: Package scaffold

**Files:**
- Create: `dev/console/package.json`
- Create: `dev/console/tsconfig.json`

- [ ] **Step 1: Create the package directory and `package.json`**

```bash
mkdir -p ~/Code/AmiExpress/amiexpress-web/dev/console/src/components/tabs
mkdir -p ~/Code/AmiExpress/amiexpress-web/dev/console/src/components/shared
mkdir -p ~/Code/AmiExpress/amiexpress-web/dev/console/src/api
mkdir -p ~/Code/AmiExpress/amiexpress-web/dev/console/src/hooks
mkdir -p ~/Code/AmiExpress/amiexpress-web/dev/console/strip
```

Create `dev/console/package.json`:
```json
{
  "name": "@amiexpress/console",
  "version": "1.0.0",
  "description": "AmiExpress-Web sysop TUI console",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "build:strip": "tsc --outDir dist/strip strip/strip.ts",
    "start": "node dist/index.js",
    "dev": "tsx src/index.tsx"
  },
  "dependencies": {
    "chalk": "^5.3.0",
    "ink": "^4.4.1",
    "ink-gradient": "^3.0.0",
    "ink-spinner": "^5.0.0",
    "react": "^18.2.0",
    "socket.io-client": "^4.7.5"
  },
  "devDependencies": {
    "@types/react": "^18.2.79",
    "tsx": "^4.7.2",
    "typescript": "^5.4.5"
  }
}
```

- [ ] **Step 2: Create `dev/console/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "strip"]
}
```

- [ ] **Step 3: Install dependencies**

```bash
cd dev/console && npm install
```

Expected: node_modules created, no errors.

- [ ] **Step 4: Verify TypeScript can find Ink types**

```bash
cd dev/console && npx tsc --noEmit --allowImportingTsExtensions src/index.tsx 2>&1 | head -5
```

Expected: error about `src/index.tsx` not existing yet (not a type error) — or just no output if empty. This confirms the tsconfig is valid.

- [ ] **Step 5: Commit**

```bash
git add dev/console/package.json dev/console/tsconfig.json dev/console/package-lock.json
git commit -m "feat(console): scaffold Ink TUI package"
```

---

## Task 2: API types and HTTP client

**Files:**
- Create: `dev/console/src/api/types.ts`
- Create: `dev/console/src/api/client.ts`

These types are derived directly from the backend endpoint responses:
- `GET /api/nodes/status` → `NodeStatus[]` (from `web/backend/src/api/node-control-routes.ts:26`)
- `GET /api/config/users` → `UserRecord[]`
- `GET /api/config/conferences` → `ConferenceConfig[]`
- `GET /api/stats/last-callers` → `CallerRecord[]`
- `GET /api/stats/system` → `SystemStats`
- `GET /api/config/logs?type=backend&lines=200` → `{ lines: string[] }`

- [ ] **Step 1: Create `dev/console/src/api/types.ts`**

```typescript
export interface NodeStatus {
  nodeId: number;
  online: boolean;
  userId?: string;
  username?: string;
  location?: string;
  state?: string;
  currentActivity?: string;
  connectionType?: string;
  lastActivity?: string;
  timeRemaining?: number;
}

export interface UserRecord {
  id?: string;
  username: string;
  realname?: string;
  location?: string;
  secLevel?: number;
  seclevel?: number;
  calls?: number;
  lastOn?: string;
  lastLogin?: string;
  uploads?: number;
  downloads?: number;
  flags?: number;
}

export interface ConferenceConfig {
  id: number;
  conference_id: number;
  name: string;
  ndirs: number;
  [key: string]: unknown;
}

export interface CallerRecord {
  id: number;
  nodeId: number;
  userId: string;
  username: string;
  action: string;
  details?: string;
  location: string;
  timestamp: string;
}

export interface SystemStats {
  allTime: {
    totalUsers: number;
    totalMessages: number;
    totalFiles: number;
    totalBytes: number;
    totalDownloads: number;
    totalCalls: number;
  };
  today: {
    calls: number;
    activeUsers: number;
  };
}

export interface LogResponse {
  lines: string[];
  totalLines: number;
  logFile?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface AuthResponse {
  token: string;
  user: { id: string; username: string; secLevel: number };
}
```

- [ ] **Step 2: Create `dev/console/src/api/client.ts`**

```typescript
const BASE_URL = process.env['AMIEXPRESS_URL'] ?? 'http://localhost:3001';

let _token: string | null = process.env['AMIEXPRESS_CONSOLE_TOKEN'] ?? null;

export function setToken(token: string): void {
  _token = token;
}

export function getToken(): string | null {
  return _token;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (_token) headers['Authorization'] = `Bearer ${_token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw Object.assign(new Error(`HTTP ${res.status}: ${text}`), { status: res.status });
  }
  return res.json() as Promise<T>;
}

export async function login(username: string, password: string) {
  const res = await request<{ token: string; user: { id: string; username: string; secLevel: number } }>(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ username, password }) }
  );
  setToken(res.token);
  // Propagate token to tmux session env so the status strip picks it up
  if (process.env['TMUX']) {
    const { execSync } = await import('child_process');
    try {
      execSync(`tmux set-environment -t amiexpress AMIEXPRESS_CONSOLE_TOKEN ${res.token}`);
    } catch {
      // non-fatal: strip just retries until env is set
    }
  }
  return res;
}

export async function getNodes() {
  const res = await request<{ success: boolean; data: import('./types.js').NodeStatus[] }>('/api/nodes/status');
  return res.data ?? [];
}

export async function kickNode(nodeId: number) {
  return request<{ success: boolean }>(`/api/nodes/${nodeId}/kick`, { method: 'POST' });
}

export async function chatNode(nodeId: number, message: string) {
  return request<{ success: boolean }>(`/api/nodes/${nodeId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export async function getUsers() {
  const res = await request<import('./types.js').UserRecord[] | { success: boolean; data: import('./types.js').UserRecord[] }>('/api/config/users');
  return Array.isArray(res) ? res : ((res as any).data ?? []);
}

export async function updateUser(id: string, updates: Partial<import('./types.js').UserRecord>) {
  return request<{ success: boolean }>(`/api/config/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteUser(id: string) {
  return request<{ success: boolean }>(`/api/config/users/${id}`, { method: 'DELETE' });
}

export async function getConferences() {
  const res = await request<import('./types.js').ConferenceConfig[] | { success: boolean; data: import('./types.js').ConferenceConfig[] }>('/api/config/conferences');
  return Array.isArray(res) ? res : ((res as any).data ?? []);
}

export async function getLastCallers(limit = 50) {
  const res = await request<{ success: boolean; data: import('./types.js').CallerRecord[] }>(`/api/stats/last-callers?limit=${limit}`);
  return res.data ?? [];
}

export async function getSystemStats() {
  const res = await request<{ success: boolean; data: import('./types.js').SystemStats }>('/api/stats/system');
  return res.data;
}

export async function getLogs(type: 'backend' | 'frontend' | 'door68k', lines = 200, doorLog?: string) {
  const params = new URLSearchParams({ type, lines: String(lines) });
  if (doorLog) params.set('doorLog', doorLog);
  const res = await request<{ lines: string[]; totalLines: number }>(`/api/config/logs?${params}`);
  return res;
}
```

- [ ] **Step 3: Typecheck**

```bash
cd dev/console && npx tsc --noEmit 2>&1 | grep -v "Cannot find module.*index.tsx"
```

Expected: no errors from the two new files (index.tsx doesn't exist yet so that error is expected).

- [ ] **Step 4: Commit**

```bash
git add dev/console/src/api/
git commit -m "feat(console): API types and HTTP client"
```

---

## Task 3: Socket.IO client + auth hook

**Files:**
- Create: `dev/console/src/api/socket.ts`
- Create: `dev/console/src/hooks/useAuth.ts`
- Create: `dev/console/src/hooks/useNodes.ts`
- Create: `dev/console/src/hooks/useUptime.ts`

- [ ] **Step 1: Create `dev/console/src/api/socket.ts`**

```typescript
import { io, Socket } from 'socket.io-client';
import { getToken } from './client.js';

const BASE_URL = process.env['AMIEXPRESS_URL'] ?? 'http://localhost:3001';

let _socket: Socket | null = null;

export function getSocket(): Socket {
  if (!_socket) {
    _socket = io(BASE_URL, {
      auth: { token: getToken() },
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
    });
  }
  return _socket;
}

export function disconnectSocket(): void {
  _socket?.disconnect();
  _socket = null;
}
```

- [ ] **Step 2: Create `dev/console/src/hooks/useAuth.ts`**

```typescript
import { useState, useCallback } from 'react';
import { login as apiLogin, getToken } from '../api/client.js';

export interface AuthState {
  token: string | null;
  username: string | null;
  error: string | null;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    token: getToken(),
    username: null,
    error: null,
    loading: false,
  });

  const login = useCallback(async (username: string, password: string) => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const res = await apiLogin(username, password);
      setState({ token: res.token, username: res.user.username, error: null, loading: false });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setState(s => ({ ...s, error: msg, loading: false }));
    }
  }, []);

  return { ...state, login };
}
```

- [ ] **Step 3: Create `dev/console/src/hooks/useNodes.ts`**

```typescript
import { useState, useEffect } from 'react';
import { getNodes } from '../api/client.js';
import type { NodeStatus } from '../api/types.js';

export function useNodes(intervalMs = 3000) {
  const [nodes, setNodes] = useState<NodeStatus[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetch() {
      try {
        const data = await getNodes();
        if (!cancelled) { setNodes(data); setError(null); }
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed');
      }
    }

    fetch();
    const id = setInterval(fetch, intervalMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [intervalMs]);

  return { nodes, error };
}
```

- [ ] **Step 4: Create `dev/console/src/hooks/useUptime.ts`**

```typescript
import { useState, useEffect } from 'react';

const startedAt = Date.now();

export function useUptime() {
  const [uptime, setUptime] = useState('');

  useEffect(() => {
    function update() {
      const ms = Date.now() - startedAt;
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      setUptime(h > 0 ? `${h}h ${m}m` : `${m}m`);
    }
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, []);

  return uptime;
}
```

- [ ] **Step 5: Typecheck**

```bash
cd dev/console && npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: no `error TS` lines from the new files.

- [ ] **Step 6: Commit**

```bash
git add dev/console/src/api/socket.ts dev/console/src/hooks/
git commit -m "feat(console): socket client and auth/nodes/uptime hooks"
```

---

## Task 4: Shared components + LoginPrompt

**Files:**
- Create: `dev/console/src/components/shared/ConfirmDialog.tsx`
- Create: `dev/console/src/components/LoginPrompt.tsx`

- [ ] **Step 1: Create `dev/console/src/components/shared/ConfirmDialog.tsx`**

```tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface Props {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ message, onConfirm, onCancel }: Props) {
  const [selected, setSelected] = useState<'yes' | 'no'>('no');

  useInput((input, key) => {
    if (key.leftArrow || input === 'h') setSelected('yes');
    if (key.rightArrow || input === 'l') setSelected('no');
    if (key.return) selected === 'yes' ? onConfirm() : onCancel();
    if (input === 'y') onConfirm();
    if (input === 'n' || key.escape) onCancel();
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" padding={1} width={50}>
      <Text>{message}</Text>
      <Box marginTop={1} gap={4}>
        <Text color={selected === 'yes' ? 'green' : 'white'} bold={selected === 'yes'}>
          {selected === 'yes' ? '▶ Yes' : '  Yes'}
        </Text>
        <Text color={selected === 'no' ? 'red' : 'white'} bold={selected === 'no'}>
          {selected === 'no' ? '▶ No' : '  No'}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>[y]es  [n]o  [←/→] select  [enter] confirm</Text>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Create `dev/console/src/components/LoginPrompt.tsx`**

```tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface Props {
  error: string | null;
  loading: boolean;
  onLogin: (username: string, password: string) => void;
}

export function LoginPrompt({ error, loading, onLogin }: Props) {
  const [field, setField] = useState<'username' | 'password'>('username');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useInput((input, key) => {
    if (loading) return;

    if (key.return) {
      if (field === 'username') {
        setField('password');
      } else if (username && password) {
        onLogin(username, password);
      }
      return;
    }
    if (key.tab) {
      setField(f => f === 'username' ? 'password' : 'username');
      return;
    }
    if (key.backspace || key.delete) {
      if (field === 'username') setUsername(u => u.slice(0, -1));
      else setPassword(p => p.slice(0, -1));
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      if (field === 'username') setUsername(u => u + input);
      else setPassword(p => p + input);
    }
  });

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" height="100%">
      <Box flexDirection="column" borderStyle="double" borderColor="cyan" padding={2} width={50}>
        <Text bold color="cyan">AmiExpress-Web Console</Text>
        <Text dimColor>Ultra Vibed by Spot/Up Rough</Text>
        <Box marginTop={1} />

        <Box flexDirection="column" gap={1}>
          <Box>
            <Text color={field === 'username' ? 'cyan' : 'white'}>Username: </Text>
            <Text>{username}{field === 'username' ? '█' : ''}</Text>
          </Box>
          <Box>
            <Text color={field === 'password' ? 'cyan' : 'white'}>Password: </Text>
            <Text>{'*'.repeat(password.length)}{field === 'password' ? '█' : ''}</Text>
          </Box>
        </Box>

        {error && (
          <Box marginTop={1}>
            <Text color="red">{error}</Text>
          </Box>
        )}
        {loading && (
          <Box marginTop={1}>
            <Text color="yellow">Authenticating...</Text>
          </Box>
        )}

        <Box marginTop={1}>
          <Text dimColor>[tab] switch field  [enter] next/login</Text>
        </Box>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd dev/console && npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: no errors from these files.

- [ ] **Step 4: Commit**

```bash
git add dev/console/src/components/
git commit -m "feat(console): shared ConfirmDialog and LoginPrompt components"
```

---

## Task 5: App shell — Header, TabBar, Footer, App, entry point

**Files:**
- Create: `dev/console/src/components/Header.tsx`
- Create: `dev/console/src/components/TabBar.tsx`
- Create: `dev/console/src/components/Footer.tsx`
- Create: `dev/console/src/App.tsx`
- Create: `dev/console/src/index.tsx`

- [ ] **Step 1: Create `dev/console/src/components/Header.tsx`**

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import { useUptime } from '../hooks/useUptime.js';

interface Props {
  username: string | null;
  backendUp: boolean;
  previewUp: boolean;
  watchUp: boolean;
}

function Pill({ label, up }: { label: string; up: boolean }) {
  return (
    <Box marginRight={2}>
      <Text color={up ? 'green' : 'red'}>{up ? '●' : '○'}</Text>
      <Text> {label} {up ? '✓' : '✗'}</Text>
    </Box>
  );
}

export function Header({ username, backendUp, previewUp, watchUp }: Props) {
  const uptime = useUptime();

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
      <Box justifyContent="space-between">
        <Box>
          <Gradient name="rainbow">
            <Text bold>AmiExpress-Web</Text>
          </Gradient>
          <Text dimColor>  Ultra Vibed by Spot/Up Rough</Text>
        </Box>
        <Box>
          {username && <Text dimColor>sysop: {username}  </Text>}
          <Text dimColor>UP {uptime}</Text>
        </Box>
      </Box>
      <Box marginTop={0}>
        <Pill label="Backend" up={backendUp} />
        <Pill label="Preview" up={previewUp} />
        <Pill label="Watch" up={watchUp} />
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Create `dev/console/src/components/TabBar.tsx`**

```tsx
import React from 'react';
import { Box, Text, useInput } from 'ink';

export const TABS = ['Nodes', 'Users', 'Confs', 'Callers', 'Logs'] as const;
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
    <Box borderStyle="single" borderColor="cyan" paddingX={1}>
      {TABS.map((tab, i) => (
        <Box key={tab} marginRight={2}>
          <Text
            color={tab === active ? 'cyan' : 'white'}
            bold={tab === active}
            underline={tab === active}
          >
            [{i + 1}] {tab}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
```

- [ ] **Step 3: Create `dev/console/src/components/Footer.tsx`**

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { TabName } from './TabBar.js';

const HINTS: Record<TabName, string> = {
  Nodes: '[k]ick  [c]hat  [↑↓] select',
  Users: '[e]dit  [b]an  [d]el  [/]search  [↑↓] scroll',
  Confs: '[t]oggle  [h]ealth  [↑↓] scroll',
  Callers: '[↑↓] scroll  auto-refresh 30s',
  Logs: '[b]ackend  [p]review  [d]oor-watcher  [6]8k',
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

- [ ] **Step 4: Create `dev/console/src/App.tsx`**

```tsx
import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { Header } from './components/Header.js';
import { TabBar, TABS, type TabName } from './components/TabBar.js';
import { Footer } from './components/Footer.js';
import { NodesTab } from './components/tabs/NodesTab.js';
import { UsersTab } from './components/tabs/UsersTab.js';
import { ConfsTab } from './components/tabs/ConfsTab.js';
import { CallersTab } from './components/tabs/CallersTab.js';
import { LogsTab } from './components/tabs/LogsTab.js';
import { getNodes } from './api/client.js';

interface Props {
  username: string;
}

export function App({ username }: Props) {
  const { exit } = useApp();
  const [activeTab, setActiveTab] = useState<TabName>('Nodes');
  const [backendUp, setBackendUp] = useState(false);

  useInput((input, key) => {
    if (input === 'q' && !key.ctrl) exit();
  });

  useEffect(() => {
    async function checkBackend() {
      try {
        await getNodes();
        setBackendUp(true);
      } catch {
        setBackendUp(false);
      }
    }
    checkBackend();
    const id = setInterval(checkBackend, 10_000);
    return () => clearInterval(id);
  }, []);

  return (
    <Box flexDirection="column" height="100%">
      <Header
        username={username}
        backendUp={backendUp}
        previewUp={true}
        watchUp={true}
      />
      <TabBar active={activeTab} onChange={setActiveTab} />
      <Box flexGrow={1} flexDirection="column" paddingX={1}>
        {activeTab === 'Nodes' && <NodesTab />}
        {activeTab === 'Users' && <UsersTab />}
        {activeTab === 'Confs' && <ConfsTab />}
        {activeTab === 'Callers' && <CallersTab />}
        {activeTab === 'Logs' && <LogsTab />}
      </Box>
      <Footer activeTab={activeTab} />
    </Box>
  );
}
```

- [ ] **Step 5: Create `dev/console/src/index.tsx`**

```tsx
import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import { LoginPrompt } from './components/LoginPrompt.js';
import { useAuth } from './hooks/useAuth.js';

function Root() {
  const { token, username, error, loading, login } = useAuth();

  if (!token) {
    return <LoginPrompt error={error} loading={loading} onLogin={login} />;
  }

  return <App username={username ?? 'sysop'} />;
}

const { waitUntilExit } = render(<Root />, {
  patchConsole: true,
});

await waitUntilExit();
process.exit(0);
```

- [ ] **Step 6: Create stub tabs so the app compiles**

Create `dev/console/src/components/tabs/NodesTab.tsx`:
```tsx
import React from 'react';
import { Text } from 'ink';
export function NodesTab() { return <Text>Loading nodes...</Text>; }
```

Create `dev/console/src/components/tabs/UsersTab.tsx`:
```tsx
import React from 'react';
import { Text } from 'ink';
export function UsersTab() { return <Text>Loading users...</Text>; }
```

Create `dev/console/src/components/tabs/ConfsTab.tsx`:
```tsx
import React from 'react';
import { Text } from 'ink';
export function ConfsTab() { return <Text>Loading conferences...</Text>; }
```

Create `dev/console/src/components/tabs/CallersTab.tsx`:
```tsx
import React from 'react';
import { Text } from 'ink';
export function CallersTab() { return <Text>Loading callers...</Text>; }
```

Create `dev/console/src/components/tabs/LogsTab.tsx`:
```tsx
import React from 'react';
import { Text } from 'ink';
export function LogsTab() { return <Text>Loading logs...</Text>; }
```

- [ ] **Step 7: Build and verify it renders**

```bash
cd dev/console && npm run build 2>&1 | tail -5
```

Expected: no TypeScript errors, `dist/index.js` created.

```bash
# Quick smoke test — it should show the login prompt then exit on Ctrl+C
node dev/console/dist/index.js
```

Expected: login prompt renders with "AmiExpress-Web Console" header. Ctrl+C to exit.

- [ ] **Step 8: Commit**

```bash
git add dev/console/src/
git commit -m "feat(console): app shell — Header, TabBar, Footer, App, entry point"
```

---

## Task 6: Nodes tab (full implementation)

**Files:**
- Modify: `dev/console/src/components/tabs/NodesTab.tsx`

- [ ] **Step 1: Replace stub with full NodesTab**

```tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { useNodes } from '../../hooks/useNodes.js';
import { kickNode, chatNode } from '../../api/client.js';
import { ConfirmDialog } from '../shared/ConfirmDialog.js';
import type { NodeStatus } from '../../api/types.js';

type Mode = 'list' | 'confirm-kick' | 'chat-input';

function formatDuration(lastActivity?: string): string {
  if (!lastActivity) return '—';
  const ms = Date.now() - new Date(lastActivity).getTime();
  const m = Math.floor(ms / 60_000);
  return m < 1 ? '<1m' : `${m}m`;
}

function NodeRow({ node, selected }: { node: NodeStatus; selected: boolean }) {
  return (
    <Box>
      <Text color={selected ? 'cyan' : 'white'} bold={selected}>
        {selected ? '▶ ' : '  '}
      </Text>
      <Text color={selected ? 'cyan' : 'white'} bold={selected}>
        {`N${node.nodeId}`.padEnd(4)}
      </Text>
      <Text color={node.online ? 'white' : 'gray'}>
        {(node.username ?? '—').padEnd(14)}
      </Text>
      <Text dimColor>{(node.location ?? '—').padEnd(20)}</Text>
      <Text dimColor>{(node.currentActivity ?? node.state ?? '—').padEnd(20)}</Text>
      <Text dimColor>{formatDuration(node.lastActivity)}</Text>
    </Box>
  );
}

export function NodesTab() {
  const { nodes, error } = useNodes();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  const [chatText, setChatText] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const onlineNodes = nodes.filter(n => n.online);
  const selected = onlineNodes[selectedIdx];

  useInput((input, key) => {
    if (mode === 'list') {
      if (key.upArrow) setSelectedIdx(i => Math.max(0, i - 1));
      if (key.downArrow) setSelectedIdx(i => Math.min(onlineNodes.length - 1, i + 1));
      if (input === 'k' && selected) setMode('confirm-kick');
      if (input === 'c' && selected) { setChatText(''); setMode('chat-input'); }
    } else if (mode === 'chat-input') {
      if (key.escape) { setMode('list'); setChatText(''); }
      if (key.return && chatText && selected) {
        chatNode(selected.nodeId, chatText)
          .then(() => { setStatus(`Sent to N${selected.nodeId}`); setMode('list'); setChatText(''); })
          .catch((e: Error) => { setStatus(`Error: ${e.message}`); setMode('list'); });
      }
      if (key.backspace || key.delete) setChatText(t => t.slice(0, -1));
      else if (input && !key.ctrl && !key.meta) setChatText(t => t + input);
    }
  });

  if (error) return <Text color="red">Error: {error}</Text>;

  return (
    <Box flexDirection="column">
      {/* Header row */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {'  NODE'.padEnd(6)}{'USER'.padEnd(14)}{'LOCATION'.padEnd(20)}{'ACTIVITY'.padEnd(20)}{'SINCE'}
        </Text>
      </Box>

      {nodes.length === 0 ? (
        <Box>
          <Text color="yellow"><Spinner type="dots" /></Text>
          <Text> Connecting...</Text>
        </Box>
      ) : (
        nodes.map((node, i) => (
          <NodeRow key={node.nodeId} node={node} selected={i === selectedIdx} />
        ))
      )}

      {status && (
        <Box marginTop={1}>
          <Text color="green">{status}</Text>
        </Box>
      )}

      {mode === 'confirm-kick' && selected && (
        <Box marginTop={1}>
          <ConfirmDialog
            message={`Kick ${selected.username ?? `N${selected.nodeId}`}?`}
            onConfirm={() => {
              kickNode(selected.nodeId)
                .then(() => setStatus(`Kicked N${selected.nodeId}`))
                .catch((e: Error) => setStatus(`Error: ${e.message}`));
              setMode('list');
            }}
            onCancel={() => setMode('list')}
          />
        </Box>
      )}

      {mode === 'chat-input' && selected && (
        <Box marginTop={1} flexDirection="column">
          <Text color="cyan">Chat to N{selected.nodeId} ({selected.username}):</Text>
          <Box>
            <Text>{'> '}</Text>
            <Text>{chatText}█</Text>
          </Box>
          <Text dimColor>[enter] send  [esc] cancel</Text>
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd dev/console && npm run build 2>&1 | grep "error TS"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add dev/console/src/components/tabs/NodesTab.tsx
git commit -m "feat(console): Nodes tab — live node list, kick, chat"
```

---

## Task 7: Users tab

**Files:**
- Modify: `dev/console/src/components/tabs/UsersTab.tsx`

- [ ] **Step 1: Replace stub with full UsersTab**

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getUsers, updateUser, deleteUser } from '../../api/client.js';
import { ConfirmDialog } from '../shared/ConfirmDialog.js';
import type { UserRecord } from '../../api/types.js';

type Mode = 'list' | 'edit-sl' | 'confirm-ban' | 'confirm-delete';

function getSecLevel(u: UserRecord): number {
  return u.secLevel ?? u.seclevel ?? 0;
}

export function UsersTab() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [filtered, setFiltered] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  const [editSlValue, setEditSlValue] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const PAGE = 20;
  const [pageStart, setPageStart] = useState(0);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getUsers();
      data.sort((a, b) => a.username.localeCompare(b.username));
      setUsers(data);
      setFiltered(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const visibleUsers = filtered.slice(pageStart, pageStart + PAGE);
  const selected = visibleUsers[selectedIdx];

  useInput((input, key) => {
    if (searching) {
      if (key.escape) { setSearching(false); setSearchText(''); setFiltered(users); return; }
      if (key.return) { setSearching(false); return; }
      if (key.backspace || key.delete) {
        const next = searchText.slice(0, -1);
        setSearchText(next);
        setFiltered(users.filter(u => u.username.toLowerCase().includes(next.toLowerCase())));
        return;
      }
      if (input && !key.ctrl) {
        const next = searchText + input;
        setSearchText(next);
        setFiltered(users.filter(u => u.username.toLowerCase().includes(next.toLowerCase())));
      }
      return;
    }

    if (mode === 'list') {
      if (key.upArrow) {
        if (selectedIdx > 0) setSelectedIdx(i => i - 1);
        else if (pageStart > 0) { setPageStart(p => p - PAGE); setSelectedIdx(PAGE - 1); }
      }
      if (key.downArrow) {
        if (selectedIdx < visibleUsers.length - 1) setSelectedIdx(i => i + 1);
        else if (pageStart + PAGE < filtered.length) { setPageStart(p => p + PAGE); setSelectedIdx(0); }
      }
      if (input === 'e' && selected) { setEditSlValue(String(getSecLevel(selected))); setMode('edit-sl'); }
      if (input === 'b' && selected) setMode('confirm-ban');
      if (input === 'd' && selected) setMode('confirm-delete');
      if (input === '/') { setSearching(true); setSearchText(''); }
      if (input === 'r') loadUsers();
    } else if (mode === 'edit-sl') {
      if (key.escape) { setMode('list'); return; }
      if (key.return && selected) {
        const sl = parseInt(editSlValue, 10);
        if (!isNaN(sl) && sl >= 0 && sl <= 255) {
          const id = selected.id ?? selected.username;
          updateUser(id, { secLevel: sl })
            .then(() => { setStatus(`SL updated for ${selected.username}`); loadUsers(); setMode('list'); })
            .catch((e: Error) => { setStatus(`Error: ${e.message}`); setMode('list'); });
        }
        return;
      }
      if (key.backspace || key.delete) { setEditSlValue(v => v.slice(0, -1)); return; }
      if (input && /[0-9]/.test(input)) setEditSlValue(v => v + input);
    }
  });

  if (loading) return <Box><Text color="yellow"><Spinner type="dots" /></Text><Text> Loading users...</Text></Box>;
  if (error) return <Text color="red">Error: {error}</Text>;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {'  USER'.padEnd(18)}{'SL'.padEnd(5)}{'CALLS'.padEnd(8)}{'LAST ON'.padEnd(20)}{'LOCATION'}
        </Text>
        <Text dimColor>  ({filtered.length}/{users.length})</Text>
      </Box>

      {visibleUsers.map((u, i) => (
        <Box key={u.username + i}>
          <Text color={i === selectedIdx ? 'cyan' : 'white'} bold={i === selectedIdx}>
            {i === selectedIdx ? '▶ ' : '  '}
            {u.username.padEnd(16)}
            {String(getSecLevel(u)).padEnd(5)}
            {String(u.calls ?? 0).padEnd(8)}
            {(u.lastOn ?? u.lastLogin ?? '—').slice(0, 19).padEnd(20)}
            {(u.location ?? '—').slice(0, 20)}
          </Text>
        </Box>
      ))}

      {searching && (
        <Box marginTop={1}>
          <Text color="cyan">Search: {searchText}█</Text>
          <Text dimColor>  [esc] clear  [enter] done</Text>
        </Box>
      )}

      {status && <Box marginTop={1}><Text color="green">{status}</Text></Box>}

      {mode === 'edit-sl' && selected && (
        <Box marginTop={1} flexDirection="column">
          <Text color="cyan">New SL for {selected.username} (0-255): {editSlValue}█</Text>
          <Text dimColor>[enter] save  [esc] cancel</Text>
        </Box>
      )}

      {mode === 'confirm-ban' && selected && (
        <Box marginTop={1}>
          <ConfirmDialog
            message={`Ban ${selected.username}? (sets SL=0)`}
            onConfirm={() => {
              const id = selected.id ?? selected.username;
              updateUser(id, { secLevel: 0 })
                .then(() => { setStatus(`${selected.username} banned`); loadUsers(); })
                .catch((e: Error) => setStatus(`Error: ${e.message}`));
              setMode('list');
            }}
            onCancel={() => setMode('list')}
          />
        </Box>
      )}

      {mode === 'confirm-delete' && selected && (
        <Box marginTop={1}>
          <ConfirmDialog
            message={`Delete ${selected.username}? This cannot be undone.`}
            onConfirm={() => {
              const id = selected.id ?? selected.username;
              deleteUser(id)
                .then(() => { setStatus(`${selected.username} deleted`); loadUsers(); setSelectedIdx(0); })
                .catch((e: Error) => setStatus(`Error: ${e.message}`));
              setMode('list');
            }}
            onCancel={() => setMode('list')}
          />
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd dev/console && npm run build 2>&1 | grep "error TS"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add dev/console/src/components/tabs/UsersTab.tsx
git commit -m "feat(console): Users tab — list, edit SL, ban, delete, search"
```

---

## Task 8: Confs, Callers, Logs tabs

**Files:**
- Modify: `dev/console/src/components/tabs/ConfsTab.tsx`
- Modify: `dev/console/src/components/tabs/CallersTab.tsx`
- Modify: `dev/console/src/components/tabs/LogsTab.tsx`

- [ ] **Step 1: Replace ConfsTab stub**

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getConferences } from '../../api/client.js';
import type { ConferenceConfig } from '../../api/types.js';

export function ConfsTab() {
  const [confs, setConfs] = useState<ConferenceConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

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

  useInput((_, key) => {
    if (key.upArrow) setSelectedIdx(i => Math.max(0, i - 1));
    if (key.downArrow) setSelectedIdx(i => Math.min(confs.length - 1, i + 1));
  });

  if (loading) return <Box><Text color="yellow"><Spinner type="dots" /></Text><Text> Loading...</Text></Box>;
  if (error) return <Text color="red">Error: {error}</Text>;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">{'  #'.padEnd(6)}{'NAME'.padEnd(30)}{'DIRS'}</Text>
      </Box>
      {confs.map((c, i) => (
        <Box key={c.id}>
          <Text color={i === selectedIdx ? 'cyan' : 'white'} bold={i === selectedIdx}>
            {i === selectedIdx ? '▶ ' : '  '}
            {String(c.conference_id).padEnd(4)}
            {c.name.slice(0, 28).padEnd(30)}
            {String(c.ndirs)}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
```

- [ ] **Step 2: Replace CallersTab stub**

```tsx
import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { getLastCallers } from '../../api/client.js';
import type { CallerRecord } from '../../api/types.js';

export function CallersTab() {
  const [callers, setCallers] = useState<CallerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await getLastCallers(50);
        setCallers(data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed');
      } finally {
        setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <Box><Text color="yellow"><Spinner type="dots" /></Text><Text> Loading...</Text></Box>;
  if (error) return <Text color="red">Error: {error}</Text>;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">{'  USER'.padEnd(18)}{'NODE'.padEnd(6)}{'ACTION'.padEnd(12)}{'TIME'}</Text>
      </Box>
      {callers.map(c => (
        <Box key={c.id}>
          <Text>{'  '}</Text>
          <Text color="white">{c.username.padEnd(16)}</Text>
          <Text dimColor>{String(c.nodeId ?? '?').padEnd(6)}</Text>
          <Text dimColor>{(c.action ?? '—').padEnd(12)}</Text>
          <Text dimColor>{new Date(c.timestamp).toLocaleString().slice(0, 20)}</Text>
        </Box>
      ))}
    </Box>
  );
}
```

- [ ] **Step 3: Replace LogsTab stub**

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getLogs } from '../../api/client.js';

type LogSource = 'backend' | 'frontend' | 'door68k';

const SOURCE_LABELS: Record<LogSource, string> = {
  backend: 'Backend',
  frontend: 'Preview',
  door68k: '68K Door',
};

export function LogsTab() {
  const [source, setSource] = useState<LogSource>('backend');
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLines([]);

    async function load() {
      try {
        const data = await getLogs(source, 200);
        if (active && mounted.current) {
          setLines(data.lines ?? []);
          setError(null);
        }
      } catch (e: unknown) {
        if (active && mounted.current) setError(e instanceof Error ? e.message : 'Failed');
      } finally {
        if (active && mounted.current) setLoading(false);
      }
    }

    load();
    const id = setInterval(load, 5_000);
    return () => { active = false; clearInterval(id); };
  }, [source]);

  useInput((input) => {
    if (input === 'b') setSource('backend');
    if (input === 'p') setSource('frontend');
    if (input === '6') setSource('door68k');
  });

  const display = lines.slice(-30);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1} gap={3}>
        {(['backend', 'frontend', 'door68k'] as LogSource[]).map(s => (
          <Text key={s} color={s === source ? 'cyan' : 'white'} bold={s === source} underline={s === source}>
            {SOURCE_LABELS[s]}
          </Text>
        ))}
        {loading && <Text color="yellow"><Spinner type="dots" /></Text>}
      </Box>

      {error && <Text color="red">Error: {error}</Text>}

      {display.map((line, i) => (
        <Text key={i} dimColor={i < display.length - 5}>
          {line.slice(0, 120)}
        </Text>
      ))}
    </Box>
  );
}
```

- [ ] **Step 4: Build**

```bash
cd dev/console && npm run build 2>&1 | grep "error TS"
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add dev/console/src/components/tabs/
git commit -m "feat(console): Confs, Callers, Logs tabs"
```

---

## Task 9: Status strip

**Files:**
- Create: `dev/console/strip/strip.ts`
- Modify: `dev/console/tsconfig.json` (add strip to include)

The strip is a standalone plain-Node script — no Ink, no React. It polls `/api/nodes/status` and `/api/stats/system`, clears the terminal, and prints a fixed 3-line status block. Runs as `node dev/console/dist/strip/strip.js`.

- [ ] **Step 1: Create `dev/console/strip/strip.ts`**

```typescript
const BASE_URL = process.env['AMIEXPRESS_URL'] ?? 'http://localhost:3001';
const INTERVAL = 3000;

function pad(s: string, n: number) { return s.slice(0, n).padEnd(n); }

async function getJson(path: string): Promise<unknown> {
  const token = process.env['AMIEXPRESS_CONSOLE_TOKEN'];
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function render() {
  try {
    const [nodesRes, statsRes] = await Promise.all([
      getJson('/api/nodes/status').catch(() => null),
      getJson('/api/stats/system').catch(() => null),
    ]);

    const nodes = (nodesRes as any)?.data ?? [];
    const stats = (statsRes as any)?.data;

    const pills = ['Backend', 'Preview', 'Watch']
      .map(n => `\x1b[32m●\x1b[0m ${n}`)
      .join('  ');

    const nodeLines = Array.from({ length: 3 }, (_, i) => {
      const n = nodes[i];
      if (!n) return `N${i + 1} idle  —`;
      return `N${n.nodeId} ${pad(n.username ?? 'idle', 10)} ${pad(n.currentActivity ?? n.state ?? '—', 16)}`;
    }).join('   ');

    const statsLine = stats
      ? `UP —    Users: ${stats.allTime?.totalUsers ?? '?'}    Msgs today: ${stats.today?.calls ?? '?'}`
      : 'connecting...';

    process.stdout.write('\x1b[2J\x1b[H');
    process.stdout.write(`  ${pills}\n`);
    process.stdout.write(`  ${nodeLines}\n`);
    process.stdout.write(`  ${statsLine}\n`);
  } catch {
    process.stdout.write('\x1b[2J\x1b[H');
    process.stdout.write('  waiting for auth...\n');
  }
}

await render();
setInterval(render, INTERVAL);
```

- [ ] **Step 2: Add strip to tsconfig includes and build**

Modify `dev/console/tsconfig.json` — change `"include"` to:
```json
"include": ["src/**/*", "strip/**/*"]
```

And add `"outDir": "dist"` stays the same, but also add `"rootDir"` pointing to `.` (not `src`) since strip is outside src:

The full updated tsconfig:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*", "strip/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Note: removing `"rootDir"` so TypeScript can handle both `src/` and `strip/` source trees. The output will be `dist/src/index.js` and `dist/strip/strip.js`.

Update `dev/console/package.json` `"main"` and start paths:
```json
"main": "dist/src/index.js",
"scripts": {
  "build": "tsc",
  "start": "node dist/src/index.js",
  "start:strip": "node dist/strip/strip.js",
  "dev": "tsx src/index.tsx"
}
```

- [ ] **Step 3: Build with strip**

```bash
cd dev/console && npm run build 2>&1 | grep "error TS"
ls dist/strip/strip.js dist/src/index.js
```

Expected: no errors, both files exist.

- [ ] **Step 4: Test the strip manually**

```bash
# With backend running:
node dev/console/dist/strip/strip.js
```

Expected: 3-line status display updates every 3s. Ctrl+C to stop.

- [ ] **Step 5: Commit**

```bash
git add dev/console/strip/ dev/console/tsconfig.json dev/console/package.json
git commit -m "feat(console): status strip — 3-line ANSI status for tmux pane"
```

---

## Task 10: tmux bootstrap in start-servers.sh

**Files:**
- Modify: `dev/scripts/start-servers.sh` — insert `launch_tmux_session()` after line 97 (the `done` closing the arg-parse loop)

- [ ] **Step 1: Insert the tmux bootstrap block after line 97**

After the closing `done` of the argument parser (line 97), and before the `# Display startup mode` comment (line 99), insert this block:

```bash
# ─── tmux console ────────────────────────────────────────────────────────────
# Only activate in an interactive terminal that has tmux AND is not already
# inside a tmux session ($TMUX is set by tmux in all child processes).
launch_tmux_session() {
  local session="amiexpress"

  # If session already exists, just attach
  if tmux has-session -t "$session" 2>/dev/null; then
    exec tmux attach -t "$session"
  fi

  # Build the console app if it hasn't been built yet
  local console_dir
  console_dir="$(cd "$(dirname "$0")/../.." && pwd)/dev/console"
  if [ -d "$console_dir" ] && [ -f "$console_dir/package.json" ]; then
    (cd "$console_dir" && npm run build --silent 2>/dev/null) || true
  fi

  # Determine the project root (two levels up from this script)
  local root
  root="$(cd "$(dirname "$0")/../.." && pwd)"

  # Window 0: logs layout
  # pane 0 (top 70%): runs THIS script --bbs-only; $TMUX will be set so the
  #                   tmux gate below won't fire again — no infinite loop.
  tmux new-session -d -s "$session" -n logs \
    "cd '$root' && bash '$0' --bbs-only; bash"

  # pane 1 (bottom-left): status strip
  tmux split-window -v -p 30 -t "${session}:logs" \
    "cd '$root' && node dev/console/dist/strip/strip.js; bash"

  # split pane 1 in half horizontally → pane 2: preview log
  tmux split-window -h -p 67 -t "${session}:logs.1" \
    "cd '$root' && tail -f logs/frontend.log 2>/dev/null || echo 'waiting for preview log...'; bash"

  # split pane 2 in half horizontally → pane 3: door watcher log
  tmux split-window -h -p 50 -t "${session}:logs.2" \
    "cd '$root' && tail -f logs/door-watcher.log 2>/dev/null || echo 'waiting for watcher log...'; bash"

  # Window 1: clean shell
  tmux new-window -t "$session" -n shell "cd '$root'; bash"

  # Window 2: Ink console TUI (starts after 8s to let backend come up)
  tmux new-window -t "$session" -n console \
    "cd '$root' && sleep 8 && node dev/console/dist/src/index.js; bash"

  # Focus the logs window on attach
  tmux select-window -t "${session}:logs"
  tmux select-pane  -t "${session}:logs.0"

  exec tmux attach -t "$session"
}

if [ -t 1 ] && command -v tmux &>/dev/null && [ -z "${TMUX:-}" ]; then
  launch_tmux_session
fi
# ─────────────────────────────────────────────────────────────────────────────
```

- [ ] **Step 2: Verify the insertion is correct**

```bash
grep -n "launch_tmux_session\|tmux\|TMUX" dev/scripts/start-servers.sh | head -20
```

Expected: see `launch_tmux_session` defined around line 98, the guard at approximately line 140, `done` at line 97.

- [ ] **Step 3: Test without tmux (CI simulation)**

```bash
# Simulate non-TTY: should fall through to normal output
bash dev/scripts/start-servers.sh --help
```

Expected: normal help text, no tmux interaction.

- [ ] **Step 4: Test tmux session creation (requires tmux installed)**

```bash
# Kill any existing test session
tmux kill-session -t amiexpress 2>/dev/null || true
# Run script (it will create the session and open it)
# Press Ctrl+B D to detach, then verify session state:
tmux list-windows -t amiexpress
```

Expected:
```
0: logs* (4 panes)
1: shell-
2: console-
```

- [ ] **Step 5: Commit**

```bash
git add dev/scripts/start-servers.sh
git commit -m "feat(console): tmux bootstrap in start-servers.sh"
```

---

## Task 11: Integration smoke test + handoff update

**Files:**
- Modify: `handoff.md`

- [ ] **Step 1: Full build verification**

```bash
cd dev/console && npm run build 2>&1 | grep "error TS"
```

Expected: no TypeScript errors.

- [ ] **Step 2: Manual integration test**

With backend running (`./dev/scripts/start-servers.sh --bbs-only` in another terminal):

```bash
node dev/console/dist/src/index.js
```

Expected:
1. Login prompt appears with gradient "AmiExpress-Web Console" header
2. Enter sysop credentials → dashboard appears
3. Header shows server pills (Backend ✓)
4. Tab bar shows [1] Nodes [2] Users [3] Confs [4] Callers [5] Logs
5. Nodes tab shows live node data (N1, N2, N3)
6. Press 2 → Users tab shows user list
7. Press q → exits cleanly

- [ ] **Step 3: Test status strip**

```bash
AMIEXPRESS_CONSOLE_TOKEN=<your-token> node dev/console/dist/strip/strip.js
```

Expected: 3-line live status display. Ctrl+C to stop.

- [ ] **Step 4: Update handoff.md**

Add to handoff.md:
```
## TUI Console (2026-04-28)
- New package: dev/console/ — Ink TUI with tmux bootstrap
- start-servers.sh: creates session amiexpress (3 windows) when tmux available
- Tabs: Nodes (live, kick/chat), Users (edit SL/ban/delete), Confs, Callers, Logs
- Status strip: dev/console/dist/strip/strip.js — plain ANSI, reads AMIEXPRESS_CONSOLE_TOKEN
- Build: cd dev/console && npm run build
- Known: Header shows static "Preview ✓ / Watch ✓" — live detection TBD (iterate)
```

- [ ] **Step 5: Final commit**

```bash
git add handoff.md
git commit -m "docs: update handoff for TUI console implementation"
```
