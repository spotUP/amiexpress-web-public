/**
 * SOURCE PINS (not runtime proofs - launchAmigaDoor and DoorMessageHandler
 * are not unit-constructible). They hold the two edit sites that feed the
 * runtime-tested doorScreenWidth() answer:
 *  - door.handler.ts launchAmigaDoor passes petsciiMode + screenWidth into
 *    the 68K bbsSession and derives lineWrap through doorScreenWidth().
 *  - DoorMessageHandler's fallback BB_SCRWIDTH no longer writes a literal 80.
 */
import * as fs from 'fs';
import * as path from 'path';

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '../../src', p), 'utf8');

describe('door launch hands the 68K session its PETSCII width', () => {
  it('launchAmigaDoor derives lineWrap from doorScreenWidth and passes petsciiMode + screenWidth', () => {
    const src = read('handlers/door.handler.ts');
    const literal = src.slice(src.indexOf('const amigaSession = new AmigaDoorSession(socket, {'), src.indexOf('[launchAmigaDoor] bbsSession.currentConference='));
    expect(literal).toContain('lineWrap: doorScreenWidth(session, terminalWidth),');
    expect(literal).toContain('petsciiMode: session.petsciiMode === true,');
    expect(literal).toContain('screenWidth: session.screenWidth,');
    expect(literal).not.toContain('lineWrap: terminalWidth,');
  });

  it('DoorMessageHandler fallback BB_SCRWIDTH answers through doorScreenWidth, never a literal 80', () => {
    const src = read('amiga-emulation/session/DoorMessageHandler.ts');
    const start = src.indexOf('case XIMCommand.BB_SCRWIDTH:');
    const block = src.slice(start, src.indexOf('case XIMCommand.BB_SCRHEIGHT:', start));
    expect(block).toContain('doorScreenWidth(this.config.bbsSession)');
    expect(block).not.toContain('MESSAGE_DATA_OFFSET, 80)');
  });
});
