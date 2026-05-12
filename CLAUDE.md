# Claude Code — amiexpress-web

**Single source of truth:** see [`RULES.md`](RULES.md). All project rules, conventions, commands, debugging protocols, and architecture notes live there.

**Global rules** are in `~/.claude/CLAUDE.md` (auto-loaded). Project rules in `RULES.md` override the global where they differ. amiexpress upgrades several globals: XIM debugging required for 68K doors (hard "MCP first"), big-endian buffer methods mandatory for Amiga binary I/O, `express.e` parity required, BBS output uses ASCII tokens (no SVG icons), root-level `handoff.md` REQUIRED (≤10 KB).
