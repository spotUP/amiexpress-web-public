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
} from '../../../../packages/terminal/src/utils/session-resume';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null { return this.m.has(k) ? (this.m.get(k) as string) : null; }
  setItem(k: string, v: string): void { this.m.set(k, v); }
  removeItem(k: string): void { this.m.delete(k); }
}

function mem(local: MemStorage = new MemStorage()): ResumeStorage & { localMem: MemStorage } {
  return { local, tab: new MemStorage(), localMem: local };
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
    const local = new MemStorage();
    const a = mem(local);
    const b = mem(local);
    tabId(a, () => 'tab-a');
    tabId(b, () => 'tab-b');
    saveResume(a, { token: T, userId: '7', nodeId: 3 }, 1000);
    saveResume(b, { token: U, userId: '8', nodeId: 4 }, 2000);
    expect(resumeTokenToOffer(a, 3000)).toBe(T);
    expect(resumeTokenToOffer(b, 3000)).toBe(U);
  });

  it('a tab that lost its id offers the newest entry older than 5 s, never a fresh one', () => {
    const local = new MemStorage();
    const a = mem(local);
    tabId(a, () => 'tab-a');
    saveResume(a, { token: T, userId: '7', nodeId: 3 }, 10_000);
    const lost = mem(local); // same localStorage, empty sessionStorage
    expect(resumeTokenToOffer(lost, 12_000)).toBeUndefined();
    expect(resumeTokenToOffer(lost, 16_000)).toBe(T);
    // After the resume succeeds the new tab takes the entry over.
    tabId(lost, () => 'tab-new');
    saveResume(lost, { token: U, userId: '7', nodeId: 3 }, 17_000);
    expect(Object.keys(JSON.parse(local.getItem(RESUME_KEY) as string))).toEqual(['tab-new']);
    expect(resumeTokenToOffer(lost, 18_000)).toBe(U);
  });

  it('a tab that has an id but no entry offers nothing', () => {
    const local = new MemStorage();
    const a = mem(local);
    tabId(a, () => 'tab-a');
    saveResume(a, { token: T, userId: '7', nodeId: 3 }, 0);
    const b = mem(local);
    tabId(b, () => 'tab-b');
    expect(resumeTokenToOffer(b, 60_000)).toBeUndefined();
  });

  it('clearing a tab leaves the other tab alone', () => {
    const local = new MemStorage();
    const a = mem(local);
    const b = mem(local);
    tabId(a, () => 'tab-a');
    tabId(b, () => 'tab-b');
    saveResume(a, { token: T, userId: '7', nodeId: 3 }, 0);
    saveResume(b, { token: U, userId: '8', nodeId: 4 }, 0);
    clearResume(a);
    expect(resumeTokenToOffer(a, 1000)).toBeUndefined();
    expect(resumeTokenToOffer(b, 1000)).toBe(U);
  });

  it('drops entries older than the keep time', () => {
    const local = new MemStorage();
    const a = mem(local);
    const b = mem(local);
    tabId(a, () => 'tab-a');
    tabId(b, () => 'tab-b');
    saveResume(a, { token: T, userId: '7', nodeId: 3 }, 0);
    expect(resumeTokenToOffer(a, RESUME_KEEP_MS + 1)).toBeUndefined();
    saveResume(b, { token: U, userId: '8', nodeId: 4 }, RESUME_KEEP_MS + 1);
    expect(Object.keys(JSON.parse(local.getItem(RESUME_KEY) as string))).toEqual(['tab-b']);
  });

  it('survives junk in localStorage', () => {
    for (const junk of ['{not json', '[]', 'null', '42', JSON.stringify({ x: { token: 5 } })]) {
      const s = mem();
      s.tab.setItem(TAB_ID_KEY, 'x');
      s.local.setItem(RESUME_KEY, junk);
      expect(resumeTokenToOffer(s, 0)).toBeUndefined();
      expect(() => clearResume(s)).not.toThrow();
      saveResume(s, { token: T, userId: '7', nodeId: 3 }, 0);
      expect(resumeTokenToOffer(s, 1)).toBe(T);
    }
  });
});

describe('connectOptions', () => {
  it('auth hands the CURRENT token on each connect', () => {
    const s = mem();
    tabId(s, () => 'tab-a');
    let now = 0;
    const opts = connectOptions(false, () => resumeTokenToOffer(s, now));
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
