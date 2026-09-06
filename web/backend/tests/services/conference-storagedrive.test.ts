/**
 * STORAGEDRIVE.n is what puts a conference's directory on a bucket, and the
 * admin could not set it: a sysop configured a drive in Drive Setup and then
 * had to hand-write STORAGEDRIVE.1=3 into Conf<N>.info for anything to use it.
 *
 * 0 is a real answer, not an empty one - "put this directory back on local
 * disk" - and it must REMOVE the tooltype rather than write a zero, because
 * usableAreasFor drops an area whose STORAGEDRIVE names a drive that is not
 * in Drives.info, and DRIVE.0 never is.
 */
import { readConferenceFields, applyConferenceFields } from '../../src/services/config-services/conference-info-file.service';

/** The ToolTypes shape the service reads and writes. */
function toolTypes(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    get: (k: string) => map.get(k),
    set: (k: string, v: string) => map.set(k, v),
    delete: (k: string) => map.delete(k),
    has: (k: string) => map.has(k),
    entries: () => map.entries(),
    raw: map,
  } as never as ReturnType<typeof toolTypes>;
}

describe('a conference directory can name the drive it lives on', () => {
  it('reads STORAGEDRIVE.n, and 0 when there is none', () => {
    const tools = toolTypes({ 'STORAGEDRIVE.2': '3' });
    const fields = readConferenceFields(tools);

    expect(fields.storagedrives[2]).toBe(3);
    expect(fields.storagedrives[1]).toBe(0);
  });

  it('falls back to a conference-wide STORAGEDRIVE for directories without one', () => {
    const tools = toolTypes({ STORAGEDRIVE: '2', 'STORAGEDRIVE.4': '3' });
    const fields = readConferenceFields(tools);

    expect(fields.storagedrives[1]).toBe(2);
    expect(fields.storagedrives[4]).toBe(3);
  });

  it('writes the drive a directory was moved to', () => {
    const tools = toolTypes();
    applyConferenceFields(tools, { storagedrives: { 1: 3 } } as never);

    expect((tools as never as { raw: Map<string, string> }).raw.get('STORAGEDRIVE.1')).toBe('3');
  });

  it('REMOVES the tooltype when a directory goes back to local disk', () => {
    const tools = toolTypes({ 'STORAGEDRIVE.1': '3' });
    applyConferenceFields(tools, { storagedrives: { 1: 0 } } as never);

    // Not "STORAGEDRIVE.1=0" - that names DRIVE.0, which cannot exist, and
    // usableAreasFor would drop the area rather than serve it locally.
    expect((tools as never as { raw: Map<string, string> }).raw.has('STORAGEDRIVE.1')).toBe(false);
  });
});

/**
 * The value has to survive every hop, and it did not.
 *
 * Reported 2026-09-07: picking a drive in the conference form appeared to do
 * nothing. It was saved by the page, validated by the schema, mapped by the
 * conference service - and then dropped, because
 * `updateConferenceInfoFile` hands `applyConferenceFields` an object with its
 * fields listed ONE BY ONE, and `storagedrives` was not among them. Every
 * unit on the path was correct and the chain still lost the value.
 *
 * So this test drives the real writer against a real Conf<N>.info.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyTooltypes, readTooltypeMap } from '../../src/utils/info-file.util';
import { ConferenceSetupService } from '../../src/services/conference-setup.service';

describe('picking a drive reaches Conf<N>.info', () => {
  it('writes STORAGEDRIVE.n through the service the admin actually calls', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-storagedrive-'));
    applyTooltypes(path.join(root, 'Conf1.info'), [
      ['NDIRS', '1'],
      ['DLPATH.1', 'BBS:Conf1/Files/'],
    ]);

    const service = new ConferenceSetupService(root);
    await service.updateConferenceInfoFile(1, { storagedrives: { 1: 3 } });

    const tools = readTooltypeMap(path.join(root, 'Conf1.info'));
    expect(tools.get('STORAGEDRIVE.1')).toBe('3');
    // The paths beside it are untouched.
    expect(tools.get('DLPATH.1')).toBe('BBS:Conf1/Files/');

    // And back to local disk removes it rather than writing a zero.
    await service.updateConferenceInfoFile(1, { storagedrives: { 1: 0 } });
    expect(readTooltypeMap(path.join(root, 'Conf1.info')).has('STORAGEDRIVE.1')).toBe(false);

    fs.rmSync(root, { recursive: true, force: true });
  });
});
