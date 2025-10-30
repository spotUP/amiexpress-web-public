/*-        oPeNMeNu.ReXX by RhAPSOdy       */
/*-      Land Of Deathless BBS (Italy)     */
/*       Every day from 14:00 to 24:00     */
/*             +39/(0)331/621724           */
parse arg node
options results
nodeid="AERexxControl"node
address value nodeid
signal on syntax
signal on error
signal on ioErr

tr= transmit
gu = getuser

Call open(Stat,'BBS:SystemStats','R')
TotalCalls=Readln(Stat)
Caller=Right(TotalCalls,6,'0')
Call Close(Stat)

gu 100
UserName=result

tr ' '
tr '[0m[1J '
tr '[11C[35m_____  _______________    ____  /\  __________    ________ '
tr '[7CRhP/ __  \/ __  \ _____/  \  / /  \/  \/  _____/  \  / /  /  / '
tr '[9C/   |   \  /__/ __/ / \  \/ /[5C/  \_ __/ / \  \/ /  /  / '
tr '[9C\_______/_/   \____/\__\___/\___\/____/____/\__\___/\____/ 0.9 '
tr '[36m[[32m*[36m]=========================================================================[[32m*[36m]'
tr '[35m |[32m-[35m|[32m1[35m|[32m9[35m|[32m9[35m|[32m4[35m|[32m-[35m|||||||[44m<<< [33m[[32moPeNMeNu 0.9[33m]  [32mby  RhAPSOdy [35m>>>[40m||||||||||[32m-[35m|[32m1[35m|[32m9[35m|[32m9[35m|[32m4[35m|[32m-[35m| '
tr '[36m[[32m*[36m]=========================================================================[[32m*[36m]'
Showfile 'Doors:oPeNMeNu/oPeNMeNu.txt'
tr '[[32m*[36m]=========================================================================[[32m*[36m]'
tr ' [35m|||[44m  [32mKaLL Land Of Deathless BBS  (14:00 > 24:00 only!)  +39-(0)331-621724 [35;40m||| '
tr '[36m[[32m*[36m]=========================================================================[[32m*[36m]'
tr '[18C[35m-> [34mTHaNKS FoR uSiNG THiS C00L DooR!!! [35m<-[0m '
tr ' '

Shutdown
Exit
