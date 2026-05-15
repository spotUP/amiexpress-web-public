/*                                                                        */
/*                    VDComment v1.5 By </an /)amme                       */
/*                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~                      */
/*     For Any Comments Or Problems, You Can Reach Me On My Board...      */
/*                                                                        */
/*       .:| DeATH RoW (416)548-8557/548-9558/548-6632/548-0240 |:.       */
/*                                                                        */
/*                                                             [01/31/93] */

parse arg node;options results;signal on syntax;signal on error;signal on ioerr
nodeid = "AERexxControl"node;tr=transmit;hk=getchar;ss=sendstring;gu=getuser
address value nodeid;gu 149;NODE=result;gu 100;Username = result;gu 131;shit = result;answer = right(shit,1)
gu 122;cloth = result;Putustr 500;Putuser 122;cat = 0;gu 12;sysop=result;do girl = 1 to 9;special.girl = '';end;if exists("Doors:VDComment.Prefs") then do
open(moment,'Doors:VDComment.Prefs','R');do until EOF(moment);yell = readln(moment)
if substr(yell,1,1) = '*' then do;cat = cat + 1;if cat = 10 then do;cat = 9;call past
end;loca.cat = 0;location.cat.1 = '';saying.cat.1 = '';saz.cat = 0;end;if substr(yell,1,1) = '*' then name.cat = strip(substr(yell,2,21))
if substr(yell,1,1) = '@' then special.cat = strip(substr(yell,2,80));if substr(yell,1,1) = '#' then do
loca.cat = loca.cat + 1;b = loca.cat;location.cat.b = strip(substr(yell,2,51))
end;if substr(yell,1,1) = '%' then do;saz.cat = saz.cat + 1;a = saz.cat;saying.cat.a = strip(substr(yell,2,50))
end;end;end;else do;tr;tr 'The File [36m"[35mVD[31mComment[32m.[31mPrefs[36m"[0m Was Not Found. Please Inform 'sysop'.'
tr;shutdown;exit;end;Past:;do higher = 1 to cat;if special.higher = '' then special.higher = name.higher
end;close(moment);if answer < 1 | answer > cat then answer = 0;CR=D2C(13);do chain = 1 to cat;if location.chain.1 = '' then do
location.chain.1 = 'Unavailable';loca.chain = 1;end;if saying.chain.1 = '' then do
saying.chain.1 = 'Unavailable';saz.chain = 1;end;end
tr '';tr ;tr '[35mVD[31mComment [32mVersion [31m1.5 [33mBy [36m<[35m/[31man [36m/[35m)[31mamme';tr 
do girly = 1 to cat;tr ' [33m[[36m'girly'[33m][0m  'special.girly;guess = 0
do until guess > 0 & guess <= loca.girly;guess = random(0,loca.girly+1,time('s'));end;tr ' [0m['4+girly'H[28C[33m'location.girly.guess
end;tr ;ss '[35m'username'[0m,[31m Leave A [32mComment[0m [31mTo[35m: [44m[36m'
if answer = 0 then do until answer >0 & answer <= cat;hk ; answer = result;if answer = CR then break;end
if answer = cr then answer2 = 1;else answer2 = answer;if answer = CR then answer = name.1
else answer = name.answer;tr answer;guess = 0;do until guess > 0 & guess <= saz.answer2;guess = random(0,saz.answer2+1,time('s'))
end;tr ;tr '[0m[44m[36m'answer'[0m Says[32m: [35m'saying.answer2.guess
ss '[0m';if exists("BBS:Node"node"/Callerslog") then do;open(file,"BBS:Node"node"/Callerslog",'A')
writeln(file,username" Sent A Comment To "answer" At "time('C'));close(file)
end;Putustr cloth;Putuser 122;fucked = 'E 'answer;putustr fucked;putuser 136;shutdown;exit
Error:;Ioerr:;Syntax:;tr 'An Error Has Occured! Exiting!';shutdown;exit
