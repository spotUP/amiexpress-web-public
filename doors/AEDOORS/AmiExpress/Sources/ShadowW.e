/*****************************************************************************

         Amiga E - Example door converted from Shadow-W Rexx Door
                   Which was coded by Shadow Man/S8. The layout  
                   isn't 100% correct tho, but I didn't take the 
                   time to correct this, because this is only    
                   ment as an example!

         Author  - SiNTAX/WøT in 1993

         NOTE    - You *MUST* have a directory called DOORS:Names
                   otherwise this door won't function correctly

*****************************************************************************/

MODULE 'AEDoor','dos/dos'

CONST MAX_PWLEN=20,MAX_FLAGLEN=1

DEF res,slen,d,handle,strf:LONG,slot[5]:STRING,filename[256]:STRING,
	pw[MAX_PWLEN]:STRING,flag[MAX_FLAGLEN]:STRING,command[80]:STRING,
	c,temp[80]:STRING


PROC main()
	IF aedoorbase:=OpenLibrary('AEDoor.library',1)

		d:=CreateComm(arg[])
		strf:=GetString(d)

		GetDT(d,DT_SLOTNUMBER,0)
		StrCopy(slot,strf,ALL)

		StrCopy(filename,'DOORS:Names/',ALL)
		StrAdd(filename,slot,ALL)
		slen:=FileLength(filename)
		handle:= Open(filename,MODE_OLDFILE)
		IF (handle=NIL) OR (slen=0)
			IF slen=0
				Close(handle)
			ENDIF
			newuser()
		ELSE
			Read(handle,pw,MAX_PWLEN)
			IF Read(handle,flag,MAX_FLAGLEN)=0
				StrCopy(flag,'N',ALL)
			ENDIF
			GetDT(d,BB_MAINLINE,0)
			StrCopy(temp,strf,ALL)
			RightStr(command,temp,2)
			Close(handle)
			IF StrCmp(flag,'N',1)
				insertflag()
			ENDIF

			c:= flag[]
			SELECT c
			 CASE "x"
				IF StrCmp(command,'-x',2)
					alreadyoff()
				ELSE
				     IF StrCmp(command,'-X',2)
					turnpwon()
				     ELSE
					UpperStr(command)
					IF StrCmp(command,'-C',2)
						changepw()
					ELSE
					     IF StrCmp(command,' ?',2)
						listoptions()
					     ELSE
						SetDT(d,RETURNCOMMAND,'W')
					     ENDIF
					ENDIF
				     ENDIF
				ENDIF

			 CASE "X"
				IF StrCmp(command,'-x',2)
					turnpwoff()
				ELSE
				     IF StrCmp(command,'-X',2)
					alreadyon()
				     ELSE
					UpperStr(command)
					IF StrCmp(command,'-C',2)
						changepw()
					ELSE
					     IF StrCmp(command,' ?',2)
						listoptions()
					     ELSE
						askpw()
					     ENDIF
					ENDIF
				     ENDIF
				ENDIF

			ENDSELECT
		ENDIF			
		
		DeleteComm(d)
		CloseLibrary(aedoorbase)
	ELSE
		WriteF('Could not open AEDoor.library V1!\n')
	ENDIF
ENDPROC


