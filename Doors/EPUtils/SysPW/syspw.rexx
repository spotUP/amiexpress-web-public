/* 			    iNFO lINE v1.5ß   			*/
/*								*/
/*		   Written by hOT kID! / lOST bOYZ hOME 	*/
/*                 \				      / 	*/
/*                  \ _____ aSK tHE eLITE foR #! ____/          */
/*                  / 			             \		*/
/*		   /_____For eNDLESS pIRACY `94!______\		*/


parse arg node;options results;nodeid="AERexxControl"node;signal on ioerr;signal on syntax;signal on error
address value nodeid
count=0

tr=transmit
gu=getuser
qu=query

CLS=D2C("12")
CRLF="0D 0A"x
CR="0D"x

NOR = "[0m"
BLA = "[30m"
RED = "[31m"
GRE = "[32m"
YEL = "[33m"
BLU = "[34m"
PIN = "[35m"
CYA = "[36m"
WHI = "[37m"

gu 11 ; BBSNAME=result
gu 12 ; SYSOP=result
gu 100 ; Name=result
gu 142 ; CHATFLAG=result
gu 105 ; Status=result

P=1

QUEST.1="What is your REAL First Name ? " 
QUEST.2="What is your REAL Voice-Number ? "
QUEST.3="Do you run a BBS (If YES Name&Number!) ? "
QUEST.4="Are you a Member of any group ? "
QUEST.5="One BBS you are on (Name&Number&Nup!) : "
QUEST.6="Gimme a Second BBS you are on : "
QUEST.7="Gimme some References : "
QUEST.8="When is the best time to call you ? "
QUEST.9="What Kind of Modem do you use ? "
QUEST.10="What Kind of Computer do you use ? "
QUEST.11="What is your newest Ware for it ? "
QUEST.12="What means FLT ? "
QUEST.13="What means MST ? "
QUEST.14="What means SR ? "
QUEST.15="What means CC ? "
QUEST.16="Who gave you my Number ? "
QUEST.17="Do you know any User of my BBS ? "
QUEST.18="An Account for you might be build! Enter Handle: "
QUEST.19="An Account for you might be build! Enter Password: "

Call Name

Name:
	if name="" then do ; call first ; end
	else do ; call sysop ; end
		
First:
	TR CLS
	sendmessage NOR"   Do you know the acctual System-Password ? Enter "YEL"N"NOR" if not !"
	getchar ; a=Upper(result)
	if a="N" then do ; call main ; end
	elso do ; TR "" ; call exit ; end
	return

Main:
	TR CLS
	TR PIN"["CYA"=------------------="PIN"] ["NOR"sYSTEM-pASSWORD fUCK-uP"YEL" v1.5ß!"PIN"] ["CYA"=------------------="PIN"]"
	TR ""
	Query NOR" eNTER yOUR hANDLE"BLU": "NOR"" ; handle=result
	Open('appendfile','doors:eputils/syspw/syspw.log','A')
	WriteLN('appendfile',""handle" eNTERED sYSpW-fAILURE v1.1")
	Call Select

Select:
	TR CLS
	TR PIN"["CYA"=------------------="PIN"] ["NOR"sYSTEM-pASSWORD fUCK-uP"YEL" v1.5ß!"PIN"] ["CYA"=------------------="PIN"]"
	TR ""
	TR PIN"["CYA"=-------------------------------------------------------------------------="PIN"]"
	TR NOR"  You tried to enter "BLU""left(BBSNAME,20," ")""NOR" without having the needed sYS-pW!"
	TR PIN"["CYA"=-------------------------------------------------------------------------="PIN"]"
	TR NOR"         You have now the change to inform "BLU""SYSOP""NOR" of you!"
	TR ""
	TR ""
	TR PIN"   ["CYA"Q"PIN"] ["NOR"Answer a Small Questionary"PIN"]     ["CYA"M"PIN"] ["NOR"Leave a Message to the Sysop"PIN"]"
	TR PIN"   ["CYA"G"PIN"] ["NOR"Leave this BBS"PIN"]                 ["CYA"A"PIN"] ["NOR"About this door"PIN"]"
	TR ""
	TR PIN"["CYA"=-------------------------------------------------------------------------="PIN"]"
	sendmessage NOR"     What is your choice ? " ; getchar ; ans=Upper(result)
	if ans="Q" then do ; if qu="1" then do 
	TR "" ; TR "You already completed the Questionary!" ; call select ; end
	else do ; call Quest ; end
	end
	if ans="M" then do ; if ms="1" then do
	TR "" ; TR "You already wrote a mail!" ; call select ; end
	else do ; call Messy ; end
	end
	if ans="A" then do ; call About ; end
	if ans="G" then do ; call Bye ; end
	else do ; tr "" ; tr NOR" Invalid Choice!" ; call Select ; end

