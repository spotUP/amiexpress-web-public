/**
 * The original AmiExpress sources (express.e and the rest) live outside the
 * repo, in ~/Code/Reference. AMIEXPRESS_REFERENCE points tests at
 * another copy. A machine without them skips the tests that read them.
 */
import * as fs from 'fs';
import * as path from 'path';

export const REFERENCE_ROOT = process.env.AMIEXPRESS_REFERENCE || '~/Code/Reference';
export const EXPRESS_E_PATH = path.join(REFERENCE_ROOT, 'AmiExpress-Sources', 'express.e');
export const HAS_EXPRESS_E = fs.existsSync(EXPRESS_E_PATH);

/** express.e as latin1 text, or '' when the reference sources are absent. */
export function readExpressE(): string {
  return HAS_EXPRESS_E ? fs.readFileSync(EXPRESS_E_PATH, 'latin1') : '';
}

/** `test` when express.e is on this machine, else `test.skip`. */
export const testWithExpressE: jest.It = HAS_EXPRESS_E ? test : test.skip;
