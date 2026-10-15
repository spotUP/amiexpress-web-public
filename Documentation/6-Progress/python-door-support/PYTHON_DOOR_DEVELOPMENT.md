# Python Door Development Guide

## Overview

AmiExpress-Web BBS now supports **Python doors** alongside Amiga and TypeScript doors. Python doors are executed via the Python 3 interpreter with full BBS context access through environment variables and drop files.

## Quick Start

### 1. Create Your Python Door

```python
#!/usr/bin/env python3
import os
import sys

# Get BBS context
username = os.environ.get('BBS_USER_NAME', 'Unknown')
node_id = os.environ.get('BBS_NODE_ID', '1')

# Display output (ANSI supported)
print(f'\x1b[36mHello {username} on Node {node_id}!\x1b[0m\r')
print('Press ENTER to exit...', end='', flush=True)
input()
```

### 2. Install Your Door

1. Copy your `.py` file to `web/backend/doors/`
2. Make it executable: `chmod +x your-door.py`
3. The door will be automatically detected by the Door Manager

### 3. Test Your Door

- Use the `DOORS` command in the BBS to see available doors
- Python doors are marked with `[PY]` type indicator
- Launch your door from the menu

## BBS Context Access

Python doors receive BBS context through two methods:

### Environment Variables

All environment variables are prefixed with `BBS_`:

| Variable | Description | Example |
|----------|-------------|---------|
| `BBS_NODE_ID` | Node number (1-4) | `"1"` |
| `BBS_USER_NAME` | Username | `"spotup"` |
| `BBS_USER_ID` | User ID | `"42"` |
| `BBS_SECURITY_LEVEL` | Security level (0-255) | `"100"` |
| `BBS_TIME_REMAINING` | Seconds remaining | `"300"` |
| `BBS_ANSI_ENABLED` | ANSI support | `"1"` or `"0"` |
| `BBS_EXPERT_MODE` | Expert mode | `"1"` or `"0"` |
| `BBS_ROOT_PATH` | BBS root directory | `"/path/to/BBS"` |
| `BBS_NODE_PATH` | Node directory | `"/path/to/BBS/Node1"` |
| `BBS_DOOR_SYS_PATH` | Path to DOOR.SYS | `"/path/to/BBS/Node1/DOOR.SYS"` |
| `BBS_DORINFO_PATH` | Path to DORINFOx.DEF | `"/path/to/BBS/Node1/DORINFO1.DEF"` |
| `BBS_REAL_NAME` | User's real name | `"John Doe"` |
| `BBS_LOCATION` | User's location | `"New York, NY"` |
| `BBS_CALLS` | Number of calls | `"50"` |
| `BBS_UPLOADS` | Total uploads | `"10"` |
| `BBS_DOWNLOADS` | Total downloads | `"25"` |

### Drop Files

Python doors can read standard BBS drop files:

#### DOOR.SYS (52 lines)

Standard door interface file. Read from `BBS_DOOR_SYS_PATH`.

```python
import os

def read_door_sys():
    door_sys_path = os.environ.get('BBS_DOOR_SYS_PATH')
    if not door_sys_path or not os.path.exists(door_sys_path):
        return None

    with open(door_sys_path, 'r') as f:
        lines = [line.strip() for line in f.readlines()]

    return {
        'port': lines[0],          # COM port or "LOCAL"
        'baud': lines[1],          # Baud rate
        'node': lines[3],          # Node number
        'username': lines[9],      # User's name
        'location': lines[10],     # User's location
        'security_level': lines[13],  # Security level
        'time_remaining': lines[16],  # Seconds remaining
        'ansi_mode': lines[18],    # GR=ANSI, NG=ASCII
        'user_number': lines[27]   # User ID
    }
```

#### DORINFOx.DEF (alternative format)

Simpler door interface file. Read from `BBS_DORINFO_PATH`.

## I/O Handling

### Output to User

Python doors write to `stdout`. All output is sent to the user's terminal.

```python
# Standard output
print('Hello, BBS user!\r')

# ANSI colors (if BBS_ANSI_ENABLED == "1")
print('\x1b[36mCyan text\x1b[0m\r')
print('\x1b[31mRed text\x1b[0m\r')
print('\x1b[32mGreen text\x1b[0m\r')

# Always use \r or \r\n for line endings
# Flush output immediately for real-time display
print('Immediate output', flush=True)
```

### Input from User

Python doors read from `stdin`. Use `input()` for line input:

