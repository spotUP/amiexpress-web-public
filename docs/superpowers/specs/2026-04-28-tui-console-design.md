# AmiExpress-Web TUI Console — Design Spec

**Date:** 2026-04-28  
**Status:** approved  

---

## Goal

Replace the scrolling `start-servers.sh` output with a tmux-based sysop console: a named tmux session with raw log panes for monitoring and a full Ink-based TUI window for live BBS admin (nodes, users, conferences, callers).

---

## Architecture

### tmux Session Layout

`start-servers.sh` gains a tmux bootstrap block. If `tmux` is available and stdout is a TTY, it creates (or reattaches to) a session named `amiexpress`:

```
Window 0: logs
  pane 0 (top 70%)      — backend log:  tail -f logs/backend.log
  pane 1 (bot-left 33%) — status strip: node dev/console/dist/strip.js
  pane 2 (bot-mid  33%) — preview log:  tail -f logs/frontend.log
  pane 3 (bot-right 33%)— door watcher: tail -f logs/door-watcher.log

Window 1: shell          — clean interactive bash (sysop shell)
Window 2: console        — node dev/console/dist/index.js
```

If tmux is absent or stdout is not a TTY (CI, Docker, pipe), `start-servers.sh` falls back to its current plain log output entirely unchanged.

### Status Strip (`strip.js`)

A tiny standalone Node script (no Ink, no blessed) that polls `GET /api/nodes` and `GET /api/statistics/system` every 2 s, clears its pane with `\x1b[2J\x1b[H`, and prints a fixed 3-line status block:

```
  ● Backend  ✓  3001     ● Preview  ✓  8080     ● Watch  ✓  live
  N1 spot   Conf1/R      N2 idle   —             N3 idle   —
  UP 2h 14m    Users: 98    Msgs today: 12
```

Reads `AMIEXPRESS_CONSOLE_TOKEN` env var for auth (same token the console app uses). Hits `GET /api/nodes/status` and `GET /api/stats/system`. If the token is absent or expired, prints "waiting for auth..." and retries every 5 s.

### Ink Console App (`dev/console/`)

Full Ink (React for terminal) application. Connects to the backend over HTTP REST + Socket.IO. Requires sysop JWT auth — prompts for username/password on first run, stores the token in memory for the session.

---

## Console App — UI Layout

```
┌─ header ──────────────────────────────────────────────────────┐
│  AmiExpress-Web   Ultra Vibed by Spot/Up Rough       UP 2h14m │
│  ● Backend ✓  ● Preview ✓  ● Watch ✓                          │
├─ tab bar ─────────────────────────────────────────────────────┤
│  [Nodes]  [Users]  [Confs]  [Callers]  [Logs]                  │
├─ tab content ─────────────────────────────────────────────────┤
│                                                               │
│  (active tab content — see tabs below)                        │
│                                                               │
├─ footer ──────────────────────────────────────────────────────┤
│  tab-specific hotkeys                        [?]help  [q]quit │
└───────────────────────────────────────────────────────────────┘
```

Header uses `ink-gradient` for "AmiExpress-Web" and `chalk` true-color for server status pills. Tab navigation: left/right arrows or number keys 1–5. Mouse support via Ink's built-in mouse handling.

---

## Tabs

### Nodes tab (default)
- Source: `GET /api/nodes/status` polled every 3 s + Socket.IO `node-activity` events for instant updates
- Columns: Node | User | Location | Action | Duration
- Hotkeys: `[k]` kick selected node, `[c]` send chat to node, `[enter]` expand node detail
- Kick calls `POST /api/nodes/:nodeId/kick`
- Chat calls `POST /api/nodes/:nodeId/chat` with a text input prompt

### Users tab
- Source: `GET /api/config/users` (paginated, 50/page)
- Columns: Name | SL | Calls | Last On | Flags
- Hotkeys: `[e]` edit (opens inline form: SL, flags), `[b]` ban (sets SL=0), `[d]` delete (confirm prompt), `/` search
- Edit calls `PUT /api/config/users/:id`

### Confs tab
- Source: `GET /api/config/conferences`
- Columns: # | Name | Type | Users | Msgs | Status
- Hotkeys: `[t]` toggle enabled/disabled, `[h]` run health check, `[f]` auto-fix
- Toggle calls `PUT /api/config/conferences/:id`
- Health check calls `GET /api/config/conferences/:id/health`

### Callers tab
- Source: `GET /api/stats/last-callers` (last 50)
- Columns: User | Node | Time | Duration | Actions taken
- Read-only, refreshes every 30 s

### Logs tab
- Switchable log source: `[b]`ackend | `[p]`review | `[d]`oor-watcher | `[68]` 68K door logs
- Backend/preview/watcher: fetched via `GET /api/config/logs?tail=200` then streamed via Socket.IO `log-line` events
- 68K door logs: `GET /api/config/logs/door-68k` for list, then tail selected log

---

## File Structure

