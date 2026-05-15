/* Announce util series by Zwinx/RAGE »DaGcEnTRaL 9o²1o +46-31-775-939[0-1]« */
parse arg node;signal on error;signal on syntax;signal on ioerr;options results

nodeid = "AERexxControl"node

tr=transmit;hk=getchar;pm=prompt;sendstring=sendmessage;ss=sendstring;gu=getuser

address value nodeid

Host     = 'AERexxControl'node

ADDRESS value Host

DT_NAME=100
RETURNCOMMAND=136
BB_MAINLINE=131
DT_SLOTNUMBER    = 104

gu DT_SLOTNUMBER ; SLOT=result
gu DT_NAME;USER=result
gu BB_MAINLINE;FILE=result

CHOUR=SubStr(Time('n'),1,2)
CMIN=SubStr(Time('n'),4,2)
CSEC=SubStr(Time('n'),7,2)

Mon='JanFebMarAprMayJunJulAugSepOctNovDec'
Dajt = Translate(Date(U),'-','/');Date=SubStr(dajt,4,2)'-'SubStr(Mon,SubStr(dajt,1,2)*3-2,3)'-'SubStr(dajt,7,2)
Spc='                                                                                                                      '
NOLL='000000000000000000000000000'
Wrajt='* At 'Dajt'/'CHOUR':'CMIN' 'USER' vrote this to '

anonym=0
if LEFT(UPPER(Word(File,2)),2)='AN' then do
 File=Word(File,1)''Right(File,Length(File)-Length(Word(File,1))-Length(Word(File,2))-1)
 anonym=1
end

tr ''
tr '[0m[36mBroad[0mCAST [32mVersion [0m1.0r [36m- [32mWritten By [0mZwinx/Rage[36m![0m'
tr ''
if Word(File,2)='' | Word(File,3)='' then do
 tr '[36mUsage: [33m'Word(File,1)' [32m{[33mAN[32m{[33mONYMOUS[32m}} [32m<[33mA[32m{[33mLL[32m}|[33mNode#[32m> <[33mMessage[32m>'
 tr ''
 tr ' [0;32mEg. [0m'Word(File,1)' 1 Hello World!'Left(Spc,15-Length(Word(File,1)))'[36m-will send "Hello World!" to node 1. Sender'
 tr '                                    is shown to the reciver.'
 tr ' [0;32mEg. [0m'Word(File,1)' AN A Hello World!'Left(Spc,12-Length(Word(File,1)))'[36m-will send "Hello World!" to all available'
 tr '                                    nodes. Sender is anonymous.'
 tr '[0m'
 Senttosome=-1