Messy:
	MS=1
	Open('appendfile5','doors:eputils/syspw/messages/mails.users','A')
	WriteLN('appendfile5',handle)
	Open('appendfile3','doors:eputils/syspw/Messages/Messy.'handle'','W')
	TR CLS
	showfile "doors:eputils/syspw/message.header"
	TR ""
	TR NOR"From"BLU"   : "NOR""left(handle,15," ")""
	TR NOR"To"BLU"     : "NOR""left(sysop,15," ")""
	Query NOR"Subject"BLU": "NOR"" ; Sub=result
	WriteLN('appendfile3',"From   : "handle)
	WriteLN('appendfile3',"To     : "sysop)
	WriteLN('appendfile3',"Subject: "sub)
	TR ""
	TR NOR"    eNTER yOUR tEXT! "PIN"["CYA"eNTER"PIN"]"NOR" aLONE tO eND! "PIN"["NOR"75 cHARS/lINE! 22 lINES mAX!"PIN"]"
	TR PIN"   ("CYA"|=-----=|=-----=|=-----=|=-----=|=-----=|=-----=|=-----=|=-----=|=-----=|=-"PIN")"NOR
	do j = p to 22
	Query NOR""j"> " ; msg.j=result
	if msg.j = "" then do ; call messyexit ; end
	if j = "" then do ; call messyexit ; end
	end

MessyExit:
	TR""
	sendmessage "[A]bort [L]ist [S]ave " ; getchar ; S=Upper(result)
	if S = "A" then do ; tr "" ; sendmessage "Are you sure [y/N] ? "
		getchar ; SU=Upper(result)
			if SU = "Y" then do ; TR " Yes! Aborted..."
			WriteLN('appendfile3',""handle" aborted Message-Entry")
			Close('appendfile3')
			call select
			end
		else do ; call messyexit ; end
	end
	if S = "S" then do ; tr "" ; TR "Saving your Message!" ; o=1 ; call save ; end
	call exit

Save:
	WriteLN('appendfile3',' ')	
	do o = p to 22
	WriteLN('appendfile3',msg.o)
	if msg.o="" then do ; 	close('appendfile3') ; TR " Done!" ; call select ; end
	end
	close('appendfile3') ; call select


Quest:
	QU=1
	TR CLS
	TR PIN"["CYA"=------------------="PIN"] ["NOR"sYSTEM-pASSWORD fUCK-uP"YEL" v1.5ß!"PIN"] ["CYA"=------------------="PIN"]"
	TR ""
	Open('appendfile2','doors:eputils/syspw/Answers/Answer.'handle'','W')
	WriteLN('appendfile2',"Start of sYS-pW fUCK-uP Quest by "handle)
	Open('appendfile4','doors:eputils/syspw/answers/answer.users','A')
	WriteLN('appendfile4',handle)
	Call Quest2

Quest2:
	do i = p to 19
	Query NOR""quest.i ; answer.i=result
	WriteLN('appendfile2',""quest.i""answer.i)
	if i="19" then do ; sendmessage "Thanx for filling this out...!    Press any key to continue" ; getchar ; End
	end
	WriteLN('appendfile2',"+---------------------------------------------------------------------+")
	Close('appendfile2')
	call Select


