/**
 * F12: the Bulls routes echoed `error.message` straight to the client.
 *
 * A missing or unreadable board file answers with an fs error whose message
 * carries the ABSOLUTE path - "ENOENT: no such file or directory, open
 * '/srv/bbs/Doors/emp_tools/Bulls.CFG'". Sysop-only, so low, but a route is
 * not the place to publish the layout of the board's disk. The client gets a
 * clean sentence; the detail goes to the server log, where it is useful.
 *
 * The service is mocked here on purpose: a real fs error reaches jest's
 * `instanceof Error` from another realm and answers false, so the leak
 * cannot be reproduced with a real missing file inside this runner - it is
 * only the LIVE board that returns the path. A same-realm Error is what the
 * route sees in production.
 */
import express from 'express';
import request from 'supertest';

jest.mock('../../src/services/bulls-config.service', () => ({
  loadBullsConfig: jest.fn(),
  saveBullsConfig: jest.fn(),
  saveBullsMenuEntries: jest.fn(),
  listBulletins: jest.fn(),
  readBulletin: jest.fn(),
  writeBulletin: jest.fn(),
}));

import {
  loadBullsConfig,
  saveBullsConfig,
  saveBullsMenuEntries,
  listBulletins,
  readBulletin,
  writeBulletin,
} from '../../src/services/bulls-config.service';
import { createBullsRouter } from '../../src/api/bulls-routes';

const BOARD = '/srv/bbs';
const LEAK = "ENOENT: no such file or directory, open '/srv/bbs/Doors/emp_tools/Bulls.CFG'";

const app = (): express.Application => {
  const a = express();
  a.use(express.json());
  a.use('/api/config/bulls', createBullsRouter(BOARD));
  return a;
};

const mock = (fn: unknown) => fn as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); });

const namesTheDisk = (body: unknown): boolean => {
  const message = String((body as { message?: unknown })?.message ?? '');
  return message.includes('/srv/bbs') || message.includes('ENOENT') || message.includes('EACCES');
};

describe('a Bulls route failure never names the board on disk', () => {
  it('answers a clean sentence when Bulls.CFG cannot be read', async () => {
    mock(loadBullsConfig).mockImplementation(() => { throw new Error(LEAK); });
    const res = await request(app()).get('/api/config/bulls');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Failed to load Bulls.CFG');
    expect(namesTheDisk(res.body)).toBe(false);
  });

  it('keeps the detail, in the server log where it belongs', async () => {
    mock(loadBullsConfig).mockImplementation(() => { throw new Error(LEAK); });
    await request(app()).get('/api/config/bulls');
    const logged = (console.error as unknown as jest.Mock).mock.calls
      .map((c: unknown[]) => c.map((a) => String(a)).join(' '))
      .join('\n');
    expect(logged).toContain('[Bulls]');
    expect(logged).toContain('ENOENT');
  });

  it('answers a clean sentence when Bulls.CFG cannot be written', async () => {
    mock(saveBullsConfig).mockImplementation(() => { throw new Error(LEAK.replace('ENOENT', 'EACCES')); });
    const res = await request(app()).put('/api/config/bulls').send({ raw: 'DUAL_LISTING YES\n' });
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Failed to save Bulls.CFG');
    expect(namesTheDisk(res.body)).toBe(false);
  });

  it('answers a clean sentence when the bulletins cannot be listed', async () => {
    mock(listBulletins).mockImplementation(() => { throw new Error("ENOENT: no such file or directory, scandir '/srv/bbs/Bulletins'"); });
    const res = await request(app()).get('/api/config/bulls/bulletins');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Failed to list bulletins');
    expect(namesTheDisk(res.body)).toBe(false);
  });

  it('answers a clean sentence when a bulletin cannot be read', async () => {
    mock(readBulletin).mockImplementation(() => { throw new Error("ENOENT: no such file or directory, open '/srv/bbs/Bulletins/bull9.txt'"); });
    const res = await request(app()).get('/api/config/bulls/bulletins/bull9.txt');
    expect(res.status).toBe(404);
    expect(namesTheDisk(res.body)).toBe(false);
  });

  it('answers a clean sentence when a bulletin cannot be written', async () => {
    mock(writeBulletin).mockImplementation(() => { throw new Error("EACCES: permission denied, open '/srv/bbs/Bulletins/bull9.txt'"); });
    const res = await request(app()).put('/api/config/bulls/bulletins/bull9.txt').send({ content: 'x' });
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Failed to save bulletin');
    expect(namesTheDisk(res.body)).toBe(false);
  });

  it('still tells the admin what is wrong with what THEY sent', async () => {
    mock(saveBullsMenuEntries).mockImplementation(() => { throw new Error('Entry 2 needs a title'); });
    const structural = await request(app()).put('/api/config/bulls/entries').send({ entries: [{ title: '', file: 'bull1.txt' }] });
    expect(structural.status).toBe(400);
    expect(structural.body.message).toBe('Entry 2 needs a title');

    mock(readBulletin).mockImplementation(() => { throw new Error('Not a bulletin file: evil.txt'); });
    const badName = await request(app()).get('/api/config/bulls/bulletins/evil.txt');
    expect(badName.status).toBe(400);
    expect(badName.body.message).toMatch(/Not a bulletin file/);

    mock(writeBulletin).mockImplementation(() => { throw new Error('bull1.txt is generated by the board'); });
    const generated = await request(app()).put('/api/config/bulls/bulletins/bull1.txt').send({ content: 'x' });
    expect(generated.status).toBe(403);
    expect(generated.body.message).toMatch(/is generated by/);
  });
});
