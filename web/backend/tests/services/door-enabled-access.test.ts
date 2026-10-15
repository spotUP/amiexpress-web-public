/**
 * Enabling and disabling a door, the way DOORREPO already does it.
 *
 * AmiExpress has no ENABLED tooltype - express.e:4702 reads a door's ACCESS
 * level and that is the only gate there is. So "disabled" has to be expressed
 * as an access level nobody reaches, and the door's normal level has to be
 * remembered somewhere or enabling it again would be a guess.
 *
 * DOORREPO settled this: it parks ACCESS and keeps the previous level in a
 * DRACCESS tooltype (examples/doorrepo-c/flow.c:975, read back at flow.c:899).
 * DRACCESS is DOORREPO's own bookkeeping - express.e does not read it - which
 * is exactly why it is safe to leave in a door's .info.
 *
 * Three implementations disagreed before this: DOORREPO persisted, DOORMAN
 * kept a boolean in memory and told the sysop to "edit .info ENABLED tooltype
 * to persist" (a tooltype that does not exist), and the admin's checkbox wrote
 * nothing whatsoever. This is the one the admin uses, and it matches what
 * DOORREPO reads.
 */

import {
  isDoorEnabled,
  applyEnabledToTooltypes,
  applyDoorFieldsToTooltypes,
  doorNormalAccessLevel,
  DISABLED_ACCESS_LEVEL,
  PRIOR_ACCESS_TOOLTYPE,
  type Tooltype,
} from '../../src/services/config-services/door-info-file.service';

/** A tooltype list in the shape parseInfoFile returns. */
function tools(pairs: Array<[string, string]>): Tooltype[] {
  return pairs.map(([key, value]) => ({
    key,
    value,
    commented: false,
    originalLine: value ? `${key}=${value}` : key,
  }));
}

function valueOf(list: Tooltype[], key: string): string | undefined {
  return list.find((t) => t.key.toUpperCase() === key)?.value;
}

function has(list: Tooltype[], key: string): boolean {
  return list.some((t) => t.key.toUpperCase() === key);
}

