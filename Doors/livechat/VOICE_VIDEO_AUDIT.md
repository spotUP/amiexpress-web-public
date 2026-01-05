# Voice & Video Audit Report (2026-01-04)

## Overview
This audit covers the implementation of voice audio, video streaming, and UI components in the LiveChat door.

## Components Analyzed

### 1. Frontend Architecture
*   **Legacy Implementation (`voice-chat.ts`)**:
    *   Implements a side-panel voice interface.
    *   Features: Join/Leave, Mute, Video Toggle, Auto-Quality.
    *   Uses `voice:join` socket event.
    *   UI: Right sidebar (25% width).
*   **Modern "Discord-Style" Implementation (`voice-channel-ux.ts`)**:
    *   Implements a bottom control bar and integrated video grid.
    *   Features: Persistent voice connection, screen sharing hooks, channel list integration.
    *   Uses `voice:join-channel` socket event.
    *   UI: Bottom control bar + Adaptive video grid.
*   **Video Grid (`video-grid.ts`)**:
    *   Responsive grid layout (max 5x5).
    *   Dynamically calculates tile dimensions.
    *   Manages `VideoTile` instances.
*   **Video Tile (`ui/video-tile.ts`)**:
    *   Renders individual participant tiles.
    *   Supports ASCII video frames or generated ASCII avatars.
    *   Indicators: Speaking (Green `[*]`), Muted (Red `[M]`), Video (Cyan `[V]`).

### 2. Backend Architecture (`voice-channel.handler.ts`)
*   **Socket Events**:
    *   `voice:join` (Legacy): Joins `voice:{roomId}`.
    *   `voice:join-channel` (Modern): Joins `voice:{channelId}`.
    *   `voice:speaking`: Relays VAD status and audio levels.
    *   `voice:video-toggle`: Broadcasts video state changes.
*   **State Management**:
    *   Tracks participants via `voiceChannels` map.
    *   Handles cleanup on disconnect.

### 3. Data Consistency
*   **Participants**:
    *   Backend `VoiceParticipant`: `userId`, `username`, `socketId`, `isMuted`, `hasVideo`, `hasScreenShare`.
    *   Frontend `VideoParticipant`: Matches backend structure + `avatar` (generated locally).
*   **Events**:
    *   `voice:joined`, `voice:left`, `voice:speaking` are consistently handled across frontend and backend.

## Findings & Recommendations

### ✅ Strengths
*   **Dual Support**: Backend supports both legacy and modern UX approaches, allowing for gradual migration.
*   **Adaptive Grid**: `VideoGrid` logic correctly handles dynamic resizing and participant counts.
*   **ASCII Video**: `VideoTile` implements fallback to generated ASCII avatars when video is off.
*   **Status Indicators**: Comprehensive status feedback (speaking, mute, video) in both UI implementations.

### ⚠️ Issues / Technical Debt
1.  **Code Duplication**: `voice-chat.ts` and `voice-channel-ux.ts` maintain separate state logic.
    *   *Recommendation*: Refactor shared logic (state management, socket listeners) into a `VoiceSessionService`.
2.  **Z-Index Hack**: `voice-channel-ux.ts` uses `zIndex = 10000`.
    *   *Recommendation*: Verify if `container.setFront()` is sufficient or if `neo-blessed` requires this explicit override.
3.  **Error State**: Video error handling in `voice-channel-ux.ts` keeps `videoEnabled = true` to show error messages.
    *   *Recommendation*: Ensure this doesn't prevent subsequent retry attempts.

### 🔍 Next Steps
1.  **Deprecation**: Decide on a timeline to deprecate `voice-chat.ts` in favor of `voice-channel-ux.ts`.
2.  **Integration**: Ensure `EnhancedVoiceChannel` is fully hooked into the main `LiveChat` app (currently imported but instantiation needs verification in `app.ts`).
3.  **Testing**: Verify `voice:join-channel` flow with multiple clients to ensure grid layout adapts correctly.
