import { ServerDoor, DoorContext } from '@amiexpress/bbs-door-sdk';
import { execute } from './app';

export const metadata = {
  name: 'RIP Browser',
  version: '1.0.0',
  description: 'Browse and view RIP graphics files',
  author: 'AmiExpress Team',
  command: 'RIPBROWSER',
};

const door = new ServerDoor(metadata);

door.onStart(async (ctx: DoorContext) => {
  const { socket, bbsSession, user } = ctx;

  // Delegate to execute function in app.ts
  await execute({
    socket,
    bbsSession,
    user,
    params: ctx.params || [],
    close: () => {
      socket.emit('door:close');
    }
  });
});

export default door;
