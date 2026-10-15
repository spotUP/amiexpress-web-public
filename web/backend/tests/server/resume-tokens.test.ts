import { issueResumeToken, rotateResumeToken, lookupResumeToken, setResumeExpiry, revokeResumeToken, tokenFingerprint, _resetResumeTokensForTests } from '../../src/server/resume-tokens';

beforeEach(() => _resetResumeTokensForTests());

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
  it('refuses the token a resume rotated out, and accepts the new one', () => {
    const s = {}; const old = issueResumeToken(s, '7', 3);
    const next = rotateResumeToken(s);
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
  it('rotating a session with no token throws', () => {
    expect(() => rotateResumeToken({})).toThrow();
  });
});
