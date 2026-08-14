/**
 * Regression: unbounded node ids littered the repo root with Node41..Node418
 * scaffolding during corpus sweeps (dirs created on demand, never cleaned).
 * DoorDropFileManager must reject node ids outside AmiExpress's 0-255 range
 * instead of scaffolding a bogus Node<N> directory.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DoorDropFileManager } from '../src/services/DoorDropFileManager';
import { User } from '../src/database';

describe('DoorDropFileManager node-id guard', () => {
  let tmp: string;
  let mgr: DoorDropFileManager;
  const user = {
    id: 1, username: 'TEST', location: 'Nowhere', phone: '',
    secLevel: 255, uploads: 0, downloads: 0, timesCalled: 1,
  } as unknown as User;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dropfile-guard-'));
    mgr = new DoorDropFileManager();
    mgr.setBbsRoot(tmp);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('rejects node ids above 255 and creates no directory', () => {
    expect(() => mgr.createDoorSys(418, user, 60)).toThrow(RangeError);
    expect(fs.existsSync(path.join(tmp, 'Node418'))).toBe(false);
  });

  it('rejects negative and non-integer node ids', () => {
    expect(() => mgr.createDoorSys(-1, user, 60)).toThrow(RangeError);
    expect(() => mgr.createDoorSys(4.2, user, 60)).toThrow(RangeError);
  });

  it('still scaffolds valid node ids (0-255)', () => {
    mgr.createDoorSys(255, user, 60);
    expect(fs.existsSync(path.join(tmp, 'Node255', 'DOOR.SYS'))).toBe(true);
  });
});
