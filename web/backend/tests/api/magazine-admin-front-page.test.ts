/**
 * The admin's Magazine page edits the front page of THE UNKNOWN FREQUENCY.
 *
 * The route, the guard it is mounted behind and the file writer it shares
 * with the MAG door. The guard is the board's real `authenticateToken` +
 * `requireSysop`, attached by the same `mountMagazineAdmin` the server calls.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import request from 'supertest';
import { authenticateToken, requireSysop } from '../../src/middleware/auth.middleware';
import { mountMagazineAdmin } from '../../src/api/magazine-admin-routes';
import { writeFrontFile } from '@amiexpress/bbs-door-sdk/formats/magazine-front-file';
import { ARTICLE_MIN_BODY_CHARS } from '@amiexpress/bbs-door-sdk/formats/magazine';

const sysop = async () => ({ userId: '1', username: 'sysop', secLevel: 255 });
const caller = async () => ({ userId: '2', username: 'origo', secLevel: 30 });

let root: string;
let republish: jest.Mock;

const story = (id: string, over: Record<string, unknown> = {}) => ({
  id, headline: `Headline ${id}`, summary: 's', format: 'NEWS', desk: 'SECURITY',
  date: '2026-10-01', source: 'www.example.org via Algolia', firstSeen: '2026-10-01T00:00:00Z', seenCount: 1,
  origin: 'feed', body: 'x'.repeat(ARTICLE_MIN_BODY_CHARS), ...over,
});

function seed(stories: Array<Record<string, unknown>>, front?: string[]): void {
  const dir = path.join(root, 'Magazine', 'stories');
  fs.mkdirSync(dir, { recursive: true });
  for (const s of stories) fs.writeFileSync(path.join(dir, `${s.id}.json`), JSON.stringify(s));
  if (front) fs.writeFileSync(path.join(root, 'Magazine', 'frontpage.json'), JSON.stringify(front));
}

const frontFile = () => path.join(root, 'Magazine', 'frontpage.json');
const frontOnDisk = () => JSON.parse(fs.readFileSync(frontFile(), 'utf8'));

function app(verify: (t: string) => Promise<any> = sysop) {
  const a = express();
  a.use(express.json());
  mountMagazineAdmin(
    a,
    [authenticateToken({ verifyAccessToken: verify } as any), requireSysop()],
    { boardRoot: () => root, republish },
  );
  return a;
}
const as = (r: request.Test) => r.set('Authorization', 'Bearer t');

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'mag-admin-'));
  republish = jest.fn();
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('the Magazine admin routes are sysop-only', () => {
  it('refuses a caller below sysop and touches nothing', async () => {
    seed([story('a')], ['a']);
    const get = await as(request(app(caller)).get('/api/config/magazine/stories/front'));
    const put = await as(request(app(caller)).put('/api/config/magazine/front').send({ ids: [] }));

    expect(get.status).toBe(403);
    expect(put.status).toBe(403);
    expect(frontOnDisk()).toEqual(['a']);
    expect(republish).not.toHaveBeenCalled();
  });

  it('answers 401 with no token at all', async () => {
    const res = await request(app()).get('/api/config/magazine/stories/front');

    expect(res.status).toBe(401);
  });
});

describe('GET stories/front', () => {
  it('lists only articles, newest first, with the desk label and the site name', async () => {
    seed([
      story('old', { date: '2026-09-01' }),
      story('new', { date: '2026-10-05' }),
      story('teaser', { body: 'short', date: '2026-10-09' }),
      story('mine', { origin: 'authored', body: undefined, date: '2026-10-03' }),
    ], ['new']);

    const res = await as(request(app()).get('/api/config/magazine/stories/front'));

    expect(res.status).toBe(200);
    expect(res.body.data.stories.map((s: any) => s.id)).toEqual(['new', 'mine', 'old']);
    expect(res.body.data.stories[0]).toMatchObject({ source: 'example.org', bodyLength: ARTICLE_MIN_BODY_CHARS });
    expect(res.body.data.stories[0].deskLabel).toEqual(expect.any(String));
    expect(res.body.data.stories[0]).not.toHaveProperty('body');
    expect(res.body.data.front).toEqual(['new']);
  });

  it('does not show a front page id whose story is not an article', async () => {
    seed([story('a'), story('teaser', { body: 'short' })], ['teaser', 'a', 'gone']);

    const res = await as(request(app()).get('/api/config/magazine/stories/front'));

    expect(res.body.data.front).toEqual(['a']);
  });

  it('answers an empty magazine as an empty list, not an error', async () => {
    const res = await as(request(app()).get('/api/config/magazine/stories/front'));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ stories: [], front: [] });
  });
});

describe('GET stories/:id', () => {
  it('returns the body of an article and refuses a teaser and a path', async () => {
    seed([story('a', { body: 'B'.repeat(ARTICLE_MIN_BODY_CHARS) }), story('t', { body: 'short' })]);

    const ok = await as(request(app()).get('/api/config/magazine/stories/a'));
    const teaser = await as(request(app()).get('/api/config/magazine/stories/t'));
    const bad = await as(request(app()).get('/api/config/magazine/stories/..%2Fx'));

    expect(ok.body.data.body).toHaveLength(ARTICLE_MIN_BODY_CHARS);
    expect(teaser.status).toBe(404);
    expect(bad.status).toBe(400);
  });
});

describe('PUT front', () => {
  it('writes the normalised ids, then republishes the pages', async () => {
    seed([story('a'), story('b'), story('teaser', { body: 'short' })]);
    republish.mockImplementation(() => { expect(frontOnDisk()).toEqual(['b', 'a']); });

    const res = await as(request(app()).put('/api/config/magazine/front')
      .send({ ids: ['b', 'a', 'b', 'gone', 'teaser'] }));

    expect(res.status).toBe(200);
    expect(res.body.data.front).toEqual(['b', 'a']);
    expect(frontOnDisk()).toEqual(['b', 'a']);
    expect(republish).toHaveBeenCalledTimes(1);
    expect(fs.readdirSync(path.join(root, 'Magazine')).filter((f) => f.includes('.tmp'))).toEqual([]);
  });

  it('rejects a body that is not a list of ids and writes nothing', async () => {
    seed([story('a')], ['a']);

    const res = await as(request(app()).put('/api/config/magazine/front').send({ ids: 'a' }));

    expect(res.status).toBe(400);
    expect(frontOnDisk()).toEqual(['a']);
    expect(republish).not.toHaveBeenCalled();
  });

  it('says so when the pages did not rebuild, with the file already written', async () => {
    seed([story('a')]);
    republish.mockImplementation(() => { throw new Error('boom'); });
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await as(request(app()).put('/api/config/magazine/front').send({ ids: ['a'] }));

    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/saved/i);
    expect(frontOnDisk()).toEqual(['a']);
  });
});

describe('the front page writer shared with the MAG door', () => {
  it('replaces the file whole and leaves no temp file', () => {
    const dir = path.join(root, 'Magazine');
    writeFrontFile(dir, ['a']);
    writeFrontFile(dir, ['b', 'c']);

    expect(frontOnDisk()).toEqual(['b', 'c']);
    expect(fs.readdirSync(dir)).toEqual(['frontpage.json']);
  });

  it('removes its temp file when the rename fails', () => {
    // A directory where the file belongs makes the rename fail for real.
    const dir = path.join(root, 'Magazine');
    fs.mkdirSync(path.join(dir, 'frontpage.json'), { recursive: true });

    expect(() => writeFrontFile(dir, ['b'])).toThrow();

    expect(fs.readdirSync(dir)).toEqual(['frontpage.json']);
    expect(fs.statSync(path.join(dir, 'frontpage.json')).isDirectory()).toBe(true);
  });
});
