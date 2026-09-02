/**
 * A command keeps the access level the board gave it.
 *
 * parseCommandDirectory read `ACCESS_LEVEL`, `PATH` and `FLAGS` - none of
 * which appear on an AmiExpress command icon. express.e reads `ACCESS`
 * (4702), `LOCATION` (4751) and `TYPE` (4682-4700).
 *
 * So every command imported at the hardcoded default of 10 with no location.
 * On the reference-boardBBS reference tree that turns DEL - a sysop-only file
 * manager at ACCESS=255 - into a command any level-10 caller could run, and
 * points it nowhere. That is a permission hole, not a cosmetic import bug.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AmigaParserService } from '../../src/services/amiga-parser.service';

let root: string;

function board(icons: Record<string, string>): string {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'import-commands-'));
  const dir = path.join(root, 'Commands', 'BBSCmd');
  fs.mkdirSync(dir, { recursive: true });

  for (const [name, body] of Object.entries(icons)) {
    fs.writeFileSync(path.join(dir, `${name}.info`), body);
  }
  return root;
}

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('a sysop-only command stays sysop-only', async () => {
  const bbs = board({
    DEL: 'ACCESS=255\nTYPE=XIM\nLOCATION=DOORS:-mgs!-MgzListMan/MGZLISTMAN\n',
  });

  const [del] = await new AmigaParserService().parseCommands(bbs);

  expect(del.accessLevel).toBe(255);
});

test('reads the level each command actually has, not one default for all', async () => {
  const bbs = board({
    B: 'ACCESS=1\nTYPE=XIM\n',
    DD: 'ACCESS=20\nTYPE=XIM\n',
    BESTCONF: 'ACCESS=50\nTYPE=XIM\n',
  });

  const levels = Object.fromEntries(
    (await new AmigaParserService().parseCommands(bbs)).map(c => [c.name, c.accessLevel]),
  );

  expect(levels).toEqual({ B: 1, DD: 20, BESTCONF: 50 });
});

test('keeps the location, so the command still points at its door', async () => {
  const bbs = board({ DD: 'ACCESS=20\nLOCATION=BBS:doors/TurboLister/TurboLister.XiM\n' });

  const [dd] = await new AmigaParserService().parseCommands(bbs);

  expect(dd.path).toBe('BBS:doors/TurboLister/TurboLister.XiM');
});

test('an icon with no ACCESS does not become level 10 by accident', async () => {
  // readToolTypeInt answers -1 for a missing key (tooltypes.e:176-181). Making
  // one up - and 10 is a level real callers have - is how a command nobody
  // could reach becomes one everybody can.
  const bbs = board({ MYSTERY: 'TYPE=XIM\n' });

  const [mystery] = await new AmigaParserService().parseCommands(bbs);

  expect(mystery.accessLevel).toBe(-1);
});

test('carries the icon\'s own tooltypes rather than an empty map', async () => {
  const bbs = board({ GWALL: 'ACCESS=50\nTYPE=XIM\nNAME=Global Wall\n' });

  const [gwall] = await new AmigaParserService().parseCommands(bbs);

  expect(gwall.settings.get('TYPE')).toBe('XIM');
  expect(gwall.description).toBe('Global Wall');
});
