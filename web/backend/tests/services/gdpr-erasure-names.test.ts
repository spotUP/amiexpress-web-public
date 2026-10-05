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

  it('replaces the handle, empties the logon line\'s location, and keeps every other byte, Latin-1 included', () => {
    const nodeDir = path.join(config.getConfig().dataDir, 'Node977');
    fs.mkdirSync(nodeDir, { recursive: true });
    const log = path.join(nodeDir, 'CallersLog');
    try {
      // A door's Latin-1 line (0xE5 = å), then the backend's line naming her.
      const before = Buffer.concat([
        Buffer.from([0x47, 0xe5, 0x72, 0x64, 0x0a]),
        Buffer.from('[3] -=Zed=- (LOCAL) Zedtown\n', 'latin1'),
        // express.e's logon line (16040), CRLF and a Latin-1 location.
        Buffer.from('10-04-26 (17:37:02) [3] -=Zed=- (CONNECT 19200) K\xF6ln\r\n', 'latin1'),
        // Another caller's logon line keeps his location.
        Buffer.from('10-04-26 (18:00:00) [4] bob (CONNECT 19200) Oslo\n', 'latin1'),
      ]);
      fs.writeFileSync(log, before);
      expect(__test_only__.redactRecentLogs('-=Zed=-', 'erased_1')).toBe(1);
      const after = fs.readFileSync(log);
      expect([...after.subarray(0, 5)]).toEqual([0x47, 0xe5, 0x72, 0x64, 0x0a]);
      expect(after.subarray(5).toString('latin1')).toBe(
        '[3] erased_1 (LOCAL) \n'
        + '10-04-26 (17:37:02) [3] erased_1 (CONNECT 19200) \r\n'
        + '10-04-26 (18:00:00) [4] bob (CONNECT 19200) Oslo\n',
      );
    } finally {
      fs.rmSync(nodeDir, { recursive: true, force: true });
    }
  });
});

describe('the erasure\'s Answers scrub', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require('path') as typeof import('path');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { config } = require('../../src/config');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { __test_only__ } = require('../../src/services/gdpr-erasure.service');

  it('removes her block and keeps another caller\'s Latin-1 answers byte for byte', () => {
    // new-user.handler writes Answers in Latin-1; the scrub read and wrote
    // UTF-8, so every other caller's 0xE5 (a-ring) became U+FFFD on disk.
    const nodeDir = path.join(config.getConfig().dataDir, 'Node978');
    fs.mkdirSync(nodeDir, { recursive: true });
    const answers = path.join(nodeDir, 'Answers');
    const banner = '**************************************************************\n';
    const bob = Buffer.from(`${banner}10-04-26 (18:00:00) [4] bob (CONNECT 19200) G\xE5rd\nFrom M\xE5lm\xF6\n`, 'latin1');
    try {
      fs.writeFileSync(answers, Buffer.concat([
        Buffer.from(`${banner}10-04-26 (17:37:02) [3] zedcaller (CONNECT 19200) Zedtown\nmy answers\n`, 'latin1'),
        bob,
      ]));
      expect(__test_only__.scrubAnswersFiles('zedcaller', 'erased_1')).toBe(1);
      const after = fs.readFileSync(answers);
      expect(after.toString('latin1')).not.toContain('zedcaller');
      expect(after.subarray(after.length - bob.length).equals(bob)).toBe(true);
    } finally {
      fs.rmSync(nodeDir, { recursive: true, force: true });
    }
  });
});
