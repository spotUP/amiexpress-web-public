# Real Amiga XIM Door Message Sequences

Reference logs from actual AmiExpress BBS running on real Amiga hardware.
Use these to validate our emulator's XIM protocol implementation.

## Source Logs
- Bulls: `/Documentation/4-Door-Developers/bulls.log`
- AquaScan: `/Documentation/4-Door-Developers/aquascanlog.txt`
- RTW (WHO command): `/Documentation/4-Door-Developers/rtw.log`

---

## RTW (WHO Door) - XIM Startup Sequence

**Door Type**: XIM (Extended Interface Module)
**Command**: `WHO` (maps to DOORS:RTW/RTW)
**Real Amiga Log**: Lines 22-31

```
run door: DOORS:RTW/RTW

msg request: 1 (JH_REGISTER)     # First message - register with BBS
data: 2
string: AEDoorRP.000             # Reply port name in AREXX format

msg request: 102                 # Get user info (location?)
data: 1
string: test

msg request: 531                 # Unknown command
data: 1

[Then starts output with msg request: 4 (JH_SM) - print text]
```

**Key Observations**:
1. **First XIM message**: JH_REGISTER (cmd=1) with `data=2`
2. **Reply port name**: "AEDoorRP.000" (AREXX format, zero-padded)
3. **No INIT/STAT from BBS**: Door initiates communication, not BBS
4. **Rapid sequence**: Messages come within milliseconds of door start

**Critical**: RTW creates/registers its reply port ("AEDoorRP.000"), then starts making requests.
The BBS does NOT send initial INIT/STAT messages - the door starts the conversation.

---

## Bulls Door - XIM Startup Sequence

**Door Type**: XIM
**Command**: `Bulls` (maps to DOORS:EmP_Tools/Bulls)
**Real Amiga Log**: Lines 1-29

```
run door: DOORS:EmP_Tools/Bulls

msg request: 1 (JH_REGISTER)     # Register with BBS
data: 2
string: (empty)

msg request: 501 (RAWARROW)      # Enable raw keyboard controls
data: 0
string: (empty)

msg request: 177 (SV_NEWMSG)     # Set env string for /X console
data: 0
string: Bulls 2.2

msg request: 100 (DT_NAME)       # Get logged-on user's name
data: 1
string: Bulls 2.2

msg request: 122 (DT_LINELENGTH) # Get screen height
data: 1
string: REBEL                     # Response: user name

msg request: 131 (BB_MAINLINE)   # Read command line
data: 1
string: 29                        # Response: line length

msg request: 152 (EXPRESS_VERSION) # Get /X version
data: 1
string: EB                        # Response: command line

msg request: 510 (BB_CONFNUM)    # Get current conf number
data: 1
string: v5.3                      # Response: version

msg request: 525 (BB_NONSTOPTEXT) # Set nonstop text
data: 1
string: (empty)                   # Response: conf number

msg request: 4 (JH_SM)           # Print text - start of banner
data: 0
string: (empty)
```

**XIM Request Pattern**:
1. JH_REGISTER (1)
2. RAWARROW (501) - game mode setup
3. SV_NEWMSG (177) - set door name
4. DT_NAME (100) - get user info
5. DT_LINELENGTH (122) - get screen size
6. BB_MAINLINE (131) - get command line
7. EXPRESS_VERSION (152) - get BBS version
8. BB_CONFNUM (510) - get conference
9. BB_NONSTOPTEXT (525) - disable paging
10. JH_SM (4) - start output

**Key Observations**:
1. Bulls requests LOTS of BBS info before outputting anything
2. Uses `data: 1` to indicate "expecting reply"
3. The `string:` field in requests often contains door name/context
4. Responses come in NEXT message's string field

---

## AquaScan Door - XIM Startup Sequence

**Door Type**: XIM
**Command**: `FR` (maps to Doors:AquaScan/AquaScan.020)
**Real Amiga Log**: Lines 1-32

```
1764890167 run door: Doors:AquaScan/AquaScan.020

1764890168 msg request: 1 (JH_REGISTER)
data: 0
string: (empty)

msg request: 104 (DT_SLOTNUMBER?) # Get node/slot number
data: 1
string: (empty)

msg request: 163 (ENVSTAT?)       # Environment/status query
data: 0
string: 8                          # Response: slot number

msg request: 525 (BB_NONSTOPTEXT)
data: 1
string: (empty)

msg request: 501 (RAWARROW)
data: 1
string: (empty)

msg request: 131 (BB_MAINLINE)
data: 1
string: (empty)

msg request: 152 (EXPRESS_VERSION)
data: 1
string: FR                         # Response: command "FR"

msg request: 131 (BB_MAINLINE)    # Second BB_MAINLINE call
data: 1
string: v5.3                       # Response: version

msg request: 122 (DT_LINELENGTH)
data: 1
string: FR                         # Response: command again

msg request: 100 (DT_NAME)
data: 1
string: 29                         # Response: line length

msg request: 4 (JH_SM)            # Start output
data: 1
string: (empty)                    # Response: user name
```

