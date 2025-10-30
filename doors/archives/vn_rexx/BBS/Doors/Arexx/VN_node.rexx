/*      A SiMPLE Who DoOR Made Simpler & Faster, By )/ideo /\/asty          */
/*           ALL REDUNDANT CODE REMOVED to Speed up Execution               */
/*         Call LowLife II Where LoONs Hangout +44(0)61 4993786             */

/* Origanal Door	     WhoNode V1.0				    */
/*			  BY EMPIRE / EXT!INCE				    */
/*		 LaSt OuTpOsT  +31-721-57682  -  HOLLAND		    */
/*			   A Simple WHO DOOR				    */

parse arg node; options results; nodeid = "AERexxControl"node; address value nodeid
signal on syntax; signal on error; signal on ioerr

NodesUsedString=getvar(123)
NodesUsed=length(compress(NodesUsedString))
NodesFmt=length(trim(NodesUsedString))
NUL = '0'X
BBS=getvar(128)
ConfNum=getvar(510)+1
ConfName=getvar(126)
Status.00="Idle"
Status.01="Downloading"
Status.02="Uploading"
Status.03="In a Module"
Status.04="Read/Write Mail"
Status.05="Reviewing Stats"
Status.06="Account Editing"
Status.07="Zooming Mail"
Status.08="View Dir Files"
Status.09="Reading Bulletins"
Status.10="Viewing a File"
Status.11="? i dont know"
Status.12="Logging Off"
Status.13="Sysop Commands"
Status.14="Dropped to Shell"
Status.15="Using Emacs"
Status.16="Joining a Conf"
Status.17="Chatting"
Status.18="Resetting Node"
Status.19="Paging Sysop"
Status.20="Connecting"
Status.21="Logging On'"
Status.22="Awaiting Logon"
Status.23="Scanning Mail"
Status.24="Node Inactive"
Status.25="In MultiNode Chat"
Status.26="BBS Suspended"
Status.27="Reserved for User"
Status.28="Entered AEShell"
Status.29="Spying on Users"
nodenr=0
transmit ""
sendmessage "Reading Node (   "
do until NodeNR=NodesFmt
Sendmessage d2c(8)||d2c(8)||d2c(8)left(NodeNR")",3)
if exists(BBS"Node"Nodenr".user") then do
 open(WhoUser,(BBS"node"Nodenr".user"),'R')
 WhoUserRAW=readch(WhoUser,232)
 close(WhoUser)
 WhoUserName=left(WhoUserRAW,index(WhoUserRAW,NUL)-1)
 WhoUserLocation=substr(WhoUserRAW,41,index(WhoUserRAW,NUL,41)-41)
end
if ~exists("ENV:STATS@"Nodenr) then do
 WhoUserName="NastyNode"
 WhoUserLocation="Waiting for Node"
 WhoStat=24
End
Else do
 open(Stats,("ENV:STATS@"Nodenr),'R')
 WhoStat=right(readch(Stats,38),2)
 close(Stats)
end
if node=nodenr then Whostat=29
If WhoStat=22 then do ; WhoUserName=" " ; WhoUserLocation=" " ; End
If WhoStat=24 then do ; WhoUserName=" " ; WhoUserLocation=" " ; End
If WhoUserName="WHOUSERNAME" then do ; WhoUserName=" " ; WhoUserLocation=" " ; Whostat=21 ; End
line.nodenr="[37m|  [34m"left(nodenr,4)"[37m| [32m"left(WhoUserName,21)"[37m| [36m"left(WhoUserLocation,24)"[37m| [33m"left(Status.whostat,20)"[37m|"
nodenr=nodenr+1
end
nodenr=0
Sendmessage d2c(8)||d2c(8)||d2c(8)"Done)"
transmit ""
TransMit Centre("Nodes ("NodesFmt") Your on Node ("Node") in Conference ("ConfNum") "ConfName,80)
TransMit "[37m.-----------------------------------------------------------------------------."
Transmit "| [34mNode[37m | [32mUser Name           [37m | [36mGroup/Location         [37m | [33mActivity            [37m|"
Transmit ")------+----------------------+-------------------------+---------------------("
do until NodeNR=NodesFmt
 transmit line.nodenr
nodenr=nodenr+1
end
TransMit "`------^----------------------^-------------------------^------[35mNastyNode v1.1[37m-'"
Transmit ""
ShutDown
Exit
getvar: procedure
parse arg string1
 getuser string1
return result
IOERR:
  Transmit "I/O Error: Missing File/Directory"
ERROR:
SYNTAX:
  Transmit "Error in Line.. #"sigl" Exiting.."
  Transmit errortext(sigl)
  ShutDown
Exit