describe('door enabled state', () => {
  describe('reading it', () => {
    it('reads a door with no remembered level as enabled', () => {
      expect(isDoorEnabled({ TYPE: 'XIM', ACCESS: '10' })).toBe(true);
    });

    it('reads a door carrying a remembered level as disabled', () => {
      expect(isDoorEnabled({ TYPE: 'XIM', ACCESS: '255', DRACCESS: '10' })).toBe(false);
    });

    it('treats a door with no tooltypes at all as enabled', () => {
      // Every door on the board predates this, and none of them are disabled.
      expect(isDoorEnabled(undefined)).toBe(true);
      expect(isDoorEnabled({})).toBe(true);
    });
  });

  describe('disabling', () => {
    it('parks the access level and remembers what it was', () => {
      const out = applyEnabledToTooltypes(
        tools([['TYPE', 'XIM'], ['ACCESS', '10']]),
        false
      );

      expect(valueOf(out, 'ACCESS')).toBe(String(DISABLED_ACCESS_LEVEL));
      expect(valueOf(out, PRIOR_ACCESS_TOOLTYPE)).toBe('10');
      expect(isDoorEnabled({ ACCESS: '255', DRACCESS: '10' })).toBe(false);
    });

    it('records the ABSENCE of a level for a door that had none', () => {
      // This asserted DRACCESS=0, which is what the bug looked like from the
      // inside: express.e:4703 denies ACCESS=0 to everyone, so restoring a
      // door "to level 0" locked it. Absence is recorded as its own thing.
      const out = applyEnabledToTooltypes(tools([['TYPE', 'XIM']]), false);

      expect(valueOf(out, 'ACCESS')).toBe(String(DISABLED_ACCESS_LEVEL));
      expect(valueOf(out, PRIOR_ACCESS_TOOLTYPE)).not.toBe('0');
    });

    it('does not overwrite the remembered level when disabled twice', () => {
      // The remembered value names the door's NORMAL level, not the most
      // recent one - the same reason DOORREPO's case 3 keeps it unchanged.
      const once = applyEnabledToTooltypes(tools([['ACCESS', '10']]), false);
      const twice = applyEnabledToTooltypes(once, false);

      expect(valueOf(twice, PRIOR_ACCESS_TOOLTYPE)).toBe('10');
      expect(valueOf(twice, 'ACCESS')).toBe(String(DISABLED_ACCESS_LEVEL));
    });

    it('leaves every other tooltype exactly as it was', () => {
      const out = applyEnabledToTooltypes(
        tools([
          ['TYPE', 'XIM'],
          ['LOCATION', 'DOORS:Wall/wall'],
          ['STACK', '40000'],
          ['MULTINODE', 'YES'],
          ['NAME', 'dRE!WAll v2.0'],
          ['ACCESS', '10'],
        ]),
        false
      );

      expect(valueOf(out, 'TYPE')).toBe('XIM');
      expect(valueOf(out, 'LOCATION')).toBe('DOORS:Wall/wall');
      expect(valueOf(out, 'STACK')).toBe('40000');
      expect(valueOf(out, 'MULTINODE')).toBe('YES');
      expect(valueOf(out, 'NAME')).toBe('dRE!WAll v2.0');
    });
  });

  describe('enabling', () => {
    it('puts the remembered level back and stops remembering it', () => {
      const out = applyEnabledToTooltypes(
        tools([['TYPE', 'XIM'], ['ACCESS', '255'], ['DRACCESS', '10']]),
        true
      );

      expect(valueOf(out, 'ACCESS')).toBe('10');
      expect(has(out, PRIOR_ACCESS_TOOLTYPE)).toBe(false);
    });

    it('changes nothing for a door that was never disabled', () => {
      const before = tools([['TYPE', 'XIM'], ['ACCESS', '10']]);
      const out = applyEnabledToTooltypes(before, true);

      expect(valueOf(out, 'ACCESS')).toBe('10');
      expect(has(out, PRIOR_ACCESS_TOOLTYPE)).toBe(false);
    });

    it('survives a disable and enable round trip', () => {
      const original = tools([['TYPE', 'XIM'], ['STACK', '40000'], ['ACCESS', '30']]);

      const disabled = applyEnabledToTooltypes(original, false);
      const restored = applyEnabledToTooltypes(disabled, true);

      expect(valueOf(restored, 'ACCESS')).toBe('30');
      expect(valueOf(restored, 'STACK')).toBe('40000');
      expect(has(restored, PRIOR_ACCESS_TOOLTYPE)).toBe(false);
    });
  });

  describe('what express.e means by ACCESS=0', () => {
    // express.e:4702-4707
    //   access:=readToolTypeInt(tooltype,cmd,'ACCESS');
    //   IF access=0 THEN RETURN TRUE          <- RESULT_NOT_ALLOWED (axenums.e:23)
    //   IF (access>acsLevel) ... RETURN RESULT_NOT_ALLOWED
    //
    // readToolTypeInt returns -1 for an ABSENT tooltype (tooltypes.e:176-180),
    // and -1 > acsLevel is never true. So absence means "everyone may run it"
    // and 0 means "nobody may". They are opposites, and this code had them the
    // wrong way round: a door with no ACCESS was recorded as level 0, and
    // re-enabling it wrote ACCESS=0 and locked it permanently.

    it('does not write ACCESS=0 when re-enabling a door that had none', () => {
      const openToAll = tools([['TYPE', 'XIM'], ['LOCATION', 'DOORS:Wall/wall']]);

      const disabled = applyEnabledToTooltypes(openToAll, false);
      const restored = applyEnabledToTooltypes(disabled, true);

      // Back to having no ACCESS at all, which is what "everyone" looks like.
      expect(has(restored, 'ACCESS')).toBe(false);
      expect(has(restored, PRIOR_ACCESS_TOOLTYPE)).toBe(false);
    });

    it('remembers that the door had no level, rather than calling it zero', () => {
      const disabled = applyEnabledToTooltypes(tools([['TYPE', 'XIM']]), false);

      // Whatever the sentinel is, it must not be a level express.e would
      // enforce as "denied to everyone".
      expect(valueOf(disabled, PRIOR_ACCESS_TOOLTYPE)).not.toBe('0');
    });

    it('parks a disabled door above any account that can exist', () => {
      // express.e:4704 is `access > acsLevel`, so parking at 255 leaves a
      // level-255 sysop able to run the door - and this board has ACS.255.
      const disabled = applyEnabledToTooltypes(tools([['ACCESS', '10']]), false);

      expect(Number(valueOf(disabled, 'ACCESS'))).toBeGreaterThan(255);
    });

    it('still restores a real level exactly', () => {
      const disabled = applyEnabledToTooltypes(tools([['ACCESS', '30']]), false);
      const restored = applyEnabledToTooltypes(disabled, true);

      expect(valueOf(restored, 'ACCESS')).toBe('30');
    });
  });

  describe('the access level the admin is shown', () => {
    it('shows the normal level for a disabled door, not the parked one', () => {
      // Showing 255 here would be saved straight back as the level to
      // restore, and enabling the door would leave it just as unreachable.
      expect(
        doorNormalAccessLevel({ accessLevel: 255, toolTypes: { ACCESS: '255', DRACCESS: '10' } })
      ).toBe(10);
    });

    it('shows the door s own level when it is enabled', () => {
      expect(doorNormalAccessLevel({ accessLevel: 30, toolTypes: { ACCESS: '30' } })).toBe(30);
    });

    it('falls back to zero when there is nothing to read', () => {
      expect(doorNormalAccessLevel({})).toBe(0);
    });
  });

  describe('editing the access level while a door is disabled', () => {
    it('edits the remembered level, not the parked one', () => {
      // Otherwise enabling the door would restore the old level and throw the
      // sysop's edit away - the value they typed IS the door's normal level.
      const disabled = tools([
        ['TYPE', 'XIM'],
        ['ACCESS', String(DISABLED_ACCESS_LEVEL)],
        ['DRACCESS', '10'],
      ]);

      const out = applyDoorFieldsToTooltypes(disabled, { min_security_level: 50 });

      expect(valueOf(out, PRIOR_ACCESS_TOOLTYPE)).toBe('50');
      expect(valueOf(out, 'ACCESS')).toBe(String(DISABLED_ACCESS_LEVEL));

      const restored = applyEnabledToTooltypes(out, true);
      expect(valueOf(restored, 'ACCESS')).toBe('50');
    });

    it('remembers the level just typed when both change in one save', () => {
      // The order the PUT route applies them in: fields, then the switch.
      // The other order would remember 10 and throw the sysop's 50 away.
      const enabledDoor = tools([['TYPE', 'XIM'], ['ACCESS', '10']]);

      const withFields = applyDoorFieldsToTooltypes(enabledDoor, { min_security_level: 50 });
      const out = applyEnabledToTooltypes(withFields, false);

      expect(valueOf(out, 'ACCESS')).toBe(String(DISABLED_ACCESS_LEVEL));
      expect(valueOf(out, PRIOR_ACCESS_TOOLTYPE)).toBe('50');

      expect(valueOf(applyEnabledToTooltypes(out, true), 'ACCESS')).toBe('50');
    });

    it('edits the access level directly when the door is enabled', () => {
      const out = applyDoorFieldsToTooltypes(
        tools([['TYPE', 'XIM'], ['ACCESS', '10']]),
        { min_security_level: 50 }
      );

      expect(valueOf(out, 'ACCESS')).toBe('50');
      expect(has(out, PRIOR_ACCESS_TOOLTYPE)).toBe(false);
    });
  });
});

