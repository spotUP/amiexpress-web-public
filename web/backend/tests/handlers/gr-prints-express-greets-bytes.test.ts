/**
 * GR prints express.e's internalCommandGreets (24411-24422) byte for byte:
 * the space between two groups sits outside the blue, and nothing follows
 * the list - no "Press any key to continue...", the main loop's doPause
 * does that job. Compared against the source itself, so a typo in a group
 * name fails too.
 */
import { handleGreetingsCommand } from '../../src/handlers/commands/advanced-commands.handler';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { readExpressE, testWithExpressE } from '../helpers/reference-sources';

function expressGreets(): string {
  const src = readExpressE();
  const proc = src.slice(src.indexOf('PROC internalCommandGreets()'));
  const body = proc.slice(0, proc.indexOf('ENDPROC'));
  return [...body.matchAll(/aePuts\('([^']*)'\)/g)]
    .map(m => m[1].replace(/\\b\\n/g, '\r\n'))
    .join('');
}

testWithExpressE('GR prints express.e greets bytes and leaves the pause to the menu', () => {
  const printed: string[] = [];
  const socket = { emit: (event: string, data: unknown) => { if (event === 'ansi-output') printed.push(String(data)); } };
  const session: any = { menuPause: false, subState: LoggedOnSubState.DISPLAY_MENU };

  handleGreetingsCommand(socket, session);

  const want = expressGreets();
  expect(want).toContain('razor1911');
  expect(printed.join('')).toBe(want);
  expect(session.menuPause).toBe(true);
  expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
});
