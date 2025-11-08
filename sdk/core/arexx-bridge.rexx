/*
 * AmiExpress BBS Door SDK - ARexx Bridge
 *
 * This bridge allows ARexx scripts to use the full AmiExpress SDK
 * including Graphics, Physics, Audio, and Input engines.
 *
 * Load this script at the start of your ARexx door:
 *   CALL LoadSDK('path/to/arexx-bridge.rexx')
 *
 * Version: 1.0.0
 * Author: AmiExpress Team
 * License: MIT
 */

/* Global SDK state */
SDK_LOADED = 0
SDK_HOST = 'localhost'
SDK_PORT = 3001
SDK_SOCKET = 0
DOOR_ID = ''
USER_ID = 0

/* Error codes */
ERR_NOT_INITIALIZED = -1
ERR_SOCKET_FAILED = -2
ERR_INVALID_PARAMS = -3

/*
 * Initialize SDK Bridge
 *
 * Usage:
 *   result = InitSDK()
 *
 * Returns: 1 on success, error code on failure
 */
InitSDK: PROCEDURE EXPOSE SDK_LOADED SDK_SOCKET SDK_HOST SDK_PORT
  IF SDK_LOADED = 1 THEN RETURN 1

  /* Open socket connection to SDK backend */
  SDK_SOCKET = OpenSocket(SDK_HOST, SDK_PORT)

  IF SDK_SOCKET = 0 THEN DO
    SAY 'ERROR: Failed to connect to SDK backend on' SDK_HOST':' SDK_PORT
    RETURN ERR_SOCKET_FAILED
  END

  SDK_LOADED = 1
  SAY 'AmiExpress SDK Bridge initialized'
  RETURN 1

/*
 * Create BBS Door
 *
 * Usage:
 *   doorId = CreateDoor(name, version, author, description)
 *
 * Parameters:
 *   name        - Door name (string)
 *   version     - Version string (e.g. "1.0.0")
 *   author      - Author name
 *   description - Short description (optional)
 *
 * Returns: Door ID on success, error code on failure
 *
 * Example:
 *   doorId = CreateDoor("My Game", "1.0", "John Doe", "A fun game")
 */
CreateDoor: PROCEDURE EXPOSE SDK_LOADED SDK_SOCKET DOOR_ID
  PARSE ARG name, version, author, description

  IF SDK_LOADED = 0 THEN RETURN ERR_NOT_INITIALIZED

  /* Build request */
  request = 'CMD:CREATE_DOOR' || '||' || ,
            'NAME:' || name || '||' || ,
            'VERSION:' || version || '||' || ,
            'AUTHOR:' || author || '||' || ,
            'DESC:' || description

  /* Send to backend */
  response = SendCommand(request)

  /* Parse response */
  PARSE VAR response 'DOOR_ID:' doorId

  IF doorId = '' THEN RETURN ERR_SOCKET_FAILED

  DOOR_ID = doorId
  RETURN doorId

/*
 * Clear Screen
 *
 * Usage:
 *   CALL ClearScreen(color)
 *
 * Parameters:
 *   color - ANSI color code (0-15), default = 0 (black)
 */
ClearScreen: PROCEDURE EXPOSE SDK_SOCKET DOOR_ID
  PARSE ARG color

  IF color = '' THEN color = 0

  request = 'CMD:CLEAR' || '||' || ,
            'DOOR:' || DOOR_ID || '||' || ,
            'COLOR:' || color

  CALL SendCommand(request)
  RETURN

/*
 * Draw Text
 *
 * Usage:
 *   CALL DrawText(x, y, text, color)
 *
 * Parameters:
 *   x     - X position (0-79)
 *   y     - Y position (0-23)
 *   text  - Text to draw
 *   color - ANSI color (0-15)
 *
 * Example:
 *   CALL DrawText(10, 5, "Hello World!", 7)
 */
