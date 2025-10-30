/* Fuck the BBS Addys */
parse arg node
options results
nodeid = "AERexxControl"node
address value nodeid
signal on error;signal on ioerr;signal on syntax
TR=TRANSMITT ; GC=GETCHAR ; SS=SENDMESSAGE; GU=GETUSER;
GU 142;Status=result
GU 12;Sysop=result
GU 100;Name=result
GU 102;Location=result
del=insert(d2c(8)," ")
TR "c[0m[36m   .---------------------------------."
TR "  |[44m            pAGER 0.1            [40m|"
TR "  |[44m      cODED bY [-jOE cOOl!]      [40m|"
TR "[0m[36m  `---------------------------------'"
if upper(Status)="OFF" then do
 ss "[3A[39CsORRY sYSOP iSN´T hERE"
 SS "[1B[22DwANNA lEAVE a mAIL ? (y/N)"
 GC;ch=result;tr;tr 
 if upper(ch)="Y" then do
  putustr insert("e ",sysop);
  putuser 136;
 end;
 ende
end;
if upper(status)="ON" then do
 TR "[0m[36m  .----------------------------------------------------------------------."
 TR "  |[44m                                                                      [40m|"
 TR "[0m[36m  `----------------------------------------------------------------------'" 
 ss "[6A[39C ";tr name
 ss "[39C ";tr location
 ss "[2B[4C[33m[44m"
 ch=0;a=0  
 do until ch=d2c(13)
  gc;ch=result;
  if ch=d2c(8) & a>0 then do;a=a-1;ss del;ss ch;end
  if ch=d2c(8) & a<=1 then do;end  
  if ch=d2c(27) then do;tr;tr;call ende;end
  if ch~=d2c(8) & a<69 then do;a=a+1;ss ch;End 
  weiter:
 end
 ss "[0m"
 tr;tr
 if a>1 then do;putustr "O";putuser 136;end;
end
ende:
shutdown;
exit;
end;
error:
tr "error"
exit
shutdown
ioerr:
tr "ioerr"
exit
shutdown
syntax:
tr "syntax"
exit
shutdown
