/**
 * A door may not be pointed at the board's own listener.
 *
 * The board is ONE node process: the API, telnet, SSH, FTP and every 68K
 * door's emulator. A door that opens a socket to one of those ports is
 * talking to the process that runs it. The emulator parks in
 * `deasync.loopWhile`, which keeps timers and I/O alive - so the connection
 * is accepted - but it is reached from inside a promise continuation, and
 * from there it cannot drain microtasks at all. The async Express handler on
 * the other end runs to its first `await` and never resumes. Nothing on the
 * board answers again until the container is recreated.
 *
 * Measured on this machine, which is why the rule is a refusal and not a
 * warning: from a macrotask a pending microtask settles in 0 ms; from inside
 * an `await` continuation it never settles, while a timer-backed promise
 * still settles in 51 ms. So the board looks alive and answers nothing.
 *
 * It happened: 2026-09-13, the Text-TV door shipped `Host=127.0.0.1
 * Port=3001`, the sysop opened it on node 2, and every caller was locked out
 * of the live board. The door now runs its own sidecar on 3002 - this test is
 * what stops the next door, or a sysop typing 3001 into the field by hand.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { writeDoorSettings, renderDoorCfg } from '../../src/doors/door-settings.service';
import { LISTENER_DEFAULTS } from '../../src/server/board-listeners';

/** A networked door, shaped like TEXTTV: one host, one port. */
function networkedDoor(host = '127.0.0.1', port = 3002): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'door-aim-'));
  fs.writeFileSync(
    path.join(dir, 'door.settings.json'),
    JSON.stringify({
      command: 'TEXTTV',
      cfgFile: 'TEXTTV.cfg',
      settings: [
        { key: 'host', label: 'Host', type: 'string', cfgKey: 'Host', default: host },
        { key: 'port', label: 'Port', type: 'number', cfgKey: 'Port', default: port },
      ],
    })
  );
  return dir;
}

const save = (dir: string, host: string, port: number) =>
  writeDoorSettings(dir, { host, port }, undefined, 'TEXTTV');

describe('pointing a door at the board itself', () => {
  it('is refused for the web and API port, naming what it would take down', () => {
    const dir = networkedDoor();

    expect(() => save(dir, '127.0.0.1', LISTENER_DEFAULTS.http)).toThrow(
      /board's own listener/i
    );
    // The message has to name the consequence, or a sysop reads it as "slow".
    expect(() => save(dir, '127.0.0.1', LISTENER_DEFAULTS.http)).toThrow(
      /locks every caller out|parks the board's event loop/i
    );
  });

  it('is refused for telnet and SSH too, not just the API', () => {
    const dir = networkedDoor();

    expect(() => save(dir, 'localhost', LISTENER_DEFAULTS.telnet)).toThrow(/telnet/i);
    expect(() => save(dir, '127.0.0.1', LISTENER_DEFAULTS.ssh)).toThrow(/SSH/);
  });

  it('refuses every spelling of "this machine"', () => {
    const dir = networkedDoor();

    for (const host of ['127.0.0.1', 'localhost', 'LOCALHOST', '::1', '0.0.0.0']) {
      expect(() => save(dir, host, LISTENER_DEFAULTS.http)).toThrow(/board's own listener/i);
    }
  });

  it('writes nothing when it refuses', () => {
    const dir = networkedDoor();
    save(dir, '127.0.0.1', 3002);
    const before = fs.readFileSync(path.join(dir, 'TEXTTV.cfg'), 'utf8');

    expect(() => save(dir, '127.0.0.1', LISTENER_DEFAULTS.http)).toThrow();

    expect(fs.readFileSync(path.join(dir, 'TEXTTV.cfg'), 'utf8')).toBe(before);
  });

  it('allows the door its own sidecar port', () => {
    const dir = networkedDoor();

    expect(() => save(dir, '127.0.0.1', 3002)).not.toThrow();
    expect(fs.readFileSync(path.join(dir, 'TEXTTV.cfg'), 'utf8')).toContain('Port=3002');
  });

  it('leaves another machine alone, even on a port number we happen to use', () => {
    const dir = networkedDoor();

    // Somebody else's server on 3001 is not our event loop.
    expect(() => save(dir, 'texttv.example.com', LISTENER_DEFAULTS.http)).not.toThrow();
  });

  it('repairs a settings.json written before the guard, instead of failing the boot', () => {
    // renderDoorCfg runs at every boot for every door. A board upgraded from
    // before the guard still holds the deadly value, and refusing here would
    // take the whole board down over one door's setting - worse than the bug.
    const dir = networkedDoor();
    fs.writeFileSync(
      path.join(dir, 'settings.json'),
      JSON.stringify({ host: '127.0.0.1', port: LISTENER_DEFAULTS.http })
    );

    expect(() => renderDoorCfg(dir)).not.toThrow();

    const cfg = fs.readFileSync(path.join(dir, 'TEXTTV.cfg'), 'utf8');
    expect(cfg).toContain('Port=3002');
    expect(cfg).not.toContain(`Port=${LISTENER_DEFAULTS.http}`);
    // The host it was pointed at is left alone: only the deadly half is moved.
    expect(cfg).toContain('Host=127.0.0.1');
  });

  it('renders a safe stored port untouched', () => {
    const dir = networkedDoor();
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ host: '127.0.0.1', port: 3002 }));

    renderDoorCfg(dir);

    expect(fs.readFileSync(path.join(dir, 'TEXTTV.cfg'), 'utf8')).toContain('Port=3002');
  });

  it('says nothing about a door that dials no socket at all', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'door-noport-'));
    fs.writeFileSync(
      path.join(dir, 'door.settings.json'),
      JSON.stringify({
        command: 'TIP',
        cfgFile: 'TIP.cfg',
        settings: [{ key: 'greeting', label: 'Greeting', type: 'string', cfgKey: 'Greeting' }],
      })
    );

    expect(() => writeDoorSettings(dir, { greeting: 'hello' }, undefined, 'TIP')).not.toThrow();
  });
});
