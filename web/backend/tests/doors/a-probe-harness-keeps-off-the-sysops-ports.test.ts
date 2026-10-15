/**
 * A door probe that imports the backend starts the whole board as a side effect (src/index.ts listens as soon as it
 * is loaded outside jest). Left to the defaults it binds 3001 / 2323 / 2222 - the sysop's local board - and the two
 * collide. The probe must claim its own ports unless the caller chose some.
 */
import { HARNESS_PORTS, harnessPortEnv } from '../../../../dev/scripts/door-probe/harness-ports';

describe('the door-probe harness ports', () => {
  test('a bare environment gets the harness ports, none of them the sysop\'s', () => {
    const env = harnessPortEnv({});
    expect(env).toEqual({ PORT: '3101', TELNET_PORT: '64228', SSH_PORT: '2322', TELNET_PETSCII_PORT: '64229' });
    for (const sysop of ['3001', '2323', '2222']) expect(Object.values(env)).not.toContain(sysop);
  });

  test('a port the caller already set is kept, the others are still filled in', () => {
    const env = harnessPortEnv({ PORT: '4000', TELNET_PORT: '' });
    expect(env.PORT).toBe('4000');
    expect(env.TELNET_PORT).toBe('64228');            // an empty value is unset
    expect(env.SSH_PORT).toBe('2322');
  });

  test('the table names exactly the four listeners the backend reads', () => {
    expect(Object.keys(HARNESS_PORTS).sort()).toEqual(['PORT', 'SSH_PORT', 'TELNET_PETSCII_PORT', 'TELNET_PORT']);
  });
});
