/**
 * A DOOR'S ART SURVIVES THE DEPLOY THAT FOLLOWS IT.
 *
 * `door.settings.json` declares art slots - `"art": true` on a string setting
 * whose value is a filename relative to the door's own folder. REQUESTS
 * declares two: `Bulletin_Header.txt` and `Bulletin_Tail.txt`, the art above
 * and below the request table.
 *
 * They are tracked in git and shipped in the image, and the entrypoint's
 * exclude harvesting read only `cfgFile` - so the blanket `tar` over `Doors`
 * put the image's committed copy back over the art the sysop had uploaded, on
 * every deploy: "the bulletin header and footer gets reset on deploys" (sysop,
 * 2026-09-16). Checked on the live board the same minute: both files
 * byte-identical to the image's.
 *
 * Fifth instance of one shape in this entrypoint - Access/*.info, the nine 68K
 * door state files, `quicknew.txt`, and every screen the sysop edited were the
 * others - and the cure is the rule the cfg files already use: join the tracked
 * set, where the image leads until the sysop takes a file over.
 *
 * Driven through the real shell out of the real entrypoint, and the manifest
 * parsing is driven against the REPO'S OWN `Doors/REQUESTS/door.settings.json`
 * as well as a staged one: a manifest this awk cannot read would otherwise
 * lose the art silently.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const REPO = path.join(__dirname, '..', '..', '..', '..');
const ENTRYPOINT = path.join(REPO, 'docker-entrypoint.sh');

function extractFunctions(): string {
  const source = fs.readFileSync(ENTRYPOINT, 'utf8');
  const start = source.indexOf('DEPLOY_MANIFEST="$BBS_DATA_DIR/.deployed-manifest"');
  const end = source.indexOf('sync_image_owned() {');
  if (start === -1 || end === -1 || end < start) throw new Error('the deploy helpers moved');
  return source.slice(start, end);
}

function extractCodeSyncDirs(): string {
  const line = /^CODE_SYNC_DIRS="[^"]*"$/m.exec(fs.readFileSync(ENTRYPOINT, 'utf8'));
  if (!line) throw new Error('CODE_SYNC_DIRS was not found in docker-entrypoint.sh');
  return line[0];
}

/** The real cfg/art discovery and Doors sync, lifted verbatim. */
function extractDoorsSync(): string {
  const source = fs.readFileSync(ENTRYPOINT, 'utf8');
  const start = source.indexOf('    DOOR_CFG_LIST=$(mktemp)');
  const tail = 'rm -f "$DOOR_CFG_LIST" "$DOOR_CFG_EXCLUDES"';
  const end = source.indexOf(tail);
  if (start === -1 || end === -1 || end < start) throw new Error('the Doors sync was not found');
  return `${extractCodeSyncDirs()}\n${source.slice(start, end + tail.length)}`;
}

const MANIFEST = {
  command: 'REQ',
  cfgFile: 'REQUESTS.cfg',
  settings: [
    { key: 'maxRequests', label: 'Max', type: 'number', cfgKey: 'MaxRequests', default: 50 },
    {
      key: 'bulletinHeader', cfgKey: 'BulletinHeader', label: 'Bulletin header art',
      type: 'string', art: true, default: 'Bulletin_Header.txt',
    },
    {
      key: 'bulletinTail', cfgKey: 'BulletinTail', label: 'Bulletin tail art',
      type: 'string', art: true, default: 'Bulletin_Tail.txt',
    },
  ],
};

let root: string;
const door = (side: string, name: string) => path.join(root, side, 'Doors', 'REQUESTS', name);
const onVolume = (name: string) => fs.readFileSync(door('volume', name), 'utf8');

