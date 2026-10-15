/**
 * FALLBACK= on a registration: when its own binary is missing, the command is
 * answered by the registration FALLBACK names (Bulls under B while the new
 * bulletins door is absent). Resolved once, at the registry scan.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { scanCommandDirectory, CommandType } from '../../src/utils/amiga-command-parser.util';
import { writeNewDoorRegistration } from '../../src/services/config-services/door-info-file.service';
import { applyTooltypes } from '../../src/utils/info-file.util';

describe('registration FALLBACK= (registry scan)', () => {
  let root: string;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-fallback-'));
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  function register(command: string, location: string, extra: Record<string, string>): void {
    const infoPath = writeNewDoorRegistration(root, {
      door_command: command, door_type: 'XIM', door_path: location,
    });
    applyTooltypes(infoPath, Object.entries(extra));
  }

  function binary(rel: string): void {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), 'x');
  }

  function scan() {
    return scanCommandDirectory(root, CommandType.BBSCMD, undefined, 0);
  }

  function newBulletinsAndBulls(): void {
    register('B', 'Doors/BULLETINS/bulletins', { FALLBACK: 'BULLS' });
    register('BULLS', 'Doors/emp_tools/Bulls', { C64_ADAPT: '40' });
  }

  it('keeps B on the new door when both binaries are present', () => {
    newBulletinsAndBulls();
    binary('Doors/BULLETINS/bulletins');
    binary('Doors/emp_tools/Bulls');
    const b = scan().get('B');
    expect(b?.location).toBe('Doors/BULLETINS/bulletins');
  });

  it('answers B from a copy of BULLS when the new binary is absent', () => {
    newBulletinsAndBulls();
    binary('Doors/emp_tools/Bulls');
    const cmds = scan();
    const b = cmds.get('B');
    const bulls = cmds.get('BULLS');
    expect(b?.name).toBe('B');
    expect(b?.location).toBe('Doors/emp_tools/Bulls');
    expect(b?.type).toBe(bulls?.type);
    expect(b?.toolTypes?.C64_ADAPT).toBe('40');
    expect(b?.toolTypes?.FALLBACK).toBeUndefined();
    expect(bulls?.name).toBe('BULLS');
  });

  it('registers no B when both binaries are absent (the internal B answers)', () => {
    newBulletinsAndBulls();
    expect(scan().has('B')).toBe(false);
  });

  it('registers nothing and warns once for a FALLBACK naming itself', () => {
    register('B', 'Doors/BULLETINS/bulletins', { FALLBACK: 'B' });
    expect(scan().has('B')).toBe(false);
    const lines = warn.mock.calls.map(c => String(c[0])).filter(l => /FALLBACK/.test(l));
    expect(lines).toHaveLength(1);
  });

  it('does not loop on a chain A -> B -> A', () => {
    register('A', 'Doors/a/a', { FALLBACK: 'B' });
    register('B', 'Doors/b/b', { FALLBACK: 'A' });
    const cmds = scan();
    expect(cmds.has('A')).toBe(false);
    expect(cmds.has('B')).toBe(false);
    const lines = warn.mock.calls.map(c => String(c[0])).filter(l => /FALLBACK/.test(l));
    expect(lines).toHaveLength(1);
  });

  it('does not follow a fallback target that is itself a fallback (one hop)', () => {
    register('A', 'Doors/a/a', { FALLBACK: 'B' });
    register('B', 'Doors/b/b', { FALLBACK: 'C' });
    register('C', 'Doors/c/c', {});
    binary('Doors/b/b');
    binary('Doors/c/c');
    const cmds = scan();
    expect(cmds.has('A')).toBe(false);
    expect(cmds.get('B')?.location).toBe('Doors/b/b');
  });
});
