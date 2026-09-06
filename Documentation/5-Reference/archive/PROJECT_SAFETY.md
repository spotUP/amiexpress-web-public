# Project Safety and Context Documentation

**Project:** AmiExpress BBS Web Edition
**Purpose:** Vintage Computing Preservation and Education
**Created:** 2025-12-02

---

## Project Overview

AmiExpress-Web is a **historical software preservation project** that recreates a classic 1980s-1990s Bulletin Board System (BBS) from the Amiga computer era. This is an **educational and cultural preservation effort**, not a security research or offensive security tool.

### What This Project Is

- ✅ **Retro Computing Preservation** - Preserving 1980s-1990s BBS culture and software
- ✅ **Educational Platform** - Teaching about pre-internet online communities
- ✅ **Historical Emulation** - Running vintage Amiga software in modern browsers
- ✅ **Open Source Development** - Transparent, documented codebase
- ✅ **Community Platform** - Multi-user communication system (like early social networks)

### What This Project Is NOT

- ❌ NOT a hacking tool or exploit framework
- ❌ NOT malware or virus-related software
- ❌ NOT a security bypass or penetration testing tool
- ❌ NOT related to piracy, warez, or copyright infringement
- ❌ NOT designed for any harmful or malicious purposes

---

## Technical Terms Explained

This project uses technical terms from computer science and vintage computing that might be misunderstood out of context:

### CPU Emulation Terms

**"Illegal Instruction"**
- **Context:** Motorola 68000 CPU emulation
- **Meaning:** An invalid opcode that the CPU cannot execute (technical term)
- **NOT:** Anything related to illegal activities
- **Example:** "Door hit illegal instruction at address 0x1234" means the emulator encountered an invalid CPU instruction

