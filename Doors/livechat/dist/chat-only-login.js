"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runChatOnlyLogin = runChatOnlyLogin;
/**
 * Chat-Only Login Integration
 * Handles blessed modal login for standalone chat mode
 */
const screen_1 = require("./ui/screen");
const login_modal_1 = require("./ui/login-modal");
const disconnection_modal_1 = require("./ui/disconnection-modal");
/**
 * Verify credentials using dynamic require (we're running inside the backend)
 */
async function verifyCredentials(credentials) {
    try {
        // Resolve the backend database module via process.cwd(). The backend is
        // launched from `web/backend/` in both dev (start-servers.sh:676 cds
        // there before `tsx src/index.ts`) and prod (Dockerfile:320 sets
        // WORKDIR /app/web/backend before CMD), so this path works regardless
        // of where the door dist sits on disk. Previously hardcoded as the
        // developer's `~/...` absolute path which doesn't exist in
        // the Docker container, so every chat-only-login submit on prod hit
        // "Cannot find module" -> swallowed -> generic "server error".
        const path = require('path');
        const { db } = require(path.resolve(process.cwd(), 'src/database'));
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
    }
    catch (error) {
        // Say WHAT failed. This catch swallowing the real reason has now cost two
        // debugging sessions: once when the module path was a hardcoded developer
        // path missing in Docker, and again when the backend was started from the
        // repo root so `process.cwd()/src/database` did not resolve. The user only
        // ever saw a red "server error" flash.
        console.error('[chat-only-login] verifyCredentials failed:', error);
        console.error('[chat-only-login] cwd was:', process.cwd());
        return { success: false, error: 'Login failed - server error' };
    }
}
async function runChatOnlyLogin(session) {
    const { socket, bbs, bbsSession } = session;
    return new Promise((resolve, reject) => {
        let screen = null;
        let loginModal = null;
        let disconnectionModal = null;
        let reconnectAttempts = 0;
        const MAX_RECONNECT_ATTEMPTS = 3;
        // Create blessed screen
        screen = (0, screen_1.createScreen)(bbs);
        // Set up input handler to route input to blessed screen
        // Note: inDoorManager flag is set in index.ts runDoor()
        //
        // Previously this handler dropped SGR mouse codes (`\x1b[<...M/m`) to
        // work around a 2026-04-24 leak where they showed up as literal
        // `[<btn;col;row;M` text at the cursor. That leak is now handled at
        // the source: (a) the SDK program parser at program.ts:1457-1471
        // recognises and consumes SGR mouse, (b) the BBS fall-through in
        // socket-handlers.ts drops any unconsumed SGR before the command
        // handler can echo it. Dropping SGR here was actively breaking the
        // login modal -- without mouse events reaching the textarea, users
        // couldn't click to focus the username/password fields.
        bbsSession.doorInputHandler = (data) => {
            console.log('[chat-only-login] input data=%s len=%d focused=%s screen?=%s', JSON.stringify(data.slice(0, 20)), data.length, screen.focused?.type || 'none', !!screen.program);
            if (screen.program) {
                // Use proper emit API (not private _handleData) to prevent double processing
                screen.program.emit('data', data);
            }
            return true;
        };
        // Create login modal
        loginModal = (0, login_modal_1.createLoginModal)({
            screen,
            onSubmit: async (credentials) => {
                // Verify credentials directly (we're on the server!)
                const result = await verifyCredentials(credentials);
                if (result.success && result.user) {
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
                    if (disconnectionModal)
                        disconnectionModal.destroy();
                    screen.destroy();
                    resolve(true);
                }
                else {
                    loginModal.showError(result.error || 'Login failed');
                    loginModal.clearInputs();
                }
            },
            onError: (message) => {
            },
        });
        // Create disconnection modal (hidden initially)
        disconnectionModal = (0, disconnection_modal_1.createDisconnectionModal)({
            screen,
            onRetry: () => {
                reconnectAttempts++;
                if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
                    socket.connect();
                }
                else {
                    disconnectionModal.showError(`Connection failed after ${MAX_RECONNECT_ATTEMPTS} attempts.\n\n` +
                        'Please check that the server is running and refresh the page to try again.');
                }
            },
            onCancel: () => {
                if (loginModal)
                    loginModal.destroy();
                if (disconnectionModal)
                    disconnectionModal.destroy();
                if (screen)
                    screen.destroy();
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
        socket.on('disconnect', (reason) => {
            if (reason !== 'io client disconnect') {
                loginModal.hide();
                disconnectionModal.showError(`Lost connection to server\n\n` +
                    `Reason: ${reason}\n\n` +
                    `Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
            }
        });
        socket.on('connect_error', (error) => {
            reconnectAttempts++;
            if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                loginModal.hide();
                disconnectionModal.showError(`Connection failed after ${reconnectAttempts} attempts.\n\n` +
                    `Error: ${error.message}\n\n` +
                    'Please check that the server is running.');
            }
        });
        socket.on('connect', () => {
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
