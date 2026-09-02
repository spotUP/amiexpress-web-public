/**
 * An expired session says "log in again", not "you are not allowed".
 *
 * Reported live on 2026-09-02: /auth/me answered 403 and the admin logged the
 * sysop out. The account is level 255 and the JWT secret had not changed - the
 * access token had simply aged past its 8 hours, and `authenticateToken`
 * answers 403 for that. So does `requireSysop` for a caller who genuinely
 * lacks the level, and no client can tell those two apart: the admin treats
 * both as "the session is over" and throws away a refresh token good for seven
 * days.
 *
 * 401 means "authenticate"; 403 means "authenticated, and still no".
 */
process.env.SKIP_DB_INIT = '1';

import express from 'express';
import request from 'supertest';
import { authenticateToken, requireSysop } from '../../src/middleware/auth.middleware';

const db = (verify: (token: string) => Promise<any>) => ({ verifyAccessToken: verify }) as any;

function app(verify: (token: string) => Promise<any>) {
  const a = express();
  a.get('/me', authenticateToken(db(verify)), requireSysop(), (_req, res) => { res.json({ ok: true }); });
  return a;
}

const sysop = async () => ({ userId: '1', username: 'sysop', secLevel: 255 });
const expired = async () => { throw new Error('Invalid or expired access token'); };

it('answers 401 when the token has expired', async () => {
  const res = await request(app(expired)).get('/me').set('Authorization', 'Bearer stale');

  expect(res.status).toBe(401);
});

it('answers 401 when there is no token at all', async () => {
  const res = await request(app(sysop)).get('/me');

  expect(res.status).toBe(401);
});

it('still answers 403 when the caller is authenticated and not a sysop', async () => {
  const caller = async () => ({ userId: '2', username: 'origo', secLevel: 30 });
  const res = await request(app(caller)).get('/me').set('Authorization', 'Bearer fine');

  expect(res.status).toBe(403);
  expect(res.body.error).toMatch(/sysop/i);
});

it('lets a sysop through', async () => {
  const res = await request(app(sysop)).get('/me').set('Authorization', 'Bearer fine');

  expect(res.status).toBe(200);
});
