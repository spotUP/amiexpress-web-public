/**
 * The text companion is the configuration; the icon is a compatibility copy.
 *
 * Precedence used to go to whichever file was NEWER. That looked reasonable
 * and was decided by milliseconds: saveBBSConfig writes the companion first
 * and always, then ATTEMPTS the icon - and the icon attempt is allowed to
 * fail or to land carrying values the update could not reach, because an icon
 * whose tooltype array is not in the standard layout is left untouched by
 * design.
 *
 * The live board 2026-09-07: companion SMTP_PORT=587, icon 465 with SMTP_HOST
 * twice and length bytes baked into three keys, both written in the same
 * second. 465 is unreachable from that host, so the achievements mail hung and
 * the drain died - and the effective port changed between two runs minutes
 * apart, because it was settled by whichever file the filesystem stamped last.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadBBSConfig, disagreeingKeys } from '../../src/services/bbs-config-file.service';

let dir: string;

/** A companion in the writer's own format: one KEY=VALUE per line. */
const writeCompanion = (lines: string[]) =>
  fs.writeFileSync(path.join(dir, 'bbsConfig.info.txt'), lines.join('\n') + '\n', 'utf-8');

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbscfg-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('which file the board believes', () => {
  it('takes the companion even when the icon was written afterwards', () => {
    writeCompanion(['SMTP_HOST=smtp.gmail.com', 'SMTP_PORT=587', 'BBS_NAME=Up Rough']);
    // The icon lands LAST, which is exactly what the writer does, and it
    // carries the stale port. Newest-wins gave this file the argument.
    fs.writeFileSync(path.join(dir, 'bbsConfig.info'), 'not a real icon', 'binary');
    const later = Date.now() / 1000 + 5;
    fs.utimesSync(path.join(dir, 'bbsConfig.info'), later, later);

    const config = loadBBSConfig(dir) as Record<string, unknown>;

    expect(String(config.smtp_port)).toBe('587');
  });

  it('still reads a board that has only an icon', () => {
    // A board before its first save has no companion, and must not come up
    // with an empty configuration.
    const iconOnly = path.join(dir, 'bbsConfig.info');
    fs.writeFileSync(iconOnly, 'not a real icon', 'binary');

    expect(() => loadBBSConfig(dir)).not.toThrow();
  });

  it('names the keys the two files disagree on', () => {
    const icon = new Map([['SMTP_PORT', '465'], ['SMTP_HOST', 'smtp.gmail.com'], ['BBS_NAME', 'Old']]);
    const text = new Map([['SMTP_PORT', '587'], ['SMTP_HOST', 'smtp.gmail.com'], ['BBS_NAME', 'Up Rough']]);

    expect(disagreeingKeys(icon, text)).toEqual(['BBS_NAME', 'SMTP_PORT']);
  });

  it('does not call a switched-off flag a disagreement', () => {
    // A boolean is expressed by PRESENCE: absent from the companion means the
    // sysop turned it off, which is a decision, not a conflict.
    const icon = new Map([['SMTP_SSL', ''], ['SMTP_PORT', '587']]);
    const text = new Map([['SMTP_PORT', '587']]);

    expect(disagreeingKeys(icon, text)).toEqual([]);
  });
});
