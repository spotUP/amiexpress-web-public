import { parseTextRows, ChatClient, ChatApiError } from '../../src/services/chat-federation/chat-client';
import { startChatStub, ChatStub } from '../helpers/chat-stub-server';

describe('chat-client', () => {
  it('parses a text reply into named rows and the next since', () => {
    const r = parseTextRows('EVENTS|1|42|1\r\n42|message|room1|bob|m1|100|2|a!b\r\n', 'EVENTS');
    expect(r.rev).toBe(42);
    expect(r.rows[0]).toMatchObject({ type: 'message', user: 'bob', roleColor: '2', text: 'a!b' });
  });
  it('reads a room type as the last ROOMS field, empty from a hub without types', () => {
    const r = parseTextRows('ROOMS|1|1|2\r\nr1|lobby||public|1|a@B|voice\r\nr2|old||public|1|a@B\r\n', 'ROOMS');
    expect(r.rows.map((x) => x.kind)).toEqual(['voice', '']);
  });
  it('rejects a reply of another format', () => {
    expect(() => parseTextRows('ROOMS|1|1|0\r\n', 'EVENTS')).toThrow();
  });
  describe('against the stub', () => {
    let stub: ChatStub;
    beforeAll(async () => { stub = await startChatStub(); });
    afterAll(async () => { await stub.close(); });
    it('maps a JSON error to ChatApiError', async () => {
      const c = new ChatClient({ serverUrl: stub.url, boardKey: 'T.k' });
      await expect(c.edit('sid', 'x', 'y')).rejects.toBeInstanceOf(ChatApiError);
    });
    it('sends the room type /create picked and reads it back', async () => {
      const c = new ChatClient({ serverUrl: stub.url, boardKey: 'T.k' });
      const made = await c.createRoom('sid', 'paint', '', 'public', 'art');
      expect(made.kind).toBe('art');
      const sent = stub.calls.filter((x) => x.method === 'POST' && x.path === '/rooms').pop();
      expect(JSON.parse(sent?.body ?? '{}')).toMatchObject({ name: 'paint', kind: 'art' });
    });
  });
});
