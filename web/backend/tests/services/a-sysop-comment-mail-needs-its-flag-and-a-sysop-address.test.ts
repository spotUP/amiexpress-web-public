/**
 * express.e:6701-6711 doCommentNotify: mail only when MAIL_ON_SYSOP_COMMENT is
 * set and a sysop address exists; subject/body text as in 6706-6708.
 * (runExecuteOn('SYSOP_COMMENT') half is called beside it in saveMessage.)
 */
const sendMail = jest.fn().mockResolvedValue({});
jest.mock('nodemailer', () => ({ __esModule: true, default: { createTransport: () => ({ sendMail }) } }));
let cfg: Record<string, unknown> = {};
jest.mock('../../src/services/bbs-config-file.service', () => ({ loadBBSConfig: () => cfg }));
jest.mock('../../src/database', () => ({ db: { getConfigRepository: () => ({ getSystemConfig: () => ({}) }) } }));
jest.mock('../../src/config', () => ({ config: { get: () => '/nonexistent' } }));

describe('mailOnSysopComment', () => {
  const load = () => {
    jest.resetModules();
    sendMail.mockClear();
    return require('../../src/services/mail-notification.service') as typeof import('../../src/services/mail-notification.service');
  };
  const base = { smtp_server: 'smtp.x', sysop_email: 'op@x', bbs_name: 'Uptown' };

  it('sends the notification with the express.e subject and body', async () => {
    cfg = { ...base, mail_on_sysop_comment: true };
    await load().mailOnSysopComment('Ann', 'Hi', 'text');
    expect(sendMail).toHaveBeenCalledTimes(1);
    const m = sendMail.mock.calls[0][0];
    expect(m.to).toBe('op@x');
    expect(m.subject).toBe('Uptown: Ami-Express sysop message notification');
    expect(m.text).toBe('This is a notification that Ann has sent you a message.\n\nSubject: Hi\n\ntext');
  });

  it('sends nothing without the flag or without a sysop address', async () => {
    cfg = { ...base };
    await load().mailOnSysopComment('Ann', 'Hi');
    cfg = { ...base, mail_on_sysop_comment: true, sysop_email: '' };
    await load().mailOnSysopComment('Ann', 'Hi');
    expect(sendMail).not.toHaveBeenCalled();
  });
});
