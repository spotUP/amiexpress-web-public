/**
 * XIM_DEBUG_JSON=1 with no log file yet: the logger starts, writes LOG_START
 * and keeps one stream. It used to re-enter initLogStream from its own
 * LOG_START entry until the stack overflowed.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xim-json-init-'));
const logFile = path.join(dir, 'fresh', 'xim.json');
process.env.XIM_DEBUG_JSON = '1';
process.env.XIM_LOG_FILE = logFile;
process.env.XIM_AMIGA_LOG = path.join(dir, 'amiga.log');

afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

test('a fresh JSON log starts without a stack overflow and holds LOG_START', async () => {
  const errors: string[] = [];
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a.map(String).join(' ')); });
  const { ximLogger } = require('../../src/utils/XIMLogger');
  ximLogger.log('debug', 'receive', 'W', 1, { type: 'FIRST', typeCode: 1 });
  ximLogger.log('debug', 'receive', 'W', 1, { type: 'SECOND', typeCode: 2 });
  ximLogger.close();
  await new Promise((r) => setTimeout(r, 200));
  expect(errors.join('\n')).not.toMatch(/Stack overflow|Failed to initialize/);
  const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const types = lines.map((l) => l.message.type);
  expect(types.filter((t: string) => t === 'LOG_START')).toHaveLength(1);
  expect(types).toEqual(expect.arrayContaining(['FIRST', 'SECOND']));
});
