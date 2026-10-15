/**
 * `ADAPTED_DOOR_TYPES` is pinned, and AREXX is pinned OUT.
 *
 * The set answers one question - may a `C64_ADAPT` claim on a door of this
 * type be honoured? - and it may only say yes for types whose output crosses
 * the adapter's seam, which is the socket handed to `AmigaDoorSession` in
 * `executeAmigaDoor`. A type that never builds one (AREXX, TypeScript, Python)
 * would be let through the gate and then served unreduced 80-column bytes at a
 * 40-column caller, which is worse than the refusal it replaced.
 *
 * The concrete history this pin exists for: the set carried the string 'AMI'
 * from Phase 3 until 2026-09-03. `DoorType` spells the AREXX type 'AIM', so
 * 'AMI' matched nothing - the behaviour was right by accident and the source
 * read as though AREXX were covered. The string was DELETED rather than
 * corrected, and this file makes both mistakes loud: putting the typo back,
 * and "fixing" it to 'AIM'.
 */
import { ADAPTED_DOOR_TYPES, doorOpensForC64 } from '../../src/utils/door-min-columns.util';
import { DoorType } from '../../src/utils/amiga-command-parser.util';

const c64 = { petsciiMode: true, screenWidth: 40 };
const marked = (type: string) => ({ type, toolTypes: { C64_ADAPT: '40' } });

describe('ADAPTED_DOOR_TYPES', () => {
  it('is exactly the four 68K types that route to executeAmigaDoor', () => {
    expect([...ADAPTED_DOOR_TYPES].sort()).toEqual(['DD', 'FIM', 'SIM', 'XIM']);
  });

  it('names only real DoorType values - no dead string can hide in it', () => {
    const real = new Set(Object.values(DoorType).map((t) => String(t)));
    expect([...ADAPTED_DOOR_TYPES].filter((t) => !real.has(t))).toEqual([]);
  });

  it('does not contain AREXX under either spelling', () => {
    expect(ADAPTED_DOOR_TYPES.has('AIM')).toBe(false);
    expect(ADAPTED_DOOR_TYPES.has('AMI')).toBe(false);
    expect(ADAPTED_DOOR_TYPES.has(DoorType.AIM)).toBe(false);
  });

  it('refuses a C64 an AREXX door even when its .info claims C64_ADAPT=40', () => {
    // The claim is well-formed and the caller is a C64: only the TYPE clause
    // stands between them, which is the whole point of the set.
    expect(doorOpensForC64(marked(DoorType.AIM) as any, c64)).toBe(false);
    expect(doorOpensForC64(marked('AMI') as any, c64)).toBe(false);
  });

  it('refuses the other non-seam types the same way', () => {
    for (const type of [DoorType.TS, DoorType.PYTHON, DoorType.PY, DoorType.AREXX, DoorType.REXX, DoorType.TIM, DoorType.IIM, DoorType.MCI]) {
      expect({ type, opens: doorOpensForC64(marked(type) as any, c64) }).toEqual({ type, opens: false });
    }
  });

  it('opens each of the four for a C64 with the same claim - otherwise the refusals above are vacuous', () => {
    for (const type of ADAPTED_DOOR_TYPES) {
      expect({ type, opens: doorOpensForC64(marked(type) as any, c64) }).toEqual({ type, opens: true });
    }
  });
});