DrawText: PROCEDURE EXPOSE SDK_SOCKET DOOR_ID
  PARSE ARG x, y, text, color

  IF color = '' THEN color = 7

  request = 'CMD:DRAW_TEXT' || '||' || ,
            'DOOR:' || DOOR_ID || '||' || ,
            'X:' || x || '||' || ,
            'Y:' || y || '||' || ,
            'TEXT:' || text || '||' || ,
            'COLOR:' || color

  CALL SendCommand(request)
  RETURN

/*
 * Draw Box
 *
 * Usage:
 *   CALL DrawBox(x, y, width, height, fgColor, bgColor)
 *
 * Example:
 *   CALL DrawBox(5, 5, 30, 10, 14, 1)  /* Yellow on blue */
 */
DrawBox: PROCEDURE EXPOSE SDK_SOCKET DOOR_ID
  PARSE ARG x, y, width, height, fg, bg

  IF fg = '' THEN fg = 7
  IF bg = '' THEN bg = 0

  request = 'CMD:DRAW_BOX' || '||' || ,
            'DOOR:' || DOOR_ID || '||' || ,
            'X:' || x || '||' || ,
            'Y:' || y || '||' || ,
            'WIDTH:' || width || '||' || ,
            'HEIGHT:' || height || '||' || ,
            'FG:' || fg || '||' || ,
            'BG:' || bg

  CALL SendCommand(request)
  RETURN

/*
 * Load ANSI Art
 *
 * Usage:
 *   CALL LoadAnsi(id, filename)
 *
 * Parameters:
 *   id       - Unique ID for this ANSI art
 *   filename - Path to .ANS file
 *
 * Example:
 *   CALL LoadAnsi("logo", "assets/logo.ans")
 */
LoadAnsi: PROCEDURE EXPOSE SDK_SOCKET DOOR_ID
  PARSE ARG id, filename

  /* Read ANSI file */
  ansiData = ReadFile(filename)

  request = 'CMD:LOAD_ANSI' || '||' || ,
            'DOOR:' || DOOR_ID || '||' || ,
            'ID:' || id || '||' || ,
            'DATA:' || ansiData

  CALL SendCommand(request)
  RETURN

/*
 * Draw ANSI Art
 *
 * Usage:
 *   CALL DrawAnsi(id, x, y)
 */
DrawAnsi: PROCEDURE EXPOSE SDK_SOCKET DOOR_ID
  PARSE ARG id, x, y

  IF x = '' THEN x = 0
  IF y = '' THEN y = 0

  request = 'CMD:DRAW_ANSI' || '||' || ,
            'DOOR:' || DOOR_ID || '||' || ,
            'ID:' || id || '||' || ,
            'X:' || x || '||' || ,
            'Y:' || y

  CALL SendCommand(request)
  RETURN

/*
 * Create Sprite
 *
 * Usage:
 *   spriteId = CreateSprite(id, x, y, width, height, frameData)
 *
 * Example:
 *   frame = " O  " || "0A"x || "/|\" || "0A"x || "/ \"
 *   sprite = CreateSprite("player", 10, 10, 3, 3, frame)
 */
CreateSprite: PROCEDURE EXPOSE SDK_SOCKET DOOR_ID
  PARSE ARG id, x, y, width, height, frameData

  request = 'CMD:CREATE_SPRITE' || '||' || ,
            'DOOR:' || DOOR_ID || '||' || ,
            'ID:' || id || '||' || ,
            'X:' || x || '||' || ,
            'Y:' || y || '||' || ,
            'WIDTH:' || width || '||' || ,
            'HEIGHT:' || height || '||' || ,
            'FRAME:' || frameData

  CALL SendCommand(request)
  RETURN id

/*
 * Move Sprite
 *
 * Usage:
 *   CALL MoveSprite(id, x, y)
 */
MoveSprite: PROCEDURE EXPOSE SDK_SOCKET DOOR_ID
  PARSE ARG id, x, y

  request = 'CMD:MOVE_SPRITE' || '||' || ,
            'DOOR:' || DOOR_ID || '||' || ,
            'ID:' || id || '||' || ,
            'X:' || x || '||' || ,
            'Y:' || y

  CALL SendCommand(request)
  RETURN

/*
 * Draw Sprite
 *
 * Usage:
 *   CALL DrawSprite(id)
 */
