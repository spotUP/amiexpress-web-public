/**
 * What a sysop is looking at, without having to work it out.
 *
 * "We need to derive proper user bbs data for everything we can so the sysops
 * knows directly what he is looking at generic confxx bullxx etc is not
 * enough." A path is not an answer: `Conf2/bull20.txt` is "the bulletin a
 * caller meets on joining Amiga Demoscene, if their level is 20 to 24", and
 * the art itself usually carries its artist's own credits in a SAUCE record
 * that nothing was reading.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildScreenIndex } from '../../src/screens/screen-index.service';

let root: string;

const write = (rel: string, body: string | Buffer) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body as never, typeof body === 'string' ? 'latin1' : undefined);
};

/** A SAUCE record as an art program writes it: 128 bytes at the end of the file. */
function withSauce(art: string, title: string, author: string, group: string): Buffer {
  const record = Buffer.alloc(128, 0x20);
  record.write('SAUCE00', 0, 'latin1');
  record.write(title.padEnd(35).slice(0, 35), 7, 'latin1');
  record.write(author.padEnd(20).slice(0, 20), 42, 'latin1');
  record.write(group.padEnd(20).slice(0, 20), 62, 'latin1');
  record.write('20260902', 82, 'latin1');
  record.writeUInt8(1, 94);   // dataType: character
  record.writeUInt8(1, 95);   // fileType: ANSI
  record.writeUInt16LE(80, 96);  // width
  record.writeUInt16LE(25, 98);  // height
  return Buffer.concat([Buffer.from(art, 'latin1'), Buffer.from([0x1a]), record]);
}

function writeConfConfig(entries: { name: string; location: string }[]): void {
  const lines = [`NCONFS=${entries.length}`];
  entries.forEach((entry, i) => {
    lines.push(`NAME.${i + 1}=${entry.name}`);
    lines.push(`LOCATION.${i + 1}=${entry.location}`);
  });
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), lines.join('\n') + '\n');
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-meta-'));
  write('Conf2/bull20.txt', 'the join bulletin\n');
  write('Conf2/bull30.txt', 'the join bulletin, for regulars\n');
  write('Conf2/Menu.txt', withSauce('menu art', 'Up Rough Menu', 'Spot', 'Up Rough'));
  write('Commands/BBSCmd/GWALL.info', 'NAME=Global Wall\nACCESS=10\n');
  write('Node1/LOGON.TXT', 'run ~CC_gwall|\n');
  writeConfConfig([{ name: 'Amiga Demoscene', location: 'BBS:Conf2/' }]);
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('a screen file describes itself', () => {
  test('carries the artist credits the art was signed with', () => {
    const index = buildScreenIndex(root);

    expect(index.files['Conf2/Menu.txt'].sauce).toMatchObject({
      title: 'Up Rough Menu',
      author: 'Spot',
      group: 'Up Rough',
      width: 80,
      height: 25,
    });
  });

  test('says nothing rather than empty strings when the art is unsigned', () => {
    const index = buildScreenIndex(root);

    expect(index.files['Conf2/bull20.txt'].sauce).toBeUndefined();
  });

  test('says which callers actually see a security variant', () => {
    const index = buildScreenIndex(root);
    const reader = index.files['Conf2/bull20.txt'].readBy[0];

    // bull30 exists, so bull20 serves 20 to 29 - express.e walks DOWN in fives.
    expect(reader).toMatchObject({ securityLevel: 20, serves: '20-29' });
  });

  test('the highest variant serves every level above it', () => {
    const index = buildScreenIndex(root);
    const reader = index.files['Conf2/bull30.txt'].readBy[0];

    expect(reader.serves).toBe('30 and above');
  });
});

describe('an MCI code names something real', () => {
  test('a ~CC_ reference carries the door’s own name', () => {
    const index = buildScreenIndex(root);
    const logon = index.files['Node1/LOGON.TXT'];

    expect(logon.mci[0]).toMatchObject({ code: 'CC', target: 'gwall', resolves: true, targetName: 'Global Wall' });
  });
});
