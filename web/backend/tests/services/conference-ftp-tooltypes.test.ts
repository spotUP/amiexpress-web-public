import {
  applyConferenceFields,
  readConferenceFields,
} from '../../src/services/config-services/conference-info-file.service';

/**
 * The three FTP settings a sysop could not reach.
 *
 * `FTPDIRNAME` (express.e:28948), `FTP_DIR_DAYS` (ftpd.e:1160) and
 * `NO_FTP_UPLOADS` (express.e:28955) all live on the conference's own icon and
 * all three change what the FTP server does. Nothing in the admin could write
 * them: a sysop had to edit Conf<N>.info by hand.
 *
 * NO_FTP_UPLOADS is the awkward one - its PRESENCE blocks uploads and its
 * VALUE is the sentence the caller reads, empty falling back to a default - so
 * it is two admin fields writing one tooltype, and the pairing is what breaks
 * if someone later files it under the plain flag map.
 */
function toolTypes(entries: Record<string, string> = {}): Map<string, string> {
  return new Map(Object.entries(entries));
}

describe('the conference FTP tooltypes', () => {
  it('round-trips FTPDIRNAME and FTP_DIR_DAYS', () => {
    const map = toolTypes();
    applyConferenceFields(map, { ftpdirname: 'Uploads', ftp_dir_days: 30 });

    expect(map.get('FTPDIRNAME')).toBe('Uploads');
    expect(map.get('FTP_DIR_DAYS')).toBe('30');
    const read = readConferenceFields(map);
    expect(read.ftpdirname).toBe('Uploads');
    expect(read.ftp_dir_days).toBe(30);
  });

  it('reads ten days when FTP_DIR_DAYS is absent, and keeps a stored 0', () => {
    // ftpd.e:1160 - ten is express's default, and 0 is the sysop asking for no
    // bound at all, so 0 must not fall back to ten.
    expect(readConferenceFields(toolTypes()).ftp_dir_days).toBe(10);
    expect(readConferenceFields(toolTypes({ FTP_DIR_DAYS: '0' })).ftp_dir_days).toBe(0);
  });

  it('clears FTPDIRNAME when the sysop empties the field', () => {
    const map = toolTypes({ FTPDIRNAME: 'Uploads' });
    applyConferenceFields(map, { ftpdirname: '' });

    expect(map.has('FTPDIRNAME')).toBe(false);
    expect(readConferenceFields(map).ftpdirname).toBe('');
  });

  it('writes NO_FTP_UPLOADS with the sysop\'s refusal message', () => {
    const map = toolTypes();
    applyConferenceFields(map, { no_ftp_uploads: true, no_ftp_uploads_text: 'Ask first' });

    expect(map.get('NO_FTP_UPLOADS')).toBe('Ask first');
    const read = readConferenceFields(map);
    expect(read.no_ftp_uploads).toBe(true);
    expect(read.no_ftp_uploads_text).toBe('Ask first');
  });

  it('blocks uploads with a bare NO_FTP_UPLOADS when no message is given', () => {
    // The commonest shape on a real board, and the one a presence test must
    // catch: the key exists, holds nothing, and still blocks.
    const map = toolTypes();
    applyConferenceFields(map, { no_ftp_uploads: true, no_ftp_uploads_text: '' });

    expect(map.has('NO_FTP_UPLOADS')).toBe(true);
    expect(map.get('NO_FTP_UPLOADS')).toBe('');
    expect(readConferenceFields(map).no_ftp_uploads).toBe(true);
  });

  it('removes NO_FTP_UPLOADS when the sysop allows uploads again', () => {
    const map = toolTypes({ NO_FTP_UPLOADS: 'Ask first' });
    applyConferenceFields(map, { no_ftp_uploads: false });

    expect(map.has('NO_FTP_UPLOADS')).toBe(false);
    expect(readConferenceFields(map).no_ftp_uploads).toBe(false);
  });

  it('does not create NO_FTP_UPLOADS from the message alone', () => {
    // A form that always sends both fields must not turn a conference that
    // accepts uploads into one that refuses them because the message box has
    // leftover text in it.
    const map = toolTypes();
    applyConferenceFields(map, { no_ftp_uploads_text: 'Ask first' });

    expect(map.has('NO_FTP_UPLOADS')).toBe(false);
  });

  it('leaves every FTP tooltype alone when the edit does not mention them', () => {
    const map = toolTypes({ FTPDIRNAME: 'Uploads', FTP_DIR_DAYS: '30', NO_FTP_UPLOADS: 'Ask first' });
    applyConferenceFields(map, { ndirs: 4 });

    expect(map.get('FTPDIRNAME')).toBe('Uploads');
    expect(map.get('FTP_DIR_DAYS')).toBe('30');
    expect(map.get('NO_FTP_UPLOADS')).toBe('Ask first');
  });
});
