/**
 * The download/upload path rows in the conference form.
 *
 * A conference can declare sixteen directories; the form offered one, blank,
 * so fifteen were unreachable from the admin and the sixteenth had to be typed
 * from memory. These rows derive from the conference's own location, follow it,
 * and step aside the moment the sysop types something of their own.
 */

import { describe, expect, test } from 'vitest';
import { pathRows, applyPathEdit, resetPathToDerived, rowsToFormFields } from '../pages/conference-path-rows';

const conference = {
  location: 'BBS:Conf2/',
  ndirs: 2,
  dlpath_1: 'BBS:Conf2/Files',
  ulpath_1: 'BBS:Conf2/Upload',
  dlpath_2: 'BBS:Archive/Best',
  ulpath_2: '',
};

describe('the rows the form shows', () => {
  test('one row per directory the conference declares', () => {
    expect(pathRows(conference).map(r => r.dir)).toEqual([1, 2]);
  });

  test('a path equal to the default is marked as following', () => {
    const [first] = pathRows(conference);

    expect(first.download.following).toBe(true);
    expect(first.download.value).toBe('BBS:Conf2/Files');
  });

  test('a path of the sysop\'s own is marked custom and shown as typed', () => {
    const [, second] = pathRows(conference);

    expect(second.download.following).toBe(false);
    expect(second.download.value).toBe('BBS:Archive/Best');
  });

  test('an empty path follows, and shows the default rather than a blank box', () => {
    const [, second] = pathRows(conference);

    expect(second.upload.following).toBe(true);
    expect(second.upload.value).toBe('BBS:Conf2/Upload');
  });

  test('raising NDIRS adds rows that already follow', () => {
    const rows = pathRows({ ...conference, ndirs: 4 });

    expect(rows).toHaveLength(4);
    expect(rows[3].download).toEqual({ value: 'BBS:Conf2/Files', following: true });
  });

  test('lowering NDIRS hides rows without touching what is stored', () => {
    const rows = pathRows({ ...conference, ndirs: 1 });

    expect(rows).toHaveLength(1);
    // dlpath_2 is still in the conference object; the form simply stops showing it.
    expect(conference.dlpath_2).toBe('BBS:Archive/Best');
  });
});

describe('editing a path', () => {
  test('typing something else makes that row custom', () => {
    const edited = applyPathEdit(conference, 1, 'download', 'BBS:Elsewhere/Files');

    expect(edited.dlpath_1).toBe('BBS:Elsewhere/Files');
    expect(pathRows(edited)[0].download.following).toBe(false);
  });

  test('typing the default back makes it follow again, with no flag to clear', () => {
    const edited = applyPathEdit(conference, 2, 'download', 'BBS:Conf2/Files');

    expect(pathRows(edited)[1].download.following).toBe(true);
  });

  test('reset puts the default back', () => {
    const reset = resetPathToDerived(conference, 2, 'download');

    expect(reset.dlpath_2).toBe('BBS:Conf2/Files');
    expect(pathRows(reset)[1].download.following).toBe(true);
  });

  test('a following row is SENT as its derived value, so the icon carries it', () => {
    const fields = rowsToFormFields({ ...conference, ulpath_2: '' });

    expect(fields.ulpath_2).toBe('BBS:Conf2/Upload');
    expect(fields.dlpath_2).toBe('BBS:Archive/Best');
  });

  test('paths beyond NDIRS are left exactly as they are', () => {
    const fields = rowsToFormFields({ ...conference, ndirs: 1, dlpath_2: 'BBS:Archive/Best' });

    expect(fields.dlpath_2).toBe('BBS:Archive/Best');
  });
});
