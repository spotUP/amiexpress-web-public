/**
 * AmiExpress Chat Room System
 * Extended feature (not in original AmiExpress)
 * Provides multi-user chat rooms for modern web implementation
 */

import { Socket } from 'socket.io';
import AsyncLock from 'async-lock';

// Chat message
export interface RoomChatMessage {
  senderId: string;
  senderName: string;
  message: string;
  timestamp: Date;
  color: number;
  isSystem?: boolean;
}

// Chat room
export interface ChatRoom {
  roomId: string;
  name: string;
  topic: string;
  created: Date;
  createdBy: string;
  isPublic: boolean;
  maxUsers: number;
  currentUsers: Map<string, RoomUser>;  // userId -> RoomUser
  messages: RoomChatMessage[];
  moderators: Set<string>;    // User IDs with mod powers
  minSecurityLevel: number;   // Minimum sec level to join
  banned: Set<string>;        // Banned user IDs
}

// User in a room
export interface RoomUser {
  userId: string;
  username: string;
  secLevel: number;
  joinedAt: Date;
  socket: Socket;
  color: number;  // User's chat color
  isModerator: boolean;
}

/**
 * Chat Room Manager
 * Manages multi-user chat rooms
 */
export class ChatRoomManager {
  private rooms: Map<string, ChatRoom>;
  private userRooms: Map<string, string>;  // userId -> roomId
  private semaphore: AsyncLock;
  private maxMessagesPerRoom: number = 100;

  // Default ANSI colors for users (cycle through these)
  private userColors: number[] = [
    32, // Green
    36, // Cyan
    33, // Yellow
    35, // Magenta
    34, // Blue
    31, // Red
    37  // White
  ];

  constructor() {
    this.rooms = new Map();
    this.userRooms = new Map();
    this.semaphore = new AsyncLock();

    // Create default lobby room
    this.createRoom('lobby', 'Lobby', 'General chat for all users', 'system', true, 50, 0);

    console.log('ChatRoom: Manager initialized with Lobby');
  }

  /**
   * Create chat room
   */
  async createRoom(
    id: string,
    name: string,
    topic: string,
    creator: string,
    isPublic: boolean,
    maxUsers: number,
    minLevel: number
  ): Promise<ChatRoom> {
    return this.semaphore.acquire('rooms', async () => {
      const room: ChatRoom = {
        roomId: id,
        name,
        topic,
        created: new Date(),
        createdBy: creator,
        isPublic,
        maxUsers,
        currentUsers: new Map(),
        messages: [],
        moderators: new Set([creator]),
        minSecurityLevel: minLevel,
        banned: new Set()
      };

      this.rooms.set(id, room);
      console.log(`ChatRoom: Created room "${name}" (${id})`);
      return room;
    });
  }

  /**
   * Delete chat room
   * Kicks all users first
   */
  async deleteRoom(roomId: string, requesterId: string): Promise<boolean> {
    return this.semaphore.acquire('rooms', async () => {
      const room = this.rooms.get(roomId);
      if (!room) return false;

      // Only creator or moderator can delete
      if (room.createdBy !== requesterId && !room.moderators.has(requesterId)) {
        return false;
      }

      // Can't delete lobby
      if (roomId === 'lobby') {
        return false;
      }

      // Kick all users
      for (const [userId, user] of room.currentUsers) {
        this.kickUser(roomId, userId, 'Room deleted', 'system');
      }

      this.rooms.delete(roomId);
      console.log(`ChatRoom: Deleted room ${roomId}`);
      return true;
    });
  }

