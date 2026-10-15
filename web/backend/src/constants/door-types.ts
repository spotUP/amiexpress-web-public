/**
 * The vocabularies a door is described with.
 *
 * These lived in two places that disagreed: door.handler knew the Amiga door
 * types, and the admin config schema had its own hand-written list. GET
 * /config/doors served a door as `door_type: "XIM"`, and the PUT that saved it
 * back rejected "XIM" as an invalid enum value - so most doors could be
 * opened in the admin page and never saved (reported 2026-08-27 editing
 * wall.info).
 *
 * One definition, used by the loader, the API and the schema.
 */

/**
 * Amiga 68K door types, each naming the door library a door talks to.
 * XIM/AIM/SIM/TIM/IIM are AEDoor.library flavours, FIM is FAMEDoorPort, and
 * DD is DayDream's marker routed through dreamdoor.library.
 */
export const AMIGA_68K_DOOR_TYPES = ['XIM', 'AIM', 'SIM', 'TIM', 'IIM', 'FIM', 'DD'] as const;

/** Doors implemented in TypeScript and run in this process. */
export const NATIVE_DOOR_TYPES = ['typescript'] as const;

/**
 * Where a command comes from, rather than what it runs on. The admin page
 * puts these in the same field as the door types above, so both are valid.
 */
export const COMMAND_SOURCE_TYPES = ['SYSCMD', 'BBSCMD', 'INTERNAL'] as const;

/** Everything `door_type` may legitimately hold. */
export const DOOR_TYPES = [
  ...AMIGA_68K_DOOR_TYPES,
  ...NATIVE_DOOR_TYPES,
  ...COMMAND_SOURCE_TYPES,
] as const;

/**
 * What the door actually runs on, as the API derives it: `vamos` for the 68K
 * emulator, `nodejs` for a TypeScript door, `native` for the rest. The older
 * AMIGA_68K / NATIVE_NODE / BROWSER spellings are still accepted so a client
 * holding one can save.
 */
export const DOOR_RUNTIME_ENVS = [
  'vamos',
  'nodejs',
  'native',
  'AMIGA_68K',
  'NATIVE_NODE',
  'BROWSER',
] as const;

/** Any value `door_type` may hold. */
export type DoorType = typeof DOOR_TYPES[number];

/** Any value `runtime_env` may hold. */
export type DoorRuntimeEnv = typeof DOOR_RUNTIME_ENVS[number];
