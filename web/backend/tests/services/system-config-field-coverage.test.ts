/**
 * A field the System Configuration form offers must reach bbsConfig.info.
 *
 * Fourteen of the form's eighty-one fields could not be set at all. They were
 * absent from SystemConfigSchema, so `SystemConfigSchema.partial().parse()`
 * stripped them before the writer ever saw them, and absent from TOOLTYPE_MAP,
 * so `saveBBSConfig` would have dropped them anyway on its
 * `if (!tooltypeName) continue`. The sysop typed a value, the form reported
 * "System configuration written to bbsConfig.info", and nothing was written.
 *
 * express.e reads every one of the fourteen out of bbsConfig.info:
 *
 *   MAIL_ON_LOGON          express.e:6716    checkToolTypeExists(TOOLTYPE_BBSCONFIG,...)
 *   FILEDIZ_SYSCMD         express.e:19258   readToolType(TOOLTYPE_BBSCONFIG,...)
 *   AUTOVAL_DELAY          express.e:29677
 *   AUTOVAL_PRESET         express.e:29687
 *   AUTOVAL_PASSWORD       express.e:30063
 *
 * The existing round-trip suite walks getConfigTooltypeKeys(), so it can only
 * ever check fields that are already mapped - it cannot see a field missing
 * from the map. That blind spot is what let fourteen through, and the coverage
 * test at the bottom of this file is what closes it.
 *
 * Real files in a temp directory throughout: the whole risk lives in the
 * encoding, and both failures this work exists to fix were the disk
 * disagreeing with the record.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  loadBBSConfig,
  saveBBSConfig,
  getConfigTooltypeKeys,
} from '../../src/services/bbs-config-file.service';
import type { BBSConfigData } from '../../src/services/bbs-config-file.service';
import { SystemConfigSchema } from '../../src/services/config.schemas';
import {
  isSensitiveField,
  isDatabaseOnlyField,
} from '../../src/utils/secrets-encryption.util';

/**
 * An empty BBS root - deliberately with no bbsConfig.info in it.
 *
 * The obvious fixture is the repository's own bbsConfig.info, which is what
 * the round-trip suite beside this one copies. That file is gitignored: it is
 * a real board's configuration, so it exists only on a machine that runs one,
 * and a test that needs it cannot pass in a clean checkout.
 *
 * Nothing here needs the icon. saveBBSConfig writes bbsConfig.info.txt on its
 * own when there is no icon to update, loadBBSConfig applies that file after
 * the icon, and it is the one this BBS actually reads - so the whole round
 * trip these tests are about happens in the text companion either way.
 */
function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bbsconfig-coverage-'));
}

/**
 * Fields the API accepts that deliberately never reach bbsConfig.info, each
 * with the reason it is exempt. Anything not listed here must be persisted -
 * that is what stops the fifteenth field going missing.
 *
 * Being exempt from disk is not permission to go nowhere: the test below
 * requires every entry here to be routed to the database instead.
 */
const NOT_ON_DISK: Record<string, string> = {
  vapid_public_key: 'Web push is a web-BBS extension; express.e has no tooltype for it. Database column.',
  vapid_private_key: 'Web push signing key; encrypted in the database, decrypted on read.',
  vapid_contact_email: 'Web push contact; a database column, not a tooltype.',
};

