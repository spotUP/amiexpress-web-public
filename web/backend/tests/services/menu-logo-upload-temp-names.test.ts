/**
 * Two uploads to one kind must never share a temp file: the board can run more
 * than one process on a volume, and a shared name lets one upload's bytes be
 * measured and renamed as the other's logo.
 */
const written: string[] = [];
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return { ...actual, writeFileSync: (p: string, ...rest: unknown[]) => { written.push(String(p)); return (actual.writeFileSync as Function)(p, ...rest); } };
});
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { writeMenuLogo } from '../../src/services/menu-catalogue/logos';

test('each upload writes through its own temp file, and both logos end up intact', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-logo-tmp-'));
  try {
    writeMenuLogo(root, 'MAIN', 'a.txt', Buffer.from('A'.repeat(40)));
    writeMenuLogo(root, 'MAIN', 'b.txt', Buffer.from('B'.repeat(30)));
    const temps = written.filter(p => path.basename(p).startsWith('.upload-'));
    expect(temps).toHaveLength(2);
    expect(new Set(temps).size).toBe(2);
    const dir = path.join(root, 'Screens/menus/main/logos');
    expect(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8')).toBe('A'.repeat(40));
    expect(fs.readFileSync(path.join(dir, 'b.txt'), 'utf8')).toBe('B'.repeat(30));
    expect(fs.readdirSync(dir).sort()).toEqual(['a.txt', 'b.txt']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
