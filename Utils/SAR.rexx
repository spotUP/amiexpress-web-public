/* Samilog Styler - V2.1 */
/* SAMILOG.STORE VERSION */
/* sAFRA 1999 - FL!P LTD */

options results
parse arg output lines

if output="" then call info
if lines="" then call info

lines=compress(lines," ")

call addlib('rexxtricks.library',0,-30,0)

/*----------------------------------------------------------------*/
a1="[0m"  /* Speed               */
a2="[36m" /* Node                */
a3="[32m" /* User                */
a4="[33m" /* Location            */
a5="[32m" /* On-Time             */
a6="[35m" /* Actions             */
a7="[32m" /* Total-Time          */
a8="[0m"  /* UpLD-K              */
a9="[0m"  /* DnLD-K              */
a0="[35m" /* IsANewbie?(Star->*) */
bc="[34m"
cc="[36m"
dc="[33m"
pad=" "
/*----------------------------------------------------------------*/

mid=bc".----------------------------------------------------------------------------."
des=bc":"cc"Spee N Name              Location           On-Time  Action   H:MM Up-K Dn-K"bc":"
bot=bc"`----------------------------------------------------------------------------'"

xx.0=3
xx.1=bc".------------------------.-------------------------.-------------------------."
xx.3=bc"`------------------------^-------------------------^-------------------------'"

store="S:SAmiLog.Store"

if ~exists(store) then do
say
say "No S:SAMILOG.STORE! Aborting!"
say
end

if lines="" then lines=5
if lines>20 then lines=20
if lines<1 then lines=1

open(find,store,'r')

feed=readch(find,3638)

calt=c2d(substr(feed,53,2))
caly=c2d(substr(feed,127,2))
touf=c2d(substr(feed,59,2))
touk=c2d(substr(feed,56,3))
todf=c2d(substr(feed,67,2))
todk=c2d(substr(feed,64,3))

xx.2=bc":"||cc" Call: "dc||right(calt,4,pad)||cc" / "||"Yes: "dc||right(caly,4,pad)bc" : "||cc"U-Loads: "dc||right(touf,5,pad)||cc" / "dc||right(touk,5,pad)||"k"||bc" : "||cc"D-Loads: "dc||right(todf,5,pad)||cc" / "dc||right(todk,5,pad)||"k"||bc" :"

seek(find,758,'B')

zz.0=lines

do i=1 to lines

newbie=" "
acti="[------]"

feed=readch(find,144)

user=substr(feed,1,16)
loca=substr(feed,19,19)
nodz=substr(feed,40,1)
time=substr(feed,41,4)
uplk=substr(feed,47,4)
dnlk=substr(feed,59,4)
onti=substr(feed,71,8)
ofti=substr(feed,81,8)
spee=substr(feed,97,5)

fla1=reverse(c2b(substr(feed,102,1)))
fla2=reverse(c2b(substr(feed,103,1)))

if time="-:--" then time="0:00"

spee=insert(".",substr(spee,1,3),2)

if substr(fla1,1,1)="1" then newbie=a0"*"
if substr(fla1,2,1)="1" then acti=overlay("H",acti,2)
if substr(fla1,3,1)="1" then acti=overlay("C",acti,3)
if substr(fla1,4,1)="1" then acti=overlay("P",acti,4)
if substr(fla1,5,1)="1" then acti=overlay("S",acti,7)
if substr(fla1,6,1)="1" then spee="LOCL"

if substr(fla2,1,1)="1" then acti=overlay("U",acti,6)
if substr(fla2,2,1)="1" then acti=overlay("u",acti,6)
if substr(fla2,3,1)="1" then acti=overlay("D",acti,5)
if substr(fla2,4,1)="1" then acti=overlay("d",acti,5)

fite=" "a1||left(spee,4)||newbie||a2||left(nodz,1)||" "a3||left(user,17)||" "a4||left(loca,18)||" "a5||left(onti,8)||" "a6||left(acti,8)||" "a7||left(time,4)||" "a8||left(uplk,4)||" "a9||left(dnlk,4)

zz.i=fite

end

steminsert(zz,1,1,bot)
steminsert(zz,1,1,des)
steminsert(zz,1,1,mid)

writefile(output,'zz')
writefile(output,'xx','a')

close(find)

exit

INFO:
say
say "[3;1mSuper-AmiLog-Restyler - sAFRA/FL!P [0m"
say
say "Template: rx SAR.rexx <outputfile> <# of callers>"
say "Callers range between 1 and 20"
say
say "Output design copying NVX-AWAIT (Venom)"
say "Used without permission. But it looks good, so hey:)"
say
exit

