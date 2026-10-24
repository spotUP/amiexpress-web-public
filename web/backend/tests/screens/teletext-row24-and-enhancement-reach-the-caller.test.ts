/**
 * P0 reachability (teletext presentation levels, thoughts/spot/teletext-spec-fixes.md
 * L1-L5): a board screen written as a native .tti page reaches a teletext
 * caller through displayScreen with its row 24 (EN 300 706 s.9.3.1) and its
 * double-height rows as DECDHL, and the page's OL,26 enhancement packet is
 * read by the triplet parser on the way.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});

// Sentinel on the triplet parser: the real function, counted.
jest.mock('../../../../sdk/teletext/enhancement', () => {
  const actual = jest.requireActual('../../../../sdk/teletext/enhancement');
  return { ...actual, packetFromTtiContent: jest.fn(actual.packetFromTtiContent) };
});

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { displayScreen } from '../../src/handlers/screen.handler';
import { config } from '../../src/config';
import { flushOutput } from '../../src/utils/output.util';
import { invalidateScreenIndex } from '../../src/screens/screen-index.service';
import * as enhancement from '../../../../sdk/teletext/enhancement';

const ESC = '\x1b';
/** X/26 designation 0: set active position to row 1, colour at column 5, termination. */
const X26 = enhancement.packetToTtiContent({
  packet: 26,
  designation: 0,
  triplets: [
    { address: 41, mode: 0x04, data: 0 },
    { address: 5, mode: 0x00, data: 0x02 },
    { address: 63, mode: 0x1f, data: 0 },
  ],
});

const PAGE = [
  'PN,10000',
  'SC,0000',
  'PS,8000',
  `OL,2,${ESC}MBIG HEADLINE`,
  'OL,5,PICK A CONFERENCE',
  'OL,24,ROW TWENTY FOUR',
  `OL,26,${X26}`,
  '',
].join('\r\n');

test('row 24, DECDHL and the OL,26 packet of a native .tti board screen reach a teletext caller', async () => {
  const parse = enhancement.packetFromTtiContent as jest.MockedFunction<typeof enhancement.packetFromTtiContent>;
  parse.mockClear();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tti-row24-'));
  fs.mkdirSync(path.join(root, 'Screens', 'Node'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Screens', 'Node', 'JoinConf.tti'), PAGE, 'latin1');
  const saved = config.get('dataDir');
  config.set('dataDir', root);
  invalidateScreenIndex();
  try {
    const out: string[] = [];
    const socket: any = { id: `tti-${Math.random()}`, emit: (e: string, d: unknown) => { if (e === 'ansi-output') out.push(String(d)); return true; }, on() {} };
    const session: any = { nodeId: 1, texttvMode: true, screenWidth: 40, screenHeight: 25, user: { secLevel: 255, username: 'spot' }, currentConf: 1, state: 'loggedon' };

    await displayScreen(socket, session, 'JOINCONF');
    await new Promise((r) => setTimeout(r, 100));
    flushOutput(socket);
    const said = out.join('');

    // Sentinel: the triplet parser ran on the page's OL,26 and decoded its triplets.
    const parsed = parse.mock.results.map((r) => r.value as enhancement.EnhancementPacket | null);
    expect(parsed.some((p) => p?.packet === 26 && p.triplets.length === 13 && p.triplets[1]?.address === 5 && p.triplets[1]?.data === 2)).toBe(true);

    expect(said).toContain('PICK A CONFERENCE');
    expect(said).toContain('ROW TWENTY FOUR');
    // Double height reaches the board screen as DECDHL top and bottom.
    expect(said).toMatch(/\x1b#3[^\n]*BIG HEADLINE/);
    expect(said).toMatch(/\x1b#4[^\n]*BIG HEADLINE/);
  } finally {
    config.set('dataDir', saved);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
