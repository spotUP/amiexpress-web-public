/**
 * Values and names AmiExpress actually reads.
 *
 * Every claim here carries the express.e line that settles it. The class of
 * fault is the same one that runs through the whole admin: the writer and the
 * reader disagree - only here the reader is AmiExpress itself, so the page
 * looks right, the file is written, and the board reads something else.
 */

process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readTooltypeMap } from '../../src/utils/info-file.util';
import { SystemConfigSchema } from '../../src/services/config.schemas';
import { NodeConfigService } from '../../src/services/config-services/node-config.service';
import { tooltypesToFlags, ambiguouslyDeniedFlags } from '../../src/services/config-services/acs-level-file.service';
import { loadBBSConfig, saveBBSConfig } from '../../src/services/bbs-config-file.service';
import { config as appConfig } from '../../src/config';

const CONTEXT = { userId: '1', username: 'sysop' } as never;

function seed(filePath: string, entries: Record<string, string>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    Object.entries(entries).map(([k, v]) => (v ? `${k}=${v}` : k)).join('\n') + '\n'
  );
}

describe('PASSWORD_SECURITY offers what express.e:938-952 tests for', () => {
  // express.e compares the tooltype against six literals and falls through to
  // PWD_LEGACY for anything else. The schema offered bcrypt/sha256/md5/legacy,
  // so three of the four choices degraded the board to legacy hashing while
  // the admin reported bcrypt.
  const REAL = ['LEGACY', 'PBKDF2_5', 'PBKDF2_50', 'PBKDF2_100', 'PBKDF2_1000', 'PBKDF2_10000'];

  it.each(REAL)('accepts %s', value => {
    const parsed = SystemConfigSchema.partial().safeParse({ password_security: value });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.password_security).toBe(value);
  });

  it.each(['bcrypt', 'sha256', 'md5'])('rejects %s, which express.e never tests for', value => {
    expect(SystemConfigSchema.partial().safeParse({ password_security: value }).success).toBe(false);
  });

  it('round-trips a value through bbsConfig.info in express.e spelling', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pwsec-'));
    try {
      saveBBSConfig(root, { password_security: 'PBKDF2_10000' });
      expect(loadBBSConfig(root).password_security).toBe('PBKDF2_10000');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('a node enables telnet by the PRESENCE of TELNET', () => {
  // ACP.e:2675 - IF FindToolType(oldtooltypes,'TELNET') THEN telnetNode[i]:=1.
  // The writer wrote NO_TELNET when telnet was off and NOTHING when it was on,
  // so saving a node with telnet enabled REMOVED its TELNET tooltype.
  let root: string;
  let previousDataDir: string;

  const mirror = () => ({
    getConfigRepository: () => ({
      getNodeConfig: () => null,
      getNodeConfigs: () => [],
      updateNodeConfig: () => null,
      logConfigChange: () => undefined,
    }),
  }) as never;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'telnet-'));
    previousDataDir = appConfig.get('dataDir');
    appConfig.set('dataDir', root);
  });

  afterEach(() => {
    appConfig.set('dataDir', previousDataDir);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('writes TELNET when telnet is on', async () => {
    seed(path.join(root, 'Node1.info'), { NODESTART: 'BBS:Express' });

    await new NodeConfigService(mirror()).updateNodeConfig(
      2, { node_number: 1, telnet: true } as never, CONTEXT
    );

    const after = readTooltypeMap(path.join(root, 'Node1.info'));
    expect(after.has('TELNET')).toBe(true);
    expect(after.has('NO_TELNET')).toBe(false);
  });

  it('removes TELNET when telnet is off, and writes no NO_TELNET', async () => {
    seed(path.join(root, 'Node1.info'), { NODESTART: 'BBS:Express', TELNET: '1' });

    await new NodeConfigService(mirror()).updateNodeConfig(
      2, { node_number: 1, telnet: false } as never, CONTEXT
    );

    const after = readTooltypeMap(path.join(root, 'Node1.info'));
    expect(after.has('TELNET')).toBe(false);
    expect(after.has('NO_TELNET')).toBe(false);
  });

  it('reads a node with TELNET as enabled, and one without as disabled', async () => {
    seed(path.join(root, 'Node0.info'), { NODESTART: 'BBS:Express', TELNET: '1' });
    seed(path.join(root, 'Node1.info'), { NODESTART: 'BBS:Express' });

    const service = new NodeConfigService(mirror());
    expect((await service.getNodeConfig(1))!.telnet).toBe(true);
    expect((await service.getNodeConfig(2))!.telnet).toBe(false);
  });

  it('drops a NO_TELNET the previous admin wrote', async () => {
    seed(path.join(root, 'Node1.info'), { NODESTART: 'BBS:Express', NO_TELNET: '1' });

    await new NodeConfigService(mirror()).updateNodeConfig(
      2, { node_number: 1, telnet: true } as never, CONTEXT
    );

    const after = readTooltypeMap(path.join(root, 'Node1.info'));
    expect(after.has('NO_TELNET')).toBe(false);
    expect(after.has('TELNET')).toBe(true);
  });
});

describe('an ACS flag written =NO', () => {
  // checkToolTypeExists (tooltypes.e:204-218) looks only at key PRESENCE, so
  // ACS.DOWNLOAD=NO GRANTS download on a real AmiExpress. This port denies it,
  // deliberately: matching express.e would silently grant every permission a
  // sysop has written that way. The divergence is reported instead.
  const tooltypes = [
    { key: 'ACS.DOWNLOAD', value: 'NO', commented: false, prefix: '', originalLine: 'ACS.DOWNLOAD=NO' },
    { key: 'ACS.UPLOAD', value: '', commented: true, commentStyle: '()' as const, prefix: '', originalLine: '(ACS.UPLOAD)' },
    { key: 'ACS.SYSOP_COMMANDS', value: '', commented: false, prefix: '', originalLine: 'ACS.SYSOP_COMMANDS' },
  ];

  it('is still denied here, because granting it would open a live board', () => {
    const flags = tooltypesToFlags(tooltypes);
    expect(flags['ACS.DOWNLOAD']).toBe(false);
    expect(flags['ACS.UPLOAD']).toBe(false);
    expect(flags['ACS.SYSOP_COMMANDS']).toBe(true);
  });

  it('is reported, because AmiExpress reads it the other way', () => {
    expect(ambiguouslyDeniedFlags(tooltypes)).toEqual(['ACS.DOWNLOAD']);
  });

  it('says nothing about the parenthesised form, which denies on both', () => {
    expect(ambiguouslyDeniedFlags([tooltypes[1], tooltypes[2]])).toEqual([]);
  });
});
