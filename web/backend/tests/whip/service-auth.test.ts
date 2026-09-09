/**
 * Phase 0 - the WHIP bot's service token.
 *
 * The bot is a service, not a user: no JWT, just WHIP_SERVICE_TOKEN. Wrong
 * or absent tokens get 401, and a server with no token configured admits
 * nobody. Pure middleware, no database.
 */
import { authenticateServiceToken } from '../../src/middleware/service-auth.middleware';

function req(token?: string): any {
  return { headers: token === undefined ? {} : { authorization: `Bearer ${token}` } };
}

function res(): any {
  const r: any = {};
  r.status = (code: number) => { r.code = code; return r; };
  r.json = (body: any) => { r.body = body; return r; };
  return r;
}

describe('authenticateServiceToken', () => {
  const saved = process.env.WHIP_SERVICE_TOKEN;
  afterEach(() => {
    if (saved === undefined) delete process.env.WHIP_SERVICE_TOKEN;
    else process.env.WHIP_SERVICE_TOKEN = saved;
  });

  it('admits the configured token', () => {
    process.env.WHIP_SERVICE_TOKEN = 's3cret';
    const r = res();
    let next = false;
    authenticateServiceToken(req('s3cret'), r, () => { next = true; });
    expect(next).toBe(true);
    expect(r.code).toBeUndefined();
  });

  it('refuses a wrong token, a missing header, and a non-Bearer scheme', () => {
    process.env.WHIP_SERVICE_TOKEN = 's3cret';
    for (const bad of [req('wrong'), req(), { headers: { authorization: 'Token s3cret' } }]) {
      const r = res();
      let next = false;
      authenticateServiceToken(bad, r, () => { next = true; });
      expect(next).toBe(false);
      expect(r.code).toBe(401);
    }
  });

  it('refuses everyone when the server has no token configured', () => {
    delete process.env.WHIP_SERVICE_TOKEN;
    const r = res();
    let next = false;
    authenticateServiceToken(req('anything'), r, () => { next = true; });
    expect(next).toBe(false);
    expect(r.code).toBe(401);
  });
});
