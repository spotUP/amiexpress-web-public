import { spawn } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';

/**
 * Bot plugin registry + supervision (bot plugin Phase 1).
 *
 * A plugin is a directory under bots/ carrying a bot.json manifest. This
 * service scans manifests, reports compose service state, tails logs, runs
 * start/stop/restart, and reads/writes the plugin's env file. Unknown or
 * absent manifest = not installed; the admin UI hides those bots.
 *
 * Docker is driven by allowlist only: the service name always comes from a
 * manifest on disk, never from request input, and every call has a timeout
 * with captured output. Where compose is absent (dev checkout without
 * docker), state is `unmanaged` and actions explain instead of failing
 * obscurely.
 */

export interface PluginConfigField {
  key: string;
  label: string;
  secret?: boolean;
  default?: string;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  composeService: string;
  healthPort: number;
  healthPath: string;
  nav: { path: string; label: string; icon: string; minLevel: number };
  configSchema: PluginConfigField[];
}

export type PluginState = 'running' | 'stopped' | 'unmanaged' | 'unknown';

export interface PluginStatus {
  id: string;
  installed: boolean;
  state: PluginState;
  detail?: string;
  botHealth?: any;
}

export interface ComposeRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

function bbsRoot(): string {
  return process.env.BBS_DATA_DIR || path.resolve(__dirname, '../../../..');
}

function botsDir(): string {
  // Manifests ship with the image (bots/ is COPYd), so they resolve from
  // the backend CODE tree in every environment - never from the data
  // volume. PLUGIN_BOTS_DIR is the test seam: a fixture bots/ tree.
  if (process.env.PLUGIN_BOTS_DIR) return process.env.PLUGIN_BOTS_DIR;
  return path.join(path.resolve(__dirname, '../../../..'), 'bots');
}

function dataDir(): string {
  // Plugin env files live on the SHARED volume both backend and sidecars
  // see: <volume>/bots in prod (BBS_DATA_DIR is <volume>/bbs),
  // ./data/bots in a dev checkout. The bot reads the same path
  // (BOT_ENV_FILE default), so admin writes and bot boots never disagree.
  if (process.env.PLUGIN_DATA_DIR) return process.env.PLUGIN_DATA_DIR;
  const bbsData = process.env.BBS_DATA_DIR;
  if (bbsData && path.basename(bbsData) === 'bbs') {
    return path.join(path.dirname(bbsData), 'bots');
  }
  return path.join(bbsRoot(), 'data', 'bots');
}

function isValidManifest(raw: any): raw is PluginManifest {
  return (
    !!raw &&
    typeof raw.id === 'string' && /^[a-z0-9-]+$/.test(raw.id) &&
    typeof raw.composeService === 'string' && /^[a-z0-9-]+$/.test(raw.composeService) &&
    typeof raw.healthPort === 'number' &&
    typeof raw.healthPath === 'string' &&
    Array.isArray(raw.configSchema)
  );
}

export function listPlugins(): PluginManifest[] {
  const dir = botsDir();
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
  const out: PluginManifest[] = [];
  for (const name of entries) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, name, 'bot.json'), 'utf8'));
      if (isValidManifest(raw)) out.push(raw);
    } catch {
      // No/invalid manifest = not a plugin. Skip silently.
    }
  }
  return out;
}

export function getPlugin(id: string): PluginManifest | null {
  if (!/^[a-z0-9-]+$/.test(id)) return null;
  return listPlugins().find((p) => p.id === id) ?? null;
}

/** Injectable compose runner. Default shells `docker compose` in the BBS root. */
export type ComposeRunner = (
  args: string[],
  opts: { timeoutMs: number }
) => Promise<ComposeRunResult>;

