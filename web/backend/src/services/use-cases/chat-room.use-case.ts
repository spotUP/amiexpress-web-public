/**
 * Chat Room Use Case
 *
 * Clean Architecture: Business logic for chat room operations
 * Isolates chat room logic from handlers and database
 */

import { injectable, inject } from 'tsyringe';
import { DI_TOKENS } from '../../container';

export interface RoomMember {
  username: string;
  is_moderator: boolean;
  is_muted: boolean;
}

@injectable()
export class ChatRoomUseCase {
  constructor(
    @inject(DI_TOKENS.Database) private db: any
  ) {}

  /**
   * Get all members in a chat room
   */
  async getRoomMembers(roomId: string): Promise<RoomMember[]> {
    try {
      const members = await this.db.getRoomMembers(roomId);
      return members || [];
    } catch (error) {
      console.error('[ChatRoomUseCase] Error getting room members:', error);
      return [];
    }
  }

  /**
   * Get room member count
   */
  async getRoomMemberCount(roomId: string): Promise<number> {
    const members = await this.getRoomMembers(roomId);
    return members.length;
  }

  /**
   * Check if user is room moderator
   */
  async isUserModerator(roomId: string, username: string): Promise<boolean> {
    const members = await this.getRoomMembers(roomId);
    const member = members.find(m => m.username === username);
    return member?.is_moderator || false;
  }

  /**
   * Check if user is muted in room
   */
  async isUserMuted(roomId: string, username: string): Promise<boolean> {
    const members = await this.getRoomMembers(roomId);
    const member = members.find(m => m.username === username);
    return member?.is_muted || false;
  }

  /**
   * Format room members list for display
   */
  formatMembersList(members: RoomMember[]): string {
    let output = `\r\n\x1b[36mUsers in room (${members.length}):\x1b[0m\r\n`;

    for (const member of members) {
      const modBadge = member.is_moderator ? ' \x1b[33m[MOD]\x1b[0m' : '';
      const muteBadge = member.is_muted ? ' \x1b[31m[MUTED]\x1b[0m' : '';
      output += `  ${member.username}${modBadge}${muteBadge}\r\n`;
    }

    output += '\r\n';
    return output;
  }
}
