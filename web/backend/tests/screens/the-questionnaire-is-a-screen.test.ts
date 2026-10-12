/**
 * THE QUESTIONNAIRE IS A SCREEN, and the manager has to see it as one.
 *
 * Sysop, 2026-09-17: "the questionair should probably just be treated like a
 * normal screen". He is right, and the board's own files say so - every node
 * carries `script<baud>`, a text shown to a new caller that already contains
 * the codes the board runs:
 *
 *     What is your real name: ~
 *     ~CC_SCREENTHEME|
 *     ~CC_THEME|
 *
 * A text file in `Node<n>/`, fanned out to every node, displayed to a caller,
 * carrying `~CC_` invocations. That is the definition of a screen here. The
 * only thing about it that is NOT screen-shaped is a bare trailing `~`, which
 * marks a question rather than a code.
 *
 * Two things this file pins, both of which the index got wrong by knowing
 * nothing about the file at all:
 *
 *   - `QUESTIONNAIRE` resolves per node, to the copy the board would actually
 *     run, with the other bauds as its variants.
 *   - A BAUD IS NOT A SECURITY LEVEL. `script2400` looks exactly like the
 *     `LOGON20.TXT` convention - a screen name with trailing digits - and
 *     reading 2400 as a level would tell a sysop this screen is shown to
 *     level-2400 callers. There is no such level.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { buildScreenIndex } from '../../src/screens/screen-index.service';

let root: string;

/** The board's shape: a node directory per node, seven bauds in each. */
const BAUDS = ['2400', '14400', '16800', '19200', '38400', '57600', '115200'];
const TEXT = 'What is your real name: ~\r\n~CC_SCREENTHEME|\r\n';

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'questionnaire-screen-'));
  for (const node of [1, 2]) {
    const dir = path.join(root, `Node${node}`);
    fs.mkdirSync(dir, { recursive: true });
    for (const baud of BAUDS) fs.writeFileSync(path.join(dir, `script${baud}`), TEXT, 'utf8');
  }
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const questionnaire = () =>
  buildScreenIndex(root).screens.find(entry => entry.screen === 'QUESTIONNAIRE');

describe('the questionnaire in the screen index', () => {
  it('is a screen the manager knows', () => {
    // Red before: the catalogue walk cannot see a file with no extension.
    expect(questionnaire()).toBeTruthy();
  });

  it('resolves per node, like every other node screen', () => {
    const nodes = (questionnaire()?.resolutions ?? []).filter(r => r.scope === 'node');
    expect(nodes.map(r => r.id).sort()).toEqual([1, 2]);
    for (const resolution of nodes) {
      expect(resolution.file).toMatch(new RegExp(`^Node${resolution.id}[\\\\/]script\\d+$`, 'i'));
    }
  });

  it('names the copy the board would run, and the rest as its variants', () => {
    const node1 = (questionnaire()?.resolutions ?? []).find(r => r.id === 1)!;

    // `findQuestionnaireScript` prefers the caller's own baud and then walks
    // 57600, 38400, 33600, 28800, 19200, 14400 - so with every baud present
    // the board runs script57600 and the index must say so rather than
    // whichever the directory listed first.
    expect(node1.file?.toLowerCase()).toContain('script57600');
    expect(node1.variants.length).toBe(BAUDS.length);
    for (const baud of BAUDS) {
      expect(node1.variants.map(v => v.toLowerCase())).toContain(`script${baud}`);
    }
  });

  it('does not read a baud as a security level', () => {
    const files = buildScreenIndex(root).files;
    const script = files[path.join('Node1', 'script2400')] ?? files['Node1/script2400'];
    expect(script).toBeTruthy();

    const readers = script.readBy ?? [];
    expect(readers.length).toBeGreaterThan(0);
    for (const reader of readers) {
      // 2400 is a modem speed. A screen "shown to level-2400 callers" would be
      // a sentence about a level the board cannot have.
      expect(reader.securityLevel).toBeUndefined();
      expect(String(reader.serves ?? '')).not.toMatch(/level 2400/i);
    }
  });

  it('is not left in the list of files nothing reads', () => {
    const unused = buildScreenIndex(root).unused.map(entry => entry.relPath.toLowerCase());
    for (const baud of BAUDS) {
      expect(unused).not.toContain(path.join('node1', `script${baud}`).toLowerCase());
      expect(unused).not.toContain(`node1/script${baud}`);
    }
  });
});