function boot(): void {
  execFileSync('bash', ['-c', `
    set -u
    DEFAULT_DATA_DIR="${root}/image"
    BBS_DATA_DIR="${root}/volume"
    ${extractFunctions()}
    TRACKED_CREATED=0; TRACKED_UPDATED=0; TRACKED_KEPT=0; TRACKED_ADOPTED=0; TRACKED_FAILED=0
    ${extractDoorsSync()}
    [ -f "$DEPLOY_MANIFEST_NEXT" ] && mv "$DEPLOY_MANIFEST_NEXT" "$DEPLOY_MANIFEST"
    exit 0
  `], { encoding: 'utf8' });
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'door-art-deploy-'));
  for (const side of ['image', 'volume']) {
    fs.mkdirSync(path.join(root, side, 'Doors', 'REQUESTS'), { recursive: true });
  }
  fs.writeFileSync(door('image', 'door.settings.json'), JSON.stringify(MANIFEST, null, 2));
  fs.writeFileSync(door('image', 'REQUESTS.cfg'), 'MaxRequests=50\n');
  fs.writeFileSync(door('image', 'Bulletin_Header.txt'), 'the art the door shipped with\n');
  fs.writeFileSync(door('image', 'Bulletin_Tail.txt'), 'the tail the door shipped with\n');
  // An ordinary door file, which the image still owns outright.
  fs.writeFileSync(door('image', 'requests'), 'the binary\n');
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('door art across a deploy', () => {
  it('keeps the header and tail the sysop uploaded', () => {
    boot(); // first boot places the image's art
    expect(onVolume('Bulletin_Header.txt')).toBe('the art the door shipped with\n');

    // The artist uploads through the admin's door-art editor.
    fs.writeFileSync(door('volume', 'Bulletin_Header.txt'), 'the sysop uploaded logo\n');
    fs.writeFileSync(door('volume', 'Bulletin_Tail.txt'), 'the sysop uploaded tail\n');

    boot();

    expect(onVolume('Bulletin_Header.txt')).toBe('the sysop uploaded logo\n');
    expect(onVolume('Bulletin_Tail.txt')).toBe('the sysop uploaded tail\n');
  });

  it('survives more than one deploy, not just the next one', () => {
    boot();
    fs.writeFileSync(door('volume', 'Bulletin_Header.txt'), 'the sysop uploaded logo\n');

    boot(); boot(); boot();

    expect(onVolume('Bulletin_Header.txt')).toBe('the sysop uploaded logo\n');
  });

  it('still lets the image lead art the sysop has never touched', () => {
    boot();
    // A redrawn default in a new release reaches a board that never edited it.
    fs.writeFileSync(door('image', 'Bulletin_Header.txt'), 'the redrawn default\n');

    boot();

    expect(onVolume('Bulletin_Header.txt')).toBe('the redrawn default\n');
  });

  it('still overwrites an ordinary door file from the image', () => {
    // The exclusion has to be surgical: a door whose binary stopped updating
    // would be a worse bug than the one being fixed.
    boot();
    fs.writeFileSync(door('volume', 'requests'), 'a stale binary\n');

    boot();

    expect(onVolume('requests')).toBe('the binary\n');
  });

  it('seeds a board that has no art yet', () => {
    boot();

    expect(fs.existsSync(door('volume', 'Bulletin_Header.txt'))).toBe(true);
  });

  it('reads the art slots out of the repo’s own REQUESTS manifest', () => {
    // The staged manifest above is written by JSON.stringify; the real one is
    // hand-maintained. If the awk cannot read THAT file, the live board loses
    // its art and every test above still passes.
    const real = path.join(REPO, 'Doors', 'REQUESTS', 'door.settings.json');
    const script = fs.readFileSync(ENTRYPOINT, 'utf8');
    const awkStart = script.indexOf("        awk 'BEGIN { RS = \"}\" }");
    const awkEnd = script.indexOf("' \"$manifest\"", awkStart);
    if (awkStart === -1 || awkEnd === -1) throw new Error('the art-slot awk was not found');
    const program = script.slice(awkStart, awkEnd).replace(/^\s*awk '/, '');

    const found = execFileSync('awk', [program, real], { encoding: 'utf8' })
      .split('\n').filter(Boolean).sort();

    expect(found).toEqual(['Bulletin_Header.txt', 'Bulletin_Tail.txt']);
    // And those files are really there to be protected.
    for (const name of found) {
      expect(fs.existsSync(path.join(REPO, 'Doors', 'REQUESTS', name))).toBe(true);
    }
  });

  it('holds back every magazine art slot the Studio can edit, from the repo manifest', () => {
    // The magazine ships 15 placeholder screens under art/ and the Studio
    // saves over them in place: the exclusion must name each one.
    const real = path.join(REPO, 'Doors', 'magazine', 'door.settings.json');
    const script = fs.readFileSync(ENTRYPOINT, 'utf8');
    const awkStart = script.indexOf("        awk 'BEGIN { RS = \"}\" }");
    const awkEnd = script.indexOf("' \"$manifest\"", awkStart);
    const program = script.slice(awkStart, awkEnd).replace(/^\s*awk '/, '');
    const found = execFileSync('awk', [program, real], { encoding: 'utf8' }).split('\n').filter(Boolean).sort();
    expect(found).toHaveLength(15);
    for (const name of found) {
      expect(name).toMatch(/^art\/(mag|sec)_[a-z_]+\.ans$/);
      expect(fs.existsSync(path.join(REPO, 'Doors', 'magazine', name))).toBe(true);
    }
  });

  it('keeps a Studio edit of a magazine screen across deploys while the image leads untouched ones', () => {
    const mag = (side: string, rel: string) => path.join(root, side, 'Doors', 'magazine', rel);
    for (const side of ['image']) {
      fs.mkdirSync(mag(side, 'art'), { recursive: true });
      fs.writeFileSync(mag(side, 'door.settings.json'), JSON.stringify({
        command: 'MAG',
        settings: ['mag_title', 'mag_front'].map((n) => ({
          key: `art_${n}`, label: n, type: 'string', art: true, default: `art/${n}.ans`,
        })),
      }, null, 2));
      fs.writeFileSync(mag(side, 'art/mag_title.ans'), 'placeholder title\n');
      fs.writeFileSync(mag(side, 'art/mag_front.ans'), 'placeholder front\n');
    }
    fs.mkdirSync(path.dirname(mag('volume', 'art/x')), { recursive: true });
    boot();
    fs.writeFileSync(mag('volume', 'art/mag_title.ans'), 'the artist drew this\n');
    fs.writeFileSync(mag('image', 'art/mag_front.ans'), 'redrawn placeholder\n');
    boot(); boot();
    expect(fs.readFileSync(mag('volume', 'art/mag_title.ans'), 'utf8')).toBe('the artist drew this\n');
    expect(fs.readFileSync(mag('volume', 'art/mag_front.ans'), 'utf8')).toBe('redrawn placeholder\n');
  });

  it('keeps a Studio edit of a magazine filler piece across deploys while the image leads untouched ones', () => {
    // The filler is declared as an art FOLDER (artFolders: art/fill), not one setting per piece.
    const mag = (side: string, rel: string) => path.join(root, side, 'Doors', 'magazine', rel);
    fs.mkdirSync(mag('image', 'art/fill'), { recursive: true });
    fs.writeFileSync(mag('image', 'door.settings.json'), JSON.stringify({
      command: 'MAG',
      settings: [{ key: 'show_ticker', label: 'Ticker', type: 'boolean', default: true }],
      artFolders: [{ dir: 'art/fill', label: 'Filler', maxLines: 25, maxLineLength: 80, commands: ['MAG'] }],
    }, null, 2));
    fs.writeFileSync(mag('image', 'art/fill/mortimer_01.txt'), 'shipped one\n');
    fs.writeFileSync(mag('image', 'art/fill/mortimer_02.txt'), 'shipped two\n');
    fs.mkdirSync(mag('volume', 'art'), { recursive: true });
    boot();
    fs.writeFileSync(mag('volume', 'art/fill/mortimer_01.txt'), 'the artist redrew this\n');
    fs.writeFileSync(mag('image', 'art/fill/mortimer_02.txt'), 'redrawn shipped two\n');
    boot(); boot();
    expect(fs.readFileSync(mag('volume', 'art/fill/mortimer_01.txt'), 'utf8')).toBe('the artist redrew this\n');
    expect(fs.readFileSync(mag('volume', 'art/fill/mortimer_02.txt'), 'utf8')).toBe('redrawn shipped two\n');
  });
});
