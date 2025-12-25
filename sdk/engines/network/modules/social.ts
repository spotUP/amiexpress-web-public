/**
 * Social Features Module
 *
 * Friends, invites, parties, and voice chat with:
 * - Friend list management
 * - Friend requests and blocking
 * - Game invites
 * - Party system for group play
 * - Voice chat via WebRTC
 */

import { EventEmitter } from 'events';
import type {
  Friend,
  FriendRequest,
  BlockedPlayer,
  Party,
  PartyMember,
  PartyInvite,
  GameInvite,
  VoiceChatConfig,
  VoiceChannel,
  VoiceParticipant,
  PlayerPresence,
  ISocialManager,
} from '../types';
import type { ConnectionManager } from './connection';

// Default voice chat configuration
const DEFAULT_VOICE_CONFIG: VoiceChatConfig = {
  enabled: true,
  inputVolume: 1.0,
  outputVolume: 1.0,
  pushToTalk: false,
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
};

/**
 * Social Manager
 *
 * Manages friends, parties, invites, and voice chat.
 */
export class SocialManager extends EventEmitter implements ISocialManager {
  readonly name = 'social';

  private connection: ConnectionManager;
  private _friends: Friend[] = [];
  private _blocked: BlockedPlayer[] = [];
  private _party: Party | null = null;
  private _voiceChannel: VoiceChannel | null = null;
  private voiceConfig: VoiceChatConfig;
  private pendingRequests: FriendRequest[] = [];
  private pendingInvites: (PartyInvite | GameInvite)[] = [];

  // WebRTC
  private peerConnections: Map<number, RTCPeerConnection> = new Map();
  private localStream: MediaStream | null = null;

  constructor(connection: ConnectionManager) {
    super();
    this.connection = connection;
    this.voiceConfig = { ...DEFAULT_VOICE_CONFIG };
    this.setupEventHandlers();
  }

  /**
   * Get friends list
   */
  get friends(): Friend[] {
    return [...this._friends];
  }

  /**
   * Get blocked list
   */
  get blocked(): BlockedPlayer[] {
    return [...this._blocked];
  }

  /**
   * Get current party
   */
  get party(): Party | null {
    return this._party;
  }

  /**
   * Initialize social manager
   */
  async init(): Promise<void> {
    await this.loadFriends();
    await this.loadBlocked();
  }

  /**
   * Setup socket event handlers
   */
  private setupEventHandlers(): void {
    const socket = this.connection.getSocket();
    if (!socket) return;

    // Friend events
    socket.on('friend:request', (request: FriendRequest) => {
      this.pendingRequests.push(request);
      this.emit('friend:request', request);
    });

    socket.on('friend:added', (friend: Friend) => {
      this._friends.push(friend);
      this.emit('friend:added', friend);
    });

    socket.on('friend:removed', (playerId: number) => {
      this._friends = this._friends.filter(f => f.playerId !== playerId);
      this.emit('friend:removed', playerId);
    });

    socket.on('friend:presence', (data: { playerId: number; presence: PlayerPresence }) => {
      const friend = this._friends.find(f => f.playerId === data.playerId);
      if (friend) {
        friend.presence = data.presence;
        this.emit('friend:presence', friend);
      }
    });

    // Party events
    socket.on('party:created', (party: Party) => {
      this._party = party;
      this.emit('party:created', party);
    });

    socket.on('party:updated', (party: Party) => {
      this._party = party;
      this.emit('party:updated', party);
    });

    socket.on('party:disbanded', () => {
      this._party = null;
      this.emit('party:disbanded');
    });

    socket.on('party:invite', (invite: PartyInvite) => {
      this.pendingInvites.push(invite);
      this.emit('party:invite', invite);
    });

    socket.on('party:member_joined', (member: PartyMember) => {
      if (this._party) {
        this._party.members.push(member);
        this.emit('party:member_joined', member);
      }
    });

    socket.on('party:member_left', (playerId: number) => {
      if (this._party) {
        this._party.members = this._party.members.filter(m => m.playerId !== playerId);
        this.emit('party:member_left', playerId);
      }
    });

    // Game invite events
    socket.on('game:invite', (invite: GameInvite) => {
      this.pendingInvites.push(invite);
      this.emit('game:invite', invite);
    });

    // Voice events
    socket.on('voice:joined', (channel: VoiceChannel) => {
      this._voiceChannel = channel;
      this.emit('voice:joined', channel);
    });

    socket.on('voice:left', () => {
      this._voiceChannel = null;
      this.emit('voice:left');
    });

    socket.on('voice:participant_joined', (participant: VoiceParticipant) => {
      if (this._voiceChannel) {
        this._voiceChannel.participants.push(participant);
        this.emit('voice:participant_joined', participant);
        this.setupPeerConnection(participant.playerId);
      }
    });

    socket.on('voice:participant_left', (playerId: number) => {
      if (this._voiceChannel) {
        this._voiceChannel.participants = this._voiceChannel.participants.filter(
          p => p.playerId !== playerId
        );
        this.emit('voice:participant_left', playerId);
        this.closePeerConnection(playerId);
      }
    });

    socket.on('voice:speaking', (data: { playerId: number; speaking: boolean }) => {
      this.emit('voice:speaking', data.playerId, data.speaking);
    });

    // WebRTC signaling
    socket.on('voice:offer', async (data: { from: number; offer: RTCSessionDescriptionInit }) => {
      await this.handleVoiceOffer(data.from, data.offer);
    });

    socket.on('voice:answer', async (data: { from: number; answer: RTCSessionDescriptionInit }) => {
      await this.handleVoiceAnswer(data.from, data.answer);
    });

    socket.on('voice:ice', async (data: { from: number; candidate: RTCIceCandidateInit }) => {
      await this.handleIceCandidate(data.from, data.candidate);
    });
  }