About:
	TR CLS
	TR PIN"["CYA"=------------------="PIN"] ["NOR"sYSTEM-pASSWORD fUCK-uP"YEL" v1.5ß!"PIN"] ["CYA"=------------------="PIN"]"
	TR ""
	TR NOR" Why i coded this door:"
	TR ""
	TR NOR"Very simple... I wanted my System protected with a System-Password"
	TR NOR"But i did now wanted to loose any cool user who logs on but don't have the pw!"
	TR ""
	TR NOR"With this small door I can get Informations about that kind of User"
	TR NOR"without letting him into my BBS... When I decide to let him in, I know"
	TR NOR"where to reach him, or I already could build him an account"
	TR NOR"Very simple facts I think..."
	TR ""
	TR NOR"Now enjoy this door..."
	TR NOR"For any Idea or Bug Report, call my BBS "YEL" LOST BOYZ HOME"NOR" !"
	TR NOR"Ask the Elite for the Number...!"
	TR PIN"["CYA"=-------------------------------------------------------------------------="PIN"]"
	sendmessage NOR"     Press Any Key to Continue...!"
	getchar
	call Select

Bye:
	tr ""
	tr PIN"["CYA"===="PIN"] ["NOR"tHIS tOOL iS cALL wARE"PIN"] ["NOR"cALL >lOST bOYZ hOME< +49-aSK-eLITE!"PIN"] ["CYA"===="PIN"]"
	tr ""
	Putustr 'g' ; Putuser 136
	SHUTDOWN
	EXIT


Sysop:
	if Status > 200 then do 
	Open('logfile','doors:eputils/syspw/syspw.log','A')
	WriteLN('logfile',""Name" accessed System-PW Fuck-Up v1.5ß Sysop Menu!")
	call sysop2 
	end
	else do ; TR NOR"You are not allowed to access this door!" 
	Open('appendfile','doors:eputils/syspw/syspw.log','A')
	WriteLN('appendfile',""Name" tried to access System-PW Fuck-Up v1.5ß Sysop Menu!")
	call exit ; end

Sysop2:
	TR CLS
	TR PIN" ["CYA"=------------------="PIN"] ["NOR"sYSTEM-pASSWORD fUCK-uP"YEL" v1.5ß!"PIN"] ["CYA"=------------------="PIN"]"
	TR ""
	TR BLU"    :                                                                      :"
	TR BLU"- --+----------------------------------------------------------------------+-- -"
	TR BLU"    :          "NOR"Welcome "YEL""center(name,15," ")""NOR" to the fUCK-uP sYSOP mENU!"BLU"          :"
	TR ""
	TR GRE"          ["YEL"V"GRE"] ["NOR"View Sys-Pw Fuck-Up Log!"GRE"]      ["YEL"R"GRE"] ["NOR"View Mails!"GRE"]"
	TR GRE"          ["YEL"A"GRE"] ["NOR"View Answers"GRE"]                  ["YEL"Q"GRE"] ["NOR"Leave Sysop Menu"GRE"]"
	TR ""
	TR BLU"    :                                                                      :"
	TR BLU"- --+----------------------------------------------------------------------+-- -"
	TR BLU"    :                                                                      :"
	sendmessage NOR"     Tell me your Choice... "
	getchar ; L=Upper(result)
	if L ="V" then do ; call viewlog ; end
	if L ="A" then do ; call showans ; end
	if L ="R" then do ; call readmail ; end
	else do ; TR "" ; TR NOR"ByeBye" ; call exit ; end

showans:
	TR CLS
	TR BLU"["YEL"=-="BLU"]"NOR" View Sys-Pw Fuck-Up Answers "BLU"["YEL"=-="BLU"]"
	TR ""
	showfile "doors:eputils/syspw/answers/answer.users" 
	TR ""
	sendmessage NOR"     Do you want to delete this List (y/N) ?"
	getchar ; delans2=Upper(result)
	if delans2="Y" then do ; call dellistans ; end
	TR ""
	Query NOR"View Answers from which User? "YEL"" ; Aname=Upper(result) ; TR NOR""
	if AName="" then do ; call sysop2 ; end
	Open('logfile','doors:eputils/syspw/syspw.log','A')
	WriteLN('logfile',""Name" viewed Answers from "Aname"")
	showfile 'doors:eputils/syspw/answers/answer.'Aname
	TR ""
	sendmessage NOR"     Do you want to delete this Answers (y/N) ?"
	getchar ; delmai=Upper(result)
	if delmai="Y" then do ; call delans ; end
	else do ; call sysop2 ; end

