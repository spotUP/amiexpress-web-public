"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HELP_PART_2 = void 0;
const door_theme_1 = require("../door-theme");
/** Help content part 2: Features */
exports.HELP_PART_2 = `
{bold}{${door_theme_1.T.ok}-fg}--- FEATURES ---{/${door_theme_1.T.ok}-fg}{/bold}

{${door_theme_1.T.accent}-fg}Menu Bar:{/${door_theme_1.T.accent}-fg}
  Click menu items or use keyboard shortcuts.
  Chat | Rooms | Files | Draw | Settings | Help

{${door_theme_1.T.accent}-fg}Channel Tree:{/${door_theme_1.T.accent}-fg}
  Left panel shows channels and DMs.
  Click to expand/collapse groups.
  Click channel to join.

{${door_theme_1.T.accent}-fg}User List:{/${door_theme_1.T.accent}-fg}
  Right panel shows online users.
  Click user to view profile.
  Right-click for context menu.

{${door_theme_1.T.accent}-fg}Context Menus (Right-Click):{/${door_theme_1.T.accent}-fg}
  On users: Profile, DM, Mention, Ignore
  On chat: Copy, Reply, Quote
  On channels: Join, Leave, Info

{${door_theme_1.T.accent}-fg}Chat Features:{/${door_theme_1.T.accent}-fg}
  - Live typing indicators
  - @mentions (highlighted)
  - **bold** and *italic* markdown
  - Message reactions
  - Scrollable history (500 lines)

{${door_theme_1.T.accent}-fg}Settings Panel (Ctrl+S):{/${door_theme_1.T.accent}-fg}
  - Mute BBS events
  - Mute sounds
  - Show/hide typing indicators
  - Show/hide timestamps
  - Set presence status

{${door_theme_1.T.accent}-fg}Mouse Support:{/${door_theme_1.T.accent}-fg}
  - Click anywhere to interact
  - Scroll wheel in all panels
  - Drag to select (where supported)

{bold}{${door_theme_1.T.ok}-fg}--- DRAWING CHANNELS (F5) ---{/${door_theme_1.T.ok}-fg}{/bold}

{${door_theme_1.T.accent}-fg}Create Drawing Channels:{/${door_theme_1.T.accent}-fg}
  Press F5 or use /art <name> to create
  a collaborative whiteboard channel.
  Drawing channels are prefixed with art:

{${door_theme_1.T.accent}-fg}Example:{/${door_theme_1.T.accent}-fg}
  /art doodles  - Creates art:doodles

{${door_theme_1.T.accent}-fg}Drawing Controls:{/${door_theme_1.T.accent}-fg}
  Mouse        Click and drag to draw
  C            Cycle through colors
  X            Clear the canvas
  Escape       Return to chat

{${door_theme_1.T.accent}-fg}Colors:{/${door_theme_1.T.accent}-fg} White Red Green Blue Yellow Cyan Magenta Gray

{bold}{${door_theme_1.T.ok}-fg}--- FILE SHARING (F6) ---{/${door_theme_1.T.ok}-fg}{/bold}

{${door_theme_1.T.accent}-fg}Share Files:{/${door_theme_1.T.accent}-fg}
  Browse and share files with chat users.
  Press F6 or use the Files menu.

{${door_theme_1.T.accent}-fg}File Browser:{/${door_theme_1.T.accent}-fg}
  - Navigate with arrow keys
  - Enter to select directories
  - Press Share to send file link
  - Escape to close
`;
