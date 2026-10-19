/**
 * The web terminal offers its resume token on every connect, for as long as
 * the BOARD keeps the session parked.
 *
 * Before this, the browser gave up on its own after two minutes
 * (`getStoredSessionState`'s age gate), so a phone locked for three minutes
 * came back to a login prompt although the board was still holding the call.
 * The board decides validity now; the browser only keeps one entry per tab.
 *
 * packages/terminal has no CI job, so this is pinned from the backend suite
 * like reconnect-policy.test.ts.
 */
import {
  RESUME_KEY,
  TAB_ID_KEY,
  RESUME_KEEP_MS,
  type ResumeStorage,
  tabId,
  saveResume,
  resumeTokenToOffer,
  clearResume,
  connectOptions,
  resumeFailedText,
  takeResumeOffer,
  forgetRefusedOffer,
  guardTabId,
  type TabIdChannel,
} from '../../../../packages/terminal/src/utils/session-resume';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null { return this.m.has(k) ? (this.m.get(k) as string) : null; }
  setItem(k: string, v: string): void { this.m.set(k, v); }
  removeItem(k: string): void { this.m.delete(k); }
}

/** One tab's sessionStorage, the only place a resume entry lives. */
function mem(): ResumeStorage & { tab: MemStorage } {
  return { tab: new MemStorage() };
}

const T = 'T'.repeat(43);
const U = 'U'.repeat(43);

describe('session-resume storage', () => {
  it('a session saved more than 2 minutes before the drop is still offered', () => {
    const s = mem();
    saveResume(s, { token: T, userId: '7', nodeId: 3 }, 0);
    expect(resumeTokenToOffer(s, 3 * 60_000)).toBe(T);
  });

  it('each tab offers its own token', () => {
    const a = mem();
    const b = mem();
    tabId(a, () => 'tab-a');
    tabId(b, () => 'tab-b');
    saveResume(a, { token: T, userId: '7', nodeId: 3 }, 1000);
    saveResume(b, { token: U, userId: '8', nodeId: 4 }, 2000);
    expect(resumeTokenToOffer(a, 3000)).toBe(T);
    expect(resumeTokenToOffer(b, 3000)).toBe(U);
  });

  it('an entry copied from another tab id is never offered, and the next save drops it', () => {
    const s = mem();
    s.tab.setItem(RESUME_KEY, JSON.stringify({ 'tab-a': { token: T, userId: '7', nodeId: 3, savedAt: 0 } }));
    tabId(s, () => 'tab-b');
    expect(resumeTokenToOffer(s, 1000)).toBeUndefined();
    saveResume(s, { token: U, userId: '7', nodeId: 3 }, 2000);
    expect(Object.keys(JSON.parse(s.tab.getItem(RESUME_KEY) as string))).toEqual(['tab-b']);
    expect(resumeTokenToOffer(s, 3000)).toBe(U);
  });

  it('clearing a tab leaves the other tab alone', () => {
    const a = mem();
    const b = mem();
    tabId(a, () => 'tab-a');
    tabId(b, () => 'tab-b');
    saveResume(a, { token: T, userId: '7', nodeId: 3 }, 0);
    saveResume(b, { token: U, userId: '8', nodeId: 4 }, 0);
    clearResume(a);
    expect(resumeTokenToOffer(a, 1000)).toBeUndefined();
    expect(resumeTokenToOffer(b, 1000)).toBe(U);
  });

  it('drops entries older than the keep time', () => {
    const a = mem();
    tabId(a, () => 'tab-a');
    saveResume(a, { token: T, userId: '7', nodeId: 3 }, 0);
    expect(resumeTokenToOffer(a, RESUME_KEEP_MS + 1)).toBeUndefined();
  });

  it('survives junk in sessionStorage', () => {
    for (const junk of ['{not json', '[]', 'null', '42', JSON.stringify({ x: { token: 5 } })]) {
      const s = mem();
      s.tab.setItem(TAB_ID_KEY, 'x');
      s.tab.setItem(RESUME_KEY, junk);
      expect(resumeTokenToOffer(s, 0)).toBeUndefined();
      expect(() => clearResume(s)).not.toThrow();
      saveResume(s, { token: T, userId: '7', nodeId: 3 }, 0);
      expect(resumeTokenToOffer(s, 1)).toBe(T);
    }
  });
});

