/* POWER Rulez V1.0 by Kyle of ARÏSE                            */
/* coded for Pater Pink's Power Board · Call +49-(0)7244-2199   */

/* Edit here */

file  = 'DOORS:ARISE/PowerRulez.TXT'       /* Name of datafile    */
Roolez = 8				   /* No. of Lines        */

/* No more edits */

parse arg node
options results
address value "AERexxControl"node

signal on syntax

tr=transmit
gu=getuser
qu=query
sm=sendmessage

cls=""
CRLF="0D 0A"x
CR="0D"x
LF="0A"x

NOR = "[0m"
BLA = "[30m"
RED = "[31m"
GRE = "[32m"
YEL = "[33m"
BLU = "[34m"
PIN = "[35m"
CYA = "[36m"
WHI = "[37m"

Version = "1.0"

/* Hier faengt's an! */

	gu 12 ; SYSOP=Result

	if exists(file) then open(fn1,file,'R')
	else do
	tr YEL"Couldn't locate datafile! Please inform "SYSOP"."
	call exit
	end
	tr cls
	tr ""
	sm "                             "
	tr YEL"THE POWER RULEZ"NOR"                  ©1994 Kyle/ARÏSE"
	tr center(BLU"-=-=-=-=-=-=-=-=-",78)
	tr ""
	tr ""
	do length=1 until eof(fn1)
	 readln(fn1)
	end
	length=length-1
	do i=1 to roolez
	rand.i=0
	end

/* <roolez> different random numbers */

	do i=1 to roolez
	same=1
repeat:
	do l=1 until same=0
	 same=0
	  zufall=random(1,length,time('s'))
	  do j=1 to i by 1
	   if rand.j = zufall then same=1
	  end
	  rand.i=zufall
	 end
	end

	do i=1 to roolez
	 if i<10 then sm CYA"0"
	 sm CYA""i
	 sm "."
	 seek(fn1,0,'B')
	 do j=1 to rand.i
	  rule=readln(fn1)
         end
        tr PIN""rule
	end

	call exit

Error: ; Syntax: ; IOerr:
	tr CRLF""NOR" An Error Has Occured In The Main Program On Line #"sigl"! Exiting..."
	tr " Please Notify "GRE""SYSOP"."CRLF
	SHUTDOWN
	EXIT

Exit:
	tr crlf	
	tr BLU"Call: "PIN"Pater Pink's Power Board"YEL" +49 (0)7244-2199"NOR 
	tr ""
	SHUTDOWN
	EXIT
	END