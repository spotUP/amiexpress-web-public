# BBS Screen Files Reference

Complete list of all screen files created for AmiExpress-Web, based on analysis of the original AmiExpress source code (`express.e` lines 6539-6655).

## Overview

Screen files are text files with ANSI escape codes and color formatting that display information to users at various points in their BBS session. Each screen corresponds to a specific `SCREEN_*` constant defined in `axenums.e`.

## File Locations

- **Node Screens**: `backend/data/bbs/BBS/Node0/Screens/`
- **BBS Root Screens**: `backend/data/bbs/BBS/Screens/`
- **Conference Screens**: `backend/data/bbs/BBS/Conf01/Screens/`

## Complete Screen File List

### Node Screens (15 files)

Located in: `backend/data/bbs/BBS/Node0/Screens/`

| File | Screen Constant | Purpose | MCI Codes Used |
|------|----------------|---------|----------------|
| **AWAITSCREEN.TXT** | SCREEN_AWAIT | Waiting for call screen, displays system info | %B, %L, %S, %T, %D, %N, %R, %C |
| **BBSTITLE.TXT** | SCREEN_BBSTITLE | BBS title logo and welcome banner | %B |
| **LOGON.TXT** | SCREEN_LOGON | Post-login welcome with user statistics | %U, %LD, %LT, %TC, %MP, %UF, %DF, %NM, %NF |
| **LOGOFF.TXT** | SCREEN_LOGOFF | Goodbye message with session stats | %B, %U, %OT, %MP, %DF, %UF, %D, %T |
| **JOIN.TXT** | SCREEN_JOIN | New user registration prompt | %B |
| **JOINED.TXT** | SCREEN_JOINED | Welcome confirmation for new users | %U, %B, %A, %R, %C |
| **BULL.TXT** | SCREEN_BULL / SCREEN_NODE_BULL | System bulletins and announcements | %D |
| **JoinConf.TXT** | SCREEN_JOINCONF | Conference selection menu | - |
| **JoinMsgBase.TXT** | SCREEN_JOINMSGBASE | Message base selection menu | %CF |
| **NEWUSERPW.TXT** | SCREEN_NEWUSERPW | New user password requirement | %S, %B |
| **NONEWUSERS.TXT** | SCREEN_NONEWUSERS | New user registration disabled | %B, %S |
| **GUESTLOGON.TXT** | SCREEN_GUESTLOGON | Guest login information and restrictions | %B |
| **LOCKOUT0.TXT** | SCREEN_LOCKOUT0 | Account locked/banned message | %S |
| **LOCKOUT1.TXT** | SCREEN_LOCKOUT1 | Account suspended message | %U, %D, %S |
| **PRIVATE.TXT** | SCREEN_PRIVATE | Private BBS access message | %S, %B |

### BBS Root Screens (6 files)

Located in: `backend/data/bbs/BBS/Screens/`

| File | Screen Constant | Purpose | MCI Codes Used |
|------|----------------|---------|----------------|
| **OnlyOnOneNode.TXT** | SCREEN_ONENODE | Duplicate login error | %U, %N, %LT, %A |
| **Logon24hrs.TXT** | SCREEN_LOGON24 | 24-hour time limit exceeded | %B, %U, %DL, %UT |
| **Languages.TXT** | SCREEN_LANGUAGES | Language selection menu | - |
| **RealNames.TXT** | SCREEN_REALNAMES | Real name requirement prompt | %U |
| **InternetNames.TXT** | SCREEN_INTERNETNAMES | Internet email address prompt | - |
| **MailScan.TXT** | SCREEN_MAILSCAN | Mail scanning progress display | %NM, %PM, %TM |

### Conference Screens (6 files)

Located in: `backend/data/bbs/BBS/Conf01/Screens/`

| File | Screen Constant | Purpose | MCI Codes Used |
|------|----------------|---------|----------------|
| **MENU.TXT** | SCREEN_MENU | Main menu with all BBS commands | %B, %CF, %R |
| **BULL.TXT** | SCREEN_CONF_BULL | Conference-specific bulletins | %CF, %TM, %NM, %LD, %LT, %AU |
| **DownloadMsg.TXT** | SCREEN_DOWNLOAD | Download prompt and information | %F, %S, %K, %R, %T |
| **UploadMsg.TXT** | SCREEN_UPLOAD | Upload guidelines and instructions | - |
| **FileHelp.TXT** | SCREEN_FILEHELP | File area command reference | - |
| **NoUploads.TXT** | SCREEN_NOUPLOADS | Uploads disabled message | %S |

### Additional Screens (5 not yet created)

These screens exist in AmiExpress but were not created yet:

| Screen Constant | Purpose | File Pattern |
|----------------|---------|--------------|
| SCREEN_NONEWATBAUD | No new users at this baud rate | NONEWAT{baud}.TXT |
| SCREEN_NOT_TIME | Not available at this time | NOTTIME{baud}.TXT |
| SCREEN_NOCALLERSATBAUD | No callers at this baud rate | NOCALLERSAT{baud}.TXT |
| SCREEN_CONF_JOINMSGBASE | Conference message base join | JoinMsgBase.TXT (in conf dir) |
| RAWSCREEN_ADDRESS | Special raw screen mode | (handled programmatically) |

