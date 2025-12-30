/**
 * Chat-Only Login Integration
 * Handles blessed modal login for standalone chat mode
 */
import { createScreen } from './ui/screen';
import { createLoginModal, LoginCredentials } from './ui/login-modal';
import { createDisconnectionModal } from './ui/disconnection-modal';

/**
 * Verify credentials using dynamic require (we're running inside the backend)
 */
async function verifyCredentials(credentials: LoginCredentials): Promise<{ success: boolean; user?: any; error?: string }> {
  try {
    // Dynamic require to get backend database module (we're running inside the backend process)
    const { db } = require('~/Code/amiexpress-web/web/backend/src/database');

    // Use the Database's authenticateUser method which handles password verification
    const user = await db.authenticateUser(credentials.username, credentials.password);

    if (!user) {
      return { success: false, error: 'Invalid username or password' };
    }

    // Success
    return {
      success: true,
      user: {
        username: user.username,
        secLevel: user.secLevel,
        id: user.id
      }
    };
  } catch (error) {
    console.error('[ChatOnlyLogin] Error verifying credentials:', error);
    return { success: false, error: 'Login failed - server error' };
  }
}

export async function runChatOnlyLogin(session: any): Promise<boolean> {
  const { socket, bbs, bbsSession } = session;

  return new Promise((resolve, reject) => {
    let screen: any = null;
    let loginModal: any = null;
    let disconnectionModal: any = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 3;

    console.log('[ChatOnlyLogin] Initializing blessed login modal');

    // Create blessed screen
    screen = createScreen(bbs);

    // Set up input handler to route input to blessed screen
    // Note: inDoorManager flag is set in index.ts runDoor()
    bbsSession.doorInputHandler = (data: string) => {
      if (screen.program) {
        // Call _handleData to parse input and emit keypress events
        // Don't use emit('data') - that just emits raw data without parsing
        screen.program._handleData(data);
      }
      return true;
    };

    // Create login modal
    loginModal = createLoginModal({
      screen,
      onSubmit: async (credentials: LoginCredentials) => {
        console.log('[ChatOnlyLogin] Submitting credentials for user:', credentials.username);

        // Verify credentials directly (we're on the server!)
        const result = await verifyCredentials(credentials);

        if (result.success && result.user) {
          console.log('[ChatOnlyLogin] Login successful for:', result.user.username);

          // Update session with user data
          session.user = result.user;
          if (bbsSession) {
            bbsSession.user = result.user;
          }

          // Clean up and resolve
          // NOTE: Don't delete doorInputHandler here - createApp will set its own handler
          // and deleting here can cause a race condition where it deletes the new handler
          loginModal.hide();
          loginModal.destroy();
          if (disconnectionModal) disconnectionModal.destroy();
          screen.destroy();

          resolve(true);
        } else {
          console.log('[ChatOnlyLogin] Login failed:', result.error);
          loginModal.showError(result.error || 'Login failed');
          loginModal.clearInputs();
        }
      },
      onError: (message: string) => {
        console.log('[ChatOnlyLogin] Error:', message);
      },
    });

    // Create disconnection modal (hidden initially)
    disconnectionModal = createDisconnectionModal({
      screen,
      onRetry: () => {
        console.log('[ChatOnlyLogin] User requested reconnect');
        reconnectAttempts++;
        if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
          socket.connect();
        } else {
          disconnectionModal.showError(
            `Connection failed after ${MAX_RECONNECT_ATTEMPTS} attempts.\n\n` +
            'Please check that the server is running and refresh the page to try again.'
          );
        }
      },
      onCancel: () => {
        console.log('[ChatOnlyLogin] User cancelled reconnection');
        if (loginModal) loginModal.destroy();
        if (disconnectionModal) disconnectionModal.destroy();
        if (screen) screen.destroy();

        // Clean up input handler
        delete bbsSession.doorInputHandler;

        reject(new Error('User cancelled connection'));
      },
    });

    // Show the modal
    loginModal.show();

    // Force a second render after a brief delay to ensure everything paints
    setTimeout(() => {
      screen.render();
    }, 50);

    // Handle connection errors during login
    socket.on('disconnect', (reason: string) => {
      console.log('[ChatOnlyLogin] Disconnected:', reason);
      if (reason !== 'io client disconnect') {
        loginModal.hide();
        disconnectionModal.showError(
          `Lost connection to server\n\n` +
          `Reason: ${reason}\n\n` +
          `Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`
        );
      }
    });

    socket.on('connect_error', (error: any) => {
      console.error('[ChatOnlyLogin] Connection error:', error.message);
      reconnectAttempts++;
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        loginModal.hide();
        disconnectionModal.showError(
          `Connection failed after ${reconnectAttempts} attempts.\n\n` +
          `Error: ${error.message}\n\n` +
          'Please check that the server is running.'
        );
      }
    });

    socket.on('connect', () => {
      console.log('[ChatOnlyLogin] Reconnected');
      reconnectAttempts = 0;
      if (disconnectionModal) {
        disconnectionModal.hide();
      }
      if (loginModal) {
        loginModal.show();
      }
    });

    // Note: Login is now handled directly in onSubmit callback (we're on the server!)
    // The old socket.on('chat-only-login-error') and socket.once('chat-only-login-success')
    // handlers have been removed since we call verifyCredentials() directly.
  });
}