describe('System Configuration field coverage', () => {
  let root: string;

  beforeEach(() => {
    root = makeRoot();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('the fields the form offered and could not save', () => {
    it('keeps the seven mail notification flags through the API schema', () => {
      // Zod strips unknown keys, so a field missing from the schema is gone
      // before the writer is called - silently, with no validation error.
      const submitted = {
        mail_on_logon: true,
        mail_on_logoff: true,
        mail_on_new_user: true,
        mail_on_upload: true,
        mail_on_sysop_page: true,
        mail_on_sysop_comment: true,
        mail_on_pwd_fail: true,
      };

      const parsed = SystemConfigSchema.partial().parse(submitted);

      expect(Object.keys(parsed).sort()).toEqual(Object.keys(submitted).sort());
    });

    it('keeps the auto-validation and file description fields through the API schema', () => {
      const submitted = {
        autoval_delay: 30,
        autoval_preset: '2',
        autoval_password: 'letmein',
        auto_deactivate_days: 90,
        max_desclines: 10,
        local_upload_path: 'DH1:Uploads/',
        filediz_syscmd: 'C:LhA v %s',
      };

      const parsed = SystemConfigSchema.partial().parse(submitted);

      expect(Object.keys(parsed).sort()).toEqual(Object.keys(submitted).sort());
    });

    it('writes each mail notification flag to bbsConfig.info and reads it back', () => {
      // Presence is true and absence is false, exactly as express.e's
      // checkToolTypeExists reads it, so both directions need covering.
      saveBBSConfig(root, { mail_on_logon: true, mail_on_upload: true });

      let reloaded = loadBBSConfig(root);
      expect(reloaded.mail_on_logon).toBe(true);
      expect(reloaded.mail_on_upload).toBe(true);

      saveBBSConfig(root, { mail_on_logon: false });

      reloaded = loadBBSConfig(root);
      expect(reloaded.mail_on_logon).toBe(false);
      expect(reloaded.mail_on_upload).toBe(true);
    });

    it('writes the auto-validation settings under the names express.e reads', () => {
      saveBBSConfig(root, {
        autoval_delay: 30,
        autoval_preset: '2',
        autoval_password: 'letmein',
      });

      const reloaded = loadBBSConfig(root);
      expect(reloaded.autoval_delay).toBe(30);
      expect(reloaded.autoval_preset).toBe('2');
      expect(reloaded.autoval_password).toBe('letmein');

      // The names are express.e's, not this app's invention.
      const text = fs.readFileSync(path.join(root, 'bbsConfig.info.txt'), 'utf8');
      expect(text).toContain('AUTOVAL_DELAY=30');
      expect(text).toContain('AUTOVAL_PRESET=2');
      expect(text).toContain('AUTOVAL_PASSWORD=letmein');
    });

    it('writes the file description settings and reads them back', () => {
      saveBBSConfig(root, {
        max_desclines: 10,
        local_upload_path: 'DH1:Uploads/',
        filediz_syscmd: 'C:LhA v %s',
        auto_deactivate_days: 90,
      });

      const reloaded = loadBBSConfig(root);
      expect(reloaded.max_desclines).toBe(10);
      expect(reloaded.local_upload_path).toBe('DH1:Uploads/');
      expect(reloaded.filediz_syscmd).toBe('C:LhA v %s');
      expect(reloaded.auto_deactivate_days).toBe(90);
    });

    it('leaves the auto-validation password on disk rather than in the database', () => {
      // isSensitiveField matches on the substring "password", which would
      // route this to the encrypted database - where express.e, reading
      // AUTOVAL_PASSWORD out of bbsConfig.info at express.e:30063, can never
      // see it. A shared board password that the BBS must read is not a
      // secret this app gets to keep to itself.
      expect(isSensitiveField('autoval_password')).toBe(false);
    });
  });

  describe('the contract that stops the fifteenth field', () => {
    it('persists every field the API accepts, or names why it does not', () => {
      // The existing round-trip suite iterates the tooltype map, so it can
      // only see fields already in it. This one starts from what the API
      // accepts, which is what the form can actually submit.
      const accepted = Object.keys(SystemConfigSchema.shape);
      const mapped = new Set(Object.keys(getConfigTooltypeKeys()));

      const unpersisted = accepted.filter(
        (field) =>
          !mapped.has(field) &&
          !isSensitiveField(field) &&
          !(field in NOT_ON_DISK)
      );

      // Jest's expect takes no message, so the report goes in the value.
      expect(unpersisted.join('\n')).toBe('');
    });

    it('sends every field exempt from disk to the database instead', () => {
      // The VAPID push keys had a column each in system_config and were still
      // lost: they are not sensitive by name, so updateSystemConfig put them
      // in the disk bucket, where saveBBSConfig dropped them for having no
      // tooltype. Exempt from disk AND exempt from the database is how a
      // field goes nowhere at all.
      const homeless = Object.keys(NOT_ON_DISK).filter(
        (field) => !isSensitiveField(field) && !isDatabaseOnlyField(field)
      );

      expect(homeless.join('\n')).toBe('');
    });

    it('encrypts the push signing key but not the public key beside it', () => {
      // config-repository.ts:1054 decrypts vapid_private_key on read and
      // returns the other two raw, so encrypting those would hand the caller
      // ciphertext.
      expect(isSensitiveField('vapid_private_key')).toBe(true);
      expect(isSensitiveField('vapid_public_key')).toBe(false);
      expect(isSensitiveField('vapid_contact_email')).toBe(false);
    });

    it('round-trips every newly mapped field one at a time', () => {
      const keys = getConfigTooltypeKeys();
      const added = [
        'mail_on_logon',
        'mail_on_logoff',
        'mail_on_new_user',
        'mail_on_upload',
        'mail_on_sysop_page',
        'mail_on_sysop_comment',
        'mail_on_pwd_fail',
        'autoval_delay',
        'autoval_preset',
        'autoval_password',
        'auto_deactivate_days',
        'max_desclines',
        'local_upload_path',
        'filediz_syscmd',
      ];
      const lost: string[] = [];

      for (const field of added) {
        if (!keys[field]) {
          lost.push(`${field}: no tooltype mapping at all`);
          continue;
        }

        const baseline = loadBBSConfig(root) as Record<string, unknown>;
        const current = baseline[field];
        let written: unknown;
        if (typeof current === 'number') written = 7;
        else if (typeof current === 'boolean') written = !current;
        else written = `rt-${field}`;

        const fresh = makeRoot();
        try {
          saveBBSConfig(fresh, { [field]: written } as Partial<BBSConfigData>);
          const reloaded = loadBBSConfig(fresh) as Record<string, unknown>;
          if (reloaded[field] !== written) {
            lost.push(
              `${field} (${keys[field]}): wrote ${JSON.stringify(written)}, read ${JSON.stringify(reloaded[field])}`
            );
          }
        } finally {
          fs.rmSync(fresh, { recursive: true, force: true });
        }
      }

      expect(lost.join('\n')).toBe('');
    });
  });
});
