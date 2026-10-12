/**
 * Keys the caller typed before a pause prompt went up answer it, as
 * express.e's checkForPause (5194) and flagPause (28035) read the answer with
 * lineInput off the serial buffer. The port's pause prompts only read keys
 * that arrived after them: what a procedure held (holdInput) or left on the
 * line was skipped, and the listing sat at the prompt.
 *
 * Driven through the board's own pause port (utils/flag-pause), with the keys
 * where utils/await-input keeps them.
 */
import { checkForPause, flagPause } from '../../src/utils/flag-pause.util';
import { flushOutput } from '../../src/utils/output.util';

function caller(extra: Record<string, unknown>) {
  const wire: string[] = [];
  const socket: any = {
    id: `pause-ahead-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, data: unknown) => { if (event === 'ansi-output') wire.push(String(data)); return true; },
    on: () => socket,
  };
  // A page of ten lines, one line short of it.
  const session: any = { screenHeight: 10, tempData: { lineCount: 9 }, ...extra };
  return { socket, session, wire };
}

test('n and RETURN typed before (Pause)...More(y/n/ns)? answer it; what follows stays on the line', async () => {
  const c = caller({ lineAhead: ['n', '\r', 'z'] });
  const more = await checkForPause(c.socket, c.session);
  flushOutput(c.socket);
  expect(more).toBe(false);
  expect(c.wire.join('')).toContain('(Pause)...More(y/n/ns)? n');
  expect(c.session.lineAhead).toEqual(['z']);
  expect(c.session.checkPauseHandler).toBeUndefined();
});

test('ns and RETURN held for a procedure answer the flagPause prompt and go non-stop', async () => {
  const c = caller({ typeAhead: ['n', 's', '\r'] });
  const more = await flagPause(c.socket, c.session, 1);
  flushOutput(c.socket);
  expect(more).toBe(true);
  expect(c.session.tempData.nonStopDisplayFlag).toBe(true);
  expect(c.session.typeAhead).toEqual([]);
  expect(c.session.flagPauseHandler).toBeUndefined();
});
