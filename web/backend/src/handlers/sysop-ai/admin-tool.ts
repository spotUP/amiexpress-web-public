/**
 * THE SYSOP'S TOOL - the whole admin surface, as the sysop, two-step on writes.
 *
 * K3c of thoughts/shared/plans/2026-09-08-ai-sysop-knowledge.md. "for sysops
 * he should do anything - a powerful tool for managing the bbs" (sysop,
 * 2026-09-08). Rather than a hundred hand-written tools, one tool calls the
 * admin app's own REST surface - the endpoints the web admin and the TUI
 * call - over loopback, with a JWT minted for the caller's own account. That
 * account is level 255 or the tool is not offered at all (fences.ts); the
 * API's own `authenticateToken` and `requireSysop` stand behind that.
 *
 * GET runs at once. PUT, POST and DELETE are HELD: the tool answers with
 * exactly what it would call, the model tells the sysop, and only a line
 * that is just `yes` from the sysop runs it (confirmPendingAdmin, called by
 * the chat before the model sees the line). The model cannot skip that step:
 * the check is here, not in the prompt.
 */
import axios from 'axios';
import type { ChatSession } from '../../types/operator-chat.types';
import { SYSOP_LEVEL } from './fences';
import type { SysopTool, ToolContext } from './tools';
import { auditToolCall } from './audit';

export type AdminMethod = 'GET' | 'PUT' | 'POST' | 'DELETE';

export interface PendingAdminCall {
  method: Exclude<AdminMethod, 'GET'>;
  path: string;
  body?: unknown;
  heldAt: number;
}

/** Where the admin API lives: this process, on its own port. Injectable. */
export interface AdminTransport {
  request(method: AdminMethod, path: string, body: unknown, token: string): Promise<{ status: number; data: unknown }>;
}

const ADMIN_PREFIX = '/api/config';
const CALL_TIMEOUT_MS = 8000;
const REPLY_MAX_CHARS = 2500;

function boardPort(): number {
  const env = parseInt(process.env.PORT || '', 10);
  if (Number.isFinite(env)) return env;
  try {
    const { config } = require('../../config');
    return Number(config.get('port')) || 3001;
  } catch { return 3001; }
}

export const loopbackTransport: AdminTransport = {
  async request(method, path, body, token) {
    const res = await axios.request({
      method, url: `http://127.0.0.1:${boardPort()}${path}`, data: body,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: CALL_TIMEOUT_MS, validateStatus: () => true,
    });
    return { status: res.status, data: res.data };
  },
};
let transport: AdminTransport = loopbackTransport;
/** Test seam. */
export function setAdminTransport(t: AdminTransport | null): void { transport = t ?? loopbackTransport; }

/** A path is under the admin prefix, absolute, with no way out. */
export function adminPathOk(path: string): boolean {
  return typeof path === 'string' && path.startsWith(ADMIN_PREFIX) && !path.includes('..') && !/[\s\x00-\x1f]/.test(path) && path.length < 400;
}

function summarise(data: unknown): string {
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  return text.length > REPLY_MAX_CHARS ? text.slice(0, REPLY_MAX_CHARS) + ' ...(cut)' : text;
}

async function tokenFor(ctx: ToolContext): Promise<string> {
  const mint = (ctx.db as any)?.generateAccessToken;
  if (typeof mint !== 'function') throw new Error('the board cannot mint an admin token right now');
  return mint.call(ctx.db, ctx.session.user);
}

async function call(ctx: ToolContext, method: AdminMethod, path: string, body: unknown): Promise<string> {
  const token = await tokenFor(ctx);
  const res = await transport.request(method, path, body, token);
  return `HTTP ${res.status}: ${summarise(res.data)}`;
}

export const ADMIN_TOOL: SysopTool = {
  name: 'admin',
  description:
    "Call the board's admin API as the sysop (level 255 only). Paths are under /api/config: " +
    "/system, /nodes, /nodes/{n}, /conferences, /conferences/{id}, /doors, /doors/{command}/settings, /users, /users/{id}, " +
    "/security/levels, /screen-types, /languages, /operator-chat, /logs, /health. GET runs at once. " +
    "PUT/POST/DELETE are HELD until the sysop types exactly 'yes' in the chat - tell them the call you are holding.",
  parameters: {
    type: 'object',
    properties: {
      method: { type: 'string', enum: ['GET', 'PUT', 'POST', 'DELETE'] },
      path: { type: 'string', description: 'absolute path under /api/config' },
      body: { type: 'object', description: 'JSON body for PUT/POST' },
    },
    required: ['method', 'path'],
    additionalProperties: false,
  },
  tier: 'sysop',
  async run(ctx, args) {
    if ((ctx.session.user?.secLevel ?? 0) < SYSOP_LEVEL) return { content: 'The admin tool is the sysop\'s alone.' };
    const method = String(args.method ?? '').toUpperCase() as AdminMethod;
    const path = String(args.path ?? '');
    if (!['GET', 'PUT', 'POST', 'DELETE'].includes(method)) return { content: 'method must be GET, PUT, POST or DELETE.' };
    if (!adminPathOk(path)) return { content: `The path must be under ${ADMIN_PREFIX}.` };
    if (method === 'GET') {
      try { return { content: await call(ctx, 'GET', path, undefined) }; }
      catch (err) { return { content: `GET ${path} failed: ${(err as Error).message}` }; }
    }
    const pending: PendingAdminCall = { method, path, body: args.body, heldAt: Date.now() };
    (ctx.chatSession as any).pendingAdmin = pending;
    return {
      content: `HELD, not run: ${method} ${path}${args.body ? ' ' + JSON.stringify(args.body).slice(0, 600) : ''}. ` +
        'Tell the sysop exactly this, and that typing "yes" on its own line runs it; anything else cancels it.',
    };
  },
};

/**
 * The sysop's next line, before the model sees it. `yes` runs the held
 * call; anything else cancels it. Returns the co-sysop's line to type, or
 * null when there was nothing held.
 */
export async function confirmPendingAdmin(ctx: ToolContext, line: string): Promise<string | null> {
  const cs = ctx.chatSession as ChatSession & { pendingAdmin?: PendingAdminCall };
  const pending = cs.pendingAdmin;
  if (!pending) return null;
  delete cs.pendingAdmin;
  const audit = (outcome: 'ok' | 'refused' | 'error', summary: string) => auditToolCall(ctx.io, {
    pageId: ctx.page.id, userId: String(ctx.session.user?.id ?? ''), username: ctx.session.user?.username ?? '?',
    nodeId: ctx.session.nodeId ?? 0, tool: 'admin', args: pending, outcome, summary,
  });
  if (!/^\s*yes\s*$/i.test(line)) {
    await audit('refused', 'cancelled by the sysop');
    return `Cancelled: ${pending.method} ${pending.path} was not run.`;
  }
  if ((ctx.session.user?.secLevel ?? 0) < SYSOP_LEVEL) {
    await audit('refused', 'not the sysop');
    return 'Only the sysop confirms admin calls.';
  }
  try {
    const result = await call(ctx, pending.method, pending.path, pending.body);
    await audit('ok', result);
    return `Done: ${pending.method} ${pending.path} -> ${result}`;
  } catch (err) {
    await audit('error', (err as Error).message);
    return `${pending.method} ${pending.path} failed: ${(err as Error).message}`;
  }
}
