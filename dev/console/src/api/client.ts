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

// Security
export async function getSecurity(level: number) {
  return requestList<import('./types.js').SecurityRow>(`/api/config/security/${level}`);
}

export async function createSecurity(row: Partial<import('./types.js').SecurityRow>) {
  return request<{ success: boolean; data: import('./types.js').SecurityRow }>('/api/config/security', {
    method: 'POST', body: JSON.stringify(row),
  });
}

export async function updateSecurity(id: number, patch: Partial<import('./types.js').SecurityRow>) {
  return request<{ success: boolean; data: import('./types.js').SecurityRow }>(`/api/config/security/${id}`, {
    method: 'PUT', body: JSON.stringify(patch),
  });
}

export async function deleteSecurity(id: number) {
  return request<{ success: boolean }>(`/api/config/security/${id}`, { method: 'DELETE' });
}

// ───── Phase D: Door install, Import/Export, Batch editor, Global wall ──

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

export interface GlobalWallComment {
  id: string | number;
  username?: string;       // canonical
  userName?: string;       // backend uses this
  message: string;         // canonical
  comment?: string;        // backend uses this
  timestamp?: string;      // canonical
  createdDate?: string;    // backend uses this
  source?: string;
  bbsshortcode?: string;
  hidden?: boolean;
}

export async function getGlobalWallComments(page = 1, limit = 50) {
  // Backend returns a bare array for this endpoint, not { success, data }.
  const res = await request<GlobalWallComment[] | { success: boolean; data: GlobalWallComment[] }>(`/api/globalwall/comments?page=${page}&limit=${limit}`);
  return Array.isArray(res) ? res : (res.data ?? []);
}

export async function updateGlobalWallComment(id: string, patch: Partial<GlobalWallComment>) {
  return request<{ success: boolean }>(`/api/globalwall/comments/${id}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export async function deleteGlobalWallComment(id: string) {
  return request<{ success: boolean }>(`/api/globalwall/comments/${id}`, { method: 'DELETE' });
}

// ───── Phase E: Deployment, Info Files, AmiXnet, Op Chat Settings ──

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

// Operator chat settings
export async function updateOperatorChatConfig(config: Record<string, unknown>) {
  return request<{ success: boolean }>('/api/config/operator-chat', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}
