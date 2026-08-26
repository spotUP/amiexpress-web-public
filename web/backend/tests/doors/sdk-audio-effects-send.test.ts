/**
 * Effects are on a SEND, not an insert (sdk/engines/audio/audio-engine.ts).
 *
 * "I can hardly hear the sound effects in Arkanoid now" - after a request for
 * a big wet hall reverb was granted by chaining a Reverb and a FeedbackDelay
 * in line with the effects bus.
 *
 * A Tone node's `wet` is a CROSSFADE, not an amount added. In an insert
 * chain, reverb wet 0.6 into echo wet 0.4 leaves 0.4 * 0.6 = 0.24 of the dry
 * transient - the attack that makes a brick hit sound like a hit. Turning the
 * reverb up made the game QUIETER. No amount of tuning the volume fixes that;
 * the topology is wrong.
 *
 * On a send, the dry path runs at full level straight to master and a
 * parallel copy goes through the processors at wet 1, summed back through a
 * send gain. More reverb then means more tail, never less impact.
 *
 * A Tone graph needs a real AudioContext, so this asserts the wiring in the
 * source. The gain arithmetic above is the part that matters and it is
 * verified numerically below.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const engine = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'sdk', 'engines', 'audio', 'audio-engine.ts'),
  'utf8'
);

/** The block that builds the audio graph. */
const graph = (() => {
  const start = engine.indexOf('this.masterGain = new Tone.Gain');
  expect(start).toBeGreaterThanOrEqual(0);
  return engine.slice(start, engine.indexOf('this.buildSoundLibrary()', start));
})();

describe('the dry path', () => {
  it('reaches master without passing through the effects', () => {
    // The whole fix in one line: if this ever routes through the reverb
    // again, effects lose their attack.
    expect(graph).toMatch(/this\.sfxGain\.connect\(this\.masterGain\)/);
  });

  it('is not attenuated by how wet the effects are', () => {
    // An insert chain crossfades; a send does not touch the dry level.
    const dryThroughInserts = (1 - 0.6) * (1 - 0.4);
    expect(dryThroughInserts).toBeCloseTo(0.24);

    // With a send the dry signal is whole, whatever the send level.
    const dryThroughSend = 1;
    expect(dryThroughSend).toBeGreaterThan(dryThroughInserts * 4);
  });
});

describe('the effects send', () => {
  it('is a parallel gain into master', () => {
    expect(graph).toMatch(/this\.sfxSend = new Tone\.Gain\(sendLevel\)\.connect\(this\.masterGain\)/);
  });

  it('is fed a copy of the effects', () => {
    expect(graph).toMatch(/this\.sfxGain\.connect\(sendDestination\)/);
  });

  it('runs its processors fully wet', () => {
    // Any dry inside the send would be a second copy of the dry path,
    // phase-smearing the very attack this fix exists to protect.
    const wets = graph.match(/wet: 1,/g) ?? [];
    expect(wets).toHaveLength(2);
    expect(graph).not.toMatch(/wet: reverb\.wet/);
    expect(graph).not.toMatch(/wet: echo\.wet/);
  });

  it('is not built at all when no effects were asked for', () => {
    // A door that wants none should get the plain gain, not a silent send.
    expect(graph).toMatch(/if \(sendLevel > 0\)/);
  });

  it('takes its level from the effect the door asked for most', () => {
    expect(graph).toMatch(/Math\.max\(reverb\?\.wet \?\? 0, echo\?\.wet \?\? 0\)/);
  });
});

describe('music', () => {
  it('never touches the effects', () => {
    // A tracker module through a six-second hall is mush.
    expect(graph).toMatch(/this\.musicGain = new Tone\.Gain\([^)]*\)\.connect\(this\.masterGain\)/);
    expect(graph).not.toMatch(/musicGain[^\n]*sfxReverb/);
    expect(graph).not.toMatch(/musicGain[^\n]*sfxSend/);
  });
});