PROC newuser()
	handle:= Open(filename,MODE_NEWFILE)

	WriteStr(d,'\ec',NOLF)
	header()
	WriteStr(d,'You have started[33m Shadow-W[0m the first time ! You must enter now your',LF)
	WriteStr(d,'personal [37mW-Password[0m ! You have to enter this password, if you want to',LF)
	WriteStr(d,'change anything in your personal BBS-Settings (Like Changing PW, Location...)',LF)
	WriteStr(d,'If you want to change your own [37mW-Password[0m you must enter [32m`W -C`[0m (`C`hange) !',LF)
	WriteStr(d,'After this the door asks for the [37m*OLD*[0m PW. You [37m*MUST*[0m enter it and then you',LF)
	WriteStr(d,'can enter your [32m*NEW*[0m PW !',LF)
	WriteStr(d,'Type W ? to see all options !',LF)
	WriteStr(d,'Ok,let`s start...',LF)
	aufbau('WELCOME !!!           [1;33m|[0m')

	res:=Prompt(d,20,'[16;38H')
	IF (res<>NIL)
		StrCopy(pw,res,ALL)
		UpperStr(pw)
		WriteStr(d,'[17;0H',LF)
		WriteStr(d,'                       [1;33m.----------------------------------.[0m',LF)
		WriteStr(d,'                       [1;33m| [0;36mLAST MSG.:[0m PW OK! WRITING DATA!  [1;33m|[0m',LF)
		WriteStr(d,'                       [1;33m`----------------------------------\a[0m',LF)
		Write(handle,pw,MAX_PWLEN)
		SetDT(d,RETURNCOMMAND,'W')
		Delay(100)
	ENDIF
	Close(handle)
ENDPROC


PROC header()
	WriteStr(d,'\n                      [33mSHADOW-W V1.3[37m BY[1;32m SHADOW MAN/S8 IN 1993[0m',LF)
	WriteStr(d,'                     [1;35m----------------------------------------[0m\n',LF)
ENDPROC


PROC aufbau(mesg)
	WriteStr(d,'[13;0H\n',LF)
	WriteStr(d,'                       [1;32m.----------------------------------.[0m',LF)
	WriteStr(d,'                       [1;32m| [0;37mENTER W-PW:[0m                      [1;32m|[0m',LF)
	WriteStr(d,'                       [1;32m`----------------------------------\a[0m',LF)
	WriteStr(d,'                       [1;33m.----------------------------------.[0m',LF)
	WriteStr(d,'                       [1;33m| [0;36mLAST MSG.:[0m ',NOLF)
	WriteStr(d,mesg,LF)
	WriteStr(d,'                       [1;33m`----------------------------------\a[0m',LF)
ENDPROC


PROC askpw()
 DEF pass[MAX_PWLEN]:STRING
	WriteStr(d,'\ec',NOLF)
	header()
	aufbau('WELCOME !!!           [1;33m|[0m')
	res:=Prompt(d,20,'[16;38H')
	IF (res<>NIL)
		StrCopy(pass,res,ALL)
		UpperStr(pass)
		WriteStr(d,'[17;0H',LF)
		WriteStr(d,'                       [1;33m.----------------------------------.[0m',LF)
		IF StrCmp(pw,pass,ALL)
			WriteStr(d,'                       [1;33m| [0;36mLAST MSG.:[0m PASSWORD OK! CU L8ER! [1;33m|[0m',LF)
			SetDT(d,RETURNCOMMAND,'W')
		ELSE
			WriteStr(d,'                       [1;33m| [0;36mLAST MSG.:[0m PASSWORD FAIL!        [1;33m|[0m',LF)
			Delay(100)
		ENDIF
		WriteStr(d,'                       [1;33m`----------------------------------\a[0m',LF)
		Delay(50)
	ENDIF
ENDPROC


PROC changepw()
 DEF pass[MAX_PWLEN]:STRING
	WriteStr(d,'\ec',NOLF)
	header()
	aufbau('WELCOME !!!           [1;33m|[0m')
	res:=Prompt(d,20,'[16;38H')
	IF (res<>NIL)
		StrCopy(pass,res,ALL)
		UpperStr(pass)
		IF StrCmp(pw,pass,ALL)
			aufbau('PASSWORD OK!          [1;33m|[0m')
			handle:=Open(filename,MODE_NEWFILE)
			res:=Prompt(d,20,'[16;32H*NEW* ')
			IF (res<>NIL)
				StrCopy(pw,res,ALL)
				UpperStr(pw)
				WriteStr(d,'[17;0H',LF)
				WriteStr(d,'                       [1;33m.----------------------------------.[0m',LF)
				WriteStr(d,'                       [1;33m| [0;36mLAST MSG.:[0m PW OK! WRITING DATA!  [1;33m|[0m',LF)
				WriteStr(d,'                       [1;33m`----------------------------------\a[0m',LF)
				Write(handle,pw,MAX_PWLEN)
				Delay(100)
			ENDIF
			Close(handle)
		ELSE
			pwfail()
		ENDIF
	ENDIF
