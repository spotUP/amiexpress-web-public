import {
  CONFERENCE_FIELD_TOOLTYPES,
  CONFERENCE_FLAG_TOOLTYPES,
  applyConferenceFields,
  readConferenceFields,
} from '../../src/services/config-services/conference-info-file.service';

/**
 * A conference setting must come back the way it went in.
 *
 * It did not. The admin read MINACCESSLEVEL, MAXACCESSLEVEL, FORCENEWSCAN,
 * EXCLUDEFTP, PRIVATECONF and READONLY; the writer wrote MIN_ACCESS,
 * MAX_ACCESS, FORCE_NEWSCAN, EXCLUDE_FTP, PRIVATE and READ_ONLY - the names
 * that are actually on disk, and for two of them the names express.e reads
 * (express.e:576, :28947). Six settings were therefore saved under one key
 * and read back from another, so the form showed the old value however many
 * times a sysop changed it, and a flag already set on disk read as off.
 */

function toolTypes(entries: Record<string, string> = {}): Map<string, string> {
  return new Map(Object.entries(entries));
}

describe('conference tooltypes', () => {
  it('reads back every scalar it writes', () => {
    const map = toolTypes();
    applyConferenceFields(map, {
      ndirs: 4,
      min_access_level: 20,
      max_access_level: 200,
      menu_prompt: 'Pick one',
      confdb_shared: 3,
    });

    const read = readConferenceFields(map);
    expect(read.ndirs).toBe(4);
    expect(read.min_access_level).toBe(20);
    expect(read.max_access_level).toBe(200);
    expect(read.menu_prompt).toBe('Pick one');
    expect(read.confdb_shared).toBe(3);
  });

  it('reads back every flag it writes, in both directions', () => {
    const map = toolTypes();

    applyConferenceFields(map, {
      force_newscan: true,
      exclude_ftp: true,
      private_conf: true,
      read_only: true,
    });
    let read = readConferenceFields(map);
    expect([read.force_newscan, read.exclude_ftp, read.private_conf, read.read_only]).toEqual([
      true,
      true,
      true,
      true,
    ]);

    applyConferenceFields(map, {
      force_newscan: false,
      exclude_ftp: false,
      private_conf: false,
      read_only: false,
    });
    read = readConferenceFields(map);
    expect([read.force_newscan, read.exclude_ftp, read.private_conf, read.read_only]).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it('writes the tooltype names that are on disk and in express.e', () => {
    const map = toolTypes();
    applyConferenceFields(map, { min_access_level: 20, force_newscan: true, exclude_ftp: true });

    expect(map.has('MIN_ACCESS')).toBe(true);
    expect(map.has('FORCE_NEWSCAN')).toBe(true);
    expect(map.has('EXCLUDE_FTP')).toBe(true);
    // The spellings the reader used to look for, which nothing ever wrote.
    expect(map.has('MINACCESSLEVEL')).toBe(false);
    expect(map.has('FORCENEWSCAN')).toBe(false);
    expect(map.has('EXCLUDEFTP')).toBe(false);
  });

  it('honours a flag that is present with no value, as an Amiga icon writes it', () => {
    // express.e asks checkToolTypeExists, so presence alone means on.
    const read = readConferenceFields(toolTypes({ FORCE_NEWSCAN: '', PRIVATE: '1', READ_ONLY: '0' }));

    expect(read.force_newscan).toBe(true);
    expect(read.private_conf).toBe(true);
    expect(read.read_only).toBe(false);
  });

  it('reads the newscan and new-file flags express.e defines', () => {
    const read = readConferenceFields(
      toolTypes({ NO_NEWSCAN: '1', SHOW_NEW_FILES: '1', NO_NEW_FILES: '1' })
    );

    expect(read.no_newscan).toBe(true);
    expect(read.show_new_files).toBe(true);
    expect(read.no_new_files).toBe(true);
  });

  it('round-trips all sixteen download and upload paths', () => {
    const dlpaths: Record<number, string> = {};
    const ulpaths: Record<number, string> = {};
    for (let i = 1; i <= 16; i += 1) {
      dlpaths[i] = `DH1:Files/${i}`;
      ulpaths[i] = `DH1:Upload/${i}`;
    }

    const map = toolTypes();
    applyConferenceFields(map, { dlpaths, ulpaths });
    const read = readConferenceFields(map);

    for (let i = 1; i <= 16; i += 1) {
      expect(read.dlpaths[i]).toBe(`DH1:Files/${i}`);
      expect(read.ulpaths[i]).toBe(`DH1:Upload/${i}`);
    }
  });

  it('clears a file area when the path is emptied', () => {
    // An empty path is a change. The update path used to test the string for
    // truth, so a path could be set and never removed: the sysop cleared the
    // field, the form reported a save, and the path stayed on disk.
    const map = toolTypes({ 'DLPATH.1': 'DH1:Files' });

    applyConferenceFields(map, { dlpaths: { 1: '' } });

    expect(map.has('DLPATH.1')).toBe(false);
    expect(readConferenceFields(map).dlpaths[1]).toBe('');
  });

  it('leaves tooltypes it does not own alone', () => {
    // Conf{N}.info carries keys this form knows nothing about.
    const map = toolTypes({ NAME: 'General', SOMETHING_ELSE: 'keep me' });

    applyConferenceFields(map, { ndirs: 2 });

    expect(map.get('SOMETHING_ELSE')).toBe('keep me');
    expect(map.get('NAME')).toBe('General');
  });

  it('changes nothing for fields the caller did not name', () => {
    const map = toolTypes({ MIN_ACCESS: '10', FORCE_NEWSCAN: '1' });

    applyConferenceFields(map, { ndirs: 2 });

    expect(map.get('MIN_ACCESS')).toBe('10');
    expect(map.get('FORCE_NEWSCAN')).toBe('1');
  });

  it('gives each field exactly one tooltype', () => {
    const all = [...Object.values(CONFERENCE_FIELD_TOOLTYPES), ...Object.values(CONFERENCE_FLAG_TOOLTYPES)];
    expect(new Set(all).size).toBe(all.length);
  });
});
