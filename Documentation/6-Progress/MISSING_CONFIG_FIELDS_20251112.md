# Missing Configuration Fields from express.e

**Date**: 2025-11-12
**Status**: Field Audit Complete

## Express.e Configuration Analysis

Based on comprehensive search of express.e source code, these fields are found in the original AmiExpress but missing from our TypeScript schema.

---

## TOOLTYPE_BBSCONFIG (System-wide BBS Config)

### Security & Authentication
- ✅ `MIN_PASSWORD_LENGTH` - **HAVE** (min_password_length)
- ✅ `MIN_PASSWORD_STRENGTH` - **HAVE** (min_password_strength)
- ✅ `MAX_PASSWORD_FAILS` - **HAVE** (max_password_fails)
- ✅ `PASSWORD_SECURITY` - **HAVE** (password_security: 'bcrypt'|'sha256'|'md5')
  - express.e values: LEGACY, PBKDF2_5, PBKDF2_50, PBKDF2_100, PBKDF2_1000, PBKDF2_10000
- ✅ `STRICT_PASSWORD_POLICY` - **HAVE** (strict_password_policy)

### Language/Translation
- ✅ `LANGUAGE_BASE` - **HAVE** (language_base)

### Network Ports
- ❌ `FTPPORT` - **MISSING** - FTP server ports (comma-separated list)
- ❌ `FTPDATAPORT` - **MISSING** - FTP data transfer ports
- ❌ `HTTPPORT` - **MISSING** - HTTP server ports

### Behavior Flags
- ❌ `QUIET_JOIN` - **MISSING** - Suppress conference join messages
- ❌ `EXECUTE_ON_*` - **MISSING** - Execute commands on events (LOGIN, LOGOFF, etc.)
- ❌ `EXECUTE_ASYNC_ON_*` - **MISSING** - Execute async commands on events

---

## TOOLTYPE_NODE (Per-Node Configuration)

### Network Settings
- ❌ `FTPPORT` - **MISSING** - Node-specific FTP ports (overrides BBSCONFIG)
- ❌ `FTPDATAPORT` - **MISSING** - Node-specific FTP data ports
- ❌ `HTTPPORT` - **MISSING** - Node-specific HTTP ports

### Serial/Modem
- ❌ `NORADBOOGIE` - **MISSING** - Disable RAD boogie mode
- ❌ `TRAP_SERIAL` - **MISSING** - Log serial errors

### Display & UI
- ❌ `VIEW_PASSWORD` - **MISSING** - Show password as typed (instead of *)
- ❌ `DEF_SCREENS` - **MISSING** - Use default screen files
- ❌ `SHOW_CACHE_STATS` - **MISSING** - Show file cache statistics

### Logging
- ❌ `LOG_INPUTS` - **MISSING** - Log all user inputs
- ❌ `LOG_HOST` - **MISSING** - Log telnet hostname/IP

### Performance
- ❌ `COPYBUFFER` - **MISSING** - File copy buffer size (bytes)
- ❌ `BGFILECHECKSTACK` - **MISSING** - Background file check thread stack size (default: 20000)

### Currently Have
- ✅ `node_start` - Node startup command
- ✅ `priority` - Process priority
- ✅ `capitol_files` - Capitalize filenames
- ✅ `def_screens` - Use default screens
- ✅ `no_mci_msg` - Disable MCI in messages
- ✅ `sysop_chat_color` - Sysop chat ANSI color
- ✅ `user_chat_color` - User chat ANSI color
- ✅ `break_chat` - Allow break during chat
- ✅ `sentby_files` - Show "sent by" in file lists
- ✅ `keep_upload_credit` - Keep upload credits
- ✅ `free_resuming` - Free resume downloads
- ✅ `callers_log` - Enable callers log
- ✅ `start_log` - Log startup
- ✅ `door_log` - Log door executions
- ✅ `ud_log` - Log uploads/downloads
- ✅ `log_host` - Log hostname
- ✅ `telnet` - Enable telnet
- ✅ `ftp` - Enable FTP
- ✅ `disable_quick_logons` - Disable quick logon
- ✅ `view_password` - View password as typed
- ✅ `no_rad_boogie` - Disable RAD boogie
- ✅ `nrams` - NRAM settings array

---

## TOOLTYPE_CONF (Conference Configuration)

