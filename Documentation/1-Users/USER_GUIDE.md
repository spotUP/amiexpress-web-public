# AmiExpress BBS User Guide

## Table of Contents

1. [Getting Started](#getting-started)
2. [Login & Authentication](#login--authentication)
3. [Main Menu Navigation](#main-menu-navigation)
4. [Reading Messages](#reading-messages)
5. [Posting Messages](#posting-messages)
6. [File Operations](#file-operations)
7. [Conference Management](#conference-management)
8. [Using Doors](#using-doors)
9. [Chat & Communication](#chat--communication)
10. [Customization](#customization)
11. [Keyboard Shortcuts](#keyboard-shortcuts)

---

## Getting Started

### What is AmiExpress?

AmiExpress is a classic Amiga-style BBS (Bulletin Board System) brought to the modern web. It preserves the authentic 1990s BBS experience while running in your web browser.

### System Requirements

- Modern web browser (Chrome, Firefox, Safari, Edge)
- Internet connection
- Terminal emulation support (provided by xterm.js)

### First Time Connection

1. Navigate to the BBS URL
2. You'll see the welcome screen (BBSTITLE)
3. Choose ANSI mode when prompted (recommended)
4. Create a new account or login with existing credentials

---

## Login & Authentication

### Creating an Account

1. At the login prompt, enter "NEW" as your username
2. Choose a username (3-25 characters)
3. Provide your real name
4. Enter your location
5. Set a password
6. Answer additional questions (phone, computer type, etc.)
7. Wait for sysop validation (may be automatic depending on setup)

### Logging In

1. Enter your username at the prompt
2. Enter your password
3. System will display:
   - LOGON screen (welcome message)
   - BULL (system bulletins)
   - Mail scan (checking for new messages)
   - CONF_BULL (conference-specific bulletins)
   - MENU (main menu)

### Password Security

- Passwords are encrypted and cannot be viewed by sysops
- Change your password using the `W` command
- Use a strong, unique password

---

## Main Menu Navigation

### Expert vs Novice Mode

- **Novice Mode**: Menu displays after every command
- **Expert Mode**: Menu hidden, press `?` to display
- Toggle with `X` command

### Command Structure

AmiExpress uses single-letter commands followed by Enter:
- Commands are **not** hotkeys (no instant execution)
- Always press Enter to confirm
- Case-insensitive (H and h are the same)

### Essential Commands

| Command | Description |
|---------|-------------|
| `?`     | Display current menu |
| `H`     | Display help file |
| `M`     | Toggle ANSI/monochrome mode |
| `X`     | Toggle expert/novice mode |
| `S`     | View your account status |
| `T`     | Display system time |
| `G`     | Goodbye (logout) |

---

## Reading Messages

### Read Mail Command (`R`)

Read messages addressed to you or public messages.

**Message Reading Options:**

- `A` - Display message **A**gain
- `D` - **D**elete message (if yours or to you, or sysop)
- `F` - Check for attached **F**ile
- `R` - **R**eply to message
- `K` - **K**eep unread and exit
- `Q` - **Q**uit (mark as read and exit)
- `-` - Scan backwards
- `+` - Scan forwards
- `NS` - Non-stop scan mode
- `?` - Display help
- `CR` - Next message

### Replying to Messages

1. Press `R` while reading a message
2. Subject is pre-filled (edit or keep)
3. Choose private/public
4. Option to quote original message
5. Enter your reply
6. Save with `S` command

### Message Scan (`MS`)

Scans all conferences for new mail, regardless of your settings.

---

## Posting Messages

### Enter Message Command (`E`)

Leave private or public mail to other users.

**Steps:**

1. Type `E` at main prompt
2. Enter recipient name:
   - Specific username
   - `ALL` for public message
   - `SYSOP` for sysop
   - `EALL` for email to all users (requires permission)
   - Wildcards supported (finds first match)
3. Enter subject line (blank = abort)
4. Choose private or public
5. Select editor (if full-screen available)
6. Compose message

**Message Editor Commands:**

- `Ctrl-X` - Delete current line
- `A` - **A**bort message
- `C` - **C**ontinue editing
- `D` - **D**elete specific line
- `E` - **E**dit line
- `F` - Attach **F**ile (requires permission)
- `L` - **L**ist message
- `S` - **S**ave message
- `X` - Upload file as message attachment (requires permission)

### Comment to Sysop (`C`)

Quick way to leave a message for the sysop. Same as `E` command but automatically addressed to sysop.

---

## File Operations

### File Listings (`F`)

View available files for download.

**Options:**

- Specify directory number or:
  - `A` - All directories
  - `U` - Upload directory
  - `H` - Hold directory (sysop only)
  - `NS` - Non-stop mode (no pausing)

**At pause prompt:**
- Space - Next page
- `F` - Flag files for download
- `Q` - Quit listing

### Reverse File Listings (`FR`)

Same as `F` but shows newest files first.

### New Files Since Date (`N`)

List files uploaded since a specific date.

1. Enter date (MM-DD-YY) or press Enter for last call
2. Choose directory (A=all, U=upload, H=hold)
3. Browse new files

### Zippy Text Search (`Z`)

Search all file descriptions for keywords.

1. Enter search term
2. System displays matching files with descriptions

### Flagging Files (`A`)

Manage your download flag list without browsing.

**Flag Commands:**

- Enter filenames to add to flag list
- `C` - Clear flags
- `*` - Clear all flags
- Enter - Exit

### Downloading Files (`D`)

1. Enter filename(s) to download
   - Wildcards supported
   - Multiple files allowed
2. System shows:
   - File size
   - Estimated time
   - Your download credits
3. Flagged files automatically included
4. Options:
   - Enter - Start transfer
   - `G` - Goodbye after transfer (auto-logout)
   - `A` - Abort

**Download Notes:**

- Files marked "FREE DOWNLOAD" don't count against ratio
- Files marked "RESTRICTED" cannot be downloaded
- Transfer protocol set with `W` command

### Uploading Files (`U`)

1. System displays free disk space
2. Checks for partial uploads to resume
3. Enter filenames or press Enter for Zmodem auto-detect
4. Enter description for each file (8 lines max)
5. Files are virus-checked (if configured)
6. Posted to upload directory or hold (if check fails)

**Upload Notes:**

- Files must be <12 characters (or will be asked to rename)
- Starting description with `/` sends to hold directory
- Time credit given for uploads
- Partial uploads resume on next call

### View Text File (`V`)

View contents of text files before downloading.

1. Enter filename
2. System displays if it's a valid text file

---

## Conference Management

### Join Conference (`J`)

Switch to a different conference.

1. System displays conference list (JOINCONF screen)
2. Enter conference number
3. System checks for mail
4. Displays conference bulletins

**Quick Conference Navigation:**

- `<` - Join previous conference
- `>` - Join next conference

### Join Message Base (`JM`)

Switch to a different message area within current conference.

1. System displays message base list
2. Enter message base number

**Quick Message Base Navigation:**

- `<<` - Previous message base
- `>>` - Next message base

### Set Conference Configuration (`CF`)

Configure conference-specific settings:

- New file scan (on/off per conference)
- New message scan (on/off per conference)
- ZOOM mail inclusion (on/off per conference)
- Show messages to ALL (on/off)

---

## Using Doors

### What are Doors?

Doors are external programs that provide additional functionality:
- Online games
- Utilities
- Special features

### Running a Door

1. Type the door command (e.g., `GA`, `WHO`, `CONFLIST`)
2. Door executes and displays output
3. Press key to return to menu when done

### Common Doors

Check your BBS's menu for available doors. Examples:
- `GA` - GetAnswer door (questionnaire)
- `WHO` - Who's online
- `CONFLIST` - Conference listing

---

## Chat & Communication

### Operator Page (`O`)

Request chat with the sysop.

**How it works:**

1. System checks if sysop is available
2. Sends page request (bell sounds)
3. Sysop can accept (F1) or ignore
4. If accepted, chat session begins
5. Your text and sysop text appear in different colors (ANSI mode)
6. Sysop ends chat with F1

**Page Limits:**

- Limited number of pages per session
- Exceeded limit sends to comment mode instead

### Online Messages (`OLM`)

Send instant messages to users on other nodes.

1. Type `OLM`
2. Enter recipient username
3. Type message
4. Message queued and delivered when recipient is idle

### Quiet Node (`Q`)

Hide yourself from the WHO command.

- Toggle on/off
- Prevents other users from seeing you're online
- Sysops can always see all nodes

### Who's Online (`WHO`)

See which users are on other nodes and what they're doing.

- Shows username, node, current activity
- Quiet nodes are hidden (unless you're sysop)

---

## Customization

### Write User Parameters (`W`)

Change your account settings:

1. **Login Name** - Your BBS username
2. **Real Name** - Your actual name
3. **Internet Name** - Email/internet identifier
4. **Location** - Where you're from
5. **Phone Number** - Contact number
6. **Password** - Account password
7. **Lines Per Screen** - How many lines before pause (default: 23)
8. **Computer** - What computer you're using
9. **Screen Type** - ANSI or ASCII
10. **Screen Clear** - Clear screen between displays
11. **Transfer Protocol** - Zmodem, Xmodem, etc.
12. **Editor Type** - Line editor or full-screen (if available)
13. **ZOOM Type** - QWK or ASCII packet format
14. **Available for Chat/OLM** - Allow others to contact you

**Some settings may be locked by sysop security.**

### Full Status View (`FS`)

View detailed statistics for each conference:

- Uploads/downloads per conference
- Bytes transferred
- Ratio status
- Available credits

### Version Info (`VER`)

Display AmiExpress version, date, and registration info.

### Uptime (`UP`)

Show when the node was last restarted.

---

## Keyboard Shortcuts

### During Text Display

- **Space** - Next page
- **Enter** - Next line
- **Q** - Quit display
- **NS** - Non-stop mode (disable pausing)

### During Message Entry

- **Ctrl-X** - Delete current line
- **Tab** - Insert tab character (shown as |)
- **Enter on blank line** - Exit to edit menu

### General Navigation

- **Ctrl-C** - Abort current operation
- **Ctrl-B** - Reset command history (clears last 20 commands)

### Function Keys (Sysop Only)

- **F1** - Enter/exit chat mode
- **F7** - Toggle page availability
- **Help** - Toggle status display at top of screen

---

## Additional Features

### Command History

- Last 20 commands remembered
- Up/Down arrows to recall
- Ctrl-B to clear history

### Automatic Zmodem Upload

If you start a Zmodem upload at main prompt, BBS automatically detects and enters upload mode.

### AREXX Support

If configured, BBS supports AREXX commands for:
- Suspend (close serial port, iconify)
- Resume (restore from suspend)
- Shutdown (emergency exit)

### Voting Booth (`VO`)

Participate in polls and surveys (if configured):

1. Type `VO`
2. View available topics
3. Select topic
4. Answer multiple-choice questions
5. Results compiled automatically

**Note:** Must answer all questions in topic for vote to count.

### ZOOM Mail (`ZOOM`)

Download all your unread mail at once:

1. Type `ZOOM`
2. Choose format (QWK or ASCII)
3. Choose compression (LHA or ZIP)
4. System compiles all unread mail from accessible conferences
5. Downloads as single archive (free download)

### Bulletins (`B`)

View system bulletins:

1. Type `B`
2. View bulletin menu (BULLHELP.TXT)
3. Enter bulletin number to view
4. Press `?` to redisplay menu

---

## Tips & Best Practices

### Efficient Navigation

- Use expert mode (`X`) to hide menus and speed up navigation
- Learn essential commands: R, E, F, D, U, J, G
- Use `<` `>` for quick conference switching
- Flag files (`A`) instead of downloading one by one

### Messaging

- Check mail immediately on login (R command)
- Use `MS` to scan all conferences at once
- Reply inline with `R` while reading
- Quote sparingly - don't quote entire messages

### File Transfers

- Use `N` command to see what's new since last call
- Flag multiple files before downloading
- Upload descriptions carefully - they help others find files
- Check your ratio with `S` command

### Etiquette

- Read bulletins (`B`) for system rules
- Don't page sysop excessively
- Provide accurate file descriptions when uploading
- Be respectful in public messages
- Don't share your password

### Troubleshooting

- Lost connection? Call back - partials are saved
- Garbled display? Try `M` to toggle ANSI mode
- Confused? Press `?` for menu, `H` for help
- Can't find command? Check `^` for extended help

---

## Getting Help

- **In-system help**: Press `H` at main prompt
- **Extended help**: Press `^` for detailed help files
- **Menu display**: Press `?` in expert mode
- **Command info**: Most commands show usage when invoked
- **Sysop contact**: Use `C` command to leave message

---

## Quick Command Reference

| Command | What It Does |
|---------|--------------|
| `?`     | Display menu |
| `^`     | Extended help |
| `<` `>` | Previous/next conference |
| `<<` `>>` | Previous/next message base |
| `A`     | Alter file flags |
| `B`     | View bulletins |
| `C`     | Comment to sysop |
| `CF`    | Conference configuration |
| `D`     | Download files |
| `E`     | Enter message |
| `F`     | File listings |
| `FR`    | Reverse file listings |
| `FS`    | Full status view |
| `G`     | Goodbye (logout) |
| `H`     | Help |
| `J`     | Join conference |
| `JM`    | Join message base |
| `M`     | Toggle ANSI/mono |
| `MS`    | Mail scan |
| `N`     | New files since date |
| `O`     | Operator page |
| `OLM`   | Online message |
| `Q`     | Quiet node toggle |
| `R`     | Read messages |
| `RL`    | Relogon |
| `RZ`    | Zmodem upload |
| `S`     | Status |
| `T`     | Time |
| `U`     | Upload files |
| `UP`    | Node uptime |
| `V`     | View text file |
| `VER`   | Version info |
| `VO`    | Voting booth |
| `W`     | Write user parameters |
| `WHO`   | Who's online |
| `X`     | Expert mode toggle |
| `Z`     | Zippy text search |
| `ZOOM`  | ZOOM mail |

---

**Welcome to AmiExpress! Enjoy the authentic BBS experience!**
