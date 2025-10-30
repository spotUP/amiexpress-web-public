/* __________________________________________________________________ */
/*                                                                    */
/*    STAR TREK COOKIE V 1.1 © 1994 By FRaNKy & Mr Hyde / Therapy     */
/* __________________________________________________________________ */
/*                                                                    */

parse arg node; options results; nodeid = "AERexxControl"node; address value nodeid
signal on syntax; signal on ioerr
bufferflush
FALSE= 0
TRUE = 1
MAX  = 99

/* Some Handy Shortcuts */

tr = transmit   ;  hk = getchar ;  pm = prompt  ;  sendstring = sendmessage
ss = sendstring ;  gu = getuser ;  pu = putuser
NUL  = '0'X

/* Screen codes */

OFF  = '[0m'
CLS  = D2C(12) || OFF
CR   = D2C(10)
TAB  = D2C(9)

/* Set ANSI Colors */

RED='[31m';  GRN ='[32m'; YEL='[33m'; BLU='[34m'
MAG='[35m'; CYN='[36m';  REDYEL='[41;33m'; WHTRED='[47;31m';

TIME             = 144

/* Let's Go */

Start:
tr " "
tr MAG".-----------------------------------------------------------------------------."
tr MAG"|                "YEL"Star Trek Cookie v 1.2 © 1994 FRaNKy / ReFLeX                "MAG"|"
tr MAG"`-----------------------------------------------------------------------------'"

    ab=0
    A=TIME('s')
    b = value('a')
    x= right(b,2)
    if x>max then x=x-max
    if ~exists('Doors:STCookie/Biscuit') then call Buggy
    call open('Bisc','Doors:STCookie/Biscuit','read')
    do until eof('Bisc')
       Bisca=readln('Bisc')
       if Bisca=x then do
          Bisca=readln('Bisc')
          lang=(80-length(bisca))/2
          tr " "
          do while ab < lang
            ss " "
            ab=ab+1
          end
          ss ""CYN""Bisca""cr""cr
       end
       Bisca=readln('Bisc')
    end
call dexit

Buggy:

tr ""
tr WHTRED"Couldn't Locate Cookie File (Doors:STCookie/Biscuit)"
tr ""
call dexit


/*==========================================================================*/
IOERR: tr "I/O Error: Missing File/Directory"
ERROR:
SYNTAX: tr "Error in Line.. #"sigl" Exiting.." ; tr errortext(sigl)

/*==========================================================================*/

DExit: bufferflush ; ShutDown ; Exit

prompt: procedure ; parse arg message,length ; RECEIVE length ; QUERY message ; return result
putvar: procedure ; parse arg string1,string2 ; PUTUSTR string1 ; PUTUSER string2 ; return 0
getvar: procedure ; parse arg string1 ; getuser string1 ; return result