```
dev/console/
  src/
    index.tsx             entry point: auth check, render <App />
    App.tsx               screen root: Header + TabBar + active tab + Footer
    components/
      Header.tsx          gradient title, server pills, uptime
      TabBar.tsx          tab strip with keyboard nav
      Footer.tsx          per-tab hotkey hints
      LoginPrompt.tsx     username/password form (shown before main UI if no token)
      tabs/
        NodesTab.tsx
        UsersTab.tsx
        ConfsTab.tsx
        CallersTab.tsx
        LogsTab.tsx
      shared/
        Spinner.tsx        ink-spinner wrapper
        Table.tsx          ink-table wrapper with consistent styling
        ConfirmDialog.tsx  yes/no confirmation overlay
        TextInput.tsx      ink-text-input wrapper
    api/
      client.ts           fetch() wrapper: baseUrl, auth header injection, typed responses
      socket.ts           Socket.IO client: connect, subscribe to events, reconnect
      types.ts            shared response types (Node, User, Conference, Caller, LogLine)
    hooks/
      useNodes.ts         polling + socket hook → NodeInfo[]
      useAuth.ts          JWT storage + login/logout
  strip/
    strip.ts              standalone status strip (no Ink, no auth)
  package.json            name: @amiexpress/console
  tsconfig.json
```

---

## Authentication

The console uses the same JWT auth as the web admin:

1. On start, check if `AMIEXPRESS_CONSOLE_TOKEN` env var is set → use it directly
2. Otherwise, display `LoginPrompt` (username + password fields)
3. POST to `POST /auth/login`, store JWT in memory AND export as `AMIEXPRESS_CONSOLE_TOKEN` to the tmux session environment (`tmux set-environment -t amiexpress AMIEXPRESS_CONSOLE_TOKEN <token>`) so the status strip pane picks it up automatically
4. Inject `Authorization: Bearer <token>` on all API calls
5. On 401, re-show `LoginPrompt`

Sysop-level credentials required (SL ≥ 200). No token is written to disk.

---

## start-servers.sh Changes

Add a `launch_tmux_session()` function early in the script. The gate uses both TTY detection and `$TMUX` absence — tmux sets `$TMUX` inside any pane, so this prevents re-entry when the pane itself re-runs the script.

```bash
launch_tmux_session() {
  local session="amiexpress"
  if tmux has-session -t "$session" 2>/dev/null; then
    tmux attach -t "$session"
    return
  fi
  # build console app if source exists
  [ -f "dev/console/package.json" ] && \
    (cd dev/console && npm run build 2>/dev/null)
  # create session, window 0: logs
  # pane 0 (top 70%) runs THIS script with --bbs-only so servers actually start;
  # $TMUX is now set, so the tmux gate below won't fire again.
  tmux new-session -d -s "$session" -n logs \
    "bash ./dev/scripts/start-servers.sh --bbs-only; bash"
  tmux split-window -v -p 30 -t "$session:logs"
  tmux split-window -h -t "$session:logs.1"
  tmux split-window -h -t "$session:logs.1"
  tmux send-keys -t "$session:logs.1" \
    "node dev/console/dist/strip.js" Enter
  tmux send-keys -t "$session:logs.2" \
    "tail -f logs/frontend.log" Enter
  tmux send-keys -t "$session:logs.3" \
    "tail -f logs/door-watcher.log" Enter
  # window 1: shell
  tmux new-window -t "$session" -n shell
  # window 2: console TUI (starts after a brief delay so backend is up)
  tmux new-window -t "$session" -n console
  tmux send-keys -t "$session:console" \
    "sleep 5 && node dev/console/dist/index.js" Enter
  # attach at the logs window
  tmux select-window -t "$session:logs"
  tmux attach -t "$session"
}

# Gate: interactive TTY + tmux available + not already inside tmux
if [ -t 1 ] && command -v tmux &>/dev/null && [ -z "$TMUX" ]; then
  launch_tmux_session
  exit $?
fi
# fall through to existing plain-output startup (CI, Docker, or inside tmux pane)
```

Pane 0 runs `start-servers.sh --bbs-only` (the existing startup path). Because `$TMUX` is set inside the pane, the gate does not fire again — no infinite loop. The `; bash` after it keeps the pane alive after servers stop.

---

## Out of Scope (v1)

- SSH/Telnet node control from the console (kick is HTTP only)
- File area management
- Message base editing
- Import/export UI (stays in /admin/import)
- Remote use (Hetzner) — the console assumes localhost:3001; remote support is a v2 concern

---

## Success Criteria

**Automated:**
- `npx tsc --noEmit` passes in `dev/console/`
- `npm run build` in `dev/console/` produces `dist/index.js` and `dist/strip.js`

**Manual:**
- `./dev/scripts/start-servers.sh` creates tmux session `amiexpress` with 3 windows
- Window 0 shows backend log updating live in the top pane
- Status strip shows correct server status and node activity
- Window 2 shows the Ink console with gradient `AmiExpress-Web` header
- Tagline `Ultra Vibed by Spot/Up Rough` visible in header
- Tab navigation (arrow keys + 1–5) works
- Nodes tab shows live node data, updates within 3 s of a login
- Users tab loads user list, SL edit works end-to-end
- No tmux installed → plain output unchanged
- Non-TTY (pipe/CI) → plain output unchanged
