/**
 * THE DOOR ITSELF, THROUGH ITS OWN ENTRY POINT.
 *
 * The two screen tests drive the renderers; this one drives `door.execute`,
 * the method the board calls, with a real conference directory on disk and a
 * `bbs` that answers the way the backend's BBSApi answers. It is the proof
 * that the parts are WIRED - settings found, data read, period rolled, screen
 * written - rather than merely correct on their own.
 *
 * The period roll is the half of this port that is not a screen at all. The
 * 68K door was the only thing on this board that ends a week, names its
 * winner and clears the table, so a display-only port would have frozen every
 * conference in the week the binary was retired.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  decodeCtopFile,
  encodeCtopHeader,
  encodeCtopRecord,
  toAmigaDays,
} from '@amiexpress/bbs-door-sdk/formats/ctop-data';
import { applyTooltypes } from '../../../src/utils/info-file.util';

import door from '../../../../../Doors/ctop-viewer/index';

const TODAY = toAmigaDays(new Date());

let root = '';
let conferenceDir = '';

/** A conference with a Conftop.info and a week's uploads in it. */
function board(options: { resetDate: number; records: Array<[string, string, number]> }): void {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctop-door-'));
  conferenceDir = path.join(root, 'Conf1');
  fs.mkdirSync(conferenceDir, { recursive: true });

  applyTooltypes(path.join(conferenceDir, 'Conftop.info'), [
    ['DAYS', 'WEEKLY'],
    ['ROWS', '12'],
    ['MAILUSER', 'eall'],
    ['SKIP_EMPTY_LINES', ''],
  ]);

  fs.writeFileSync(path.join(conferenceDir, 'ctop.data'), Buffer.concat([
    encodeCtopHeader({
      resetDate: options.resetDate,
      startDate: options.resetDate - 7,
      topUpName: 'sLASH', topUpBytes: 14_570_138n, topUpFiles: 5,
      periodUpName: 'NONE', periodUpBytes: 0n, periodUpFiles: 0,
    }),
    ...options.records.map(([userName, location, bytes]) =>
      encodeCtopRecord({ userName, location, bytes })),
  ]));
}

interface Run {
  wire: string;
  mail: Array<{ to: string; subject: string; body: string }>;
}

async function run(columns: number): Promise<Run> {
  const wire: string[] = [];
  const mail: Run['mail'] = [];
  const socket: any = {
    id: 'ctop-test',
    emit: (event: string, payload: unknown) => {
      if (event === 'ansi-output' && typeof payload === 'string') wire.push(payload);
      return true;
    },
    on: () => socket, once: () => socket, off: () => socket,
    removeListener: () => socket, removeAllListeners: () => socket,
  };
  const bbs: any = {
    getConferencePath: () => conferenceDir,
    readTooltypes: (file: string) => {
      // The board resolves a relative path against its own directory and
      // leaves an absolute one alone; the door passes an absolute one.
      const full = path.isAbsolute(file) ? file : path.join(root, file);
      if (!fs.existsSync(full)) return {};
      const { parseInfoFile } = require('../../../src/utils/info-file.util');
      const out: Record<string, string> = {};
      for (const tt of parseInfoFile(full).tooltypes) {
        if (!tt.commented && !(tt.key in out)) out[tt.key] = tt.value;
      }
      return out;
    },
    sendMessage: async (to: string, subject: string, body: string) => {
      mail.push({ to, subject, body });
      return true;
    },
    writeFile: async () => true,
  };

  await door.execute({
    socket,
    bbsSession: {
      nodeId: 1, currentConf: 1, currentConfName: 'Lamer Zone',
      screenWidth: columns, screenHeight: 25,
      user: { id: '1', username: 'sysop' },
    },
    user: { id: '1', username: 'sysop' },
    bbs,
    params: [],
  } as any);

  return { wire: wire.join(''), mail };
}

afterEach(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true });
  root = '';
});

describe('a caller opening CTOP mid-period', () => {
  beforeEach(() => board({
    resetDate: TODAY + 3,
    records: [['sysop', 'Server Room', 46_336], ['sysop', 'Server Room', 35_769]],
  }));

  it('is shown the table, with the week that is running', async () => {
    const { wire } = await run(80);

    expect(wire).toContain('Conference Top Uploaders');
    expect(wire).toContain('Lamer Zone');
    expect(wire).toContain('sysop');
    expect(wire).toContain('82,105');
  });

  it('leaves the data file alone - no reset is due', async () => {
    const before = fs.readFileSync(path.join(conferenceDir, 'ctop.data'));
    await run(80);

    expect(fs.readFileSync(path.join(conferenceDir, 'ctop.data')).equals(before)).toBe(true);
  });

  it('gets the forty-column screen on a C64, not the eighty-column one', async () => {
    const { wire } = await run(40);

    expect(wire).toContain('CONFERENCE TOP UPLOADERS');
    // The wide table's rule cannot be on a C64 screen.
    expect(wire).not.toContain('===-=======================');
    for (const line of wire.split('\r\n')) {
      expect(line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').length).toBeLessThanOrEqual(40);
    }
  });
});

describe('the first caller after the period ended', () => {
  beforeEach(() => board({
    resetDate: TODAY,
    records: [
      ['sysop', 'Server Room', 46_336],
      ['sysop', 'Server Room', 35_769],
      ['EALL/HT', '\\o/ HACK N TRADE \\o/', 49_246],
    ],
  }));

  it('rolls the period: the winner is named and the table is cleared', async () => {
    await run(80);

    const rolled = decodeCtopFile(fs.readFileSync(path.join(conferenceDir, 'ctop.data')));
    expect(rolled.header.periodUpName).toBe('sysop');
    expect(rolled.header.periodUpBytes).toBe(82_105n);
    expect(rolled.header.periodUpFiles).toBe(2);
    // Nobody beat 14,570,138, so the record stands.
    expect(rolled.header.topUpName).toBe('sLASH');
    // And the week's uploads are gone - that is the reset.
    expect(rolled.uploaders).toHaveLength(0);
    expect(rolled.header.resetDate).toBeGreaterThan(TODAY);
  });

  it('mails the final table to the sysop MAILUSER', async () => {
    const { mail } = await run(80);

    expect(mail).toHaveLength(1);
    expect(mail[0].to).toBe('eall');
    expect(mail[0].subject).toBe('Results from Conftop!');
    expect(mail[0].body).toContain('Final Results');
    expect(mail[0].body).toContain('82,105');
    // A message, not a screen: no pens in it.
    expect(mail[0].body).not.toContain('\x1b');
  });

  it('tells the caller what it is doing, as the Amiga door did', async () => {
    const { wire } = await run(80);

    expect(wire).toContain('Resetting Conference Top Uploaders...');
    expect(wire).toContain('Sending message to: (eall)');
  });
});

describe('a conference the sysop has not installed the table in', () => {
  beforeEach(() => {
    board({ resetDate: TODAY + 3, records: [] });
    fs.rmSync(path.join(conferenceDir, 'Conftop.info'));
  });

  it('says so and touches nothing', async () => {
    const { wire, mail } = await run(80);

    expect(wire).toContain('Conference Top Uploaders is not installed in this conference.');
    expect(wire).not.toContain('No# Username');
    expect(mail).toHaveLength(0);
  });
});
