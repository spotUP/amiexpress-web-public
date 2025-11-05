# MCI Codes Implementation Status

**Reference**: AmiExpress-Sources/express.e lines 5290-5850

**Total MCI Codes**: 60+ (40 basic + 20+ special)

---

## Implementation Status

### ✅ Implemented (Basic User/System Info)

| Code | Description | Implemented |
|------|-------------|-------------|
| ~N   | Username | ✅ |
| ~UL  | User Location | ✅ |
| ~#   | Phone Number | ✅ |
| ~TC  | Times Called | ✅ |
| ~TT  | Today's Calls | ✅ |
| ~LC  | Last Call Date | ✅ |
| ~M   | Messages Posted | ✅ |
| ~A   | Access/Security Level | ✅ |
| ~S   | Slot Number (User ID) | ✅ |
| ~CA  | Conference Access | ✅ |
| ~BR  | Baud Rate | ✅ |
| ~HW  | Hardware/Computer Type | ✅ |
| ~TL  | Time Limit | ✅ |
| ~TR  | Time Remaining | ✅ |
| ~UB  | Upload Bytes | ✅ |
| ~DB  | Download Bytes | ✅ |
| ~SU  | Upload Size (formatted) | ✅ |
| ~SD  | Download Size (formatted) | ✅ |
| ~FU  | Files Uploaded | ✅ |
| ~FD  | Files Downloaded | ✅ |
| ~BD  | Today's Bytes Downloaded | ✅ |
| ~LG  | Node Number | ✅ |
| ~IN  | Internet Name (email) | ✅ |
| ~RN  | Real Name | ✅ |
| ~AK  | Alias/Handle | ✅ |

### ✅ Implemented (Conference Info)

| Code | Description | Implemented |
|------|-------------|-------------|
| ~CF  | Current Conference | ✅ |
| ~CN  | Conference Number | ✅ |
| ~CT  | Total Conferences | ✅ |
| ~VD  | Version Display | ✅ |
| ~VE  | Version Full | ✅ |

### ✅ Implemented (Date/Time/System)

| Code | Description | Implemented |
|------|-------------|-------------|
| ~ND  | Node Date/Time | ✅ |
| ~DT  | Date/Time | ✅ |
| ~OT  | Time Only | ✅ |
| ~OD  | Date Only | ✅ |
| ~SP  | Space | ✅ |
| ~CR  | Carriage Return | ✅ |
| ~NS  | No Space | ✅ |

### ✅ Implemented (Colors - Foreground)

| Code | Description | Implemented |
|------|-------------|-------------|
| ~c0  | Black | ✅ |
| ~c1  | Blue | ✅ |
| ~c2  | Green | ✅ |
| ~c3  | Cyan | ✅ |
| ~c4  | Red | ✅ |
| ~c5  | Magenta | ✅ |
| ~c6  | Yellow | ✅ |
| ~c7  | White | ✅ |

### ✅ Implemented (Colors - Background)

| Code | Description | Implemented |
|------|-------------|-------------|
| ~b0/~z0 | Black bg | ✅ |
| ~b1/~z1 | Blue bg | ✅ |
| ~b2/~z2 | Green bg | ✅ |
| ~b3/~z3 | Cyan bg | ✅ |
| ~b4/~z4 | Red bg | ✅ |
| ~b5/~z5 | Magenta bg | ✅ |
| ~b6/~z6 | Yellow bg | ✅ |
| ~b7/~z7 | White bg | ✅ |

### ✅ Implemented (Text Styles)

| Code | Description | Implemented |
|------|-------------|-------------|
| ~n1  | Bold | ✅ |
| ~n2  | Dim | ✅ |
| ~n3  | Italic | ✅ |
| ~n4  | Underline | ✅ |
| ~n5  | Blink | ✅ |
| ~n6  | Reverse | ✅ |
| ~n7  | Hidden | ✅ |
| ~n8  | Reset | ✅ |
| ~n9  | Normal | ✅ |

---

## ❌ NOT Implemented (HIGH PRIORITY)

### Command Execution

| Code | Description | Priority | Notes |
|------|-------------|----------|-------|
| **~XC** | **Execute Command** | **CRITICAL** | **Needed for NI/NO tools!** |

**Current Status**: Added to Logon.txt and Logoff.txt but NOT implemented in parser.

**Blocks**: WHO door user tracking (NI/NO tools need this to run on login/logout)

**Reference**: express.e lines 5470-5490

---

## ❌ NOT Implemented (Message/Conference Lists)

| Code | Description | Priority | Reference |
|------|-------------|----------|-----------|
| ~CL. | Conference List | High | express.e:5588-5605 |
| ~CD. | Conference Description | High | express.e:5606-5620 |
| ~ML. | Message Base List | Medium | express.e:5621-5635 |
| ~MD. | Message Base Description | Medium | express.e:5636-5650 |

**Current Status**: Partial (~CL, ~CD implemented; ~ML, ~MD stubbed)

**Notes**: ~CL and ~CD work, but ~ML and ~MD need message base support.

