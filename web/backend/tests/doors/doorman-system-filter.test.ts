/**
 * DOORMAN RepoView door-system filter (hotkey C): cycles ALL -> each
 * distinct door_type present in the current result set -> back to ALL,
 * applied client-side on top of searchCatalog's text-search results.
 *
 * Pure logic lives in Doors/door-manager/systemFilter.ts so it can be
 * unit-tested without spinning up blessed/a screen.
 */
import {
  ALL_TYPES,
  distinctTypes,
  cycleSystemFilter,
  filterByDoorType,
} from '../../../../Doors/door-manager/systemFilter';

interface Row { door_type: string; name: string }

const rows: Row[] = [
  { door_type: 'XIM', name: 'a' },
  { door_type: 'FIM', name: 'b' },
  { door_type: 'XIM', name: 'c' },
  { door_type: 'REXX', name: 'd' },
];
const typeOf = (r: Row) => r.door_type;

describe('DOORMAN systemFilter: distinctTypes', () => {
  it('returns each type once, in first-seen order (never hardcoded)', () => {
    expect(distinctTypes(rows, typeOf)).toEqual(['XIM', 'FIM', 'REXX']);
  });

  it('picks up a newly-indexed type (e.g. DD) automatically', () => {
    const withDD = [...rows, { door_type: 'DD', name: 'e' }];
    expect(distinctTypes(withDD, typeOf)).toEqual(['XIM', 'FIM', 'REXX', 'DD']);
  });

  it('returns an empty list for an empty row set', () => {
    expect(distinctTypes([], typeOf)).toEqual([]);
  });
});

describe('DOORMAN systemFilter: cycleSystemFilter', () => {
  const types = ['XIM', 'FIM', 'REXX'];

  it('cycles ALL -> first type -> ... -> last type -> ALL', () => {
    let sys = ALL_TYPES;
    sys = cycleSystemFilter(sys, types); expect(sys).toBe('XIM');
    sys = cycleSystemFilter(sys, types); expect(sys).toBe('FIM');
    sys = cycleSystemFilter(sys, types); expect(sys).toBe('REXX');
    sys = cycleSystemFilter(sys, types); expect(sys).toBe(ALL_TYPES);
  });

  it('resets to ALL when the current type dropped out of the result set', () => {
    // e.g. sysop was on FIM, then typed a search query that no longer
    // matches any FIM entry — cycling should not get stuck on a type
    // nothing matches.
    expect(cycleSystemFilter('FIM', ['XIM', 'REXX'])).toBe(ALL_TYPES);
  });

  it('returns ALL when there are no types to cycle through', () => {
    expect(cycleSystemFilter(ALL_TYPES, [])).toBe(ALL_TYPES);
    expect(cycleSystemFilter('XIM', [])).toBe(ALL_TYPES);
  });
});

describe('DOORMAN systemFilter: filterByDoorType', () => {
  it('passes every row through unfiltered for ALL_TYPES', () => {
    expect(filterByDoorType(rows, ALL_TYPES, typeOf)).toEqual(rows);
  });

  it('keeps only rows matching the selected type', () => {
    expect(filterByDoorType(rows, 'XIM', typeOf)).toEqual([rows[0], rows[2]]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterByDoorType(rows, 'DD', typeOf)).toEqual([]);
  });
});
