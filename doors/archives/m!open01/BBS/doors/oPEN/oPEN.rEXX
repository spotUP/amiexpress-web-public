/* % nEW uSERS aNSWER sEARCH % */

parse arg node
options results
nodeid = "AERexxControl"node
address value nodeid
signal on error;signal on ioerr;signal on syntax
TR=TRANSMIT ; GC=GETCHAR ; SS=SENDMESSAGE; GU=GETUSER
Getuser 100 ; Username=result
getuser 105 ; Userlevel=result
getuser 122 ; lines=result

ss d2c("12")
tR
tR "[0m                (-dOORS 0.1 bY jOE cOOL/mOTION ©1994-)" 
tr
sS "[40m[36m  % aVAILABLE dOORS fOR aXX lEVEL : [31m";tR userlevel"[36m   sERVING :[31m "username"[36m"
tR
tR "[36mcOMMAND...aXX..cOMMENT..........................................."   

if ~EXISTS("BBS:DOORS/open/oPEN.CFG") then do 
				tR "[31m  -- sORRY tHE cONFIG fILE iS mISSING --"
				tR; 
				call oUT
				end;


OPEN(mainconfig,'BBS:DOORS/open/oPEN.cFG','R');
a=0
do until a=-1
comline=READLN(mainconfig);
if upper(left(comline,3))="END" then do
					CLOSE(mainconfig)
					call out
					end;
dataline=READLN(mainconfig);

level=left(comline,3)
y="                 "
z="                                                                  "
x=length(comline)-3
Command=overlay((right(comline,x)),y)
DATA=overlay(dataline,z)
getuser 526;curline=result
if length(command)>7 then command=left(command,7)
if length(Data)>60 then data=left(data,60)
if level<=userlevel then do

			ss "[37m"command"  [32m[[33m"level"[32m][35m " 
			tr data
			end
			

if (lines-5)=curline then do
			    tR
                            sS "[36m  (--mORE--)"
			    GC
	 		    ss d2c("12")
			    tR;tR
			    sS "[40m[36m  % aVAILABLE dOORS fOR aXX lEVEL : [31m";tR userlevel"[36m   sERVING :[31m "username"[36m"
			    tR;
			    tR "[36mcOMMAND...aXX..cOMMENT..........................................." 
			    end
			    
end;


Error:
IOERR:
Syntax:
TR "[31m  -- eRROR --"
shutdown
exit

oUT:
tR
tR "[36m  -- Exiting % aVAILABLE dOORS % --"
tR
sHUTDOWN
eXIT
