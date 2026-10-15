/**
 * The board sees a telnet or SSH caller hang up.
 *
 * The connection emitter's `connected` was the constant `true`, so the menu's
 * carrier check (express.e:28590 `checkOnlineStatus`) could never see a byte
 * caller drop, and a handler still running after the hang-up kept writing into
 * a closed connection instead of logging him off (web-vs-telnet audit item 16,
 * 2026-09-28). A browser's socket.io `connected` has always gone false.
 */
process.env.SKIP_DB_INIT = '1';

import { EventEmitter } from 'events';
import { buildConnectionEmitter } from '../../src/server/connection-emitter';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

function aConnection() {
  const connection: any = Object.assign(new EventEmitter(), {
    sessionId: `telnet-hangup-${Math.random()}`,
    nodeId: 7,
    session: { nodeId: 7, subState: LoggedOnSubState.DISPLAY_MENU, tempData: {} },
    write: () => {},
    close: () => {},
  });
  return connection;
}

describe('a byte caller hanging up', () => {
  it('turns the emitter\'s connected false, as socket.io\'s does', () => {
    const connection = aConnection();
    const emitter = buildConnectionEmitter(connection);
    expect(emitter.connected).toBe(true);

    connection.emit('close');

    expect(emitter.connected).toBe(false);
  });

  it("tells a running door the line dropped, once, as socket.io's 'disconnect' does", () => {
    const connection = aConnection();
    const emitter = buildConnectionEmitter(connection);
    const doorHeard = jest.fn();
    emitter.on('disconnect', doorHeard);   // AmigaDoorSession's carrier-drop listener

    connection.emit('close');
    connection.emit('close');

    expect(doorHeard).toHaveBeenCalledTimes(1);
  });

  it("sends the menu's carrier check to LOGOFF instead of drawing the prompt", async () => {
    const connection = aConnection();
    const emitter = buildConnectionEmitter(connection);
    connection.emit('close');

    const { displayMainMenu } = require('../../src/handlers/command-handler/menu');
    const session = connection.session;
    session.menuPause = false;
    await displayMainMenu(emitter, session, false);

    expect(session.subState).toBe(LoggedOnSubState.LOGOFF);
  });
});
