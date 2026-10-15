import { commandForArchive } from '../../../../Doors/door-manager/archive-command';

/**
 * DOORMAN used to ask the sysop to type a BBS command when installing a
 * door. Every AmiExpress door archive already ships its own command icon
 * (Commands/BBSCmd/<COMMAND>.info) carrying the tooltypes it was built
 * with, so a typed name is either redundant or wrong. This is the pure
 * naming decision the install-confirmation screens (app.ts) now use instead
 * of a free-text prompt.
 */
describe('commandForArchive', () => {
  it('uses the command the archive names', () => {
    expect(commandForArchive('HACKCHK.LHA', 'HACKCHECK'))
      .toEqual({ command: 'HACKCHECK', source: 'archive' });
  });

  it('falls back to the archive base name, and says so', () => {
    expect(commandForArchive('OZONE.LHA', null))
      .toEqual({ command: 'OZONE', source: 'archive-name' });
  });

  it('makes the fallback a usable BBS command', () => {
    expect(commandForArchive('-D-CALC v2!.LZX', null))
      .toEqual({ command: 'DCALCV2', source: 'archive-name' });
  });

  it('falls back when the archive names something unusable', () => {
    // A command has to be a filename-safe path segment (isUsableCommand);
    // an archive-supplied command that isn't one is not trustworthy either.
    expect(commandForArchive('THING.LHA', 'a/b'))
      .toEqual({ command: 'THING', source: 'archive-name' });
  });

  it('falls back to DOOR when the archive name has no usable characters', () => {
    expect(commandForArchive('!!!.LHA', null))
      .toEqual({ command: 'DOOR', source: 'archive-name' });
  });
});