describe('editing a door that is open to everyone', () => {
  // express.e:4703 - ACCESS=0 denies the door to EVERYBODY, and a door open
  // to everyone carries no ACCESS tooltype at all. The API serves 0 for such
  // a door and the form posts back what it was given, so editing ANY other
  // field wrote ACCESS=0 and locked it. buildNewDoorTooltypes already knew
  // this; the edit path did not, which is how 63 icons on this board ended up
  // denying themselves to everyone.
  const open = (): Tooltype[] => [
    { key: 'LOCATION', value: 'BBS:Doors/Wall/Wall', commented: false, originalLine: 'LOCATION=BBS:Doors/Wall/Wall' },
    { key: 'TYPE', value: 'XIM', commented: false, originalLine: 'TYPE=XIM' },
  ];

  it('does not write ACCESS=0 when the level is 0', () => {
    const out = applyDoorFieldsToTooltypes(open(), { door_name: 'Wall', min_security_level: 0 });

    expect(out.find(t => t.key === 'ACCESS')).toBeUndefined();
    expect(out.find(t => t.key === 'NAME')?.value).toBe('Wall');
  });

  it('removes an ACCESS that is already there when the level is set to 0', () => {
    const withAccess: Tooltype[] = [
      ...open(),
      { key: 'ACCESS', value: '100', commented: false, originalLine: 'ACCESS=100' },
    ];

    const out = applyDoorFieldsToTooltypes(withAccess, { min_security_level: 0 });

    expect(out.find(t => t.key === 'ACCESS')).toBeUndefined();
    // Everything else survives.
    expect(out.find(t => t.key === 'LOCATION')?.value).toBe('BBS:Doors/Wall/Wall');
    expect(out.find(t => t.key === 'TYPE')?.value).toBe('XIM');
  });

  it('still writes a real level', () => {
    const out = applyDoorFieldsToTooltypes(open(), { min_security_level: 100 });
    expect(out.find(t => t.key === 'ACCESS')?.value).toBe('100');
  });

  it('remembers "everyone" as an absence while the door is parked', () => {
    // A parked door's edit lands on DRACCESS. Recording 0 there would make
    // re-enabling write ACCESS=0 and lock the door permanently - the exact
    // fault 2b65f8455 fixed for the disable path.
    const parked: Tooltype[] = [
      ...open(),
      { key: 'ACCESS', value: '32767', commented: false, originalLine: 'ACCESS=32767' },
      { key: 'DRACCESS', value: '100', commented: false, originalLine: 'DRACCESS=100' },
    ];

    const edited = applyDoorFieldsToTooltypes(parked, { min_security_level: 0 });
    expect(edited.find(t => t.key === 'DRACCESS')?.value).toBe('-1');

    // And enabling it restores an ABSENCE, not a zero.
    const enabled = applyEnabledToTooltypes(edited, true);
    expect(enabled.find(t => t.key === 'ACCESS')).toBeUndefined();
    expect(enabled.find(t => t.key === 'DRACCESS')).toBeUndefined();
  });
});
