/**
 * A bot token is not a sysop.
 *
 * The HTTP actor read as `secLevel: 255` with `confAccess` simply left off,
 * and `maySee` (bot-data/messages.ts) answers true when it is absent - so a
 * messages-scoped token listed public mail in EVERY conference, sysop-only
 * ones included, and the WHIP Discord bot posted it into a channel. The plan
 * that specified this API pinned the opposite: "conf-gated message refused".
 *
 * The bot has no account, so it gets what an ordinary caller gets - the
 * board's own new-user conference access - and an unreadable config means
 * conference 1 only, never everything.
 */

import express from 'express';
import request from 'supertest';
import { createBotDataRouter } from '../../src/api/bot-data-routes';

const TOKEN = 'bot-conf-test-secret';

/** A board whose new users reach conferences 1 and 3, but not 2. */
function boardWith(mask: string | undefined) {
  const messagesByConf: Record<number, Array<Record<string, unknown>>> = {
    1: [{ id: 1, subject: 'Open house', fromUser: 'ann', isPrivate: false, posted: 1 }],
    2: [{ id: 2, subject: 'Staff only', fromUser: 'spot', isPrivate: false, posted: 2 }],
    3: [{ id: 3, subject: 'Demos', fromUser: 'knut', isPrivate: false, posted: 3 }],
  };
  return {
    getConfigRepository: () => ({ getSystemConfig: () => ({ new_user_conf_access: mask }) }),
    getConferences: async () => [
      { id: 1, name: 'Main' },
      { id: 2, name: 'Sysop' },
      { id: 3, name: 'Demos' },
    ],
    getMessageBases: async () => [{ id: 7, name: 'General' }],
    getMessages: async (conf: number) => messagesByConf[conf] ?? [],
  };
}

function appFor(mask: string | undefined) {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/bot/v1',
    (req, _res, next) => {
      (req as any).botService = { id: 'whip', domains: ['messages'] };
      next();
    },
    createBotDataRouter(boardWith(mask) as never, { bbsRoot: process.cwd() })
  );
  return app;
}

const listIn = (app: express.Express, conf: number) =>
  request(app).get('/api/bot/v1/messages/recent').query({ conf }).set('Authorization', `Bearer ${TOKEN}`);

describe('a bot token reading the message bases', () => {
  it('reads a conference new users may see', async () => {
    const res = await listIn(appFor('X_X'), 1);
    expect(res.status).toBe(200);
    expect(res.body.data.text).toContain('Open house');
  });

  it('will not read a conference new users may not see', async () => {
    const res = await listIn(appFor('X_X'), 2);
    expect(res.status).toBe(200);
    expect(res.body.data.text).not.toContain('Staff only');
  });

  it('reaches past the first conference when the board grants it', async () => {
    const res = await listIn(appFor('X_X'), 3);
    expect(res.body.data.text).toContain('Demos');
  });

  it('falls back to conference 1 alone when the board says nothing', async () => {
    expect((await listIn(appFor(undefined), 1)).body.data.text).toContain('Open house');
    expect((await listIn(appFor(undefined), 3)).body.data.text).not.toContain('Demos');
  });

  it('falls back to conference 1 alone for an area-name access string', async () => {
    // More than nine conferences: confAccess is an AREA NAME, which cannot be
    // resolved without a user record.
    expect((await listIn(appFor('SYSOPS'), 3)).body.data.text).not.toContain('Demos');
  });
});
