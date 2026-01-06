import { runDoorWithSession } from '@amiexpress/bbs-door-sdk/tools/runDoorSession';
import { execute } from './app';

export const runDoor = async (doorSession: any) => {
  const { socket, bbsSession, user, params } = doorSession;
  
  // Modern functional door entry point
  await execute({ 
    socket, 
    bbsSession, 
    user, 
    params,
    close: () => {
      socket.emit('door:close');
    }
  });
};
