# AmiExpress-Web User Interface Guide

**Last Updated:** 2026-01-04
**Audience:** BBS Users
**Prerequisites:** Web browser (Chrome, Firefox, Safari, Edge)

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Web Interface Overview](#web-interface-overview)
3. [Terminal Interface](#terminal-interface)
4. [Features and Functions](#features-and-functions)
5. [Keyboard Shortcuts](#keyboard-shortcuts)
6. [Mobile Usage](#mobile-usage)
7. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Accessing the BBS

**Web Browser:**
1. Open your web browser
2. Navigate to the BBS URL (e.g., https://yourbbs.example.com)
3. Wait for the terminal to load

**Alternative Access Methods:**
- **Telnet:** `telnet yourbbs.example.com 2323`
- **SSH:** `ssh -p 2222 user@yourbbs.example.com`

### First-Time Login

**Create New Account:**

1. At the login screen, select "New User" or press `N`
2. Follow the registration prompts:
   - Username (3-20 characters, letters/numbers only)
   - Real Name
   - Location (City, State/Province)
   - Email Address (optional)
   - Password (minimum 8 characters)
   - Confirm Password
3. Set preferences:
   - ANSI Graphics (Yes recommended)
   - Lines per screen (24 recommended)
   - Computer Type
4. Review and confirm

**Existing Users:**
1. Enter your username when prompted
2. Enter your password
3. Press Enter

### What You'll See

After logging in, you'll see:
1. **BBS Title Screen** - Welcome banner with BBS name
2. **Login Screen** - Shows login stats and info
3. **Bulletins** - Important announcements (press Space to continue)
4. **Main Menu** - Your starting point for all BBS activities

---

## Web Interface Overview

### Terminal Window

**Layout:**
```
+------------------------------------------------------------------+
|                    AmiExpress BBS Terminal                       |
|                    https://yourbbs.example.com                   |
+------------------------------------------------------------------+
|                                                                  |
|  [ANSI/Terminal Output Area - where BBS text appears]          |
|                                                                  |
|  Command prompt at bottom                                       |
+------------------------------------------------------------------+
| [Input Box]                                    [Settings] [Help] |
+------------------------------------------------------------------+
```

**Components:**
- **Terminal Display:** Shows BBS output (ANSI graphics, text, menus)
- **Input Box:** Type commands and messages here
- **Settings Button:** Configure display preferences
- **Help Button:** Quick reference guide
- **Status Bar:** Shows connection status, time online

### Settings Panel

Click **Settings** button to configure:

**Display Options:**
- **Font Size:** Adjust terminal text size (Small/Medium/Large)
- **Color Scheme:** Choose color theme (Classic/Amber/Green/Blue)
- **ANSI Graphics:** Enable/disable color codes
- **Sound Effects:** Enable/disable BBS sound effects
- **Smooth Scrolling:** Enable/disable smooth scroll animation

**Connection Options:**
- **Auto-Reconnect:** Reconnect automatically if disconnected
- **Keep-Alive:** Send keep-alive packets to prevent timeout
- **Echo Local:** Show typed characters immediately

**Keyboard Options:**
- **Ctrl+Key Shortcuts:** Enable keyboard shortcuts
- **Arrow Key Navigation:** Use arrow keys in menus
- **Enter Key Behavior:** Send immediately or allow multi-line

---

## Terminal Interface

### Understanding the Terminal

The terminal emulates a classic BBS text interface with modern enhancements:

**Text Display:**
- 80 columns x 24 rows (standard BBS dimensions)
- ANSI color codes for colored text
- Line drawing characters for menus and boxes

**Input Methods:**
- **Type and press Enter:** Send command
- **Single key commands:** Most menus accept single keypresses
- **Arrow keys:** Navigate some menus (if enabled)

### ANSI Graphics

**What is ANSI?**
ANSI codes create colored text and graphics using standard terminal codes.

**Example ANSI Text:**
```
[31mRed Text[0m
[32mGreen Text[0m
[33mYellow Text[0m
```

**Enable/Disable ANSI:**
- Main Menu → `U` (User Settings) → `A` (ANSI Graphics)
- Settings Panel → Display → ANSI Graphics toggle

### Color Schemes

**Classic (Default):**
- Authentic Amiga color palette
- Blue/cyan accents on black background

**Amber:**
- Vintage monochrome amber-on-black
- Easier on eyes for long sessions

**Green:**
- Classic green-screen terminal look
- Nostalgic retro computing feel

**Blue:**
- IBM PC blue-screen aesthetic
- High contrast for visibility

---

## Features and Functions

### Main Menu

**Common Commands:**
```
M - Messages       Read and post messages
F - Files          Browse and download files
D - Doors          Run door programs/games
C - Chat           Chat with other users
U - User Settings  Configure your account
W - Who's Online   See who else is logged in
G - Goodbye        Log off the BBS
? - Help           Display command help
```

**Navigation:**
- Type the letter/command and press Enter
- Or just press the single letter (no Enter needed)
- Press `?` anytime for context help

### Messaging System

**Read Messages:**
1. Main Menu → `M` (Messages)
2. Options:
   - `N` - Read new messages
   - `R` - Read all messages
   - `S` - Scan message headers
   - `Q` - Quick scan (subjects only)

**Post New Message:**
1. Main Menu → `M` → `E` (Enter Message)
2. Select recipient:
   - Enter username for private message
   - Press Enter for public message
3. Enter subject
4. Type message body:
   - Type your message line by line
   - Press `/S` to save and post
   - Press `/A` to abort
   - Press `/H` for editor help

**Message Editor Commands:**
```
/S - Save message and post
/A - Abort message
/L - List message lines
/D - Delete line
/E - Edit line
/R - Replace text
/H - Help
```

### File Areas

**Browse Files:**
1. Main Menu → `F` (Files)
2. Options:
   - `L` - List all files
   - `N` - List new files
   - `S` - Search for files
   - `D` - Download file

**Download Files:**
1. Browse to find file
2. Press `D` when prompted
3. Enter filename to download
4. File downloads automatically via browser

**Upload Files:**
1. Main Menu → `F` → `U` (Upload)
2. Browser file picker opens
3. Select file(s) to upload
4. Enter description when prompted
5. File uploads automatically

**File Flagging:**
- `+` - Flag file for batch download
- `-` - Unflag file
- `B` - Download all flagged files

### Door Programs

**What are Doors?**
Doors are external programs that run within the BBS:
- Games (e.g., TradeWars, Legend of the Red Dragon)
- Utilities (e.g., file scanners, message readers)
- Chat programs
- Interactive applications

**Run a Door:**
1. Main Menu → `D` (Doors)
2. Select door from menu
3. Door launches in terminal window
4. Follow door-specific instructions
5. Exit door to return to BBS menu

**Popular Doors:**
- **Live Chat** - Multi-user chat rooms
- **AquaScan** - New file scanner
- **Doors Menu** - Interactive door launcher
- **Games** - Various BBS games

### Chat Features

**User-to-User Chat:**
1. Main Menu → `C` (Chat)
2. Options:
   - `P` - Page sysop
   - `U` - Chat with specific user
   - `R` - Enter chat rooms

**Chat Rooms:**
1. Main Menu → `C` → `R` (Rooms)
2. View available rooms
3. Join room by entering room name
4. Type messages and press Enter
5. `/quit` to exit room

**Chat Commands:**
```
/quit     - Exit chat
/who      - List users in room
/me       - Action message (/me waves)
/msg user - Private message to user
/help     - Chat help
```

### User Settings

**Configure Your Account:**
1. Main Menu → `U` (User Settings)
2. Options:
   - `A` - ANSI Graphics (On/Off)
   - `L` - Lines per screen
   - `P` - Password change
   - `E` - Email address
   - `V` - View user stats
   - `X` - Expert mode (fewer prompts)

**User Statistics:**
- Total calls (logins)
- Messages posted
- Files uploaded/downloaded
- Time used today
- Credits remaining

---

## Keyboard Shortcuts

### Global Shortcuts

**Available Everywhere:**
```
Ctrl+C - Interrupt current operation (Stop)
Ctrl+S - Pause output (Scroll Lock)
Ctrl+Q - Resume output
Ctrl+L - Refresh screen
Ctrl+U - Clear input line
```

### Menu Navigation

**Single-Key Commands:**
Most menus accept single key presses (no Enter needed):
```
M - Messages
F - Files
D - Doors
C - Chat
? - Help
Q - Quit/Back
```

**Arrow Keys (if enabled):**
```
Up/Down    - Navigate menu items
Left/Right - Previous/Next page
Enter      - Select item
Esc        - Cancel/Back
```

### Message Editor

```
/S - Save message
/A - Abort message
/L - List lines
/D - Delete line
/E - Edit line
/H - Help
```

### File Browser

```
N - Next page
P - Previous page
D - Download file
+ - Flag for download
- - Unflag
Q - Quit/Back
```

---

## Mobile Usage

### Mobile Browser Access

**Supported:**
- iOS Safari (iPhone/iPad)
- Android Chrome/Firefox
- Mobile browsers with JavaScript

**Optimizations:**
- Touch-optimized input
- Swipe gestures for scrolling
- On-screen keyboard support
- Responsive layout

### Mobile Tips

**Typing:**
- Tap input box to show keyboard
- Use autocomplete for commands
- Swipe keyboard for special characters

**Navigation:**
- Tap links when available
- Use single-letter commands
- Landscape mode recommended for wider view

**Best Practices:**
- Use Wi-Fi for stable connection
- Keep screen from sleeping (adjust phone settings)
- Close other apps for better performance
- Consider using a Bluetooth keyboard for extended sessions

---

## Troubleshooting

### Connection Issues

**Can't Connect:**
1. Check BBS URL is correct
2. Verify internet connection
3. Try different browser
4. Disable VPN/proxy if enabled
5. Clear browser cache and cookies

**Frequent Disconnects:**
1. Enable Auto-Reconnect in settings
2. Enable Keep-Alive packets
3. Check internet stability
4. Try wired connection instead of Wi-Fi
5. Contact sysop if problem persists

### Display Issues

**Garbled Text/Graphics:**
1. Enable ANSI Graphics in settings
2. Try different color scheme
3. Adjust font size
4. Refresh page (Ctrl+L or F5)
5. Clear browser cache

**Missing Colors:**
1. Verify ANSI enabled
2. Check browser supports ANSI codes
3. Try different color scheme
4. Update browser to latest version

**Slow Performance:**
1. Close unused browser tabs
2. Disable browser extensions
3. Clear browser cache
4. Check CPU usage
5. Try different browser

### Input Problems

**Can't Type:**
1. Click input box to focus
2. Check keyboard isn't disabled
3. Try different keyboard (mobile)
4. Refresh page
5. Restart browser

**Commands Not Working:**
1. Verify typing in input box
2. Check for typos in command
3. Press Enter after typing (if needed)
4. Check if in correct menu
5. Type `?` for help

**Special Characters Not Working:**
1. Use ASCII characters only
2. Avoid unicode/emoji
3. Check keyboard layout
4. Copy/paste if needed

### Login Issues

**Forgot Password:**
1. Contact BBS sysop
2. Provide username and email
3. Sysop can reset password
4. Or create new account

**Account Locked:**
- Too many failed password attempts
- Wait 15 minutes or contact sysop
- Check caps lock is off when typing password

**Username Already Taken:**
- Choose different username
- Or contact sysop if it's your old account

---

## Tips and Best Practices

### Etiquette

**Be Respectful:**
- Use appropriate language
- Respect other users
- Follow sysop rules
- No harassment or spam

**Message Posting:**
- Stay on topic for conference
- Use clear subject lines
- Quote previous messages appropriately
- Proofread before posting

**File Sharing:**
- Only upload legal content
- Provide accurate descriptions
- Virus-scan files before uploading
- Don't upload copyrighted material

### Optimization

**Faster Navigation:**
- Use single-letter commands
- Enable expert mode
- Learn keyboard shortcuts
- Bookmark favorite sections

**Better Reading:**
- Adjust lines per screen to your display
- Use ANSI graphics for color
- Try different color schemes
- Adjust font size for comfort

**Efficient Messaging:**
- Flag files for batch download
- Use quick scan to find new messages
- Set up mail filters (if available)
- Read offline with QWK packets (if available)

---

## Additional Resources

- **User Guide:** See `USER_GUIDE.md` for detailed command reference
- **BBS Commands:** Type `?` or `HELP` from any menu
- **Sysop Contact:** Use Page Sysop feature or email
- **Community:** Check BBS message bases for discussion

---

## Support

**Need Help?**
1. Type `?` or `HELP` from any menu
2. Read the bulletins (may contain important info)
3. Check message bases for FAQs
4. Page the sysop (Main Menu → `C` → `P`)
5. Email: sysop@yourbbs.example.com

**Report Issues:**
- Use feedback command if available
- Post in appropriate message conference
- Email sysop with details
- Include: username, time of issue, what you were doing

---

**Happy BBSing!**

**Last Updated:** 2026-01-04
**Version:** 1.0
