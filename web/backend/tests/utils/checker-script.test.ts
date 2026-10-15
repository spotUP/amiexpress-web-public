/**
 * express.e checkFileExternal (18593-18603): a checker's SCRIPT tooltype runs
 * after the checker as `SCRIPT <file> <FilePart(file)> <node>`, output to NIL:.
 * The port never read SCRIPT.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/database', () => ({
  db: { query: async () => ({ rows: [] }) },
}));

import { config as appConfig } from '../../src/config';

const { testFile, TestResult, clearFileCheckerCache } = require('../../src/utils/file-test.util');

describe('a checker\'s SCRIPT runs after it with the file, its name and the node', () => {
  let root: string;
  let previousDataDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'fcheck-script-'));
    previousDataDir = appConfig.get('dataDir');
    appConfig.set('dataDir', root);
    fs.mkdirSync(path.join(root, 'FCheck'), { recursive: true });
    fs.mkdirSync(path.join(root, 'Node3', 'Playpen'), { recursive: true });
    clearFileCheckerCache();
  });

  afterEach(() => {
    appConfig.set('dataDir', previousDataDir);
    clearFileCheckerCache();
    fs.rmSync(root, { recursive: true, force: true });
  });

  function install(scriptBody: string): { record: string; upload: string } {
    const record = path.join(root, 'script-args');
    const checker = path.join(root, 'checker.sh');
    fs.writeFileSync(checker, `#!/bin/sh\necho "checker: infected"\n`, { mode: 0o755 });
    const script = path.join(root, 'script.sh');
    fs.writeFileSync(script, `#!/bin/sh\n${scriptBody.replace('RECORD', record)}\n`, { mode: 0o755 });
    fs.writeFileSync(
      path.join(root, 'FCheck', 'LHA.info'),
      `CHECKER=${checker}\nSCRIPT=${script}\nERROR.1=infected\n`,
    );
    const upload = path.join(root, 'Node3', 'Playpen', 'GAME.LHA');
    fs.writeFileSync(upload, 'lha bytes');
    clearFileCheckerCache();
    return { record, upload };
  }

  it('is run with SCRIPT <file> <FilePart(file)> <node>', async () => {
    const { record, upload } = install('printf "%s|%s|%s" "$1" "$2" "$3" > RECORD');

    await testFile(upload, root, { nodeId: 3 });

    expect(fs.readFileSync(record, 'utf8')).toBe(`${upload}|GAME.LHA|3`);
  });

  it('does not change the verdict, whatever the script does', async () => {
    const { record, upload } = install('printf ran > RECORD\necho "script says: all clear"\nexit 7');

    // The checker said "infected": the failing verdict stands after a script that exits 7.
    expect(await testFile(upload, root, { nodeId: 3 })).toBe(TestResult.FAILURE);
    expect(fs.existsSync(record)).toBe(true);
    // And the script's output is NIL: - not the uploader's.
    expect(fs.readFileSync(path.join(root, 'OutPut_Of_Test'), 'utf8')).not.toContain('all clear');
  });
});
