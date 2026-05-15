/* =============================== */
/* Mo-EMAIL  V1.05 - Wormhole 1998 */
/* =============================== */

parse arg node
options results
address value "AERexxControl"node

ac = "[35m" ; bc = "[32m" ; cc = "[33m" ; dc = "[34m" ; ec = "[0m" ; zc = "[36m"
gt=GETUSER ; tr=TRANSMIT ; sm=SENDMESSAGE ; CLS=""

signal on syntax

if exists('t:mo-mail') then call ALREADY

menu="doors:email/menu.txt"
abou="doors:email/about.txt"
care="doors:email/delete.txt"

zzz=1

if ~show('P','YAM') then do
 tr CLS ; tr ""
 tr ac"Loading "cc"YAM"ac"-Outside Email Program...Please wait."
 sm ac"Blame your sysop for not running it beforehand..."
 address command "run >NIL: yam:YAM NOCHECK HIDE"
 address command "c:waitforport YAM"
 address command "c:wait 4"
end

address command "c:rx doors:email/hide.rexx"

if exists('t:mo-mail') then do
 address command "c:delete >NIL: t:mo-mail ALL"
end
address command "c:makedir >NIL: t:Mo-Mail"

gt 100 ; user=result
open(file1,'t:Mo-mail/USER','w')
writeln(file1,user".PVT")
close(file1)

call MAIN
call EXIT

MAIN:
 if exists('t:mo-mail/FILENAME') then do
 address command "c:delete >NIL: t:mo-mail/FILENAME"
 end
 tr CLS
 showfile menu
 sm cc"   mAKE yOUR cHOICE: "
 do forever
 getchar
 if result="a" then call ABOUT
 if result="q" then call EXIT
 if result="r" then call READ
 if result="w" then call WRITEMAIL
 if result="i" then call INFORMATION
 if result="k" then call KILL
 end

EXIT:
     tr "" ; tr ""
     tr cc"Thank you for using "ac"mO-eMAIL!"
     tr ""
     if exists('t:mo-mail') then do
     address command "c:delete >NIL: t:mo-mail ALL"
     end
     SHUTDOWN
     EXIT
     END

ABOUT:
      tr CLS
      showfile "doors:email/about.txt"
      sm zc"Press ["cc"SPACE"zc"] to exit this waste-o-time text file..."
      getchar
      call MAIN

READ:
     qw=1
     address command "c:rx doors:email/scan.rexx"
     open(gate,'t:mo-mail/scana','r')
     do splitz=0 until eof(gate)
     q1=readln(gate)

     if q1="[EOF]" then call VIEWEND

     q2=readln(gate)
     q3=readln(gate)
     q4=readln(gate)

     if ~exists(q3) then call DAMNIT

     do forever

     tr CLS
     sm zc"Message : " ; sm cc""qw ; tr ""
     sm zc"To      : " ; sm cc""user ; tr ""
     sm zc"From    : " ; sm cc""q2 ; tr "" ; tr bc""

     open(yourmail,q3,'r') ; gh=0
     do f=0 until eof(yourmail)
     feed=readln(yourmail)
     if word(feed,1)="X-Mailer:" then gh=1
     if gh=1 then tr feed

     end
     close(yourmail)

     sm cc"Options: "ac"["cc"R"ac"]eply ["cc"Q"ac"]uit ["cc"D"ac"]ownload ["cc"N"ac"]ext: "

     getchar
     if result="q" then call VIEWQUIT
     if result="d" then call PROCESS
     if result="r" then call REPLY
     if result="n" then break
     end
     qw=qw+1
     end
     close(gate)
     call MAIN

WRITEMAIL:
     if exists('t:mo-mail/FILENAME') then do
     address command "c:delete >NIL: t:mo-mail/FILENAME ALL"
     end
     if exists('t:mo-mail/letter') then do
     address command "c:delete >NIL: t:mo-mail/letter"
     end
     tr ""
     tr ""
     sm ac"   sEND eMAIL tO: "cc ; query ; email=result
     if email="" then call MAIN
     tr ""
     sm ac"   dO yOU wISH tO aTTACH a fILE? "cc ; getchar
     if result="y" then call ATTACH
     open(house,'t:mo-mail/MAILTO','w')
     writeln(house,email)
     close(house)
     tr ""
     putustr "t:mo-mail/LETTER"
     putuser 009
     address command "c:rx doors:email/handler.rexx"
     call MAIN