DrawSprite: PROCEDURE EXPOSE SDK_SOCKET DOOR_ID
  PARSE ARG id

  request = 'CMD:DRAW_SPRITE' || '||' || ,
            'DOOR:' || DOOR_ID || '||' || ,
            'ID:' || id

  CALL SendCommand(request)
  RETURN

/*
 * Create Physics Body
 *
 * Usage:
 *   bodyId = CreatePhysicsBody(id, x, y, width, height, mass, static)
 *
 * Parameters:
 *   static - 0 = dynamic, 1 = static (immovable)
 */
CreatePhysicsBody: PROCEDURE EXPOSE SDK_SOCKET DOOR_ID
  PARSE ARG id, x, y, width, height, mass, static

  IF static = '' THEN static = 0

  request = 'CMD:CREATE_BODY' || '||' || ,
            'DOOR:' || DOOR_ID || '||' || ,
            'ID:' || id || '||' || ,
            'X:' || x || '||' || ,
            'Y:' || y || '||' || ,
            'WIDTH:' || width || '||' || ,
            'HEIGHT:' || height || '||' || ,
            'MASS:' || mass || '||' || ,
            'STATIC:' || static

  CALL SendCommand(request)
  RETURN id

/*
 * Apply Force to Body
 *
 * Usage:
 *   CALL ApplyForce(id, forceX, forceY)
 */
ApplyForce: PROCEDURE EXPOSE SDK_SOCKET DOOR_ID
  PARSE ARG id, fx, fy

  request = 'CMD:APPLY_FORCE' || '||' || ,
            'DOOR:' || DOOR_ID || '||' || ,
            'ID:' || id || '||' || ,
            'FX:' || fx || '||' || ,
            'FY:' || fy

  CALL SendCommand(request)
  RETURN

/*
 * Set Velocity
 *
 * Usage:
 *   CALL SetVelocity(id, vx, vy)
 */
SetVelocity: PROCEDURE EXPOSE SDK_SOCKET DOOR_ID
  PARSE ARG id, vx, vy

  request = 'CMD:SET_VELOCITY' || '||' || ,
            'DOOR:' || DOOR_ID || '||' || ,
            'ID:' || id || '||' || ,
            'VX:' || vx || '||' || ,
            'VY:' || vy

  CALL SendCommand(request)
  RETURN

/*
 * Update Physics
 *
 * Usage:
 *   CALL UpdatePhysics(deltaTime)
 *
 * Parameters:
 *   deltaTime - Time step in seconds (e.g. 0.016 for 60fps)
 */
UpdatePhysics: PROCEDURE EXPOSE SDK_SOCKET DOOR_ID
  PARSE ARG delta

  request = 'CMD:UPDATE_PHYSICS' || '||' || ,
            'DOOR:' || DOOR_ID || '||' || ,
            'DELTA:' || delta

  CALL SendCommand(request)
  RETURN

/*
 * Play Sound Effect
 *
 * Usage:
 *   CALL PlaySound(type, frequency, duration)
 *
 * Example:
 *   CALL PlaySound("beep", 440, 0.5)  /* 440Hz for 0.5 seconds */
 */
PlaySound: PROCEDURE EXPOSE SDK_SOCKET DOOR_ID
  PARSE ARG type, freq, duration

  request = 'CMD:PLAY_SOUND' || '||' || ,
            'DOOR:' || DOOR_ID || '||' || ,
            'TYPE:' || type || '||' || ,
            'FREQ:' || freq || '||' || ,
            'DURATION:' || duration

  CALL SendCommand(request)
  RETURN

/*
 * Generate Music
 *
 * Usage:
 *   CALL GenerateMusic(prompt, tempo, pattern)
 *
 * Example:
 *   CALL GenerateMusic("upbeat game music", 120, "x-x-x-x-")
 */
GenerateMusic: PROCEDURE EXPOSE SDK_SOCKET DOOR_ID
  PARSE ARG prompt, tempo, pattern

  request = 'CMD:GEN_MUSIC' || '||' || ,
            'DOOR:' || DOOR_ID || '||' || ,
            'PROMPT:' || prompt || '||' || ,
            'TEMPO:' || tempo || '||' || ,
            'PATTERN:' || pattern

  CALL SendCommand(request)
  RETURN

