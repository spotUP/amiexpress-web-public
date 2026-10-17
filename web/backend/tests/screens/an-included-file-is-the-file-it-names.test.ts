/**
 * `~SS_BBS:Bulletins/bull1.txt` is displayFile(cmd) (express.e:5496-5502),
 * and displayFile opens that one name (express.e:6746): no security-level
 * walk. The port walked `bull1<level>` for assign paths, so the login's
 * BULL.TXT (`~SS_BBS:Bulletins/bull1.txt`) showed bull15.txt, the Exploit-DB
 * feed, to every caller at level 5 or more (live, 2026-10-17).
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});

import { loadScreenFile } from '../../src/handlers/screen.handler';
import { config } from '../../src/config';

test('an assign path loads the file it names, not a security variant of it', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-literal-'));
  fs.mkdirSync(path.join(root, 'Bulletins'));
  fs.writeFileSync(path.join(root, 'Bulletins', 'bull1.txt'), 'MULTITOP TOP TEN\r\n', 'latin1');
  fs.writeFileSync(path.join(root, 'Bulletins', 'bull15.txt'), 'EXPLOIT-DB FEED\r\n', 'latin1');

  const saved = config.get('dataDir');
  config.set('dataDir', root);
  try {
    const result = await loadScreenFile('BBS:Bulletins/bull1.txt', 1, 1,
      { nodeId: 1, screenWidth: 80, screenHeight: 25, user: { secLevel: 255 }, currentConf: 1 } as any);

    expect(result?.filePath).toBe(path.join(root, 'Bulletins', 'bull1.txt'));
    expect(String(result?.content)).toContain('MULTITOP TOP TEN');
  } finally {
    config.set('dataDir', saved);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
