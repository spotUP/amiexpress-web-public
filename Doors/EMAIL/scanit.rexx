/* Scanner #2 */
parse arg node
options results
address value "AERexxControl"node

ac = "[35m" ; bc = "[32m" ; cc = "[33m" ; dc = "[34m" ; ec = "[0m" ; zc = "[36m"
gt=GETUSER ; tr=TRANSMIT ; sm=SENDMESSAGE ; CLS=""

nowtmail="doors:email/nomail.txt"
fullmail="doors:email/cumail.txt"

if ~show('P','YAM') then do
 tr CLS
 tr ac"Loading "cc"YAM"ac"-Outside Email Program...Please wait."
 sm ac"Blame your sysop for not running it beforehand..."
 address command "run >NIL: yam:YAM NOCHECK HIDE"
 address command "c:waitforport YAM"
 address command "c:wait 4"
 tr ""
end

gt 100 ; person=result
open(day,'t:YAMFINDER','w')
writeln(day,person)
close(day)

address command "c:rx doors:email/logonsearch.rexx"

if ~exists('t:yepmail') then do
showfile nowtmail
end

if exists('t:yepmail') then do
showfile fullmail
address command "c:delete >NIL: t:yepmail"
end

address command "c:delete >NIL: t:yamfinder"

SHUTDOWN
EXIT
END

