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

import { getMailOptions, clearMailCache } from '../../src/services/mail-notification.service';
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
