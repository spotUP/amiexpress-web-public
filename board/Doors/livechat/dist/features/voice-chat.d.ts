/**
 * Voice/Video Chat Feature
 *
 * Discord-style voice channels with video support
 * - Join/leave voice channels
 * - Grid view of participants
 * - Video tiles with ASCII video streams
 * - Voice activity indicators
 * - Mic/camera controls
 * - Adaptive quality management
 */
import type { DoorContext } from '@amiexpress/bbs-door-sdk';
export interface VoiceParticipant {
    userId: number | string;
    username: string;
    isSpeaking: boolean;
    audioLevel: number;
    hasVideo: boolean;
    isMuted: boolean;
    lastUpdate: number;
}
export interface VoiceChannelOptions {
    parent: any;
    screen: any;
    socket: any;
    ctx?: DoorContext;
    onClose?: () => void;
}
export declare class VoiceChannel {
    private screen;
    private socket;
    private ctx?;
    private container;
    private participantsBox;
    private videoGrid;
    private controlsBox;
    private networkBox;
    private qualityBox;
    private participants;
    private isInChannel;
    private isMuted;
    private hasVideo;
    private networkMonitor?;
    private qualityManager?;
    private onCloseCallback?;
    constructor(options: VoiceChannelOptions);
    private createUI;
    private setupSocketHandlers;
    private setupAdaptiveQuality;
    private toggleChannel;
    private joinChannel;
    private leaveChannel;
    private startVoiceStreaming;
    private toggleMute;
    private toggleVideo;
    private startVideoStream;
    private stopVideoStream;
    private toggleAutoQuality;
    private addParticipant;
    private removeParticipant;
    private updateParticipantsList;
    private updateNetworkDisplay;
    private updateQualityDisplay;
    private showNotification;
    private showError;
    show(): void;
    hide(): void;
    toggle(): void;
    destroy(): void;
}
export declare function createVoiceChannel(options: VoiceChannelOptions): VoiceChannel;
