/* VIEW_ARCHIVE  (REXX)  FOR AMI-EXPRESS BBS */
/* BY DESERT RAT OF GURU HAVEN BBS - March 1, 1992*/

/*************************************************************************** 
 * This program will allow you to VIEW any type of archive file.           *
 * The formats which it currently supports are any CLI archiver ARC, LHA,  *
 * ZIP, DMS, ZOM, etc...                                                   *
 * You will need the equivalent archive programs in your C: directory.     *
 ***************************************************************************/
  

parse arg node
options results;signal on syntax;signal on error;signal on ioerr

nodeid = "AERexxControl"node

tr=transmit;hk=getchar;pm=prompt;sendstring=sendmessage;ss=sendstring;gu=getuser
address value nodeid

LF   = D2C('10')
CLS  = D2C('12')
CR   = D2C('13')
CRLF = CR || LF

minbyte= 150000         /*  Minimum amount of memory that needs to be free */
                        /*   Not sure on min but this is a good guess.     */

if storage < minbyte then do;tr CRLF'Not enough memory to run safely!'
tr 'Either contact your sysop or if this is a multiline BBS, wait for'
tr 'anouther user to finish (if applicable) and try again.'CRLF
SHUTDOWN;exit;end

query 'please enter filename of archive to VIEW: '
filen = result
ss CLS'Please wait...'CRLF
BB_CONFLOCAL     = 127
gu BB_CONFLOCAL
/* A handy routine for other AREXX progs*/
filename = FindConfDir(result , filen)
if filename = 0 then do
	ss 'filename not found!'CRLF
	SHUTDOWN;exit
end

extension = right(filename,4)
extension = upper(extension)
/* Edit these lines for the the ones you want to support */
if (extension = ".ARC") then
	ADDRESS COMMAND "C:PKAX >ram:VA -v" '"' || filename || '"'
else if (extension = ".ARJ") then
	ADDRESS COMMAND "C:UNARJ >ram:VA l" '"' || filename || '"'
else if (extension = ".ZOO") then
	ADDRESS COMMAND "C:ZOO >ram:VA  -view " '"' || filename || '"'
else if (extension = ".LZH" | extension = ".LHA") then
	ADDRESS COMMAND "C:LHA >ram:VA   v" '"' || filename || '"'
else if (extension = ".ZIP") then
	ADDRESS COMMAND "C:UNZIP >ram:VA -v" '"' || filename || '"'
else if (extension = ".DMS") then
	ADDRESS COMMAND "C:DMS >ram:VA view" '"' || filename || '"'
else if (extension = ".ZOM") then
/* NOTE: I am using V5.3 and the VIEW option gurus! */
	ADDRESS COMMAND "C:Zoom >ram:VA CHECK" '"' || filename || '"'
else if (extension ~= "OAD/") then ss
	CRLF'Error...  Un-recognized Archive Format: 'extension||CRLF

if exists('ram:VA')then do;showfile 'ram:VA';ADDRESS COMMAND "DELETE RAM:VA";end
/* A Little Advertisment, Don't delete please, Give a guy some credit, eh? */
ss 'VIEW_ARCHIVE.REXX V1.0 by Desert Rat of GURU HAVEN BBS (708)752-9958/4427'CRLF CRLF
SHUTDOWN
exit


Query:
arg prst
   sendmessage prst
   pull result
return result

FindConfDir:
	arg conf, file
	call open fpaths,(conf||'paths'), 'R'

	do while ~EOF(fpaths)
		path = readln(fpaths)
		if exists(path||file) then return path||file
	end
return 0

ERROR:
IOERR:
SYNTAX:
tr 'An error has occured .. Exiting..'CRLF
SHUTDOWN;exit
