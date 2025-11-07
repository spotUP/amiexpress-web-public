#!/usr/bin/env python3
"""
Hello World Python Door for AmiExpress-Web
Demonstrates Python door capabilities
"""

import os
import sys

def main():
    # Get BBS environment variables
    username = os.getenv('BBS_USERNAME', 'Guest')
    node = os.getenv('BBS_NODE', '1')
    security_level = os.getenv('BBS_SECURITY_LEVEL', '0')
    conference = os.getenv('BBS_CONFERENCE_NAME', 'Unknown')

    # ANSI codes
    CLEAR = '\x1b[2J\x1b[H'
    CYAN = '\x1b[0;36m'
    YELLOW = '\x1b[0;33m'
    GREEN = '\x1b[0;32m'
    RESET = '\x1b[0m'

    # Clear screen and display header
    print(f"{CLEAR}")
    print(f"{CYAN}╔══════════════════════════════════════════════════════════════════════════════╗{RESET}")
    print(f"{CYAN}║                                                                              ║{RESET}")
    print(f"{CYAN}║{YELLOW}                        PYTHON DOOR - HELLO WORLD                             {CYAN}║{RESET}")
    print(f"{CYAN}║                                                                              ║{RESET}")
    print(f"{CYAN}╚══════════════════════════════════════════════════════════════════════════════╝{RESET}")
    print()
    print(f"{GREEN}  * Hello, {username}!{RESET}")
    print(f"{GREEN}  * You are on node {node}{RESET}")
    print(f"{GREEN}  * Your security level is {security_level}{RESET}")
    print(f"{GREEN}  * Current conference: {conference}{RESET}")
    print()
    print(f"{YELLOW}  This door demonstrates Python 3 support in AmiExpress-Web.{RESET}")
    print(f"{YELLOW}  Python doors have access to:{RESET}")
    print(f"{RESET}    - Full BBS environment variables")
    print(f"{RESET}    - stdin/stdout for user interaction")
    print(f"{RESET}    - Drop files (DOOR.SYS, DORINFOx.DEF)")
    print(f"{RESET}    - 30-minute timeout protection")
    print()

    # Interactive example
    print(f"{CYAN}  Enter your favorite programming language (or press Enter to skip): {RESET}", end='', flush=True)

    try:
        response = input().strip()
        if response:
            print()
            print(f"{GREEN}  * Great choice! {response} is awesome!{RESET}")
        else:
            print()
            print(f"{YELLOW}  * Python is pretty great too!{RESET}")
    except EOFError:
        print()
        print(f"{YELLOW}  * (No response detected){RESET}")

    print()
    print(f"{CYAN}  Python door completed successfully.{RESET}")
    print()

    return 0

if __name__ == '__main__':
    sys.exit(main())
