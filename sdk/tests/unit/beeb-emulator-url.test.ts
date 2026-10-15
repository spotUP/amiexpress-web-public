/**
 * The address of the board's BBC Micro.
 *
 * Two doors send callers to the same machine, so the model and the
 * parameter names are shared rather than restated - and one rule here is
 * not a preference but the emulator's own behaviour.
 */
import { emulatorUrl, MODEL } from '../../beeb/emulator-url';

describe('the emulator URL', () => {
  it('is a bare machine when nothing is given', () => {
    expect(emulatorUrl()).toBe(`/beeb/?model=${MODEL}`);
  });

  it('mounts a disc and boots it, which is SHIFT+BREAK', () => {
    const url = emulatorUrl({ file: 'ceefax-1985.ssd' });
    expect(url).toContain('disc1=ceefax-1985.ssd');
    expect(url).toContain('autoboot');
  });

  it('loads a tape through the tape parameter', () => {
    expect(emulatorUrl({ file: 'game.uef', kind: 'tape' })).toContain('tape=game.uef');
  });

  it('NEVER sends autoboot alongside autotype', () => {
    /*
     * jsbeeb reads autoboot, autochain, autorun and autotype in that order
     * and takes the FIRST one present. A URL carrying both therefore boots
     * the disc to its catalogue and silently drops the program the caller
     * asked for - which looks like the typing feature not working.
     */
    const url = emulatorUrl({ file: 'ceefax-1985.ssd', autotype: 'CHAIN "GOMOKU"\n' });
    expect(url).toContain(`autotype=${encodeURIComponent('CHAIN "GOMOKU"\n')}`);
    expect(url).not.toContain('autoboot');
  });

  it('escapes what it puts in the query, quotes and returns included', () => {
    const url = emulatorUrl({ file: 'a b.ssd', autotype: 'CHAIN "X"\n' });
    expect(url).toContain('disc1=a%20b.ssd');
    expect(url).not.toContain('"');
    expect(url).not.toContain('\n');
  });
});

describe('staying out of the emulator’s namespace', () => {
  /**
   * Parameters jsbeeb reads for itself, from its own table. Anything this
   * board adds to the URL has to avoid every one of them.
   */
  const JSBEEB_OWNS = [
    'rom', 'embed', 'fasttape', 'noseek', 'autoboot', 'autochain', 'autorun',
    'autotype', 'disc1', 'tape', 'model', 'coProcessor', 'stationId',
    'frameSkip', 'cpuMultiplier', 'tubeCpuMultiplier', 'keyLayout',
  ];

  it('passes the grant as `grant`, never as `rom`', () => {
    /*
     * THE BUG THIS EXISTS FOR. `rom` is jsbeeb's own parameter - an ARRAY
     * of extra ROM images to load - so a token passed under that name was
     * taken for a filename, and the machine died on
     * "Unable to load roms/<the token>, http code 404".
     */
    const url = emulatorUrl({ file: 'x.ssd', token: 'abc123' });
    expect(url).toContain('grant=abc123');
    expect(url).not.toMatch(/[?&]rom=/);
  });

  it('adds no parameter the emulator already answers to', () => {
    const url = emulatorUrl({ file: 'x.ssd', token: 'abc', autotype: 'CHAIN "X"\n' });
    const ours = [...new URLSearchParams(url.slice(url.indexOf('?') + 1)).keys()];
    // model, disc1 and autotype are deliberately jsbeeb's; the point is
    // that nothing ELSE of ours lands on a name it owns.
    const added = ours.filter(name => !['model', 'disc1', 'tape', 'autotype', 'autoboot'].includes(name));
    for (const name of added) {
      expect(JSBEEB_OWNS).not.toContain(name);
    }
    expect(added).toContain('grant');
  });
});
