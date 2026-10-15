/**
 * "he has only replied on my first message and its been minutes waiting on
 * the second."
 *
 * Both replies were in the log and in the database. The second was emitted
 * into a room nobody was in: a sysop joins `page:<id>` when they TAKE a page,
 * once, on that socket - and this board recreates the container on every
 * deploy, so the admin's socket reconnects constantly. Every reconnect
 * produced a socket in `sysops` and in no chat room at all, and the
 * conversation went silent while the board went on writing to it.
 */
process.env.SKIP_DB_INIT = '1';

import Database from 'better-sqlite3';

import { OperatorChatRepository } from '../../src/database/operator-chat.repository';
import { initOperatorChatHandler } from '../../src/handlers/operator-chat.handler';
import { activeChatSessions } from '../../src/handlers/operator-chat/chat-stream';

/** A socket.io double that records which rooms it was told to join. */
function socketFor(username: string, secLevel: number) {
  const joined: string[] = [];
  return {
    joined,
    socket: {
      id: `socket-${username}`,
      session: { user: { id: `id-${username}`, username, secLevel } },
      join: (room: string) => joined.push(room),
      on: () => {},
      emit: () => {},
    } as never,
  };
}

function boardWith(connect: (socket: never) => void) {
  const db = new Database(':memory:');
  const repo = new OperatorChatRepository(db);
  const io: any = {
    on: (event: string, handler: (socket: never) => void) => {
      if (event === 'connection') connect(handler as never);
    },
    to: () => ({ emit: () => {} }),
    emit: () => {},
    sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
  };
  io.of = () => io;
  return { repo, io };
}

afterEach(() => activeChatSessions.clear());

test('a sysop reconnecting into a running chat is put back in its room', () => {
  activeChatSessions.set('page-1', { messages: [] } as never);
  activeChatSessions.set('page-2', { messages: [] } as never);

  let onConnection: ((socket: never) => void) | undefined;
  const { repo, io } = boardWith(handler => { onConnection = handler as never; });
  initOperatorChatHandler(io, repo);

  const { socket, joined } = socketFor('sysop', 255);
  onConnection!(socket);

  expect(joined).toContain('sysops');
  // Red before: only `user:` and `sysops`, so every message for these chats
  // went to a room this socket was not in.
  expect(joined).toContain('page:page-1');
  expect(joined).toContain('page:page-2');
});

test('an ordinary caller is not put into anybody\'s chat room', () => {
  activeChatSessions.set('page-1', { messages: [] } as never);

  let onConnection: ((socket: never) => void) | undefined;
  const { repo, io } = boardWith(handler => { onConnection = handler as never; });
  initOperatorChatHandler(io, repo);

  const { socket, joined } = socketFor('caller', 50);
  onConnection!(socket);

  expect(joined).toEqual([]);
});
