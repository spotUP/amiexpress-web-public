/**
 * The delete rules exist twice. This is what stops them drifting.
 *
 * DOORREPO deletes doors on a real AmiExpress board, in C, where there is no
 * server to ask - `flow_own_directory` and `flow_registration_class` in
 * examples/doorrepo-c/flow.c. amiexpress-web deletes them here, in
 * TypeScript, for DOORMAN and the admin UI. Neither implementation can be
 * removed: one runs on an Amiga, the other in Node.
 *
 * So both are held to one table of answers,
 * examples/doorrepo-c/tests/delete-rule-cases.txt, read by
 * examples/doorrepo-c/tests/test_flow.c and by this file. A rule corrected on
 * one side and forgotten on the other fails here, rather than eating a door
 * on someone's board months later - which is exactly what happened on
 * 2026-08-31, when deleting one door removed six.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  ownDirectoryOf,
  classifyRegistration,
  RegistrationClass,
} from '../../src/doors/door-registration-paths';

const CASE_FILE = path.resolve(
  __dirname,
  '../../../../examples/doorrepo-c/tests/delete-rule-cases.txt',
);

interface OwnDirCase { location: string; isDir: boolean; expected: string | null }
interface ClassCase {
  doorLocation: string;
  doorDir: string;
  otherLocation: string;
  expected: RegistrationClass;
}

function readCases(): { ownDir: OwnDirCase[]; classes: ClassCase[] } {
  const body = fs.readFileSync(CASE_FILE, 'latin1');
  const ownDir: OwnDirCase[] = [];
  const classes: ClassCase[] = [];

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const f = line.split('|');

    if (f[0] === 'owndir' && f.length === 4) {
      ownDir.push({
        location: f[1],
        isDir: f[2] === '1',
        expected: f[3] === '-' ? null : f[3],
      });
    } else if (f[0] === 'class' && f.length === 5) {
      classes.push({
        doorLocation: f[1],
        doorDir: f[2],
        otherLocation: f[3],
        expected: f[4] as RegistrationClass,
      });
    }
  }
  return { ownDir, classes };
}

/**
 * The table is written against /bbs. Rewrite it onto a real temp tree,
 * because ownDirectoryOf asks the filesystem whether a LOCATION is a
 * directory - the C side is told, this side looks.
 */
let root: string;

function real(p: string): string {
  return path.join(root, p.replace(/^\/bbs\/?/, ''));
}

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rule-parity-')));
  fs.mkdirSync(path.join(root, 'Doors'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Commands'), { recursive: true });
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

it('reads the shared table at all', () => {
  // A test driven by a file that moved would otherwise pass by asserting
  // nothing at all.
  const { ownDir, classes } = readCases();
  expect(ownDir.length).toBeGreaterThan(5);
  expect(classes.length).toBeGreaterThan(5);
});

it('answers every own-directory case the way the C door does', () => {
  const { ownDir } = readCases();

  for (const testCase of ownDir) {
    const location = real(testCase.location);
    if (testCase.isDir) fs.mkdirSync(location, { recursive: true });

    const got = ownDirectoryOf(root, path.join(root, 'Doors'), location);
    const want = testCase.expected === null ? null : real(testCase.expected);

    expect({ case: testCase.location, got }).toEqual({ case: testCase.location, got: want });
  }
});

it('classifies every registration the way the C door does', () => {
  const { classes } = readCases();

  for (const testCase of classes) {
    const got = classifyRegistration(
      real(testCase.otherLocation),
      real(testCase.doorLocation),
      real(testCase.doorDir),
    );

    expect({ case: `${testCase.otherLocation} vs ${testCase.doorLocation}`, got })
      .toEqual({ case: `${testCase.otherLocation} vs ${testCase.doorLocation}`, got: testCase.expected });
  }
});

it('treats a door with no directory of its own as having no co-tenants', () => {
  // Doors/scan.x owns nothing, so nothing can share its directory - the
  // C side returns UNRELATED for the same input.
  const location = path.join(root, 'Doors', 'scan.x');

  expect(ownDirectoryOf(root, path.join(root, 'Doors'), location)).toBeNull();
  expect(classifyRegistration(path.join(root, 'Doors', 'other.x'), location, null))
    .toBe('unrelated');
  expect(classifyRegistration(location, location, null)).toBe('alias');
});
