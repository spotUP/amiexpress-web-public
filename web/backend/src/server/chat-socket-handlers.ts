/**
 * Chat Socket Event Handlers
 * Handles internode (user-to-user) and room (multi-user) chat events
 */

import { Socket } from "socket.io";
import { BBSSession } from "../index";
import { LoggedOnSubState } from "../constants/bbs-states";
import { db } from "../database";
import { getSessionBySocketId, getSocketIdByUserId } from "./session-manager";
import { sendChatMessage, acceptChat } from "../handlers/chat/chat.handler";

/**
 * Register chat socket event handlers
 */
export function registerChatHandlers(socket: Socket, chatState: any) {
console.log(
    "[CHAT DEBUG] registerChatHandlers called for socket:",
    socket.id
  );
  // NOTE: Don't return early if no session - handlers check session themselves
  // The session may not exist when handlers are registered but will exist when called

  // Debug: Log ALL events on this socket
  socket.onAny((eventName, ...args) => {
    if (
      eventName.startsWith("room:") ||
      eventName.startsWith("chat:") ||
      eventName.startsWith("chat-only")
    ) {
console.log(
        "[CHAT DEBUG] Socket received event:",
        eventName,
        JSON.stringify(args)
      );
    }
  });

console.log(
    "[CHAT DEBUG] Registering chat-only-login-submit handler for socket:",
    socket.id
  );

  // ===== CHAT-ONLY LOGIN HANDLER =====

  socket.on(
    "chat-only-login-submit",
    async (credentials: { username: string; password: string }) => {
console.log(
        "[CHAT-ONLY-LOGIN] Received login attempt for:",
        credentials.username
      );

      try {
        // Find user by username (case-insensitive)
        const user = await db.getUserByUsername(credentials.username);

        if (!user) {
console.log(
            "[CHAT-ONLY-LOGIN] User not found:",
            credentials.username
          );
          socket.emit("chat-only-login-error", "Invalid username or password");
          return;
        }

        // Verify password using db's verifyPassword method
        const passwordValid = await db.verifyPassword(
          credentials.password,
          user.passwordHash
        );

        if (!passwordValid) {
console.log(
            "[CHAT-ONLY-LOGIN] Invalid password for user:",
            credentials.username
          );
          socket.emit("chat-only-login-error", "Invalid username or password");
          return;
        }

        // Success - send user data back
console.log(
          "[CHAT-ONLY-LOGIN] Login successful for:",
          credentials.username
        );
        socket.emit("chat-only-login-success", {
          username: user.username,
          secLevel: user.secLevel,
          id: user.id,
        });
      } catch (error) {
console.error("[CHAT-ONLY-LOGIN] Error during login:", error);
        socket.emit("chat-only-login-error", "Login failed - server error");
      }
    }
  );

  // ===== LEGACY CHAT HANDLERS (Sysop pager) =====

  // Handle special chat commands (legacy sysop chat)
  socket.on("chat-message", (message: string) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;
    if ((session as any).inChat) {
      sendChatMessage(socket, session, message);
    }
  });

  // Handle sysop accepting chat request (legacy)
  socket.on("accept-chat", (sessionId: string) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;
    // Sysop accepting chat request
    const chatSession = chatState.activeSessions.find(
      (s: any) => s.id === sessionId
    );
    if (chatSession && session.user?.secLevel === 255) {
      // Sysop level
      acceptChat(socket, session, chatSession);
    }
  });

  // ===== INTERNODE CHAT EVENTS (User-to-User) =====

  socket.on("chat:request", async (data: { targetUsername: string }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const {
      handleChatRequest,
    } = require("../handlers/chat/internode-chat.handler");
    await handleChatRequest(socket, session, data);
  });

  socket.on("chat:accept", async (data: { sessionId: string }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const {
      handleChatAccept,
    } = require("../handlers/chat/internode-chat.handler");
    await handleChatAccept(socket, session, data);
  });

  socket.on("chat:decline", async (data: { sessionId: string }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const {
      handleChatDecline,
    } = require("../handlers/chat/internode-chat.handler");
    await handleChatDecline(socket, session, data);
  });

  socket.on(
    "chat:message",
    async (data: { message?: string; content?: string; room?: string }) => {
console.log("📨 [SOCKET.IO] Received chat:message event from client");
console.log("📨 [SOCKET.IO] Data:", data);
console.log("📨 [SOCKET.IO] Socket ID:", socket.id);
      const session = getSessionBySocketId(socket.id);
      if (!session) {
console.log("❌ [SOCKET.IO] No session found for socket:", socket.id);
        return;
      }
console.log(
        "📨 [SOCKET.IO] Session found, user:",
        session.user?.username
      );

      // Check if this is a room message (has room property or content instead of message)
      if (data.room || data.content || session.currentRoomId) {
        // Route to group chat handler
        const {
          handleRoomMessage,
        } = require("../handlers/chat/group-chat.handler");
        const roomData = {
          message: data.content || data.message || "",
        };
console.log("📨 [SOCKET.IO] Routing to handleRoomMessage:", roomData);
        await handleRoomMessage(socket, session, roomData);
      } else {
        // Route to internode chat handler (1:1 BBS chat)
        const {
          handleChatMessage,
        } = require("../handlers/chat/internode-chat.handler");
        await handleChatMessage(socket, session, data);
      }
console.log("📨 [SOCKET.IO] chat:message completed");
    }
  );

  socket.on("chat:end", async () => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const {
      handleChatEnd,
    } = require("../handlers/chat/internode-chat.handler");
    await handleChatEnd(socket, session);
  });

  // ===== GROUP CHAT ROOM EVENTS (Multi-User) =====

  socket.on(
    "room:create",
    async (data: {
      roomName: string;
      topic?: string;
      isPublic?: boolean;
      password?: string;
      maxUsers?: number;
    }) => {
      const session = getSessionBySocketId(socket.id);
      if (!session) return;

      const {
        handleRoomCreate,
      } = require("../handlers/chat/group-chat.handler");
      await handleRoomCreate(socket, session, data);
    }
  );

  socket.on(
    "room:join",
    async (data: {
      roomId?: string;
      roomName?: string;
      room?: string;
      password?: string;
    }) => {
console.log("[CHAT DEBUG] room:join received:", data);
      const session = getSessionBySocketId(socket.id);
      if (!session) {
console.log("[CHAT DEBUG] No session found for socket:", socket.id);
        return;
      }
console.log(
        "[CHAT DEBUG] Session found - userId:",
        session.user?.id,
        "username:",
        session.user?.username,
        "currentRoomId:",
        session.currentRoomId
      );

      // Normalize: accept room, roomId, or roomName
      const normalizedData = {
        roomId: data.roomId || data.room,
        roomName: data.roomName || data.room,
        password: data.password,
      };
console.log("[CHAT DEBUG] Normalized room:join data:", normalizedData);

      const { handleRoomJoin } = require("../handlers/chat/group-chat.handler");
      await handleRoomJoin(socket, session, normalizedData);
    }
  );

  socket.on("room:leave", async () => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const { handleRoomLeave } = require("../handlers/chat/group-chat.handler");
    await handleRoomLeave(socket, session);
  });

  socket.on("room:message", async (data: { message: string }) => {
console.log("[CHAT DEBUG] room:message received:", data);
    const session = getSessionBySocketId(socket.id);
    if (!session) {
console.log("[CHAT DEBUG] No session for room:message");
      return;
    }
console.log(
      "[CHAT DEBUG] Message from:",
      session.user?.username,
      "in room:",
      session.currentRoomId
    );

    const {
      handleRoomMessage,
    } = require("../handlers/chat/group-chat.handler");
    await handleRoomMessage(socket, session, data);
  });

  socket.on("room:list", async (data?: { showPrivate?: boolean }) => {
console.log("[CHAT DEBUG] room:list event received for socket:", socket.id);
    const session = getSessionBySocketId(socket.id);
console.log(
      "[CHAT DEBUG] room:list session lookup result:",
      session
        ? `found (user: ${session.user?.username}, nodeId: ${session.nodeId})`
        : "NOT FOUND"
    );
    if (!session) {
console.log("[CHAT DEBUG] room:list returning early - no session");
      return;
    }

    const { handleRoomList } = require("../handlers/chat/group-chat.handler");
    await handleRoomList(socket, session, data);
  });

  socket.on("room:kick", async (data: { targetUsername: string }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const { handleRoomKick } = require("../handlers/chat/group-chat.handler");
    await handleRoomKick(socket, session, data);
  });

  socket.on(
    "room:mute",
    async (data: { targetUsername: string; mute: boolean }) => {
      const session = getSessionBySocketId(socket.id);
      if (!session) return;

      const { handleRoomMute } = require("../handlers/chat/group-chat.handler");
      await handleRoomMute(socket, session, data);
    }
  );

  socket.on("room:motd", async (data: { motd: string | null }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;
    const { handleSetRoomMotd } = require("../handlers/chat/room-motd.handler");
    const ioServer = (socket as any).nsp?.server;
    await handleSetRoomMotd({ io: ioServer, socket, session, data });
  });

  socket.on("room:invite", async (data: { roomName?: string; roomId?: string; targetUsername: string }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;
    const { handleRoomInvite } = require("../handlers/chat/room-invite.handler");
    const ioServer = (socket as any).nsp?.server;
    await handleRoomInvite({ io: ioServer, socket, session, data });
  });

  socket.on("room:revoke-invite", async (data: { roomName?: string; roomId?: string; targetUsername: string }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;
    const { handleRoomInvite } = require("../handlers/chat/room-invite.handler");
    const ioServer = (socket as any).nsp?.server;
    await handleRoomInvite({ io: ioServer, socket, session, data, revoke: true });
  });

  // ===== DIRECT MESSAGES =====
  socket.on("chat:dm", async (data: { to: string; message: string }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;
    const io = (socket as any).nsp?.server;
    if (!io) return;
    const { handleChatDm } = require("../handlers/chat/dm.handler");
    // O(1) reverse lookup via session-manager's socketToUser map.
    // Avoids iterating every socket in the io namespace on every DM.
    const lookupRecipient = async (uname: string) => {
      const user = await db.getUserByUsername(uname);
      if (!user) return null;
      const userId = String(user.id);
      const socketId = getSocketIdByUserId(userId); // null if offline
      return { userId, socketId };
    };
    await handleChatDm({ io, socket, session, data, resolveRecipient: lookupRecipient });
  });

  socket.on("chat:dm-history", async (data: { threadId: string; limit?: number }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;
    const { handleChatDmHistory } = require("../handlers/chat/dm.handler");
    await handleChatDmHistory(socket, session, data);
  });

  // ===== LIVE TYPING PREVIEW (Keystroke relaying) =====

  socket.on(
    "chat:keystroke",
    (data: { channelId: string; userId: number; char: string }) => {
console.log(
        "[BACKEND] Received chat:keystroke:",
        data,
        "socketId:",
        socket.id
      );
      const session = getSessionBySocketId(socket.id);
console.log(
        "[BACKEND] Session found:",
        !!session,
        "currentRoomId:",
        session?.currentRoomId
      );
      if (!session || !session.currentRoomId) {
console.log("[BACKEND] Skipping keystroke - no session or room");
        return;
      }

      // Broadcast keystroke to other users in the same room (not back to sender)
      const socketRoom = "room:" + session.currentRoomId;
console.log("[BACKEND] Broadcasting to room:", socketRoom);
      socket.to(socketRoom).emit("chat:keystroke", {
        channelId: session.currentRoomId,
        userId: data.userId,
        username: session.user?.username,
        char: data.char,
      });
    }
  );

  socket.on(
    "chat:keystroke-submit",
    (data: { channelId: string; userId: number }) => {
      const session = getSessionBySocketId(socket.id);
      if (!session || !session.currentRoomId) return;

      // Notify other users that this user submitted their message (stopped typing)
      const socketRoom = "room:" + session.currentRoomId;
      socket.to(socketRoom).emit("chat:keystroke-submit", {
        channelId: session.currentRoomId,
        userId: data.userId,
        username: session.user?.username,
      });
    }
  );

  socket.on(
    "chat:keystroke-clear",
    (data: { channelId: string; userId: number }) => {
      const session = getSessionBySocketId(socket.id);
      if (!session || !session.currentRoomId) return;

      // Notify other users that this user cleared their input
      const socketRoom = "room:" + session.currentRoomId;
      socket.to(socketRoom).emit("chat:keystroke-clear", {
        channelId: session.currentRoomId,
        userId: data.userId,
        username: session.user?.username,
      });
    }
  );
}
