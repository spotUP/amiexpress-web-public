# AmiExpress DoorKIT 1.01 (AEKIT101) – 68K Door API Notes

Source drop `/dev/docs/AEKIT101` contains the original AmiExpress 2.20 door interface, glue headers, and sample code. Key files:
- Docs/DoorDocs.txt – authoritative command list and semantics for the JH/DT/BB API.
- Docs/AEdoor.CMDS.txt – short command summary + glue usage.
- AE.Includes/DoorHeader.h – constants for all door opcodes (JH_*, DT_*, BB_*, etc.) and JHMessage struct layout.
- AE.Includes/Glue.h – glue function prototypes (Register, ShutDown, getuserstring, putuserstring, showgfile, Chain, Zmodem helpers, semaphore access, ACS checks, etc.).
- Sources/MISC/AEDoor.c, NAMELESS/AEHelp.c, EMPiRE/Page.c/FrontEnd.c – working examples.
- Sources/GetIconTooltype.c – reference for icon.library FindToolType (already aligned in our parser).

## Door IPC (AEDoorPort)
- Reply port naming: doors pick a unique reply port `AEDoorRP.xyz` (3 digits) by probing FindPort; register message uses this name in `String`, `Command=JH_REGISTER`, `Data=2`, `NodeID=-1`, `LineNum=0`. Control port is `AEDoorPort<n>` (n = node id argument from AmiExpress).
- Message struct from DoorHeader.h + AmiConSASc.c: `Message Msg; char String[200]; int Data; int Command; int NodeID; int LineNum; ULONG signal; Process *aeproc; APTR *Semi; APTR Filler1; APTR Filler2;` (Filler* used for bulk pointers in LOAD/SAVE calls).
- Doors talk to the node via message port `AEDoorPort<n>` (n = node number). Message struct is `struct JHMessage { Message Msg; char String[200]; int Data; int Command; int NodeID; int LineNum; ULONG signal; struct Process *aeproc; APTR *Semi; APTR Filler1; APTR Filler2; }`.
- First command must be `JH_REGISTER` (Command=1) to bump door count; on exit send `JH_SHUTDOWN` (Command=2) so the node can close the port when active doors = 0. Carrier/timeouts must auto-call ShutDown and the door’s `end()` cleanup.
- Commands are sent by filling String/Data/Command and replying; all values are strings except Data as noted. Loss carrier/timeout return Data=-1 on input ops (JH_LI/JH_PM/JH_HK).

## Core JH (0–99)
- JH_LI (0): line input with default String, maxlen in Data → String result; Data=-1 on drop/timeout.
- JH_REGISTER (1): must be first call.
- JH_SHUTDOWN (2): must be last call.
- JH_WRITE (3): send text (no CR).
- JH_SM (4): send text; Data=1 appends CR/LF.
- JH_PM (5): prompt, maxlen in Data → String result; Data=-1 on drop/timeout.
- JH_HK (6): hotkey prompt → single char in String; Data=-1 on drop/timeout.
- JH_SG (7): display g-file by partname (no extension); resolves Node/Conf, language, ACS suffixes (e.g., Bull10.txt.gr).
- JH_SF (8): display text by full path.
- JH_EF (9): invoke internal msgbase editor on path; Data=-1 on drop/timeout else 1.
- JH_CO (10): console-only output; Data=1 adds CR/LF.
- JH_BBSNAME (11), JH_SYSOP (12): fetch strings.
- JH_FLAGFILE (13): add filename to flagged list (must be in download path).
- JH_SHOWFLAGS (14): obsolete; JH_ExtHK/JH_DL share 15; JH_SIGBIT 16; JH_FetchKey 17; JH_SO 18 reserved.
- Non-stop file view variants seen in glue: `JH_SF_NSF`, `JH_SG_NSF` (IDs not in DoorHeader) used to display without pause; note gap to implement.
- `QUICK_KEY` (ID not in DoorHeader) returns an int; FetchKey/sigkey/Fhotkey are extra raw-key fetch helpers.
- `JH_CK` (500) returns “1” in String if key pressed (used as getkey).

