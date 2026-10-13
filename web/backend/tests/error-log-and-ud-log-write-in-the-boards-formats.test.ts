// express.e:8968-8993 errorLog, 9520-9541 udLog, 9542-9545 udLogDivider.
// errorLog stamps formatLongDate/formatLongTime (MiscFuncs.e:278-318, FORMAT_USA:
// MM-DD-YY, HH:MM:SS) then a space, the text and a newline. udLog writes
// Node<n>/UDLog only when DO_UD_LOG is on and the open works - a missing Node
// directory is not created and not redirected.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nodelogs-'));
jest.mock('../src/utils/board-root.util', () => ({ boardRoot: () => root }));

import { errorLog } from '../src/utils/node-logs.util';
import { writeToUDLog, logDivider } from '../src/utils/download-logging.util';
import { setACSConfig, getACSConfig, LevelFlags } from '../src/utils/acs.util';

const setDoUdLog = (on: boolean) => {
  const acLvl = [...getACSConfig().acLvl];
  acLvl[LevelFlags.DO_UD_LOG] = on ? 1 : 0;
  setACSConfig({ acLvl });
};

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('node logs', () => {
  it('errorLog stamps MM-DD-YY HH:MM:SS, a space, the text', () => {
    errorLog(root, 3, 'bad thing');
    const text = fs.readFileSync(path.join(root, 'Node3', 'ErrorLog'), 'utf8');
    expect(text).toMatch(/^\d\d-\d\d-\d\d \d\d:\d\d:\d\d bad thing\n$/);
  });

  it('udLog appends lines and the divider to the node UDLog when DO_UD_LOG is on', async () => {
    fs.mkdirSync(path.join(root, 'Node2'));
    setDoUdLog(true);
    await writeToUDLog('\tDownloading a 5 bytes', 2);
    await logDivider(2);
    expect(fs.readFileSync(path.join(root, 'Node2', 'UDLog'), 'utf8'))
      .toBe('\tDownloading a 5 bytes\n' + '*'.repeat(62) + '\n');
  });

  it('udLog writes nothing when DO_UD_LOG is off or the node directory is missing', async () => {
    setDoUdLog(false);
    await writeToUDLog('off', 2);
    expect(fs.readFileSync(path.join(root, 'Node2', 'UDLog'), 'utf8')).not.toContain('off');
    setDoUdLog(true);
    const cwdLogs = path.join(process.cwd(), 'logs', 'UDLog');
    const before = fs.existsSync(cwdLogs) ? fs.statSync(cwdLogs).size : -1;
    await writeToUDLog('nowhere', 9);
    expect(fs.existsSync(path.join(root, 'Node9'))).toBe(false);
    expect(fs.existsSync(cwdLogs) ? fs.statSync(cwdLogs).size : -1).toBe(before);
  });
});
