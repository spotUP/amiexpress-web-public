/**
 * DOORMAN's installed list can be ordered by minimum access level (the O
 * key): the board's own order, then low first, then high first, and back.
 * A disabled door carries the 32767 sentinel and lands last when ascending.
 */
import { nextSortMode, sortInstalled, sortLabel, SORT_MODES } from '../../../../../Doors/door-manager/installed-sort';

const doors = [
  { id: 'a', name: 'A', accessLevel: 50 },
  { id: 'b', name: 'B', accessLevel: 10 },
  { id: 'c', name: 'C', accessLevel: 255 },
  { id: 'd', name: 'D', accessLevel: 10 },
  { id: 'off', name: 'Off', accessLevel: 32767 },
  { id: 'n', name: 'N' },
];

describe('the installed-doors order', () => {
  it('low first puts the doors everyone can run at the top and the disabled one last', () => {
    expect(sortInstalled(doors, 'access-asc').map((d) => d.id)).toEqual(['n', 'b', 'd', 'a', 'c', 'off']);
  });

  it('high first is the reverse, and equal levels keep the board order', () => {
    expect(sortInstalled(doors, 'access-desc').map((d) => d.id)).toEqual(['off', 'c', 'a', 'b', 'd', 'n']);
    expect(sortInstalled(doors, 'default').map((d) => d.id)).toEqual(['a', 'b', 'c', 'd', 'off', 'n']);
    // A copy, never the caller's array.
    const copy = sortInstalled(doors, 'access-asc');
    expect(copy).not.toBe(doors);
    expect(doors[0].id).toBe('a');
  });

  it('O cycles through the three orders and the label says which', () => {
    expect(nextSortMode('default')).toBe('access-asc');
    expect(nextSortMode('access-asc')).toBe('access-desc');
    expect(nextSortMode('access-desc')).toBe('default');
    expect(SORT_MODES).toHaveLength(3);
    expect(sortLabel('default')).toBe('');
    expect(sortLabel('access-asc')).toBe('by access, low first');
    expect(sortLabel('access-desc')).toBe('by access, high first');
  });
});
