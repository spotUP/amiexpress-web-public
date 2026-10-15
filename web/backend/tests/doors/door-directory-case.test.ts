/**
 * A LOCATION's case is the author's, not the disk's.
 *
 * Bulls registers `Doors/EmP_Tools/Bulls`; the volume holds
 * `Doors/emp_tools`. The directory resolver matches case-insensitively but
 * handed back the candidate spelling, and every plain-fs call below missed
 * on the case-sensitive volume — the admin drew B's Edit dialog with no
 * Door settings section and no badge, although the manifest sat right
 * there. Resolved to the true on-disk spelling first.
 *
 * Why two tests instead of one end-to-end: this Mac's tmp is
 * case-insensitive, so no filesystem trick in a test can show the Linux
 * miss — and `fs` cannot be mocked for modules the jest setup already
 * loaded. The wiring test pins that the candidate goes through true-case
 * resolution with a graceful fallback; the integration test pins the whole
 * read path where the filesystem allows.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/utils/amigafs', () => {
  const actual = jest.requireActual('../../src/utils/amigafs');
  return { ...actual, resolvePath: jest.fn(actual.resolvePath) };
});

import { resolvePath } from '../../src/utils/amigafs';
import { doorDirectoryFor, readDoorSettingsView } from '../../src/doors/door-settings.service';

const mockedResolvePath = resolvePath as jest.Mock;

function stageBoard(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'door-case-'));
  const dir = path.join(root, 'Doors', 'emp_tools');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'Bulls'), 'binary');
  fs.writeFileSync(
    path.join(dir, 'door.settings.json'),
    JSON.stringify({ command: 'B', settings: [{ key: 'x', label: 'X', type: 'string' }] })
  );
  return root;
}

describe('door directory case resolution', () => {
  beforeEach(() => {
    mockedResolvePath.mockReset();
    mockedResolvePath.mockImplementation(((p: string) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const actual = jest.requireActual('../../src/utils/amigafs') as { resolvePath: (p: string) => string | null };
      return actual.resolvePath(p);
    }) as any);
  });

  test('the candidate goes through true-case resolution', () => {
    const root = stageBoard();
    try {
      const candidate = path.join(root, 'Doors', 'EmP_Tools');
      const doorDir = doorDirectoryFor(root, {
        command: 'B',
        path: 'Doors/EmP_Tools/Bulls',
      } as any);
      expect(doorDir).not.toBeNull();
      expect(mockedResolvePath).toHaveBeenCalledWith(expect.stringContaining('EmP_Tools'));
      // Whatever the filesystem answers, the returned dir is the resolved
      // one — never the raw candidate.
      expect(doorDir).toBe(mockedResolvePath.mock.results[0].value ?? candidate);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('no correction available falls back to the candidate, not null', () => {
    mockedResolvePath.mockReturnValue(null);
    const root = stageBoard();
    try {
      const doorDir = doorDirectoryFor(root, {
        command: 'B',
        path: 'Doors/EmP_Tools/Bulls',
      } as any);
      expect(doorDir).not.toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('a LOCATION that matches nothing is still null, not a crash', () => {
    const root = stageBoard();
    try {
      expect(doorDirectoryFor(root, { command: 'ZZ', path: 'Doors/No_Such_Door/bin' } as any)).toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('the resolved dir serves the manifest', () => {
    const root = stageBoard();
    try {
      const doorDir = doorDirectoryFor(root, {
        command: 'B',
        path: 'Doors/EmP_Tools/Bulls',
      } as any);
      const view = readDoorSettingsView(doorDir!);
      expect(view).not.toBeNull();
      expect(view!.manifest.command).toBe('B');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
