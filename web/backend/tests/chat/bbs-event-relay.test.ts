/**
 * The board relays its BBS events to the door server's chat service, so
 * LIVECHAT68 can print login, upload and door lines. Driven from the real
 * emitter entry point (emitUserLogin / emitUpload) to the HTTP request the
 * stub door server receives.
 */
import { startChatStub, ChatStub } from '../helpers/chat-stub-server';
import { emitUserLogin, emitUpload } from '../../src/services/bbs-event-emitter';
import { startBbsEventRelay, stopBbsEventRelay } from '../../src/services/chat-federation/bbs-event-relay';
import type { SystemConfig } from '../../src/database/types';

const cfgFor = (url: string): SystemConfig =>
  ({ achievements_server_url: url, achievements_board_key: 'T.k' }) as unknown as SystemConfig;

async function until(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !cond(); i++) await new Promise((r) => setTimeout(r, 10));
}

describe('bbs event relay', () => {
  let stub: ChatStub;
  beforeAll(async () => { delete process.env.DOOR_SERVER_URL; stub = await startChatStub(); });
  afterAll(async () => { stopBbsEventRelay(); await stub.close(); });
  afterEach(() => stopBbsEventRelay());

  it('POSTs each emitted event to /chat/v1/bbs-events with the board key', async () => {
    startBbsEventRelay({ getConfig: () => cfgFor(stub.url) });
    emitUserLogin({ username: 'bob', nodeId: 2, location: 'Oslo', timestamp: 1 });
    emitUpload({ username: 'bob', nodeId: 2, fileName: 'demo.lha', fileSize: 2048, conferenceId: 1, conferenceName: 'Amiga', timestamp: 2 });
    await until(() => stub.count('POST', '/bbs-events') >= 2);
    const calls = stub.calls.filter((c) => c.path === '/bbs-events');
    expect(calls).toHaveLength(2);
    expect(calls[0].auth).toBe('Board T.k');
    expect(JSON.parse(calls[0].body)).toMatchObject({ type: 'user_login', username: 'bob', nodeId: 2, data: { location: 'Oslo' } });
    expect(JSON.parse(calls[1].body)).toMatchObject({ type: 'upload', data: { fileName: 'demo.lha', fileSize: 2048, conferenceName: 'Amiga' } });
  });

  it('sends nothing when the board has no door server key', async () => {
    const before = stub.count('POST', '/bbs-events');
    startBbsEventRelay({ getConfig: () => ({}) as SystemConfig });
    emitUserLogin({ username: 'bob', nodeId: 1, timestamp: 3 });
    await new Promise((r) => setTimeout(r, 50));
    expect(stub.count('POST', '/bbs-events')).toBe(before);
  });
});
