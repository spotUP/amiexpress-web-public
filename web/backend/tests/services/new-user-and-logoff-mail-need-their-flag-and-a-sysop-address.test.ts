/**
 * express.e:6723-6734 doNewUserNotify and 6735-6745 doLogoffNotify: mail only
 * when MAIL_ON_NEW_USER / MAIL_ON_LOGOFF is set and a sysop address exists;
 * subject/body text as in 6729-6730 and 6741-6742. (runExecuteOn half is
 * called beside each in new-user.handler / socket-handlers.)
 */
const sendMail = jest.fn().mockResolvedValue({});
jest.mock('nodemailer', () => ({ __esModule: true, default: { createTransport: () => ({ sendMail }) } }));
let cfg: Record<string, unknown> = {};
jest.mock('../../src/services/bbs-config-file.service', () => ({ loadBBSConfig: () => cfg }));
jest.mock('../../src/database', () => ({ db: { getConfigRepository: () => ({ getSystemConfig: () => ({}) }) } }));
jest.mock('../../src/config', () => ({ config: { get: () => '/nonexistent' } }));

describe('mailOnNewUser / mailOnLogoff', () => {
  const load = () => {
    jest.resetModules();
    sendMail.mockClear();
    return require('../../src/services/mail-notification.service') as typeof import('../../src/services/mail-notification.service');
  };
  const base = { smtp_server: 'smtp.x', sysop_email: 'op@x', bbs_name: 'Uptown' };

  it('new user mail carries the express.e subject and body', async () => {
    cfg = { ...base, mail_on_new_user: true };
    await load().mailOnNewUser('Ann', 'Oslo');
    const m = sendMail.mock.calls[0][0];
    expect(m.to).toBe('op@x');
    expect(m.subject).toBe('Uptown: Ami-Express new user notification');
    expect(m.text).toBe('This is a notification that a new user called Ann from Oslo has registered.');
  });

  it('logoff mail carries the express.e subject and body', async () => {
    cfg = { ...base, mail_on_logoff: true };
    await load().mailOnLogoff('Ann', 'Oslo');
    const m = sendMail.mock.calls[0][0];
    expect(m.subject).toBe('Uptown: Ami-Express logoff notification');
    expect(m.text).toBe('This is a notification that Ann from Oslo has logged off\n\n');
  });

  it('send nothing without their own flag or without a sysop address', async () => {
    cfg = { ...base, mail_on_logoff: true };
    await load().mailOnNewUser('Ann', 'Oslo');
    cfg = { ...base, mail_on_new_user: true };
    await load().mailOnLogoff('Ann', 'Oslo');
    cfg = { ...base, mail_on_new_user: true, mail_on_logoff: true, sysop_email: '' };
    const svc = load();
    await svc.mailOnNewUser('Ann', 'Oslo');
    await svc.mailOnLogoff('Ann', 'Oslo');
    expect(sendMail).not.toHaveBeenCalled();
  });
});

export {};
