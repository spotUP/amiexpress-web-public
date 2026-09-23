/**
 * A MESSAGE THAT COMES BACK AS A DIFFERENT MESSAGE.
 *
 * `MessageFileManager.writeMessageFile` wrote the body `'binary'` - latin1 -
 * while `utils/message-file.util.ts` reads it back as UTF-8. Latin1 takes
 * `charCode & 0xFF`, so every character above U+00FF was stored as a
 * different one that is perfectly plausible: `é` came back as `i`, and a
 * PETSCII glyph carried as `U+E141` came back as the letter `A`. Nothing
 * looked broken, which is why nobody reported it.
 *
 * This path is not the message editor - that writes its own file. It is the
 * one importers, AREXX, `BBSApi` and the web admin's compose form take
 * (`database/message-repository.ts:56`), so it is how every message that
 * does NOT come from a caller at a keyboard reaches the disk.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { MessageFileManager } from '../../src/services/MessageFileManager';
import { puaForScreenCode } from '@amiexpress/bbs-door-sdk/petscii';

const CONF = 1;
const MSG_NUMBER = 4242;

let root = '';
let previousRoot: string | undefined;
let manager: MessageFileManager;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'msg-encoding-'));
  previousRoot = process.env.BBS_ROOT;
  process.env.BBS_ROOT = root;
  manager = new MessageFileManager();
});

afterEach(() => {
  if (previousRoot === undefined) delete process.env.BBS_ROOT;
  else process.env.BBS_ROOT = previousRoot;
  fs.rmSync(root, { recursive: true, force: true });
});

function write(body: string): void {
  manager.writeMessageFile(
    {
      id: 1, body, subject: 's', author: 'spot', toUser: 'ALL',
      timestamp: new Date(0), conferenceId: CONF, messageBaseId: 1,
      isPrivate: false, parentId: null, attachments: [],
      edited: false, editedBy: null, editedAt: null,
    } as never,
    CONF,
    MSG_NUMBER,
  );
}

/** The body as it actually sits on disk, read the way the board reads it. */
function readBack(): string {
  const file = path.join(root, `Conf${CONF}`, 'MsgBase', String(MSG_NUMBER));
  return fs.readFileSync(file, 'utf-8').replace(/\n$/, '');
}

describe('a message written by an importer, AREXX or the admin', () => {
  it('keeps its accented letters', () => {
    write('Måns skrev här, på svenska');

    expect(readBack()).toBe('Måns skrev här, på svenska');
  });

  it('keeps a PETSCII glyph instead of turning it into a letter', () => {
    // Screen code 0x40 is the line a C64 draws a rule with. Under latin1 it
    // was stored as 0x40 - an `@`.
    const rule = puaForScreenCode(0x40).repeat(3);
    write(`top\n${rule}\ntail`);

    expect(readBack()).toBe(`top\n${rule}\ntail`);
    expect(readBack()).not.toContain('@@@');
  });

  it('still ends the body with exactly one newline', () => {
    write('one line');

    const file = path.join(root, `Conf${CONF}`, 'MsgBase', String(MSG_NUMBER));
    expect(fs.readFileSync(file, 'utf-8')).toBe('one line\n');
  });
});
