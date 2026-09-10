/**
 * WEB_BULLS_CONFIG routes: parsed config with problems, byte-exact save.
 *
 * Mounted bare (routes-setup owns auth). The board is a temp dir with a
 * Bulls.CFG plus some bulletin files: what is pinned is the problem flags
 * on read and that a save writes the exact text back.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import request from 'supertest';
import { createBullsRouter } from '../../src/api/bulls-routes';

const CFG = [
  'DUAL_LISTING       YES',
  '[Init_END] ===',
  'Top Uploaders ; bull1.txt',
  'Ghost Entry ; bull99.txt',
  '[BullNames_END] ===',
  'XXXXXX-------------- ; Conference 1',
  '[CnfAccess_END] ===',
  'ART',
  '[Title_END] ===',
  '',
].join('\n');

function board(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulls-routes-'));
  fs.mkdirSync(path.join(dir, 'Doors', 'emp_tools'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'Bulletins'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'Doors', 'emp_tools', 'Bulls.CFG'), CFG, 'latin1');
  fs.writeFileSync(path.join(dir, 'Bulletins', 'bull1.txt'), 'x', 'latin1');
  return dir;
}

describe('bulls config routes', () => {
  it('reads entries with a missing-file problem flagged', async () => {
    const dir = board();
    const app = express();
    app.use(express.json());
    app.use('/api/config/bulls', createBullsRouter(dir));
    const res = await request(app).get('/api/config/bulls');
    expect(res.status).toBe(200);
    expect(res.body.data.entries.map((e: any) => e.file)).toEqual(['bull1.txt', 'bull99.txt']);
    expect(res.body.data.problems.map((p: any) => p.kind)).toContain('missing-file');
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('saves exact bytes and rechecks', async () => {
    const dir = board();
    const app = express();
    app.use(express.json());
    app.use('/api/config/bulls', createBullsRouter(dir));
    const fixed = CFG.replace('bull99.txt', 'bull1.txt');
    const res = await request(app).put('/api/config/bulls').send({ raw: fixed });
    expect(res.status).toBe(200);
    expect(res.body.data.problems.map((p: any) => p.kind)).not.toContain('missing-file');
    expect(fs.readFileSync(path.join(dir, 'Doors', 'emp_tools', 'Bulls.CFG'), 'latin1')).toBe(fixed);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('400s a missing body, 500s a missing file', async () => {
    const dir = board();
    const app = express();
    app.use(express.json());
    app.use('/api/config/bulls', createBullsRouter(dir));
    expect((await request(app).put('/api/config/bulls').send({})).status).toBe(400);
    const empty = express();
    empty.use(express.json());
    empty.use('/api/config/bulls', createBullsRouter(path.join(dir, 'nowhere')));
    expect((await request(empty).get('/api/config/bulls')).status).toBe(500);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('bull entries and content', () => {
  function appFor(dir: string) {
    const app = express();
    app.use(express.json());
    app.use('/api/config/bulls', createBullsRouter(dir));
    return app;
  }
  function board(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulls-entries-'));
    fs.mkdirSync(path.join(dir, 'Doors', 'emp_tools'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'Bulletins'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'Doors', 'emp_tools', 'Bulls.CFG'), CFG, 'latin1');
    fs.writeFileSync(path.join(dir, 'Bulletins', 'bull1.txt'), 'x', 'latin1');
    fs.writeFileSync(path.join(dir, 'Bulletins', 'bull9.txt'), 'static', 'latin1');
    return dir;
  }
  it('rewrites only the menu section', async () => {
    const dir = board();
    try {
      const app = appFor(dir);
      const res = await request(app).put('/api/config/bulls/entries')
        .send({ entries: [{ title: 'Top Uploaders', file: 'bull1.txt' }, { title: 'Static Nine', file: 'bull9.txt' }] });
      expect(res.status).toBe(200);
      expect(res.body.data.entries.map((e: any) => e.file)).toEqual(['bull1.txt', 'bull9.txt']);
      const raw: string = res.body.data.raw;
      expect(raw).toContain('DUAL_LISTING');
      expect(raw).toContain('[Title_END]');
      expect(raw).toContain('Static Nine');
      const missing = res.body.data.problems.map((p: any) => p.kind);
      expect(missing).not.toContain('missing-file');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it('400s structural errors, never paths', async () => {
    const dir = board();
    try {
      const app = appFor(dir);
      expect((await request(app).put('/api/config/bulls/entries').send({ entries: 'nope' })).status).toBe(400);
      expect((await request(app).put('/api/config/bulls/entries').send({ entries: [{ title: '', file: 'bull1.txt' }] })).status).toBe(400);
      expect((await request(app).put('/api/config/bulls/entries').send({ entries: [{ title: 'X', file: '../evil' }] })).status).toBe(400);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it('lists, reads, writes static, refuses generated and traversal', async () => {
    const dir = board();
    try {
      const app = appFor(dir);
      const list = await request(app).get('/api/config/bulls/bulletins');
      expect(list.status).toBe(200);
      expect(list.body.data.bulletins.map((b: any) => `${b.name}:${b.generated ? 'gen' : 'rw'}`)).toEqual(['bull1.txt:gen', 'bull9.txt:rw']);
      expect((await request(app).get('/api/config/bulls/bulletins/bull9.txt')).body.data.content).toBe('static');
      expect((await request(app).get('/api/config/bulls/bulletins/nope.txt')).status).toBe(400);
      expect((await request(app).put('/api/config/bulls/bulletins/bull9.txt').send({ content: 'edited' })).status).toBe(200);
      expect((await request(app).put('/api/config/bulls/bulletins/bull1.txt').send({ content: 'hacked' })).status).toBe(403);
      expect((await request(app).put('/api/config/bulls/bulletins/bull9.txt').send({})).status).toBe(400);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
