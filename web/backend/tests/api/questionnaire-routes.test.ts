/**
 * The new-user questionnaire, from the admin's side.
 *
 * express.e:30323 doNewUserQuestions() reads Node<n>/Script<baud>; the port's
 * findQuestionnaireScript() looks for the same files. On this board they were
 * moved into Node<n>/disabled_scripts/ on 2026-04-24 and the questionnaire
 * silently stopped - the sysop asked for it back, editable from the web UI.
 *
 * One text, every node, every baud: that is what the board had (281 identical
 * files), and it is what a save must produce.
 */
import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';

import { config } from '../../src/config';
import { questionnaireRouter, QUESTIONNAIRE_BAUDS } from '../../src/api/questionnaire-routes';

let root: string;
let previousDataDir: string;
let who: { username: string; secLevel: number };

function app() {
  const a = express();
  a.use('/api/questionnaire', (req, _res, next) => {
    (req as unknown as { user: unknown }).user = who;
    next();
  }, express.json(), questionnaireRouter);
  return a;
}

const node = (n: number) => path.join(root, `Node${n}`);
const write = (rel: string, body: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body, 'latin1');
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'questionnaire-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  who = { username: 'sysop', secLevel: 255 };
  for (const n of [0, 1, 2]) fs.mkdirSync(node(n), { recursive: true });
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a board with the scripts parked reads as disabled, and still shows the text', async () => {
  write('Node1/disabled_scripts/script57600', 'What is FLT an abbrevation of: ~\n');

  const res = await request(app()).get('/api/questionnaire');

  expect(res.body.data.enabled).toBe(false);
  expect(res.body.data.parkedFiles).toBe(1);
  expect(res.body.data.text).toContain('FLT');
});

test('saving writes one text to every node and every baud', async () => {
  write('Node1/script57600', 'old\n');

  const res = await request(app()).put('/api/questionnaire').send({ text: 'What is your handle: ~\r\nWelcome.' });

  expect(res.status).toBe(200);
  expect(res.body.data.files).toBe(3 * QUESTIONNAIRE_BAUDS.length);
  for (const n of [0, 1, 2]) {
    for (const baud of QUESTIONNAIRE_BAUDS) {
      // Amiga text: LF, latin1, and a final newline so the last line is a line.
      expect(fs.readFileSync(path.join(node(n), `script${baud}`), 'latin1')).toBe('What is your handle: ~\nWelcome.\n');
    }
  }
});

test('saving while disabled keeps it disabled - the edit lands in the parking directory', async () => {
  write('Node1/disabled_scripts/script57600', 'old\n');

  await request(app()).put('/api/questionnaire').send({ text: 'new ~' });

  expect(fs.existsSync(path.join(node(1), 'script57600'))).toBe(false);
  expect(fs.readFileSync(path.join(node(1), 'disabled_scripts', 'script57600'), 'latin1')).toBe('new ~\n');
  const res = await request(app()).get('/api/questionnaire');
  expect(res.body.data.enabled).toBe(false);
});

test('enabling moves every parked script back where the flow looks', async () => {
  for (const n of [0, 1, 2]) write(`Node${n}/disabled_scripts/script57600`, 'q ~\n');

  const res = await request(app()).post('/api/questionnaire/enabled').send({ enabled: true });

  expect(res.status).toBe(200);
  expect(res.body.data.moved).toBe(3);
  expect(res.body.data.enabled).toBe(true);
  expect(fs.existsSync(path.join(node(1), 'script57600'))).toBe(true);
  expect(fs.existsSync(path.join(node(1), 'disabled_scripts'))).toBe(false);
});

test('disabling parks them the way the April change did, README and all', async () => {
  for (const n of [0, 1, 2]) write(`Node${n}/script57600`, 'q ~\n');

  const res = await request(app()).post('/api/questionnaire/enabled').send({ enabled: false });

  expect(res.body.data.enabled).toBe(false);
  expect(fs.existsSync(path.join(node(1), 'script57600'))).toBe(false);
  expect(fs.existsSync(path.join(node(1), 'disabled_scripts', 'script57600'))).toBe(true);
  expect(fs.existsSync(path.join(node(1), 'disabled_scripts', 'README.md'))).toBe(true);
});

test('there is nothing to enable on a board that never had one', async () => {
  const res = await request(app()).post('/api/questionnaire/enabled').send({ enabled: true });

  expect(res.status).toBe(409);
});

test('a co-sysop may read it and may not change it', async () => {
  who = { username: 'skope', secLevel: 100 };
  write('Node1/script57600', 'q ~\n');

  expect((await request(app()).get('/api/questionnaire')).status).toBe(200);
  expect((await request(app()).put('/api/questionnaire').send({ text: 'x' })).status).toBe(403);
  expect((await request(app()).post('/api/questionnaire/enabled').send({ enabled: false })).status).toBe(403);
  expect(fs.readFileSync(path.join(node(1), 'script57600'), 'latin1')).toBe('q ~\n');
});

test('text an Amiga cannot hold is refused before anything is written', async () => {
  write('Node1/script57600', 'q ~\n');

  const res = await request(app()).put('/api/questionnaire').send({ text: 'Welcome — emoji \u{1F600}' });

  expect(res.status).toBe(400);
  expect(fs.readFileSync(path.join(node(1), 'script57600'), 'latin1')).toBe('q ~\n');
});