/*
 * Wait for Input
 *
 * Usage:
 *   key = WaitForInput(timeout)
 *
 * Parameters:
 *   timeout - Timeout in milliseconds (0 = no timeout)
 *
 * Returns: Key pressed
 */
WaitForInput: PROCEDURE EXPOSE SDK_SOCKET DOOR_ID
  PARSE ARG timeout

  IF timeout = '' THEN timeout = 0

  request = 'CMD:WAIT_INPUT' || '||' || ,
            'DOOR:' || DOOR_ID || '||' || ,
            'TIMEOUT:' || timeout

  response = SendCommand(request)

  PARSE VAR response 'KEY:' key

  RETURN key

/*
 * Send ANSI Code
 *
 * Usage:
 *   CALL SendAnsi(ansiCode)
 *
 * Example:
 *   CALL SendAnsi("1B5B324A"x)  /* Clear screen */
 */
SendAnsi: PROCEDURE EXPOSE SDK_SOCKET DOOR_ID
  PARSE ARG ansiCode

  request = 'CMD:SEND_ANSI' || '||' || ,
            'DOOR:' || DOOR_ID || '||' || ,
            'CODE:' || ansiCode

  CALL SendCommand(request)
  RETURN

/*
 * Render Frame
 *
 * Usage:
 *   ansiOutput = RenderFrame()
 *
 * Returns: ANSI-encoded frame
 */
RenderFrame: PROCEDURE EXPOSE SDK_SOCKET DOOR_ID
  request = 'CMD:RENDER' || '||' || ,
            'DOOR:' || DOOR_ID

  response = SendCommand(request)

  PARSE VAR response 'ANSI:' ansiData

  RETURN ansiData

/*
 * Dispose Door
 *
 * Usage:
 *   CALL DisposeDoor()
 *
 * Cleans up and disconnects
 */
DisposeDoor: PROCEDURE EXPOSE SDK_SOCKET SDK_LOADED DOOR_ID
  IF SDK_LOADED = 0 THEN RETURN

  request = 'CMD:DISPOSE' || '||' || 'DOOR:' || DOOR_ID

  CALL SendCommand(request)
  CALL CloseSocket(SDK_SOCKET)

  SDK_LOADED = 0
  DOOR_ID = ''
  RETURN

/*
 * Send command to SDK backend
 * @private
 */
SendCommand: PROCEDURE EXPOSE SDK_SOCKET
  PARSE ARG command

  /* Send via socket */
  CALL WriteSocket(SDK_SOCKET, command || '0A'x)

  /* Read response */
  response = ReadSocket(SDK_SOCKET)

  RETURN response

/*
 * Socket operations (platform-specific)
 * These would be implemented using bsdsocket.library on Amiga
 */

OpenSocket: PROCEDURE
  PARSE ARG host, port
  /* TODO: Implement using bsdsocket.library */
  /* For now, return dummy socket */
  RETURN 1

WriteSocket: PROCEDURE
  PARSE ARG socket, data
  /* TODO: Implement socket write */
  RETURN 1

ReadSocket: PROCEDURE
  PARSE ARG socket
  /* TODO: Implement socket read */
  RETURN 'OK'

CloseSocket: PROCEDURE
  PARSE ARG socket
  /* TODO: Implement socket close */
  RETURN

ReadFile: PROCEDURE
  PARSE ARG filename

  /* Open file */
  IF ~OPEN('INFILE', filename, 'READ') THEN DO
    SAY 'ERROR: Could not open file' filename
    RETURN ''
  END

  /* Read entire file */
  content = ''
  DO WHILE ~EOF('INFILE')
    line = READLN('INFILE')
    content = content || line || '0A'x
  END

  CALL CLOSE('INFILE')
  RETURN content

/* End of ARexx Bridge */
SAY 'AmiExpress SDK ARexx Bridge loaded'
SAY 'Version 1.0.0'
SAY ''
SAY 'Initialize with: result = InitSDK()'
