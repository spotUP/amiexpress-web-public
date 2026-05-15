/*=[Highlander/Fairlight]=[REXX DOOR for RESET v1.5]========================*/
/* Special Thanks to Voyager & Snow for the pacient debugging !             */
/* Hi to all my friends ( i dont wanna list them ..the list would be        */
/* longer than the program ...) !!                                          */
/*Ok I dont like to write docs like all you out there also i'm a trader and */
/*not a programmer so it's even too much if i had a chance to set up this   */
/*bullshit .... but i needed it so i had to do it myself .....              */
/*Ok what does it do ? Simple Resets the bbs ... but Before Resetting it    */
/*Check's all nodes.. and advises all active nodes that the bbs will reset  */
/*60 seconds..                                                              */
/*Also you will be able to set the program with your own configuration by   */
/*editing on the condition lines (starting on line 107) The wait command    */
/*Wait = 0 will wait user get's out the condition before advising .. then   */
/*       advises and starts sequence                                        */
/*Wait = 1 Skip this condition even if no able to advise that node just     */
/*        reset..                                                           */
/*       Ok this is because sometimes uploading you hd will get validated   */
/*         and                                                              */
/*also will be good for all users to finish their activity before resetting */
/*The message sent to all nodes will be :                                   */
/*----------------------------------------------------------------------    */
/*The BBS has recieved an emergency shutdown, you have 60 secs to logoff    */
/*----------------------------------------------------------------------    */
/*so people on all nodes will be advised ..                                 */
/*also if sysop chatflag is detected the sysop will be called with a seq.   */
/*of beeps .... then the program will ask if you want to reset or not..     */
/*Also if you have these file in the path the node waiting logon will       */
/*suspend to make sure no one will logon untill seq. terminated.            */
/*s:rexx/suspend.bbs s:rexx/amisuspend.rexx                                 */
/*NOTE FOR GVP ECS68XXX users that use gvpcpuctrl fastom :                  */
/*Fastrom sometime Makes false reboots so at the end of the file you may    */
/*Enable the address line 'gvpcpuctrl >NIL: nofastrom' so fastromming will  */
/*be off befor rebooting ... by deleting the /* */                          */
/*                                                                          */
/*   AND REMEMBER TO EDIT THE LINE BELOW WITH YOU MAX NUMER OF NODES !      */
/*==========================================================================*/

maxnode = 3  /* Config this to your max # of nodes. */

parse arg node
signal on error 
signal on syntax
signal on ioerr
options results
tr=transmit;hk=getchar;pm=prompt;sendstring=sendmessage;ss=sendstring;gu=getuser
CLS=D2C("12")
CRLF="0D 0A"x
CR="0D"x
Q=''
fromnode = 'AERexxControl'node
address value fromnode
address value 'AERexxControl'node
gu=getuser
DT_NAME = 100
gu 12 ; SYSOP=result
gu 142 ; CHATFLAG=result
gu 144 ; TIME=result
gu DT_NAME
USER=result 
Open('appendfile','BBS:node'node'/callerslog','A')
WriteLN('appendfile',"        On "TIME" "USER" Accessed    /X R.e.s.e.t. ")
tr ""
tr "[0mR.e.s.e.t ![32m v3.0 [33mby [37mHighlander [31mof[33m Fairlight !![0m" CRLF
if chatflag=on then do
tr "[32mDetected Sysop Chatflag Active[37m -)[0m";tr ""
tr "Paging SYSOP LOCAL (CTRL-C to abort)". Q . Q . Q . Q . Q . Q . Q . Q . Q . Q . Q . Q . Q .
 tr ""
 sendmessage 'Are you sure that you want [1;37m/X [0mto Reset?[32m ([33my[32m/[33mN[32m)? [0m'
 getchar;M=UPPER(result)
 if M='N' then do; transmit 'No.'; tr "" ;shutdown ; exit;end  
 else do; 
tr 'Yes.'
call putit ;end;
putit:
tr "---------------------------------------------------------------------------"
tr "[0;32mThe BBS has recieved an emergency shutdown, you have [37m60[32m seconds to logoff!![0m"
tr "---------------------------------------------------------------------------"
tr ""
tr "        [0;33;44mWARNING [37m! [33mSequence Started [37m! [33mRebooting in [37m60[33m seconds....[0m "
tr ""
call nodecheck
call Advise
call sendMessage
success='true'
call Reset
end
Advise:
Send0=Q"---------------------------------------------------------------------------"
Send1="[0;32mThe BBS has recieved an emergency shutdown, you have [37m60[32m seconds to logoff!![0m"
Send2="---------------------------------------------------------------------------"
return
sendmessage:
tonode = 'AmiExpress_Node.'tnode
ADDRESS Value tonode 
AESAYLN ''
AESAYLN ''
AESAYLN Send0
AESAYLN Send1
AESAYLN Send2
AESAYLN ''                                      
AESAYLN '[32m([33mPause[32m)[34m...[32mSpace to Resume[33m:[0m '
success='true'
return
nodecheck:
Wait=0
 call Allnode
 call Reset
end
call Statcheck
if Wait=1 then call Reset
return
Statcheck:
Input = ''
Open(Input,'ENV:STATS@'||tnode,'R')
charA=''
posa=Seek(Input,36,B)                         
charA=ReadCh(Input,2)
close(Input)
if charA = 22 then do
 tr '	[32mUnable to Advise node [37m#'tnode'[32m, that node is awaiting logon![0m'
 if exists('s:rexx/suspend.bbs') then do 
  address command 's:rexx/suspend.bbs 'tnode
  end
 else do
 Wait=0
 end
