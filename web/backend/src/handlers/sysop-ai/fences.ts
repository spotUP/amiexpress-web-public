/**
 * THE FENCES - who may call which tool. Code, not prompt.
 *
 * K3 of thoughts/shared/plans/2026-09-08-ai-sysop-knowledge.md. A caller can
 * talk a model into anything; a model's arguments are inputs, never
 * authority. Every tool is checked here against the caller's REAL session
 * before it runs, and the tiers are the caller's own security level - the AI
 * is the co-sysop persona, the powers it wields are the caller's.
 *
 *   caller   - anyone in a chat: lookups, and actions on their own session
 *   cosysop  - level 100-254: bounded sysop-grade actions (K3b)
 *   sysop    - level 255: the admin surface, two-step on writes (K3c)
 */
import type { BBSSession } from '../../index';

export type Tier = 'caller' | 'cosysop' | 'sysop';

export const COSYSOP_LEVEL = 100;
export const SYSOP_LEVEL = 255;

export function tierOf(session: Pick<BBSSession, 'user'>): Tier {
  const level = session.user?.secLevel ?? 0;
  if (level >= SYSOP_LEVEL) return 'sysop';
  if (level >= COSYSOP_LEVEL) return 'cosysop';
  return 'caller';
}

const RANK: Record<Tier, number> = { caller: 0, cosysop: 1, sysop: 2 };

/** May a caller of `have` use a tool that needs `need`? */
export function tierAllows(have: Tier, need: Tier): boolean {
  return RANK[have] >= RANK[need];
}

/**
 * Per-caller, per-day counters for the capped actions (grant_time). Kept in
 * memory: a restart resets them, which errs on the caller's side by at most
 * one cap, and the CallersLog has the truth.
 */
const counters = new Map<string, { day: string; used: number }>();

function today(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** How much of `cap` a caller has left today for `what`. */
export function remainingToday(userId: string, what: string, cap: number, now = new Date()): number {
  const c = counters.get(`${what}:${userId}`);
  if (!c || c.day !== today(now)) return cap;
  return Math.max(0, cap - c.used);
}

/** Spend `amount` of today's cap; returns what was actually granted (never past the cap). */
export function spendToday(userId: string, what: string, cap: number, amount: number, now = new Date()): number {
  const key = `${what}:${userId}`;
  const c = counters.get(key);
  const used = c && c.day === today(now) ? c.used : 0;
  const granted = Math.max(0, Math.min(amount, cap - used));
  counters.set(key, { day: today(now), used: used + granted });
  return granted;
}

/** Test seam. */
export function resetFences(): void {
  counters.clear();
}
