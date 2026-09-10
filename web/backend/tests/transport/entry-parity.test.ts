/**
 * EVERY TRANSPORT ENTERS THE BOARD THE SAME WAY.
 *
 * TP-13a. Three things a caller met depended on how they had arrived:
 *
 *   - the connect banner (express.e:29507-29522) was printed by the web
 *     connection handler and by nothing else, so telnet, SSH and
 *     /ws/terminal callers dropped straight into the graphics prompt;
 *   - /ws/terminal ran no pre-login at all - no banner, no FRONTEND screen,
 *     no graphics prompt, no AREXX `login` trigger;
 *   - the who's-online address came from the user RECORD's `ip`, which is
 *     empty for the two byte transports, so the telnet front end printed
 *     NOT AVAILABLE for exactly the callers its own line names.
 */
process.env.SKIP_DB_INIT = '1';

import { emitConnectBanner } from '../../src/services/login-connect.service';

/** Collects what a caller was shown, whatever the transport underneath. */
function recorder() {
  const said: string[] = [];
  return {
    said,
    text: () => said.join(''),
    emitter: { emit: (event: string, payload: unknown) => { if (event === 'ansi-output') said.push(String(payload)); } } as any,
  };
}

const sessionOn = (connectionType: string) => ({ nodeId: 3, connectionType }) as any;

describe('the connect banner', () => {
  it('is the same eight lines whatever the caller arrived on', async () => {
    const web = recorder();
    const telnet = recorder();
    const ssh = recorder();

    await emitConnectBanner(web.emitter, sessionOn('web'), 0);
    await emitConnectBanner(telnet.emitter, sessionOn('telnet'), 0);
    await emitConnectBanner(ssh.emitter, sessionOn('ssh'), 0);

    // Byte for byte, apart from the clock the third line carries.
    const withoutTime = (text: string) => text.replace(/Connection occurred at [^.]+\./, 'Connection occurred at <time>.');
    expect(withoutTime(telnet.text())).toBe(withoutTime(web.text()));
    expect(withoutTime(ssh.text())).toBe(withoutTime(web.text()));
  });

  it('says what express.e says, and names the node the caller got', async () => {
    const caller = recorder();

    await emitConnectBanner(caller.emitter, sessionOn('telnet'), 0);

    const text = caller.text();
    expect(text).toContain('/X Native Telnet:  Searching for free node...');
    expect(text).toContain('/X Native Telnet:  Successful connection to node 3');
    expect(text).toContain('CONNECT 19200');
    expect(text).toContain('**EMSI_IRQ8E08');
    expect(text).toContain('Welcome to');
    expect(text).toContain('Running AmiExpress v5.6 Copyright');
    expect(text).toContain('You are connected to Node 3');
    expect(text).toContain('Connection occurred at');
    // The one line that used to name a transport - and named the wrong one
    // for everybody but the browser.
    expect(text).not.toContain('via web connection');
  });

  it('holds only where a pause is wanted, and returns at once otherwise', async () => {    const caller = recorder();

    const started = Date.now();
    await emitConnectBanner(caller.emitter, sessionOn('telnet'), 0);
    const withoutDelay = Date.now() - started;

    const paused = Date.now();
    await emitConnectBanner(caller.emitter, sessionOn('web'), 120);
    const withDelay = Date.now() - paused;

    // A browser has no dial-up negotiation to fill; three seconds added to
    // a telnet connect would be a regression, not parity.
    expect(withoutDelay).toBeLessThan(100);
    expect(withDelay).toBeGreaterThanOrEqual(110);
  });

  it('clears stale glass before the banner draws', async () => {
    // A caller redialing after a refusal or a reboot still sees whatever
    // was last painted. express.e never clears here - a dial-up terminal
    // came up blank - but ours persist, so the banner clears first.
    const caller = recorder();

    await emitConnectBanner(caller.emitter, sessionOn('telnet'), 0);

    expect(caller.said[0]).toBe('\x1b[2J\x1b[H');
  });
});

describe("the caller's own address", () => {
  it('comes from the session, which the byte transports populate', () => {
    jest.resetModules();
    const sessions = new Map<string, any>([
      ['1', { nodeId: 1, connectionType: 'telnet', remoteAddress: '10.0.0.7', user: { username: 'SPOT', location: 'OSLO' } }],
      ['2', { nodeId: 2, connectionType: 'web', remoteAddress: '10.0.0.9', user: { username: 'RUNE', location: 'BERGEN', ip: '203.0.113.4' } }],
      ['3', { nodeId: 3, connectionType: 'ssh', user: { username: 'GHOST', location: '' } }],
    ]);
    jest.doMock('../../src/server/session-manager', () => ({ sessions }));
    const { listOnlineNodes } = require('../../src/doors/who-is-online');

    const nodes = listOnlineNodes();

    // A telnet caller has no `user.ip` at all - this used to read
    // NOT AVAILABLE / PRIVATE for the transport the screen is named after.
    expect(nodes.find((n: any) => n.nodeNumber === 1).ipAddress).toBe('10.0.0.7');
    // The session's address wins over a stale record field.
    expect(nodes.find((n: any) => n.nodeNumber === 2).ipAddress).toBe('10.0.0.9');
    // And with neither, express.e's own word rather than a blank column.
    expect(nodes.find((n: any) => n.nodeNumber === 3).ipAddress).toBe('PRIVATE');
  });
});