end
else do
 Senttosome=0
 if Exists('DOORS:Announce/Announce.cfg')& UPPER(Word(File,2))~='A' then do
  Open('log','DOORS:Announce/Announce.log','A')
  WriteLN('log',Wrajt'node #'Word(File,2)': 'Right(File,Length(File)-Length(Word(File,1))-Length(Word(File,2))-2))
  Open('cfg','DOORS:Announce/Announce.cfg','R')
  do until EOF('cfg')
   Jo=ReadLn('cfg')
   Lajban=0
   if UPPER(Word(Jo,1))='QUIETNODE' then do
    Jo=Word(Jo,2);Lajban=1
   end
   if Jo=Word(File,2)then do
    if AvailVerify()& Node~=Word(Jo,1) then do
     if Lajban=0 then do
      tr '[0mMessage posted to Node'Word(Jo,1)'...';Senttosome=1
     end
     if Anonym=0 then do
      WriteLN('log','   Message sent public to node 'Word(Jo,1)'.')
      HostSend = 'AmiExpress_Node.'Word(Jo,1)
      Address Value hostsend
      AESAYLN ''
      AESAYLN ''
      AESAYLN '[0;33m* System message from [0;1;33m'USER'[0;33m: [0;36m'Right(File,Length(File)-Length(Word(File,1))-Length(Word(File,2))-2)'[0m'
      AESAYLN ''
      ADDRESS value Host
     end
     else do
      WriteLN('log','   Message sent anonymous to node 'Word(Jo,1)'.')
      HostSend = 'AmiExpress_Node.'Word(Jo,1)
      Address Value hostsend
      AESAYLN ''
      AESAYLN ''
      AESAYLN '[0;33m* Anonymous message to you: [0;36m'Right(File,Length(File)-Length(Word(File,1))-Length(Word(File,2))-2)'[0m'
      AESAYLN ''
      ADDRESS value Host
     end
    end
   end
  end
  if Senttosome=0 then do
   WriteLN('log','   Approved node(s) not available.')
  end
  Close('log')
  Close('cfg')
 end
 else if Exists('DOORS:Announce/Announce.cfg')& UPPER(Word(File,2))='A' then do
  Open('log','DOORS:Announce/Announce.log','A')
  WriteLN('log',Wrajt'everyone: 'Right(File,Length(File)-Length(Word(File,1))-Length(Word(File,2))-2))
  Open('cfg','DOORS:Announce/Announce.cfg','R')
  do until EOF('cfg')
   Jo=ReadLn('cfg')
   Lajban=0
   if UPPER(Word(Jo,1))='QUIETNODE' then do
    Jo=Word(Jo,2);Lajban=1
   end
   if AvailVerify()& Node~=Word(Jo,1) then do
    if Lajban=0 then do
     tr '[0mMessage posted to Node'Word(Jo,1)'...';Senttosome=1
    end
    if Anonym=0 then do
     WriteLN('log','   Message sent public to node 'Word(Jo,1)'.')
     HostSend = 'AmiExpress_Node.'Word(Jo,1)
     Address Value hostsend
     AESAYLN ''
     AESAYLN ''
     AESAYLN '[0;33m* System message from [0;1;33m'USER'[0;33m: [0;36m'Right(File,Length(File)-Length(Word(File,1))-Length(Word(File,2))-2)'[0m'
     AESAYLN ''
     ADDRESS value Host
    end
    else do
     WriteLN('log','   Message sent anonymous to node 'Word(Jo,1)'.')
     HostSend = 'AmiExpress_Node.'Word(Jo,1)
     Address Value hostsend
     AESAYLN ''
     AESAYLN ''
     AESAYLN '[0;33m* Anonymous message to you: [0;36m'Right(File,Length(File)-Length(Word(File,1))-Length(Word(File,2))-2)'[0m'
     AESAYLN ''
     ADDRESS value Host
    end
   end
  end
  if Senttosome=0 then do
   WriteLN('log','   Approved node(s) not available.')
  end
  Close('log')
  Close('cfg')
 end
end
tr ''
if Senttosome=0 then do
 tr '[0mApproved node(s) not available!'
 tr ''
end
ADDRESS value Host
SHUTDOWN
EXIT
RETURN

ERROR:;transmit '';transmit 'An error has occured on line #'sigl'!';transmit 'Please notify the SYSOP!';transmit '';call quit;SYNTAX:;transmit '';transmit 'A syntax error has occured on line #'sigl'!';transmit 'Please notify the SYSOP!';transmit '';call quit;IOERR:;transmit '';transmit 'An io error has occured on line #'sigl'!';transmit 'Please notify the SYSOP!';transmit '';call quit;quit:;SHUTDOWN;exit;RETURN

AvailVerify:

Status  = ''
if (Open(Filecheck,'ENV:STATS@'Word(Jo,1))) then do
   PosC = Seek(Filecheck,36,B)
   Status = ReadCh(Filecheck,2)
   Close(Filecheck)
   end
else Status = 18
if (Status=00|Status=03|Status=04|Status=05|Status=07|Status=16) then return 1
if (Status=08|Status=09|Status=10|Status=12|Status=13|Status=19) then return 1
return 0
