/**
 * Sysop notes about a user, on disk where express.e keeps them.
 *
 * express.e:31797-31799 - userNotes live in `bbsLoc/userNotes/<slotNumber>`,
 * one file per user slot. The account editor's `*` User Notes view reads and
 * writes them here; livechat's "Add note" appends through the same store via
 * BBSApi.addUserNote, so a note a sysop jots during a chat shows up in the
 * account editor and vice-versa - ONE notes store, not two.
 *
 * The folder is `DATABASE_DIR/userNotes` (default `./data/userNotes`) - the
 * exact path the account editor has always used; do not "fix" it to dataDir or
 * existing notes move out from under the `*` viewer.
 */
import * as path from 'path';
import * as amigafs from './amigafs';

export function getUserNotesFolder(): string {
  const dataDir = process.env.DATABASE_DIR || './data';
  return path.join(dataDir, 'userNotes');
}

/** express.e:21701 - StringF(fname,'\s\d',userNotesFolder,hoozer.slotNumber). */
export function getUserNotesPath(slotNumber: number): string {
  return path.join(getUserNotesFolder(), slotNumber.toString());
}

export function readUserNotes(slotNumber: number): string | null {
  try {
    const notesPath = getUserNotesPath(slotNumber);
    if (amigafs.existsSync(notesPath)) {
      const content = amigafs.readFileSync(notesPath, 'utf8');
      return typeof content === 'string' ? content : content.toString('utf8');
    }
  } catch (err) {
    console.error('Error reading user notes:', err);
  }
  return null;
}

export function saveUserNotes(slotNumber: number, content: string): boolean {
  try {
    const folder = getUserNotesFolder();
    // express.e:21698-21700 - create the folder on first write.
    if (!amigafs.existsSync(folder)) {
      amigafs.mkdirSync(folder, { recursive: true });
    }
    amigafs.writeFileSync(getUserNotesPath(slotNumber), content, 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving user notes:', err);
    return false;
  }
}

/**
 * Append one attributed, dated line to a user's notes, preserving what is
 * already there. Used by BBSApi.addUserNote (livechat "Add note"); the account
 * editor's `*` view then shows it. Returns false if the slot is invalid or the
 * write fails.
 */
export function appendUserNote(slotNumber: number, author: string, text: string): boolean {
  if (!slotNumber || slotNumber < 1) return false;
  const note = (text ?? '').trim();
  if (!note) return false;
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const line = `[${stamp}] (${(author || 'Sysop').trim()}) ${note}`;
  const existing = readUserNotes(slotNumber) ?? '';
  const next = existing ? `${existing.replace(/\n*$/, '\n')}${line}\n` : `${line}\n`;
  return saveUserNotes(slotNumber, next);
}
