import { metadata } from './config';
import { events } from './services';
import { createApp } from './app';

export { metadata };

/** Door session from BBS handler */
interface DoorSession {
  socket: any;
  user: any;
  bbsSession: any;
  bbs: any;
  params: string[];
}

/** Main door entry point */
export async function runDoor(session: DoorSession): Promise<void> {
  const app = await createApp(session);
  await app.run();
  events.clear();
}

export default { runDoor, metadata };
