/**
 * The privacy notice is a screen, and the index must say who reads it.
 *
 * Every new caller meets `Screens/PRIVACY.TXT` (new-user.handler) and any
 * caller can ask for it again (gdpr.handler). Both open it by path rather than
 * through a catalogue name, so nothing claimed it: the index listed a screen
 * the whole board depends on as "read by nothing", and the admin gallery
 * showed it to artists as a file nobody wants. Reported by the sysop: "there
 * are many screens that claims not being read in the gallery".
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { buildScreenIndex } from '../../src/screens/screen-index.service';

let root: string;

const write = (rel: string, body: string) => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, 'latin1');
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-screen-'));
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  write('Screens/PRIVACY.TXT', 'what this board keeps about you\r\n');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('the privacy notice is read by a screen, not by nothing', () => {
  const index = buildScreenIndex(root);

  const facts = index.files['Screens/PRIVACY.TXT'];
  expect(facts).toBeDefined();
  expect(facts.readBy?.length ?? 0).toBeGreaterThan(0);
  expect(facts.readBy?.[0].screen).toBe('PRIVACY');
});

test('and it is not in the list of files nothing reads', () => {
  const index = buildScreenIndex(root);

  expect(index.unused.map(f => f.relPath)).not.toContain('Screens/PRIVACY.TXT');
});
