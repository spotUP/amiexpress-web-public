import { T } from '../door-theme';
/** Help content part 2: Features */
export const HELP_PART_2 = `
{bold}{${T.ok}-fg}--- FEATURES ---{/${T.ok}-fg}{/bold}

{${T.accent}-fg}Menu Bar:{/${T.accent}-fg}
  Click menu items or use keyboard shortcuts.
  Chat | Rooms | Files | Draw | Settings | Help

{${T.accent}-fg}Channel Tree:{/${T.accent}-fg}
  Left panel shows channels and DMs.
  Click to expand/collapse groups.
  Click channel to join.

{${T.accent}-fg}User List:{/${T.accent}-fg}
  Right panel shows online users.
  Click user to view profile.
  Right-click for context menu.

{${T.accent}-fg}Context Menus (Right-Click):{/${T.accent}-fg}
  On users: Profile, DM, Mention, Ignore
  On chat: Copy, Reply, Quote
  On channels: Join, Leave, Info

{${T.accent}-fg}Chat Features:{/${T.accent}-fg}
  - Live typing indicators
  - @mentions (highlighted)
  - **bold** and *italic* markdown
  - Message reactions
  - Scrollable history (500 lines)

{${T.accent}-fg}Settings Panel (Ctrl+S):{/${T.accent}-fg}
  - Mute BBS events
  - Mute sounds
  - Show/hide typing indicators
  - Show/hide timestamps
  - Set presence status

{${T.accent}-fg}Mouse Support:{/${T.accent}-fg}
  - Click anywhere to interact
  - Scroll wheel in all panels
  - Drag to select (where supported)

{bold}{${T.ok}-fg}--- DRAWING CHANNELS (F5) ---{/${T.ok}-fg}{/bold}

{${T.accent}-fg}Create Drawing Channels:{/${T.accent}-fg}
  Press F5 or use /art <name> to create
  a collaborative whiteboard channel.
  Drawing channels are prefixed with art:

{${T.accent}-fg}Example:{/${T.accent}-fg}
  /art doodles  - Creates art:doodles

{${T.accent}-fg}Drawing Controls:{/${T.accent}-fg}
  Mouse        Click and drag to draw
  C            Cycle through colors
  X            Clear the canvas
  Escape       Return to chat

{${T.accent}-fg}Colors:{/${T.accent}-fg} White Red Green Blue Yellow Cyan Magenta Gray

{bold}{${T.ok}-fg}--- FILE SHARING (F6) ---{/${T.ok}-fg}{/bold}

{${T.accent}-fg}Share Files:{/${T.accent}-fg}
  Browse and share files with chat users.
  Press F6 or use the Files menu.

{${T.accent}-fg}File Browser:{/${T.accent}-fg}
  - Navigate with arrow keys
  - Enter to select directories
  - Press Share to send file link
  - Escape to close
`;
