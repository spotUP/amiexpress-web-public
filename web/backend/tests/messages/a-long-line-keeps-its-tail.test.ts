/**
 * "THE TEXT IS CUT OFF ... I DISCOVERED IT WHEN I LOGGED IN WITH ANSI TO READ
 * IT" (the sysop, 2026-09-23).
 *
 * He wrote a message on a PETSCII session, read it back on an eighty-column
 * one, and the sentence stopped mid-word: `Look at that, petscii colors and
 * cha`. Thirty-six characters, which is `messageBodyLineLimit` for a forty-
 * column screen.
 *
 * The editor capped each body line to what the caller's screen holds - right
 * in itself, since a wrap downstream would cut a run of PETSCII graphics
 * mid-figure - and then THREW THE REST AWAY. The caller cannot see it happen:
 * his own screen wraps the echo, so the words are in front of him while the
 * board keeps the first thirty-six.
 *
 * A line that does not fit now WRAPS onto the next body line as he types,
 * with express.e edit()'s own word wrap (10320-10357): a word moves whole and
 * a spaceless run of graphics breaks at the screen edge.
 *
 * Driven through `handleCommand`, the entry point every keystroke takes.
 */
process.env.SKIP_DB_INIT = '1';

import { handleCommand } from '../../src/handlers/command.handler';
import { messageBodyLineLimit } from '../../src/utils/table-format.util';
import { puaForScreenCode } from '@amiexpress/bbs-door-sdk/petscii';
import { BBSState, LoggedOnSubState } from '../../src/index';

const socket = {
  id: 'long-line',
  emit: () => true,
  on: () => {}, off: () => {}, removeListener: () => {},
} as any;

function bodySession(columns: number): any {
  return {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.POST_MESSAGE_BODY,
    petsciiMode: columns === 40,
    terminalType: columns === 40 ? 'c64' : 'ansi',
    connectionType: 'web',
    screenWidth: columns,
    screenHeight: 25,
    nodeId: 1,
    currentConf: 1,
    inputBuffer: '',
    user: { id: 1, username: 'spot', secLevel: 255 },
    tempData: {
      messageEntry: { body: [], currentLine: 1, toUser: 'ALL', subject: 'art' },
    },
  };
}

/** Type a line and press RETURN; answer with the whole stored body. */
async function typeLine(session: any, text: string): Promise<string[]> {
  for (const ch of text) await handleCommand(socket, session, ch);
  await handleCommand(socket, session, '\r');
  return session.tempData.messageEntry.body;
}

describe('a line longer than the caller\'s screen', () => {
  it('keeps every word he typed', async () => {
    const session = bodySession(40);
    const sentence = 'Look at that, petscii colors and characters in a message';

    const body = await typeLine(session, sentence);

    expect(body.join(' ').replace(/\s+/g, ' ').trim()).toBe(sentence);
  });

  it('breaks it at a word, not mid-word', async () => {
    const session = bodySession(40);

    const body = await typeLine(session, 'Look at that, petscii colors and characters');

    expect(body.length).toBeGreaterThan(1);
    expect(body[0]).not.toMatch(/cha$/);
    for (const line of body) {
      expect(line.length).toBeLessThanOrEqual(messageBodyLineLimit(session));
    }
  });

  it('counts the lines it actually added, so the prompt does not lie', async () => {
    const session = bodySession(40);

    const body = await typeLine(session, 'Look at that, petscii colors and characters');

    expect(session.tempData.messageEntry.currentLine).toBe(body.length + 1);
  });

  it('breaks a spaceless run of graphics at the screen edge', async () => {
    const session = bodySession(40);
    const limit = messageBodyLineLimit(session);
    const bar = puaForScreenCode(0x40).repeat(limit + 6);

    const body = await typeLine(session, bar);

    // express.e:10320-10335: no space to break at, so the line is stored as
    // it stands when the key past maxLineLen arrives - limit + 1 cells.
    expect(body[0].length).toBe(limit + 1);
    expect(body.join('')).toBe(bar);
  });

  it('leaves an eighty-column caller\'s line exactly as it was', async () => {
    const session = bodySession(80);
    const sentence = 'A line an eighty column caller types, which fits his screen.';

    const body = await typeLine(session, sentence);

    expect(body).toEqual([sentence]);
  });
});
