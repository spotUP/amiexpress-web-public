# Discord UX Comparison - Voice Channels

Detailed comparison of Discord's voice channel UX and our implementation improvements.

## Discord's Core UX Patterns

### 1. Channel List Integration

**Discord's Approach:**
```
TEXT CHANNELS          VOICE CHANNELS
# general             🔊 General (3)
# announcements       🔊 Music (1)
# random              🔊 Gaming (5)
```

- Voice channels appear **in the channel list**
- Show participant count in parentheses
- 🔊 icon distinguishes voice from text
- Click to join (no separate "join" button)
- Click again to leave

**Our Implementation:**
```typescript
// Enhanced approach: Integrate voice into channel list
const voiceChannel = createEnhancedVoiceChannel({
  channelList,      // Existing channel list widget
  screen,
  socket,
  ctx,
  username,
  onJoinVoice: (channelId) => {
    // Show control bar at bottom
  },
  onLeaveVoice: () => {
    // Hide control bar
  },
});
```

**Benefits:**
- ✅ No hidden panels (F8 toggle not needed)
- ✅ Always see who's in voice
- ✅ One-click join/leave
- ✅ Familiar Discord UX

### 2. Bottom Control Bar

**Discord's Approach:**
```
┌────────────────────────────────────┐
│                                    │
│         Chat Messages              │
│                                    │
│                                    │
└────────────────────────────────────┘
┌──────────────────┬─────────────────┐
│ 👤 username      │ [Mute] [Video]  │
│ [*] Speaking...  │ [X] Leave       │
└──────────────────┴─────────────────┘
```

**Features:**
- Bottom left corner (persistent)
- User avatar with green ring when speaking
- Mute button (red when muted, green when unmuted)
- Video button (gray when off, green when on)
- Settings/gear icon
- Disconnect button

**Our Implementation:**
```typescript
const controlBar = new VoiceControlBar({
  parent: screen,
  screen,
  socket,
  ctx,
  username,
  onDisconnect: () => {
    // Leave voice channel
  },
});

// Show when joining voice
controlBar.show();

// Hide when leaving voice
controlBar.hide();
```

**ASCII Representation:**
```
┌─────────────────────────────────────┐
│                                     │
│     Bottom left control bar         │
│  [*] username [M] [V] [X] Leave     │
│                                     │
└─────────────────────────────────────┘
```

**Benefits:**
- ✅ Always visible when in voice
- ✅ Quick access to controls
- ✅ Clear speaking indicator
- ✅ Doesn't obstruct chat

### 3. Speaking Indicators

**Discord's Approach:**
- Green ring around user avatar when speaking
- Ring pulses/animates with audio level
- Ring appears in:
  - Voice channel participant list
  - Bottom control bar
  - Member list (right sidebar)
  - Video tiles

**Our Implementation:**
```
Speaking: [*] username ========----
Idle:     [ ] username ----------
Muted:    [M] username (red)
```

**ASCII Speaking Indicators:**
- `[*]` = Speaking (green)
- `[ ]` = Idle (gray)
- `[M]` = Muted (red)
- Audio level bar: `==========` (10 segments)

**Benefits:**
- ✅ Instant visual feedback
- ✅ Multiple indicator types
- ✅ Audio level visualization
- ✅ Clear mute status

### 4. Persistent Voice Connection

**Discord's Behavior:**
- Stay in voice when switching text channels
- Voice connection persists across navigation
- Control bar always visible at bottom
- Can browse channels while in voice

**Our Implementation:**
```typescript
// Voice state independent of text channel
class EnhancedVoiceChannel {
  private currentVoiceChannel?: string;

  // Can switch text channels while in voice
  public async joinVoiceChannel(channelId: string) {
    // Start persistent voice connection
    this.currentVoiceChannel = channelId;
    // Show control bar (persists across navigation)
    this.controlBar.show();
  }
}
```

**Benefits:**
- ✅ Don't lose voice when switching channels
- ✅ Natural multitasking
- ✅ Matches Discord behavior
- ✅ Better user experience