  /**
   * Load friends list from server
   */
  private async loadFriends(): Promise<void> {
    return new Promise((resolve) => {
      const socket = this.connection.getSocket();
      if (!socket?.connected) {
        resolve();
        return;
      }

      socket.emit('social:get_friends', {}, (response: { success: boolean; friends?: Friend[] }) => {
        if (response.success && response.friends) {
          this._friends = response.friends;
        }
        resolve();
      });
    });
  }

  /**
   * Load blocked list from server
   */
  private async loadBlocked(): Promise<void> {
    return new Promise((resolve) => {
      const socket = this.connection.getSocket();
      if (!socket?.connected) {
        resolve();
        return;
      }

      socket.emit('social:get_blocked', {}, (response: { success: boolean; blocked?: BlockedPlayer[] }) => {
        if (response.success && response.blocked) {
          this._blocked = response.blocked;
        }
        resolve();
      });
    });
  }

  /**
   * Send friend request
   */
  async addFriend(playerId: number, message?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = this.connection.getSocket();
      if (!socket?.connected) {
        reject(new Error('Not connected'));
        return;
      }

      socket.emit('social:add_friend', { playerId, message }, (response: { success: boolean; error?: string }) => {
        if (response.success) {
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to send friend request'));
        }
      });
    });
  }

  /**
   * Remove friend
   */
  async removeFriend(playerId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = this.connection.getSocket();
      if (!socket?.connected) {
        reject(new Error('Not connected'));
        return;
      }

      socket.emit('social:remove_friend', { playerId }, (response: { success: boolean; error?: string }) => {
        if (response.success) {
          this._friends = this._friends.filter(f => f.playerId !== playerId);
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to remove friend'));
        }
      });
    });
  }

  /**
   * Accept friend request
   */
  async acceptFriendRequest(requestId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = this.connection.getSocket();
      if (!socket?.connected) {
        reject(new Error('Not connected'));
        return;
      }

      socket.emit('social:accept_friend', { requestId }, (response: { success: boolean; friend?: Friend; error?: string }) => {
        if (response.success && response.friend) {
          this._friends.push(response.friend);
          this.pendingRequests = this.pendingRequests.filter(r => r.id !== requestId);
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to accept friend request'));
        }
      });
    });
  }

  /**
   * Decline friend request
   */
  async declineFriendRequest(requestId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = this.connection.getSocket();
      if (!socket?.connected) {
        reject(new Error('Not connected'));
        return;
      }

      socket.emit('social:decline_friend', { requestId }, (response: { success: boolean; error?: string }) => {
        if (response.success) {
          this.pendingRequests = this.pendingRequests.filter(r => r.id !== requestId);
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to decline friend request'));
        }
      });
    });
  }

  /**
   * Block player
   */
  async blockPlayer(playerId: number, reason?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = this.connection.getSocket();
      if (!socket?.connected) {
        reject(new Error('Not connected'));
        return;
      }

      socket.emit('social:block', { playerId, reason }, (response: { success: boolean; error?: string }) => {
        if (response.success) {
          this._friends = this._friends.filter(f => f.playerId !== playerId);
          this._blocked.push({
            playerId,
            username: '',
            blockedAt: new Date(),
            reason,
          });
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to block player'));
        }
      });
    });
  }

  /**
   * Unblock player
   */
  async unblockPlayer(playerId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = this.connection.getSocket();
      if (!socket?.connected) {
        reject(new Error('Not connected'));
        return;
      }

      socket.emit('social:unblock', { playerId }, (response: { success: boolean; error?: string }) => {
        if (response.success) {
          this._blocked = this._blocked.filter(b => b.playerId !== playerId);
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to unblock player'));
        }
      });
    });
  }

  /**
   * Create party
   */
  async createParty(): Promise<Party> {
    return new Promise((resolve, reject) => {
      const socket = this.connection.getSocket();
      if (!socket?.connected) {
        reject(new Error('Not connected'));
        return;
      }

      socket.emit('party:create', {}, (response: { success: boolean; party?: Party; error?: string }) => {
        if (response.success && response.party) {
          this._party = response.party;
          resolve(response.party);
        } else {
          reject(new Error(response.error || 'Failed to create party'));
        }
      });
    });
  }

  /**
   * Join party
   */
  async joinParty(partyId: string): Promise<Party> {
    return new Promise((resolve, reject) => {
      const socket = this.connection.getSocket();
      if (!socket?.connected) {
        reject(new Error('Not connected'));
        return;
      }

      socket.emit('party:join', { partyId }, (response: { success: boolean; party?: Party; error?: string }) => {
        if (response.success && response.party) {
          this._party = response.party;
          resolve(response.party);
        } else {
          reject(new Error(response.error || 'Failed to join party'));
        }
      });
    });
  }

  /**
   * Leave party
   */
  leaveParty(): void {
    if (!this._party) return;

    const socket = this.connection.getSocket();
    if (socket?.connected) {
      socket.emit('party:leave');
    }

    this._party = null;
    this.emit('party:left');
  }

  /**
   * Invite player to party
   */
  async inviteToParty(playerId: number): Promise<void> {
    if (!this._party) {
      throw new Error('Not in a party');
    }

    return new Promise((resolve, reject) => {
      const socket = this.connection.getSocket();
      if (!socket?.connected) {
        reject(new Error('Not connected'));
        return;
      }

      socket.emit('party:invite', { playerId }, (response: { success: boolean; error?: string }) => {
        if (response.success) {
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to invite to party'));
        }
      });
    });
  }

  /**
   * Invite player to game
   */
  async inviteToGame(playerId: number, roomId: string, message?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = this.connection.getSocket();
      if (!socket?.connected) {
        reject(new Error('Not connected'));
        return;
      }

      socket.emit('game:invite', { playerId, roomId, message }, (response: { success: boolean; error?: string }) => {
        if (response.success) {
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to send game invite'));
        }
      });
    });
  }

  /**
   * Get pending friend requests
   */
  getPendingFriendRequests(): FriendRequest[] {
    return [...this.pendingRequests];
  }

  /**
   * Get pending invites
   */
  getPendingInvites(): (PartyInvite | GameInvite)[] {
    return [...this.pendingInvites];
  }

  /**
   * Start voice chat
   */
  async startVoice(channelId: string): Promise<void> {
    if (!this.voiceConfig.enabled) {
      throw new Error('Voice chat is disabled');
    }

    try {
      // Get local audio stream
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: this.voiceConfig.echoCancellation,
          noiseSuppression: this.voiceConfig.noiseSuppression,
          autoGainControl: this.voiceConfig.autoGainControl,
        },
      });

      const socket = this.connection.getSocket();
      if (socket?.connected) {
        socket.emit('voice:join', { channelId });
      }
    } catch (error) {
      throw new Error(`Failed to access microphone: ${error}`);
    }
  }

  /**
   * Stop voice chat
   */
  stopVoice(): void {
    // Close all peer connections
    for (const pc of this.peerConnections.values()) {
      pc.close();
    }
    this.peerConnections.clear();

    // Stop local stream
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop();
      }
      this.localStream = null;
    }

    const socket = this.connection.getSocket();
    if (socket?.connected) {
      socket.emit('voice:leave');
    }

    this._voiceChannel = null;
  }

  /**
   * Set voice settings
   */
  setVoiceSettings(config: Partial<VoiceChatConfig>): void {
    this.voiceConfig = { ...this.voiceConfig, ...config };
  }

  /**
   * Mute/unmute self
   */
  setMuted(muted: boolean): void {
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        track.enabled = !muted;
      }
    }

    const socket = this.connection.getSocket();
    if (socket?.connected) {
      socket.emit('voice:mute', { muted });
    }
  }

  /**
   * Deafen/undeafen self
   */
  setDeafened(deafened: boolean): void {
    // Mute all incoming audio
    for (const pc of this.peerConnections.values()) {
      const receivers = pc.getReceivers();
      for (const receiver of receivers) {
        if (receiver.track) {
          receiver.track.enabled = !deafened;
        }
      }
    }

    const socket = this.connection.getSocket();
    if (socket?.connected) {
      socket.emit('voice:deafen', { deafened });
    }
  }

  /**
   * Setup WebRTC peer connection
   */
  private async setupPeerConnection(playerId: number): Promise<void> {
    if (this.peerConnections.has(playerId)) return;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    this.peerConnections.set(playerId, pc);

    // Add local stream tracks
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const socket = this.connection.getSocket();
        if (socket?.connected) {
          socket.emit('voice:ice', { to: playerId, candidate: event.candidate });
        }
      }
    };

    // Handle incoming tracks
    pc.ontrack = (event) => {
      const audio = new Audio();
      audio.srcObject = event.streams[0];
      audio.play();
    };

    // Create and send offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const socket = this.connection.getSocket();
    if (socket?.connected) {
      socket.emit('voice:offer', { to: playerId, offer });
    }
  }

  /**
   * Handle incoming voice offer
   */
  private async handleVoiceOffer(from: number, offer: RTCSessionDescriptionInit): Promise<void> {
    let pc = this.peerConnections.get(from);

    if (!pc) {
      pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      this.peerConnections.set(from, pc);

      if (this.localStream) {
        for (const track of this.localStream.getTracks()) {
          pc.addTrack(track, this.localStream);
        }
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const socket = this.connection.getSocket();
          if (socket?.connected) {
            socket.emit('voice:ice', { to: from, candidate: event.candidate });
          }
        }
      };

      pc.ontrack = (event) => {
        const audio = new Audio();
        audio.srcObject = event.streams[0];
        audio.play();
      };
    }

    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    const socket = this.connection.getSocket();
    if (socket?.connected) {
      socket.emit('voice:answer', { to: from, answer });
    }
  }

  /**
   * Handle incoming voice answer
   */
  private async handleVoiceAnswer(from: number, answer: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.peerConnections.get(from);
    if (pc) {
      await pc.setRemoteDescription(answer);
    }
  }

  /**
   * Handle ICE candidate
   */
  private async handleIceCandidate(from: number, candidate: RTCIceCandidateInit): Promise<void> {
    const pc = this.peerConnections.get(from);
    if (pc) {
      await pc.addIceCandidate(candidate);
    }
  }

  /**
   * Close peer connection
   */
  private closePeerConnection(playerId: number): void {
    const pc = this.peerConnections.get(playerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(playerId);
    }
  }

  /**
   * Dispose of social manager
   */
  dispose(): void {
    this.stopVoice();
    this.leaveParty();
    this._friends = [];
    this._blocked = [];
    this.pendingRequests = [];
    this.pendingInvites = [];
    this.removeAllListeners();
  }
}

export default SocialManager;