end
if charA = 02 then do
 tr '	[32mAdvising node [37m#'tnode'[32m while user is Pumping up ware([33ms[32m)[0m'
 wait=0
end
if charA = 01 then do
 tr '	[32mAdvising node [37m#'tnode'[32m while user is Leeching ware([33ms[32m)[0m'
 wait=0
end
if charA = 06 then do
 tr '	[32mAdvising node [37m#'tnode'[32m, that node is Account Editing![0m'
 wait=0
end
if charA = 14 then do                                 
 tr '	[32mAdvising node [37m#'tnode'[32m while user is Shelling to the dos.[0m'
 wait=0
end
if charA = 17 then do                                 
 tr '	[32mAdvising node [37m#'tnode'[32m while user is Chatting sysop.[0m'
 wait=0
end
if charA = 04 then do                                 
 tr '	[32mAdvising node [37m#'tnode'[32m while user is Mailing Activities.[0m'
 wait=0
end
if charA = 00 then do                                 
 tr '	[32mAdvising node [37m#'tnode'[32m while user is Doing nothing..YAWN!.[0m'
 wait=0
end
if charA = 03 then do                                 
 tr '	[32mAdvising node [37m#'tnode'[32m while user is Dropped to door([33ms[32m)[0m'
 wait=0
end
if charA = 05 then do                                 
 tr '	[32mAdvising node [37m#'tnode'[32m while user is Showing its status.[0m'
 wait=0
end
if charA = 07 then do                                 
 tr '	[32mAdvising node [37m#'tnode'[32m while user is Zooming mail.[0m'
 wait=0
end
if charA = 08 then do                                 
 tr '	[32mAdvising node [37m#'tnode'[32m while user is Scanning files list.[0m'
 wait=0
end
if charA = 10 then do                                 
 tr '	[32mAdvising node [37m#'tnode'[32m while user is Viewing a text file.[0m'
 wait=0
end
if charA = 09 then do                                 
 tr '	[32mAdvising node [37m#'tnode'[32m while user is Reading bulletins.[0m'
 wait=0
end
if charA = 11 then do                                 
 tr '	[32mAdvising node [37m#'tnode'[32m while user is Logging on.[0m'
 wait=0
end
if charA = 12 then do                                 
 trt '	[32mAdvising node [37m#'tnode'[32m while user is Logging off.[0m'
 wait=0
end
if charA = 13 then do                                 
 tr '	[32mAdvising node [37m#'tnode'[32m while user is Mailing the Sysop.[0m'
 wait=0
end
if charA = 15 then do                                 
 tr '	[32mAdvising node [37m#'tnode'[32m while user is Using EMACS......[0m'
 wait=0
end
if charA = 16 then do                                 
 tr '	[32mAdvising node [37m#'tnode'[32m while user is Joining a conference .[0m'
 wait=0
end
if charA = 18 then do                                 
 tr '	[32mAdvising node [37m#'tnode'[32m while user is Carrier Lost....[0m'
 wait=0
end
if charA = 19 then do                                 
 tr '	[32mAdvising node [37m#'tnode'[32m while user is Paging Sysop.[0m'
 wait=0
end
if charA = 20 then do                                 
 tr '	[32mAdvising node [37m#'tnode'[32m while user is Connecting.[0m'
 wait=0
end
Return
Allnode:
call Advise
count=0
do while count ~= maxnode
 wait=0
 tnode = count
 call Statcheck                                  
 if count = node then wait = 1
 if wait < 1 then call sendmessage
 count=count+1
end
return
Reset:
address value fromnode
if success='true' then do
tr ""
tr Q"[0;32m00[37m.[32m60 [36msecs to go [32m....[0m"
ADDRESS COMMAND "c:wait 9"
tr Q"[0;32m00[37m.[32m50 [36msecs [32m....[0m"
ADDRESS COMMAND "c:wait 9"
tr Q"[0;32m00[37m.[32m40 [36msecs [32m....[0m"
ADDRESS COMMAND "c:wait 9"
tr Q"[0;32m00[37m.[32m30 [36msecs [32m....[0m"
ADDRESS COMMAND "c:wait 9"
tr Q"[0;32m00[37m.[32m20 [36msecs [32m....[0m"
ADDRESS COMMAND "c:wait 9"
tr Q"[0;32m00[37m.[32m10 [36msecs [32m....[0m"
ADDRESS COMMAND "c:wait 9"
tr Q"[0;32m00[37m.[32m04 [36msecs [32m....[0m"
tr ""
Open('appendfile','BBS:node'node'/callerslog','A')
WriteLN('appendfile',"        On "TIME" "USER" Successeful /X R.e.s.e.t. ")
/*the command below it to disable fastromming!*/
/*ADDRESS COMMAND "c:gvpcpuctrl nofastrom"*/
ADDRESS COMMAND "c:Reset"
 tr ''
end
 tr ''
SHUTDOWN
exit
Error: ; Syntax: ; IOerr:
	tr " An Error Has Occured In The Main Program On Line #"sigl"! Exiting..."
	tr " Please Notify ....."
	SHUTDOWN
	EXIT
