/**
 * SMTP authenticates with a username, and the username must reach it.
 *
 * `smtp_username` is in SENSITIVE_FIELDS, so a save encrypts it into the
 * database and strips SMTP_USERNAME from bbsConfig.info. readConfig() merged
 * only `smtp_password` back out, so getMailOptions() read the DISK value -
 * which is always empty - and SMTP authenticated with no username at all.
 *
 * One field short of the fix made in 32f329389.
 */

process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const secretRow: Record<string, unknown> = {};

jest.mock('../../src/database', () => ({
  db: {
    getConfigRepository: () => ({
      getSystemConfig: () => secretRow,
    }),
  },
}));

import {
  getMailOptions,
  clearMailCache,
  usesImplicitTls,
  buildTransportConfig,
  testSmtpConnection,
  mailOnUpload,
  type MailOptions,
} from '../../src/services/mail-notification.service';
import { saveBBSConfig } from '../../src/services/bbs-config-file.service';
import { config as appConfig } from '../../src/config';

describe('the SMTP credentials the mailer is handed', () => {
  let root: string;
  let previousDataDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'smtp-'));
    previousDataDir = appConfig.get('dataDir');
    appConfig.set('dataDir', root);
    clearMailCache();
    for (const key of Object.keys(secretRow)) delete secretRow[key];
  });

  afterEach(() => {
    appConfig.set('dataDir', previousDataDir);
    clearMailCache();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('takes the username from the encrypted store, where the save put it', async () => {
    // The disk half: the host and port are not secret and live in the icon.
    saveBBSConfig(root, { smtp_server: 'smtp.gmail.com', smtp_port: 587 });
    // The encrypted half: both credentials, because both are SENSITIVE_FIELDS.
    secretRow.smtp_username = 'bbs@uprough.net';
    secretRow.smtp_password = 'hunter2';

    const options = await getMailOptions();

    expect(options).not.toBeNull();
    expect(options!.smtpHost).toBe('smtp.gmail.com');
    expect(options!.username).toBe('bbs@uprough.net');
    expect(options!.password).toBe('hunter2');
  });

  it('still reads a username that only exists on disk', async () => {
    // A board that has never saved through the admin has SMTP_USERNAME in its
    // icon and no database row. That has to keep working.
    saveBBSConfig(root, {
      smtp_server: 'mail.example.org',
      smtp_username: 'olduser',
    });

    const options = await getMailOptions();

    expect(options!.username).toBe('olduser');
  });
});

function mailOptions(overrides: Partial<MailOptions> = {}): MailOptions {
  return {
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    username: 'bbs@uprough.net',
    password: 'hunter2',
    ssl: true,
    sysopEmail: 'sysop@uprough.net',
    bbsEmail: 'bbs@uprough.net',
    ...overrides,
  };
}

/**
 * A board on a temp root with mail set up, and nodemailer's createTransport
 * replaced by a recorder: every transport the service builds is captured,
 * and none of them opens a socket.
 */
