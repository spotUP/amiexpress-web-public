/**
 * The default video render mode, which lives in two packages and must agree.
 *
 * The sysop's judgement after using all four modes: halfblock is the least
 * nice of them, and coloured ASCII is what people should get without
 * choosing. Changing that meant changing a default in three places:
 *
 *   Doors/livechat/server.ts              - seeds the header text
 *   Doors/livechat/features/voice-channel-ux.ts - the mode actually rendered
 *   web/backend/src/handlers/audio-video.handler.ts - the wire fallback
 *
 * The first two now read one constant, so they cannot drift. The third
 * cannot: `web/backend/src/` deliberately imports nothing from `Doors/`, and
 * this test is not a reason to start. So the two constants stay separate and
 * THIS file is what keeps them honest.
 *
 * It does not compare the two strings. It compares what they RENDER - the
 * wire code each maps to - because that is the property that matters and the
 * one that broke: the door's names ('ascii' | 'color' | 'halfblock' |
 * 'braille') and the backend's ('braille' | 'superres' | 'halfblock' |
 * 'ascii' | 'hsv' | 'shape') were never the same vocabulary. The door sent
 * 'color', which was not in the backend's union at all, and it worked only
 * because an unknown mode falls through to the ASCII branch.
 */
process.env.SKIP_DB_INIT = '1';

import {
  DEFAULT_RENDER_MODE,
  MODE_ASCII_COLOR,
  MODE_HALFBLOCK,
  modeCode,
} from '../../../../board/Doors/livechat/video-cells';
import { DEFAULT_VIDEO_MODE } from '../../src/handlers/audio-video.handler';

describe('the default video render mode', () => {
  it('is coloured ASCII on the door side', () => {
    expect(DEFAULT_RENDER_MODE).toBe('color');
    expect(modeCode(DEFAULT_RENDER_MODE, true)).toBe(MODE_ASCII_COLOR);
  });

  it('renders the same thing on the backend side', () => {
    // The strings are allowed to differ - the vocabularies are different -
    // but what reaches the terminal must not.
    expect(modeCode(DEFAULT_VIDEO_MODE, true)).toBe(modeCode(DEFAULT_RENDER_MODE, true));
  });

  it('is no longer halfblock on either side', () => {
    // The whole point of the change. If someone puts it back, they have to
    // do it here too, in front of the sysop's reason for moving it.
    expect(modeCode(DEFAULT_RENDER_MODE, true)).not.toBe(MODE_HALFBLOCK);
    expect(modeCode(DEFAULT_VIDEO_MODE, true)).not.toBe(MODE_HALFBLOCK);
  });

  it("maps the door's 'color' to coloured ASCII rather than falling through by luck", () => {
    // modeCode has an explicit case for it; this pins that the case exists
    // instead of relying on the `default:` arm and the colored flag.
    expect(modeCode('color', false)).toBe(MODE_ASCII_COLOR);
  });

  it('still honours a mode a caller picked by hand', () => {
    expect(modeCode('halfblock', true)).toBe(MODE_HALFBLOCK);
    expect(modeCode('braille', true)).not.toBe(MODE_ASCII_COLOR);
  });
});
