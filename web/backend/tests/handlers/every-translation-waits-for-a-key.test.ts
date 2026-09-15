/**
 * T! and T* pause between languages, as express.e:11085 does.
 *
 *     stat:=displayMessage(gfh)
 *     translatorMode:=TRANS_NONE
 *     IF(stat<0) THEN RETURN stat
 *     doPause()
 *
 * Ours printed the prompt and carried straight on - the comment under it said
 * "In a real implementation, we'd wait for keypress here" - so on a board with
 * several LANGUAGE.n tooltypes every translation scrolled past in one burst
 * and the caller read the last one. The prompt made it worse than having no
 * pause at all: it claimed to be waiting.
 *
 * The pause is a GATE, not an await: doPause installs a continuation and
 * returns. So these drive the real handler and assert on ORDER - what has
 * been emitted before the caller presses space, and what only appears after.
 */
const doPauseCalls: Array<() => void | Promise<void>> = [];

jest.mock('../../src/handlers/screen.handler', () => ({
  doPause: jest.fn((_socket: any, _session: any, onComplete?: () => void | Promise<void>) => {
    if (onComplete) doPauseCalls.push(onComplete);
  }),
  displayScreen: jest.fn().mockResolvedValue(false),
}));

const navPrompt = jest.fn();
jest.mock('../../src/handlers/message/messaging.handler', () => ({
  displayMessageNavigationPrompt: (...a: unknown[]) => navPrompt(...a),
}));

jest.mock('../../src/services/TranslationService', () => ({
  TranslatorMode: { TRANS_HOST_TO_DEFINED: 1, TRANS_DEFINED_TO_HOST: 2, TRANS_NONE: 0 },
  translationService: {
    initialize: jest.fn().mockResolvedValue(undefined),
    getAvailableLanguages: jest.fn(() => ['english', 'svenska', 'deutsch']),
    getHostLanguage: jest.fn(() => 'english'),
    hasTranslator: jest.fn(() => true),
    translateText: jest.fn((_body: string, _mode: number, lang: string) => `BODY-IN-${lang.toUpperCase()}`),
  },
}));

import { handleTranslationCommand } from '../../src/handlers/message/messaging-translation';

let socketSeq = 0;

function makeSocket() {
  const out: string[] = [];
  return {
    out,
    socket: {
      // A FRESH id per test: output.util keys its ANSI buffer by socket id,
      // so reusing one silently routes the second test's bytes into the
      // first test's buffer and the assertions read an empty string.
      id: `test-socket-${++socketSeq}`,
      // output.util registers a disconnect handler to release its ANSI buffer.
      on: () => undefined,
      emit: (_event: string, data: any) => {
        if (typeof data === 'string') out.push(data);
      },
    } as any,
  };
}

function makeSession(): any {
  return {
    user: { username: 'tester', translatorID: 0 },
    tempData: {
      msgReaderMessages: [{ body: 'hello', subject: 's', from: 'a', to: 'b' }],
      msgReaderIndex: 0,
    },
  };
}

describe('T! across every language', () => {
  beforeEach(() => {
    doPauseCalls.length = 0;
    navPrompt.mockClear();
  });

  it('stops after the first language instead of scrolling them all past', async () => {
    const { socket, out } = makeSocket();
    await handleTranslationCommand(socket, makeSession(), 'T!');

    const text = out.join('');
    expect(text).toContain('BODY-IN-SVENSKA');
    expect(text).not.toContain('BODY-IN-DEUTSCH');
  });

  it('installs a pause the caller has to answer', async () => {
    const { socket } = makeSocket();
    await handleTranslationCommand(socket, makeSession(), 'T!');

    expect(doPauseCalls).toHaveLength(1);
  });

  it('shows the next language only once the caller presses space', async () => {
    const { socket, out } = makeSocket();
    await handleTranslationCommand(socket, makeSession(), 'T!');

    await doPauseCalls[0]();

    expect(out.join('')).toContain('BODY-IN-DEUTSCH');
  });

  it('does not reach the navigation prompt until every language is done', async () => {
    const { socket } = makeSocket();
    await handleTranslationCommand(socket, makeSession(), 'T!');
    expect(navPrompt).not.toHaveBeenCalled();

    await doPauseCalls[0]();   // after svenska
    expect(navPrompt).not.toHaveBeenCalled();

    await doPauseCalls[1]();   // after deutsch
    expect(navPrompt).toHaveBeenCalledTimes(1);
  });

  it('skips the host language, so it is never one of the pauses', async () => {
    const { socket, out } = makeSocket();
    await handleTranslationCommand(socket, makeSession(), 'T!');
    await doPauseCalls[0]();

    expect(out.join('')).not.toContain('BODY-IN-ENGLISH');
  });
});
