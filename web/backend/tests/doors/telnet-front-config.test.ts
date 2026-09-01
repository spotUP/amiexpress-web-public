/**
 * The login screen tells users an address they can dial, and counts the nodes
 * this board has.
 *
 * With BBS_IP unset the door walked the machine's interfaces and printed the
 * first non-internal IPv4 - inside the container that is 172.18.0.2, a private
 * docker-bridge address nobody outside can reach, shown to every user who
 * connected. With MAX_NODES unset it listed 8 nodes on a board whose own
 * bbsConfig.info says 32. Neither could be set without editing the container's
 * environment.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  loadConfig,
  boardAddress,
  defaultConfig,
  firstExternalIPv4,
  MAX_NODES_CEILING,
} from '../../../../Doors/telnet-front/config';

const MANIFEST = fs.readFileSync(
  path.join(__dirname, '../../../../Doors/telnet-front/door.settings.json'), 'utf8');

describe('the telnet front-end configuration', () => {
  let doorDir: string;
  let distDir: string;

  beforeEach(() => {
    doorDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-'));
    distDir = path.join(doorDir, 'dist');
    fs.mkdirSync(distDir);
    fs.writeFileSync(path.join(doorDir, 'door.settings.json'), MANIFEST);
  });

  afterEach(() => fs.rmSync(doorDir, { recursive: true, force: true }));

  const writeValues = (values: unknown) =>
    fs.writeFileSync(path.join(doorDir, 'settings.json'), JSON.stringify(values));

  it('prints what the sysop set, from the dist a board runs', () => {
    writeValues({ bbsAddress: 'bbs.uprough.net' });

    expect(boardAddress(loadConfig(distDir, {}))).toBe('bbs.uprough.net');
  });

  it('lets the sysop override the environment the container happens to carry', () => {
    writeValues({ bbsAddress: 'bbs.uprough.net', maxNodes: 32 });

    const config = loadConfig(distDir, { BBS_IP: '172.18.0.2', MAX_NODES: '8' });

    expect(config.bbsAddress).toBe('bbs.uprough.net');
    expect(config.maxNodes).toBe(32);
  });

  it('still reads BBS_IP and MAX_NODES when nothing is set in the admin', () => {
    const config = loadConfig(distDir, { BBS_IP: '10.0.0.5', MAX_NODES: '12' });

    expect(boardAddress(config)).toBe('10.0.0.5');
    expect(config.maxNodes).toBe(12);
  });

  it('refuses more nodes than AmiExpress can have', () => {
    writeValues({ maxNodes: 999 });

    expect(loadConfig(distDir, {}).maxNodes).toBe(MAX_NODES_CEILING);
  });

  it('falls back to the machine only when nobody has said anything', () => {
    const config = loadConfig(distDir, {});

    expect(config).toEqual(defaultConfig());
    expect(boardAddress(config)).toBe(firstExternalIPv4());
  });

  it('picks a real address over an internal one', () => {
    const address = firstExternalIPv4({
      lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true } as any],
      eth0: [{ address: '10.1.2.3', family: 'IPv4', internal: false } as any],
    });

    expect(address).toBe('10.1.2.3');
  });
});
