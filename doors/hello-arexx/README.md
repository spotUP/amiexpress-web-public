# Hello World - ARexx Door

Simple ARexx door demonstrating ARexx door capabilities in AmiExpress-Web.

## Features

- ANSI color output via output() callback
- BBS context access (username, security, conference, etc.)
- Interactive input via input() callback
- Drop file support

## Command

Type `HELLOAREXX` from the BBS menu to run this door.

## Notes

ARexx scripts are executed through the ARexx engine which provides:
- BBS context object with user/door information
- output(text) callback for sending ANSI to user
- input(prompt) callback for reading user responses