```python
# Get user input
print('Enter your name: ', end='', flush=True)
name = input().strip()

# Handle errors
try:
    response = input('Continue? (Y/N): ').strip().upper()
except EOFError:
    print('\r\nInput error\r\n')
    sys.exit(1)
except KeyboardInterrupt:
    print('\r\nInterrupted\r\n')
    sys.exit(0)
```

### Line Endings

**IMPORTANT:** Always use `\r\n` or just `\r` for line endings, not just `\n`:

```python
# ✓ Correct
print('Line 1\r')
print('Line 2\r\n')

# ✗ Wrong (will not display correctly on BBS terminals)
print('Line 1\n')
```

## ANSI Color Reference

Standard ANSI escape codes for terminal colors:

```python
# Color codes
RESET = '\x1b[0m'
BLACK = '\x1b[30m'
RED = '\x1b[31m'
GREEN = '\x1b[32m'
YELLOW = '\x1b[33m'
BLUE = '\x1b[34m'
MAGENTA = '\x1b[35m'
CYAN = '\x1b[36m'
WHITE = '\x1b[37m'

# Clear screen and home cursor
CLEAR = '\x1b[2J\x1b[H'

# Usage
print(f'{CYAN}Colored text{RESET}\r')
```

**Remember:** Check `BBS_ANSI_ENABLED` before using ANSI codes:

```python
ansi_enabled = os.environ.get('BBS_ANSI_ENABLED', '0') == '1'

if ansi_enabled:
    print('\x1b[36mCyan text\x1b[0m\r')
else:
    print('Plain text\r')
```

## Best Practices

### 1. Check Python 3 Availability

Your door requires Python 3. The BBS attempts to launch doors with `python3`:

```python
#!/usr/bin/env python3
# Shebang ensures correct Python version
```

### 2. Handle Missing Context Gracefully

```python
# Always provide defaults
username = os.environ.get('BBS_USER_NAME', 'Guest')
node_id = int(os.environ.get('BBS_NODE_ID', '1'))
time_left = int(os.environ.get('BBS_TIME_REMAINING', '300'))
```

### 3. Exit Cleanly

```python
# Normal exit
sys.exit(0)

# Error exit
sys.exit(1)
```

### 4. Flush Output Regularly

```python
# For real-time output
print('Processing...', end='', flush=True)
```

### 5. Handle Disconnections

```python
try:
    while True:
        user_input = input('> ')
        # Process input
except (EOFError, KeyboardInterrupt):
    print('\r\nDisconnected\r\n', flush=True)
    sys.exit(0)
```

## Complete Example: Hello World Door

```python
#!/usr/bin/env python3
"""
Hello World Python Door for AmiExpress-Web BBS
"""

import os
import sys

# ANSI colors
RESET = '\x1b[0m'
RED = '\x1b[31m'
GREEN = '\x1b[32m'
YELLOW = '\x1b[33m'
CYAN = '\x1b[36m'
WHITE = '\x1b[37m'

def clear_screen():
    """Clear screen with ANSI"""
    print('\x1b[2J\x1b[H', end='', flush=True)

def main():
    # Get BBS context
    username = os.environ.get('BBS_USER_NAME', 'Guest')
    node_id = os.environ.get('BBS_NODE_ID', '1')
    security = os.environ.get('BBS_SECURITY_LEVEL', '0')
    ansi = os.environ.get('BBS_ANSI_ENABLED', '0') == '1'
    time_left = os.environ.get('BBS_TIME_REMAINING', '300')

    # Clear screen
    if ansi:
        clear_screen()

    # Display header
    print(f'{CYAN}╔═══════════════════════════════════════════════════╗{RESET}\r')
    print(f'{CYAN}║{WHITE}           HELLO WORLD PYTHON DOOR                {CYAN}║{RESET}\r')
    print(f'{CYAN}╚═══════════════════════════════════════════════════╝{RESET}\r')
    print('\r')

    # Display info
    print(f'{GREEN}Welcome, {username}!{RESET}\r')
    print(f'  Node: {node_id}\r')
    print(f'  Security Level: {security}\r')
    print(f'  Time Remaining: {time_left} seconds\r')
    print('\r')

    # Interactive section
    print(f'{YELLOW}What is your favorite programming language?{RESET} ', end='', flush=True)

    try:
        language = input().strip()
        print('\r')

        if language.lower() == 'python':
            print(f'{GREEN}Excellent choice! Python is awesome!{RESET}\r')
        else:
            print(f'{WHITE}{language} is great too!{RESET}\r')
    except (EOFError, KeyboardInterrupt):
        print(f'\r\n{RED}Interrupted{RESET}\r\n', flush=True)
        sys.exit(0)

    # Exit
    print('\r')
    print(f'{CYAN}Press ENTER to return to BBS...{RESET}', end='', flush=True)

    try:
        input()
    except:
        pass

    sys.exit(0)

if __name__ == '__main__':
    main()
```