## DT/BB/ENV commands (100+)
- User fields get/set (Data=1 get, 0 set; String carries value): DT_NAME 100, DT_PASSWORD 101, DT_LOCATION 102, DT_PHONENUMBER 103, DT_SLOTNUMBER 104, DT_ACCESSLEVEL/SECSTATUS 105, DT_RATIOTYPE 106, DT_RATIO 107, DT_MESSAGESPOSTED 109, DT_UPLOADS 110, DT_DOWNLOADS 111, DT_TIMESCALLED 112, DT_TIMELASTON 113 (seconds since epoch), DT_TIMEUSED 114 (seconds), DT_TIMELIMIT 115 (seconds/day), DT_TIMETOTAL 116 (seconds), DT_BYTESUPLOAD 117, DT_BYTEDOWNLOAD 118, DT_DAILYBYTELIMIT 119, DT_DAILYBYTEDLD 120, DT_EXPERT 121, DT_LINELENGTH 122, DT_LANGUAGE 527, DT_QUICKFLAG 528, DT_GOODFILE 529 (2=let internal checker decide), DT_ANSICOLOR 530, DT_MSGCODE 543, DT_FILECODE 545, DT_ISANSI 541, DT_ADDBIT/REMBIT/QUERYBIT 1000–1002 (reserved).
- ACTIVE_NODES 123: returns 10-char string of X/_ for up to 9 nodes.
- DT_DUMP 124: dump user struct to file path in String.
- DT_TIMEOUT 125: get/set door timeout seconds.
- BB_CONFNAME 126 / BB_CONFLOCAL 127: get/set conference name/location; BB_LOCAL 128: current BBS root.
- BB_STATUS 129: ONLINE/OFFLINE; BB_MAINLINE 131: menu prompt args prior to door entry.
- RETURNCOMMAND 136: schedule internal command on exit.
- ZMODEMSEND 137 / ZMODEMRECEIVE 138: batch transfers; Data=1 success, -2 carrier drop, 0 failure.
- SCREEN_ADDRESS 139 / RAWSCREEN_ADDRESS 141: screen pointers; BB_TASKPRI 140.
- BB_CHATFLAG 142: ON/OFF; BB_CHATSET 162: get/set.
- DT_STAMP_LASTON 143: formatted last-on date; DT_STAMP_CTIME 144: formatted current time; DT_CURR_TIME 145: current time seconds.
- DT_CONFACCESS 146: 9-char access mask X/_.
- BB_NODEID 149: current node number string.
- BB_CALLERSLOG 150 / BB_UDLOG 151: append text.
- EXPRESS_VERSION 152: current version string.
- PRV_COMMAND 508: execute internal menu command immediately (String).
- BB_CONFNUM 510: current conf number (0–8 per doc; note express supports more).
- BB_DROPDTR 511: drop carrier.
- BB_GETTASK 512: returns express task address in msg.task.
- NODE_*: NODE_DEVICE 503, NODE_UNIT 504, NODE_BAUD 505 (init baud), NODE_BAUDRATE 516 (connect rate).
- BB_LOGONTYPE 517: 0 AWAIT_LOGON, 1 SYSOP_LOGON, 2 LOCAL_LOGON, 3 REMOTE_LOGON.
- BB_SCRLEFT/TOP/WIDTH/HEIGHT 518–521: screen geometry.
- BB_PURGELINE/START/END 522–524: flush serial buffers.
- BB_NONSTOPTEXT 525: set pause behavior; BB_LINECOUNT 526: get/set current line count.
- MULTICOM 531: returns pointer to global MultiComm semaphore (non-public).
- LOAD_/SAVE_ACCOUNT 532/533, SAVE_CONFDB 534, LOAD_CONFDB 535, GET_CONFNUM 536, SEARCH_ACCOUNT 537, APPEND_ACCOUNT 538, LAST_ACCOUNTNUM 539: account/conf DB helpers for doors that manipulate user/conf DB directly.
- BATCHZMODEMSEND 542: batch send.
- ACP_COMMAND 544: send ACP command (constants in Glue.h).
- EDITOR_STRUCT 546, BYPASS_CSI_CHECK 547, SENTBY 548: specialized/underdocumented.
- Net transfers in glue: `NETUPLOAD`/`NETDOWNLOAD` commands (IDs not defined in DoorHeader) parallel ZMODEM receive/send; return codes mirror ZMODEM (1 success, 0 fail, -2 carrier drop).

## Glue API (Glue.h)
- Register(node), ShutDown(), getuserstring(buf, cmd), putuserstring(buf, cmd), prompt(str, out, maxlen), lineinput(str,out,maxlen), hotkey(str,out), sendmessage/sm/mciputstr/MciSendStr, ConOnly/SerOnly, showgfile (auto-append .txt/.gr1 and language/ACS variants), showfile(full path), Editfile(path,len) (internal editor), FlagFile, Chain(cmd,node,opt), getkey/Fhotkey/FfetchKey/sigkey/signal helpers, semaphore access (GetSemaphore), ACS checks (AcsStat/IsAccess), file locking TLock, BatchDownload/Download/Upload, DateToString/TimeToString/GetTheDate/GetTheTime, LastCommand, AcpCommand, account and ConfDB helpers (Load_Account/Save_Account/Save_ConfDB/Load_ConfDB/Search_Account/New_Account/LastAccountNum).
- ACP_COMMAND constants (Glue.h): ACP_CONTROLCOMMAND = -1, ACP_CUSTOMCOMMAND = 19; system commands 1–15 (SysopLogin, InstantLogin, AEShell, ToggleChat, ExitNode, LocalLogin, ReserveNode, Accounts, InitModem, NodeOffHook, QuietNode, NodeConfig, NodeChat, SaveWin, NRAMS).
- sendmessage behavior (AmiConSASc): splits strings into 79-char chunks, increments LineNum, auto-pauses after 22 lines with hotkey “press <RETURN> to continue” and clears the pause text; similar path for mciputstr.
- showgfile ACS search (CheckToDisplay): rounds user security down in steps of 5, tries `<base><sec>.txt`, `.txt.gr`, `.GR1`, then falls back to base .txt/.gr1; uses TLock to test existence.
- Date/time helpers use UnixTimeOffset=252482400 (convert between Unix seconds and Amiga DateStamp); DateToString/TimeToString format via DateToStr(FORMAT_USA).
- Account/ConfDB helpers: LOAD_ACCOUNT/SAVE_ACCOUNT/APPEND_ACCOUNT/Search_Account use Data as user slot, Filler1/Filler2 for struct pointers; LOAD_/SAVE_CONFDB use NodeID=conf, Filler1=data; GET_CONFNUM fills conf name/location via Filler1/Filler2 and Data=conf num.
- MULTICOM returns a semaphore pointer in msg->Semi (non-public).
- showgfilensf/showfilensf call non-stop variants; implement as “no pause” screen display options.

