#!/usr/bin/env python3
"""
Sample Python Door for AmiExpress-Web BBS
Demonstrates:
- Reading BBS environment variables
- Reading DOOR.SYS drop file
- ANSI output
- User input
- Proper door exit
"""

import os
import sys
import time

# ANSI color codes
RESET = '\x1b[0m'
RED = '\x1b[31m'
GREEN = '\x1b[32m'
YELLOW = '\x1b[33m'
BLUE = '\x1b[36m'
WHITE = '\x1b[37m'

def clear_screen():
    """Clear the screen using ANSI codes"""
    print('\x1b[2J\x1b[H', end='', flush=True)

def read_door_sys():
    """Read DOOR.SYS drop file if available"""
    door_sys_path = os.environ.get('BBS_DOOR_SYS_PATH')

    if not door_sys_path or not os.path.exists(door_sys_path):
        return None

    try:
        with open(door_sys_path, 'r') as f:
            lines = [line.strip() for line in f.readlines()]

        # Parse DOOR.SYS format (52 lines)
        if len(lines) >= 28:
            return {
                'port': lines[0],
                'baud': lines[1],
                'node': lines[3],
                'username': lines[9],
                'location': lines[10],
                'security_level': lines[13],
                'times_on': lines[14],
                'time_remaining': lines[16],
                'ansi_mode': lines[18],
                'page_length': lines[19],
                'expert_mode': lines[20],
                'user_number': lines[27]
            }
    except Exception as e:
        print(f'{RED}Error reading DOOR.SYS: {e}{RESET}\r\n', flush=True)
        return None

def main():
    """Main door program"""

    # Get BBS context from environment variables
    bbs_node = os.environ.get('BBS_NODE_ID', '1')
    bbs_user = os.environ.get('BBS_USER_NAME', 'Unknown')
    bbs_security = os.environ.get('BBS_SECURITY_LEVEL', '0')
    bbs_ansi = os.environ.get('BBS_ANSI_ENABLED', '0') == '1'
    bbs_time = os.environ.get('BBS_TIME_REMAINING', '300')
    bbs_root = os.environ.get('BBS_ROOT_PATH', 'Unknown')

    # Clear screen
    clear_screen()

    # Display header
    print(f'{BLUE}╔═══════════════════════════════════════════════════════════════════════════╗{RESET}\r')
    print(f'{BLUE}║{WHITE}                     PYTHON DOOR TEST - HELLO WORLD                       {BLUE}║{RESET}\r')
    print(f'{BLUE}╚═══════════════════════════════════════════════════════════════════════════╝{RESET}\r')
    print('\r')

    # Display BBS context
    print(f'{GREEN}* Python Door Successfully Launched!{RESET}\r')
    print('\r')
    print(f'{YELLOW}BBS Context from Environment Variables:{RESET}\r')
    print(f'  Node ID: {bbs_node}\r')
    print(f'  Username: {bbs_user}\r')
    print(f'  Security Level: {bbs_security}\r')
    print(f'  ANSI Enabled: {"Yes" if bbs_ansi else "No"}\r')
    print(f'  Time Remaining: {bbs_time} seconds\r')
    print(f'  BBS Root: {bbs_root}\r')
    print('\r')

    # Try to read DOOR.SYS
    door_sys = read_door_sys()
    if door_sys:
        print(f'{YELLOW}DOOR.SYS Drop File Information:{RESET}\r')
        print(f'  Port: {door_sys["port"]}\r')
        print(f'  Baud: {door_sys["baud"]}\r')
        print(f'  Node: {door_sys["node"]}\r')
        print(f'  Location: {door_sys["location"]}\r')
        print(f'  Times On: {door_sys["times_on"]}\r')
        print(f'  Page Length: {door_sys["page_length"]}\r')
        print('\r')

    # Interactive test
    print(f'{YELLOW}═══════════════════════════════════════════════════════════════════════════{RESET}\r')
    print('\r')
    print(f'{WHITE}What is your favorite color? {RESET}', end='', flush=True)

    try:
        # Read user input
        color = input().strip()
        print(f'\r')
        print(f'{GREEN}You entered: {color}{RESET}\r')

        if color.lower() in ['blue', 'cyan', 'aqua']:
            print(f'{BLUE}Great choice! Blue is the color of the digital frontier!{RESET}\r')
        elif color.lower() in ['red']:
            print(f'{RED}Red - the color of passion and power!{RESET}\r')
        elif color.lower() in ['green']:
            print(f'{GREEN}Green - the color of nature and terminals!{RESET}\r')
        elif color.lower() in ['yellow', 'gold']:
            print(f'{YELLOW}Yellow - bright and cheerful!{RESET}\r')
        else:
            print(f'{WHITE}{color} is a wonderful color!{RESET}\r')

    except EOFError:
        print(f'\r\n{RED}Input error occurred{RESET}\r\n', flush=True)
    except KeyboardInterrupt:
        print(f'\r\n{YELLOW}Door interrupted by user{RESET}\r\n', flush=True)

    # Exit message
    print('\r')
    print(f'{YELLOW}═══════════════════════════════════════════════════════════════════════════{RESET}\r')
    print('\r')
    print(f'{GREEN}* Python door test completed successfully!{RESET}\r')
    print(f'{WHITE}  This demonstrates:{RESET}\r')
    print(f'    - Environment variable access\r')
    print(f'    - DOOR.SYS drop file reading\r')
    print(f'    - ANSI color output\r')
    print(f'    - User input handling\r')
    print('\r')
    print(f'{BLUE}Press ENTER to return to BBS...{RESET}', end='', flush=True)

    try:
        input()
    except:
        pass

    # Exit cleanly
    sys.exit(0)

if __name__ == '__main__':
    main()
