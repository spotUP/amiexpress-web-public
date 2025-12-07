/***************************************************/
/*  Original by Nameless                           */
/*  Debugged & Fixed for /X 3.xx by EMPiRE/MYSTiC  */
/***************************************************/

#include "sc:AE.Includes/doorheader.h"
#include "sc:AE.Includes/glue.h"

#include <exec/types.h>
#include <exec/exec.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define sm sendmessage

main(int argc,char *argv[])
{
   BOOL match;     /* match something? */
   char buff[20];  /* scratch buffer */
   char *example = "[37m-*- EXAMPLE USE -*-[0m";
   char *sysop =   "[37m-*- SYSOP INFO -*-[0m";
   Register(argv[1][0]-'0');

   LOOP:
 
   match = FALSE;  /* Reset 'we found a match' flag */

   sm(" ",1);
   sm(" ",1);
   sm("[32m** [33mHelp v0.3 by -= [37mNameless[33m =- of Snarfs' Pub BBS (407) 267-8155 [32m**[0m",1);
   sm(" ",1);

   sm("Below are the available AmiExpress commands with brief descriptions.",1);
   sm(" ",1);
   sm("[32m?   - [0mShow the current conf menu  [32mB   - [0mBulletins",1);
   sm("[32mC   - [0mComment to Sysop            [32mD   - [0mDownload file(s)",1);
   sm("[32mE   - [0mEnter mail/message          [32mF   - [0mList files",1);
   sm("[32mG   - [0mGoodbye                     [32mH   - [0mHelp with bbs",1);
   sm("[32mJ   - [0mJoin a conference           [32mM   - [0mANSI graphics on/off",1);
   sm("[32mN   - [0mNew files                   [32mO   - [0mOperator page, chat",1);
   sm("[32mR   - [0mRead mail                   [32mS   - [0mPrint your stats",1);
   sm("[32mT   - [0mThe current time            [32mU   - [0mUpload a file",1);
   sm("[32mUR  - [0mUpload Resume a file(tm)    [32mV   - [0mView a text file",1);
   sm("[32mW   - [0mWrite your stats            [32mX   - [0mToggle expert mode on/off",1);
   sm("[32mZ   - [0mZippy file search           [32mOPEN- [0mOpen the door menu",1);
   sm("[32mZOOM- [0mGathers all messages since last call for free (D)ownload",1);
   sm(" ",1);

   prompt("Enter command you want HELP with [[32mpress <RETURN> to quit[0m]-> ",buff,4);

   if(*buff!=0) sm(" ",1);
   sm(" ",1);
 
   if(!strcmp("?",strupr(buff)))
     {
     sm("[37m-*- (?) Show current menu -*-[0m",1);
     sm(" ",1);
     sm("When you have expert mode selected, you won't see the menu regularly.",1);
     sm("This command is very convenient to bring the menu back up when you",1);
     sm("need quick help while in expert mode.",1);
     sm(" ",1);
     sm("Press X to toggle expert mode on/off (ie.. menu on/off)",1);
     match = TRUE;
     }

   if(!strcmp("B",strupr(buff)))
     {
     sm("[37m-*- (B)ulletins -*-[0m",1);
     sm(" ",1);
     sm("When b is pressed you will get a listing of available bulletins.",1);
     sm("from there you can select which bulletin to view. You can also select",1);
     sm("to display a specific bulletin by typing the number after the b.",1);
     sm("After displaying the bulletin you will be returned to the bulletin",1);
     sm("prompt to type in a new bulletin number. NOTE: Each area may have its",1);
     sm("own bulletins.",1);
     sm(" ",1);
     sm(example,1);
     sm(" ",1);
     sm("b   <- by itself displays menu",1);
     sm("b 1 <- with a number will display that bulletin",1);
     sm(" ",1);
     sm(sysop,1);
     sm(" ",1);
     sm("BBS:conf/bulletins/Bullhelp.txt OR Bullhelp.txt.gr has the menu",1);
     sm("BBS:conf/bulletins/Bull1.txt Bull2.txt.gr... are the bulletin files",1);
     sm("There is no limit to the number of bulletins you can have",1);
     match = TRUE;
     }

   if(!strcmp("C",strupr(buff)))
     {
     sm("[37m-*- (C)omment to Sysop -*-[0m",1);
     sm(" ",1);
     sm("Comment to Sysop is a private message to the Sysop.  When you press 'c' the",1);
     sm("BBS will fill in 'To:' with the Sysops username, and you will be asked for",1);
     sm("a title for the message.  See the mail section below on how to use the editor.",1);
     sm(" ",1);
     sm("During posts you can do a TEXT FILE SEND from most term programs, but you",1);
     sm("must remember to remove any blank lines (put at least 1 space on all lines!)",1);
     sm("else the AE editor will think you are finished and prompt for your A)bort",1);
     sm("C)ont D)elete E)dit S)ave ... choice in the middle of the send.",1);
     match = TRUE;
     }

   if(!strcmp("D",strupr(buff)))
     {
     sm("[37m-*- (D)ownload file(s) -*-[0m",1);
     sm(" ",1);
     sm("When d is pressed file infomation about the users is printed, and the user",1);
     sm("is ask to enter the protocol (X,Y, or Zmodem) and filenames for downloading.",1);
     sm("At the Filespec(X) prompt enter the file name you are looking for. You can",1);
     sm("use spaces to separate filenames for multiple entries on that line.",1);
     sm("When you enter a filename the BBS searches for the file. If it finds the",1);
     sm("file it will print size of the file and the time it will take to download",1);
     sm("it. If it does not find the file it ask for a replacement file. Once you",1);
     sm("have entered all the files you want to download pressing return by itself",1);
     sm("on the filespec prompt will let you continue.",1);
     sm(" ",1);
     sm("The next prompt you get will ask you to press return to start the transfer,",1);
     sm("A for abort, and G for goodbye after transfer. Abort will exit you back to",1);
     sm("the main menu prompt. Goodbye after transfer will hang up after the",1);
     sm("transfer is done.",1);
     sm(" ",1);
     sm("You can also enter filenames separated by a space right from the main menu.",1);
     sm("For example at the main menu prompt you can type; 'd filename1 filename2'.",1);
     sm(" ",1);
     sm("Wildcard downloading is available. You will be able to enter a filename",1);
     sm("like 'file?' and it will get all files that start with 'file' and have any",1);
     sm("character at the end.  Also you will be able to enter 'f*' to download",1);
     sm("all files that start with 'f' etc....",1);
     match = TRUE;
     }

   if(!strcmp("E",strupr(buff)))
     {
     sm("[37m-*- (E)nter message/mail -*-[0m",1);
     sm(" ",1);
     sm("When you press 'e' you well be ask who the message is going to be to.  You",1);
     sm("can enter a users name or press return for the message to be to ALL.  You",1);
     sm("will then be asked the subject of the message. To abort the message press",1);
     sm("return alone on the subject line. Next you will be asked if you want the",1);
     sm("message to be private.  If you just return or enter 'n' the message will be",1);
     sm("public, if you enter 'y' the message will be private. Now you will be in",1);
     sm("the editor. To end the message press return on a line by itself.  You will",1);
     sm("then be at the message prompt which asks you if you what to:",1);
     sm(" ",1);
     sm("   A)bort, C)ont, D)elete, E)dit, F)ree, L)ist, S)ave Option ?",1);
     sm(" ",1);
     sm("Abort- Aborts the message and puts you back to the main menu prompt.",1);
     sm("Continue- Continue puts you back into the editor at the end of the last",1);
     sm("line.",1);
     sm("Delete - asks for a line # to delete.",1);
     sm("Edit   - asks you which line you wish to edit.",1);
     sm("Free   - Lists the bytes remaining for the current message.",1);
     sm("List   - Lists the message.",1);
     sm("Save   - Saves the current message.",1);
     match = TRUE;
     }

   if(!strcmp("F",strupr(buff)))
     {
     sm("[37m-*- (F)ile list -*-[0m",1);
     sm(" ",1);
     sm("This will list the files in the current conference.  When you press 'f' you",1);
     sm("will be shown a list of all the directories. If you press 'a' you will be",1);
     sm("shown all the files in the conference, 'u' will show only the upload directory",1);
     sm("(highest number directory).  You can also enter a number from '1' to the",1);
     sm("highest nr directory.  If you have 10 dirs you can enter a number up to 10.",1);
     sm(" ",1);
     sm("From the main menu you can enter 'f u' to list the upload directory, or 'f",1);
     sm("3' to list directory number 3.",1);
     sm(" ",1);
     sm(sysop,1);
     sm(" ",1);
     sm("The file that gets printed out when 'f' is entered is 'filehelp.txt' which is",1);
     sm("in the current 'bbs:Conf'.  DirX is the ascii directory listing file",1);
     match = TRUE;
     }

   if(!strcmp("G",strupr(buff)))
     {
     sm("[37m-*- (G)oodbye -*-[0m",1);
     sm(" ",1);
     sm("Goodbye logs the current user out.  If you user has any partial uploads",1);
     sm("they will be first told so and asked if they still want to logout.  If they",1);
     sm("enter 'y' the BBS will log them out, if they press 'n' they will be will be",1);
     sm("asked if they want to view a list of there partial uploads.  If they enter",1);
     sm("'n' they will be put back to the main menu, if they enter 'y' they will be",1);
     sm("shown a list of files that they started to upload.  At each one of the",1);
     sm("files they will be asked if they want to resume the upload.  If you",1);
     sm("entering 'y' the BBS will start receiving the reset of the file.  If you",1);
     sm("entering 'n' the BBS will ask you if you want to delete the aborted file.",1);
     sm(" ",1);
     sm("See resume upload, 'ur', for more infomation.",1);
     match = TRUE;
     }

   if(!strcmp("H",strupr(buff)))
     {
     sm("[37m-*- (H)elp with BBS -*-[0m",1);
     sm(" ",1);
     sm("This program (if exists) will either display a (huge) text file,",1);
     sm("or it may be where you are now [if the sysop set up this door",1);
     sm("in place of the standard display file.",1);
     sm(" ",1);
     sm(sysop,1);
     sm(" ",1);
     sm("Normally displays the file BBS:bbshelp.txt or bbshelp.txt.gr,",1);
     sm("or runs this door - if you specified 'H' in the CustomCommands file",1);
     match = TRUE;
     }

   if(!strcmp("J",strupr(buff)))
     {
     sm("[37m-*- (J)oin/Jump to conference area -*-[0m",1);
     sm(" ",1);
     sm("When you press 'J' to jump to a conference you will be shown a list of the",1);
     sm("different conferences. You can then enter the number corresponing to the area",1);
     sm("that you want to join.  If you do not have access to the conference you select",1);
     sm("you will be told so by the BBS.  If you press return by itself on the conf",1);
     sm("menu you will be put back to the main menu.  Each conference is totally",1);
     sm("separate from the other conferences.  Each conf. has its own message base and",1);
     sm("file area, and you must have access to be able to join the conference.",1);
     sm(" ",1);
     sm("From the main menu you can enter 'j #' where # is the number of a",1);
     sm("conference that you want to join.  ie.  'j 2' will join conference 2.  When",1);
     sm("you press 'g' for goodbye, whatever conference you are currently in will be",1);
     sm("the conference you will be in the next time you call.",1);
     sm(" ",1);
     sm(sysop,1);
     sm(" ",1);
     sm("The file that is printed when 'j' is entered is 'joinconfXX.txt' for",1);
     sm("non-ANSI graphics and 'joinconf.txt.gr' for ANSI graphics (XX is an optional",1);
     sm("security code), both are located in 'BBS:NodeX'.  In this text file you",1);
     sm("do not have to list a conf. This way you can have conferences that are",1);
     sm("totally private that only select people know about.  For example you could",1);
     sm("have a conference for friends that is not listed.  Regular users would not",1);
     sm("know about this conference.",1);
     match = TRUE;
     }

   if(!strcmp("M",strupr(buff)))
     {
     sm("[37m-*- (M) ANSI graphics on/off -*-[0m",1);
     sm(" ",1);
     sm("This will toggle the ANSI color on and off. ANSI will give you",1);
     sm("color menus if the sysop has configured them, it may also slow you down",1);
     sm("a little due to the additional color codes being sent.",1);
     match = TRUE;
     }

   if(!strcmp("N",strupr(buff)))
     {
     sm("[37m-*- (N)ew files or list files since a date -*-[0m",1);
     sm(" ",1);
     sm("This New files command will list all new files since a certain date.  When",1);
     sm("you enter 'n' at the main menu you will be asked to enter a date.  You can",1);
     sm("just press return here for a listing since the default date, which is the",1);
     sm("last time you called.  You will then be asked which directories you want to",1);
     sm("list.  Alternately, you can enter a number from 1 to the highest number",1);
     sm("directory, or an 'a' for all, or even a 'u' for the upload directory.",1);
     sm(" ",1);
     sm("From the main menu you can enter 'n date dir'.  For example you if you",1);
     sm("entered 'n 01-01-89 u' you would be shown all the files in the upload",1);
     sm("directory since 01-01-89 (January 1, 1989).  There is one other format for",1);
     sm("this command, 'n s dir', which will list files since the last time you",1);
     sm("called in the directory you specify.  For example 'n s u' will list all the",1);
     sm("files in upload directory since the last time you called.",1);
     sm(" ",1);
     sm(example,1);
     sm(" ",1);
     sm("N           <- prompt for SINCE: MM-DD-YY",1);
     sm("N S A       <- List all new files, in all directories since last call",1);
     sm("N S U       <- List all new uploads in the last directory since last call",1);
     match = TRUE;
     }

   if(!strcmp("OPEN",strupr(buff)))
     {
     sm("[37m-*- (OPEN) door menu -*-[0m",1);
     sm(" ",1);
     sm("If the BBS has doors, and a menu exists this command 'OPEN' will",1);
     sm("let you view the menu of commands to type to run doors.",1);
     sm(" ",1);
     sm(sysop,1);
     sm(" ",1);
     sm("You must have BBS:Commands with the open door to view the",1);
     sm("bbs:commands/CustomCommands.txt file",1);
     match = TRUE;
     }

   if(!strcmp("O",strupr(buff)))
     {
     sm("[37m-*- (O)perator page -*-[0m",1);
     sm(" ",1);
     sm("Beeps every second for 30 seconds and flashes the sysops screen",1);
     sm("to alert him that you want to chat (if he's available). Once you've",1);
     sm("started the request you can abort at any time by pressing CTRL-C",1);
     sm(" ",1);
     sm(sysop,1);
     sm(" ",1);
     sm("This option CAN be turned off in the config file.",1);
     sm("If the node is on a single bit plane screen the username may have an *",1);
     sm("appended to it to signify that he's requested a chat. On a multiple",1);
     sm("bit plane screen it'll change the username color to red.",1);
     match = TRUE;
     }

   if(!strcmp("R",strupr(buff)))
     {
     sm("[37m-*- (R)ead mail (+ or -) -*-[0m",1);
     sm(" ",1);
     sm("When you press 'r' at the main menu you will be show the next unread",1);
     sm("message.  You then have the choice of doing the following:",1);
     sm(" ",1);
     sm("A>gain      - Read the current message again",1);
     sm("D>elete     - Delete the current message (if TO or FROM you)",1);
     sm("R>eply      - Reply to the current message",1);
     sm("Q>uit       - Stop reading messages",1);
     sm("<CR>=Next   - Read next available message",1);
     sm(" ",1);
     sm("NOTE: If you have read all of the messages in the area it will show you",1);
     sm("(QUIT) as being the next message, you can reread ANY message by typing",1);
     sm("its number (or even restart at beginning, ie... type 'R 1' )",1);
     match = TRUE;
     }

   if(!strcmp("S",strupr(buff)))
     {
     sm("[37m-*- (S) print your stats -*-[0m",1);
     sm(" ",1);
     sm("This will print the following stats about you:",1);
     sm(" ",1);
     sm("                  (123456789)",1);
     sm("     Conf Access : XX_______    | X signifies access to that conference.",1);
     sm("     CallerNumber: 1234         | Number of times BBS called by users.",1);
     sm("     Last Date On: 06-11-88     | When the last day you called",1);
     sm("     Security Lev: 10           | Your access level on the BBS",1);
     sm("     # Iimes On  : 22           | Number of times BBS called by you.",1);
     sm("     Ratio Dl/Ul : 3/1          | 3 Downloads for each Upload",1);
     sm("     # Downloads : 12           | Downloaded 33 files",1);
     sm("     # Uploaded  : 5            | Uploaded 5 files",1);
     sm("     Bytes DL'd  : 234345       | DL'd 23K worth of files",1);
     sm("     Bytes UL'D  : 564345       | UL'd 56K worth of files",1);
     sm("     Bytes Avail : 3000000      | The maximum bytes You can DL each day.",1);
     match = TRUE;
     }

   if(!strcmp("T",strupr(buff)))
     {
     sm("[37m-*- (T)ime display -*-[0m",1);
     sm(" ",1);
     sm("NOTE: The time displayed is the time that the amiga clock is set to, if",1);
     sm("it's not set by sysop the date this will most likely be wrong. To see",1);
     sm("how much time is left on your current call - LOOK at the menu prompt.",1);
     match = TRUE;
     }

   if(!strcmp("UR",strupr(buff)))
     {
     sm("[37m-*- (UR) upload resume a file(tm) -*-[0m",1);
     sm(" ",1);
     sm("This will let you resume uploading an aborted upload.  If you do not have",1);
     sm("any aborted uploads the BBS will tell you and go back to the main menu.  If",1);
     sm("you do, the BBS will list the ones you have one at a time and ask if you",1);
     sm("want to resume uploading it.  Just enter 'y' to the one you want to resume",1);
     sm("uploading and on your end start transferring the file again.  Your terminal",1);
     sm("program do no have to support anything special for resume uploading, it is",1);
     sm("the BBS that does it.  When you resume and upload the BBS will tell your",1);
     sm("terminal program that it already has part of the file and start sending a",1);
     sm("that point.  This is the power of Zmodem!",1);
     match = TRUE;
     }

   if(!strcmp("U",strupr(buff)))
     {
     sm("[37m-*- (U)pload a file -*-[0m",1);
     sm(" ",1);
     sm("Once 'u' is entered the BBS sends a Zmodem header and waits for you to",1);
     sm("start the transfer.  You can batch upload as many files you like.  If you",1);
     sm("try to upload a file that already exists, the BBS will skip that file and",1);
     sm("go to the next file or if it is the last file it will quit the upload.",1);
     sm("Once the transfer is complete the BBS will check to make sure the filename",1);
     sm("is not longer than 12 characters, if it is, you will be asked to enter a",1);
     sm("new filename.  Next you will be asked to enter a description for the file.",1);
     sm("This description can be up to nine (9) lines long.  When the description",1);
     sm("is done entering a return on a line by itself will end.  If is was a batch",1);
     sm("upload you will be ask to enter the description for the rest of the files..",1);
     sm(" ",1);
     sm("You are also able to enter the filename and description BEFORE the transfer",1);
     sm("so that you can do a 'goodbye after transfer'. This is so you can upload a",1);
     sm("lot of files and not have to be around after the transfer to enter the",1);
     sm("descriptions.",1);
     match = TRUE;
     }

   if(!strcmp("V",strupr(buff)))
     {
     sm("[37m-*- (V)iew a text file -*-[0m",1);
     sm(" ",1);
     sm("This will let you view (read) a text file that is the file listings. When",1);
     sm("you press 'v' you will be asked the filename you want to view.  Enter the",1);
     sm("filename and the BBS will display the file.  From the main menu you can",1);
     sm("also enter 'v filename' where filename is the file you want to view.",1);
     match = TRUE;
     }

   if(!strcmp("W",strupr(buff)))
     {
     sm("[37m-*- (W)rite your stats -*-[0m",1);
     sm(" ",1);
     sm("This allows the user to change their name, location, phone number,",1);
     sm("password, and the number of lines to display on your terminal.",1);
     sm(" ",1);
     sm(sysop,1);
     sm(" ",1);
     sm("You can set the min access level for the user to have this ability",1);
     sm("in the config program.",1);
     match = TRUE;
     }

   if(!strcmp("X",strupr(buff)))
     {
     sm("[37m-*- (X)pert mode toggle (menus on/off) -*-[0m",1);
     sm(" ",1);
     sm("If you have expert on you will not see the menu at the prompt unless you",1);
     sm("enter '?'.  If you have expert off you will be shown the menu every time",1);
     sm("the menu prompt is displayed.",1);
     match = TRUE;
     }

   if(!strcmp("ZOOM",strupr(buff)))
     {
     sm("[37m-*- (ZOOM) all messages/mail -*-[0m",1);
     sm(" ",1);
     sm("This option will gather all unread messages into a text file, then flag",1);
     sm("this file for a free (D)ownload. Note - this option may not be available",1);
     sm("on some boards.",1);
     sm(" ",1);
     sm(sysop,1);
     sm(" ",1);
     sm("You must have a directory called BBS:ZOOM. Also, make sure to add this",1);
     sm("dir to your 'paths' file for each conference you allow downloading from.",1);
     match = TRUE;
     }

   if(!strcmp("Z",strupr(buff)))
     {
     sm("[37m-*- (Z)ippy file search -*-[0m",1);
     sm(" ",1);
     sm("Zippy file search searches for a specific text string. When you enter 'z'",1);
     sm("you will be asked for the string you want to search for, and then what",1);
     sm("directories you want to search in.",1);
     sm(" ",1);
     sm("You can enter 'z search_string directory' at the main menu prompt.  The",1);
     sm("following line will display all files that have 'game' in the filename or",1);
     sm("the disruption and will search all directories:  z game a",1);
     sm(" ",1);
     sm("IMPORTANT: * is NOT a wildcard!!! type the pattern BY ITSELF without a * !",1);
     match = TRUE;
     }

   if(*buff!=0)
     {
     if(match==FALSE)
       {
       sm("Sorry - no help is available for that command...",1);
       }
     sm(" ",1);
     prompt("[32mPress <RETURN> to continue with more help...[0m",buff,1);
     goto LOOP;
     }

   ShutDown();
   end();
  }

void end(void)
{
   exit(0);
}

void LastCommand (void)
{
  sm("",1);
}