describe('saving the login-success payload', () => {
  it('a payload with a token and a nodeId is offered on the next connect', () => {
    const s = mem();
    const data = { resumeToken: T, nodeId: 3, user: { id: '7' } };
    saveResume(s, { token: data.resumeToken, userId: String(data.user.id), nodeId: Number(data.nodeId) }, 0);
    expect(takeResumeOffer(s, true, 1000)).toEqual({ resume: T });
  });

  it('a payload with no nodeId warns and stores nothing', () => {
    const s = mem();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const data: { resumeToken: string; nodeId?: number } = { resumeToken: T };
    saveResume(s, { token: data.resumeToken, userId: '7', nodeId: Number(data.nodeId) }, 0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('nodeId'));
    expect(s.tab.getItem(RESUME_KEY)).toBeNull();
    warn.mockRestore();
  });
});

// Decision 7's claim of another tab's entry was removed on 2026-10-19: a new
// tab took a parked session with no name and no password. A parked session
// is reached by a name and password logon, which asks resume-or-end (S9/S15).
describe('the offer is only ever this tab\'s own entry', () => {
  it('a tab offers its own token; a new tab, or another tab id, offers nothing', () => {
    const a = mem();
    tabId(a, () => 'tab-a');
    saveResume(a, { token: T, userId: '7', nodeId: 3 }, 0);
    expect(takeResumeOffer(a, true, 10_000)).toEqual({ resume: T });
    const fresh = mem();
    expect(takeResumeOffer(fresh, true, 10_000)).toBeUndefined();
    const other = mem();
    tabId(other, () => 'tab-b');
    expect(takeResumeOffer(other, true, 10_000)).toBeUndefined();
    expect(resumeTokenToOffer(a, 10_000)).toBe(T);
  });

  it('a tab whose id is not yet confirmed as its own offers nothing', () => {
    const s = mem();
    tabId(s, () => 'tab-a');
    saveResume(s, { token: T, userId: '7', nodeId: 3 }, 0);
    expect(takeResumeOffer(s, false, 1000)).toBeUndefined();
    expect(takeResumeOffer(s, true, 1000)).toEqual({ resume: T });
  });

  it('a refused own offer is forgotten, so the next connect offers nothing; another tab keeps its entry', () => {
    const a = mem();
    tabId(a, () => 'tab-a');
    saveResume(a, { token: T, userId: '7', nodeId: 3 }, 0);
    const b = mem();
    tabId(b, () => 'tab-b');
    saveResume(b, { token: U, userId: '8', nodeId: 4 }, 0);
    expect(takeResumeOffer(b, true, 10_000)).toEqual({ resume: U });
    forgetRefusedOffer(b);
    expect(takeResumeOffer(b, true, 11_000)).toBeUndefined();
    expect(resumeTokenToOffer(a, 11_000)).toBe(T);
  });
});

/** Two ends of one BroadcastChannel name, delivering to every OTHER end, as the browser does. */
function channelHub() {
  const ends: Array<{ listeners: Array<(ev: { data: unknown }) => void>; closed: boolean }> = [];
  return (): TabIdChannel => {
    const me = { listeners: [] as Array<(ev: { data: unknown }) => void>, closed: false };
    ends.push(me);
    return {
      postMessage(data: unknown) {
        for (const e of ends) if (e !== me && !e.closed) e.listeners.forEach((l) => l({ data }));
      },
      addEventListener(_t: 'message', l: (ev: { data: unknown }) => void) { me.listeners.push(l); },
      close() { me.closed = true; },
    };
  };
}

