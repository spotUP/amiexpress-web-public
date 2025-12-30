import { metadata } from './config';
import { events } from './services';
import { createApp } from './app';
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
    console.log('[LiveChat] Set inDoorManager=true for input routing');
  }

  // Check if this is chat-only mode without a user (needs login)
  const chatOnly = session.bbsSession?.tempData?.chatOnly;
  const hasUser = session.user || session.bbsSession?.user;

  console.log('[LiveChat] chatOnly =', chatOnly);
  console.log('[LiveChat] session.user =', session.user);
  console.log('[LiveChat] session.bbsSession?.user =', session.bbsSession?.user);
  console.log('[LiveChat] hasUser =', hasUser);

  if (chatOnly && !hasUser) {
    console.log('[LiveChat] Chat-only mode without user - showing login modal');

    // Show login modal and wait for authentication
    const loginSuccessful = await runChatOnlyLogin(session);

    if (!loginSuccessful) {
      console.log('[LiveChat] Login cancelled or failed');
      return;
    }

    console.log('[LiveChat] Login successful, continuing to chat');
  }

  const app = await createApp(session);
  await app.run();
  events.clear();

  // Cleanup: Reset inDoorManager flag
  if (session.bbsSession) {
    session.bbsSession.inDoorManager = false;
    console.log('[LiveChat] Set inDoorManager=false (cleanup)');
  }
}

export default { runDoor, metadata };