## Sample behaviors (from sources)
- AEDoor.c: minimal skeleton showing Register/ShutDown, prompt/hotkey, showgfile, getuserstring/putuserstring usage.
- Page.c/FrontEnd.c: examples of prompt/hotkey loops and multi-node usage.
- AEHelp.c: replacement for HELP command, demonstrates menu redraw and command execution.

## Implementation notes for the web port
- Use these opcodes for our 68K door bridge (AEDoorPort emulation): serialize JHMessage (200-byte String, Data/Command ints) and mirror Data=-1 semantics on carrier/timeout.
- Enforce registration flow: first message must be JH_REGISTER; on door termination ensure JH_SHUTDOWN is sent automatically if the door exits unexpectedly.
- Implement showgfile rules: resolve part file names with language and ACS suffixes; append .txt/.gr per express rules, and search node/Conf paths.
- Pause/nonstop: BB_NONSTOPTEXT toggles text pausing; BB_LINECOUNT and lineInput/hotkey must sync with pagination.
- Access control: DT_CONFACCESS returns an X/_ mask; IsAccess/AcsStat helpers should align with ACS flags.
- Account helpers LOAD_/SAVE_ACCOUNT and ConfDB calls imply doors can mutate user/conf records directly—sandbox or emulate safely.
- ZMODEM ops must surface Data codes 1 / -2 / 0; batch send has separate code (542).
- BB_PURGELINE* must clear serial buffers between inputs; BB_DROPDTR should drop telnet/WebSocket cleanly.
- BB_LOGONTYPE / NODE_* values inform doors about local/remote state and carrier rate; populate from session/protocol.

## Gaps resolved
- JHMessage layout/endianness: all ints are 32-bit native 68K, big-endian; String is fixed 200 bytes. Align emulation bridge to big-endian reads/writes; padding matches Amiga exec message layout (mn_Length includes whole struct).
- BB_CONFNUM range: DoorHeader and glue use GET_CONFNUM (536) with Data=conf index and Filler1/Filler2 for name/location; not limited to 0–8—use cmds.numConf (ConfConfig NCONFS) for bounds, 1-based like conf dirs. BB_CONFNUM (510) returns current conf number; treat as full range, not 0–8.
- showgfile ACS search: security is rounded down in steps of 5 (e.g., 255→255, 254→250 … down to 5) and probes `<base><sec>.txt`, `<base><sec>.txt.gr`, `<base><sec>.GR1`, then base .txt/.txt.gr/.GR1.
- Pausing: sendmessage wraps at 79 chars, tracks LineNum, auto-pauses after 22 lines with hotkey “press <RETURN> to continue”, then clears the pause line.
- Date/time: UnixTimeOffset 252482400 bridges Unix epoch↔Amiga DateStamp; DateToString/TimeToString use FORMAT_USA via DateToStr.
- Net transfers: NetUpload/NetDownload mirror ZMODEMRECEIVE/ZMODEMSEND return codes (1 success, 0 fail, -2 carrier drop); BatchDownload uses BATCHZMODEMSEND with Filler1 pointer.
- Non-stop display: JH_SF_NSF/JH_SG_NSF (not in DoorHeader) display files without pause; QUICK_KEY/JH_CK provide raw key presence/polling.
- Account/ConfDB helpers: LOAD_/SAVE_/APPEND_ACCOUNT use Data=user slot, Filler1/Filler2 as struct pointers; LOAD_/SAVE_CONFDB use NodeID=conf, Filler1=data; GET_CONFNUM fills conf name/location via Filler1/Filler2, Data=conf index.

## Still open (need express.e/door sources)
- EDITOR_STRUCT (546), BYPASS_CSI_CHECK (547), SENTBY (548) not described; requires express.e trace.
- ACP custom commands beyond listed system ones; confirm door usage before emulating.
