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
