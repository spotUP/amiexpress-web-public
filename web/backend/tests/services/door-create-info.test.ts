/**
 * Creating a door must not destroy one that already exists.
 *
 * `createDoor` guarded uniqueness with `getDoorByCommand`, which reads the
 * `doors` DATABASE table. Doors live on disk - 350 of them on the live site,
 * loaded from Commands/BBSCmd/*.info - and that table is largely empty. So
 * creating a door named WALL passed the guard and `writeDoorInfoFile`
 * overwrote the real binary wall.info with a plain-text one.
 *
 * Both forms parse (the loaders have a text fallback, confirmed by test), so
 * nothing would have complained - the door would simply have lost STACK,
 * PRIORITY, NAME, MULTINODE and its Amiga icon, silently.
 *
 * The type it wrote was wrong too: a runtime map yielding "TS" or "AMIGA",
 * neither of which the loader recognises as a door type.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  findDoorInfoFile,
  buildNewDoorTooltypes,
} from '../../src/services/config-services/door-info-file.service';

function makeBbsRoot(commands: string[] = []): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-'));
  const dir = path.join(root, 'Commands', 'BBSCmd');
  fs.mkdirSync(dir, { recursive: true });
  for (const c of commands) fs.writeFileSync(path.join(dir, `${c}.info`), 'x');
  return root;
}

describe('findDoorInfoFile as the existence check', () => {
  it('finds a command that exists on disk but not in the database', () => {
    // The whole point: the database is not the authority on what doors exist.
    const root = makeBbsRoot(['wall']);

    expect(findDoorInfoFile(root, 'wall')).not.toBeNull();
  });

  it('matches regardless of case, because the files are named however the Amiga wrote them', () => {
    const root = makeBbsRoot(['SWall']);

    expect(findDoorInfoFile(root, 'swall')).not.toBeNull();
    expect(findDoorInfoFile(root, 'SWALL')).not.toBeNull();
  });

  it('returns null for a command with no file', () => {
    expect(findDoorInfoFile(makeBbsRoot(['wall']), 'nosuchdoor')).toBeNull();
  });
});

describe('buildNewDoorTooltypes', () => {
  const fields = {
    door_command: 'MYDOOR',
    door_name: 'My Door v1.0',
    door_type: 'XIM',
    door_path: 'Doors:mine/mydoor',
    min_security_level: 20,
  };

  function valueOf(tts: Array<{ key: string; value: string }>, key: string) {
    return tts.find(t => t.key === key)?.value;
  }

  it('writes the door type the loader understands, not a runtime name', () => {
    // The old writer mapped runtime_env to "TS" or "AMIGA". Neither is in
    // XIM, AIM, SIM, TIM, IIM, FIM, DD, typescript - so a created 68K door
    // was not recognised as one.
    const tts = buildNewDoorTooltypes(fields);

    expect(valueOf(tts, 'TYPE')).toBe('XIM');
  });

  it('writes location, name and access', () => {
    const tts = buildNewDoorTooltypes(fields);

    expect(valueOf(tts, 'LOCATION')).toBe('Doors:mine/mydoor');
    expect(valueOf(tts, 'NAME')).toBe('My Door v1.0');
    expect(valueOf(tts, 'ACCESS')).toBe('20');
  });

  it('does not emit a bogus "<type>=<command>" entry', () => {
    // The old writer led with `${door_type}=${door_command}` - e.g. "XIM=WALL"
    // - which is not a tooltype AmiExpress reads.
    const tts = buildNewDoorTooltypes(fields);

    expect(tts.find(t => t.key === 'XIM')).toBeUndefined();
    expect(tts.find(t => t.key === 'BBSCMD')).toBeUndefined();
  });

  it('gives a new door MULTINODE, as the shipped doors have', () => {
    expect(valueOf(buildNewDoorTooltypes(fields), 'MULTINODE')).toBe('YES');
  });

  it('defaults access to 0 when none was given', () => {
    const tts = buildNewDoorTooltypes({ door_command: 'X', door_type: 'XIM', door_path: 'p' });

    expect(valueOf(tts, 'ACCESS')).toBe('0');
  });

  it('omits NAME rather than inventing one from the command', () => {
    // A door whose NAME is its command is how wall lost "dRE!WAll v2.0".
    const tts = buildNewDoorTooltypes({ door_command: 'X', door_type: 'XIM', door_path: 'p' });

    expect(tts.find(t => t.key === 'NAME')).toBeUndefined();
  });
});
