/**
 * HTTPPORT is exported, and bound by nothing.
 *
 * The field carried three different meanings at once: the SQLite column
 * defaulted to 80, the admin help text said "Default 3001 in this stack", and
 * the tooltype map pointed it at express's HTTPPORT. All three were wrong
 * about express, which reads HTTPPORT as the port of its HTTP TRANSFER
 * protocol - a one-shot server opened for a single download or upload by a
 * caller whose xferProtocol is HTTP (httpd.e:558, express.e:15010, :14992) -
 * and computes 20000+node when the tooltype is empty (express.e:15713).
 *
 * This port does not implement that protocol; it serves files over its own
 * always-on endpoints (handlers/file/file-delivery.ts:194), which is the call
 * the parity plan's scope decision 4 records. So the field round-trips for a
 * board carried back to a real Amiga, and binds nothing here.
 *
 * What each test would have caught: the first two fail on a default of 80,
 * which wrote HTTPPORT=80 into every board's file - a port express would then
 * have used for a protocol the sysop never chose. The last one fails the day
 * somebody wires this field into a listener.
 */

process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  saveBBSConfig,
  loadBBSConfig,
  invalidateBoardConfig,
} from '../../src/services/bbs-config-file.service';
import { config as appConfig } from '../../src/config';

describe('HTTPPORT', () => {
  let root: string;
  let previousDataDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'http-port-'));
    previousDataDir = appConfig.get('dataDir');
    appConfig.set('dataDir', root);
    invalidateBoardConfig();
  });

  afterEach(() => {
    appConfig.set('dataDir', previousDataDir);
    invalidateBoardConfig();
    fs.rmSync(root, { recursive: true, force: true });
  });

  function fileText(): string {
    return fs.readFileSync(path.join(root, 'bbsConfig.info.txt'), 'utf8');
  }

  it('is unset on a board that has never configured it', () => {
    // No file at all: what a fresh install reads.
    expect(loadBBSConfig(root).http_port).toBeUndefined();
  });

  it('writes no HTTPPORT key when the sysop has not set one', () => {
    saveBBSConfig(root, { bbs_name: 'Uptown', sysop_name: 'Spot' });

    expect(fileText()).not.toContain('HTTPPORT');
  });

  it('does not invent one when a loaded configuration is saved back', () => {
    // The admin round trip: read the board, save it again untouched. A default
    // of 80 turned that into a real HTTPPORT=80 key on the sysop's first save.
    saveBBSConfig(root, { bbs_name: 'Uptown' });
    invalidateBoardConfig();

    saveBBSConfig(root, loadBBSConfig(root));

    expect(fileText()).not.toContain('HTTPPORT');
  });

  it('keeps the port a sysop did set, for the Amiga that reads it', () => {
    // 20001 is what express computes for node 1 with no tooltype; a sysop who
    // types it means it.
    saveBBSConfig(root, { http_port: 20001 });
    invalidateBoardConfig();

    expect(fileText()).toContain('HTTPPORT=20001');
    expect(loadBBSConfig(root).http_port).toBe(20001);

    // And it survives a save that is about something else entirely.
    saveBBSConfig(root, { bbs_name: 'Uptown' });
    invalidateBoardConfig();
    expect(loadBBSConfig(root).http_port).toBe(20001);
  });

  it('does not move the web listener', () => {
    // The one property that makes "binds nothing" checkable: index.ts:961 takes
    // the web port from PORT or config, never from the board file, and
    // :1555-1559 lift only telnet_port and ssh_port out of the board's
    // settings. Setting HTTPPORT must leave the listener where it was.
    const before = appConfig.get('port');

    saveBBSConfig(root, { http_port: 20001 });
    invalidateBoardConfig();
    loadBBSConfig(root);

    expect(appConfig.get('port')).toBe(before);
  });
});
