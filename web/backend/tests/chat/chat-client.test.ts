import { parseTextRows, ChatClient, ChatApiError } from '../../src/services/chat-federation/chat-client';
import { startChatStub, ChatStub } from '../helpers/chat-stub-server';

describe('chat-client', () => {
  it('parses a text reply into named rows and the next since', () => {
    const r = parseTextRows('EVENTS|1|42|1\r\n42|message|room1|bob|m1|100|2|a!b\r\n', 'EVENTS');
    expect(r.rev).toBe(42);
    expect(r.rows[0]).toMatchObject({ type: 'message', user: 'bob', roleColor: '2', text: 'a!b' });
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
  });
});
