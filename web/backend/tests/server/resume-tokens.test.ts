import { issueResumeToken, lookupResumeToken, setResumeExpiry, revokeResumeToken, tokenFingerprint, _resetResumeTokensForTests, _setRefFactoryForTests, sweepResumeTokens, resumeTokenCount, issueResumeTokenForLogin } from '../../src/server/resume-tokens';

beforeEach(() => { _setRefFactoryForTests(null); _resetResumeTokensForTests(); });

describe('a resume token opens only its own parked session', () => {
  it('is 256 bits of base64url and finds its session', () => {
    const s = {}; const t = issueResumeToken(s, '7', 3);
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const r = lookupResumeToken(t);
    expect(r.ok && r.bound.session).toBe(s);
    expect(r.ok && r.bound.userId).toBe('7');
    expect(r.ok && r.bound.nodeId).toBe(3);
  });
  it('refuses an expired token', () => {
    const s = {}; const t = issueResumeToken(s, '7', 3);
    setResumeExpiry(s, 1000);
    expect(lookupResumeToken(t, 1001)).toEqual({ ok: false, reason: 'expired' });
  });
  it('refuses the token a fresh issue replaced, and accepts the new one', () => {
    const s = {}; const old = issueResumeToken(s, '7', 3);
    const next = issueResumeToken(s, '7', 3);
    expect(next).not.toBe(old);
    expect(lookupResumeToken(old)).toEqual({ ok: false, reason: 'unknown' });
    expect(lookupResumeToken(next).ok).toBe(true);
  });
  it('refuses a revoked token (G, kick, window end)', () => {
    const s = {}; const t = issueResumeToken(s, '7', 3);
    revokeResumeToken(s);
    expect(lookupResumeToken(t)).toEqual({ ok: false, reason: 'unknown' });
  });
  it("never answers another session's token for this one", () => {
    const a = {}; const b = {};
    issueResumeToken(a, '7', 3); const tb = issueResumeToken(b, '8', 4);
    const r = lookupResumeToken(tb);
    expect(r.ok && r.bound.session).toBe(b);
    expect(r.ok && r.bound.userId).toBe('8');
  });
  it('refuses junk without throwing', () => {
    for (const junk of [undefined, null, '', 42, {}, 'x'.repeat(5000)]) expect(lookupResumeToken(junk).ok).toBe(false);
  });
  it('a fingerprint is short and is not the token', () => {
    const t = issueResumeToken({}, '7', 3);
    expect(tokenFingerprint(t)).toMatch(/^[0-9a-f]{8}$/);
    expect(t.includes(tokenFingerprint(t))).toBe(false);
  });
});

describe('the token index does not keep a session alive', () => {
  /** A stand-in for the collector: `collect(s)` makes that session's ref dead. */
  function fakeCollector() {
    const dead = new Set<object>();
    _setRefFactoryForTests((s) => ({ deref: () => (dead.has(s) ? undefined : s) }));
    return (s: object) => dead.add(s);
  }
  it('a collected session answers unknown and its record is dropped', () => {
    const collect = fakeCollector();
    const s = {}; const t = issueResumeToken(s, '7', 3);
    expect(lookupResumeToken(t).ok).toBe(true);
    collect(s);
    expect(lookupResumeToken(t)).toEqual({ ok: false, reason: 'unknown' });
    expect(resumeTokenCount()).toBe(0);
  });
  it('a sweep removes expired and collected records and keeps live ones', () => {
    const collect = fakeCollector();
    const live = {}, gone = {}, late = {};
    issueResumeToken(live, '1', 1); issueResumeToken(gone, '2', 2); issueResumeToken(late, '3', 3);
    collect(gone); setResumeExpiry(late, 1000);
    sweepResumeTokens(2000);
    expect(resumeTokenCount()).toBe(1);
  });
  it('the index stays bounded across many logins that never end cleanly', () => {
    const collect = fakeCollector();
    for (let i = 0; i < 500; i++) { const s = {}; issueResumeToken(s, String(i), 1 + (i % 9)); collect(s); }
    // Each issue sweeps a bounded slice, so the dead do not pile up to 500.
    expect(resumeTokenCount()).toBeLessThan(100);
  });
  it('a record is reached by the bounded sweep even behind many live ones', () => {
    const collect = fakeCollector();
    const keep: object[] = [];
    for (let i = 0; i < 100; i++) { const s = {}; keep.push(s); issueResumeToken(s, 'k', 1); }
    const doomed = {}; issueResumeToken(doomed, 'd', 2); collect(doomed);
    for (let i = 0; i < 10; i++) lookupResumeToken('x'.repeat(43));
    expect(resumeTokenCount()).toBe(100);
  });
  it('an idle board still cleans up: a timer sweeps, and it does not hold the process open', () => {
    jest.useFakeTimers();
    try {
      _resetResumeTokensForTests();
      const collect = fakeCollector();
      const s = {}; issueResumeToken(s, '7', 3);
      collect(s);
      expect(resumeTokenCount()).toBe(1);
      jest.advanceTimersByTime(61_000);
      expect(resumeTokenCount()).toBe(0);
      expect(jest.getTimerCount()).toBe(1);
    } finally { _resetResumeTokensForTests(); jest.useRealTimers(); }
  });
  it('a bound node 0 is invalid', () => {
    expect(() => issueResumeToken({}, '7', 0)).toThrow();
  });
  it('the login helper issues nothing without a node, and with one logs only the fingerprint', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      expect(issueResumeTokenForLogin({}, '7')).toBeUndefined();
      expect(issueResumeTokenForLogin({ nodeId: 0 }, '7')).toBeUndefined();
      const t = issueResumeTokenForLogin({ nodeId: 4 }, '7')!;
      const lines = log.mock.calls.map((c) => String(c[0]));
      expect(lines.length).toBe(3);
      expect(lines.filter((l) => l.includes(t))).toEqual([]);
      expect(lines[2]).toContain(tokenFingerprint(t));
    } finally { log.mockRestore(); }
  });
});
