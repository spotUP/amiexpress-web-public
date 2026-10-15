/**
 * ">>file" on a batch line appends; ">file" replaces. The scheduler parsed
 * ">>" (parseAmigaCommandLine) but always truncated the file, so a batch that
 * logged each run into one file kept only the last.
 *
 * One reachability test (runBatchFile -> executeLine -> the 68K launcher, here
 * a stand-in that returns fixed stdout) plus the writer's own cases.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const mockRun = jest.fn(async () => ({ output: 'line\n', code: 0 }));
jest.mock('../src/utils/amiga-program-runner.util', () => ({
  runAmigaProgram: (...a: unknown[]) => (mockRun as (...x: unknown[]) => unknown)(...a),
}));

import { runBatchFile, writeRedirectedOutput } from '../src/services/batch-scheduler';

describe('batch line output redirection', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-append-')); mockRun.mockClear(); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('reachability: ">>" appends across two runs of a batch line, ">" replaces', async () => {
    const prog = path.join(dir, 'Prog');
    fs.writeFileSync(prog, 'x');
    const out = path.join(dir, 'log.txt');
    const append = path.join(dir, 'append');
    const replace = path.join(dir, 'replace');
    fs.writeFileSync(append, `${prog} >>${out}\n`);
    fs.writeFileSync(replace, `${prog} >${out}\n`);
    await runBatchFile(append, 1);
    await runBatchFile(append, 1);
    expect(mockRun).toHaveBeenCalledTimes(2); // sentinel: the program really ran
    expect(fs.readFileSync(out, 'utf8')).toBe('line\nline\n');
    await runBatchFile(replace, 1);
    expect(fs.readFileSync(out, 'utf8')).toBe('line\n');
  });

  test('writeRedirectedOutput creates the file on first append and truncates without append', () => {
    const f = path.join(dir, 'sub', 'f.txt');
    writeRedirectedOutput(f, 'a', true);
    writeRedirectedOutput(f, 'b', true);
    expect(fs.readFileSync(f, 'utf8')).toBe('ab');
    writeRedirectedOutput(f, 'c', false);
    expect(fs.readFileSync(f, 'utf8')).toBe('c');
  });
});
