/**
 * The RIP browser looks where the .RIP files are.
 *
 * `const RIP_DIR = '~/Code/AmiExpress/amiexpress-web/RIPgraphics'` - one
 * developer's checkout, hardcoded. The board is a Linux container with no
 * /Users at all, so the door reported "Directory not found" to every user who
 * opened it while 400-odd .RIP files sat in /app/data/bbs/RIPgraphics.
 *
 * RIPgraphics is not inside the door, so this needs the BBS root rather than
 * the door root: resolveBbsRoot prefers BBS_DATA_DIR, which the container
 * sets, and otherwise walks up to the directory holding Commands/BBSCmd.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ripGraphicsDir } from '../../../../board/Doors/rip-browser/paths';

describe('the RIP browser graphics directory', () => {
  let bbsRoot: string;
  let doorDist: string;
  const previousEnv = { ...process.env };

  beforeEach(() => {
    bbsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rip-bbs-'));
    fs.mkdirSync(path.join(bbsRoot, 'Commands', 'BBSCmd'), { recursive: true });
    fs.mkdirSync(path.join(bbsRoot, 'RIPgraphics'));
    doorDist = path.join(bbsRoot, 'Doors', 'rip-browser', 'dist');
    fs.mkdirSync(doorDist, { recursive: true });
    fs.writeFileSync(path.join(bbsRoot, 'Doors', 'rip-browser', 'package.json'), '{"name":"rip"}');
    delete process.env.BBS_DATA_DIR;
    delete process.env.BBS_ROOT;
  });

  afterEach(() => {
    process.env = { ...previousEnv };
    fs.rmSync(bbsRoot, { recursive: true, force: true });
  });

  it('resolves under the board, from the dist a deploy runs', () => {
    expect(ripGraphicsDir(doorDist)).toBe(path.join(bbsRoot, 'RIPgraphics'));
    expect(fs.existsSync(ripGraphicsDir(doorDist))).toBe(true);
  });

  it('follows BBS_DATA_DIR, which is what the container sets', () => {
    process.env.BBS_DATA_DIR = bbsRoot;

    expect(ripGraphicsDir('/nowhere')).toBe(path.join(bbsRoot, 'RIPgraphics'));
  });

  it('names no developer\'s home directory', () => {
    expect(ripGraphicsDir(doorDist)).not.toContain('/Users/');

    const source = fs.readFileSync(
      path.join(__dirname, '../../../../board/Doors/rip-browser/paths.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(source).not.toContain('/Users/');
  });
});
