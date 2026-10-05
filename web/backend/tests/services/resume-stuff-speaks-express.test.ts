/**
 * resumeStuff's prompts are express.e's (18150-18257): "Resume <name12>
 * [<size>] (Y/N)? " read one key at a time, N asks "No!   Delete
 * (Y/N/All)? ", and the answers print "No!", "Yes.. Deleted!" or, under
 * All, "All.. Deleted!" for each partial left. Y prints "Yes.." and
 * "Resuming upload: <name>" and resumes that one file only. The port
 * printed "[n bytes]", a "Deleted all n remaining" summary and kept asking
 * after a resume.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { startResumeStuff } from '../../src/services/resume-stuff.service';

function board(files: Record<string, number>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-'));
  const part = path.join(root, 'Conf1', 'PartUpload');
  fs.mkdirSync(part, { recursive: true });
  for (const [name, size] of Object.entries(files)) fs.writeFileSync(path.join(part, name), Buffer.alloc(size));
  const playpen = path.join(root, 'Node1', 'Playpen');
  return { root, part, playpen, config: { get: (k: string) => (k === 'dataDir' ? root : undefined) } };
}

function caller() {
  const said: string[] = [];
  const emitter = { emit: (_e: string, d: unknown) => { said.push(String(d)); return true; } };
  const session: any = { nodeId: 1, currentConf: 1, user: { slotNumber: 3 } };
  const keys = (k: string) => session.uploadResumeInputHandler(k);
  return { emitter, session, keys, said: () => said.join('') };
}

test('Y resumes one file in express.e\'s words and stops asking', () => {
  const b = board({ 'DEMO.LHA@3': 100, 'TUNE.MOD@3': 50 });
  const c = caller();
  const done = jest.fn();
  startResumeStuff(c.emitter, c.session, b.playpen, b.config, done);

  expect(c.said()).toMatch(/^Resume (DEMO\.LHA {5}\[100\]|TUNE\.MOD {5}\[50\]) \(Y\/N\)\? $/);
  c.keys('x'); // dropped
  c.keys('y');
  expect(c.said()).toContain('Yes..\r\n\r\nResuming upload: ');
  expect(done).toHaveBeenCalledWith({ resumed: 1, aborted: false });
  expect(c.said().match(/Resume /g)).toHaveLength(1);
});

test('N then All deletes every partial left, one line each', () => {
  const b = board({ 'DEMO.LHA@3': 100, 'TUNE.MOD@3': 50 });
  const c = caller();
  const done = jest.fn();
  startResumeStuff(c.emitter, c.session, b.playpen, b.config, done);

  c.keys('n');
  expect(c.said()).toContain('(Y/N)? No!   Delete (Y/N/All)? ');
  c.keys('a');
  expect(c.said()).toContain('All.. Deleted!\r\nDelete ');
  expect(c.said()).toMatch(/Delete (DEMO\.LHA {5}\[100\]|TUNE\.MOD {5}\[50\]) All\.\. Deleted!\r\n$/);
  expect(c.said()).not.toContain('Deleted all');
  expect(fs.readdirSync(b.part)).toEqual([]);
  expect(done).toHaveBeenCalledWith({ resumed: 0, aborted: false });
});
