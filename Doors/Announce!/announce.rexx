/* ANNOUNCE! v1.2 Lamed by SouLCatcheR/AFL un-lamed By >>Tecnokid<< */
options results;signal on error;signal on syntax;signal on ioerr
parse arg node
startnode = 'AERexxControl'node
address value startnode
getuser 100;username=result
getuser 12;sysop=result
transmit '0a'x||'[1mANNOUNCE![0m v1.2 LAMED by [34mSouLCatcheR[0m/[36mAFL[0m (Un-Lamed by >Tecnokid<)'||'0a'x||'0a'x||'[1m[31mPLEASE WAIT[0m....informing [33m'sysop'[0m of your logon.'||'0a'x
ADDRESS COMMAND 'run >nil: echo " 'username' Has connected to node'node' " to SPEAK:'
SHUTDOWN;exit
SYNTAX:;ERROR:;IOERR:;transmit rc' ('errortext(rc)') in line 'sigl;shutdown;exit
