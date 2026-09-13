/**
 * F10: "No public messages in conference N" while public ones exist.
 *
 * The private filter ran AFTER the SQL `LIMIT n+1`, so a conference whose
 * newest 11 messages happened to be private answered that there were none at
 * all - the public mail was one row further down and never fetched. The page
 * is filled now: the base is walked until there are enough public rows, it
 * runs out, or the scan bound is reached.
 */
import { BOT_recentMessages, BOT_searchMessages } from '../../../src/services/bot-data/messages';

const actor = { secLevel: 30 };

type Row = { id: number; subject: string; author: string; body: string; isprivate?: number };

const priv = (id: number): Row => ({ id, subject: `Secret ${id}`, author: 'ann', body: 'for sysop', isprivate: 1 });
const pub = (id: number): Row => ({ id, subject: `Public ${id}`, author: 'ann', body: 'for the board' });

function dbOver(rows: Row[]) {
  const calls: Array<{ limit?: number; offset?: number; search?: string }> = [];
  return {
    calls,
    db: {
      getMessageBases: async () => [{ id: 1 }],
      getMessages: async (_c: number, _b: number, o: { limit?: number; offset?: number; search?: string } = {}) => {
        calls.push(o);
        const offset = o.offset ?? 0;
        const limit = o.limit ?? rows.length;
        const matching = o.search
          ? rows.filter((r) => r.subject.toLowerCase().includes(o.search!.toLowerCase()))
          : rows;
        return matching.slice(offset, offset + limit);
      },
    } as any,
  };
}

describe('public mail sitting behind a run of private mail', () => {
  it('finds the public messages when the newest eleven are private', async () => {
    const rows = [...Array.from({ length: 11 }, (_, i) => priv(i + 1)), pub(100), pub(101)];
    const { db } = dbOver(rows);
    const r = await BOT_recentMessages(db, actor, 1, 10);
    expect(r.text).toContain('Public 100');
    expect(r.text).toContain('Public 101');
    expect(r.text).not.toContain('Secret');
    expect(r.text).not.toMatch(/No public messages/);
  });

  it('finds a searched message when the newest matches are private', async () => {
    const rows = [
      ...Array.from({ length: 11 }, (_, i) => ({ ...priv(i + 1), subject: `Secret amiga ${i + 1}` })),
      { ...pub(100), subject: 'Public amiga 100' },
    ];
    const { db } = dbOver(rows);
    const r = await BOT_searchMessages(db, actor, 1, 'amiga', 10);
    expect(r.text).toContain('Public amiga 100');
    expect(r.text).not.toContain('Secret');
  });

  it('fills the whole page rather than stopping at the first batch', async () => {
    // Alternating rows: a single LIMIT 11 yields 5 or 6 public ones.
    const rows = Array.from({ length: 60 }, (_, i) => (i % 2 === 0 ? priv(i + 1) : pub(i + 1)));
    const { db } = dbOver(rows);
    const r = await BOT_recentMessages(db, actor, 1, 10);
    const lines = r.text.split('\n').filter((l) => l.startsWith('#'));
    expect(lines).toHaveLength(10);
    expect(r.text).not.toContain('Secret');
  });

  it('stops walking instead of paging a conference of private mail for ever', async () => {
    const rows = Array.from({ length: 5000 }, (_, i) => priv(i + 1));
    const { db, calls } = dbOver(rows);
    const r = await BOT_recentMessages(db, actor, 1, 10);
    expect(r.text).toMatch(/No public messages in conference 1/);
    expect(calls.length).toBeLessThanOrEqual(5);
  });

  it('still says so when the conference really is empty', async () => {
    const { db, calls } = dbOver([]);
    const r = await BOT_recentMessages(db, actor, 1, 10);
    expect(r.text).toMatch(/No public messages in conference 1/);
    expect(calls.length).toBe(1);
  });
});
