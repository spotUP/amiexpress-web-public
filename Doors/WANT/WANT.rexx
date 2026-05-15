/*   User Wants v1.0   - Archon   */

parse arg node;options results;signal on syntax;signal on error;signal on ioerr;nodeid="AERexxControl"node;address value nodeid
tr = transmit
AG:
OPEN(wanted,'DOORS:WANT/WANTED.TXT')
tot = READLN(WANTED) ; MANY = TOT/5
GetUser 100 ; Handle = Result
START:
tr '[1;35m--------------------------------------------------------------------------------'
tr '[44m  [31m- --  ---< [33mUsEr WaNts v1.0   [35mWrItTeN bY [36mArChoN [35mfOr [36mThE I.c.E TeAm [31m>---  -- -  '
tr '[35;40m--------------------------------------------------------------------------------'
tr '[1;33mToTaL uSeR WaNtS =[0m' MANY
QUERY '[35m([33mV[35m)[33miEw WaNtS, [35m([33mA[35m)[33mdD a WaNt, [35m([33mCR=Quit[35m) [36m:[0m'
WHAT = UPPER(RESULT)
IF WHAT = A THEN CALL ADDONE
IF WHAT = V THEN CALL VIEW
SHUTDOWN;EXIT
ADDONE:
QUERY '[31mWhAt Do YaH NeEd >:[0m'
WHAT = UPPER(RESULT)
QUERY '[31mVeRsion (CR=AnY VeRsiOn) >:[0m'
VER = RESULT
if ver = '' then ver = 'ANY'
RECIEVE = 60
QUERY '[31mAnY tHiNg ElSe YaH wAnNa sAy >:[0m'
INFO = RESULT
tr '-----------------------------------------------------------------------'
tr HANDLE 'WaNtS:' What
tr 'VeRsIoN: 'ver
tr 'XtRa InFo: 'INFO
tr '-----------------------------------------------------------------------'
Query 'WrItE tHiS (Y/n) : '
Wi= upper(result)
if wi = N then call START
tr 'wRiTiNg DaTa.'
tot = tot + 5
CLOSE(Wanted)
OPEN(WANTED,'doors:want/wanted.txt')
WRITELN(WANTED,TOT)
DO g = 1 to tot-5
READLN(WANTED)
END
WRITELN(WANTED,'-----------------------------------------------------------------------')
WRITELN(WANTED,HANDLE 'WaNtS:' What)
WRITELN(WANTED,'VeRsIoN: 'ver)
WRITELN(WANTED,'XtRa InFo: 'INFO)
WRITELN(WANTED,'-----------------------------------------------------------------------')
CLOSE(WANTED)
CALL AG
ViEW:
Do hh = 1 to tot
tr READLN(WANTED)
end
CLOSE(WANTED)
QUERY "<RETURN TO CONTINUE>"
CALL AG
SHUTDOWN ;EXIT
ERROR:;TRANSMIT 'ERROR..';SHUTDOWN;EXIT;IOERR:;TRANSMIT 'IOERR..';SHUTDOWN;EXIT;SYNTAX:;TRANSMIT 'SYNTAX.';SHUTDOWN;EXIT

