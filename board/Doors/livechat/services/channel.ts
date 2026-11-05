import type { Channel, ChannelMember } from '../types';

/** Channel state manager */
export class ChannelService {
  private channels = new Map<string, Channel>();
  private current: string | null = null;

  /** Set available channels */
  setChannels(list: Channel[]): void {
    this.channels.clear();
    for (const ch of list) {
      this.channels.set(ch.id, ch);
    }
  }

  /** Get all channels */
  getAll(): Channel[] {
    return Array.from(this.channels.values());
  }

  /** Get channel by ID */
  get(id: string): Channel | undefined {
    return this.channels.get(id);
  }

  /** Set current channel */
  setCurrent(id: string): boolean {
    if (this.channels.has(id)) {
      this.current = id;
      return true;
    }
    return false;
  }

  /** Get current channel */
  getCurrent(): Channel | null {
    return this.current ? this.channels.get(this.current) || null : null;
  }

  /** Update member list for channel */
  setMembers(channelId: string, members: ChannelMember[]): void {
    const ch = this.channels.get(channelId);
    if (ch) ch.members = members;
  }
}
