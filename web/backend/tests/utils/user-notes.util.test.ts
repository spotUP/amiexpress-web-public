/**
 * The one user-notes store: appendUserNote writes where the account editor's
 * `*` User Notes view reads (DATABASE_DIR/userNotes/<slot>), so a note added in
 * livechat shows up there and vice-versa.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'usernotes-'));
  process.env.DATABASE_DIR = root;
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); delete process.env.DATABASE_DIR; });

// Imported after DATABASE_DIR is set (the folder is read per-call, so order is fine).
import { appendUserNote, readUserNotes, getUserNotesPath } from '../../src/utils/user-notes.util';

describe('appendUserNote', () => {
  it('writes an attributed, dated line the notes view can read back', () => {
    expect(appendUserNote(7, 'spot', 'kept flooding the board')).toBe(true);
    const notes = readUserNotes(7)!;
    expect(notes).toContain('(spot)');
    expect(notes).toContain('kept flooding the board');
    // Lands at the account-editor path for slot 7.
    expect(fs.existsSync(getUserNotesPath(7))).toBe(true);
  });

  it('appends without destroying earlier notes', () => {
    appendUserNote(7, 'spot', 'first');
    appendUserNote(7, 'op2', 'second');
    const notes = readUserNotes(7)!;
    expect(notes).toContain('first');
    expect(notes).toContain('second');
    expect(notes.indexOf('first')).toBeLessThan(notes.indexOf('second'));
  });

  it('refuses an invalid slot or empty text', () => {
    expect(appendUserNote(0, 'spot', 'x')).toBe(false);
    expect(appendUserNote(7, 'spot', '   ')).toBe(false);
    expect(readUserNotes(7)).toBeNull();
  });
});