### 5. Video Grid Overlay

**Discord's Approach:**
- Video tiles appear in **overlay window**
- Can be moved, resized, minimized
- Grid layout: 1x1, 2x2, 3x3, etc.
- Screenshare gets larger tile
- Hover shows controls

**Our ASCII Adaptation:**
```
┌───────────────────────────────────┐
│         Video Chat (3)            │
├─────────────┬─────────────────────┤
│  ┌────────┐ │  ┌────────┐        │
│  │ Alice  │ │  │  Bob   │        │
│  │ [*]    │ │  │  [V]   │        │
│  │ 😊     │ │  │  😎    │        │
│  └────────┘ │  └────────┘        │
│             │                     │
│  ┌────────────────────┐          │
│  │  Charlie (Screen)  │          │
│  │  ┌──────────────┐  │          │
│  │  │ ASCII Screen │  │          │
│  │  │     Share    │  │          │
│  │  └──────────────┘  │          │
│  └────────────────────┘          │
└───────────────────────────────────┘
```

**Benefits:**
- ✅ Non-intrusive overlay
- ✅ Grid adapts to participant count
- ✅ Screenshare prominent
- ✅ Can minimize/close

### 6. Click to Join Flow

**Discord's Flow:**
```
1. User sees: "🔊 General (3)"
2. User clicks voice channel
3. Instant connection starts
4. Control bar appears at bottom
5. User's name appears in participant list
6. Others see user join
```

**Our Flow:**
```typescript
// Simplified join (no intermediate dialogs)
channelList.on('select', (item) => {
  if (item.isVoiceChannel) {
    voiceChannel.joinVoiceChannel(item.id);
    // That's it! No confirmations, just join
  }
});
```

**Benefits:**
- ✅ Zero friction
- ✅ One click to join
- ✅ Instant feedback
- ✅ Familiar pattern

## UX Comparison Table

| Feature | Discord | Current Implementation | Enhanced Implementation |
|---------|---------|------------------------|------------------------|
| **Channel List** | Voice channels shown inline | Hidden behind F8 toggle | ✅ Shown inline with participant count |
| **Join Method** | Click channel name | Click "Join Voice" button | ✅ Click channel name |
| **Control Location** | Bottom left corner | Right sidebar panel | ✅ Bottom left corner |
| **Speaking Indicator** | Green ring around avatar | Green `[*]` in list | ✅ Multiple locations with animation |
| **Persistent Voice** | Yes, across channel switches | No, tied to room | ✅ Yes, independent of text channel |
| **Video Layout** | Overlay grid window | Right sidebar tiles | ✅ Overlay grid (ASCII adapted) |
| **Mute Button** | Bottom bar, red when muted | Inside voice panel | ✅ Bottom bar with color coding |
| **Leave Voice** | Click "Disconnect" | ESC or close panel | ✅ Click "Leave" in bottom bar |
| **Participant Count** | (N) next to channel name | Label shows count | ✅ (N) next to channel name |

## Key UX Improvements

### Before (Original Implementation)
```
Problems:
❌ Voice channel hidden behind F8
❌ Separate join button required
❌ Right sidebar takes screen space
❌ Lost voice when changing rooms
❌ Controls scattered across panel
❌ No persistent connection indicator
```

### After (Enhanced Implementation)
```
Improvements:
✅ Voice channels in main channel list
✅ One-click join (click channel name)
✅ Bottom control bar (persistent)
✅ Voice persists across navigation
✅ All controls in one place
✅ Always shows voice status
```

## Implementation Strategy

### Phase 1: Channel List Integration
```typescript
// Add voice channels to channel list
interface ChannelItem {
  id: string;
  name: string;
  type: 'text' | 'voice';
  participantCount?: number;  // For voice channels
}

// Render voice channels with icon
function renderChannelItem(item: ChannelItem): string {
  if (item.type === 'voice') {
    const icon = '🔊'; // Or '[V]' for ASCII
    const count = item.participantCount || 0;
    return `${icon} ${item.name} (${count})`;
  }
  return `# ${item.name}`;
}
```

### Phase 2: Bottom Control Bar
```typescript
// Create persistent bottom bar
const controlBar = new VoiceControlBar({
  parent: screen,
  bottom: 0,
  left: 0,
  width: 40,
  height: 3,
});

