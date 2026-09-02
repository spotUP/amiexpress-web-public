/**
 * A conference's message bases are the ones its icon declares.
 *
 * `parseMessageBases` read none of that. It looked for a `MsgBase` directory
 * and, if one existed, invented a single base called `Conference <n>
 * Messages` - so a board with three named message bases imported as one,
 * under a name it had never had.
 *
 * express.e:
 *   - `NMSGBASES` from `<conf>/MsgBases`, a missing key meaning ONE base
 *     (getConfMsgBaseCount, 2048-2052)
 *   - `NAME.<n>` for each (getMsgBaseName, 2054-2058)
 *   - `LOCATION.<n>`, falling back to `<conf>/MsgBase/` when the count is
 *     absent or the index is out of range (getMsgBaseLocation, 2061-2073)
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AmigaParserService } from '../../src/services/amiga-parser.service';

let root: string;

function conference(icon: string | null, dirs: string[]): string {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'import-msgbase-'));
  const conf = path.join(root, 'Conf1');
  fs.mkdirSync(conf, { recursive: true });

  if (icon !== null) fs.writeFileSync(path.join(conf, 'MsgBases.info'), icon);
  for (const dir of dirs) fs.mkdirSync(path.join(conf, dir), { recursive: true });

  return conf;
}

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('imports every base the conference declares, by the name it declares', async () => {
  const conf = conference(
    'NMSGBASES=3\nNAME.1=General\nNAME.2=Sysop Only\nNAME.3=Trading\n'
    + 'LOCATION.1=BBS:Conf1/MsgBase\nLOCATION.2=BBS:Conf1/MsgBase2\nLOCATION.3=BBS:Conf1/MsgBase3\n',
    ['MsgBase', 'MsgBase2', 'MsgBase3'],
  );

  const bases = await new AmigaParserService().parseMessageBases(conf, 1);

  expect(bases.map(b => b.name)).toEqual(['General', 'Sysop Only', 'Trading']);
});

test('a conference with no MsgBases icon has exactly one base', async () => {
  // express.e:2051 - a missing NMSGBASES is ONE base, not none.
  const conf = conference(null, ['MsgBase']);

  const bases = await new AmigaParserService().parseMessageBases(conf, 1);

  expect(bases).toHaveLength(1);
  expect(bases[0].path).toBe(path.join(conf, 'MsgBase'));
});

test('never invents a name the board does not use', async () => {
  const conf = conference(null, ['MsgBase']);

  const bases = await new AmigaParserService().parseMessageBases(conf, 1);

  expect(bases[0].name).not.toContain('Conference');
});

test('an undeclared base on disk is not imported', async () => {
  const conf = conference('NMSGBASES=1\nNAME.1=General\nLOCATION.1=BBS:Conf1/MsgBase\n',
    ['MsgBase', 'MsgBase2']);

  const bases = await new AmigaParserService().parseMessageBases(conf, 1);

  expect(bases.map(b => b.name)).toEqual(['General']);
});

test('a declared base whose directory is missing is skipped rather than invented', async () => {
  const conf = conference('NMSGBASES=2\nNAME.1=General\nNAME.2=Gone\n'
    + 'LOCATION.1=BBS:Conf1/MsgBase\nLOCATION.2=BBS:Conf1/MsgBaseGone\n', ['MsgBase']);

  const bases = await new AmigaParserService().parseMessageBases(conf, 1);

  expect(bases.map(b => b.name)).toEqual(['General']);
});

test('messages themselves are not imported yet, and the base says so by being empty', async () => {
  // Recorded rather than hidden: the board reads its own HeaderFile through
  // utils/message-file.util.ts, and wiring that in here is the next piece.
  const conf = conference(null, ['MsgBase']);

  const bases = await new AmigaParserService().parseMessageBases(conf, 1);

  expect(bases[0].messages).toEqual([]);
});
