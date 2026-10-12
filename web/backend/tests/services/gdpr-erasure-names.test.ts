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
import { setBoardRoot } from '../helpers/board-root';

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

describe('the erasure and the central answers file', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require('path') as typeof import('path');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { config } = require('../../src/config');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { __test_only__ } = require('../../src/services/gdpr-erasure.service');

  it('removes Answers/<slot> - the account\'s own file - and no other', () => {
    const dir = path.join(config.getConfig().dataDir, 'Answers');
    fs.mkdirSync(dir, { recursive: true });
    const mine = path.join(dir, '9977');
    const theirs = path.join(dir, '9978');
    fs.writeFileSync(mine, 'my answers');
    fs.writeFileSync(theirs, 'their answers');
    try {
      expect(__test_only__.scrubAnswersFiles('nobody-here', 'erased_1', 9977)).toBe(1);
      expect(fs.existsSync(mine)).toBe(false);
      expect(fs.readFileSync(theirs, 'latin1')).toBe('their answers');
    } finally {
      fs.rmSync(mine, { force: true });
      fs.rmSync(theirs, { force: true });
    }
  });
});

describe('the erasure and the sysop\'s safety copies', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const os = require('os') as typeof import('os');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require('path') as typeof import('path');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { __test_only__, backupCopiesOf } = require('../../src/services/gdpr-erasure.service');

  const record = (name: string, size: number) => {
    const b = Buffer.alloc(size, 0x41);
    b.fill(0, 0, 31);
    b.write(name, 0, 'latin1');
    return b;
  };

  it('blanks the caller\'s record in a user.data copy, and the same slot in its .keys copy, by name', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gdpr-backups-'));
    const restoreBoard = setBoardRoot(root);
    try {
      fs.writeFileSync(path.join(root, 'user.data'), record('live', 232));
      const data = path.join(root, 'user.data.pre-swap-20261004.backup');
      const keys = path.join(root, 'user.keys.pre-swap-20261004.backup');
      fs.writeFileSync(data, Buffer.concat([record('other', 232), record('Zed', 232)]));
      fs.writeFileSync(keys, Buffer.concat([record('other', 56), record('Zed', 56)]));
      expect(backupCopiesOf(path.join(root, 'user.data'))).toEqual([data]);

      expect(__test_only__.blankAccountInBackups('zed')).toBe(1);
      const d = fs.readFileSync(data);
      expect(d.subarray(0, 5).toString('latin1')).toBe('other');
      expect(d.subarray(232).every((x: number) => x === 0)).toBe(true);
      const k = fs.readFileSync(keys);
      expect(k.subarray(0, 5).toString('latin1')).toBe('other');
      expect(k.subarray(56).every((x: number) => x === 0)).toBe(true);
    } finally {
      restoreBoard();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('scrubs the caller\'s answers in a Node Answers safety copy too', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { config } = require('../../src/config');
    const nodeDir = path.join(config.getConfig().dataDir, 'Node979');
    fs.mkdirSync(nodeDir, { recursive: true });
    const copy = path.join(nodeDir, 'Answers.pre-central-20261005.backup');
    const banner = '**************************************************************\n';
    fs.writeFileSync(copy, `${banner}10-04-26 (17:37:02) [3] zedcaller (CONNECT 19200) Zedtown\nmine\n`, 'latin1');
    try {
      expect(__test_only__.scrubAnswersFiles('zedcaller', 'erased_1')).toBe(1);
      expect(fs.readFileSync(copy, 'latin1')).not.toContain('zedcaller');
    } finally {
      fs.rmSync(nodeDir, { recursive: true, force: true });
    }
  });
});