### Directory Settings
- ✅ `NDIRS` - **HAVE** (ndirs: number 0-16)
- ✅ `DLPATH.1-16` - **HAVE** (dlpath_1 through dlpath_16)
- ❌ `ULPATH.1-16` - **PARTIAL** (we have ulpath_1-16 but not mentioned in E searches)

### Conference Behavior
- ❌ `FORCE_NEWSCAN` - **MISSING** - Force new message scan on join
- ❌ `NO_NEWSCAN` - **MISSING** - Disable new message scan
- ❌ `SHOW_NEW_FILES` - **MISSING** - Show new files on join
- ❌ `NO_NEW_FILES` - **MISSING** - Disable new files display
- ❌ `FREEDOWNLOADS` - **MISSING** - Allow free downloads (no ratio check)
- ❌ `MENU_PROMPT` - **MISSING** - Custom menu prompt for conference
- ❌ `CONFDB_SHARED` - **MISSING** - Share user database with another conference (conference number)

### Name Display
- ❌ `USERNAME` - **MISSING** - Use username for posts
- ❌ `REALNAME` - **MISSING** - Use real name for posts
- ❌ `INTERNETNAME` - **MISSING** - Use internet name for posts

### Currently Have
- ✅ `conference_id` - Conference number
- ✅ `ndirs` - Number of directories
- ✅ `dlpath_1-16` - Download paths
- ✅ `ulpath_1-16` - Upload paths
- ✅ `force_newscan` - Force newscan (boolean)
- ✅ `exclude_ftp` - Exclude from FTP
- ✅ `private_conf` - Private conference
- ✅ `read_only` - Read-only conference
- ✅ `min_access_level` - Minimum security level
- ✅ `max_access_level` - Maximum security level

---

## TOOLTYPE_MSGBASE (Message Base Configuration)

- ❌ `NMSGBASES` - **MISSING** - Number of message bases in conference
- ❌ `USERNAME.N` - **MISSING** - Use username for message base N
- ❌ `REALNAME.N` - **MISSING** - Use real name for message base N
- ❌ `INTERNETNAME.N` - **MISSING** - Use internet name for message base N

**NOTE**: We don't have a message_base_config table at all!

---

## TOOLTYPE_XFERLIB (Transfer Protocol Library)

- ❌ `TXWINDOW` - **MISSING** - Hydra transmit window size
- ❌ `RXWINDOW` - **MISSING** - Hydra receive window size
- ❌ `FTPHOST` - **MISSING** - FTP protocol host setting

**NOTE**: We store protocols but not their detailed settings!

---

## TOOLTYPE_SYSCMD / TOOLTYPE_BBSCMD (Door/Command Configuration)

### Door Settings
- ❌ `ACCESS` - **MISSING** - Minimum security level (alternative to min_security_level)
- ❌ `PASS_PARAMETERS` - **MISSING** - Pass parameters to door (0=no, 1=yes)
- ❌ `INTERNAL` - **MISSING** - Flag for internal command
- ❌ `LOG_INPUTS` - **MISSING** - Log user inputs for this door
- ❌ `MIMICVER` - **MISSING** - Mimic BBS version string

### Currently Have (Door interface)
- ✅ `door_name` - Door display name
- ✅ `door_command` - Command to execute door
- ✅ `door_type` - SYSCMD, BBSCMD, INTERNAL
- ✅ `door_path` - Path to door executable
- ✅ `door_args` - Command-line arguments
- ✅ `working_directory` - Working directory
- ✅ `priority` - P0-P4
- ✅ `door_options` - Array of options
- ✅ `runtime_env` - AMIGA_68K, NATIVE_NODE, BROWSER
- ✅ `min_security_level` - Minimum security
- ✅ `max_security_level` - Maximum security
- ✅ `required_flags` - Required flags
- ✅ `time_limit` - Time limit (minutes)
- ✅ `memory_limit` - Memory limit
- ✅ `title` - Door title
- ✅ `description` - Door description
- ✅ `category` - Door category
- ✅ `enabled` - Enabled flag

---

## TOOLTYPE_LANGUAGES (Language Configuration)

### System Language Settings
- ❌ `HOSTLANGUAGE` - **MISSING** - Primary BBS language
- ✅ `LANGUAGE.1-10` - **HAVE** (language_number, title fields)

**NOTE**: We have SystemLanguages table but it doesn't have host_language field matching express.e!

---

## Summary

