/*                                                                        */
/*                     VDRequest v2.2a By </an /)amme                     */
/*                    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~                    */
/*     For Any Comments Or Problems, You Can Reach Me On My Board...      */
/*                                                                        */
/*      .:| DeATH RoW (416)548-8557/548-9558/548-6632/548-0240 |:.        */
/*                                                                        */
/*                                                             [02/01/93] */

parse arg node;options results;signal on syntax;signal on error;signal on ioerr
nodeid = "AERexxControl"node;tr=transmit;hk=getchar;ss=sendstring;gu=getuser;address value nodeid
if exists("Doors:VDRequest.Prefs") then do;open(boy,"Doors:VDRequest.Prefs",R)
cosysop = readln(boy);outputfile = readln(boy);close(boy);end;else do;CoSysop = '200';outputfile='Doors:VDRequest.Txt'
end;gu 105;access = result;gu 100;alias = result;CR=D2C(13) ;next = 0;if exists(outputfile) then do
open(bunny,outputfile,'R');do while ~EOF(bunny);readln(bunny);next = next + 1;end;close(bunny);next = next - 5;end;else next = 1;Menu:
TR '';tr '';tr '[35m VD[31mRequest [32mVersion [31m2.3a';tr ' [33mBy [36m<[35m/[31man [36m/[35m)[31mamme'
tr '[0m';TR '  [31m1[35m. [33mEnter A Request';Tr '  [31m2[35m. [36mView Requests'
if access >= Cosysop then TR '  [31m3[35m. [36mDelete Requests';if access >= Cosysop then tr '  [31m4[35m. [36mExit Program'
if access < cosysop then tr '  [31m3[35m. [36mExit Program';TR '';SS ' [31mEnter Choice [35m:[35m ' 
fuckhead:;hk;inbuf = Result;if access >= cosysop & inbuf ~= CR & inbuf ~= '1' & inbuf ~= '2' & inbuf ~= '3' & inbuf ~= '4' then call fuckhead
if access < cosysop & inbuf ~= CR & inbuf ~= '1' & inbuf ~= '2' & inbuf ~= '3' then call fuckhead
if inbuf = CR then inbuf = '4';if inbuf = '1' then call entry;if inbuf = '2' then call view
if inbuf = '3' & access >= Cosysop then call delete;if inbuf = '3' & access < Cosysop then call quit
if inbuf = '4' then call quit;entry:;tr '[32mEnter Request[35m![0m..';spec = 0;entry2:
spec = spec + 1;tr '';sendmessage ' [31mFilename[35m/[31mDescription [35m([33mENTER[31m To Quit[35m)[31m [33m[[44m[36m'next'[0m[33m][35m:[31m ';query
filename=result ;if filename = '' then call Menu;filename=substr(filename,1,35);if next > 9 then tabby = 1;if next < 10 then tabby = 2
filereq = '[33m[[44m[36m'next'[0m[33m]['tabby'C[32m'filename''copies(' ',38-length(filename))'[36m'alias''copies(' ',22-length(alias))'   [33m 'date(u)'[0m'
if exists(outputfile) then do;call open('output',outputfile,'a');call seek('output',0,'E')
tr '';sendmessage '[31m  Adding Request to Bulletin[0m...';call writeln('output',filereq);transmit '  [31mDone[35m![0m'
call close('output');next = next + 1;abc = '1';end;else signal bullgen;signal entry2
bullgen:;call open('output',outputfile,'write');call writeln('output','[0H[0J')
call writeln('output','                              [31mRequested Files')
call writeln('output','                             [34m-----------------')
call writeln('output','[35m            Filename[31m/[35mDescription                Requested By           Date')
call writeln('output','[34m    ===================================== ========================= ==========[0m')
tr '';sendmessage '[31m  Adding Request to Bulletin[0m...';call writeln('output',filereq)
transmit '  [31mDone[35m![0m';call close('output');abc = '1';next = next + 1
call entry2;quit:;if abc = '1' then do;call calllog;abc = '';end;tr '[32mExit[35m![0m..';tr '';shutdown;exit
Press:;ss ' [34m([35mPress A Key.[34m)[36m...[0m' ; hk ; InB = result
if InB = '' then;do ; In = 1 ; end ; tr "";return;delete:;tr '[32mDelete Requests[35m![0m..';tr '';funky:;rickrude = 0;mad = next;bread = 1;if mad = 1 then do;mad = 1;bread = 0;end;handy = 0
query ' Delete [33m([44m[36m'bread'[0m[33m-[44m[36m'mad-1'[0m[33m)[31m? [35m([33mENTER [31mTo Quit[35m/[33m*[31m For All[35m[35m/[33m?[31m For List[35m)[31m[33m:[31m '
wow = result;ok = words(wow);if ok > 1 then butt = word(wow,1);if ok > 1 then ya = word(wow,2);if ok > 1 then wow = butt
if ok > 1 then handy = ya ;if wow = '' then rickrude = 1;if wow = '*' then call julia
if wow = '?' then call lister;if rickrude = 1 then call menu;if wow >= next | wow <1 then do
tr '';tr '  Last Request is [33m[[44m[36m'next-1'[0m[33m][0m';tr '';call funky;end
if wow < next then do;animal:;if handy = 0 then do;tr '';query '  [0mDelete [36m([44m[31m'wow'[0m[36m)[0m To [36m([44m[31m?[0m[36m)[0m: '
handy = result;end;if handy = '' then handy = wow;if handy >= next then do
tr '[0m';tr '  Last Request is [33m[[44m[36m'next-1'[0m[33m][0m';handy = 0
call animal;end;if handy < wow | handy < 1 then do;tr '[0m';tr '  Select Higher Then [33m[[44m[36m'wow-1'[0m[33m]'
handy = 0;call animal;end;if wow = 1 & handy = next -1 then call julia;;tr ''
ss '[0m  Delete Requests [33m[[44m[36m'wow'[0m[33m][0m To [33m[[44m[36m'handy'[0m[33m][0m?[0m '
hk ; shutup = result;if upper(shutup) = 'Y' then call jennifer;tr '[0mNo[35m![0m..'
tr '';call funky;shutdown ; exit;end;call menu;view:;tr '[32mView Requests[35m![0m..';if exists(outputfile)then do
showfile (outputfile);end;else do;tr '';tr '[33m Sorry, No Requests To View.';tr '';end;call press;call menu
Error: ; Syntax: ; IOerr:;tr '';tr ' An Error Has Occured, Exiting!';tr '';SHUTDOWN;EXIT
CallLog:;if exists("BBS:Node"node"/Callerslog") then do;open(file,"BBS:Node"node"/Callerslog",'A');writeln(file,alias" Requested Files At "time('C'));close(file);end;return;Lister:;if exists(outputfile) then do
tr '';open(hot,outputfile,'R');counter = 2;shit = 1;do until shit = 6;shit = shit + 1
readln(hot);end;do until counter > next;counter = counter + 1;asshole = readln(hot)
tr asshole;end;close(hot);tr '';call funky;end;tr '';tr '  [0mNo Requests To List[35m![0m..';tr ''
call funky;Jennifer:;tr '[0mYes[35m![0m..';if exists(outputfile) then do;counter = 0;open(tails,outputfile,'R')
do while ~EOF(tails);sledge = readln(tails);counter = counter + 1;ifuckedher.counter = sledge
end;close(tails);counter = counter - 6;somebody = 1;low = wow - 1;man = handy + 1
if somebody > low then somebody = low;if man > counter then do;counter = man
stop = 1;end;address command 'C:Delete 'outputfile
open(output,outputfile,'Write');writeln(output,'[0H[0J');writeln(output,'                              [31mRequested Files')
writeln(output,'                             [34m-----------------');writeln(output,'[35m            Filename[31m/[35mDescription                Requested By           Date')
writeln(output,'[34m    ===================================== ========================= ==========[0m')
fucking = somebody;fucking = fucking + 5;low = low + 5;do until fucking > low
if fucking > 5 then writeln(output,ifuckedher.fucking);fucking = fucking + 1
end;counter = counter + 5;man = man + 5;do until man > counter;if stop ~= 1 then writeln(output,ifuckedher.man)
man = man + 1;end ;close(output);tr '';tr '[0m  Requests [33m[[44m[36m'wow'[0m[33m][0m To [33m[[44m[36m'handy'[0m[33m][0m Deleted[35m![0m..'
tr '';limbo = 0;open(who,outputfile,'R');do while ~EOF(who);limbo = limbo + 1
elmo.limbo = readln(who);end;close(who);address command 'C:Delete 'outputfile
open(output,outputfile,'W');writeln(output,'[0H[0J')writeln(output,'                              [31mRequested Files')
writeln(output,'                             [34m-----------------')writeln(output,'[35m            Filename[31m/[35mDescription                Requested By           Date')
writeln(output,'[34m    ===================================== ========================= ==========[0m');close(output)
disk = 0;where = limbo;mouse = 5;open(paper,outputfile,'A');do until mouse = where -1
mouse = mouse + 1;disk = disk + 1;if disk > 9 then tabber = 1;if disk < 10 then tabber = 2
good.mouse = right(elmo.mouse,91);fuck.mouse = '[33m[[44m[36m'disk'[0m[33m]['tabber'C[32m'good.mouse
writeln(paper,fuck.mouse);if mouse > where then break;end;close(paper);end
next = 0;if exists(outputfile) then do;open(bunny,outputfile,'R');do while ~EOF(bunny)
readln(bunny);next = next + 1;end;close(bunny);next = next - 5;end;call funky;end
Julia:;tr '';ss '  [0mDelete All Requests[35m? ';hk ; kiss = result;if upper(kiss) ~= 'Y' then do
tr '[0mNo[35m![0m..';tr '';call funky;end ;tr '[0mYes[35m![0m..'
if exists(outputfile) then do;address command 'C:Delete 'outputfile
tr '';tr ' [0m All Requests Deleted[35m![31m..';next = 1;tr '';call funky
end  ;if ~exists(outputfile) then do;tr '';tr '  0mNo Requests To Delete[35m![0m..';tr '';call funky;end;end
