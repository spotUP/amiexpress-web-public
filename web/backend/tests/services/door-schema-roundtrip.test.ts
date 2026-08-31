/**
 * A door you can load is a door you can save.
 *
 * Editing wall.info in the admin page failed with:
 *
 *   received "XIM"   ... Expected 'SYSCMD' | 'BBSCMD' | 'INTERNAL'
 *   received "vamos" ... Expected 'AMIGA_68K' | 'NATIVE_NODE' | 'BROWSER'
 *
 * Both values came from the server itself. GET /config/doors maps a backend
 * door to the admin shape (config-routes.ts) and puts the RAW door type into
 * door_type - XIM, AIM, SIM, TIM, IIM, FIM, DD or typescript - and derives
 * runtime_env as nodejs / vamos / native. The PUT then validated against a
 * completely different vocabulary, so every door whose type was not literally
 * BBSCMD could be read and never written back.
 *
 * The property that matters: anything the GET can produce, the PUT must
 * accept.
 */

import { DoorSchema } from '../../src/services/config.schemas';
import { AMIGA_68K_DOOR_TYPES } from '../../src/constants/door-types';

/** The GET's own mapping, from config-routes.ts. */
function toAdminShape(door: { name: string; command: string; type: string; path: string }) {
  return {
    door_name: door.name,
    door_command: door.command,
    door_type: door.type || 'BBSCMD',
    runtime_env:
      door.type === 'typescript' ? 'nodejs' : door.type === 'XIM' ? 'vamos' : 'native',
    door_path: door.path,
  };
}

describe('DoorSchema accepts what the API serves', () => {
  it.each(AMIGA_68K_DOOR_TYPES)('accepts a %s door', (type) => {
    const door = toAdminShape({ name: 'WALL', command: 'WALL', type, path: 'Doors/wall' });

    expect(DoorSchema.safeParse(door).success).toBe(true);
  });

  it('accepts the exact wall.info case that failed', () => {
    const wall = {
      door_name: 'WALL',
      door_command: 'WALL',
      door_type: 'XIM',
      runtime_env: 'vamos',
      door_path: 'Doors/wall/wall',
    };

    expect(DoorSchema.safeParse(wall).success).toBe(true);
  });

  it('accepts a TypeScript door and its nodejs runtime', () => {
    const door = toAdminShape({
      name: 'LiveChat', command: 'livechat', type: 'typescript', path: 'Doors/livechat',
    });

    expect(DoorSchema.safeParse(door).success).toBe(true);
  });

  it('still accepts the command-source types the schema always allowed', () => {
    for (const door_type of ['SYSCMD', 'BBSCMD', 'INTERNAL']) {
      const door = { door_name: 'X', door_command: 'X', door_type, door_path: 'p' };
      expect(DoorSchema.safeParse(door).success).toBe(true);
    }
  });

  it('still rejects a type nothing produces', () => {
    const door = { door_name: 'X', door_command: 'X', door_type: 'NONSENSE', door_path: 'p' };

    expect(DoorSchema.safeParse(door).success).toBe(false);
  });

  it('still rejects a runtime nothing produces', () => {
    const door = {
      door_name: 'X', door_command: 'X', door_type: 'XIM', door_path: 'p',
      runtime_env: 'NONSENSE',
    };

    expect(DoorSchema.safeParse(door).success).toBe(false);
  });
});

describe('the Add Door form posts something the schema accepts', () => {
  // The form built a payload with no door_path and min_security_level: 0.
  // DoorSchema requires door_path and used min(1), so Create Door could never
  // succeed - and 0 is not an absence here: the API's own
  // doorNormalAccessLevel() serves 0 for a door with no ACCESS tooltype, so
  // the schema was rejecting its own output.
  it('accepts a new door open to everyone', () => {
    const payload = {
      door_name: 'Wall',
      door_command: 'WALL',
      door_type: 'XIM',
      door_path: 'BBS:Doors/Wall/Wall',
      runtime_env: 'vamos',
      min_security_level: 0,
      description: '',
      time_limit: 30,
      enabled: true,
    };

    const parsed = DoorSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });

  it('still rejects a door with no path to run', () => {
    const parsed = DoorSchema.safeParse({
      door_name: 'Wall',
      door_command: 'WALL',
      door_type: 'XIM',
      min_security_level: 0,
    });

    expect(parsed.success).toBe(false);
  });

  it('accepts every access level doorNormalAccessLevel can serve', () => {
    for (const level of [0, 1, 100, 255]) {
      const parsed = DoorSchema.partial().safeParse({ min_security_level: level });
      expect(parsed.success).toBe(true);
    }
  });
});