  /**
   * Join chat room
   */
  async joinRoom(
    roomId: string,
    userId: string,
    username: string,
    secLevel: number,
    socket: Socket
  ): Promise<boolean> {
    return this.semaphore.acquire('rooms', async () => {
      const room = this.rooms.get(roomId);
      if (!room) return false;

      // Check if banned
      if (room.banned.has(userId)) {
        socket.emit('room-error', { error: 'You are banned from this room' });
        return false;
      }

      // Check security level
      if (secLevel < room.minSecurityLevel) {
        socket.emit('room-error', { error: 'Insufficient security level' });
        return false;
      }

      // Check room capacity
      if (room.currentUsers.size >= room.maxUsers) {
        socket.emit('room-error', { error: 'Room is full' });
        return false;
      }

      // Leave current room if in one
      const currentRoom = this.userRooms.get(userId);
      if (currentRoom) {
        await this.leaveRoom(currentRoom, userId);
      }

      // Assign color (cycle through available colors)
      const colorIndex = room.currentUsers.size % this.userColors.length;
      const userColor = this.userColors[colorIndex];

      // Add user to room
      const roomUser: RoomUser = {
        userId,
        username,
        secLevel,
        joinedAt: new Date(),
        socket,
        color: userColor,
        isModerator: room.moderators.has(userId)
      };

      room.currentUsers.set(userId, roomUser);
      this.userRooms.set(userId, roomId);

      console.log(`ChatRoom: ${username} joined ${room.name} (${room.currentUsers.size}/${room.maxUsers})`);

      // Send join notification
      this.broadcastSystemMessage(room, `${username} has joined the room`, 33);

      // Send room info to user
      socket.emit('room-joined', {
        roomId: room.roomId,
        name: room.name,
        topic: room.topic,
        userCount: room.currentUsers.size,
        maxUsers: room.maxUsers,
        users: Array.from(room.currentUsers.values()).map(u => ({
          username: u.username,
          isModerator: u.isModerator
        })),
        recentMessages: room.messages.slice(-50)  // Last 50 messages
      });

      return true;
    });
  }

  /**
   * Leave chat room
   */
  async leaveRoom(roomId: string, userId: string): Promise<void> {
    return this.semaphore.acquire('rooms', async () => {
      const room = this.rooms.get(roomId);
      if (!room) return;

      const user = room.currentUsers.get(userId);
      if (!user) return;

      room.currentUsers.delete(userId);
      this.userRooms.delete(userId);

      console.log(`ChatRoom: ${user.username} left ${room.name}`);

      // Broadcast leave notification
      this.broadcastSystemMessage(room, `${user.username} has left the room`, 33);

      // Notify user
      user.socket.emit('room-left', { roomId });
    });
  }

  /**
   * Send message to room
   */
  async sendToRoom(roomId: string, senderId: string, message: string): Promise<boolean> {
    return this.semaphore.acquire('rooms', async () => {
      const room = this.rooms.get(roomId);
      if (!room) return false;

      const user = room.currentUsers.get(senderId);
      if (!user) return false;

      const chatMsg: RoomChatMessage = {
        senderId,
        senderName: user.username,
        message,
        timestamp: new Date(),
        color: user.color
      };

      room.messages.push(chatMsg);

      // Keep only last N messages
      if (room.messages.length > this.maxMessagesPerRoom) {
        room.messages = room.messages.slice(-this.maxMessagesPerRoom);
      }

      // Broadcast to all users in room
      this.broadcastMessage(room, chatMsg);

      return true;
    });
  }

  /**
   * Kick user from room
   * Only moderators can kick
   */
  async kickUser(roomId: string, targetUserId: string, reason: string, kickerId: string): Promise<boolean> {
    return this.semaphore.acquire('rooms', async () => {
      const room = this.rooms.get(roomId);
      if (!room) return false;

      // Check if kicker is moderator
      if (!room.moderators.has(kickerId) && kickerId !== 'system') {
        return false;
      }

      const targetUser = room.currentUsers.get(targetUserId);
      if (!targetUser) return false;

      // Remove user
      room.currentUsers.delete(targetUserId);
      this.userRooms.delete(targetUserId);

      // Notify kicked user
      targetUser.socket.emit('room-kicked', { roomId, reason });

      // Broadcast notification
      this.broadcastSystemMessage(room, `${targetUser.username} was kicked: ${reason}`, 31);

      return true;
    });
  }

  /**
   * Ban user from room
   * Only moderators can ban
   */
  async banUser(roomId: string, targetUserId: string, reason: string, bannerId: string): Promise<boolean> {
    return this.semaphore.acquire('rooms', async () => {
      const room = this.rooms.get(roomId);
      if (!room) return false;

      // Check if banner is moderator
      if (!room.moderators.has(bannerId)) {
        return false;
      }

      room.banned.add(targetUserId);

      // Kick if currently in room
      const targetUser = room.currentUsers.get(targetUserId);
      if (targetUser) {
        await this.kickUser(roomId, targetUserId, `Banned: ${reason}`, bannerId);
      }

      return true;
    });
  }

  /**
   * Unban user from room
   */
  async unbanUser(roomId: string, targetUserId: string, moderatorId: string): Promise<boolean> {
    return this.semaphore.acquire('rooms', async () => {
      const room = this.rooms.get(roomId);
      if (!room) return false;

      // Check if moderator
      if (!room.moderators.has(moderatorId)) {
        return false;
      }

      room.banned.delete(targetUserId);
      return true;
    });
  }