export function defaultComposeRunner(args: string[], opts: { timeoutMs: number }): Promise<ComposeRunResult> {
  return new Promise((resolve) => {
    const child = spawn('docker', ['compose', ...args], { cwd: bbsRoot() });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
    }, opts.timeoutMs);
    child.stdout?.on('data', (c) => { stdout += String(c); });
    child.stderr?.on('data', (c) => { stderr += String(c); });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ exitCode: null, stdout, stderr: `${stderr}\nspawn failed: ${(err as Error).message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr });
    });
  });
}

async function composeAvailable(run: ComposeRunner): Promise<boolean> {
  try {
    const probe = await run(['version', '--format', '{{.Version}}'], { timeoutMs: 10000 });
    if (probe.exitCode !== 0) return false;
    try {
      fs.accessSync(path.join(bbsRoot(), 'docker-compose.yml'));
      return true;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

export async function pluginState(
  manifest: PluginManifest,
  run?: ComposeRunner
): Promise<{ state: PluginState; detail?: string }> {
  const runner = run ?? defaultComposeRunner;
  if (!(await composeAvailable(runner))) {
    return { state: 'unmanaged', detail: 'Docker compose is not available here; manage the bot process directly.' };
  }
  const ps = await runner(['ps', '--format', 'json', manifest.composeService], { timeoutMs: 15000 });
  if (ps.exitCode !== 0) {
    return { state: 'unknown', detail: tail(ps.stderr, 300) || 'docker compose ps failed' };
  }
  const rows = parsePsJson(ps.stdout);
  if (rows.length === 0) {
    return { state: 'stopped', detail: 'No container for this service.' };
  }
  const states = new Set(rows.map((r) => String(r.State || r.state || '').toLowerCase()));
  const healths = new Set(rows.map((r) => String(r.Health || r.health || '').toLowerCase()).filter(Boolean));
  if (healths.has('unhealthy')) return { state: 'unknown', detail: 'Container reports unhealthy.' };
  if (states.has('running')) return { state: 'running' };
  return { state: 'stopped', detail: [...states].join(', ') || 'Not running.' };
}

function parsePsJson(stdout: string): any[] {
  const rows: any[] = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim().replace(/^"|"$/g, '').replace(/\\"/g, '"');
    if (!trimmed.startsWith('{')) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      // A second format some versions print: a single JSON array.
    }
  }
  if (rows.length === 0) {
    try {
      const parsed = JSON.parse(stdout);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Not JSON at all.
    }
  }
  return rows;
}

function tail(text: string, max: number): string {
  return text.length > max ? text.slice(-max) : text;
}

export type PluginAction = 'start' | 'stop' | 'restart';

const ACTION_ARGS: Record<PluginAction, (service: string) => string[]> = {
  start: (s) => ['up', '-d', s],
  stop: (s) => ['stop', s],
  restart: (s) => ['restart', s],
};

export async function pluginAction(
  manifest: PluginManifest,
  action: PluginAction,
  run?: ComposeRunner
): Promise<{ ok: boolean; message: string }> {
  const runner = run ?? defaultComposeRunner;
  if (!(await composeAvailable(runner))) {
    return { ok: false, message: 'Docker compose is not available here; manage the bot process directly.' };
  }
  const result = await runner(ACTION_ARGS[action](manifest.composeService), { timeoutMs: 180000 });
  if (result.exitCode === 0) {
    return { ok: true, message: `${action} accepted for ${manifest.composeService}` };
  }
  return { ok: false, message: tail(result.stderr || result.stdout || 'command failed', 500) };
}

export async function pluginLogs(
  manifest: PluginManifest,
  lines: number,
  search: string | undefined,
  run?: ComposeRunner
): Promise<{ lines: string[]; totalShown: number }> {
  const runner = run ?? defaultComposeRunner;
  const capped = Math.min(Math.max(lines || 200, 1), 5000);
  const result = await runner(['logs', '--no-color', '--tail', String(capped), manifest.composeService], { timeoutMs: 30000 });
  let out = (result.stdout || '').split('\n');
  if (out.length > 0 && out[out.length - 1] === '') out.pop();
  if (search) {
    const needle = search.toLowerCase();
    out = out.filter((l) => l.toLowerCase().includes(needle));
  }
  return { lines: out, totalShown: out.length };
}

function pluginEnvFile(manifest: PluginManifest): string {
  return path.join(dataDir(), `${manifest.id}.env`);
}

export function readPluginConfig(manifest: PluginManifest): Array<{ key: string; label: string; secret: boolean; value: string; set: boolean }> {
  const stored = parseEnvFile(pluginEnvFile(manifest));
  return manifest.configSchema.map((f) => {
    const raw = stored[f.key];
    return {
      key: f.key,
      label: f.label,
      secret: !!f.secret,
      value: f.secret ? '' : (raw ?? f.default ?? ''),
      set: raw !== undefined,
    };
  });
}

/** Secrets are write-only from the UI's perspective: stored, never echoed. */
export function writePluginConfig(manifest: PluginManifest, values: Record<string, string>): void {
  const file = pluginEnvFile(manifest);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Merge over the stored file: the form only sends touched fields, and an
  // empty string means "leave the stored value alone", never "erase it".
  // There is deliberately no way to unset a key from the UI - secrets stay
  // put unless replaced.
  const stored = parseEnvFile(file);
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string' && value.length > 0) stored[key] = value;
  }
  const keys = manifest.configSchema.map((f) => f.key);
  const lines = keys
    .filter((k) => stored[k] !== undefined && stored[k].length > 0)
    .map((k) => `${k}=${stored[k]}`);
  fs.writeFileSync(file, lines.length > 0 ? lines.join('\n') + '\n' : '', { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Filesystem may not support modes; content is already written.
  }
}

function parseEnvFile(file: string): Record<string, string> {
  let raw = '';
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return {};
  }
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

/**
 * A bot's /health answer is a small JSON object. Anything bigger is not one,
 * and reading it into a string would be the bot deciding how much memory the
 * board spends.
 */
export const HEALTH_BODY_CAP_BYTES = 64 * 1024;

/**
 * Probe the bot's own /health (compose DNS name, localhost fallback).
 *
 * BOUNDED IN BOTH DIRECTIONS. `raw += c` used to accumulate whatever the bot
 * sent, with no cap; and http's own `timeout` option is SOCKET-IDLE time, not
 * total time, so a bot dribbling one byte a second held the probe - and the
 * admin's bot page - open for ever. The cap and the deadline below are what
 * make this call finish.
 */
export function probeBotHealth(manifest: PluginManifest, timeoutMs = 3000): Promise<any | null> {
  const hosts = [manifest.composeService, 'localhost'];
  const tryHost = (host: string): Promise<any | null> =>
    new Promise((resolve) => {
      let settled = false;
      let deadline: NodeJS.Timeout | null = null;
      const finish = (value: any | null): void => {
        if (settled) return;
        settled = true;
        if (deadline) clearTimeout(deadline);
        resolve(value);
      };
      const req = http.get(
        { host, port: manifest.healthPort, path: manifest.healthPath || '/health', timeout: timeoutMs },
        (res) => {
          let raw = '';
          res.on('data', (c) => {
            if (settled) return;
            raw += c;
            if (raw.length > HEALTH_BODY_CAP_BYTES) {
              req.destroy();
              finish(null);
            }
          });
          res.on('end', () => {
            try {
              finish(res.statusCode === 200 ? JSON.parse(raw) : null);
            } catch {
              finish(null);
            }
          });
        }
      );
      // The TOTAL time this probe may take, whatever the socket is doing.
      deadline = setTimeout(() => { req.destroy(); finish(null); }, timeoutMs);
      deadline.unref?.();
      req.once('error', () => finish(null));
      req.once('timeout', () => { req.destroy(); finish(null); });
    });
  return (async () => {
    for (const host of hosts) {
      const hit = await tryHost(host);
      if (hit) return hit;
    }
    return null;
  })();
}