NOMORE:
     close(file6)
     close(file7)
     close(file9)
     tr CLS
     sm cc"yOUR mAILBOX iS eMPTY! "ac"sMASH a kEY! "
     getchar
     call MAIN


CHEESE:
     close(file6)
     close(file7)
     close(file9)
     call MAIN

KILL:
     tr CLS
     showfile care
     tr ""
     sm zc"Well, are you going to "cc"DELETE"zc" or not? "
     getchar
     if result="y" then do
     tr CLS
     sm cc"Working..."
     address command "c:rx doors:email/kill.rexx"
     sm zc"done!"
     tr "" ; tr ""
     sm bc"Press a key to continue... " ; getchar
     end
     call MAIN

PROCESS:
     open(tree,q3,'r') ; pp=0
     open(push,'t:mo-mail/YourMail'zzz,'w')
     writeln(push,'To: 'user)
     writeln(push,'From: 'q2)
     writeln(push,' ')
     do I=0 until eof(tree)
     tip=readln(tree)
     if word(tip,1)="X-Mailer:" then pp=1
     if pp=1 then writeln(push,tip)
     end
     helpyou="t:mo/mail/YourMail"zzz
     putustr helpyou
     putuser 137
     close(push) ; close(tree)
     zzz=zzz+1
     return


REPLY:
      if exists('t:mo-mail/REPLY') then do
      address command "c:delete >NIL: t:mo-mail/reply"
      end
      if exists('t:mo-mail/PERSONAL') then do
      address command "c:delete >NIL: t:mo-mail/personal"
      end
      tr CLS
      tr "" ; tr "" ; sm ac"Orig Mail from: " ; sm cc""q2
      tr "" ; tr ""
      open(file98,'t:mo-mail/PERSONAL','w')
      writeln(file98,q2)
      close(file98)
      putustr "t:mo-mail/REPLY"
      putuser 009
      address command "c:rx doors:email/reply.rexx"
      return

INFORMATION:
            tr CLS
            showfile "doors:email/information.txt"
            sm zc"Press ["cc"SPACE"zc"] to exit this waste-o-time text file..."
            getchar
            call MAIN

VIEWEND:
      tr CLS
      sm zc"eND oF mAIL!"cc" sMASH a kEY! "
      getchar
      close(gate)
      call MAIN

VIEWQUIT:
      close(gate)
      call MAIN

CHECKFIND:
          df=1
          return

ALREADY:
        tr ""
        tr zc"I'm sorry, but the "cc"Mo-EMAIL "zc"door is currently in use!"
        tr ""
        SHUTDOWN
        EXIT
        END

SYNTAX:
        tr "An error has occured in line: "sigl" Please notify SYSOP."
        SHUTDOWN
        EXIT
        END

DAMNIT:
       close(gate)
       tr CLS
       tr zc"An error has occured."
       tr "Requested file: "cc""q3""zc" is missing."
       tr ""
       tr ""
       if exists('t:mo-mail') then do
       address command "c:delete >NIL: t:mo-mail ALL"
       SHUTDOWN
       EXIT
       END

ATTACH:
       tr ""
       if exists('t:mo-mail/FILE') then do
       address command "c:delete >NIL: t:mo-mail/FILE ALL"
       end
       address command "c:makedir >NIL: t:mo-mail/FILE"
       bait="t:mo-mail/file"
       putustr bait
       putuser 138
       address command "c:dir t:mo-mail/file >t:mo-mail/FILENAME"
       open(jup,'t:mo-mail/filename','r')
       help=readln(jup)
       name=word(help,1)
       close(jup)
       open(jup2,'t:mo-mail/FILENAME','w')
       writeln(jup2,name)
       close(jup2)
       return
