/**
 * Editing a door writes the file the BBS reads.
 *
 * "Failed to update door: Door 349 not found".
 *
 * GET /config/doors serves doors loaded from DISK and numbers them by position
 * (`id: index + 1`). PUT /config/doors/:id looked that number up as a DATABASE
 * row. Two unrelated namespaces, so an edit could never succeed - and if the
 * doors table HAD held a row with that id, the admin would have silently
 * edited a different door.
 *
 * A door's real definition is its tooltypes, e.g. Commands/BBSCmd/wall.info:
 *
 *   LOCATION=dOORS:dRE/dRE!WAll/dRE!WAll
 *   TYPE=XIM
 *   NAME=dRE!WAll v2.0
 *   ACCESS=50
 *   PRIORITY=1
 *   STACK=4096
 *
 * so that is what an edit has to change.
 */

import { applyDoorFieldsToTooltypes, DOOR_FIELD_TOOLTYPES } from '../../src/services/config-services/door-info-file.service';

const WALL = [
  { key: 'LOCATION', value: 'dOORS:dRE/dRE!WAll/dRE!WAll', commented: false, originalLine: '' },
  { key: 'MULTINODE', value: 'YES', commented: false, originalLine: '' },
  { key: 'PRIORITY', value: '1', commented: false, originalLine: '' },
  { key: 'STACK', value: '4096', commented: false, originalLine: '' },
  { key: 'TYPE', value: 'XIM', commented: false, originalLine: '' },
  { key: 'NAME', value: 'dRE!WAll v2.0', commented: false, originalLine: '' },
  { key: 'ACCESS', value: '50', commented: false, originalLine: '' },
];

function valueOf(tts: Array<{ key: string; value: string }>, key: string) {
  return tts.find(t => t.key === key)?.value;
}

describe('applyDoorFieldsToTooltypes', () => {
  it('writes the access level the admin form set', () => {
    const out = applyDoorFieldsToTooltypes(WALL, { min_security_level: 30 });

    expect(valueOf(out, 'ACCESS')).toBe('30');
  });

  it('writes name, path and type', () => {
    const out = applyDoorFieldsToTooltypes(WALL, {
      door_name: 'dRE!WAll v2.1',
      door_path: 'Doors:dRE/new',
      door_type: 'AIM',
    });

    expect(valueOf(out, 'NAME')).toBe('dRE!WAll v2.1');
    expect(valueOf(out, 'LOCATION')).toBe('Doors:dRE/new');
    expect(valueOf(out, 'TYPE')).toBe('AIM');
  });

  it('leaves every tooltype it was not asked to change exactly as it was', () => {
    // STACK and MULTINODE are not on the admin form. Dropping or rewriting
    // them would quietly change how the door runs.
    const out = applyDoorFieldsToTooltypes(WALL, { min_security_level: 30 });

    expect(valueOf(out, 'STACK')).toBe('4096');
    expect(valueOf(out, 'MULTINODE')).toBe('YES');
    expect(valueOf(out, 'PRIORITY')).toBe('1');
    expect(out).toHaveLength(WALL.length);
  });

  it('turns the form priority P2 into PRIORITY=2', () => {
    const out = applyDoorFieldsToTooltypes(WALL, { priority: 'P2' });

    expect(valueOf(out, 'PRIORITY')).toBe('2');
  });

  it('adds a tooltype the file does not have yet', () => {
    const bare = [{ key: 'LOCATION', value: 'Doors:x/x', commented: false, originalLine: '' }];

    const out = applyDoorFieldsToTooltypes(bare, { min_security_level: 20 });

    expect(valueOf(out, 'ACCESS')).toBe('20');
    expect(valueOf(out, 'LOCATION')).toBe('Doors:x/x');
  });

  it('ignores fields with no tooltype rather than inventing one', () => {
    // time_limit and runtime_env have no AmiExpress tooltype. Writing a made
    // up key into a door's .info would be worse than not saving it.
    const out = applyDoorFieldsToTooltypes(WALL, {
      time_limit: 30,
      runtime_env: 'vamos',
      description: 'anything',
    } as any);

    expect(out).toEqual(WALL);
    expect(Object.keys(DOOR_FIELD_TOOLTYPES)).not.toContain('time_limit');
  });

  it('changes nothing when given nothing', () => {
    expect(applyDoorFieldsToTooltypes(WALL, {})).toEqual(WALL);
  });

  it('keeps a disabled tooltype disabled', () => {
    const withCommented = [
      ...WALL,
      { key: 'RESIDENT', value: '', commented: true, originalLine: '' },
    ];

    const out = applyDoorFieldsToTooltypes(withCommented, { min_security_level: 30 });

    expect(out.find(t => t.key === 'RESIDENT')?.commented).toBe(true);
  });
});
