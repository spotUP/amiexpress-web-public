/**
 * The reader reads its command with lineInput and then prints the caller's
 * line break, whatever the command (express.e:12066-12067):
 *
 *   stat:=lineInput('','',10,INPUT_TIMEOUT,str)
 *   aePuts('\b\n')
 *
 * EM drew "FullScreen Editor(y/N)?" on the prompt line itself, straight after
 * the typed "em" (sysop 2026-09-30: "missing linebreak"). The help lists and
 * EH / the forward refusal - which print a break of their own on top - were
 * one short the same way.
 */
import { handleMessageReaderNav, setMessagingDependencies } from '../../../src/handlers/message/messaging.handler';
import { LoggedOnSubState } from '../../../src/constants/bbs-states';

function reader(message: Record<string, unknown> = {}) {
  const out: string[] = [];
  const socket: any = { id: `nav-${Math.random()}`, emit: (_e: string, t: any) => out.push(String(t)), on() {}, disconnect() {} };
  const session: any = {
    state: 'loggedon',
    subState: LoggedOnSubState.MSG_READER_NAV,
    // Every ACS flag granted, so EM / EH / F are all allowed.
    user: { id: 'nav-user', username: 'sysop', secLevel: 255, lineLength: 80, securityFlags: 'T'.repeat(200) },
    currentConf: 1,
    currentMsgBase: 1,
    inputBuffer: '',
    tempData: {
      msgReaderMessages: [{ id: 7, msgNumber: 7, subject: 's', author: 'someone', toUser: 'ALL', body: 'b', isPrivate: false, ...message }],
      msgReaderIndex: 0,
    },
  };
  return { socket, session, text: async () => { await new Promise((r) => setTimeout(r, 30)); return out.join(''); } };
}

describe('a reader command begins below the line it was typed on', () => {
  beforeAll(() => {
    setMessagingDependencies({ db: (global as any).testDb ?? {} } as any);
  });

  it('EM: edit() starts on the next line', async () => {
    const r = reader();
    await handleMessageReaderNav(r.socket, r.session, 'EM');
    // edit() opens with the full-screen question, or - when it is not offered,
    // as here - with its own \b\n before "Enter your text" (express.e:10146).
    expect(await r.text()).toMatch(/^\r\n(\x1b\[36mFullScreen Editor|\r\n   Enter your text)/);
  });

  it.each(['?', '??'])('%s: the help list starts on the next line', async (cmd) => {
    const r = reader();
    await handleMessageReaderNav(r.socket, r.session, cmd);
    // express.e 12024 / 12035: both lists open with A>gain, one line below the prompt.
    expect((await r.text()).startsWith('\r\n\x1b[33mA\x1b[32m>')).toBe(true);
  });

  it('EH: the break, then editHeader\'s own blank line', async () => {
    const r = reader();
    await handleMessageReaderNav(r.socket, r.session, 'EH');
    expect(await r.text()).toMatch(/^\r\n\r\n[^\r\n]*From/);
  });

  it('F on mail that is not yours: the break, then the refusal\'s own blank line', async () => {
    const r = reader({ isPrivate: true, toUser: 'somebody else' });
    await handleMessageReaderNav(r.socket, r.session, 'F');
    expect(await r.text()).toMatch(/^\r\n\r\nMessage not deleted, not your mail\./);
  });
});
