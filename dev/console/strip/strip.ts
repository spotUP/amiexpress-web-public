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
