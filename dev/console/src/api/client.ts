const BASE_URL = process.env['AMIEXPRESS_URL'] ?? 'http://localhost:3001';

let _token: string | null = process.env['AMIEXPRESS_CONSOLE_TOKEN'] ?? null;

export function setToken(token: string): void {
  _token = token;
}

export function getToken(): string | null {
  return _token;
}

// A non-responding backend must not freeze a caller forever: password reset
// and user creation both have a form with no way out while their submit
// promise is pending, and this is what makes it eventually settle even if
// the sysop's own Escape handling didn't already release it.
const REQUEST_TIMEOUT_MS = 15_000;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (_token) headers['Authorization'] = `Bearer ${_token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...options, headers, signal: controller.signal });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s: ${path}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    // These are read under time pressure - `HTTP 400: {"success":false,
    // "message":"..."}` buries the one line that matters inside JSON the
    // sysop has to parse by eye. Pull `message`/`error` out when the body
    // is shaped that way; anything else falls back to the raw text.
    let detail = text;
    try {
      const parsed = JSON.parse(text) as { message?: unknown; error?: unknown };
      if (typeof parsed.message === 'string' && parsed.message) detail = parsed.message;
      else if (typeof parsed.error === 'string' && parsed.error) detail = parsed.error;
    } catch {
      // Not JSON - the raw text is already the best we have.
    }
    throw Object.assign(new Error(`HTTP ${res.status}: ${detail}`), { status: res.status });
  }
  return res.json() as Promise<T>;
}

