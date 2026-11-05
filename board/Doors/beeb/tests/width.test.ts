/**
 * The listing has to fit the caller's screen.
 *
 * This door drew a 60-character rule and a 40-character name column
 * whatever the session was, so on a teletext screen - which is 40 columns -
 * every row wrapped and the list came apart. The board tells a door its
 * width; these insist the door reads it.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BeebApp, type DoorSession } from '../app';

function board(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beeb-width-'));
  fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
  const software = path.join(root, 'Beeb', 'software');
  fs.mkdirSync(software, { recursive: true });
  // A name longer than a narrow screen can hold, to force the trimming.
  fs.writeFileSync(path.join(software, 'a_very_long_program_name_indeed.ssd'), Buffer.alloc(4096));
  fs.writeFileSync(path.join(software, 'snake.ssd'), Buffer.alloc(2048));
  return root;
}

/** Every line the door painted, with the escape codes taken off. */
function paintedLines(width: number, height = 25): string[] {
  const chunks: string[] = [];
  const root = board();
  const session: DoorSession = {
    socket: { emit: (_e: string, data: string) => { chunks.push(data); }, on: () => {}, off: () => {} },
    bbsSession: { screenWidth: width, screenHeight: height, texttvMode: width <= 40 },
    user: { username: 'tester' },
    close: () => {},
  };
  const app = new BeebApp(session, path.join(root, 'Commands', 'BBSCmd'));
  app.start();
  app.stop();
  fs.rmSync(root, { recursive: true, force: true });
  return chunks
    .join('')
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .split(/\r?\n/);
}

export async function fitsAFortyColumnTeletextScreen(): Promise<void> {
  for (const line of paintedLines(40)) {
    assert.ok(line.length <= 40, `line is ${line.length} columns: ${JSON.stringify(line)}`);
  }
}

export async function usesTheRoomAnEightyColumnScreenGives(): Promise<void> {
  const lines = paintedLines(80);
  for (const line of lines) {
    assert.ok(line.length <= 80, `line is ${line.length} columns: ${JSON.stringify(line)}`);
  }
  // ...and actually uses it, rather than staying narrow.
  assert.ok(lines.some(l => l.length > 40), 'an 80 column screen should be used');
}

export async function theRuleMatchesTheScreenNotAConstant(): Promise<void> {
  const narrow = paintedLines(40).find(l => l.startsWith('---'));
  const wide = paintedLines(80).find(l => l.startsWith('---'));
  assert.strictEqual(narrow?.length, 40);
  assert.strictEqual(wide?.length, 80);
}

export async function aLongTitleIsTrimmedNotWrapped(): Promise<void> {
  const lines = paintedLines(40);
  const row = lines.find(l => /a very long program/i.test(l));
  assert.ok(row, 'the long title should be listed');
  assert.ok(row!.length <= 40, `the row wrapped: ${row!.length} columns`);
}
