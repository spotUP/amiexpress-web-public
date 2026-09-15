/**
 * THE LOGOFF BATCH REGENERATES QUICKNEW AGAIN.
 *
 * Every logoff batch on the live board had been logging
 * `Skipping missing program: doors:quicknew/quicknew` - the 68K binary is
 * not shipped, and the TypeScript generator that replaced it was deleted by
 * an unrelated commit along with the batch intercept that called it. The
 * quicknew screen showed 00 files for months. "re-enable quicknew" (sysop,
 * 2026-09-15).
 *
 * Driven through `runBatchFile` on a real batch file, with the generator
 * module mocked: what is pinned is that the Amiga line reaches the
 * generator with its config, its day count and its stdout redirect, instead
 * of being skipped as a missing program.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const generate = jest.fn(async () => 'screen');
jest.mock('../../src/utils/quicknew-generator', () => ({
  generateQuickNewFromConfig: (...args: unknown[]) => generate(...(args as [])),
}));

import { runBatchFile } from '../../src/services/batch-scheduler';

describe('the logoff batch regenerates quicknew', () => {
  it('hands the Amiga line to the generator instead of skipping a missing program', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-quicknew-'));
    const batch = path.join(dir, 'batch1');
    fs.writeFileSync(batch, [
      '.key node',
      '; a comment stays a comment',
      'doors:quicknew/quicknew doors:quicknew/quicknew.config1 7 >bbs:screens/quicknew.txt',
      '',
    ].join('\n'));

    await runBatchFile(batch, 1);

    expect(generate).toHaveBeenCalledTimes(1);
    const [configPath, daysBack, outputPath] = generate.mock.calls[0] as unknown as [string, number, string];
    expect(configPath).toMatch(/quicknew\.config1$/i);   // the assign resolved, the name kept
    expect(daysBack).toBe(7);
    expect(outputPath).toMatch(/quicknew\.txt$/i);       // the stdout redirect, resolved
  });
});