---

## ❌ NOT Implemented (File Area)

| Code | Description | Priority | Reference |
|------|-------------|----------|-----------|
| ~FC  | Files in Current Area | Medium | express.e:5408 |
| ~FL  | File List | Low | express.e:5409 |
| ~FF  | Free Files | Low | express.e:5410 |

**Current Status**: Stubbed (returns '0' or empty)

**Needs**: File area database implementation

---

## ❌ NOT Implemented (Special System Codes)

| Code | Description | Priority | Reference |
|------|-------------|----------|-----------|
| ~SC  | System Calls Today | Low | express.e:5407 |
| ~MB  | Current Message Base | Medium | express.e:5442 |
| ~MN  | Message Base Number | Medium | express.e:5443 |

**Current Status**: Stubbed (returns '0' or empty)

---

## ❌ NOT Implemented (Formatting/Control)

| Code | Description | Priority | Reference |
|------|-------------|----------|-----------|
| ~f   | Fill character | Medium | express.e:5471-5480 |
| ~w   | Word wrap | Medium | express.e:5481-5489 |
| ~x   | X position | Low | express.e:5491-5500 |
| ~y   | Y position | Low | express.e:5501-5510 |
| ~q   | Query/Prompt | Medium | express.e:5511-5520 |
| ~h   | Hotkey | Medium | express.e:5521-5530 |

**Current Status**: Not implemented

**Notes**: These are advanced formatting codes. Lower priority than ~XC.

---

## ❌ NOT Implemented (Special Screen/String Codes)

| Code | Description | Priority | Reference |
|------|-------------|----------|-----------|
| ~SS_ | Show String | Low | express.e:5531-5540 |
| ~SX_ | String Exact | Low | express.e:5541-5550 |
| ~SR_ | String Replace | Low | express.e:5551-5560 |
| ~CC_ | Custom Color | Low | express.e:5561-5570 |
| ~CR_ | Custom Reset | Low | express.e:5571-5580 |
| ~SM_ | Set Mode | Low | express.e:5581-5590 |
| ~SMO | Screen Mode On | Low | express.e:5736-5745 |
| ~SMC | Screen Mode Clear | Low | express.e:5746-5755 |

**Current Status**: Not implemented

**Notes**: These are advanced/custom codes. Very low priority.

---

## Implementation Priority

### Phase 1: CRITICAL (Blocks Features)
1. **~XC** - Execute command (BLOCKING: WHO door NI/NO tools)

### Phase 2: HIGH (User Experience)
1. ~CL. - Conference list (works but verify)
2. ~CD. - Conference description (works but verify)
3. ~ML. - Message base list (needs message base support)
4. ~MD. - Message base description (needs message base support)

### Phase 3: MEDIUM (Nice to Have)
1. ~f - Fill character (formatting)
2. ~w - Word wrap (formatting)
3. ~q - Query/Prompt (input handling)
4. ~h - Hotkey (input handling)
5. ~FC, ~FL, ~FF - File area codes
6. ~MB, ~MN - Message base codes

### Phase 4: LOW (Advanced Features)
1. ~x, ~y - Cursor positioning
2. ~SS_, ~SX_, ~SR_ - String manipulation
3. ~CC_, ~CR_ - Custom colors
4. ~SM_, ~SMO, ~SMC - Screen modes

---

## Next Steps

### Immediate
1. **Implement ~XC** (express.e:5470-5490)
   - Parse command after ~XC
   - Execute command asynchronously
   - Handle door execution
   - Handle system commands

2. **Test ~XC with NI/NO tools**
   - Verify NI runs on login (Logon.txt)
   - Verify NO runs on logout (Logoff.txt)
   - Verify WHO door reads tracking data

### Short Term
1. Verify ~CL and ~CD work correctly
2. Implement ~ML and ~MD (needs message base)
3. Implement ~f and ~w for better formatting

### Long Term
1. Implement remaining special codes
2. Full express.e MCI code parity
3. Automated MCI code testing

---

## Testing

### Current Tests
- Basic user info codes tested via login screens
- Color codes tested via various screens
- Conference codes tested via menu

### Needed Tests
- ~XC command execution (CRITICAL)
- ~ML/~MD message base codes
- ~f/~w formatting codes
- ~q/~h input codes

---

## Reference

**Express.e MCI Code Implementation**: Lines 5290-5850

**Key Functions**:
- `processMciCmd()` - Lines 5259-5769
- `processMci()` - Lines 5770-5850

**To extract specific implementation**:
```bash
sed -n '5290,5850p' AmiExpress-Sources/express.e > mci_implementation.e
```

**To search for specific MCI code**:
```bash
npx tsx Scripts/reference-checker.ts function processMciCmd
sed -n '5290,5850p' AmiExpress-Sources/express.e | grep -A20 "StrCmp(cmd,'XC')"
```

---

**Status**: 52/60+ codes implemented (87%)
**Critical Blocker**: ~XC command execution
**Next Priority**: Message base codes (~ML, ~MD)
