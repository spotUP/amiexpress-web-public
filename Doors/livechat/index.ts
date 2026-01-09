import { metadata } from './config';
import { events } from './services';
import { createApp } from './server';
import { runChatOnlyLogin } from './chat-only-login';

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
  // CRITICAL: Set inDoorManager flag FIRST, before creating any blessed screens
  // Both the login modal (runChatOnlyLogin) and main app (createApp) need this flag
  if (session.bbsSession) {
    session.bbsSession.inDoorManager = true;
  }

  // Check if this is chat-only mode without a user (needs login)
  const chatOnly = session.bbsSession?.tempData?.chatOnly;
  const hasUser = session.user || session.bbsSession?.user;

  if (chatOnly && !hasUser) {
    // Show login modal and wait for authentication
    const loginSuccessful = await runChatOnlyLogin(session);

    if (!loginSuccessful) {
      return;
    }
  }

  const app = await createApp(session);
  await app.run();
  events.clear();

  // Cleanup: Reset inDoorManager flag
  if (session.bbsSession) {
    session.bbsSession.inDoorManager = false;
  }
}

export default { runDoor, metadata };