function mailBoard(disk: Record<string, unknown>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smtp-transport-'));
  const previousDataDir = appConfig.get('dataDir');
  appConfig.set('dataDir', root);
  clearMailCache();
  for (const key of Object.keys(secretRow)) delete secretRow[key];
  saveBBSConfig(root, disk as never);
  const built: Array<Record<string, unknown>> = [];
  const nodemailer = require('nodemailer');
  const spies = [
    jest.spyOn(nodemailer, 'createTransport').mockImplementation(((cfg: Record<string, unknown>) => {
      built.push(cfg);
      return { verify: async () => true, sendMail: async () => ({ messageId: 'x' }) };
    }) as never),
    jest.spyOn(console, 'log').mockImplementation(() => {}),
    jest.spyOn(console, 'error').mockImplementation(() => {}),
  ];
  return {
    built,
    done: () => {
      for (const spy of spies) spy.mockRestore();
      appConfig.set('dataDir', previousDataDir);
      clearMailCache();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

describe('the connection the SMTP test opens', () => {
  // "The SMTP test just spins" - gmail on port 465 with the SSL box unticked.
  // 465 is SMTPS: the server expects TLS from the first byte and never sends
  // a plaintext greeting, so connecting without `secure` does not fail, it
  // WAITS. nodemailer's default greeting timeout is 30s and its socket
  // timeout 10 minutes, and the spinner has nothing to say in the meantime.
  it('is implicit TLS on 465 whatever the SSL flag says', () => {
    expect(usesImplicitTls(465, false)).toBe(true);
    expect(usesImplicitTls(465, true)).toBe(true);
  });

  // The mirror of the 465 rule, and the live board's actual state: uptown
  // had SMTP_PORT=587 with SMTP_SSL ticked, so every transport was built
  // `secure: true` against a port that speaks plaintext until STARTTLS.
  // Measured against the real relay from the board's own host:
  //   openssl s_client -connect smtp.gmail.com:587
  //     -> ssl3_get_record:wrong version number
  //   openssl s_client -connect smtp.gmail.com:587 -starttls smtp
  //     -> Verification: OK, 250 SMTPUTF8
  // 587 is the submission port (RFC 6409); implicit TLS is not a thing it can
  // do, so the flag cannot be honoured there any more than it can on 465.
  it('is STARTTLS on 587 even when the sysop ticked SSL', () => {
    expect(usesImplicitTls(587, true)).toBe(false);
    expect(usesImplicitTls(587, false)).toBe(false);
  });

  it('honours the SSL flag on a port that has no protocol of its own', () => {
    // express.e:31814 reads SMTP_SSL as a flag; on a non-standard port it
    // stays the sysop's choice, because nothing else can decide it.
    expect(usesImplicitTls(25, false)).toBe(false);
    expect(usesImplicitTls(2525, true)).toBe(true);
  });

  // The 587-plus-SSL combination used to be refused with an instruction to
  // untick the box. That message was a workaround for a value the code can
  // derive, and it refused a configuration that now works.
  // DRIVEN: the admin's test runs against a board on 587 with SSL ticked, and
  // it must build a STARTTLS transport and succeed rather than answer first.
  it('does not refuse 587 with SSL ticked before it tries', async () => {
    const board = mailBoard({ smtp_server: 'smtp.gmail.com', smtp_port: 587, smtp_ssl: true, sysop_email: 'sysop@uprough.net' });
    try {
      const result = await testSmtpConnection();
      expect(result).toEqual({ success: true });
      expect(board.built).toHaveLength(1);
      expect(board.built[0]).toEqual(expect.objectContaining({ port: 587, secure: false, requireTLS: true }));
    } finally { board.done(); }
  });

  it('carries timeouts, so a wrong port answers instead of hanging', () => {
    const built = buildTransportConfig(mailOptions({ smtpPort: 587 })) as Record<string, unknown>;

    expect(built.connectionTimeout).toBe(10_000);
    expect(built.greetingTimeout).toBe(10_000);
    expect(built.socketTimeout).toBe(20_000);
  });

  // The timeouts were added to one transport and then to the other. Both
  // transports - the one that sends mail and the one the admin's test opens -
  // now come from this one builder, so a setting cannot reach only one of
  // them.
  //
  // DRIVEN: both callers run - a mail event (the sender) and the admin's test
  // - and each transport they hand nodemailer must be exactly what the one
  // builder makes for the same options, timeouts included.
  it('is built in one place for both callers', async () => {
    const board = mailBoard({
      smtp_server: 'smtp.gmail.com', smtp_port: 587, smtp_ssl: true,
      smtp_username: 'bbs@uprough.net', sysop_email: 'sysop@uprough.net', mail_on_upload: true,
    });
    try {
      await mailOnUpload('caller', 'somewhere');
      await testSmtpConnection();
      const expected = buildTransportConfig((await getMailOptions())!) as Record<string, unknown>;
      expect(board.built).toHaveLength(2);
      expect(board.built[0]).toEqual(expected);
      expect(board.built[1]).toEqual(expected);
      expect(expected.greetingTimeout).toBe(10_000);
    } finally { board.done(); }
  });

  // With implicit TLS off, nodemailer will settle for a plaintext session if
  // the server does not offer STARTTLS, and AUTH would carry the sysop's
  // credentials in the clear. On the submission port the upgrade is required.
  it('requires the STARTTLS upgrade on 587 rather than sending AUTH in clear', () => {
    const built = buildTransportConfig(mailOptions({ smtpPort: 587 })) as Record<string, unknown>;

    expect(built.secure).toBe(false);
    expect(built.requireTLS).toBe(true);
  });

  it('leaves 465 and 25 as they were', () => {
    const implicit = buildTransportConfig(mailOptions({ smtpPort: 465 })) as Record<string, unknown>;
    const plain = buildTransportConfig(
      mailOptions({ smtpPort: 25, ssl: false })
    ) as Record<string, unknown>;
    const flagged = buildTransportConfig(
      mailOptions({ smtpPort: 25, ssl: true })
    ) as Record<string, unknown>;

    expect(implicit.secure).toBe(true);
    // 465 is encrypted from the first byte; there is no upgrade to require.
    expect(implicit.requireTLS).toBe(false);
    // A relay on 25 may have no TLS at all, and demanding it would take a
    // working board off mail. The flag is still the only thing that decides.
    expect(plain.secure).toBe(false);
    expect(plain.requireTLS).toBe(false);
    expect(flagged.secure).toBe(true);
  });

  it('hands the credentials to the transport, and omits auth without a username', () => {
    const withUser = buildTransportConfig(
      mailOptions({ username: 'bbs@uprough.net', password: 'hunter2' })
    ) as Record<string, unknown>;
    const withoutUser = buildTransportConfig(mailOptions({ username: '' })) as Record<string, unknown>;

    expect(withUser.auth).toEqual({ user: 'bbs@uprough.net', pass: 'hunter2' });
    expect(withoutUser.auth).toBeUndefined();
  });
});
