# Screen Files Quick Reference
*Complete file listing for reference-board BBS*

## System Core Screens

### Logon/Logoff System
```
Node0/Node0/Screens/Logon.txt              - Main logon screen
Node0/Node0/Screens/Logon20.txt            - Logon screen (20% version)
Node0/Node0/Screens/Logon100.txt           - Logon screen (full version)  
Node0/Node0/Screens/Logoff.txt             - Main logoff screen
Node0/Node0/Screens/guestlogon.txt         - Guest user logon
```

### User Status Screens
```
Node0/Node0/Screens/Callers.txt            - Currently online users display
Node0/Node0/Screens/awaitscreen.txt        - Loading/waiting screen
Node0/Node0/Screens/join.txt               - Chat room entry
Node0/Node0/Screens/joined.txt             - Chat room confirmation
```

## Group/Scene Screens

### Fairlight (FLT) Screens
```
Screens/flt.txt                            - Main FLT intro screen
Screens/flt/001.flt.txt                    - FLT screen #1
Screens/flt/002.flt.txt                    - FLT screen #2  
Screens/flt/003.flt.txt                    - FLT screen #3
Screens/flt/004.flt.txt                    - FLT screen #4
Screens/flt/005.flt.txt                    - FLT screen #5
Screens/flt/bull15_.txt                    - FLT bulletin
```

### reference-board BBS Screens
```
Screens/reference-board.txt                      - Main reference-board welcome
Screens/reference-board/001.reference-board.txt        - reference-board screen #1
Screens/reference-board/002.reference-board.txt        - reference-board screen #2
Screens/reference-board/003.reference-board.txt        - reference-board screen #3
Screens/reference-board/004.reference-board.txt        - reference-board screen #4
Screens/reference-board/005.reference-board.txt        - reference-board screen #5
Screens/reference-board/006.reference-board.txt        - reference-board screen #6
Screens/reference-board/007.reference-board.txt        - reference-board screen #7
```

### Logoff Screens (Multiple Versions)
```
Screens/logoff/001.logoff.txt              - Logoff screen #1
Screens/logoff/002.logoff.txt              - Logoff screen #2
Screens/logoff/003.logoff.txt              - Logoff screen #3
```

## File Operation Screens

### Upload/Download Messaging
```
Screens/uploadmsg.txt                      - Upload instructions/status
Screens/downloadmsg.txt                    - Download instructions/status  
Screens/no_upload.txt                      - Upload rejection message
Screens/quicknew.txt                       - Quick new user info
Screens/quicknew2.txt                      - Quick info version 2
```

### File Transfer Warnings
```
Screens/uprough.txt                        - Upload rejection warning
Screens/_uprough.txt                       - Alternate upload warning
Screens/bbb.txt                            - File transfer issue message
```

## Bulletin/News Screens

### General Bulletins
```
Screens/BULL.TXT                           - Main bulletin
Screens/BULL20!.TXT                        - Bulletin (version 20)
Screens/callers!.txt                       - Enhanced callers display
```

## Conference-Specific Screens

### Conference 01 (Bulletin Board)
```
Conf01/Screens/Menu.txt                    - Conference main menu
Conf01/Screens/bull20.txt                  - Conference bulletin #20
Conf01/Screens/uploadmsg.txt               - Conference upload message
Conf01/Screens/downloadmsg.txt             - Conference download message
Conf01/Screens/Bulletins/bull1.txt         - Bulletin #1
Conf01/Screens/Bulletins/bull2.txt         - Bulletin #2
Conf01/Screens/Bulletins/bull3.txt         - Bulletin #3
Conf01/Screens/Bulletins/bull4.txt         - Bulletin #4
Conf01/Screens/Bulletins/bull5.txt         - Bulletin #5
Conf01/Screens/Bulletins/bull6.txt         - Bulletin #6
Conf01/Screens/Bulletins/bull7.txt         - Bulletin #7
Conf01/Screens/Bulletins/bull8.txt         - Bulletin #8
Conf01/Screens/Bulletins/bull9.txt         - Bulletin #9
Conf01/Screens/Bulletins/bull10.txt        - Bulletin #10
Conf01/Screens/Bulletins/bull11.txt        - Bulletin #11
Conf01/Screens/Bulletins/Bull12.txt        - Bulletin #12
Conf01/Screens/Bulletins/bull14.txt        - Bulletin #14
Conf01/Screens/Bulletins/bull15.txt        - Bulletin #15
Conf01/Screens/Bulletins/bull16.txt        - Bulletin #16
```

### Conference Menu Files (Various)
```
Conf1/Menu.txt                             - Conference 1 menu
Conf6/Menu.txt                             - Conference 6 menu  
Conf6/menu250.txt.GR                       - Conference 6 menu (graphics)
Conf9/Menu.txt                             - Conference 9 menu
Conf9/menu250.txt.GR                       - Conference 9 menu (graphics)
```

## Node-Specific Screens

### Node 0 Screens
```
Node0/Screens/Callers.txt                  - Node 0 callers display
Node0/Screens/awaitscreen.txt              - Node 0 loading screen
Node0/Screens/guestlogon.txt               - Node 0 guest logon
Node0/Screens/join.txt                     - Node 0 chat entry
Node0/Screens/joined.txt                   - Node 0 chat confirm
Node0/Screens/Logoff.txt                   - Node 0 logoff
Node0/Screens/Logon.txt                    - Node 0 logon
Node0/Screens/Logon100.txt                 - Node 0 logon (full)
Node0/Screens/Logon20.txt                  - Node 0 logon (20%)
```

### Node 2 Screens  
```
Node2/Screens/Callers.txt                  - Node 2 callers display
Node2/Screens/awaitscreen.txt              - Node 2 loading screen
Node2/Screens/guestlogon.txt               - Node 2 guest logon
Node2/Screens/join.txt                     - Node 2 chat entry
Node2/Screens/joined.txt                   - Node 2 chat confirm
Node2/Screens/Logoff.txt                   - Node 2 logoff
Node2/Screens/Logon.txt                    - Node 2 logon
Node2/Screens/Logon100.txt                 - Node 2 logon (full)
Node2/Screens/Logon20.txt                  - Node 2 logon (20%)
```

## Duplicate/Backup Locations
All screens also exist in:
- `/Source/Documentation/reference-board` (backup/documentation copies)
- Multiple node directories with identical or similar content

## Special File Types
- `.txt` - Standard ASCII text screens
- `.GR` - Graphics/overlay files  
- `.library` - Amiga library files (not displayable)
- Various numbered versions for different features

## Usage Notes
- Multiple versions exist for load balancing and features
- Conference screens are specific to each conference's theme
- Node-specific screens allow for different behavior per node
- Some files may be binary and not displayable as text
- Color codes and ANSI sequences vary by screen type