// Show when joining voice
voiceChannel.on('joined', () => {
  controlBar.show();
  controlBar.updateUsername(username);
});

// Update speaking indicator
audioStream.on('speaking', (isSpeaking) => {
  controlBar.setSpeaking(isSpeaking);
});
```

### Phase 3: Video Grid Overlay
```typescript
// Create video overlay (shown on demand)
const videoGrid = new VideoGridOverlay({
  screen,
  participants: [],
  onClose: () => {
    videoGrid.hide();
  },
});

// Show when someone enables video
voiceChannel.on('video-enabled', (userId) => {
  if (!videoGrid.isVisible()) {
    videoGrid.show();
  }
  videoGrid.addParticipant(userId);
});
```

## User Scenarios

### Scenario 1: Joining Voice Chat

**Discord:**
1. Open Discord
2. See text and voice channels in left sidebar
3. Click "🔊 General" voice channel
4. Immediately connect
5. Bottom left shows "Connected to General"
6. Start talking

**Our Enhanced UX:**
1. Open LiveChat
2. See text and voice channels in channel list
3. Click "[V] General (2)" voice channel
4. Immediately connect
5. Bottom left shows control bar with username
6. Start talking

**Difference:** None! Identical flow.

### Scenario 2: Enabling Video

**Discord:**
1. Already in voice channel
2. Click video button in bottom bar
3. Video overlay opens automatically
4. Your video tile appears
5. Others see your video

**Our Enhanced UX:**
1. Already in voice channel
2. Click [V] button in bottom bar
3. ASCII video overlay opens
4. Your ASCII video tile appears
5. Others see your video tile

**Difference:** ASCII adaptation, but same UX flow.

### Scenario 3: Switching Text Channels While in Voice

**Discord:**
1. In voice: "🔊 Gaming"
2. Click text channel: "# general"
3. Text chat changes
4. Voice connection stays active
5. Can still hear/talk

**Our Enhanced UX:**
1. In voice: "[V] Gaming (3)"
2. Click text channel: "# general"
3. Text chat changes
4. Voice connection stays active
5. Control bar remains visible

**Difference:** None! Persistent voice works the same.

## Next Steps

### Short Term (Week 1)
1. ✅ Integrate voice channels into channel list
2. ✅ Implement bottom control bar
3. ✅ Add click-to-join functionality
4. ⏳ Test multi-user voice chat

### Medium Term (Week 2-3)
1. ⏳ Add video grid overlay
2. ⏳ Implement screenshare detection
3. ⏳ Add ASCII video tiles
4. ⏳ Polish speaking animations

### Long Term (Month 1-2)
1. ⏳ Stage channels (50+ participants)
2. ⏳ Noise suppression controls
3. ⏳ Voice activity sensitivity
4. ⏳ Regional voice servers

## Conclusion

By adopting Discord's UX patterns, we achieve:

1. **Familiarity**: Users already know how voice channels work
2. **Simplicity**: One-click join, persistent connection
3. **Efficiency**: Controls always accessible at bottom
4. **Visibility**: Always see who's in voice
5. **Consistency**: Same patterns across text and voice

The enhanced implementation brings LiveChat's voice channels to Discord-level UX quality while adapting appropriately for ASCII/terminal constraints.

---

## Sources

- [How Discord Handles Two and Half Million Concurrent Voice Users using WebRTC](https://discord.com/blog/how-discord-handles-two-and-half-million-concurrent-voice-users-using-webrtc)
- [Discord's Voice Stack: How Rust, Elixir, and WebRTC Power 150 Million Voices](https://medium.com/@theopinionatedev/discords-voice-stack-how-rust-elixir-and-webrtc-power-150-million-voices-9c03465aa194)
- [Voice Connections - Discord Userdoccers](https://docs.discord.food/topics/voice-connections)
