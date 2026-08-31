/**
 * The arcade sound channel.
 *
 * Three properties are worth protecting, because each one has a failure mode
 * that is silent by definition - a sound effect cannot report that it never
 * played.
 *
 * 1. A door with no browser attached keeps running. Telnet sessions and the
 *    test harness both pass no socket, and the game must not care.
 * 2. A condition-driven call cannot machine-gun the wire. A 30 Hz loop that
 *    plays a sound every tick sends two per second, not thirty.
 * 3. The browser half attaches once and detaches on request, because a door
 *    is unloaded by removing its script - which leaves its listeners behind,
 *    so a re-entry would play every sound twice.
 */

import {
  ArcadeSfx,
  SfxCues,
  installArcadeSfx,
  ARCADE_SFX_EVENT,
  type ArcadeSfxPayload,
  type ArcadeSound,
} from '../../engines/ui/arcade/sfx';

/** A socket that records what a door tried to send. */
function recordingTransport() {
  const sent: ArcadeSfxPayload[] = [];
  return {
    sent,
    emit(event: string, payload: unknown) {
      if (event === ARCADE_SFX_EVENT) sent.push(payload as ArcadeSfxPayload);
    },
  };
}

/** A clock the test drives by hand, so no test waits on real time. */
function fakeClock(start = 1_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe('SfxCues', () => {
  it('hands back what the game pushed, in the order it happened', () => {
    const cues = new SfxCues();
    cues.push('jump');
    cues.push('coin');
    cues.push('death');

    expect(cues.drain()).toEqual(['jump', 'coin', 'death']);
  });

  it('empties on drain, so one event is never heard twice', () => {
    const cues = new SfxCues();
    cues.push('hit');

    expect(cues.drain()).toEqual(['hit']);
    expect(cues.drain()).toEqual([]);
  });

  it('drops the oldest cues rather than growing without limit', () => {
    // A game left running against a socket nobody drains must not leak.
    const cues = new SfxCues();
    for (let i = 0; i < 100; i++) cues.push('blip');

    expect(cues.pending.length).toBe(32);
  });

  it('clear throws away a state change nobody should hear', () => {
    const cues = new SfxCues();
    cues.push('explosion');
    cues.clear();

    expect(cues.drain()).toEqual([]);
  });
});

describe('ArcadeSfx', () => {
  it('emits the named sound on the arcade channel', () => {
    const transport = recordingTransport();
    const sfx = new ArcadeSfx(transport);

    expect(sfx.play('coin')).toBe(true);
    expect(transport.sent).toEqual([{ sound: 'coin' }]);
  });

  it('passes per-sound parameters through when a door supplies them', () => {
    const transport = recordingTransport();
    const sfx = new ArcadeSfx(transport);

    sfx.play('hit', { frequency: 220, duration: 0.05 });

    expect(transport.sent).toEqual([
      { sound: 'hit', params: { frequency: 220, duration: 0.05 } },
    ]);
  });

  it('runs without a socket at all', () => {
    // Telnet has no browser. The door must play exactly the same.
    const sfx = new ArcadeSfx(null);

    expect(sfx.play('death')).toBe(false);
    expect(() => sfx.playAll(['jump', 'coin'])).not.toThrow();
  });

  it('survives a socket that dies mid-tick', () => {
    const dead = {
      emit() {
        throw new Error('socket closed');
      },
    };
    const sfx = new ArcadeSfx(dead);

    expect(() => sfx.play('explosion')).not.toThrow();
    expect(sfx.play('explosion')).toBe(false);
  });

  it('holds the same sound to one per gap, so a per-tick call cannot flood', () => {
    const clock = fakeClock();
    const transport = recordingTransport();
    const sfx = new ArcadeSfx(transport, { minGapMs: 60, now: clock.now });

    // A 30 Hz loop calling play() every tick for a whole second.
    let accepted = 0;
    for (let tick = 0; tick < 30; tick++) {
      if (sfx.play('footstep')) accepted++;
      clock.advance(33);
    }

    // Every other tick clears the 60 ms gap: 15 of the 30 calls go out.
    expect(accepted).toBe(15);
    expect(transport.sent.length).toBe(15);
  });

  it('gaps each sound separately, so a stream of one does not mute another', () => {
    const clock = fakeClock();
    const transport = recordingTransport();
    const sfx = new ArcadeSfx(transport, { minGapMs: 60, now: clock.now });

    expect(sfx.play('footstep')).toBe(true);
    expect(sfx.play('death')).toBe(true);

    clock.advance(10);
    expect(sfx.play('footstep')).toBe(false);
    // Death is the important one and it is a different sound: it goes out.
    expect(sfx.play('explosion')).toBe(true);
  });

  it('honours a per-sound override of the gap', () => {
    const clock = fakeClock();
    const transport = recordingTransport();
    const sfx = new ArcadeSfx(transport, {
      minGapMs: 60,
      soundGapMs: { blip: 0 },
      now: clock.now,
    });

    expect(sfx.play('blip')).toBe(true);
    expect(sfx.play('blip')).toBe(true);
  });

  it('caps the whole channel per second, whatever the sounds are', () => {
    const clock = fakeClock();
    const transport = recordingTransport();
    const sfx = new ArcadeSfx(transport, {
      minGapMs: 0,
      maxPerSecond: 5,
      now: clock.now,
    });

    const sounds: ArcadeSound[] = ['blip', 'boop', 'coin', 'hit', 'jump', 'land', 'zap'];
    const sent = sfx.playAll(sounds);

    expect(sent).toBe(5);
  });

  it('lets the cap refill once the second has passed', () => {
    const clock = fakeClock();
    const transport = recordingTransport();
    const sfx = new ArcadeSfx(transport, {
      minGapMs: 0,
      maxPerSecond: 2,
      now: clock.now,
    });

    sfx.play('blip');
    sfx.play('boop');
    expect(sfx.play('coin')).toBe(false);

    clock.advance(1000);
    expect(sfx.play('coin')).toBe(true);
  });

  it('goes quiet when the door turns sound off, and comes back', () => {
    const transport = recordingTransport();
    const sfx = new ArcadeSfx(transport, { minGapMs: 0 });

    sfx.setEnabled(false);
    expect(sfx.play('coin')).toBe(false);
    expect(sfx.isEnabled).toBe(false);

    sfx.setEnabled(true);
    expect(sfx.play('coin')).toBe(true);
  });

  it('flush drains a cue queue onto the wire in order', () => {
    const transport = recordingTransport();
    const sfx = new ArcadeSfx(transport, { minGapMs: 0 });
    const cues = new SfxCues();

    cues.push('jump');
    cues.push('coin');
    const sent = sfx.flush(cues);

    expect(sent).toBe(2);
    expect(transport.sent.map((p) => p.sound)).toEqual(['jump', 'coin']);
    expect(cues.pending).toEqual([]);
  });

  it('stays silent after destroy', () => {
    const transport = recordingTransport();
    const sfx = new ArcadeSfx(transport);

    sfx.destroy();

    expect(sfx.play('coin')).toBe(false);
    expect(transport.sent).toEqual([]);
  });
});

describe('installArcadeSfx', () => {
  /** A socket the test can fire events at. */
  function fakeSocket() {
    const handlers = new Map<string, ((payload: any) => void)[]>();
    return {
      handlerCount: (event: string) => handlers.get(event)?.length ?? 0,
      fire(event: string, payload: unknown) {
        for (const handler of handlers.get(event) ?? []) handler(payload);
      },
      on(event: string, handler: (payload: any) => void) {
        const list = handlers.get(event) ?? [];
        list.push(handler);
        handlers.set(event, list);
      },
      off(event: string, handler: (payload: any) => void) {
        const list = handlers.get(event) ?? [];
        const at = list.indexOf(handler);
        if (at >= 0) list.splice(at, 1);
      },
    };
  }

  /** An AudioEngine stand-in that counts what it was asked to do. */
  function fakeAudio(initBehaviour: () => Promise<void> = async () => {}) {
    const played: { soundId: string; params?: unknown }[] = [];
    let inits = 0;
    return {
      played,
      get inits() {
        return inits;
      },
      init: () => {
        inits++;
        return initBehaviour();
      },
      playSound: (soundId: string, params?: unknown) => {
        played.push({ soundId, params });
      },
    };
  }

  it('plays what arrives on the channel', async () => {
    const socket = fakeSocket();
    const audio = fakeAudio();
    installArcadeSfx(audio, { socket });

    socket.fire(ARCADE_SFX_EVENT, { sound: 'coin' });
    await Promise.resolve();
    await Promise.resolve();

    expect(audio.played).toEqual([{ soundId: 'coin', params: undefined }]);
  });

  it('opens the audio context once, not once per beep', async () => {
    const socket = fakeSocket();
    const audio = fakeAudio();
    installArcadeSfx(audio, { socket });

    socket.fire(ARCADE_SFX_EVENT, { sound: 'blip' });
    socket.fire(ARCADE_SFX_EVENT, { sound: 'boop' });
    socket.fire(ARCADE_SFX_EVENT, { sound: 'coin' });
    await Promise.resolve();
    await Promise.resolve();

    expect(audio.inits).toBe(1);
    expect(audio.played.length).toBe(3);
  });

  it('tries again after a failed init instead of going silent for good', async () => {
    // The first failure is usually the autoplay policy; by the next sound
    // the player has certainly pressed a key.
    let attempt = 0;
    const socket = fakeSocket();
    const audio = fakeAudio(async () => {
      attempt++;
      if (attempt === 1) throw new Error('autoplay blocked');
    });
    const errors: unknown[] = [];
    installArcadeSfx(audio, { socket, onError: (e) => errors.push(e) });

    socket.fire(ARCADE_SFX_EVENT, { sound: 'blip' });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(errors.length).toBe(1);
    expect(audio.played).toEqual([]);

    socket.fire(ARCADE_SFX_EVENT, { sound: 'coin' });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(audio.played).toEqual([{ soundId: 'coin', params: undefined }]);
  });

  it('ignores a payload that names no sound', async () => {
    const socket = fakeSocket();
    const audio = fakeAudio();
    installArcadeSfx(audio, { socket });

    socket.fire(ARCADE_SFX_EVENT, {});
    socket.fire(ARCADE_SFX_EVENT, null);
    await Promise.resolve();

    expect(audio.inits).toBe(0);
    expect(audio.played).toEqual([]);
  });

  it('detaches on request, so a re-entered door does not play everything twice', () => {
    const socket = fakeSocket();
    const audio = fakeAudio();

    const stop = installArcadeSfx(audio, { socket });
    expect(socket.handlerCount(ARCADE_SFX_EVENT)).toBe(1);

    stop();
    expect(socket.handlerCount(ARCADE_SFX_EVENT)).toBe(0);
  });

  it('does nothing, safely, when there is no socket to listen on', () => {
    const audio = fakeAudio();

    const stop = installArcadeSfx(audio, { socket: null });

    expect(() => stop()).not.toThrow();
    expect(audio.inits).toBe(0);
  });
});
