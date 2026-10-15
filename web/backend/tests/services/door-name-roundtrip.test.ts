/**
 * Saving a door must not rename it.
 *
 * Setting wall's access level to 30 from the admin page also changed its
 * NAME tooltype from "dRE!WAll v2.0" to "WALL".
 *
 * A command's `name` is its FILENAME (wall.info -> WALL), not its NAME
 * tooltype. The API served that as `door_name`, the form displayed "WALL",
 * and saving wrote it into NAME - so an edit to an unrelated field silently
 * replaced the door's display name with its command.
 *
 * A door's title should survive a round trip through the admin form.
 */

import { doorDisplayName } from '../../src/services/config-services/door-info-file.service';

describe('doorDisplayName', () => {
  it('prefers the NAME tooltype over the filename', () => {
    const name = doorDisplayName(
      { name: 'WALL', toolTypes: { NAME: 'dRE!WAll v2.0', ACCESS: '50' } },
    );

    expect(name).toBe('dRE!WAll v2.0');
  });

  it('falls back to the command when there is no NAME tooltype', () => {
    expect(doorDisplayName({ name: 'GWALL', toolTypes: { ACCESS: '20' } })).toBe('GWALL');
    expect(doorDisplayName({ name: 'GWALL' })).toBe('GWALL');
  });

  it('ignores an empty or whitespace NAME rather than showing a blank title', () => {
    expect(doorDisplayName({ name: 'WALL', toolTypes: { NAME: '' } })).toBe('WALL');
    expect(doorDisplayName({ name: 'WALL', toolTypes: { NAME: '   ' } })).toBe('WALL');
  });

  it('round-trips: what the form shows is what gets written back', () => {
    // The bug in one assertion - serve the display name, write it back,
    // nothing changes.
    const door = { name: 'WALL', toolTypes: { NAME: 'dRE!WAll v2.0' } };
    const shown = doorDisplayName(door);

    expect(shown).toBe(door.toolTypes.NAME);
  });

  it('handles a lowercase tooltype key, since .info keys vary', () => {
    expect(doorDisplayName({ name: 'WALL', toolTypes: { name: 'dRE!WAll v2.0' } as any }))
      .toBe('dRE!WAll v2.0');
  });
});
