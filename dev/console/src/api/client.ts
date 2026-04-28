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
  const res = await request<{ accessToken: string; refreshToken?: string; user: { id: string; username: string; secLevel: number } }>(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ username, password }) }
  );
  setToken(res.accessToken);
  // Propagate token to tmux session env so the status strip picks it up
  if (process.env['TMUX']) {
    const { execSync } = await import('child_process');
    try {
      execSync(`tmux set-environment -t amiexpress AMIEXPRESS_CONSOLE_TOKEN "${res.accessToken}"`);
    } catch {
      // non-fatal: strip just retries until env is set
    }
  }
  return { token: res.accessToken, user: res.user };
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
  const res = await request<{ success: boolean; data: import('./types.js').UserRecord[] }>('/api/config/users');
  return res.data ?? [];
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
  const res = await request<{ success: boolean; data: import('./types.js').ConferenceConfig[] }>('/api/config/conferences');
  return res.data ?? [];
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

// ───── Phase B additions ────────────────────────────────────────────

export async function updateSystemConfig(updates: Record<string, unknown>) {
  return request<{ success: boolean }>('/api/config/system', {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export interface HealthIssue {
  category?: string;
  severity?: 'ok' | 'warning' | 'error' | string;
  message: string;
  fixable?: boolean;
  details?: string;
}

export async function getHealthCheck() {
  const res = await request<{ success: boolean; data: { issues?: HealthIssue[]; healthy?: boolean; [k: string]: unknown } }>('/api/config/health');
  return res.data;
}

export async function autoFixHealth() {
  return request<{ success: boolean; message?: string; data?: { fixed?: number } }>('/api/config/health/auto-fix', {
    method: 'POST',
  });
}

export interface AuditEntry {
  id: number;
  table_name: string;
  record_id: string | number;
  action: string;
  changed_by?: string;
  before?: unknown;
  after?: unknown;
  timestamp: string;
}

export async function getAuditLog(opts: { tableName?: string; limit?: number } = {}) {
  const params = new URLSearchParams();
  if (opts.tableName) params.set('tableName', opts.tableName);
  if (opts.limit) params.set('limit', String(opts.limit));
  const q = params.toString();
  const res = await request<{ success: boolean; data: AuditEntry[] }>(`/api/config/audit${q ? '?' + q : ''}`);
  return res.data ?? [];
}

export interface SessionInfo {
  id: string;
  username?: string;
  nodeId?: number;
  startedAt?: string;
  endedAt?: string | null;
  active?: boolean;
}

export async function getSessions() {
  const res = await request<{ success: boolean; data: SessionInfo[] }>('/api/sessions');
  return res.data ?? [];
}

export async function getSessionLog(sessionId: string) {
  const res = await request<{ success: boolean; data: { lines?: string[]; entries?: unknown[]; [k: string]: unknown } }>(`/api/sessions/${sessionId}/log`);
  return res.data;
}

export interface OperatorChatConfig {
  page_timeout_seconds?: number;
  cooldown_seconds?: number;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  discord_webhook_url?: string;
  quick_replies?: string[];
  [k: string]: unknown;
}

export async function getOperatorChatConfig() {
  const res = await request<{ success: boolean; data: OperatorChatConfig }>('/api/config/operator-chat');
  return res.data;
}
