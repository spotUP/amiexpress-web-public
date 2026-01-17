"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HELP_PART_1 = void 0;
/** Help content part 1: Shortcuts and Commands */
exports.HELP_PART_1 = `{bold}{cyan-fg}=== LIVECHAT v3.0 - DESKTOP-LEVEL BBS CHAT ==={/cyan-fg}{/bold}

{yellow-fg}A full-featured multi-user chat system with neo-blessed UI{/yellow-fg}

{bold}{green-fg}--- KEYBOARD SHORTCUTS ---{/green-fg}{/bold}

{cyan-fg}Navigation:{/cyan-fg}
  Tab           Next channel
  Shift+Tab     Previous channel
  PageUp        Scroll chat up
  PageDown      Scroll chat down
  Escape        Close dialogs / Return to input

{cyan-fg}Chat:{/cyan-fg}
  Enter         Send message
  Ctrl+N        New message prompt
  Ctrl+R        Room menu (join room)
  Ctrl+S        Open settings
  F1            Show this help

{cyan-fg}Window Controls:{/cyan-fg}
  F2            Toggle sidebar visibility
  F3            Switch sidebar tab (Channels/Users)
  F4 / Ctrl+E   Open emoji picker
  F5            Format selected text (colors/effects)
  F6            File sharing browser
  Tab           Cycle focus between panels
  Ctrl+C/Q      Quit (with confirmation)

{cyan-fg}Text Formatting:{/cyan-fg}
  Shift+Arrow   Select text in input box
  F5            Open format picker (with text selected)
  Right-click   Open format picker (with text selected)

{cyan-fg}Voice Channels:{/cyan-fg}
  Click [V]         Join/leave voice channel
  /voice join <ch>  Join voice channel
  /voice leave      Leave voice channel
  /voice mute       Mute microphone
  /voice unmute     Unmute microphone
  /deafen           Mute audio output
  /undeafen         Unmute audio output

{bold}{green-fg}--- COMMANDS ---{/green-fg}{/bold}

{cyan-fg}Room Commands:{/cyan-fg}
  /join <room>      Join a channel
  /leave            Leave current channel
  /create <name>    Create new channel
  /topic <text>     Set channel topic
  /rooms            List all rooms

{cyan-fg}User Commands:{/cyan-fg}
  /who              List online users
  /whois <user>     User information
  /dm <user> <msg>  Send direct message
  /ignore <user>    Ignore a user
  /unignore <user>  Unignore a user

{cyan-fg}Status Commands:{/cyan-fg}
  /away [msg]       Set away status
  /back             Return from away
  /status <status>  Set status (online/away/busy/dnd)

{cyan-fg}Other Commands:{/cyan-fg}
  /me <action>      Send action message
  /clear            Clear chat window
  /draw <channel>   Open drawing whiteboard
  /files            Open file sharing browser
  /emoji [search]   Open emoji picker or search
  /events [type]    Manage event notifications
  /help             Show this help`;
