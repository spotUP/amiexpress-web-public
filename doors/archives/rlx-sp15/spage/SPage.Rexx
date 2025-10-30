/**************************************************************************
*                                                                         *
*    Simple Page V 1.5        © 1994 Franky/ReFLeX  a PHRaS /X-Prodcution *
*                             Thanx to Maddy...                           *
*                                                                         *
*    To contact the author write to FIDO :  2:292/603.8                   *
*                                   AMY  : 39:120/102.8                   *
*                 or call: -Subway       : +46-340-73830                  *
*                          -Metal Impact : +32-15-219992                  *
*                                                                         *
***************************************************************************
************************ WEENY CONFIG PART ! *****************************/
Okre = 200        /* ( = Ye Overirde Chat Off Level ! ) */
/******************** Thank you for using At&t ! **************************
******************** Don't change anything below ! ************************
****************** And may the shwarz be with you ! ***********************
******************************  N I H ! ***********************************
****** And While you're still reading.. Give the RLX Boards a buzz ! ******
**                                                              ____     **
**   _ _ __________________________________. ________________  /   /     **
**    \\\\______    /____    /\__  _____/  | \______    /\   \/   /      **
**        / \    __/ \______/_./   ___)    |__/_\______/_.\_    _/       **
**      _/   \    \    /_     |     ¦    __/    | /_     |/      \_ _ _  **
**   dZG\_____\    \__________|_____:___________|________|   /\___////   **
** «-----------\____/-----------------------------------/___/------------»*
**                                                                       **
**   [Whq] [Lost in Time...] [+1-608-755-1335] [Minstrel.......] [1 Nde] **
**   [Ehq] [Subway.........] [+46-34-07-38-30] [Terrorizer.....] [1 Nde] **
**   [Shq] [Black Sabbath..] [+46-8-580-34548] [Euphoria!......] [1 Nde] **
**   [Uhq] [Dark Moon......] [+1-203-445-0113] [Broken Arrow...] [1 Nde] **
**   [Uhq] [Warez Depot....] [+1-305-819-9925] [AmigaMan.......] [3 Ndz] **
**   [Uhq] [Psycho Terminal] [+1-914-682-1975] [Whiz...........] [2 Ndz] **
**   [Uhq] [Liquid Assets..] [+1-203-822-6225] [Excaliber......] [1 Nde] **
**   [Uhq] [Dark Church....] [+1-415-586-9269] [Blind Guardian.] [3 Ndz] **
**   [Uhq] [Zarophagus.....] [+1-503-548-0532] [Adonis.........] [1 Nde] **
***************************************************************************
**************** I can't believe you're still reading... ******************
********************** Ohwell.. It's you're time... ***********************
********** Guess a quick hello to my buddy's is in place here too... ******
************ No list cuz I'm testing my new 16.8 Hst (yezzzzzzzz) *********
**************************************************************************/
parse arg node; options results; nodeid = "AERexxControl"node; address value nodeid
signal on syntax; signal on ioerr
bufferflush
tr = transmit   ;  hk = getchar ;  pm = prompt  ;  sendstring = sendmessage
ss = sendstring ;  gu = getuser ;  pu = putuser
gu 12 ; sysop=result
gu 142; chat=result
gu 105; level=result
tr " "
tr "[33mSimplePage V 1[36m.[33m5   ©'94 FRaNKy / RLX!"
tr "[35m¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯"
if chat = 'OFF' then call nohome
else call watte
end
watte:
query "[33mEnter Your Chat Reason [36m> "
reden=result
if reden = "" then call ohno
else call yezz
end
yezz:
ss "[33m"
putvar("o",136)
call kwiet
end
nohome:
if level > okre-1 then call watte
call gone
gone:
query "[33mSeems like "sysop" is not around[36m.. [33mWanna leave a messy [32m? [35m[[33my[36m/[33mN[35m] [36m> "
antw = result
antw2 = left(antw,1)
if antw2 = 'Y' then call kommi
if antw2 = 'y' then call kommi
else call kwiet
end
kommi:
tr " "
putvar("c",136)
call kwiet
end
ohno:
tr " "
tr "[33mNo Reason [36m= [33mNo Chat [32m!"
call kwiet
end
kwiet:
tr " "
call dexit
end

/*==========================================================================*/
IOERR: tr "I/O Error: Missing File/Directory"
ERROR:
SYNTAX: tr "Error in Line.. #"sigl" Exiting.." ; tr errortext(sigl)

/*==========================================================================*/

DExit: bufferflush ; ShutDown ; Exit

prompt: procedure ; parse arg message,length ; RECEIVE length ; QUERY message ; return result
putvar: procedure ; parse arg string1,string2 ; PUTUSTR string1 ; PUTUSER string2 ; return 0
getvar: procedure ; parse arg string1 ; getuser string1 ; return result