// Backend lists are inconsistent: some endpoints return a bare array,
// others wrap in { success, data: [...] }. This helper handles both.
async function requestList<T>(path: string): Promise<T[]> {
  const res = await request<T[] | { success?: boolean; data?: T[] }>(path);
  if (Array.isArray(res)) return res;
  return res.data ?? [];
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

export async function getUsers() {
  const res = await request<{ success: boolean; data: import('./types.js').UserRecord[] }>('/api/config/users');
  return res.data ?? [];
}

// `password` is not part of UserRecord (GET /users strips passwordHash from
// every response — config-routes.ts:1663-1667) but PUT accepts it: the
// backend destructures `{ password, ...updates }` and, when present, hashes
// it into BOTH the disk record and the database row that login checks
// (config-routes.ts:1798-1948). Leaving it out of the body keeps the
// account's current password, matching the web admin's "leave blank to keep
// current password" field (UsersPage.tsx:404).
export async function updateUser(
  id: string,
  updates: Partial<import('./types.js').UserRecord> & { password?: string },
) {
  return request<{ success: boolean }>(`/api/config/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteUser(id: string) {
  return request<{ success: boolean }>(`/api/config/users/${id}`, { method: 'DELETE' });
}

// POST /api/config/users (config-routes.ts:1699-1786): creates the account
// AND appends it to user.data (database.appendUserToDisk) so it is visible
// to express.e immediately, not just to the admin's own GET. `password` is
// required by the backend for a new account.
export async function createUser(
  user: Partial<import('./types.js').UserRecord> & { username: string; password: string },
) {
  return request<{ success: boolean; data: import('./types.js').UserRecord; message?: string }>(
    '/api/config/users',
    { method: 'POST', body: JSON.stringify(user) }
  );
}

export async function getConferences() {
  const res = await request<{ success: boolean; data: import('./types.js').ConferenceConfig[] }>('/api/config/conferences');
  return res.data ?? [];
}

export async function getLastCallers(limit = 50) {
  const res = await request<{ success: boolean; data: import('./types.js').CallerRecord[] }>(`/api/stats/last-callers?limit=${limit}`);
  return res.data ?? [];
}

export async function getLastUploads(limit = 20) {
  const res = await request<{ success: boolean; data: Array<{ id: number; filename: string; size?: number; uploader?: string; uploadDate?: string }> }>(`/api/stats/last-uploads?limit=${limit}`);
  return res.data ?? [];
}

export async function getLastDownloads(limit = 20) {
  const res = await request<{ success: boolean; data: Array<{ id: number; filename: string; size?: number; uploader?: string; downloadCount?: number; areaName?: string }> }>(`/api/stats/last-downloads?limit=${limit}`);
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

export async function updateDoor(id: string | number, updates: Partial<import('./types.js').DoorInfo>) {
  return request<{ success: boolean; message?: string }>(`/api/config/doors/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

// Identified by COMMAND, not the list-position `id` above — the door list is
// loaded from disk and numbered by position, so an :id would find nothing or
// the wrong door. Matches web/config-app/src/api/client.ts's deleteDoor and
// backend DELETE /api/config/doors/:command (config-routes.ts:721).
export async function deleteDoor(command: string) {
  return request<{ success: boolean; message?: string }>(`/api/config/doors/${encodeURIComponent(command)}`, {
    method: 'DELETE',
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

// Body must carry { username } to reserve, or {} to clear an existing
// reservation (backend toggle/clear path — node-control-routes.ts:150-197).
// The prior signature took no username at all, so it could only ever hit the
// clear branch or 400 — it could not actually reserve a node.
export async function reserveNode(nodeId: number, username?: string) {
  return request<{ success: boolean; message?: string; reservedFor: string | null }>(
    `/api/nodes/${nodeId}/reserve`,
    { method: 'POST', body: JSON.stringify(username ? { username } : {}) }
  );
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
  severity?: 'ok' | 'warning' | 'error' | 'info' | string;
  message: string;
  fixable?: boolean;
  details?: string;
}

interface RawHealthIssue {
  severity?: string;
  category?: string;
  description?: string;
  message?: string;
  path?: string;
  autoFixable?: boolean;
  fixable?: boolean;
  details?: string;
}

interface RawHealthCategory {
  category: string;
  passed?: boolean;
  issues?: RawHealthIssue[];
  errorCount?: number;
  warningCount?: number;
}

export async function getHealthCheck() {
  // Backend response shape:
  //   { success: true, data: { overallStatus, totalIssues, autoFixableIssues,
  //                            categories: [{ category, issues: [...] }] } }
  // Flatten the nested issues into a flat list and normalise field names so
  // the page doesn't have to know about the nesting.
  const res = await request<{
    success?: boolean;
    data?: {
      overallStatus?: string;
      totalIssues?: number;
      autoFixableIssues?: number;
      categories?: RawHealthCategory[];
      issues?: RawHealthIssue[];
    };
  }>('/api/config/health');
  const d = res.data ?? {};
  const flat: HealthIssue[] = [];
  if (Array.isArray(d.categories)) {
    for (const cat of d.categories) {
      for (const it of cat.issues ?? []) {
        flat.push({
          category: it.category ?? cat.category,
          severity: it.severity,
          message: it.description ?? it.message ?? '',
          fixable: it.autoFixable ?? it.fixable,
          details: it.path ?? it.details,
        });
      }
    }
  } else if (Array.isArray(d.issues)) {
    for (const it of d.issues) {
      flat.push({
        category: it.category,
        severity: it.severity,
        message: it.description ?? it.message ?? '',
        fixable: it.autoFixable ?? it.fixable,
        details: it.path ?? it.details,
      });
    }
  }
  return {
    issues: flat,
    healthy: d.overallStatus === 'healthy' || d.overallStatus === 'ok' || (d.totalIssues ?? 0) === 0,
    overallStatus: d.overallStatus,
    totalIssues: d.totalIssues ?? flat.length,
    autoFixableIssues: d.autoFixableIssues ?? flat.filter(i => i.fixable).length,
  };
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
  // Backend returns { sessions: [...] } at /api/sessions (NOT { success, data }).
  // Each entry shape: { sessionId, startTime, lastActivity, lineCount }.
  const res = await request<{ sessions?: Array<Record<string, unknown>>; data?: SessionInfo[] }>('/api/sessions');
  const list = (res.sessions ?? res.data ?? []) as Array<Record<string, unknown>>;
  return list.map((s): SessionInfo => ({
    id: String(s['sessionId'] ?? s['id'] ?? ''),
    username: typeof s['username'] === 'string' ? s['username'] as string : undefined,
    nodeId: typeof s['nodeId'] === 'number' ? s['nodeId'] as number : undefined,
    startedAt: typeof s['startTime'] === 'string' ? s['startTime'] as string
      : typeof s['startedAt'] === 'string' ? s['startedAt'] as string : undefined,
    endedAt: typeof s['endedAt'] === 'string' ? s['endedAt'] as string : null,
    active: s['endedAt'] == null,
  }));
}

export async function getSessionLog(sessionId: string) {
  // Backend returns either { success, data: {...} } or the bare object — accept both.
  const res = await request<{ success?: boolean; data?: unknown; lines?: string[]; entries?: unknown[]; [k: string]: unknown }>(`/api/sessions/${sessionId}/log`);
  if (res && typeof res === 'object' && 'data' in res && res.data && typeof res.data === 'object') {
    return res.data as { lines?: string[]; entries?: unknown[]; [k: string]: unknown };
  }
  return res as { lines?: string[]; entries?: unknown[]; [k: string]: unknown };
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

// ───── Phase C: CRUD pages ──────────────────────────────────────────

// Languages
export async function getLanguages() {
  return requestList<import('./types.js').LanguageRow>('/api/config/languages');
}

export async function createLanguage(row: Partial<import('./types.js').LanguageRow>) {
  return request<{ success: boolean; data: import('./types.js').LanguageRow }>('/api/config/languages', {
    method: 'POST', body: JSON.stringify(row),
  });
}

export async function updateLanguage(id: number, patch: Partial<import('./types.js').LanguageRow>) {
  return request<{ success: boolean; data: import('./types.js').LanguageRow }>(`/api/config/languages/${id}`, {
    method: 'PUT', body: JSON.stringify(patch),
  });
}

export async function deleteLanguage(id: number) {
  return request<{ success: boolean }>(`/api/config/languages/${id}`, { method: 'DELETE' });
}

// Protocols
export async function getProtocols() {
  return requestList<import('./types.js').ProtocolRow>('/api/config/protocols');
}

export async function createProtocol(row: Partial<import('./types.js').ProtocolRow>) {
  return request<{ success: boolean; data: import('./types.js').ProtocolRow }>('/api/config/protocols', {
    method: 'POST', body: JSON.stringify(row),
  });
}

export async function updateProtocol(id: number, patch: Partial<import('./types.js').ProtocolRow>) {
  return request<{ success: boolean; data: import('./types.js').ProtocolRow }>(`/api/config/protocols/${id}`, {
    method: 'PUT', body: JSON.stringify(patch),
  });
}

export async function deleteProtocol(id: number) {
  return request<{ success: boolean }>(`/api/config/protocols/${id}`, { method: 'DELETE' });
}

// Computers
export async function getComputers() {
  return requestList<import('./types.js').ComputerRow>('/api/config/computers');
}

export async function createComputer(row: Partial<import('./types.js').ComputerRow>) {
  return request<{ success: boolean; data: import('./types.js').ComputerRow }>('/api/config/computers', {
    method: 'POST', body: JSON.stringify(row),
  });
}

export async function updateComputer(id: number, patch: Partial<import('./types.js').ComputerRow>) {
  return request<{ success: boolean; data: import('./types.js').ComputerRow }>(`/api/config/computers/${id}`, {
    method: 'PUT', body: JSON.stringify(patch),
  });
}

export async function deleteComputer(id: number) {
  return request<{ success: boolean }>(`/api/config/computers/${id}`, { method: 'DELETE' });
}

// Screen Types
export async function getScreenTypes() {
  return requestList<import('./types.js').ScreenTypeRow>('/api/config/screen-types');
}

export async function createScreenType(row: Partial<import('./types.js').ScreenTypeRow>) {
  return request<{ success: boolean; data: import('./types.js').ScreenTypeRow }>('/api/config/screen-types', {
    method: 'POST', body: JSON.stringify(row),
  });
}

export async function updateScreenType(id: number, patch: Partial<import('./types.js').ScreenTypeRow>) {
  return request<{ success: boolean; data: import('./types.js').ScreenTypeRow }>(`/api/config/screen-types/${id}`, {
    method: 'PUT', body: JSON.stringify(patch),
  });
}

export async function deleteScreenType(id: number) {
  return request<{ success: boolean }>(`/api/config/screen-types/${id}`, { method: 'DELETE' });
}

// Drives
export async function getDrives() {
  return requestList<import('./types.js').DriveRow>('/api/config/drives');
}

export async function createDrive(row: Partial<import('./types.js').DriveRow>) {
  return request<{ success: boolean; data: import('./types.js').DriveRow }>('/api/config/drives', {
    method: 'POST', body: JSON.stringify(row),
  });
}

export async function updateDrive(id: number, patch: Partial<import('./types.js').DriveRow>) {
  return request<{ success: boolean; data: import('./types.js').DriveRow }>(`/api/config/drives/${id}`, {
    method: 'PUT', body: JSON.stringify(patch),
  });
}

export async function deleteDrive(id: number) {
  return request<{ success: boolean }>(`/api/config/drives/${id}`, { method: 'DELETE' });
}

// File Checkers
export async function getFileCheckers() {
  return requestList<import('./types.js').FileCheckerRow>('/api/config/file-checkers');
}

export async function createFileChecker(row: Partial<import('./types.js').FileCheckerRow>) {
  return request<{ success: boolean; data: import('./types.js').FileCheckerRow }>('/api/config/file-checkers', {
    method: 'POST', body: JSON.stringify(row),
  });
}

export async function updateFileChecker(id: number, patch: Partial<import('./types.js').FileCheckerRow>) {
  return request<{ success: boolean; data: import('./types.js').FileCheckerRow }>(`/api/config/file-checkers/${id}`, {
    method: 'PUT', body: JSON.stringify(patch),
  });
}

export async function deleteFileChecker(id: number) {
  return request<{ success: boolean }>(`/api/config/file-checkers/${id}`, { method: 'DELETE' });
}

// Security levels — Access/ACS.<level>.info, the files express.e actually
// reads through utils/acs-access-loader. This TUI used to point at
// /api/config/security/:level, which is CRUD over a SQLite table
// (security_level_access) the BBS never consults — see
// web/backend/src/services/config-services/acs-level-file.service.ts:4-9 for
// the incident that forced the web admin off that table. Match it here.
export interface AcsLevelsInfo {
  levels: number[];
  inUse: Array<{ level: number; users: number; servedBy: number | null }>;
  permissions: string[];
}

export interface AcsLevelFlags {
  level: number;
  file: string;
  flags: Record<string, boolean>;
  ambiguous: string[];
}

export async function getAcsLevels() {
  const res = await request<{ success: boolean; data: AcsLevelsInfo }>('/api/config/security/levels');
  return res.data;
}

export async function getAcsLevelFlags(level: number) {
  const res = await request<{ success: boolean; data: AcsLevelFlags }>(`/api/config/security/levels/${level}`);
  return res.data;
}

export async function saveAcsLevelFlags(level: number, flags: Record<string, boolean>) {
  return request<{ success: boolean; data: { level: number; file: string; backupPath: string } }>(
    `/api/config/security/levels/${level}`,
    { method: 'PUT', body: JSON.stringify({ flags }) }
  );
}

export async function createAcsLevel(level: number, copyFrom?: number) {
  return request<{ success: boolean; message?: string }>(`/api/config/security/levels/${level}`, {
    method: 'POST',
    body: JSON.stringify(copyFrom !== undefined ? { copyFrom } : {}),
  });
}

// ───── Phase D: Door install, Import/Export, Batch editor ──────────────

export async function installDoorArchive(archive: { filename?: string; path?: string }) {
  return request<{ success: boolean; message?: string }>('/api/config/doors/install-archive', {
    method: 'POST',
    body: JSON.stringify(archive),
  });
}

export interface ImportSession {
  id: string;
  filename?: string;
  status?: string;
  createdAt?: string;
  conflicts?: number;
  totalRows?: number;
}

export async function getImportSessions() {
  // Backend returns { success: true, sessions: [...] } — NOT data.
  const res = await request<{ success: boolean; sessions?: ImportSession[]; data?: ImportSession[] }>('/api/import/sessions');
  return res.sessions ?? res.data ?? [];
}

export async function getImportSession(id: string) {
  const res = await request<{ success: boolean; data: unknown }>(`/api/import/session/${id}`);
  return res.data;
}

export async function validateImport(id: string) {
  return request<{ success: boolean; data?: unknown }>(`/api/import/validate/${id}`, { method: 'POST' });
}

export async function executeImport(id: string) {
  return request<{ success: boolean; message?: string }>(`/api/import/execute/${id}`, { method: 'POST' });
}

export async function cancelImport(id: string) {
  return request<{ success: boolean }>(`/api/import/cancel/${id}`, { method: 'POST' });
}

export async function deleteImport(id: string) {
  return request<{ success: boolean }>(`/api/import/session/${id}`, { method: 'DELETE' });
}

export async function createExport(opts: { format?: string; includeUsers?: boolean; includeMessages?: boolean; includeFiles?: boolean } = {}) {
  return request<{ success: boolean; data?: { filename?: string } }>('/api/import/export/create', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export async function listExports() {
  // Backend returns { success: true, exports: [...] } — NOT data.
  const res = await request<{ success: boolean; exports?: Array<{ filename: string; size?: number; createdAt?: string }>; data?: Array<{ filename: string; size?: number; createdAt?: string }> }>('/api/import/export/list');
  return res.exports ?? res.data ?? [];
}

export async function listBatches() {
  return request<{ batches: string[] }>('/api/batches');
}

export async function getBatch(name: string) {
  return request<{ name: string; content: string }>(`/api/batches/${name}`);
}

export async function saveBatch(name: string, content: string) {
  return request<{ name: string; saved: boolean }>(`/api/batches/${name}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

export async function validateBatch(name: string, content: string) {
  return request<{ valid?: boolean; errors?: string[] }>('/api/batches/validate', {
    method: 'POST',
    body: JSON.stringify({ name, content }),
  });
}

// ───── Phase F: Screens (full management) ────────────────────────────

export interface ScopeResolution {
  scope: 'node' | 'conf' | 'board';
  id: number | null;
  dir: string;
  dirIsShared: boolean;
  file: string | null;
  variants: string[];
}

export interface ScreenIndexEntry {
  screen: string;
  dirType: string;
  resolutions: ScopeResolution[];
  missingScopes: number;
  duplicateGroups: { sha256: string; paths: string[] }[];
}

export interface SauceFacts {
  title: string;
  author: string;
  group: string;
  date: string;
  font: string;
  colours: number;
}

export interface ScreenFileFacts {
  path: string;
  bytes: number;
  format: string;
  sha256: string;
  readBy: string[];
  mci: Array<{ code: string; target: string; resolves: boolean }>;
  sauce: SauceFacts | null;
  problems: string[];
}

export interface ConferenceFacts {
  id: number;
  name: string;
  dir: string;
  fileAreas: number;
  messageBases: number;
}

export interface BulletinFacts {
  number: number;
  file: string;
  title?: string;
}

export interface ScreenIndex {
  screens: ScreenIndexEntry[];
  unused: ScreenFileFacts[];
  files: Record<string, ScreenFileFacts>;
  conferences: ConferenceFacts[];
  bulletins: BulletinFacts[];
  builtAt: string;
}

export async function getScreenIndex(): Promise<ScreenIndex> {
  const res = await request<{ success: boolean; data: { screens?: ScreenIndexEntry[]; unused?: ScreenFileFacts[]; files?: Record<string, ScreenFileFacts>; conferences?: ConferenceFacts[]; bulletins?: BulletinFacts[]; builtAt?: string; callersByLevel?: Record<string, number> } }>('/api/screens');
  const d = res.data ?? {};
  return {
    screens: (d.screens ?? []) as ScreenIndexEntry[],
    unused: (d.unused ?? []) as ScreenFileFacts[],
    files: (d.files ?? {}) as Record<string, ScreenFileFacts>,
    conferences: (d.conferences ?? []) as ConferenceFacts[],
    bulletins: (d.bulletins ?? []) as BulletinFacts[],
    builtAt: d.builtAt ?? '',
  };
}

export async function getScreenFile(path: string) {
  const res = await request<{ success: boolean; data?: ScreenFileFacts & { content: string } }>(`/api/screens/file?path=${encodeURIComponent(path)}`);
  return res.data;
}

export async function putScreenFile(path: string, content: string, targets?: string[]) {
  const res = await request<{ success: boolean; data?: { written?: string[] } }>('/api/screens/file', {
    method: 'PUT',
    body: JSON.stringify({ content, targets }),
  });
  return res.data ?? {};
}

export async function deleteScreenFile(path: string) {
  const res = await request<{ success: boolean; data?: { deleted?: boolean; backup?: string; stopsResolving?: string[] } }>(`/api/screens/file?path=${encodeURIComponent(path)}`, {
    method: 'DELETE',
  });
  return res.data ?? { deleted: false, backup: '', stopsResolving: [] };
}

export async function repairScreenFile(path: string) {
  const res = await request<{ success: boolean; data?: { path?: string; backup?: string; repaired?: number } }>('/api/screens/repair', {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
  return res.data ?? { path: '', backup: '', repaired: 0 };
}

export async function getSharedScreenDirs() {
  const res = await request<{ success: boolean; data?: { directories?: Array<{ dir: string; files: string[] }> } }>('/api/screens/shared-directories');
  return res.data?.directories ?? [];
}

export async function shareScreens(nodes: number[], sharedDir: string, dryRun?: boolean) {
  const res = await request<{ success: boolean; data?: { blocked?: string[]; canShare?: boolean; wouldWrite?: string[]; tooltype?: string } }>('/api/screens/share', {
    method: 'POST',
    body: JSON.stringify({ nodes, sharedDir, dryRun }),
  });
  return res.data ?? {};
}

// Deployment monitoring (read-only)
export async function getDeploymentHealth() {
  return request<{ success?: boolean; data?: unknown; [k: string]: unknown }>('/api/deployment/health');
}

export async function getDeploymentSystemInfo() {
  return request<{ data?: unknown; [k: string]: unknown }>('/api/deployment/system-info');
}

export async function getDeploymentDatabaseStats() {
  return request<{ data?: unknown; [k: string]: unknown }>('/api/deployment/database-stats');
}

// Info Editor (.info file tooltypes)
export interface InfoFileEntry {
  path: string;
  name?: string;
  basename?: string;
  relativePath?: string;
  size?: number;
  modified?: string;
  type?: string;
  tooltypes?: InfoTooltype[];
}

export interface InfoTooltype {
  key: string;
  value?: string;
  commented?: boolean;
}

export async function getInfoFiles() {
  // Backend returns { files: [...] } — NOT { data: [...] }.
  const res = await request<{ files?: InfoFileEntry[]; data?: InfoFileEntry[] }>('/api/info-editor/files');
  return res.files ?? res.data ?? [];
}

export async function getInfoFile(relativePath: string) {
  // Backend returns the file object directly (not wrapped).
  const res = await request<{ data?: { path: string; tooltypes: InfoTooltype[] }; path?: string; tooltypes?: InfoTooltype[]; [k: string]: unknown }>(`/api/info-editor/file?path=${encodeURIComponent(relativePath)}`);
  if (res && typeof res === 'object' && 'data' in res && res.data) return res.data;
  return res as unknown as { path: string; tooltypes: InfoTooltype[] };
}

export async function updateInfoFile(relativePath: string, tooltypes: InfoTooltype[]) {
  return request<{ success: boolean }>('/api/info-editor/file', {
    method: 'PUT',
    body: JSON.stringify({ path: relativePath, tooltypes }),
  });
}

export async function toggleTooltypeComment(relativePath: string, key: string) {
  return request<{ success: boolean }>('/api/info-editor/toggle', {
    method: 'POST',
    body: JSON.stringify({ path: relativePath, key }),
  });
}

// Admin Roles — which security level can reach which admin section.
// GET/PUT /api/admin-permissions (routes-setup.ts:156-159), NOT under
// /api/config like almost everything else here — matches
// web/config-app/src/api/client.ts:999-1013 exactly (same two endpoints,
// same unwrapped { perms, sections } shape — this handler doesn't use the
// { success, data } envelope most /api/config/* routes do).
export interface AdminSectionPerm {
  key: string;
  label: string;
  defaultMinLevel: number;
}

export async function getAdminPermissions() {
  return request<{ perms: Record<string, number>; sections: AdminSectionPerm[] }>('/api/admin-permissions');
}

export async function setAdminPermissions(perms: Record<string, number>) {
  return request<{ perms: Record<string, number>; sections: AdminSectionPerm[] }>('/api/admin-permissions', {
    method: 'PUT',
    body: JSON.stringify({ perms }),
  });
}

// Operator chat settings
export async function updateOperatorChatConfig(config: Record<string, unknown>) {
  return request<{ success: boolean }>('/api/config/operator-chat', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}