### Critical Missing Fields
1. **Conference behavior flags**: FORCE_NEWSCAN, FREEDOWNLOADS, MENU_PROMPT, CONFDB_SHARED
2. **Network ports**: FTPPORT, FTPDATAPORT, HTTPPORT (both BBSCONFIG and NODE)
3. **Node performance**: COPYBUFFER, BGFILECHECKSTACK
4. **Event hooks**: EXECUTE_ON_*, EXECUTE_ASYNC_ON_*
5. **Name display**: USERNAME, REALNAME, INTERNETNAME (for conferences/message bases)
6. **Protocol settings**: TXWINDOW, RXWINDOW, FTPHOST

### Missing Entire Tables
1. **message_base_config** - Message base configuration (TOOLTYPE_MSGBASE)
2. **protocol_settings** - Per-protocol detailed settings (TOOLTYPE_XFERLIB)

### Fields We Should Add

#### To SystemConfig
```typescript
quiet_join: boolean;           // QUIET_JOIN
ftp_ports: string;             // FTPPORT (comma-separated)
ftp_data_ports: string;        // FTPDATAPORT (comma-separated)
http_ports: string;            // HTTPPORT (comma-separated)
execute_on_login: string;      // EXECUTE_ON_LOGIN
execute_on_logoff: string;     // EXECUTE_ON_LOGOFF
execute_async_on_login: string;   // EXECUTE_ASYNC_ON_LOGIN
execute_async_on_logoff: string;  // EXECUTE_ASYNC_ON_LOGOFF
```

#### To NodeConfig
```typescript
ftp_ports: string;             // FTPPORT (node-specific)
ftp_data_ports: string;        // FTPDATAPORT (node-specific)
http_ports: string;            // HTTPPORT (node-specific)
trap_serial: boolean;          // TRAP_SERIAL
show_cache_stats: boolean;     // SHOW_CACHE_STATS
log_inputs: boolean;           // LOG_INPUTS
copy_buffer: number;           // COPYBUFFER (bytes)
bg_filecheck_stack: number;    // BGFILECHECKSTACK (default 20000)
```

#### To ConferenceConfig
```typescript
force_newscan: boolean;        // FORCE_NEWSCAN (already have)
no_newscan: boolean;           // NO_NEWSCAN
show_new_files: boolean;       // SHOW_NEW_FILES
no_new_files: boolean;         // NO_NEW_FILES
free_downloads: boolean;       // FREEDOWNLOADS
menu_prompt: string;           // MENU_PROMPT
confdb_shared: number;         // CONFDB_SHARED (conference number)
username: boolean;             // USERNAME
realname: boolean;             // REALNAME
internetname: boolean;         // INTERNETNAME
```

#### To Door
```typescript
access: number;                // ACCESS (alternative security level)
pass_parameters: boolean;      // PASS_PARAMETERS
internal: boolean;             // INTERNAL flag
log_inputs: boolean;           // LOG_INPUTS
mimic_version: string;         // MIMICVER
```

#### To SystemLanguages
```typescript
host_language: string;         // HOSTLANGUAGE (already have)
```

#### New Table: MessageBaseConfig
```typescript
export interface MessageBaseConfig {
  id: number;
  conference_id: number;
  msgbase_number: number;      // 1-N
  msgbase_name: string;
  msgbase_path: string;
  use_username: boolean;        // USERNAME.N
  use_realname: boolean;        // REALNAME.N
  use_internetname: boolean;    // INTERNETNAME.N
  created_at: Date;
  updated_at: Date;
}
```

#### New Table: ProtocolSettings
```typescript
export interface ProtocolSettings {
  id: number;
  protocol_id: number;          // FK to protocols.id
  tx_window: number;            // TXWINDOW (Hydra)
  rx_window: number;            // RXWINDOW (Hydra)
  ftp_host: string;             // FTPHOST (for FTP protocol)
  created_at: Date;
  updated_at: Date;
}
```

---

## Recommendations

1. **Phase 1 (High Priority)**: Add critical conference fields
   - FREEDOWNLOADS, CONFDB_SHARED, MENU_PROMPT
   - These affect core BBS functionality

2. **Phase 2 (Medium Priority)**: Add network configuration
   - FTP/HTTP port settings
   - Node performance settings

3. **Phase 3 (Low Priority)**: Add advanced features
   - Event hooks (EXECUTE_ON_*)
   - Protocol advanced settings
   - Message base configuration table

4. **Phase 4 (Future)**: Complete compatibility
   - All remaining fields
   - Full express.e parity
