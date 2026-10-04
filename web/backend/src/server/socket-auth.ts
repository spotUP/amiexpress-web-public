/**
 * The socket.io handshake: who a connecting socket is, from its token.
 *
 * No token is a caller at the login prompt. A board JWT is a logged-on
 * account - a chat-only web session (a node of its own) or the admin UI - and
 * an operator page's link is the Discord operator for that page. Moved out of
 * index.ts so the handshake can be driven by a test as index.ts registers it
 * (`io.use(authenticateSocket)`).
 */
import type { Socket } from "socket.io";
import { db } from "../database";
import { jwtSecret as boardJwtSecret } from "../utils/jwt-secrets";
import { tokenHolderRefusal } from "../services/logon-gates";
import { createSession, getNextAvailableNodeId, setSession } from "./session-manager";

export async function authenticateSocket(socket: Socket, next: (err?: Error) => void): Promise<void> {
  const token = socket.handshake.auth.token;
  const hasToken = !!token;
console.log(
    `[Socket.IO Auth] New connection, has token: ${hasToken}, socket id: ${socket.id}`
  );

  // If no token provided, allow connection (for BBS clients)
  if (!token) {
console.log(
      "[Socket.IO Auth] No token provided, allowing anonymous connection"
    );
    return next();
  }

  try {
    // Try JWT authentication first (for logged-in admins)
    try {
      const jwtModule = await import("jsonwebtoken");
      // Handle both ESM and CommonJS module formats
      const jwt = jwtModule.default || jwtModule;

      // The board's one token key (utils/jwt-secrets.ts).
      const jwtSecret = boardJwtSecret();

      const decoded = jwt.verify(token, jwtSecret) as any;
console.log("[Socket.IO Auth] JWT decoded successfully:", {
        userId: decoded.userId,
        username: decoded.username,
      });

      // Get user from database
      const user = await db.getUserById(decoded.userId);
      if (!user) {
console.error(
          "[Socket.IO Auth] User not found in database:",
          decoded.userId
        );
        throw new Error("User not found");
      }

      // The account as it is NOW, not as it was when the token was minted
      // (services/logon-gates): a deleted, locked or level 0/1 account's
      // token stops opening a session at the next connect.
      const gate = tokenHolderRefusal(user);
      if (gate.refusal !== null) {
console.log(
          `[Socket.IO Auth] Token refused for ${user.username}: ${gate.refusal}`
        );
        throw new Error(gate.refusal);
      }

      // Check if this is a chat-only user:
      //  - decoded.chatOnly=true: token minted via /api/chat/login
      //  - OR the handshake query ?chatOnly=true: standard BBS token reused for SSO
      const chatOnlyQuery = socket.handshake?.query?.chatOnly === "true";
      if (decoded.chatOnly || chatOnlyQuery) {
        // Create a proper BBS session for web chat users
        const nodeId = getNextAvailableNodeId();
        // A full board refuses here as it does on every transport; the auth
        // failure below tells the chat client it could not connect.
        if (nodeId === null) throw new Error("All nodes are busy");
        const session = createSession(nodeId);

        // Attach user info to the session
        (session as any).user = {
          id: user.id,
          username: user.username,
          secLevel: user.secLevel,
        };
        session.nodeId = nodeId;
        (session as any).chatOnly = true; // Mark as web chat session

        // Register the session so getSessionBySocketId() will find it
        setSession(socket.id, session);

        // Also attach to socket for direct access
        (socket as any).session = session;

console.log(
          `[Socket.IO Auth] Web chat user authenticated: ${user.username} (nodeId: ${nodeId})`
        );
      } else {
        // Admin UI user - attach user info without full BBS session
        (socket as any).session = {
          user: {
            id: user.id,
            username: user.username,
            secLevel: user.secLevel,
          },
          nodeId: 0, // Admin UI doesn't have a node
        };

console.log(
          `[Socket.IO Auth] Admin authenticated: ${user.username} (secLevel: ${user.secLevel})`
        );
      }
      return next();
    } catch (jwtError: any) {
      // JWT failed - check if it's expired vs invalid
      const isExpired = jwtError.name === "TokenExpiredError";
      const errorMsg = isExpired
        ? "Session expired - please log in again"
        : (jwtError as Error).message;
console.log("[Socket.IO Auth] JWT verification failed:", errorMsg);
console.log(
        "[Socket.IO Auth] Token preview:",
        token?.substring(0, 20) + "..."
      );

      // Try operator page token (UUID from Discord links) as fallback
console.log(
        "[Socket.IO Auth] Checking if token is an operator page token instead..."
      );
      try {
        const operatorChatRepo = db.getOperatorChatRepository();
        const page = operatorChatRepo.getPageRequestByToken(token);

        if (page) {
console.log(
            `[Socket.IO Auth] Valid operator page token for page ${page.id}`
          );

          // Create a temporary sysop session for operator page access
          (socket as any).session = {
            user: {
              id: "operator-page-" + page.id,
              username: "Operator (Discord)",
              secLevel: 100, // Sysop level for operator chat
            },
            nodeId: 0,
            pageId: page.id, // Attach page ID for context
          };

          return next();
        } else {
console.log(
            "[Socket.IO Auth] No operator page found for token (may be expired or invalid)"
          );
        }
      } catch (repoError) {
console.error(
          "[Socket.IO Auth] Error looking up operator page:",
          repoError
        );
      }

      // Neither JWT nor operator page token worked - provide specific error
      if (isExpired) {
        throw new Error("Session expired - please log in again");
      }
      throw new Error("Invalid authentication token");
    }
  } catch (error: any) {
console.error("[Socket.IO Auth] Authentication failed:", error.message);
    next(new Error(error.message || "Authentication failed"));
  }
}
