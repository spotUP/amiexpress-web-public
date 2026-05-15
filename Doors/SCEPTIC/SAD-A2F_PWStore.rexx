/**/
		PARSE ARG NODE
		OPTIONS RESULTS
		NODEID="AERexxControl"||NODE
		ADDRESS VALUE NODEID

		call ADDLIB('rexxsupport.library',0,-30,0)

TR		= TRansmit
SS		= SendString
GC		= GetChar
GU		= GetUser
BSPC		= "08"x
CR		= "0d"x
gu 100;User	= Result
Gu 104;Slot	= result
colpal		= "0 0;1 0 36 34 30"

datafile	= "doors:Sceptic/SAD-A2F_PWStore.data"

		if ~exists(datafile) then call nodata

		Open(dat,datafile,"R")
		Seek(dat,(slot-1)*72,"B")
		daten	= readch(dat,72)
		parse var daten test "00"x .
		if test=user then call stillin
		call close(dat)

notin:		TR	"0c"x
		TR	Center("[0mSAD-PasswordStore v1.o [35m- [36mdone for EXON/LOS ENDOS [35m- [0m© Fli7e/SAD 1996",79+23)
		TR	""
		TR	Center("To be able to switch to another BBS SYSTEM without killing your",79)
		TR	Center("data we need your password to transfer the user datas to the new system!",79)
		TR	""

Retry:		SS	"[7H        [0mYour Sys. Password[35m: [34m[                                          ][42D[36m"
		call	EINGABE
		if inp	= "" then call retry
		PW	= INP

Retry1:		SS	"[8H        [0m-- VERIFICATION --[35m: [34m[                                          ][42D[36m"
		call	EINGABE
		if inp	= "" then call retry1
		PW2	= INP
		if upper(pw)=upper(pw2) then call allok

		SS	"[0 p"

		TR	"[10H[36m"Center("ERROR! please Re-Enter your Passwords!",79)
		delay(50)

		DO I = 1 to words(colpal)
		Putustr	1
		Putuser	526
		TR	"[10H["word(colpal,i)"m"Center("ERROR! please Re-Enter your Passwords!",79)
		delay(2)
		end

		DO I = 1 to words(colpal)
		Putustr	1
		Putuser	526
		TR	"[7;31H["word(colpal,i)"m"copies("*",length(pw))" "
		TR	"[8;31H["word(colpal,i)"m"copies("*",length(pw2))" "
		delay(2)
		end
		SS	"[1 p"
		call	retry

allok:		TR	""
		Open(dat,datafile,"R")
		Seek(dat,(slot-1)*72,"B")
		writech(dat,left(user,32,"00"x)||left(pw,40,"00"x))
		call close(dat)
		address command("Filenote "datafile" RESTRICTED")

quit:		TR	""
ex:		bufferflush
		shutdown
		exit

nodata:		Open(dat,datafile,"W")
		amount	= word(statef("bbs:User.data"),2)/232
		writech(dat,copies(copies("00"x,72),amount+100))
		call close(dat)
		call notin

stillin:	call close(dat)
		call ex

eingabe:	IL	= 40
		POS	= 1
		INP	= ""
		do until input=CR
		GC
		input		=result
		if input	=BSPC then
		do
		if pos >1 then
		do
		ss BSPC" "BSPC
		pos		=pos-1
		INP		=left(INP,(pos-1))
		end
		else INP	=""
		end
		if input~=CR & input~=BSPC & POS<=il then
		do
		ss "*"
		INP		=INP||input
		pos		=pos+1
		END
		END
		return
