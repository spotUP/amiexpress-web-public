/**
 * The unsubscribe token and the public routes behind it.
 */
import jwt from 'jsonwebtoken';
import express from 'express';
import request from 'supertest';
import { applyUnsubscribe, mintUnsubscribeToken, verifyUnsubscribeToken } from '../../src/notify/unsubscribe';
import { createNotifyRouter } from '../../src/api/notify-routes';
import { mintChatToken } from '../../src/services/chat-token.service';
import { getPrefs, getSettings, setPrefs } from '../../src/notify/repository';
import { jwtSecret } from '../../src/utils/jwt-secrets';
import { waitForTestDb } from './helpers';

let db: any;
beforeAll(async () => { db = (await waitForTestDb()).db; }, 30000);
beforeEach(() => db.exec('DELETE FROM notify_prefs; DELETE FROM notify_settings'));

describe('the token', () => {
  it('round-trips the user and event, and never expires', () => {
    const t = mintUnsubscribeToken('u1', 'msg.reply');
    expect(verifyUnsubscribeToken(t)).toEqual({ userId: 'u1', evt: 'msg.reply' });
    expect(jwt.decode(t)).not.toHaveProperty('exp');
  });

  it('refuses a chat token signed with the same secret', () => {
    const chat = mintChatToken({ id: 'u1', username: 'x', secLevel: 10 });
    expect(verifyUnsubscribeToken(chat)).toBeNull();
  });

  it('refuses a token of the right shape but another purpose, another channel, a tampered signature, or junk', () => {
    const sign = (c: object, key = jwtSecret()) => jwt.sign(c, key);
    expect(verifyUnsubscribeToken(sign({ sub: 'u1', evt: 'msg.reply', ch: 'email', pur: 'something-else' }))).toBeNull();
    expect(verifyUnsubscribeToken(sign({ sub: 'u1', evt: 'msg.reply', ch: 'push', pur: 'notify-unsub' }))).toBeNull();
    expect(verifyUnsubscribeToken(sign({ sub: 'u1', evt: 'msg.reply', ch: 'email', pur: 'notify-unsub' }, 'other-key'))).toBeNull();
    expect(verifyUnsubscribeToken(sign({ sub: 'u1', evt: 'not.an.event', ch: 'email', pur: 'notify-unsub' }))).toBeNull();
    expect(verifyUnsubscribeToken('')).toBeNull();
    expect(verifyUnsubscribeToken('abc')).toBeNull();
    expect(verifyUnsubscribeToken(undefined)).toBeNull();
  });
});

describe('the routes', () => {
  const app = (): express.Express => { const a = express(); a.use('/notify', createNotifyRouter(() => db)); return a; };
  const url = (t: string) => `/notify/unsubscribe?t=${encodeURIComponent(t)}`;
  beforeEach(() => setPrefs(db, 'u1', { 'msg.reply': { email: 'instant', board: 'instant' }, 'file.new': { email: 'digest' } }));

  it('GET shows a button and changes nothing', async () => {
    const res = await request(app()).get(url(mintUnsubscribeToken('u1', 'msg.reply')));
    expect(res.status).toBe(200);
    expect(res.text).toContain('<button');
    expect(getPrefs(db, 'u1')['msg.reply']?.email).toBe('instant');
  });

  it('POST one-click turns that event\'s email off and leaves every other cell alone', async () => {
    const res = await request(app()).post(url(mintUnsubscribeToken('u1', 'msg.reply'))).type('form').send('List-Unsubscribe=One-Click');
    expect(res.status).toBe(200);
    const prefs = getPrefs(db, 'u1');
    expect(prefs['msg.reply']?.email).toBe('off');
    expect(prefs['msg.reply']?.board).toBe('instant');
    expect(prefs['file.new']?.email).toBe('digest');
  });

  it('POST for "all" pauses the caller', async () => {
    await request(app()).post(url(mintUnsubscribeToken('u1', 'all'))).expect(200);
    expect(getSettings(db, 'u1').paused).toBe(true);
  });

  it('refuses a chat token on both verbs and changes nothing', async () => {
    const chat = mintChatToken({ id: 'u1', username: 'x', secLevel: 10 });
    await request(app()).get(url(chat)).expect(400);
    await request(app()).post(url(chat)).expect(400);
    await request(app()).post('/notify/unsubscribe').expect(400);
    expect(getPrefs(db, 'u1')['msg.reply']?.email).toBe('instant');
  });

  it('applyUnsubscribe is idempotent', () => {
    applyUnsubscribe(db, { userId: 'u1', evt: 'msg.reply' });
    applyUnsubscribe(db, { userId: 'u1', evt: 'msg.reply' });
    expect(getPrefs(db, 'u1')['msg.reply']?.email).toBe('off');
  });
});
