/**
 * Conference access, editable without opening a binary icon by hand.
 *
 * `checkConfAccess` (express.e:8499-8512) reads a user's access field either
 * as `X`/`_` flags or as the NAME of an area, whose icon carries a `Conf.<n>`
 * tooltype per conference it grants. Neither could be edited from the admin:
 * the user form has no conference field at all, and nothing anywhere wrote
 * `Access/AREA.*.info`.
 *
 * So deciding who may read a private conference meant editing Amiga icons on
 * the live volume with a script. That is exactly how this board's fifteen
 * internal members were set on 2026-09-14, and the sysop's answer to "can both
 * be edited from the admin ui?" being "no" is what this closes.
 *
 * The rules that carry risk, and are therefore what this file pins:
 *
 *   - un-ticking a conference must DELETE its tooltype. A grant is
 *     presence-only; there is no way to write "not granted", so an editor that
 *     only adds can never take access away.
 *   - everything else in the icon survives. A sysop's own tooltypes are not
 *     this editor's to discard.
 *   - a name of only `X` and `_` is refused. It would be read back as a flag
 *     string by express.e:458-465, so the area could be created and never
 *     pointed at.
 *   - an area in use cannot be deleted. A user whose area is missing gets
 *     `checkToolTypeExists` on a file that is not there - false for every
 *     conference - so they would lose the whole board, silently.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  listAccessAreas,
  readAccessArea,
  writeAccessArea,
  deleteAccessArea,
  assertUsableAreaName,
} from '../../src/conferences/access-areas';
import { applyTooltypes, parseInfoFile } from '../../src/utils/info-file.util';

function aBoard(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'access-area-'));
  fs.mkdirSync(path.join(root, 'Access'), { recursive: true });
  return root;
}

const areaFile = (root: string, name: string) =>
  path.join(root, 'Access', `AREA.${name}.info`);

describe('a conference access area', () => {
  it('is created with the conferences it grants', () => {
    const root = aBoard();

    writeAccessArea(root, 'Internal', [1, 2, 3, 4, 5]);

    expect(readAccessArea(root, 'Internal')?.conferences).toEqual([1, 2, 3, 4, 5]);
  });

  it('loses a conference when it is un-ticked', () => {
    // The case an add-only editor cannot do, and the one that takes access
    // AWAY - which is the direction that matters for a private conference.
    const root = aBoard();
    writeAccessArea(root, 'Member', [1, 2, 3, 4, 5]);

    writeAccessArea(root, 'Member', [1, 2, 3, 4]);

    expect(readAccessArea(root, 'Member')?.conferences).toEqual([1, 2, 3, 4]);
  });

  it('keeps tooltypes that are none of its business', () => {
    // A sysop's own entries in the icon are not the editor's to discard.
    const root = aBoard();
    applyTooltypes(areaFile(root, 'Member'), [['NOTE', 'the ordinary members'], ['Conf.9', '']]);

    writeAccessArea(root, 'Member', [1, 2]);

    const keys = parseInfoFile(areaFile(root, 'Member')).tooltypes.map(t => t.key.toUpperCase());
    expect(keys).toContain('NOTE');
    expect(readAccessArea(root, 'Member')?.conferences).toEqual([1, 2]);
  });

  it('does not count a commented grant', () => {
    // express.e's checkToolTypeExists skips a parenthesised tooltype, so the
    // admin must not report it as access the caller has.
    const root = aBoard();
    writeAccessArea(root, 'Member', [1, 2]);
    // Commented through the module's own API, which is what knows how the
    // format carries it - `(CONF.2)` or `!CONF.2` (info-file.util.ts:104-120).
    const { TooltypeEditor } = require('../../src/utils/info-file.util');
    new TooltypeEditor(areaFile(root, 'Member')).set('Conf.2', '', true).save();

    expect(readAccessArea(root, 'Member')?.conferences).toEqual([1]);
  });

  it('refuses a name that would be read back as flags', () => {
    // `XX` on a user is conferences 1 and 2, not an area called XX.
    expect(() => assertUsableAreaName('XX')).toThrow(/flag string/);
    expect(() => assertUsableAreaName('X_X')).toThrow(/flag string/);
  });

  it('refuses a name that could not be a filename', () => {
    expect(() => assertUsableAreaName('../escape')).toThrow();
    expect(() => assertUsableAreaName('has space')).toThrow();
    expect(() => assertUsableAreaName('')).toThrow();
  });

  it('lists every area the board has', () => {
    const root = aBoard();
    writeAccessArea(root, 'Internal', [1, 2, 3, 4, 5]);
    writeAccessArea(root, 'Member', [1, 2, 3, 4]);

    expect(listAccessAreas(root).map(a => a.name)).toEqual(['Internal', 'Member']);
  });

  it('will not be deleted while anyone is in it', () => {
    // Deleting an area in use locks its members out of every conference, and
    // nothing on the board would say why.
    const root = aBoard();
    writeAccessArea(root, 'Internal', [1, 2, 3]);

    expect(() => deleteAccessArea(root, 'Internal', 15)).toThrow(/15 user/);
    expect(fs.existsSync(areaFile(root, 'Internal'))).toBe(true);
  });

  it('is deleted when it is empty', () => {
    const root = aBoard();
    writeAccessArea(root, 'Spare', [1]);

    deleteAccessArea(root, 'Spare', 0);

    expect(fs.existsSync(areaFile(root, 'Spare'))).toBe(false);
    expect(listAccessAreas(root)).toEqual([]);
  });

  it('grants nothing for an area that does not exist', () => {
    // The state a dangling user reference leaves: not an error, but no access.
    expect(readAccessArea(aBoard(), 'Nope')).toBeNull();
  });
});
