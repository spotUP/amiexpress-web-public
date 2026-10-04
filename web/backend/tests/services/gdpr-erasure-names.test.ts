/**
 * Which HeaderFile names are the erased caller's.
 *
 * A message is posted under the handle, or under the real name in a REALNAME
 * conference (getConfMailNameFor, express.e:5017-5024), and the HeaderFile
 * keeps 30 characters of it. A real name is matched only where the board posts
 * under real names: elsewhere the same words can be another caller's handle,
 * and erasing them would erase somebody else.
 */
process.env.SKIP_DB_INIT = '1';

import { headerNameIsTheCaller } from '../../src/services/gdpr-erasure.service';

const names = { username: 'alicezed', realnames: ['Bob Bobson', undefined] };

describe('an erased caller\'s name in a HeaderFile', () => {
  it('is the handle in any conference, whatever the case', () => {
    expect(headerNameIsTheCaller('ALICEZED', names, false)).toBe(true);
    expect(headerNameIsTheCaller('alicezed2', names, false)).toBe(false);
  });

  it('is the real name only in a REALNAME conference', () => {
    expect(headerNameIsTheCaller('Bob Bobson', names, true)).toBe(true);
    // Another caller's handle that happens to be the same words.
    expect(headerNameIsTheCaller('Bob Bobson', names, false)).toBe(false);
  });

  it('is compared as the 30-character field cut it', () => {
    const long = { username: 'x'.repeat(35), realnames: [] };
    expect(headerNameIsTheCaller('x'.repeat(30), long, false)).toBe(true);
  });
});

describe('the erasure\'s CallersLog redaction', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require('path') as typeof import('path');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { config } = require('../../src/config');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { __test_only__ } = require('../../src/services/gdpr-erasure.service');

  it('replaces the handle and keeps every other byte, Latin-1 included', () => {
    const nodeDir = path.join(config.getConfig().dataDir, 'Node977');
    fs.mkdirSync(nodeDir, { recursive: true });
    const log = path.join(nodeDir, 'CallersLog');
    try {
      // A door's Latin-1 line (0xE5 = å), then the backend's line naming her.
      const before = Buffer.concat([
        Buffer.from([0x47, 0xe5, 0x72, 0x64, 0x0a]),
        Buffer.from('[3] -=Zed=- (LOCAL) Zedtown\n', 'latin1'),
      ]);
      fs.writeFileSync(log, before);
      expect(__test_only__.redactRecentLogs('-=Zed=-', 'erased_1')).toBe(1);
      const after = fs.readFileSync(log);
      expect([...after.subarray(0, 5)]).toEqual([0x47, 0xe5, 0x72, 0x64, 0x0a]);
      expect(after.subarray(5).toString('latin1')).toBe('[3] erased_1 (LOCAL) Zedtown\n');
    } finally {
      fs.rmSync(nodeDir, { recursive: true, force: true });
    }
  });
});