describe('guardTabId (Duplicate Tab copies sessionStorage)', () => {
  const never = () => undefined;

  it('a duplicated tab finds the first tab holds its id and mints its own', () => {
    const hub = channelHub();
    const first = mem();
    tabId(first, () => 'tab-a');
    saveResume(first, { token: T, userId: '7', nodeId: 3 }, 0);
    guardTabId(first, hub(), { schedule: never });
    const copy = mem();
    copy.tab.setItem(TAB_ID_KEY, 'tab-a'); // what Duplicate Tab copies
    copy.tab.setItem(RESUME_KEY, first.tab.getItem(RESUME_KEY) as string); // the token too
    const g = guardTabId(copy, hub(), { schedule: never, newId: () => 'tab-b' });
    expect(copy.tab.getItem(TAB_ID_KEY)).toBe('tab-b');
    expect(first.tab.getItem(TAB_ID_KEY)).toBe('tab-a');
    expect(g.confirmed()).toBe(true);
    expect(takeResumeOffer(copy, g.confirmed(), 1000)).toBeUndefined();
    expect(takeResumeOffer(first, true, 1000)).toEqual({ resume: T });
  });

  it('a reloaded tab nobody answers keeps its id, and is confirmed when the wait ends', () => {
    const hub = channelHub();
    const s = mem();
    tabId(s, () => 'tab-a');
    let fire: () => void = () => {};
    const g = guardTabId(s, hub(), { schedule: (fn) => { fire = fn; } });
    expect(g.confirmed()).toBe(false);
    fire();
    expect(g.confirmed()).toBe(true);
    expect(s.tab.getItem(TAB_ID_KEY)).toBe('tab-a');
  });

  it('a reloaded tab connects only after the guard settles, and then offers its own token', async () => {
    const hub = channelHub();
    const s = mem();
    tabId(s, () => 'tab-a');
    saveResume(s, { token: T, userId: '7', nodeId: 3 }, 0);
    let fire: () => void = () => {};
    const g = guardTabId(s, hub(), { schedule: (fn) => { fire = fn; } });
    // What BBSTerminal does: connect, and so build the offer, only when settled.
    const offers: Array<ReturnType<typeof takeResumeOffer>> = [];
    void g.settled.then(() => { offers.push(takeResumeOffer(s, g.confirmed(), 1000)); });
    await Promise.resolve();
    expect(offers).toEqual([]);
    fire();
    await g.settled;
    await Promise.resolve();
    expect(offers).toEqual([{ resume: T }]);
  });

  it('without BroadcastChannel the id is taken as this tab\'s own', () => {
    const s = mem();
    tabId(s, () => 'tab-a');
    expect(guardTabId(s, undefined).confirmed()).toBe(true);
    expect(s.tab.getItem(TAB_ID_KEY)).toBe('tab-a');
  });
});

describe('connectOptions', () => {
  it('auth hands the CURRENT token on each connect', () => {
    const s = mem();
    tabId(s, () => 'tab-a');
    let now = 0;
    const opts = connectOptions(false, () => takeResumeOffer(s, true, now));
    const seen: Array<{ resume?: string }> = [];
    opts.auth((d) => seen.push(d));
    saveResume(s, { token: T, userId: '7', nodeId: 3 }, 0);
    now = 1000;
    opts.auth((d) => seen.push(d));
    saveResume(s, { token: U, userId: '7', nodeId: 3 }, 2000);
    now = 3000;
    opts.auth((d) => seen.push(d));
    expect(seen).toEqual([{}, { resume: T }, { resume: U }]);
    expect(opts.reconnectionAttempts).toBe(Infinity);
    expect(opts.transports).toEqual(['websocket', 'polling']);
  });
});

describe('resumeFailedText', () => {
  it('names each refusal in full English', () => {
    expect(resumeFailedText({ reason: 'unknown' })).toMatch(/has ended/);
    expect(resumeFailedText({ reason: 'ended' })).toMatch(/has ended/);
    expect(resumeFailedText({ reason: 'expired' })).toMatch(/waited longer/);
    expect(resumeFailedText({ reason: 'account' })).toMatch(/this account/);
  });
});
