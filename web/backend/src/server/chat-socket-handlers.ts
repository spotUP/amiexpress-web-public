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
import { onCaller } from "./socket-guard";

/**
 * Register chat socket event handlers
 */
export function registerChatHandlers(socket: Socket, chatState: any) {
console.log(
    "[CHAT DEBUG] registerChatHandlers called for socket:",
    socket.id
  );
  // Every event here acts for a LOGGED-ON caller - a chat line under their
  // name, a room, a DM - so each is registered through onCaller
  // (server/socket-guard.ts): a visitor at the login prompt has a session but
  // no user, and used to reach every one of them.
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

  // The chat-only login is handlers/chat-only-login.handler.ts, registered on
  // the sockets that need it. A second copy here answered `chat-only-login-
  // submit` on EVERY socket: a password check for any visitor that logged
  // nobody on (open-surface audit, 2026-10-04).

  // ===== LEGACY CHAT HANDLERS (Sysop pager) =====

  // Handle special chat commands (legacy sysop chat)
  onCaller(socket, "chat-message", (_caller: BBSSession, message: string) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;
    if ((session as any).inChat) {
      sendChatMessage(socket, session, message);
    }
  });

  // Handle sysop accepting chat request (legacy)
  onCaller(socket, "accept-chat", (_caller: BBSSession, sessionId: string) => {
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

  onCaller(socket, "chat:request", async (_caller: BBSSession, data: { targetUsername: string }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const {
      handleChatRequest,
    } = require("../handlers/chat/internode-chat.handler");
    await handleChatRequest(socket, session, data);
  });

  onCaller(socket, "chat:accept", async (_caller: BBSSession, data: { sessionId: string }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const {
      handleChatAccept,
    } = require("../handlers/chat/internode-chat.handler");
    await handleChatAccept(socket, session, data);
  });

  onCaller(socket, "chat:decline", async (_caller: BBSSession, data: { sessionId: string }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const {
      handleChatDecline,
    } = require("../handlers/chat/internode-chat.handler");
    await handleChatDecline(socket, session, data);
  });

  onCaller(socket,
    "chat:message",
    async (_caller: BBSSession, data: { message?: string; content?: string; room?: string }) => {
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

  onCaller(socket, "chat:end", async (_caller: BBSSession) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const {
      handleChatEnd,
    } = require("../handlers/chat/internode-chat.handler");
    await handleChatEnd(socket, session);
  });

  // ===== GROUP CHAT ROOM EVENTS (Multi-User) =====

  onCaller(socket,
    "room:create",
    async (_caller: BBSSession, data: {
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

  onCaller(socket,
    "room:join",
    async (_caller: BBSSession, data: {
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

  onCaller(socket, "room:leave", async (_caller: BBSSession) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const { handleRoomLeave } = require("../handlers/chat/group-chat.handler");
    await handleRoomLeave(socket, session);
  });

  onCaller(socket, "room:message", async (_caller: BBSSession, data: { message: string }) => {
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

  onCaller(socket, "room:list", async (_caller: BBSSession, data?: { showPrivate?: boolean }) => {
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

  onCaller(socket, "room:kick", async (_caller: BBSSession, data: { targetUsername: string }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const { handleRoomKick } = require("../handlers/chat/group-chat.handler");
    await handleRoomKick(socket, session, data);
  });

  onCaller(socket,
    "room:mute",
    async (_caller: BBSSession, data: { targetUsername: string; mute: boolean }) => {
      const session = getSessionBySocketId(socket.id);
      if (!session) return;

      const { handleRoomMute } = require("../handlers/chat/group-chat.handler");
      await handleRoomMute(socket, session, data);
    }
  );

  onCaller(socket, "room:motd", async (_caller: BBSSession, data: { motd: string | null }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;
    const { handleSetRoomMotd } = require("../handlers/chat/room-motd.handler");
    const ioServer = (socket as any).nsp?.server;
    await handleSetRoomMotd({ io: ioServer, socket, session, data });
  });

  onCaller(socket, "room:invite", async (_caller: BBSSession, data: { roomName?: string; roomId?: string; targetUsername: string }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;
    const { handleRoomInvite } = require("../handlers/chat/room-invite.handler");
    const ioServer = (socket as any).nsp?.server;
    await handleRoomInvite({ io: ioServer, socket, session, data });
  });

  onCaller(socket, "room:revoke-invite", async (_caller: BBSSession, data: { roomName?: string; roomId?: string; targetUsername: string }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;
    const { handleRoomInvite } = require("../handlers/chat/room-invite.handler");
    const ioServer = (socket as any).nsp?.server;
    await handleRoomInvite({ io: ioServer, socket, session, data, revoke: true });
  });

  onCaller(socket, "room:mode", async (_caller: BBSSession, data: { modeString: string; params: string[]; roomId?: string }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;
    const { handleRoomMode } = require("../handlers/chat/mode.handler");
    const ioServer = (socket as any).nsp?.server;
    await handleRoomMode({ io: ioServer, socket, session, data });
  });

  // ===== DIRECT MESSAGES =====
  onCaller(socket, "chat:dm", async (_caller: BBSSession, data: { to: string; message: string }) => {
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

  // ===== GROUP DIRECT MESSAGES =====
  onCaller(socket, "chat:group-dm", async (_caller: BBSSession, data: { participants: string[]; message: string }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;
    const ioServer = (socket as any).nsp?.server;
    if (!ioServer) return;
    const { handleChatGroupDm } = require("../handlers/chat/dm.handler");
    const lookupRecipient = async (uname: string) => {
      const user = await db.getUserByUsername(uname);
      if (!user) return null;
      const targetSocketId = getSocketIdByUserId(String(user.id));
      return { userId: String(user.id), socketId: targetSocketId };
    };
    await handleChatGroupDm({ io: ioServer, socket, session, data, resolveRecipient: lookupRecipient });
  });

  onCaller(socket, "chat:dm-history", async (_caller: BBSSession, data: { threadId: string; limit?: number }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;
    const { handleChatDmHistory } = require("../handlers/chat/dm.handler");
    await handleChatDmHistory(socket, session, data);
  });

  // Sidebar DM thread list: door requests; backend returns display-ready
  // payloads. Also emitted automatically after every DM send (see
  // dm.handler) so all sidebars stay in sync without polling.
  onCaller(socket, "chat:dm-threads:list", async (_caller: BBSSession) => {
    const session = getSessionBySocketId(socket.id);
    if (!session?.user?.id) return;
    const {
      getDmThreadList,
    } = require("../handlers/chat/dm-thread-list.handler");
    try {
      const threads = await getDmThreadList(String(session.user.id));
      socket.emit("chat:dm-threads", { threads });
    } catch (error) {
      console.error("[CHAT] chat:dm-threads:list error:", error);
    }
  });

  // ===== LIVE TYPING PREVIEW (Keystroke relaying) =====

  onCaller(socket,
    "chat:keystroke",
    (_caller: BBSSession, data: { channelId: string; userId: number; char: string }) => {
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

  onCaller(socket,
    "chat:keystroke-submit",
    (_caller: BBSSession, data: { channelId: string; userId: number }) => {
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

  onCaller(socket,
    "chat:keystroke-clear",
    (_caller: BBSSession, data: { channelId: string; userId: number }) => {
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