## ASCII Art Styles

Each screen file includes custom ASCII art logos using ANSI box-drawing characters:

- **Block Style** (█, ╔, ╗, ║, etc.) - Used for major headers like BBSTITLE, LOGON
- **Line Style** (═, ─, │) - Used for separators and borders
- **Standard ASCII** - Used for simpler screens

## ANSI Color Codes

All screens use standard ANSI color codes:

| Code | Color | Usage |
|------|-------|-------|
| `[1;36m` | Bright Cyan | Primary headers and titles |
| `[1;33m` | Bright Yellow | Section headers |
| `[1;37m` | Bright White | Important text and labels |
| `[32m` | Green | Success messages and affirmative info |
| `[35m` | Magenta | Secondary headers and separators |
| `[31m` | Red | Errors and warnings |
| `[36m` | Cyan | Information text |
| `[33m` | Yellow | Prompts and labels |
| `[37m` | White | Body text |
| `[0m` | Reset | End color formatting |
| `[2J[H` | Clear Screen | Used at start of most screens |

## MCI (Macro Control Interface) Codes

Placeholder codes that are replaced with dynamic content:

### User Information
- `%U` - Username
- `%A` - Access level
- `%TC` - Total calls
- `%MP` - Messages posted
- `%UF` - Files uploaded
- `%DF` - Files downloaded
- `%LD` - Last login date
- `%LT` - Last login time
- `%OT` - Online time (current session)

### System Information
- `%B` - BBS name
- `%S` - Sysop name
- `%L` - BBS location
- `%D` - Current date
- `%T` - Current time
- `%N` - Node number
- `%R` - Baud rate / Time remaining
- `%C` - Available conferences

### Message/File Information
- `%NM` - New messages
- `%PM` - Private messages
- `%TM` - Total messages
- `%NF` - New files
- `%CF` - Current conference
- `%F` - Filename
- `%S` - File size
- `%K` - File size in KB

### Statistics
- `%DL` - Daily time limit
- `%UT` - Time used today
- `%AU` - Active users

## Display Logic (from express.e)

```c
PROC displayScreen(screenType)
  DEF screenfile[255]:STRING
  DEF screencheck[255]:STRING
  DEF res
  res:=FALSE
  SELECT screenType
    CASE SCREEN_AWAIT
      StringF(screenfile,'\sAWAITSCREEN.TXT',nodeScreenDir)
      IF fileExists(screenfile) THEN res:=displayFile(screenfile)
    CASE SCREEN_BULL
      StringF(screencheck,'\s\s',cmds.bbsLoc,'BULL')
      IF (findSecurityScreen(screencheck,screenfile)) THEN res:=displayFile(screenfile)
    ...
  ENDSELECT
ENDPROC res
```

## Security Screen System

AmiExpress supports security-level specific screen files using the pattern:
- `SCREEN.TXT` - Default for all users
- `SCREEN.255` - Only for access level 255 (sysop)
- `SCREEN.100` - Only for access level 100+
- etc.

The `findSecurityScreen()` function checks for the highest matching security level file.

## File Format

All screen files follow this format:

```
[2J[H                    <- Clear screen
[1;36m                   <- Color code
  ASCII ART HEADER
[0m                      <- Reset color
[35m════════...          <- Separator line
[1;33m Section Header[0m
[37m Body text...
```

## Testing

To test screen files:
1. Place files in appropriate directories
2. Trigger the corresponding screen display event
3. Verify ANSI codes render correctly
4. Check MCI codes are replaced with actual values

## References

- **Source Analysis**: `AmiExpress-Sources/express.e` lines 6539-6655
- **Screen Constants**: `AmiExpress-Sources/axenums.e` line 19
- **Implementation**: `backend/src/index.ts` (displayScreen equivalent)
- **MCI Processing**: To be implemented in display functions

## Screen File Statistics

- **Total Files Created**: 27
- **Node-specific**: 15
- **BBS Root**: 6
- **Conference-specific**: 6
- **Total ANSI Art Headers**: 27
- **Average File Size**: ~2.5 KB
- **Total Lines of ANSI Art**: ~800+

## Future Enhancements

Potential improvements for screen files:

1. **Dynamic Content**: Implement MCI code processing
2. **Security Levels**: Create security-specific variants (e.g., BULL.255 for sysop)
3. **Multilingual**: Create language-specific versions (e.g., MENU.ES for Spanish)
4. **Animations**: Add ANSI animation sequences for special screens
5. **Seasonal Themes**: Holiday-themed variations
6. **Custom Fonts**: Additional ASCII art font styles
7. **Screen Editor**: Web-based ANSI screen editor tool

## Maintenance

To add new screen files:

1. Check `axenums.e` for SCREEN_* constant
2. Check `express.e` displayScreen() for file path pattern
3. Create file with appropriate ASCII art header
4. Use consistent ANSI color scheme
5. Add MCI code placeholders as needed
6. Test with actual BBS display function
7. Document in this reference

---

**Created**: October 17, 2025
**Based on**: AmiExpress v5.6.0 source code analysis
**Status**: ✅ Complete - All essential screens created