  /**
   * Add moderator to room
   */
  async addModerator(roomId: string, targetUserId: string, requesterId: string): Promise<boolean> {
    return this.semaphore.acquire('rooms', async () => {
      const room = this.rooms.get(roomId);
      if (!room) return false;

      // Only creator or existing moderator can add mods
      if (room.createdBy !== requesterId && !room.moderators.has(requesterId)) {
        return false;
      }

      room.moderators.add(targetUserId);

      // Update user if in room
      const user = room.currentUsers.get(targetUserId);
      if (user) {
        user.isModerator = true;
      }

      return true;
    });
  }

  /**
   * Remove moderator from room
   */
  async removeModerator(roomId: string, targetUserId: string, requesterId: string): Promise<boolean> {
    return this.semaphore.acquire('rooms', async () => {
      const room = this.rooms.get(roomId);
      if (!room) return false;

      // Only creator can remove mods
      if (room.createdBy !== requesterId) {
        return false;
      }

      // Can't remove creator
      if (targetUserId === room.createdBy) {
        return false;
      }

      room.moderators.delete(targetUserId);

      // Update user if in room
      const user = room.currentUsers.get(targetUserId);
      if (user) {
        user.isModerator = false;
      }

      return true;
    });
  }

  /**
   * Update room topic
   */
  async updateTopic(roomId: string, newTopic: string, userId: string): Promise<boolean> {
    return this.semaphore.acquire('rooms', async () => {
      const room = this.rooms.get(roomId);
      if (!room) return false;

      // Only moderators can update topic
      if (!room.moderators.has(userId)) {
        return false;
      }

      room.topic = newTopic;

      // Broadcast topic change
      this.broadcastSystemMessage(room, `Topic changed to: ${newTopic}`, 33);

      return true;
    });
  }

  /**
   * Broadcast message to all users in room
   */
  private broadcastMessage(room: ChatRoom, message: RoomChatMessage): void {
    const formatted = this.formatRoomMessage(message);

    for (const user of room.currentUsers.values()) {
      user.socket.emit('room-message', {
        roomId: room.roomId,
        sender: message.senderName,
        message: message.message,
        color: message.color,
        timestamp: message.timestamp,
        formatted
      });
    }
  }

  /**
   * Broadcast system message to room
   */
  private broadcastSystemMessage(room: ChatRoom, message: string, color: number = 33): void {
    const chatMsg: RoomChatMessage = {
      senderId: 'system',
      senderName: 'System',
      message,
      timestamp: new Date(),
      color,
      isSystem: true
    };

    this.broadcastMessage(room, chatMsg);
  }

  /**
   * Format room message with ANSI colors
   */
  private formatRoomMessage(msg: RoomChatMessage): string {
    if (msg.isSystem) {
      return `\x1b[${msg.color}m*** ${msg.message}\x1b[0m\r\n`;
    }
    return `\x1b[${msg.color}m${msg.senderName}: ${msg.message}\x1b[0m\r\n`;
  }

  /**
   * List public rooms
   */
  async listRooms(userSecLevel: number): Promise<ChatRoom[]> {
    return this.semaphore.acquire('rooms', async () => {
      return Array.from(this.rooms.values())
        .filter(r => r.isPublic && userSecLevel >= r.minSecurityLevel)
        .map(r => ({
          ...r,
          currentUsers: new Map(),  // Don't send full user list
          messages: []  // Don't send message history
        }));
    });
  }

  /**
   * Get room info
   */
  async getRoom(roomId: string): Promise<ChatRoom | null> {
    return this.semaphore.acquire('rooms', async () => {
      const room = this.rooms.get(roomId);
      return room ? { ...room } : null;
    });
  }

  /**
   * Get user's current room
   */
  getUserRoom(userId: string): string | undefined {
    return this.userRooms.get(userId);
  }

  /**
   * Get all users in room
   */
  async getRoomUsers(roomId: string): Promise<RoomUser[]> {
    return this.semaphore.acquire('rooms', async () => {
      const room = this.rooms.get(roomId);
      if (!room) return [];

      return Array.from(room.currentUsers.values());
    });
  }
}

// Global instance (singleton pattern)
export const chatRoomManager = new ChatRoomManager();