readmail:
	TR CLS
	TR BLU"["YEL"=-="BLU"]"NOR" View Sys-Pw Fuck-Up Messages "BLU"["YEL"=-="BLU"]"
	TR ""
	showfile "doors:eputils/syspw/messages/mails.users" 
	TR ""
	sendmessage NOR"     Do you want to delete this List (y/N) ?"
	getchar ; delans=Upper(result)
	if delans="Y" then do ; call dellistmail ; end
	TR ""
	Query NOR"View Mail from which User? "YEL"" ; mname=Upper(result) ; TR NOR""
	if MName="" then do ; call sysop2 ; end
	Open('logfile','doors:eputils/syspw/syspw.log','A')
	WriteLN('logfile',""Name" viewed Mail from "Mname"")
	showfile 'doors:eputils/syspw/messages/messy.'mname
	TR ""
	sendmessage NOR"     Do you want to delete this message (y/N) ?"
	getchar ; delans=Upper(result)
	if delans="Y" then do ; call delmail ; end
	else do ; call sysop2 ; end

delans:
	Open('logfile','doors:eputils/syspw/syspw.log','A')
	WriteLN('logfile',""Name" deleted Answers from "Aname"")
	tr " "
	address command 'c:delete doors:eputils/syspw/answers/answer.'Aname
	tr YEL"           "Aname""NOR"'s Answers deleted...!"
	sendmessage NOR"     Press any Key to Continue... "
	getchar ; call Sysop2 

delmail:
	Open('logfile','doors:eputils/syspw/syspw.log','A')
	WriteLN('logfile',""Name" deleted Mail from "Mname"")
	tr " "
	address command 'c:delete doors:eputils/syspw/messages/messy.'mname
	tr YEL"           "Mname""NOR"'s message deleted...!"
	sendmessage NOR"     Press any Key to Continue... "
	getchar ; call Sysop2 

dellistans:
	Open('logfile','doors:eputils/syspw/syspw.log','A')
	WriteLN('logfile',""Name" deleted List of Answers")
	tr " "
	address command "c:delete doors:eputils/syspw/answers/answer.users"
	tr NOR"            List of Answers deleted...!"
	open('fakefile','doors:eputils/syspw/answers/answer.users','W')
	WriteLN('fakefile'," ")
	Close('fakefile')
	return

dellistmail:
	Open('logfile','doors:eputils/syspw/syspw.log','A')
	WriteLN('logfile',""Name" deleted List of Mails")
	tr " "
	address command "c:delete doors:eputils/syspw/messages/mails.users"
	tr NOR"            List of Mails deleted...!"
	open('fakefile2','doors:eputils/syspw/messages/mails.users','W')
	WriteLN('fakefile2'," ")
	Close('fakefile2')
	return
	
Viewlog:
	TR CLS
	TR BLU"["YEL"=-="BLU"]"NOR" View Sys-Pw Fuck-Up Logfile! "BLU"["YEL"=-="BLU"]"
	TR ""
	ShowFile ('Doors:eputils/syspw/syspw.log')
	TR ""
	sendmessage NOR"     Press any Key to Continue... "
	getchar ; call Sysop2 

Error: ; Syntax: ; IOerr:
	tr CRLF""NOR" An Error Has Occured In The Main Program On Line #"sigl"! Exiting..."
	tr " Please Notify "SYSOP"."CRLF
	SHUTDOWN
	EXIT

Exit:
	tr ""
	tr PIN"["CYA"===="PIN"] ["NOR"tHIS tOOL iS cALL wARE"PIN"] ["NOR"cALL >lOST bOYZ hOME< +49-aSK-eLITE!"PIN"] ["CYA"===="PIN"]"
	tr ""
	SHUTDOWN
	EXIT