## Installation and Configuration

### File Location

Python doors go in: `web/backend/doors/`

```bash
# Example installation
cp my-door.py web/backend/doors/
chmod +x web/backend/doors/my-door.py
```

### Door Detection

Python doors are automatically detected by the Door Manager:
- File extension: `.py`
- Type indicator: `[PY]` in door list
- Execution: via `python3` interpreter

### Creating .info Files (Optional)

For advanced configuration, you can create a `.info` file:

```bash
# Create: web/backend/data/bbs/BBS/Commands/BBSCmd/MYPYDOOR.info
LOCATION=Doors:my-door.py
ACCESS=10
TYPE=PYTHON
NAME=My Python Door
```

## Debugging

### Enable Debug Output

```python
import sys

# Write debug info to stderr
print('Debug: Starting door', file=sys.stderr)

# This appears in the backend console logs
```

### Check Environment

```python
# Dump all BBS environment variables
for key, value in os.environ.items():
    if key.startswith('BBS_'):
        print(f'{key}={value}\r', file=sys.stderr)
```

### Test Locally

```bash
# Set environment variables and test
export BBS_USER_NAME="testuser"
export BBS_NODE_ID="1"
export BBS_ANSI_ENABLED="1"
python3 web/backend/doors/your-door.py
```

## Advanced Features

### Reading Other BBS Files

```python
import os
import path

# Get BBS root
bbs_root = os.environ.get('BBS_ROOT_PATH')

# Read bulletins
bulletin_path = os.path.join(bbs_root, 'Conf01', 'Bulletins', 'NEWS.TXT')
if os.path.exists(bulletin_path):
    with open(bulletin_path, 'r') as f:
        print(f.read())
```

### Multi-User Doors

```python
import os
import fcntl

# Get node ID
node_id = int(os.environ.get('BBS_NODE_ID', '1'))

# Create lock file
lock_file = f'/tmp/door-lock-node{node_id}.lock'
with open(lock_file, 'w') as f:
    try:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        # Door code here
    except IOError:
        print('Door is in use by another node\r\n')
        sys.exit(1)
```

### Persistent Data

```python
import os
import json

# Get BBS root
bbs_root = os.environ.get('BBS_ROOT_PATH')
data_file = os.path.join(bbs_root, 'Doors', 'my-door-data.json')

# Load data
if os.path.exists(data_file):
    with open(data_file, 'r') as f:
        data = json.load(f)
else:
    data = {}

# Save data
with open(data_file, 'w') as f:
    json.dump(data, f, indent=2)
```

## Comparison with Other Door Types

| Feature | Python Door | Amiga Door | TypeScript Door |
|---------|-------------|------------|-----------------|
| Language | Python 3 | 68000 ASM/C | TypeScript/JS |
| Execution | Python interpreter | CPU emulator | Node.js |
| Performance | Fast | Medium | Fast |
| Development | Easy | Complex | Medium |
| BBS Context | Env vars + drop files | XIM protocol | Direct API |
| Libraries | Full Python stdlib | Limited Amiga libs | Full npm |
| Platform | Cross-platform | Emulated Amiga | Cross-platform |

## Troubleshooting

### Door Not Appearing

1. Check file extension is `.py`
2. Verify file is in `web/backend/doors/`
3. Ensure file is executable: `chmod +x door.py`
4. Check Door Manager: Use `DOORS` command in BBS

### Input Not Working

1. Ensure you're using `input()` for line input
2. Check for `flush=True` on prompts
3. Verify line endings are `\r` or `\r\n`

### Output Not Displaying

1. Add `flush=True` to `print()` calls
2. Use `\r` line endings, not just `\n`
3. Check ANSI codes if display is garbled

### Door Crashes

1. Check stderr in backend console logs
2. Add try/except blocks for error handling
3. Test door locally with environment variables set

## Resources

- [Example Python Door](../../../web/backend/doors/test-hello.py)
- [DOOR.SYS Specification](DOOR_DEVELOPMENT.md#door-sys-format)
- [ANSI Escape Codes Reference](https://en.wikipedia.org/wiki/ANSI_escape_code)
- [Python 3 Documentation](https://docs.python.org/3/)

## Support

For questions about Python door development:
- Check existing doors in `web/backend/doors/`
- Review logs in backend console
- Test with `test-hello.py` sample door
