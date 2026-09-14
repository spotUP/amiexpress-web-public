/**
 * A setting the sysop changes has to reach the board's file.
 *
 * TERMINAL_COLOURS shipped with a dropdown in the admin, a tooltype in the
 * writer's map, and no entry in the zod schema the API validates against.
 * Zod strips what it does not know, so the save returned success, the page
 * showed the new value until it was reloaded, and bbsConfig.info never heard
 * of it. The sysop set his board to eight colours and the board stayed at
 * sixteen (2026-09-14).
 *
 * Nothing typechecks that: the schema is a runtime object, and a field
 * missing from it is a field that silently disappears. So this drives the
 * validator the API actually calls, and then the writer, and reads the file.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SystemConfigSchema } from '../../src/services/config.schemas';
import { saveBBSConfig, loadBBSConfig } from '../../src/services/bbs-config-file.service';

describe('a board setting survives the save', () => {
  let board: string;

  beforeEach(() => {
    board = fs.mkdtempSync(path.join(os.tmpdir(), 'board-setting-'));
  });
  afterEach(() => {
    fs.rmSync(board, { recursive: true, force: true });
  });

  it('keeps terminal_colours through the validator the API uses', () => {
    const validated = SystemConfigSchema.partial().parse({ terminal_colours: 8 });

    expect(validated.terminal_colours).toBe(8);
  });

  it('writes it to the board, and reads the same answer back', () => {
    saveBBSConfig(board, { terminal_colours: 8 } as never);

    const text = fs.readFileSync(path.join(board, 'bbsConfig.info.txt'), 'utf8');
    expect(text).toContain('TERMINAL_COLOURS=8');
    expect(loadBBSConfig(board).terminal_colours).toBe(8);
  });

  it('takes sixteen back again', () => {
    saveBBSConfig(board, { terminal_colours: 8 } as never);
    saveBBSConfig(board, { terminal_colours: 16 } as never);

    expect(loadBBSConfig(board).terminal_colours).toBe(16);
  });

  it('refuses a number that is not a colour depth this board has', () => {
    // 8 or 16. A typo in a URL or a stale client should not put the board
    // into a state nothing reads.
    expect(() => SystemConfigSchema.partial().parse({ terminal_colours: 4 })).toThrow();
    expect(() => SystemConfigSchema.partial().parse({ terminal_colours: 256 })).toThrow();
  });
});