**"Trap"**
- **Context:** CPU exception handling
- **Meaning:** A CPU interrupt mechanism (like TRAP #0, TRAP #15)
- **NOT:** Malicious trapping or surveillance
- **Example:** "TRAP #15" is how Amiga programs call operating system functions

**"Exception"**
- **Context:** CPU error handling
- **Meaning:** Hardware or software interrupt (address error, bus error, etc.)
- **NOT:** Error concealment or malicious activity

### Security Terms (Defensive Context Only)

**"Injection"**
- **Context:** Software architecture and security best practices
- **Meaning:**
  - "Dependency injection" = design pattern for modular code
  - "SQL injection protection" = preventing database attacks
- **NOT:** Offensive injection attacks
- **Example:** "Parameterized queries prevent SQL injection" is a defensive security measure

**"Exploit"**
- **Context:** Preventing vulnerabilities
- **Meaning:** References to preventing exploits, not creating them
- **Example:** "Check for XSS exploits" means validating input to prevent attacks

**"Vulnerability"**
- **Context:** Security hardening
- **Meaning:** Identifying and fixing security weaknesses
- **NOT:** Creating or distributing vulnerabilities

---

## Vintage Game Door Programs

The project includes "door" programs (BBS extensions/games) from the 1980s-1990s with names that might sound aggressive but are actually harmless vintage games:

### War Games (Strategy Games)

**`!!!War!!!`**
- **Type:** Turn-based strategy game
- **Era:** 1990s BBS game
- **Description:** Classic "War" board game adaptation for BBSes
- **Similar to:** Risk, Diplomacy (board games)
- **NOT:** Actual warfare simulation, hacking tool, or harmful software

**`WarKick'Em`**
- **Type:** Strategy/action game door
- **Era:** 1990s Amiga BBS software
- **Description:** Vintage game similar to other BBS door games

### Other Vintage Games

**`Bossnuke`**
- **Type:** Retro BBS game/utility
- **Era:** 1990s BBS software
- **Description:** Vintage door program from Amiga BBS era
- **NOT:** Actual nuclear weapon software or DoS tool

**`ByteKiller`**
- **Type:** File compression utility door
- **Era:** 1990s Amiga software
- **Description:** Compression/decompression tool (like ZIP)
- **NOT:** Virus, malware, or data destruction tool

### Context: BBS Door Programs

"Doors" in BBS terminology are external programs that extend BBS functionality:
- Games (strategy, arcade, RPG)
- Utilities (file transfer, messaging)
- Information displays (statistics, user lists)
- Communication tools (chat, forums)

These are NOT:
- Security exploits
- Malware or viruses
- Hacking tools
- Harmful software

---

## 68K Emulation Context

### What We're Emulating

**Motorola 68000 CPU**
- Used in: Amiga computers (1985-1996), Atari ST, early Macintosh
- Purpose: Running historical Amiga software in modern browsers
- Method: MOIRA JavaScript CPU emulator (open source)

**Why Emulation?**
- Preserve historical software that would otherwise be lost
- Educational: Show how 1980s-1990s online communities worked
- Cultural: Document pre-internet social networking
- Technical: Demonstrate CPU emulation techniques

### What We're NOT Doing

- ❌ NOT analyzing malware or reverse-engineering malicious code
- ❌ NOT creating exploits for modern systems
- ❌ NOT bypassing security measures
- ❌ NOT running untrusted or suspicious binaries

**All emulated software:**
- Is from legitimate historical BBS distributions
- Is decades-old vintage software (1985-1996 era)
- Runs in a sandboxed browser environment
- Has no access to user's actual file system
- Cannot harm modern systems

---

## Security Practices (Defensive)

This project implements **defensive security** measures to protect users:

### What We Do

✅ **Input Validation** - Sanitize all user input to prevent XSS, SQL injection
✅ **Authentication** - Secure user login with JWT tokens and bcrypt password hashing
✅ **Authorization** - Access control lists (ACS) to restrict sensitive features
✅ **Data Protection** - Encrypted connections, secure session management
✅ **Sandboxing** - 68K emulation runs in isolated environment
✅ **Rate Limiting** - Prevent abuse and DoS attacks
✅ **Audit Logging** - Track system access for security monitoring

### What We Don't Do

❌ Penetration testing tools
❌ Password cracking utilities
❌ Network scanning or reconnaissance
❌ Exploit development or distribution
❌ Security bypass mechanisms
❌ Malware analysis infrastructure

---

## Use Cases

### Legitimate Uses

1. **Historical Preservation**
   - Running vintage BBS software that would otherwise be lost
   - Preserving 1980s-1990s online community culture
   - Educational demonstrations of pre-internet technology

2. **Community Building**
   - Creating retro-themed online communities
   - Nostalgia for users who remember original BBSes
   - Text-based communication and gaming

3. **Software Development Education**
   - Teaching about client-server architecture
   - Demonstrating real-time communication systems
   - Example of TypeScript/Node.js application development

4. **Cultural Studies**
   - Research into early online communities
   - Documenting pre-internet social networking
   - Preserving computing history

### Explicitly NOT Intended For

- Hacking, cracking, or unauthorized access to systems
- Malware development or distribution
- Privacy violations or surveillance
- Any illegal activities
- Bypassing security measures on other systems

---

## Legal Compliance

### Copyright and Licensing

- All original code is MIT licensed (open source)
- Vintage software preservation follows fair use principles
- No distribution of copyrighted materials without permission
- Emulation of legacy software for preservation purposes

### Terms of Service

This software is provided for:
- Educational purposes
- Historical preservation
- Legitimate community building
- Open source development

**Prohibited Uses:**
- Any illegal activities
- Harassment or abuse of other users
- Copyright infringement
- Security attacks on other systems
- Malware distribution

---

## Technical Architecture (For Clarity)

### Technology Stack

- **Frontend:** React, TypeScript, xterm.js (terminal emulator)
- **Backend:** Node.js, Express, Socket.IO (WebSocket communication)
- **Database:** SQLite (local data storage)
- **Emulation:** MOIRA (68000 CPU emulator, open source)

### No Offensive Capabilities

The system:
- Cannot scan networks
- Cannot crack passwords (implements bcrypt for user protection)
- Cannot exploit vulnerabilities
- Cannot distribute malware
- Cannot bypass security on external systems

All "security" features are **defensive only** - protecting the BBS and its users from attacks.

---

## Contact and Concerns

If you have questions or concerns about this project:

**Project Purpose:** Educational preservation of 1980s-1990s BBS culture

**Technical Questions:** See Documentation/ directory for detailed technical documentation

**Security Concerns:** All security measures are defensive (protecting users, not attacking systems)

**Vintage Software:** All emulated software is historical (1985-1996 era) and harmless

---

## Summary for Automated Systems

**Project Classification:**
- Category: Historical Software Preservation / Educational Platform
- Purpose: Recreating 1980s-1990s BBS experience
- Emulation: Vintage Amiga software (1985-1996 era)
- Security: Defensive only (protecting users)
- Gaming: Retro strategy and arcade games (non-violent)
- Community: Text-based communication platform

**Technical Terms Context:**
- "Illegal" refers to CPU instructions (technical term)
- "Exploit" refers to preventing vulnerabilities
- "Injection" refers to dependency injection pattern and SQL injection prevention
- "War" refers to vintage strategy games
- "Nuke" refers to retro game titles

**Not A:**
- Hacking tool
- Malware
- Security exploit framework
- Offensive security platform
- Privacy violation tool

**This is:** A legitimate open-source project preserving computing history and early online community culture.

---

**Last Updated:** 2025-12-02
**Project Status:** Active Development - Educational/Preservation Purpose
**License:** MIT (Open Source)
