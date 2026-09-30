/**
 * EM (edit a message's body) clears fileattach before edit(), express.e:11143:
 *
 *   ELSEIF((str[1]="M") OR (str[1]="m"))
 *     fileattach:=FALSE
 *     ... loadMsg(str); IF(edit()=RESULT_SUCCESS) THEN saveMsg(str)
 *
 * so "Msg. Options" has no F. Ours offered it to anyone with ATTACH_FILES.
 */
import { handleMessageReaderNav, setMessagingDependencies } from '../../../src/handlers/message/messaging.handler';
import { handleMessageBodyInput } from '../../../src/handlers/message/message-entry.handler';
import { LoggedOnSubState } from '../../../src/constants/bbs-states';

describe('EM', () => {
  beforeAll(() => {
    setMessagingDependencies({ db: (global as any).testDb ?? {} } as any);
  });

  it('shows no F (file attachment) at Msg. Options', async () => {
    const out: string[] = [];
    const socket: any = { id: `em-${Date.now()}`, emit: (_e: string, t: any) => out.push(String(t)), on() {}, disconnect() {} };
    const session: any = {
      state: 'loggedon',
      subState: LoggedOnSubState.MSG_READER_NAV,
      // Every ACS flag granted, ATTACH_FILES included - only fileattach can hide F.
      user: { id: 'em-user', username: 'sysop', secLevel: 255, lineLength: 80, securityFlags: 'T'.repeat(200) },
      currentConf: 1,
      currentMsgBase: 1,
      inputBuffer: '',
      tempData: {
        msgReaderMessages: [{ id: 7, msgNumber: 7, subject: 's', author: 'sysop', toUser: 'ALL', body: 'old body', isPrivate: false }],
        msgReaderIndex: 0,
      },
    };

    await handleMessageReaderNav(socket, session, 'EM');
    expect(session.tempData.messageEntry?.editingExistingMsgId).toBe(7);
    await new Promise((r) => setTimeout(r, 30));
    out.length = 0;

    await handleMessageBodyInput(socket, session, '');
    await new Promise((r) => setTimeout(r, 30));

    const menu = out.join('');
    expect(menu).toContain('Msg. Options');
    expect(menu).not.toContain('\x1b[33mF\x1b[36m');
  });
});
