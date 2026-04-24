# info-editor: .info File Tooltype Editor

CLI tool for editing Amiga `.info` file tooltypes without touching the binary icon data.

- Location: `web/backend/src/scripts/info-editor.ts`
- Runs via: `npx tsx`

## Features

- List, get, set, add, delete tooltypes
- Enable / disable (comment / uncomment) tooltypes
- Toggle comment status
- Automatic backup before modifications
- JSON output for scripting
- Preserves icon image data and DiskObject structure

## Syntax

```bash
npx tsx web/backend/src/scripts/info-editor.ts <file.info> <command> [args] [options]
```

## Commands

| Command | Args | Description |
|---------|------|-------------|
| `list` | — | List all tooltypes with enabled/disabled status |
| `get` | `<KEY>` | Get value of a tooltype |
| `set` | `<KEY> <VALUE>` | Set or add a tooltype |
| `delete` | `<KEY>` | Delete a tooltype |
| `enable` | `<KEY>` | Uncomment a tooltype |
| `disable` | `<KEY>` | Comment out a tooltype |
| `toggle` | `<KEY>` | Toggle comment status |
| `backup` | — | Create backup file |
| `restore` | — | Restore from backup |

## Options

- `--no-backup` — skip automatic backup before modifications
- `--verbose` — show detailed operation logs
- `--json` — output in JSON (for `list` / `get`)

## Examples

```bash
# List all tooltypes
npx tsx web/backend/src/scripts/info-editor.ts Commands/BBSCmd/j.info list

# Get a specific tooltype
npx tsx web/backend/src/scripts/info-editor.ts Commands/BBSCmd/j.info get LOCATION

# Set a tooltype (creates if missing)
npx tsx web/backend/src/scripts/info-editor.ts doors/MyDoor/MyDoor.info set STACK 20000

# Disable a door (comment out LOCATION)
npx tsx web/backend/src/scripts/info-editor.ts doors/MyDoor/MyDoor.info disable LOCATION

# Re-enable
npx tsx web/backend/src/scripts/info-editor.ts doors/MyDoor/MyDoor.info enable LOCATION
```
