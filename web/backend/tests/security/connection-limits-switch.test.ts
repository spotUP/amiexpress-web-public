/**
 * The connection limiters switch off while developing.
 *
 * The sysop asked (2026-09-28): "remove it while deving with a switch?" - the
 * IP ban (8 attempts in 10 s) and the rate limit (30 a minute) locked a
 * developer's own IP out during reconnect-heavy testing. One switch,
 * security/connection-limits.ts, governs both: on in production, off
 * elsewhere, BBS_CONNECTION_LIMITS=on|off overrides.
 */
process.env.SKIP_DB_INIT = '1';

import { connectionLimitsApply } from '../../src/security/connection-limits';
import { checkConnectionLimit } from '../../src/server/session-manager';
import { ipBanManager } from '../../src/security/ip-ban-manager';

const saved = { flag: process.env.BBS_CONNECTION_LIMITS, env: process.env.NODE_ENV };
afterEach(() => {
  if (saved.flag === undefined) delete process.env.BBS_CONNECTION_LIMITS; else process.env.BBS_CONNECTION_LIMITS = saved.flag;
  (process.env as any).NODE_ENV = saved.env;
});

it('applies in production, not in development, and the flag overrides both', () => {
  expect(connectionLimitsApply({ NODE_ENV: 'production' })).toBe(true);
  expect(connectionLimitsApply({ NODE_ENV: 'development' })).toBe(false);
  expect(connectionLimitsApply({})).toBe(false);
  expect(connectionLimitsApply({ NODE_ENV: 'development', BBS_CONNECTION_LIMITS: 'on' })).toBe(true);
  expect(connectionLimitsApply({ NODE_ENV: 'production', BBS_CONNECTION_LIMITS: 'OFF' })).toBe(false);
});

function hammer(ip: string, times: number): boolean[] {
  const results: boolean[] = [];
  for (let i = 0; i < times; i++) results.push(ipBanManager.allowConnection(ip) && checkConnectionLimit(ip));
  return results;
}

it('lets a developer reconnect as often as he likes', () => {
  process.env.BBS_CONNECTION_LIMITS = 'off';
  expect(hammer('203.0.113.7', 50).every(Boolean)).toBe(true);
});

it('still turns a flooding IP away when the limits are on', () => {
  process.env.BBS_CONNECTION_LIMITS = 'on';
  expect(hammer('203.0.113.8', 50).some((ok) => !ok)).toBe(true);
});
