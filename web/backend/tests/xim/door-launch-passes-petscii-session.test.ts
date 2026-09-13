/**
 * SOURCE PINS (not runtime proofs - launchAmigaDoor and DoorMessageHandler
 * are not unit-constructible). They hold the two edit sites that feed the
 * runtime-tested doorScreenWidth() answer:
 *  - door.handler.ts launchAmigaDoor builds the 68K bbsSession's geometry
 *    through doorSessionGeometry(), which is what carries petsciiMode,
 *    texttvMode, screenWidth and lineWrap across as one.
 *  - DoorMessageHandler's fallback BB_SCRWIDTH no longer writes a literal 80.
 */
import * as fs from 'fs';
import * as path from 'path';

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '../../src', p), 'utf8');

describe('door launch hands the 68K session its PETSCII width', () => {
  it('launchAmigaDoor builds the 68K session geometry through doorSessionGeometry', () => {
    const src = read('handlers/door.handler.ts');
    const literal = src.slice(src.indexOf('const amigaSession = new AmigaDoorSession(socket, {'), src.indexOf('[launchAmigaDoor] bbsSession.currentConference='));
    // The three fields now travel together, through doorSessionGeometry -
    // pinned by behaviour in tests/xim/teletext-door-geometry.test.ts. What
    // this still holds is that the LAUNCH SITE goes through it rather than
    // rebuilding the literal by hand, which is how texttvMode was left out.
    expect(literal).toContain('...doorSessionGeometry(session, terminalWidth),');
    expect(literal).not.toContain('lineWrap: terminalWidth,');
    expect(literal).not.toContain('petsciiMode: session.petsciiMode === true,');
  });

  it('DoorMessageHandler fallback BB_SCRWIDTH answers through doorScreenWidth, never a literal 80', () => {
    const src = read('amiga-emulation/session/DoorMessageHandler.ts');
    const start = src.indexOf('case XIMCommand.BB_SCRWIDTH:');
    const block = src.slice(start, src.indexOf('case XIMCommand.BB_SCRHEIGHT:', start));
    expect(block).toContain('doorScreenWidth(this.config.bbsSession)');
    expect(block).not.toContain('MESSAGE_DATA_OFFSET, 80)');
  });
});