ENDPROC


PROC listoptions()
	WriteStr(d,'\ec',NOLF)
	header()
	WriteStr(d,'\n[1;33m         .--------------------------------------------------------------.[0m',LF)
	WriteStr(d,'[1;33m         |[0m List of [0;32mavaible[0m options:                                     [1;33m|[0m',LF)
	WriteStr(d,'[1;33m         |                                                              |[0m',LF)
	WriteStr(d,'[1;33m         |[0m W -c OR -C[0;33m =->[0m CHANGE OWN W-PASSWORD [0;37m(OLD PW NEEDED!)       [1;33m |[0m',LF)
	WriteStr(d,'[1;33m         |[0m W -x      [0;33m =->[0m TURN PASSWORD PROTECTION OFF [0;37m(OLD PW NEEDED!)[1;33m |[0m',LF)
	WriteStr(d,'[1;33m         |[0m W -X      [0;33m =->[0m TURN PASSWORD PROTECTION ON, IF IT IS OFF!    [1;33m|[0m',LF)
	WriteStr(d,'[1;33m         |[0m W ?       [0;33m =->[0m THIS PAGE!                                    [1;33m|[0m',LF)
	WriteStr(d,'[1;33m         `--------------------------------------------------------------\a[0m\n',LF)
ENDPROC


PROC insertflag()
	handle:= Open(filename,MODE_NEWFILE)
	Write(handle,pw,MAX_PWLEN)
	Write(handle,'X',1)
	Close(handle)
	StrCopy(flag,'X',ALL)
ENDPROC


PROC turnpwoff()
 DEF pass[MAX_PWLEN]:STRING
	WriteStr(d,'\ec',NOLF)
	header()
	aufbau('WELCOME !!!           [1;33m|[0m')
	res:=Prompt(d,20,'[16;38H')
	IF (res<>NIL)
		StrCopy(pass,res,ALL)
		UpperStr(pass)
		WriteStr(d,'[17;0H',LF)
		WriteStr(d,'                       [1;33m.----------------------------------.[0m',LF)
		IF StrCmp(pw,pass,ALL)
			WriteStr(d,'                       [1;33m| [0;36mLAST MSG.:[0;37mPROTECTION[0m TURNED OFF![1;33m|[0m',LF)
			handle:= Open(filename,MODE_NEWFILE)
			Write(handle,pw,MAX_PWLEN)
			Write(handle,'x',1)
			Close(handle)
		ELSE
			WriteStr(d,'                       [1;33m| [0;36mLAST MSG.:[0m PASSWORD FAIL!        [1;33m|[0m',LF)
			Delay(100)
		ENDIF
		WriteStr(d,'                       [1;33m`----------------------------------\a[0m',LF)
		Delay(50)
	ENDIF
ENDPROC


PROC turnpwon()
	WriteStr(d,'\ec',NOLF)
	header()
	aufbau('[0;37mPROTECTION[0m TURNED ON ![1;33m|')
	handle:=Open(filename,MODE_NEWFILE)
	Write(handle,pw,MAX_PWLEN)
	Write(handle,'X',1)
	Close(handle)
ENDPROC


PROC alreadyoff()
	WriteStr(d,'\ec',NOLF)
	header()
	aufbau('[0;37mPROTECT\aN[0m ALREADY OFF![1;33m|')
ENDPROC


PROC alreadyon()
	WriteStr(d,'\ec',NOLF)
	header()
	aufbau('[0;37mPROTECTION[0m ALREADY ON![1;33m|')
ENDPROC


PROC pwfail()
	aufbau('PASSWORD FAIL!        [1;33m|[0m')
	Delay(100)
ENDPROC
