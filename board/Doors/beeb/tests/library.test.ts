/**
 * What the board has installed, and the URL that runs it.
 *
 * The ROM names are the part worth pinning: they come from jsbeeb's
 * models.js and a wrong one is a black screen with no error anywhere.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { listTitles, missingRoms, urlFor, bareUrl, REQUIRED_ROMS, MODEL } from '../library';

/** A board root the SDK's resolveBbsRoot will accept: it needs Commands/BBSCmd. */
function board(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beeb-test-'));
  fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Beeb', 'roms', 'b'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Beeb', 'software'), { recursive: true });
  return root;
}

/** resolveBbsRoot walks up from a directory, so hand it one inside the board. */
function inside(root: string): string {
  return path.join(root, 'Commands', 'BBSCmd');
}

export async function theRomNamesAreTheOnesTheEmulatorAsksFor(): Promise<void> {
  // jsbeeb src/models.js: os: ["os.rom", "BASIC.ROM", "b/DFS-1.2.rom"].
  assert.deepStrictEqual(REQUIRED_ROMS, ['os.rom', 'BASIC.ROM', path.join('b', 'DFS-1.2.rom')]);
}

export async function anEmptyBoardReportsEveryMissingRom(): Promise<void> {
  const root = board();
  assert.deepStrictEqual(missingRoms(inside(root)), REQUIRED_ROMS);
  fs.rmSync(root, { recursive: true, force: true });
}

export async function aRomPresentIsNotReportedMissing(): Promise<void> {
  const root = board();
  fs.writeFileSync(path.join(root, 'Beeb', 'roms', 'os.rom'), Buffer.alloc(16384));
  const missing = missingRoms(inside(root));
  assert.ok(!missing.includes('os.rom'));
  assert.strictEqual(missing.length, REQUIRED_ROMS.length - 1);
  fs.rmSync(root, { recursive: true, force: true });
}

export async function aFullySetUpBoardReportsNothingMissing(): Promise<void> {
  const root = board();
  for (const name of REQUIRED_ROMS) {
    fs.writeFileSync(path.join(root, 'Beeb', 'roms', name), Buffer.alloc(16384));
  }
  assert.deepStrictEqual(missingRoms(inside(root)), []);
  fs.rmSync(root, { recursive: true, force: true });
}

export async function titlesAreListedAndTidied(): Promise<void> {
  const root = board();
  const software = path.join(root, 'Beeb', 'software');
  fs.writeFileSync(path.join(software, 'my_game.ssd'), Buffer.alloc(2048));
  fs.writeFileSync(path.join(software, 'another-one.dsd'), Buffer.alloc(4096));
  fs.writeFileSync(path.join(software, 'a_tape.uef'), Buffer.alloc(512));
  fs.writeFileSync(path.join(software, 'notes.txt'), 'ignored');

  const titles = listTitles(inside(root));
  assert.strictEqual(titles.length, 3, 'only loadable images are listed');
  assert.deepStrictEqual(titles.map(t => t.name), ['a tape', 'another one', 'my game']);
  assert.strictEqual(titles.find(t => t.file === 'a_tape.uef')?.kind, 'tape');
  assert.strictEqual(titles.find(t => t.file === 'my_game.ssd')?.kind, 'disc');
  assert.ok((titles.find(t => t.file === 'another-one.dsd')?.bytes ?? 0) > 0);
  fs.rmSync(root, { recursive: true, force: true });
}

export async function aBoardWithNoSoftwareFolderIsNotAnError(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beeb-bare-'));
  fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
  assert.deepStrictEqual(listTitles(inside(root)), []);
  fs.rmSync(root, { recursive: true, force: true });
}

export async function discsAndTapesLoadThroughDifferentParameters(): Promise<void> {
  const disc = { file: 'elite.ssd', name: 'elite', kind: 'disc' as const, bytes: 1 };
  const tape = { file: 'game.uef', name: 'game', kind: 'tape' as const, bytes: 1 };
  assert.strictEqual(urlFor(disc), `/beeb/?model=${MODEL}&disc1=elite.ssd&autoboot`);
  assert.strictEqual(urlFor(tape), `/beeb/?model=${MODEL}&tape=game.uef&autoboot`);
  assert.strictEqual(urlFor(disc, { autoboot: false }), `/beeb/?model=${MODEL}&disc1=elite.ssd`);
}

export async function aFilenameNeedingEscapingIsEscaped(): Promise<void> {
  const odd = { file: 'two words & more.ssd', name: 'x', kind: 'disc' as const, bytes: 1 };
  const url = urlFor(odd);
  assert.ok(!url.includes(' '), url);
  assert.ok(url.includes('%20') && url.includes('%26'), url);
}

export async function theModelIsPinnedSoItAsksForTheRomsWeDocument(): Promise<void> {
  // The emulator's models each want a different ROM set - Master wants
  // master/mos3.20, which is not one of the three a sysop is told to
  // install. An unpinned model asks for a ROM nobody has and reports a
  // missing ROM on a correctly set up board.
  assert.strictEqual(MODEL, 'B-DFS1.2');
  assert.ok(urlFor({ file: 'x.ssd', name: 'x', kind: 'disc', bytes: 1 }).includes(`model=${MODEL}`));
  assert.ok(bareUrl().includes(`model=${MODEL}`));
  assert.ok(REQUIRED_ROMS.some(r => r.includes('DFS-1.2')), 'the documented ROMs match the model');
}

export async function everyUrlStaysOnThisBoard(): Promise<void> {
  // The overlay puts a same-origin frame over the caller's session, so a
  // URL that left this board would hand that session away. The terminal
  // refuses anything that is not a rooted path; this keeps that promise
  // from the other end.
  const title = { file: 'x.ssd', name: 'x', kind: 'disc' as const, bytes: 1 };
  for (const url of [urlFor(title), bareUrl()]) {
    assert.ok(url.startsWith('/beeb/'), url);
    assert.ok(!url.startsWith('//'), url);
  }
}
