/**
 * "the logoff screen is broken sometimes" - sysop, 2026-09-14.
 *
 * The logoff batch (`LOGOFF<n>` -> `BBS:Batch<n>`, a SIM door) painted its
 * maintenance output over the logoff art. express.e has the mechanism to
 * stop it - `doorSilent := checkToolTypeExists(tooltype, cmd, 'SILENT')`
 * (express.e:4774) - and it tests for the tooltype's EXISTENCE.
 *
 * This parser asked whether its VALUE was the string 'YES', so the Amiga
 * convention of a bare flag read as false and the door was never silent.
 * Same construction on five more flags, every one of them an existence test
 * in express.e:
 *
 *   RESIDENT     4769      SILENT       4774
 *   TRAPON       4772      LOG_INPUTS   4780
 *   QUICKMODE    4755      SCRIPTCHECK  4784
 *
 * MULTINODE is deliberately NOT in that list: express.e has no such
 * tooltype, it is this board's own, and its `.info` files carry
 * `MULTINODE=NO` meaning it.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadCommandFromInfo } from '../../src/utils/amiga-command-parser.util';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flag-tooltype-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

/** A .info file carrying these tooltype lines. */
function info(name: string, lines: string[]): string {
  const full = path.join(dir, `${name}.info`);
  fs.writeFileSync(full, Buffer.concat([Buffer.alloc(40, 0), Buffer.from(lines.join('\n'), 'latin1')]));
  return full;
}

/** The six flags express.e reads with checkToolTypeExists. */
const FLAGS: Array<[string, 'resident' | 'trapOn' | 'silent' | 'logInputs' | 'scriptCheck' | 'quickMode']> = [
  ['RESIDENT', 'resident'],
  ['TRAPON', 'trapOn'],
  ['SILENT', 'silent'],
  ['LOG_INPUTS', 'logInputs'],
  ['SCRIPTCHECK', 'scriptCheck'],
  ['QUICKMODE', 'quickMode'],
];

describe('a flag tooltype is its presence, not its value', () => {
  it.each(FLAGS)('%s alone, with no value, is on', (tooltype, field) => {
    const cmd = loadCommandFromInfo(info('BARE', ['LOCATION=BBS:Batch1', 'TYPE=SIM', tooltype]));
    expect({ tooltype, on: cmd?.[field] }).toEqual({ tooltype, on: true });
  });

  it.each(FLAGS)('%s=YES stays on, as it always was', (tooltype, field) => {
    const cmd = loadCommandFromInfo(info('YES', ['LOCATION=BBS:Batch1', 'TYPE=SIM', `${tooltype}=YES`]));
    expect({ tooltype, on: cmd?.[field] }).toEqual({ tooltype, on: true });
  });

  it.each(FLAGS)('%s absent is off', (tooltype, field) => {
    const cmd = loadCommandFromInfo(info('NONE', ['LOCATION=BBS:Batch1', 'TYPE=SIM']));
    expect({ tooltype, on: cmd?.[field] ?? false }).toEqual({ tooltype, on: false });
  });

  it('MULTINODE keeps reading its VALUE: express.e has no such tooltype and NO means no', () => {
    const no = loadCommandFromInfo(info('MN', ['LOCATION=BBS:Batch1', 'TYPE=SIM', 'MULTINODE=NO']));
    expect(no?.multiNode).toBe(false);
    const yes = loadCommandFromInfo(info('MY', ['LOCATION=BBS:Batch1', 'TYPE=SIM', 'MULTINODE=YES']));
    expect(yes?.multiNode).toBe(true);
  });
});
