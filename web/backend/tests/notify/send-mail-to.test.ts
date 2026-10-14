/**
 * sendMailTo: the board's SMTP for any recipient, with headers, plain text, latin1-safe.
 */
const sendMail = jest.fn().mockResolvedValue({});
jest.mock('nodemailer', () => ({ __esModule: true, default: { createTransport: jest.fn(() => ({ sendMail })) } }));
jest.mock('../../src/services/bbs-config-file.service', () => ({
  loadBBSConfig: () => ({ smtp_server: 'smtp.test', smtp_port: 587, bbs_email: 'bbs@test', bbs_name: 'Test BBS' }),
}));

import { sendMailTo } from '../../src/services/mail-notification.service';

beforeEach(() => sendMail.mockClear());

test('passes headers through and sends plain text from the board address', async () => {
  const r = await sendMailTo('a@b.c', 'Hi', 'body', { 'List-Unsubscribe': '<https://x>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });
  expect(r).toEqual({ ok: true });
  expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
    from: 'bbs@test', to: 'a@b.c', subject: 'Hi', text: 'body',
    headers: { 'List-Unsubscribe': '<https://x>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  }));
  expect(sendMail.mock.calls[0][0]).not.toHaveProperty('html');
});

test('text and subject hold only Latin-1: smart quotes become ASCII, the rest become ?', async () => {
  await sendMailTo('a@b.c', 'It’s ☃ news\r\nBcc: evil@x', 'café “quoted” 中');
  const m = sendMail.mock.calls[0][0];
  expect(m.subject).toBe("It's ? news Bcc: evil@x");
  expect(m.text).toBe('café "quoted" ?');
});

test('reports the transport failure instead of swallowing it', async () => {
  sendMail.mockRejectedValueOnce(new Error('451 try later'));
  expect(await sendMailTo('a@b.c', 's', 't')).toEqual({ ok: false, error: '451 try later' });
});
