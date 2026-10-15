/**
 * A server-rendered door can make a sound.
 *
 * The sysop, twice on 2026-09-15: "doorman is solid but silent". It was, and
 * there was no way for it not to be: `ArcadeSfx` crosses to a door's own
 * CLIENT bundle, and a blessed utility door has none. The board's own sound
 * channel - `audio:play-sfx`, which the terminal has listened on all along -
 * had no emitter anywhere on the server.
 *
 * These pin the payload shape the terminal's MediaHandler switches on, and
 * the throttle, which is the part that decides whether a held cursor key
 * sounds like navigation or like a buzz.
 */
import { BBSApi } from '../../src/doors/BBSApi';

type Emitted = { event: string; payload: any };

const makeApi = () => {
  const emitted: Emitted[] = [];
  const socket: any = { emit: (event: string, payload: any) => { emitted.push({ event, payload }); } };
  const session: any = { connectionType: 'web' };
  return { api: new BBSApi(socket, session), emitted };
};

describe('bbs.playUiSound', () => {
  it('emits the library payload the terminal understands', () => {
    const { api, emitted } = makeApi();
    api.playUiSound('click');

    expect(emitted).toEqual([
      { event: 'audio:play-sfx', payload: { type: 'library', soundId: 'click' } },
    ]);
  });

  it('does not stack two copies of one blip on a held key', () => {
    const { api, emitted } = makeApi();
    api.playUiSound('click');
    api.playUiSound('click');   // the same millisecond
    expect(emitted).toHaveLength(1);
  });

  it('lets a different sound through immediately', () => {
    const { api, emitted } = makeApi();
    api.playUiSound('click');
    api.playUiSound('menu-select');

    // A move and the select that ends it are two noises; one must not
    // silence the other.
    expect(emitted.map((e) => e.payload.soundId)).toEqual(['click', 'menu-select']);
  });

  it('plays the same sound again once the gap has passed', () => {
    const { api, emitted } = makeApi();
    const realNow = Date.now;
    try {
      let t = 1_000_000;
      (Date as any).now = () => t;
      api.playUiSound('click');
      t += 120;                 // one step of a held key at the application rate
      api.playUiSound('click');
      expect(emitted).toHaveLength(2);
    } finally {
      (Date as any).now = realNow;
    }
  });
});
