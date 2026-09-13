/**
 * "add the petscii font variant setting to W" - the sysop, 2026-09-13.
 *
 * The Swedish character set was built and could not be switched on: nothing
 * set the session flag, so the variant was dormant for everyone. W is where a
 * caller changes what the board does for them, and row 21 is already the
 * PETSCII palette - so the set belongs at row 22, beside it.
 *
 * These pin the numbering and the persistence, which is where this kind of
 * change goes wrong: a new row that pushes the settings doors down by one
 * without anyone noticing, or a preference that is shown but never saved.
 */
import * as fs from 'fs';
import * as path from 'path';

import { FIRST_SETTINGS_DOOR_OPTION } from '../../src/handlers/commands/info-commands.handler';

const src = (f: string) => fs.readFileSync(path.join(__dirname, '../../src', f), 'utf8');

describe('W row 22', () => {
  it('leaves room for itself before the settings doors', () => {
    // 21 is the palette, 22 is the character set, and the doors start after.
    expect(FIRST_SETTINGS_DOOR_OPTION).toBe(23);
  });

  it('is shown with the value the caller has', () => {
    const text = src('handlers/commands/info-commands.handler.ts');
    expect(text).toContain('PETSCII CHARACTER SET');
    expect(text).toMatch(/petsciiCharset === 'swedish'/);
    // Both states are named, so the row reads as a choice rather than a flag.
    expect(text).toContain("'SWEDISH'");
    expect(text).toContain("'STANDARD'");
  });

  it('saves the choice, and tells the screen at once', () => {
    const text = src('handlers/commands/info-commands.handler.ts');
    // Persisted like the palette beside it...
    expect(text).toMatch(/updateUser\(session\.user\.id, \{ petsciiCharset: next \}\)/);
    // ...and applied without making the caller reconnect.
    expect(text).toContain("socket.emit('petscii-charset'");
  });

  it('travels on the mode event, so a reconnecting caller keeps it', () => {
    const text = src('handlers/command-handler/pre-login.ts');
    expect(text).toMatch(/charset: \(session\.user\?\.petsciiCharset === 'swedish'/);
  });

  it('is standard unless the caller asked otherwise - $5C is the pound sign', () => {
    const repo = src('database/user-repository.ts');
    expect(repo).toMatch(/petsciiCharset: user\.petsciicharset === 'swedish' \? 'swedish' : 'standard'/);
  });
});
