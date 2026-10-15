/**
 * Music and effects sharing one mix.
 *
 * Reported live 2026-08-25: "in Arkanoid the sound effects are much louder
 * than the music, they need to be more balanced" - and a request for hall
 * reverb on the effects "so it sounds like it echoes in outer space".
 *
 * The cause of the imbalance was structural: Arkanoid's tracker built its
 * OWN AudioContext and connected straight to the speakers, so the audio
 * engine's master and music volumes did nothing to it and the two could only
 * ever be balanced by guesswork. These tests pin the two capabilities that
 * make a real balance possible - a music bus to join, and the context that
 * bus lives in, because Web Audio refuses to connect nodes across contexts.
 */

// Tone.js ships ESM only and this suite runs under CommonJS. The contract
// under test is the WIRING - which buses exist and what they report before
// the browser has let audio start - not Tone's own behaviour.
jest.mock('tone', () => ({
  Gain: class { connect() { return this; } toDestination() { return this; } },
  Reverb: class { connect() { return this; } },
  getContext: () => null,
  start: async () => undefined,
}));

import { AudioEngine } from '../../engines/audio/audio-engine';
import { TrackerEngine } from '../../engines/audio/tracker-engine';

describe('the audio engine as a mixer', () => {
  it('offers a music bus for other engines to play into', () => {
    const engine = new AudioEngine({ musicVolume: 0.85, sfxVolume: 0.45 });

    expect(typeof engine.getMusicBus).toBe('function');
  });

  it('offers the context that bus lives in', () => {
    // Without this a caller cannot build its nodes on the right context, and
    // connecting to the bus would throw.
    const engine = new AudioEngine({});

    expect(typeof engine.getAudioContext).toBe('function');
  });

  it('reports no context before a user gesture has started it', () => {
    // Browsers refuse to start audio until the user interacts, so a caller
    // has to cope with "not yet" rather than crashing. Outside a browser the
    // bus is a placeholder object; the CONTEXT is what tells a caller
    // whether it can safely build nodes and connect them.
    const engine = new AudioEngine({});

    expect(engine.getAudioContext()).toBeNull();
  });

  it('keeps the reverb request on the configuration', () => {
    // Effects only - music through a long reverb turns to mush.
    const engine = new AudioEngine({
      sfxReverb: { wet: 0.35, decay: 4.5, preDelay: 0.03 },
    });

    expect(engine.getConfig().sfxReverb).toMatchObject({ wet: 0.35, decay: 4.5 });
  });

  it('has no reverb unless one is asked for', () => {
    const engine = new AudioEngine({});

    expect(engine.getConfig().sfxReverb).toBeUndefined();
  });
});

describe('the tracker as a music source', () => {
  it('accepts somewhere to play other than the speakers', () => {
    const bus: any = { input: {} };
    const tracker = new TrackerEngine({ outputNode: bus, volume: 1 });

    expect((tracker as any).config.outputNode).toBe(bus);
  });

  it('defaults to no bus, so existing callers still reach the speakers', () => {
    const tracker = new TrackerEngine({ volume: 1 });

    expect((tracker as any).config.outputNode).toBeNull();
  });
});
