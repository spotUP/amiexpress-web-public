import { isPlausibleDoorName } from '../../src/doors/door-name-plausibility';

describe('isPlausibleDoorName', () => {
  it('rejects the ASCII art the live board actually carries', () => {
    // Straight off DOORMAN's panel, 2026-08-30.
    expect(isPlausibleDoorName('.______.')).toBe(false);
    expect(isPlausibleDoorName('|::  |____ \\:__:_')).toBe(false);
    expect(isPlausibleDoorName('-----------')).toBe(false);
  });

  it('rejects nothing at all', () => {
    expect(isPlausibleDoorName(null)).toBe(false);
    expect(isPlausibleDoorName('')).toBe(false);
    expect(isPlausibleDoorName('   ')).toBe(false);
  });

  it('rejects mojibake and high-bit runs', () => {
    expect(isPlausibleDoorName('���')).toBe(false);
    expect(isPlausibleDoorName('±±±±±')).toBe(false);
  });

  it('rejects an echo of the command or the archive', () => {
    expect(isPlausibleDoorName('AEHELP', { command: 'AEHELP' })).toBe(false);
    expect(isPlausibleDoorName('-D-CALC', { archiveName: '-D-CALC.LHA' })).toBe(false);
  });

  it('keeps a name a sysop plainly meant', () => {
    expect(isPlausibleDoorName('Hack Check')).toBe(true);
    expect(isPlausibleDoorName('AmiExpress Help System', { command: 'AEHELP' })).toBe(true);
    expect(isPlausibleDoorName('BaudCheck v0.1')).toBe(true);
    expect(isPlausibleDoorName('Trivia!')).toBe(true);
  });
});