**Key Observations**:
1. **Timestamps**: Each message has Unix timestamp (1764890168 = Dec 2025)
2. **Different request order**: Gets slot number (104) before other info
3. **ENVSTAT (163)**: Not seen in Bulls/RTW - AquaScan-specific?
4. **Two BB_MAINLINE calls**: Unusual - may be checking twice
5. **Responses interleaved**: String from request N appears in request N+1

---

## XIM Protocol Patterns (Observed)

### Common Startup Sequence
All doors follow this general pattern:

```
1. JH_REGISTER (1)         - "I'm a door, here's my reply port"
2. Configuration requests  - Get BBS info (version, user, screen size)
3. Setup commands         - RAWARROW, BB_NONSTOPTEXT, etc.
4. JH_SM output (4)       - Start printing door UI
```

### Data Field Semantics
- `data: 0` = Command with no reply expected, or sending data TO BBS
- `data: 1` = Query expecting reply FROM BBS
- `data: 2` = Registration/special mode (seen in JH_REGISTER)

### String Field Usage
- **In requests**: Context/parameter (user name, door name, etc.)
- **In responses**: Reply data appears in NEXT message's string field
- **Chain pattern**: Request N's response appears in Request N+1's string

### Request-Response Chaining
Real Amiga logs show responses are "carried forward":

```
Request 1: cmd=100, string="door_name"
Request 2: cmd=122, string="USER_NAME"    <- This is response to Request 1
Request 3: cmd=131, string="29"           <- This is response to Request 2
```

The door sends requests continuously, and each request carries the previous response.

---

## Critical Differences from Our Emulator

### Issue 1: BBS Sends INIT/STAT Messages
- **Real Amiga**: Door sends JH_REGISTER, then starts requesting
- **Our Emulator**: BBS sends INIT (0) and STAT (1) messages first
- **Fix Needed**: Remove BBS-initiated INIT/STAT, wait for door to start

### Issue 2: Reply Port Names
- **Real Amiga**: RTW uses "AEDoorRP.000" (AREXX format, zero-padded)
- **Our Emulator**: May use different port naming
- **Fix Needed**: Verify we support "AEDoorRP.XXX" format

### Issue 3: Response Chaining
- **Real Amiga**: Responses appear in next request's string field
- **Our Emulator**: May send responses as separate messages
- **Fix Needed**: Verify XIMProtocol implements chaining correctly

---

## XIM Command Reference (From Logs)

| Code | Name | Description | Data | String |
|------|------|-------------|------|--------|
| 1 | JH_REGISTER | Register door with BBS | 0-2 | Reply port name |
| 4 | JH_SM | Print text/string | 0-1 | Text to print |
| 6 | JH_HK | Hotkey/input request | 0 | Empty |
| 100 | DT_NAME | Get user name | 1 | Context |
| 102 | ? | Get user location? | 1 | Context |
| 104 | DT_SLOTNUMBER? | Get node/slot | 1 | Empty |
| 122 | DT_LINELENGTH | Get line length | 1 | Context |
| 125 | ? | Unknown | 0 | "1" |
| 129 | ? | Not implemented | 1 | Special char |
| 131 | BB_MAINLINE | Get command line | 1 | Context |
| 152 | EXPRESS_VERSION | Get BBS version | 1 | Context |
| 163 | ENVSTAT? | Env/status query | 0 | Result |
| 177 | SV_NEWMSG | Set env string | 0 | Door name |
| 501 | RAWARROW | Raw keyboard mode | 0-1 | Empty |
| 510 | BB_CONFNUM | Get conf number | 1 | Context |
| 525 | BB_NONSTOPTEXT | Nonstop mode | 1 | Empty |
| 531 | ? | Unknown | 1 | Context |

---

## Validation Checklist

Use these logs to validate our emulator:

- [ ] RTW sends JH_REGISTER with "AEDoorRP.000" as first message
- [ ] Bulls sends JH_REGISTER, then queries BBS info (501, 177, 100, 122, etc.)
- [ ] AquaScan sends JH_REGISTER, then queries slot (104) and ENVSTAT (163)
- [ ] All doors use `data: 1` for queries expecting replies
- [ ] Responses appear in next request's string field (chaining)
- [ ] No INIT/STAT messages sent BY BBS to door at startup
- [ ] Door initiates conversation, BBS responds to requests

---

## Testing Strategy

1. **Compare message sequences**: Run door in emulator, compare to real log
2. **Check reply port names**: Verify "AEDoorRP.XXX" format support
3. **Validate response chaining**: Ensure responses appear in next message
4. **Test data field semantics**: Verify 0=no-reply, 1=expect-reply, 2=register
5. **Remove BBS INIT/STAT**: Doors should send JH_REGISTER first, not wait

---

## References

- Real Amiga logs: `Documentation/4-Door-Developers/`
- XIM protocol docs: `Documentation/7-Reference Sources/XIM_PROTOCOL.md`
- express.e source: Search for "JH_REGISTER", "JH_SM", etc.
