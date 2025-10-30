/**************************************************************************
*                                                                         *
*    Simple Page V 0.1        © 1994 Zacke/Sceptic                        *
*                                                                         *
**************************************************************************/
parse arg node; options results; nodeid = "AERexxControl"node; address value nodeid
signal on syntax; signal on ioerr
bufferflush
tr = transmit   ;  hk = getchar ;  pm = prompt  ;  sendstring = sendmessage
ss = sendstring ;  gu = getuser ;  pu = putuser
gu 12 ; sysop=result
gu 100; sukkel=result
gu 142; chat=result
gu 105; level=result
tr " "
tr "[33m/X-Page V 0[36m.[33m1   ©'94 Zacke / SCP!"
tr "[35m¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯"
query "[33mEnter Your Chat Reason [36m>[32m "
reden=result
if reden = "" then call ohno
putustr d2c(10)"        /X-Page 0.1 : "sukkel" Paged You With : "reden""d2c(10)
putuser 150
if chat = "OFF" then call gone
ss "[33m"
putvar("o",136)
call kwiet
end
gone:
query "[33mSeems like "sysop" is not around[36m.. [33mWanna leave a messy [32m? [35m[[33mY[36m/[33mn[35m] [36m> "
antw = result
antw2 = left(antw,1)
if antw2 = 'Y' then call kommi
if antw2 = ' ' then call kommi
else call kwiet
end
kommi:
tr " "
putvar("c",136)
call kwiet
end
ohno:
tr " "
tr "[33mNo Reason [36m= [33mNo Chat [32m!"
call kwiet
end
kwiet:
tr " "
call dexit
end

/*==========================================================================*/
IOERR: tr "I/O Error: Missing File/Directory"
ERROR:
SYNTAX: tr "Error in Line.. #"sigl" Exiting.." ; tr errortext(sigl)

/*==========================================================================*/

DExit: bufferflush ; ShutDown ; Exit

prompt: procedure ; parse arg message,length ; RECEIVE length ; QUERY message ; return result
putvar: procedure ; parse arg string1,string2 ; PUTUSTR string1 ; PUTUSER string2 ; return 0
getvar: procedure ; parse arg string1 ; getuser string1 ; return result
