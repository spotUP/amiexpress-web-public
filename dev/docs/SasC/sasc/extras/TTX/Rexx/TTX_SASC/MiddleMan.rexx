/*
**  $VER: Midddleman.rexx 2.1 (17.8.93)
**  By Kenneth Yarnall.  This code may be freely distributed.
**
**  Middleman arbitrates between TTX and SCmsg.  For various reasons, SCmsg
** cannot talk directly to TTX in a clean way (it expects an editor to have
** a single ARexx port, while TTX has a separate port for each document.
** You can kludge your way around this, but it isn't any fun).  Middleman
** sets up a single port (TTX_SASC) for SCmsg to communicate with, and keeps
** track of the appropriate port with which to babble at TTX.  It opens files
** as necessary, etc.
**
**  If you want to close MiddleMan down, send it the ARexx command QUIT.  The
** little script KillMM.rexx will do this for you, or you can do it directly
** from a WSHell commandline.
*/

False = 0
True = 1

Options RESULTS

/* Make sure support library is open. */

if ~Show('L',"rexxsupport.library") then do
    if ~addlib("rexxsupport.library",0,-30,0) then
        exit 10
end

Call OpenTTX

/*
**   If a filename was passed in, open that file. Note that we leave the
** quote marks around the name here, as they get stripped off later.
*/

Parse ARG fullname

if fullname ~= "" then
    Call OpenFile fullname

/*
**   Create our message port.  This is the one that
** SCmsg will talk to.
*/

if ~OpenPort('TTX_SASC') then
    exit 10

/* Sit back and wait for messages. */

Done = False
do until Done
    WaitPkt('TTX_SASC')
    Empty = False
    do until Empty
        msg = GetPkt('TTX_SASC')
        if msg = '00000000'X then
            Empty = True
        else do
            Parse VALUE GetArg(msg) WITH command arg1
            Reply(msg,0)
            command = Upper(command)
            Select
                When command = 'QUIT' then    /* These perform the various  */
                    Done = True               /* functions that Middleman   */
                When command = 'OPEN' then do /* can handle. Easy to extend */
                    /* Could TTX have been closed in the meantime? */
                    Call OpenTTX
                    Call OpenFile arg1
                end
                When command = 'MOVE' then
                    Call MoveToLine arg1
                Otherwise
                    NOP
            end
        end
    end
end

ClosePort('TTX_SASC')

exit 0



/* Make sure TTX is afire */

OpenTTX:

if ~show('P', 'TURBOTEXT') then do
    Address COMMAND
    'run TTX NOWINDOW BACKGROUND'   /* run TTX.  Needs to be in the path   */
    'WaitForPort' 'TURBOTEXT'       /* WaitForPort needs to be in the path */
    if RC ~= 0 then do              /* couldn't find TTX                   */
        exit 10
    end
end

Return

/*
**  This ditty opens a turbotext window containing the file that is
** passed in as the argument.  The portname of that port is stored in
** a clip, so that it can be accessed at any time.
*/

OpenFile: Procedure

Parse ARG '"' fullname '"'

file = 'Rexx:TTX_SASC/GetFilePart'(fullname)

Address TURBOTEXT

Drop RESULT
'GetPort' file
port = RESULT

if port = 'RESULT' then do
    OpenDoc NAME fullname
    port = RESULT
end

Address VALUE port
'Window2Front'

SetClip('Actual_TTX_SASC_Port', port)

Return




/*
**  MoveToLine tells the current port to move to the
** appropriate line.  I bet you coulda figured that
** one out yourself.
*/

MoveToLine: Procedure

Parse ARG lineno

port = GetClip('Actual_TTX_SASC_Port')

Address VALUE port
'Move' lineno

Return
