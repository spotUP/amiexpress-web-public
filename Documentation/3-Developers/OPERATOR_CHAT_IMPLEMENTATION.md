# Operator Chat Implementation - AmiExpress Source Mapping

## express.e Source Analysis

### Command: `O` (Page Sysop) - Lines 25370-25405

**Flow:**
1. Check if pages allowed (pagesAllowed counter)
2. If pagesAllowed=0, redirect to Comment to Sysop
3. Decrement pagesAllowed counter (if not -1 = unlimited)
4. Check security: `ACS_PAGE_SYSOP`
5. Set environment status: `ENV_REQ_CHAT`
6. Set `pagedFlag:=1`
7. Call `sysopPaged()` - sends notification
8. Check `sysopAvail` flag
   - If FALSE and no `ACS_OVERRIDE_CHAT`: show "not around" message
   - If TRUE: call `ccom()` to start chat

### sysopPaged() - Lines 24191-24201

**Actions:**
1. Run ExecuteOn script: `'SYSOP_PAGE'`
2. If `MAIL_ON_SYSOP_PAGE` tooltype exists AND sysop email set:
   - Send email notification to sysop
   - Subject: `"{bbsName}: Ami-Express page notification"`
   - Body: `"This is a notification that you were paged by {userName}."`

### ccom() - Lines 20336-20390

**Chat Setup:**
1. Log to callers log: `"Operator Paged at ({timestamp})"`
2. Show to sysop console: `"F1 Toggles chat"`
3. Try to run `PAGER` sys command
4. If PAGER fails, show paging animation:
   - Display: `"Paging {sysopName} (CTRL-C to Abort). ."`
   - Loop 20 times:
     - Beep (`DisplayBeep`)
     - Print " ."
     - Delay 50 ticks (1 second)
     - Check for carrier
     - Check for input (Ctrl-C aborts, chatF=1 means sysop answered)
5. If no answer after 20 seconds:
   - Show: `"The Sysop has been paged"`
   - Show: `"You may continue using the system"`
   - Show: `"until {sysopName} answers your request."`
   - Update status line with user name

### Key Variables

- **pagesAllowed**: Counter for max pages per user session
  - From ACS tooltype: `ACS.MAX_PAGES` (line 28540)
  - -1 = unlimited, 0 = none, N = max count
- **pagedFlag**: Set to 1 when page is active
- **chatF**: Set to 1 when sysop accepts chat
- **sysopAvail**: Boolean flag if sysop is available

### Security Checks

- `ACS_PAGE_SYSOP`: Required to use O command
- `ACS_OVERRIDE_CHAT`: Allows paging even if sysopAvail=FALSE
- `ACS_COMMENT_TO_SYSOP`: Fallback if pages disabled

## Implementation Mapping

### Our Implementation vs express.e

| express.e | Our Implementation | Notes |
|-----------|-------------------|-------|
| `pagesAllowed` counter | `pageCooldown` + DB check | Modern: time-based cooldown vs count |
| `sysopAvail` flag | `SysopAvailability` enum | More states: AVAILABLE/BUSY/AWAY/OFFLINE |
| `pagedFlag` global | `PageRequest` in DB | Persistent across reconnects |
| `chatF` flag | `PageStatus.ACCEPTED` | State machine approach |
| ExecuteOn('SYSOP_PAGE') | Socket.IO + Discord + Push | Modern notifications |
| Email notification | Discord webhook | Mobile-first approach |
| 20-second beep loop | Timeout in config | Configurable |
| "continue using system" | User state preserved | Same concept |

### Critical Flow Match

**express.e:**
```
1. User types O
2. Check ACS_PAGE_SYSOP
3. Check pagesAllowed counter
4. Set pagedFlag=1
5. Call sysopPaged() → ExecuteOn + email
6. Show "Paging..." with beeps
7. Wait for chatF=1 or timeout
8. If timeout: "continue using system"
9. If accepted: enter chat mode
```

**Our Implementation:**
```
1. User types PAGE
2. Check security level (match ACS_PAGE_SYSOP)
3. Check cooldown (match pagesAllowed)
4. Create PageRequest (match pagedFlag=1)
5. Call sendPageNotifications() → Socket.IO + Discord + Push
6. Show "Paging sysop..." message
7. Wait for ACCEPTED status or timeout
8. If timeout: show "No answer, continue"
9. If accepted: enter chat session
```

### Implementation Requirements

1. **Command Name**: Use `O` to match express.e exactly
2. **Security**: Check `ACS_PAGE_SYSOP` equivalent (secLevel check)
3. **Pages Counter**: Implement cooldown matching pagesAllowed logic
4. **Paging Message**: Match express.e text exactly:
   ```
   "Paging {sysopName} (CTRL-C to Abort)..."
   "The Sysop has been paged"
   "You may continue using the system"
   "until {sysopName} answers your request."
   ```
5. **Timeout**: Default 20 seconds (match 20-iteration loop)
6. **Cancel**: Support Ctrl-C to abort
7. **Callers Log**: Log "Operator Paged at ({timestamp})"
8. **Status Line**: Update with user name when waiting

## Configuration Mapping

### ACS Tooltypes → Our Config

| express.e ACS | Our Config | Default |
|---------------|------------|---------|
| ACS.PAGE_SYSOP | allowedSecLevels | [] (all) |
| ACS.MAX_PAGES | pageCooldown | 300s (5min) |
| ACS.OVERRIDE_CHAT | (future) | N/A |

### BBS Config → Our Config

| express.e | Our Config | Default |
|-----------|------------|---------|
| MAIL_ON_SYSOP_PAGE | discordWebhook | (optional) |
| sysopName | From user.username | "Sysop" |

## Chat Implementation (Future)

When chat is accepted (chatF=1), express.e enters line-based chat mode:
- Each party types a line, press Enter to send
- Line is echoed to both terminals
- Escape or Ctrl-C to exit
- Chat transcript logged

**Our implementation will use:**
- Socket.IO for real-time messaging
- Line-based input/output matching express.e
- Same escape behavior
- Enhanced with typing indicators, mobile UI
