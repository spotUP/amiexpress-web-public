/**
 * Lobby Screen
 *
 * Multiplayer lobby using the SDK's generic MultiplayerLobby widget
 */
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { type LobbyResult } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { GrandmasterNetworkManager, MultiplayerMode } from '../network/network-manager';
import type { AppState } from '../core/types';
import type { SoundEngine } from '../audio/sounds';
/**
 * Lobby mode
 */
export type LobbyMode = 'matchmaking' | 'custom' | 'browse';
/**
 * Lobby Screen
 *
 * Thin wrapper around SDK's MultiplayerLobby widget
 */
export declare class LobbyScreen {
    private screen;
    private state;
    private sounds;
    private network;
    private localPlayerId;
    private lobby;
    constructor(screen: Screen, state: AppState, sounds: SoundEngine, network: GrandmasterNetworkManager, localPlayerId: string);
    /**
     * Show lobby and wait for result
     */
    show(mode: LobbyMode, selectedMode?: MultiplayerMode): Promise<LobbyResult>;
}
//# sourceMappingURL=lobby-screen.d.ts.map