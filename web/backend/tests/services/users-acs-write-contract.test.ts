/**
 * The two admin domains the schema sweep cannot reach.
 *
 * config-round-trip-contract.test.ts hands each served record to the schema
 * its writer validates with. Users and Access Levels have no schema: the user
 * route maps field by field, and an access level is a set of tooltypes. So
 * the same question - can the admin save back what it just served? - has to
 * be asked differently for each.
 *
 * Users: the failure mode is not rejection but SILENCE. The route maps eight
 * fields explicitly, and anything else in the request body is ignored without
 * complaint. A form that offers a ninth would save it, report success, and
 * change nothing.
 *
 * Access Levels: a level is 87 ACS.* tooltypes, read into booleans and
 * written back out. A flag that does not survive that round trip is a
 * permission a sysop can tick and not grant.
 */

import * as fs from 'fs';
import * as path from 'path';
import { tooltypesToFlags, flagsToTooltypes } from '../../src/services/config-services/acs-level-file.service';
import { ACS_PERMISSION_NAMES } from '../../src/constants/acs-permissions';

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const USERS_PAGE = path.join(REPO_ROOT, 'web', 'config-app', 'src', 'pages', 'UsersPage.tsx');
const CONFIG_ROUTES = path.join(__dirname, '..', '..', 'src', 'api', 'config-routes.ts');

/**
 * Fields the users form holds that the route is not expected to write.
 *
 * Each is deliberate, and each has to stay deliberate - which is what this
 * list is for.
 */
const NOT_SAVED_BY_THE_ROUTE: Record<string, string> = {
  // Handled on its own, hashed rather than assigned.
  password: 'hashed separately, never assigned straight through',
  confirmPassword: 'never leaves the browser',
  // The form disables this while editing and says "Username cannot be
  // changed"; a rename is not a field edit on a board where the username is
  // the identity in user.data.
  username: 'disabled while editing, and the form says so',
};

describe('Users: what the form can send, the route must write', () => {
  it('handles every field the form offers', () => {
    const page = fs.readFileSync(USERS_PAGE, 'utf8');
    const routes = fs.readFileSync(CONFIG_ROUTES, 'utf8');

    // What the form actually holds and can submit.
    const offered = new Set(
      [...page.matchAll(/formData\.([a-zA-Z_]+)/g)].map((m) => m[1])
    );
    // What the route copies onto the user before writing it back.
    const written = new Set(
      [...routes.matchAll(/updates\.([a-zA-Z_]+) !== undefined/g)].map((m) => m[1])
    );

    const ignored = [...offered].filter(
      (field) => !written.has(field) && !(field in NOT_SAVED_BY_THE_ROUTE)
    );

    // Jest's expect takes no message, so the report goes in the value.
    expect(ignored.join(', ')).toBe('');
  });

  it('still writes the fields it is meant to', () => {
    const routes = fs.readFileSync(CONFIG_ROUTES, 'utf8');
    const written = [...routes.matchAll(/updates\.([a-zA-Z_]+) !== undefined/g)].map((m) => m[1]);

    for (const field of ['realname', 'location', 'email', 'secLevel', 'timeLimit']) {
      expect(written).toContain(field);
    }
  });
});

describe('Access Levels: every flag survives being written and read back', () => {
  /** A level file as parsed: one tooltype per ACS permission. */
  function levelTooltypes(granted: (name: string) => boolean) {
    return ACS_PERMISSION_NAMES.map((key) => ({
      key,
      value: '',
      commented: !granted(key),
      originalLine: key,
    }));
  }

  it('reads a granted flag as granted and a commented one as withheld', () => {
    const flags = tooltypesToFlags(levelTooltypes((name) => name.endsWith('_MESSAGE')));

    expect(flags['ACS.READ_MESSAGE']).toBe(true);
    expect(flags['ACS.ENTER_MESSAGE']).toBe(true);
    expect(flags['ACS.DOWNLOAD']).toBe(false);
  });

  it('round-trips all 87 in both states', () => {
    // Every permission on, written out, read back.
    const allOn: Record<string, boolean> = {};
    for (const name of ACS_PERMISSION_NAMES) allOn[name] = true;

    const writtenOn = flagsToTooltypes(levelTooltypes(() => false), allOn);
    const readOn = tooltypesToFlags(writtenOn);

    const lostOn = ACS_PERMISSION_NAMES.filter((name) => readOn[name] !== true);
    expect(lostOn.join('\n')).toBe('');

    // And every permission off again.
    const allOff: Record<string, boolean> = {};
    for (const name of ACS_PERMISSION_NAMES) allOff[name] = false;

    const writtenOff = flagsToTooltypes(writtenOn, allOff);
    const readOff = tooltypesToFlags(writtenOff);

    const stuckOn = ACS_PERMISSION_NAMES.filter((name) => readOff[name] !== false);
    expect(stuckOn.join('\n')).toBe('');
  });

  it('leaves tooltypes that are not permissions alone', () => {
    // A level file may carry more than ACS flags, and an edit to a permission
    // has no business rewriting the rest.
    const withExtra = [
      { key: 'NAME', value: 'Level 20', commented: false, originalLine: 'NAME=Level 20' },
      ...levelTooltypes(() => false),
    ];

    const written = flagsToTooltypes(withExtra, { 'ACS.DOWNLOAD': true });
    const name = written.find((t) => t.key === 'NAME');

    expect(name?.value).toBe('Level 20');
    expect(tooltypesToFlags(written)['NAME']).toBeUndefined();
  });

  it('grants nothing it was not asked to grant', () => {
    const written = flagsToTooltypes(levelTooltypes(() => false), { 'ACS.DOWNLOAD': true });
    const flags = tooltypesToFlags(written);

    const unexpectedlyGranted = Object.entries(flags)
      .filter(([, granted]) => granted)
      .map(([name]) => name);

    expect(unexpectedlyGranted).toEqual(['ACS.DOWNLOAD']);
  });
});
