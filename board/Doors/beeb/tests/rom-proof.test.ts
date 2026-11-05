/**
 * Nobody reaches the machine without showing the ROMs.
 *
 * The board keeps ONE copy of the BBC ROMs and ships none - Acorn's ROMs
 * are not ours to hand out - so every caller shows a copy of their own
 * once, the sysop included. The upload is read, checked and deleted; what
 * is kept is the fact that they showed it.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BeebApp, type DoorSession } from '../app';
import { hasProved } from '@amiexpress/bbs-door-sdk/beeb/proof-store';
import { ROM_BYTES } from '@amiexpress/bbs-door-sdk/beeb/roms';

/*
 * Resolved out of the SDK, which is where it actually lives: the door does
 * not depend on adm-zip, the SDK does, and at runtime the require happens
 * from inside sdk/dist where it resolves. Only this test, which BUILDS the
 * zips it sends, needs to reach it directly.
 */
const SDK_ROOT = path.join(__dirname, '..', '..', '..', 'sdk');
const AdmZip = require(require.resolve('adm-zip', { paths: [SDK_ROOT] }));

function scratch(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'beeb-proof-'));
}

/** A board with one disc on it and, optionally, the ROMs already installed. */
function board(withRoms = true): string {
  const root = scratch();
  fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
  const software = path.join(root, 'Beeb', 'software');
  fs.mkdirSync(software, { recursive: true });
  fs.writeFileSync(path.join(software, 'snake.ssd'), Buffer.alloc(2048));
  if (withRoms) {
    const roms = path.join(root, 'Beeb', 'roms', 'b');
    fs.mkdirSync(roms, { recursive: true });
    fs.writeFileSync(path.join(root, 'Beeb', 'roms', 'os.rom'), rom('OS', '1.20'));
    fs.writeFileSync(path.join(root, 'Beeb', 'roms', 'BASIC.ROM'), rom('BASIC', '2.00'));
    fs.writeFileSync(path.join(roms, 'DFS-1.2.rom'), rom('DFS', '1.20'));
  }
  return root;
}

function rom(title: string, version: string): Buffer {
  const bytes = Buffer.alloc(ROM_BYTES, 0xea);
  Buffer.from(title + '\u0000' + version + '\u0000', 'latin1').copy(bytes, 9);
  return bytes;
}

/** A zip a caller might send, holding the three kinds. */
function romZip(): string {
  const zip = new AdmZip();
  zip.addFile('OS12.ROM', rom('OS', '1.20'));
  zip.addFile('BASIC2.rom', rom('BASIC', '2.00'));
  zip.addFile('DFS-2.26.rom', rom('DFS', '2.26'));
  const file = path.join(scratch(), 'mine.zip');
  zip.writeZip(file);
  return file;
}

interface Harness {
  app: BeebApp;
  chunks: string[];
  events: Array<{ event: string; data: unknown }>;
  proofFile: string;
  uploads: number;
  text(): string;
  opened(): { url?: string } | null;
}

function harness(options: { withRoms?: boolean; upload?: () => string | null } = {}): Harness {
  const root = board(options.withRoms ?? true);
  const proofFile = path.join(scratch(), 'proven.json');
  const chunks: string[] = [];
  const events: Array<{ event: string; data: unknown }> = [];
  const state = { uploads: 0 };

  const session: DoorSession = {
    socket: {
      emit: (event: string, data?: unknown) => {
        events.push({ event, data });
        if (typeof data === 'string') chunks.push(data);
      },
      on: () => {},
      off: () => {},
    },
    bbsSession: { screenWidth: 80, screenHeight: 25 },
    user: { username: 'tester', id: 42 },
    bbs: {
      requestArchiveUpload: async () => {
        state.uploads++;
        const file = options.upload ? options.upload() : romZip();
        if (!file) throw new Error('the caller changed their mind');
        return { path: file, filename: path.basename(file) };
      },
      grantBeebRomAccess: () => 'a-grant',
    },
    close: () => {},
  };

  const app = new BeebApp(session, path.join(root, 'Commands', 'BBSCmd'), proofFile);
  app.start();
  return {
    app,
    chunks,
    events,
    proofFile,
    get uploads() { return state.uploads; },
    text: () => chunks.join('').replace(/\x1b\[[0-9;]*[A-Za-z]/g, ''),
    opened: () => {
      const hit = [...events].reverse().find(e => e.event === 'emulator:open');
      return hit ? (hit.data as { url?: string }) : null;
    },
  } as Harness;
}

/** Let the door's async launch settle. */
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

export async function anUnprovedCallerIsAskedForTheirRoms(): Promise<void> {
  const h = harness();
  assert.ok(h.text().includes('U=your ROMs') || h.text().includes('U uploads'),
    'the door says so before ENTER is pressed');
}

export async function pressingEnterAsksForTheRomsFirst(): Promise<void> {
  const h = harness();
  h.app.handleInput('\r');
  await settle();
  assert.strictEqual(h.uploads, 1, 'the caller was asked to upload');
  assert.ok(hasProved(h.proofFile, 42), 'and is proved afterwards');
  assert.ok(h.opened(), 'and the machine then opened');
}

export async function aProvedCallerIsNotAskedAgain(): Promise<void> {
  const h = harness();
  h.app.handleInput('\r');
  await settle();
  const asked = h.uploads;
  h.app.handleInput('\r');
  await settle();
  assert.strictEqual(h.uploads, asked, 'showing them once is enough');
}

export async function aRefusedArchiveDoesNotOpenTheMachine(): Promise<void> {
  // A zip with nothing ROM-shaped in it proves nothing.
  const empty = () => {
    const zip = new AdmZip();
    zip.addFile('readme.txt', Buffer.from('no roms here', 'latin1'));
    const file = path.join(scratch(), 'empty.zip');
    zip.writeZip(file);
    return file;
  };
  const h = harness({ upload: empty });
  h.app.handleInput('\r');
  await settle();
  assert.strictEqual(h.opened(), null, 'the machine stayed shut');
  assert.ok(!hasProved(h.proofFile, 42), 'and nothing was recorded');
  assert.ok(h.text().includes('Not accepted'), 'and it said so');
}

export async function theUploadIsDeletedWhateverHappens(): Promise<void> {
  // Nothing a caller sends is kept, and nothing they send is ever served.
  let sent = '';
  const h = harness({ upload: () => { sent = romZip(); return sent; } });
  h.app.handleInput('\r');
  await settle();
  assert.ok(sent, 'a file was sent');
  assert.strictEqual(fs.existsSync(sent), false, 'and it is gone');
}

export async function theGrantRidesOnTheEmulatorUrl(): Promise<void> {
  // The board refuses /beeb/roms without one.
  const h = harness();
  h.app.handleInput('\r');
  await settle();
  const url = h.opened()?.url ?? '';
  assert.ok(url.includes('grant=a-grant'), `the grant is on the URL: ${url}`);
}

export async function anEmptyBoardTakesItsCopyFromTheFirstProof(): Promise<void> {
  /*
   * A board with no ROMs cannot run anything, and the sysop is not exempt
   * from showing theirs - so the first person to prove also supplies the
   * board's single copy.
   */
  const h = harness({ withRoms: false });
  h.app.handleInput('\r');
  await settle();
  assert.ok(hasProved(h.proofFile, 42), 'they proved it');
  assert.ok(h.text().includes('board'), 'and were told their set seeded the board');
}
