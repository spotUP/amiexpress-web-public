/**
 * Door registration service.
 *
 * Generates `Commands/BBSCmd/<bbscmd>.info` for a TypeScript / Python / AREXX
 * door from its package.json metadata. This is the in-process equivalent of
 * `dev/scripts/install-sdk-doors.ts`, which is excluded from the production
 * Docker image. The DoorManager hot-reload flow calls this on the live site
 * where the dev script is unreachable.
 *
 * Pure file IO -- no spawn, no projectRoot, no config dependency. The caller
 * supplies the BBSCmd directory so this is trivially unit-testable.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface RegisterDoorOptions {
  /** Absolute path to the door directory (must contain package.json). */
  doorPath: string;
  /** Absolute path to the Commands/BBSCmd directory. */
  bbsCommandsDir: string;
  /** Overwrite an existing .info file. Default false (matches install-sdk-doors). */
  force?: boolean;
}

export type RegisterDoorStatus =
  | 'created'
  | 'overwritten'
  | 'skipped-existing'
  | 'no-package'
  | 'invalid-package'
  | 'unsupported-type'
  | 'missing-entrypoint';

export interface RegisterDoorResult {
  status: RegisterDoorStatus;
  bbsCommand?: string;
  doorType?: string;
  infoPath?: string;
  message?: string;
}

const SUPPORTED_DOOR_TYPES = ['TS', 'JS', 'PY', 'PYTHON', 'AREXX', 'REXX'];

export function registerDoor(opts: RegisterDoorOptions): RegisterDoorResult {
  const { doorPath, bbsCommandsDir, force } = opts;

  const pkgPath = path.join(doorPath, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return { status: 'no-package', message: 'No package.json (likely a 68K door)' };
  }

  let pkg: any;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch (err) {
    return {
      status: 'invalid-package',
      message: `Failed to parse package.json: ${(err as Error).message}`,
    };
  }

  const doorName = path.basename(doorPath);
  const bbsCommand: string = pkg.bbsCommand || doorName.toUpperCase().replace(/-/g, '');
  const doorType: string = String(pkg.doorType || pkg.type || 'TS').toUpperCase();

  if (!SUPPORTED_DOOR_TYPES.includes(doorType)) {
    return {
      status: 'unsupported-type',
      bbsCommand,
      doorType,
      message: `Unsupported doorType '${doorType}'. Supported: ${SUPPORTED_DOOR_TYPES.join(', ')}`,
    };
  }

  const entryPoint: string = pkg.main || 'dist/index.js';
  if (!fs.existsSync(path.join(doorPath, entryPoint))) {
    return {
      status: 'missing-entrypoint',
      bbsCommand,
      doorType,
      message: `Entry point '${entryPoint}' not found. Did you run npm run build?`,
    };
  }

  if (!fs.existsSync(bbsCommandsDir)) {
    fs.mkdirSync(bbsCommandsDir, { recursive: true });
  }

  const infoPath = path.join(bbsCommandsDir, `${bbsCommand}.info`);
  const exists = fs.existsSync(infoPath);
  if (exists && !force) {
    return {
      status: 'skipped-existing',
      bbsCommand,
      doorType,
      infoPath,
      message: '.info already registered, leaving in place',
    };
  }

  const description: string = pkg.description || '';
  const access: number = pkg.accessLevel !== undefined ? pkg.accessLevel : 0;

  const lines: Array<string | null> = [
    `BBSCMD=${bbsCommand}`,
    `TYPE=${doorType}`,
    `LOCATION=Doors/${doorName}`,
    description ? `DESCRIPTION=${description}` : null,
    `ACCESS=${access}`,
    'MULTINODE=YES',
    'PRIORITY=SAME',
    '',
  ];
  const content = lines.filter((l): l is string => l !== null).join('\n');

  fs.writeFileSync(infoPath, content);

  return {
    status: exists ? 'overwritten' : 'created',
    bbsCommand,
    doorType,
    infoPath,
  };
}
