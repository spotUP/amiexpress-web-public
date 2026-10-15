This is a list of commands accessible from the main menu prompt:

AmiExpress has many functions that are part of the program code that assist users in what they want out of the system. These commands are mostly single letter commands that the user types and hits return for the execution. AmiExpress does not work with a HOT-KEY type of user input. This means that the user will be saved from having to look at a screen load of data when they accidentally hit a wrong key. A carriage return always indicates an intended execution.

This section is divided into two parts, The SYSOP ONLY COMMANDS, and the Standard User Commands.

### SysOp Only Commands:

These commands are the only commands that are called up by single digit number codes.  They are available only to users with SYSOP SECURITY LEVELS as defined in the Config file by AmiConfig under ACCOUNT EDITING.

#### [ 1 ] - Account Editing:

This is used to either review existing accounts and modify them, or scan for any new user LOGONS that wish to be validated.  The account editing module is very easy to use in that it is basically menu driven. You can also get into the BBSInfo CONF. from here. Before Express will start the normal Account Editing it will try to open a MODULE called "ACCOUNTS" which should be located in the SYSCMD Directory. This is for further coming releases of different Account Editors.

The Account Editing screen will look like this:

```
ACTIVE [1]   BAUD: 14400
A> Name: ByteMaster                     B> Real Name: Location
C> Loc.: Private                        D> Pass ....: ENCRYPTED
E> Phone Number ..: 318-793-4101   F> Area Name......: Standard
G> Ratio .........: 0              H> Sec_Level .....: 255
I> Ratio Type ....: 0     <-Byte)  J> AutoReJoin ....: 1  #Calls: 1
K> Uploads .......: 0              L> Messages_Posted: 0  %Today: 1
M> Downloads .....: 0              N> New_User ......: No
O> Bytes Uled ....: 1                 Last Called ...: Tue May 26 22:00:17 1994
P> Bytes Dled ....: 0                 Computer Type .: Amiga 1000
Q> Byte Limit ....: 0                 Screen Type ...: Amiga Ansi
R> Time_Total: [0       ] mins     S> Cps Up: 0         T> Cps DN: 0
U> Time_Limit: [0       ] mins     V> Time_Used: [0       ] mins  T> UUCP: 0
Y> Chat_Limit: [0       ] mins     Z> Chat_Used: [0       ] mins

X=EXIT-NOSAVE ~=SAVE  1-8=Presets  9=RE-ACTIVATE  DEL=DELETE  *=USER NOTES
TAB=CONT @=CONFERENCE ACCOUNTING !=CREDIT ACCOUNT MAINTENANCE
```

Press the following keys to change the data of the User:

  A> Lets you change the name of the User you are looking at

  B> Lets you change the users real name

  C> Lets you change the location of the user

  D> Lets you change the password of the current user.

  E> Lets you change the Ratio of the user you are looking at

  F> Here you can change the Conf.Access of the User - here you can either specify an Area name as configured in the AREA.xx tooltypes or you can configure the confence access directly (new in v5.1.0) using a string of letters one for each conference where X indicates access and _ indicates none. So XXX_XX_ means the user has access to conferences 1,2,3,5 and 6 only. This can sometimes useful for overriding an individuals access without having to create a completely new area group - however if you change the configuration of the conferences you will have to manually edit the users.

  G> Lets you change the Ratio Type of the User. From here you have 3 different Ratio Types:
* Ratio Type 0 = Bytes only
* Ratio Type 1 = Bytes & Files
* Ratio Type 2 = Files only

The ratio type determines the way the Ratio will be calculated.

  H> Lets you change the Security Level of the user you are looking at

  I> Lets you change the number of Upload the user has done.

  J> Lets you change the Conference at which the User logged in the last time he called the system.

  K> Lets you change the number of downloads the user has done.

  L> Lets you change the number of Messages the user posted in the BBS.

  M> Lets you change the number of Bytes the user uploaded.

  N> Lets you change if the user is a NEW USER or not. this is a flag function. if it is in the "YES" mode the user will be found if you search for new users. After you edit the USERDATA with a present the flag will be changed automatically to "NO".

  O> Lets you change the number of Bytes the user downloaded.

  P> Lets you change the Time Total for the day.

  Q> Lets you change the number Bytes which the can download at a day.

  R> Lets you change the Time Limit for a day.

  S> Lets you change the Time the user has already used today.

  T> Lets you change if the User is a User of UUCP or not.

  U> Lets you change the chat limit time a user has.

  V> Lets you change the chat limit used for the day.

  Y> Lets you change the Top Upload CPS the User ever had.

  Z> Lets you change the Top Download CPS the User ever had.

  #> Lets you change the Number of Calls a user has done to your System.

  %> Lets you change the Number of Calls a user has made today. This is always reset when a user logs on for the first time on any day.

Now follows the normal commands in the Account Editing:

  [ X ]   - Exit the Account editing without saving the current changes

  [ TAB ] - Lets you go to the next user who matches to the USERNAME you entered before.

  [ ~ ]   - Will save the current changes of the USERDATA.

  [ 1-8 ] - Will set the USERDATA to a defined Preset

  [ 9 ]   - This command will re-activate a deleted user.

  [ DEL ] - This command will delete the user you are looking at. you can re-activate a user by typing "9" at the AccountEditing
  [ * ]   - If user notes is configured allows you to enter any notes you want to record about the user.

  [ + ]   - Will go on the next user in the USERDATA.

  [ - ]   - Will go on the previews user in the USERDATA.

  [ ! ]   - This will activate the ACCOUNT CREDIT MAINTENANCE.  This feature allows you to keep track of paying users, The assumption is that if a user pays, then they are paying for a DISABLED ratio. CREDIT MAINTENANCE will let you establish the number of days that the credit account is to be in effect. During this time period the user will be given an 'EFFECTIVE' DISABLED ratio. Their ratio does not actually change, but express will treat there account as a disabled ratio. So during the credit period an 'FS' command or 'S' command will reflect a DISABLED ratio. Once the credit account has expired, express will then use the ratio established for the user.

  [ @ ]   - Will bring you into the Conference Accounting. You MUST! have conference accounting on for this to work. Once in this area, you will be shown each conference, screen by screen, there you can edit the user's STATS for each 
conference. You go from conference to conference by using the +/- keys. Follow the screens to save and exit.

#### Bulk  Account Editing:

Allows you to manipulate fields for multiple accounts in one go.

```

 Updates to apply:

F> Area Name......: Leave Unchanged  G> Ratio .........: Leave Unchanged
H> Sec_Level .....: Leave Unchanged  I> Ratio Type.....: Leave Unchanged
J> AutoReJoin ....: Leave Unchanged
K> Uploads .......: Leave Unchanged  L> Messages Posted: Leave Unchanged
M> Downloads .....: Leave Unchanged
O> Bytes Uled ....: Leave Unchanged  P> Bytes Dled ....: Leave Unchanged
Q> Byte Limit ....: Leave Unchanged
R> Time Total ....: Leave Unchanged  U> Time Limit ....: Leave Unchanged
Y> Chat_Limit ....: Leave Unchanged
#> Times Called ..: Leave Unchanged

 Filter Settings: [0/100] Users will be updated.

1> Select Area Name:     N/A
2> Select Sec Level:     N/A
3> Include deactivated : No

~=Apply Changes @=Presets <TAB>=Exit
```

From here you can set the fields you wish to update and apply that update to any particular security level or area name. You can also jump to the bulk presets page

```
 Preset to apply:

1> Apply Preset 1...: No
2> Apply Preset 2...: No
3> Apply Preset 3...: No
4> Apply Preset 4...: No


9> Apply all Conf Ratio Presets...: No

 Filter Settings: [10/100] Users will be updated.

A> Select Area Name:    N/A
B> Select Sec Level:    N/A
C> Include deactivated : No

~=Apply Changes @=Presets <TAB>=Exit
```

This screen is similar to the previous on in terms of setting up which accounts will be modified but it allows you to re-apply any of the presets defined to a subset of users.

####   [ 2 ] - View CallersLog:

This lets the sysop view the BBS:NODE{x}/CALLERSLOG file backwards. The last line written to the CALLERSLOG will be displayed first and the first line of the CALLERSLOG will be displayed last. On system running more than one node, this command will ask which NODE's CALLERSLOG to view.

####   [ 3 ] - Edit File Directories (EDITOR/EMACS):

If you started this Command, the BBS will check if the one who started the command is a remote or a local one. If the one who started it is a local one it will search for a Door called "EDITOR" in the SYSCMD and if it exists it will be executed and the normal starting of the EMACS will be skipped.

If the one who started the command is in REMOTE_LOGON then the command will be executed as follows:
This command uses the command line version of MicroEmacs for on-line directory editing.  For more information on how to use EMACS, you should refer to the section on COMMON EMACS COMMANDS. This command asks the user which directory to edit before it opens up the appropriate AUX: or CNN: channel and executing EMACS.

NOTE: AUX{x}: is used only on remote connections and if activea watchdog task that checks for carrier loss is also invoked.

If carrier is lost while editing directories, the computer will be reset within two seconds.

A special note to MULTI NODE systems: The watchdog resets the computer if a carrier is lost regardless of what the other nodes are doing.  If users are logged in on other nodes, they will be disconnected when the computer resets.  A later version of AmiExpress will send a notification to the other nodes and a time-out requestor locally will inform the sysop and users that express wants to reset the computer and that everyone should finish up what they're doing.

Exiting from EMACS with CTRL-X CTRL-C key combination will return the user to the MAIN MENU PROMPT.  While a user is in EMACS, the BBS will notify the sysop by placing a line like:

    User in EMACS........

WARNING! for those of you using the A2232 multi serial card you may run into problems using the editor. We are currently working on a FullScreen editor to take it's place.

####     [ 4 ] - Edit any Text File on System (EDITOR/EMACS):

This command is basically the same as the previous with the option to specify full path and file name to edit. This commands prompts the user for the necessary information.

####     [ 5 ] - List System Directories:

This command works just like the AmigaDos List command and displays the directory and sub-directories available for the specified path.

The command can also display any comments (FILENOTES), attached to the files themselves.  When selected, AmiExpress will ask for the full path name and whether to include comments or not.

####    [ 0 ] - Remote Shell:
This Command starts a new shell and pipes the input and output directly from /X

It requres fifo-handler and fifo.library to be installed and correctly handles programs that require an interactive respose. Unlike many shell doors it doesn't just execute each line and redirect the output it actually pipes the /X input and output to an actual shell process.

####  [ DS ] - Sysop Download:

This Command is exactly the same as the normal User Download command , but has the added ability with which the sysop can download files from any path on the HardDisk. The WILDCARD searching is removed in this command to prevent error in searching for files.

All files on the HardDisk can be downloaded with this command unless the files are RESTRICTED for downloading with the File Comment "RESTRICTED", this will prevent downloading of files you want never to be downloaded by your co-sysop, or anyone else with DS enabled.

####  [ FM ] - File Maintenance:

Allows you to enter a filename and remove it from the file listing or to move it to another conference.

####  [ US ] - Sysop Upload:

Asks for a location where the uploads are to be sent and then waits for the user to upload files. Once the files are uploaded they will then be moved from the playpen into the specified directory.

####  [ VS ] - Sysop Text View:

This Command is exactly the same as the normal User Text View command, and has the added ability, that the sysop can View any file from any path on the HardDisk. All files can be viewed with this command, unless the RESTRICTED file comment "RESTRICTED" is used. This will prevent users from viewing private files of yours.


### Regular User Commands:

These commands are explained in detail. All the commands here can be chosen in the ACCESS ICONS for EXPRESS.

####   [ ? ] - Display menu:

Useful if the user is in expert mode. Will cause the current conference menu to be displayed.

####   [ ^ ] - Extended Help Command:

This command allows a user to read the help files that you have put in the BBS:help directory. The help commands may include MCI commands, like displaying UserNames to personalize the help commands or some other data over MCI.

####   [ < ] [ > ] - Joining Conference Up & Down:

These two commands allows the user to join conferences by only using the '<' '>' keys. This will let the user go up one conference and down one conference.

Example: User is in CONF. 3 and use the '>' key. so he will automatically join the one higher conference he has access to, and if he will use the '<' key again he will join CONF. 3 again.

####   [ << ] [ >> ] - Joining message base within a conference Up & Down

Similar to '>' and '<' but changes to a different message base area within the conference.

####   [ A ] - Alter File Flags:

This command allows the user to change the flagged file listwithout having to do a file listings and get a PAUSE...MORE prompt to change the flags. Chaining data is allowed, or the routine will prompt the user for the information.

First it will show the current list of flags.
>        No file flags
>        Filename(s) to flag: (C)lear, (Enter)=none?

At this prompt the user can:
1. Enter new files to add to the flag list
2. Enter 'C' to goto the clear flag prompt

>        Filename(s) to Clear: (*)All, (Enter)=none?

At this prompt the user can:
1. Enter filenames to remove from the flag list, WILDCARDS are valid, however they will only remove the first entry.
2. Use '*' to remove all entries in the list.
3. Hit Return to exit.

Once a user exits the Clear prompt, it will once again show the list of flagged files and drop back to the MAIN MENU PROMPT.

####   [ B ] - Bulletins:

This command allows the user to view bulletins that the sysop has made available.

* First, the BBS checks to see if the file BBS:<CONF>/BULLETINS/BULLHELP.TXT is available; if not, it tells the user that no bulletins are available in that conference.
* If the BBS:<CONF>/BULLETINS/BULLHELP.TXT is found, it is displayed and the user is prompted to enter the bulletin # to view or '?' to Redisplay the BULLHELP.TXT which is the bulletins menu.
* If a user selects a valid bulletin #, it is displayed and the BBS returns back to the bulletin prompt.
* If a user selects an invalid bulletin #, the BBS informs the user that there is no bulletin #{x} where {x} = the specified bulletin.

####   [ C ] - Comment to Sysop:

This command is exactly the same as the regular ENTER MESSAGE command except that the message is addressed privately to the System-Operator. The TO: field is automatically filled with the User name on SLOT 1, which is the Sysop.

If the BBS located the tooltype "FORWARDMAIL= <str>" in the Conference ICON is turned on, the Mail will be forwarded to the User named in the <str>. This is very useful if you go to holiday and want your co-sysop to read the messages to you without typing "R" for read messages.

####   [ D ] - Download File(s):

This command accesses the file transfer procedure for sending files from the system to the remote user. The flow-chart for this command is quite complex and is outlined below:

1. If the ToolType NDIRS contains zero, the BBS informs the user that there are no files to download from that conference.
2. The BBS displays the File BBS:CONF/DOWNLOADMSG.TXT
3. The BBS displays the users Download/Upload STATS.
4. The BBS calculates the ratio limits the user has before uploading files to the system.
5. Next, it displays the transfer protocol the user take for default. The User can change this protocols by using the "W" command.
6. If the user had specified 'DS' instead of just 'D' the download is considered a sysop download and if the user is allowed to use SYSOPDOWNLOAD, then the download can be made from any valid AmigaDos path on the system.  If this is the case, the BBS asks for the full path and filename. NO WILDCARDS ARE ALLOWED with a Sysop Download.
7. The BBS asks the user to enter the filename(s).
8. Checks for special characters in the filename like ":/" etc. If found, tells the users that special symbols may not be included when downloading.
9. Full WILDCARDS are allowed when doing a regular download, but just the * WILDCARD character alone is not allowed.
10. Now, the BBS scans the specified paths from the CONF ICON and when it finds the file that the user requested, it displays the file length in Kbytes, time required to download it at current baud rate, and checks if the user has enough credits to download the file.  If so, AmiExpress checks the filename against what is in existing File Flag list and if it isn't already there, it adds it. So, if the download sequence is aborted for any reason, just hitting "D" again will download the flagged file.  To remove from flaglist, the user would use the 'A' command.
11. Now the BBS checks if there is an Comment at the File like "RESTRICTED" or "FREE DOWNLOAD" ... if there is a Comment like this then the BBS will display some messages when the File has a comment like "RESTRICTED" it is not not allowed to download this file and the BBS will write a comment into the BBS:NODE{x}/CALLERSLOG that a user tried to download this File... and with this comment you can`t download this file with a level of 255 and sysop download also.. so the file is 100% safe for downloading... if there is the comment "FREE DOWNLOAD" the BBS will make this file free download and it will costs no credits to download it...
12. After hitting return alone on a filespec prompt, the BBS re-checks the totals to see if the batch is within the user's limits.
13. If so, AmiExpress asks either to start, abort, or automatically logoff at the end of the transfer.  The 'G'oodbye after transfer gives the user 10 seconds to change his mind after the transfer before performing an automatic disconnect sequence.
14. At this point the download sequence is about to begin and so the necessary information is written to the BBS:NODE{x}/UDLOG, if turned on.
15. At the end of the download, if the users' security level is below the one you choose for the tooltype KEEP_UPLOAD_CREDIT=<numb>, then the user's number of downloads and number of bytes downloaded get updated with the new download STATS.
16. At this point, the download sequence is completed, and the BBS tells the user his new STATS before returning back to the MAIN MENU PROMPT.

####   [ E ] - Enter a Message:

This command allows the user to leave private or public mail to other users on the system.  There are several options with this command and they are outlined below.
1. Asks for who to send it to.  If a WILDCARD is used the search will find the first user that fits the WILDCARD and will display it and then ask if its correct, if the user says no then it will search forward.  If it doesn't find the user it will exit back to the MainMenu prompt.
2. If the user just hits return on the TO: prompt it will send the message to ALL.
3. A feature added in is to be able to leave a message to "EALL" this means to EMAIL ALL people, this is only usable by users you give access to writing EALL Messages by changing the tooltype in the ACCESS ICON for the User. What this does is to leave ONE message to ALL USERS , when a person calls the system it searches for mail in that conference to that user it will say they have mail, from the user that left the "EALL" message.  The TO: will show the user who is receiving the message with "(ALL)" after their name.  The message can only be deleted by the sender or a user with SYSOP access
4. Another name that is valid in the TO: prompt is SYSOP, this will be replaced by the Name of the SYSOP, in user slot 1
5. Next prompt is the Subject of the message, if the user justhits return it will exit out of the enter message
6. The BBS will now ask if the message is to be readable only by the receiver of the message or it will be public.
7. If you have the optional Full-Screen editor installed, the BBS will now ask you whether you want to use the Full-Screen editor. The user has the option what editor he/she wants with the 'W' command if the sysop has chosen to have it so.
8. Now the user has entered the message editor. The following commands assume you have entered the internal Line-Editor.
9. Tabs now work in the editor, they are indicated by a '|' in the header.
10. CTRL-X in the message editor will delete the current line.
11. If you hit a return on a blank line you will exit the edit to the edit command prompt.
12. The options are:
* \<A\>bort   - Abort entering the message
* \<C\>ont    - Continue entering the message, this option will print the last line with text and put the cursor at the end of the line.
* \<D\>elete  - Allows a user to delete a specific line.
* \<E\>dit    - Allows the user to change text within a line.
* \<F\>ile    - Allows a user with tooltype ACS.ATTACH_FILES to attach a file to download to the message. This option will ask for the filename to attach to the message and if you wanted the file deleted with the message as its deleted.
* \<L\>ist    - List the message to the screen.
* \<S\>ave    - Saves the message.
* \<X\>fer    - Allows a User to upload a file into the MSGBASE and make this file automatically ATTACHED at a Message. To allow the user to do this he must have the tooltype "ACS.PRI_MSGFILES" in his ACCESS ICON. If the Message the User writes is an ALL or EALL message the user must have "ACS.PUB_MSGFILES" turned on to do this.

####   [ F ] - File Listings:

This command allows a user to get Full directory listings of the catalogs maintained by the BBS. As mentioned before, this is specified in the Tooltype NDIRS=<numb> in the CONF ICON.

1. If the number of directories in the conference is zero or NDIRS is zero, then the BBS will display "No files available in this conference." And drop the user back to the main prompt.
2. Displays the file BBS:CONF/FILEHELP.TXT only if all the options were not specified on the command line.
3. It will then ask for the directory to list including the 'H'old directory. The hold directory can only be used by a user with access greater than 200.
4. The specified directory will be displayed and will pause if the NS hasn't already been specified, at the users lines per screen point.
5. On the pause prompt, you can select 'F' for flagging files.

####   [ FR ] - Reverse File Listings:

This is the same as F but it shows the file listing starting at the end working backwards. If you choose All directories it will show the highest directory first and work backwards to the first.


####   [ FS ] - Full Status View:

This option is used to allow the user to have a full view over his access status in each conference. It will display Bytes Down/Uploaded in each conference the user has access to and will display the RATIO too.

####   [ G ] - Goodbye (LOGOFF):

This option is used to end the current session with the host system by the remote user.  When the user hits 'G', the BBS performs several clean-up functions.

1. First checks to see if there was a ZoomMail that hasn't been downloaded, if there was it would ask if the user wanted to leave anyway.
2. The system then checks to see if there were any partial uploads that the user hasn't finished sending yet.  If so then it would let the user know and ask if he wanted to leave anyway.  If the user didn't want to leave, then the BBS would ask if the user wanted to view the files. If the user did want to view them, then the BBS would go into the resume routine showing the user the filename and filesize, then ask if he wanted to resume on that particular file.  If not then the BBS would ask if the user wanted to delete the file.  If the user didn't want to delete the file then the BBS would go to the next file that was to be resumed.
3. If the user hadn't specified the 'Q' at the ANSI color prompt, or the DISABLE_QUICK_LOGONS is given the BBS would display the file: BBS:NODE{x}/LOGOFF.TXT.
4. Now the BBS will try to open a Module called "LOGOFF" or "LOGOFF<node>". If the BBS will find such a module, it will be started.

####   [ H ] - Help:

This command displays the on-line help text file for the user to refer to. At this command, the BBS looks for and displays the file :

      BBS:BBSHELP.TXT

If not found will say that No help is currently available.

####   [ J ] - Join Conference:

This command is used to switch from the current conference to another conference that the user has access privilege to. The BBS looks for the file BBS:NODE{x}/JOINCONF{SEC}.TXT and tries to display it.  If not found, it will print a message informing the user that the file is missing. Then, prompts the user to enter the number of the conference they wish to join.  If the user does not have access to the requested conference, then the BBS will tell the user that they don't have access to that conference.

If the user has access to the requested conference, AmiExpress switches to that conference and checks for mail for the user, and then display any appropriate bulletin files if they exist.

If the Option "RELATIVE_CONFERENCES" is turned on in the CONF.DEF ICON the BBS will only display the Conferences which the User has access to.

####   [ JM ] - Join a message base area within this conference

Displays the JoinMsgBase{sec}.txt file and allows the user to select a new message base to join.

####   [ M ] - Mode Select:

This command switches between ANSI color output or Plain Monochrome output on the users end.  When ANSI is on, the BBS tries to display files that have the extension by default. The normal plain (.TXT) files are reverted to if extension  files are not found.

####   [ MS ] - Run mailscan

This command does a mailscan in each conference that you have access to. This scans every conference for new mail regardless of the mail scan settings that you have configured.

####   [ N ] - New Files Since Date:

This command allows the user to list files from a specified date onwards  or from the last time they called the system. In other words, with this command, users can see what the system has to offer in terms of files since their last call.
1. If the number of directories in the conference is zero then the BBS will display "No files available in this conference." And drop the user back to the main prompt.
2. It will then ask for the date they want to list from. The last date they were on will be the default, this is selected by just hitting return alone.  Entering the date to list from must be done as MM-DD-YY.
3. Next, the BBS asks for the directory to search thru.  An 'A' can be used to list all directories, also 'U' can be specified for the upload directory.  And H for the hold directory. The hold directory can only be used by a user with access greater than 200.
4. The Pause prompt works the same as described in the file listing section.

####   [ OLM ] - Send online message:

Allows the user to send an online message to a user on another node (assuming they have not set them selves as not available for OLM messages). The user will be prompted to enter the message and it will be displayed to the user as soon as they are idle (eg. it is queued while they are viewing files or downloading for example).

####   [ O ] - Operator Page:

This command is used by the remote user to call the system operator for on-line chat.

1. First of all Express will check the SysopPageCounter to see if the user already paged the sysop. If the user paged the sysop more then the given maximum number, express will automatically go to comment writing instead of paging the sysop.
2. If the User is calling up the system operator for the first time on the current session, the users name field will be changed to a red color when 3 bitplanes are active, and will have star preceding his name if the BBS was booted in 1 bitplane. Also, if the ICONFIED window is active, the name filed there will also be highlighted a different color. In this way, a sysop can see if the user on-line has requested to chat.
3. If the F7 Chat toggle flag is not set to allow paging then the BBS says:
          "Sorry, The SYSOP, is not around right now You can use 'C' to leave a comment."
4. If the chat toggle flag is set to allow paging, then the BBS adds to BBS:NODE{x}/CALLERSLOG that the user paged. The PAGER system door is executed (new in v5.1.0) or the internal page takes over if there is no pager door. The internal pager displays "Paging SYSOP (CTRL-C to Abort). ." followed by bells and more dots.
5. If you, the SYSOP, wanted to chat with the user you would Hit F1 to enter chat, then AmiExpress looks for the file BBS:NODE{x}/STARTCHAT.TXT, and if found displays it to the user. This can be a simple greeting to the user. If this file is not found, then the standard sysop chat active message is sent to the screen. The same F1 will exit chat when you are finished and the BBS will display the File BBS:NODE{x}/ENDCHAT.TXT. During chat, if ANSI mode is selected, your text will be a different color than the user ones.

####   [ Q ] - Quiet Node:

This command will change the Quiet Node option you choose for a node. With this command a user can prevent other users from  seeing them on

####   [ R ] - Read Mail:

This command is used to access the on-line mailing system to read mail either to the user or for all users.  It is also used when a certain message will be replied to.

1. First the BBS shows the read prompt

      MSG. Options: A,D,F,R,Q,?,<CR> ( QUIT )>:

* \<A\>gain, displays the message currently on again. (specified by the 'a' in the above line)
* \<D\>elete, allows the user to delete a message only if he left the message or the message is to him. Also a user with access of 210+ can delete any mail.
* \<F\>ile, will test if there is any Attached File todownload.
* \<R\>eply, allows the user to reply to the current message. The BBS will place the user on the SUBJECT: field with the previous subject and place the cursor on the end of the line. If the user wants to change the subject he can delete over the existing subject and enter a new one, or hitting return will keep the old subject. After this, the BBS will ask if the reply should be private, and by default this is set to No. Next, the BBS will ask whether to quote the current message in the reply, again the default is No. If the user selected Yes to quote the message, the entire message will be re-displayed and the BBS will prompt the user with the following:

                   Enter Startline,Endline or (*=ALL, A=Abort):

Where the user would have to type either a '*' to quote the whole message specify start and end lines separated by a comma. Then the user would be put in the on-line message editor to enter his message. Commands for the editor work in much the same way as the Enter Message command. For more information, please re-read the ENTER MESSAGE Command.

* \<?\>, this will display the full description of the packed Mail Reading line and will help you.

* \<??\>, this will display an even more complete description of the available options

* \<CR=Next\>, let you continue search for new messages.

* "EH" - This allows the sysop to edit a message Header. You can change who the MSG is to, from, the subject and whether it is to be a private message or not.

* "EM" - This allows the sysop to edit the message body.

* "U"  - This will let the sysop go automatically to account editing for the account the message is from. With this way you can fast validate a NEWUSER by reading the message and go to account editing.

* "K"  - Exits and leaves the current message as unead

* "Q"  - Quits. The current message will be marked as read.

* "-"  - Start scanning backwards through the messages

* "+"  - Start scanning forwards through the messages

* "NS"  - Start scanning through the messages in non-stop mode (eg don't wait for user input after each message)

* "TS"  - Select a language and translate this message

* "T!"  - Translate this message into each language in turn and display the results

* "T*"  - Translate this message from each language in turn and display the results

####   [ RL ] - RELOGON:

This command will make a RELOGON at the Node you start it. This will drop the user back to the Normal LOGON and will start a Module called "RELOGON" or "RELOGON<node>" in SYSCMD Directory. If this Module is available it will be started and if it is finished the user will be dropped back to the LogonString.


####   [ RZ ] - Zmodem Upload Command:

This command executes an immediate Zmodem upload.

####   [ S ] - Status of On-Line User:

This command simply reports the users' current information pertaining to his account. This is in the form of:

```
       Caller Num.: 2049
       Lst Date On: 05-14-93
       Security Lv: 30
       # Times On : 579
       Ratio DL/UL: Disabled
       Online Baud: 16800
       Rate CPS UP: 0
       Rate CPS DN: 0
       Screen  Clr: NO
       Protocol   : /X Zmodem
       Sysop Pages Remaining: 3

                     Uploads            Downloads
            Conf  Files    Bytes     Files    Bytes     Bytes Avail  Ratio
            ----  -------  --------- -------  --------- -----------  -----
               2>       0          0       0          0           0  DSBLD
```

####   [ T ] - Time, at the system site:

This command reports back to the user what the internal battery backed up clock at the BBS site is set at.  Local time/date stamp function.

####   [ U ] - Upload File(s):

This command puts the BBS in the file receive mode, where the remote user can send files to the system.

1. The BBS first checks to see if there are file directories to be
       uploaded to, by looking at NDIRS=<numb> tooltype. If this type is
       unavailable or reports zero, the user is returned back to the
       MAIN MENU PROMPT after a message stating "No files available in this
       conference."

2. If a file called BBS:CONF/NOUPLOADS.TXT exists this is displayed to the user and the user is returned to the main menu.

3. If a file called BBS:CONF/UPLOADMSG.TXT exists
       the BBS displays that to the user.

4. The BBS now calculates free disk space, the first number
       displayed, is the amount of free space on all the drives
       listed in DRIVES.DEF.INFO in BBS: directory.

       Only drives that contain download files for the BBS
       should be included, this way the user knows how much
       free space is left on the total system.

       The second number displayed is the amount of free space
       only in the BBS:CONF/UPLOAD directory. This is so the
       BBS and the user know exactly how much space is available
       to receive uploads until the sysop does some maintenance.

       Currently the BBS is content to allow uploads until the
       free space in BBS:CONF/UPLOAD is less than 2,000,000 bytes.

5. At this point the BBS calls the resume routine to check
       if there are any files to resume on, this works the same way
       as explained under the 'G'oodbye command.

6. The BBS will then ask the user to enter the filenames of the
       files he will be uploading, or he can press return alone to
       have Zmodem tell the BBS the names.  Specifying an 'A' will
       abort out of an upload altogether and drop the user back to the
       main prompt.

7. If the user enters the filenames, the BBS will check to make
       sure they don't already exist in the conference, if not the
       BBS will ask him to enter the description for each file.
       Entering a blank line will end the description.

8. Next the BBS will display:
       (Enter) to Start, (G)oodbye after transfer, (A)bort?
       this works the same as specified in the download routines.

       At this point the Sysop is able to press "L" for start a
       local upload routine, which will pop up a Requester for
       selecting files to upload LOCAL into the BBS without starting
       the ZMODEM Transfer over the Serial In/Output.

9. At this point if the user has not been added to the end of
       BBS:NODE{x}/UDLOG he will be.

10. If the Upload is now to be started the BBS will check in the file
       you specified for the FILESNOTALLOWED=<pathname> option in the NODE
       ICON. If this file is not allowed to be uploaded it will skip
       the upload.

11. The BBS then displays the STATS from the transfer for all the
       files.

12. The users time is then credited for the uploads.

13. Next the BBS goes thru the files sent and checks to see if
       the name is longer than 12 characters, if so the BBS asks
       the user to rename the file.

14. The BBS then checks to see if the user has already given
       the descriptions for the file, if so it posts it accordingly.

15. If the user has not already given the description for the file the BBS
       asks for the description of the file. Again giving 8 lines
       for the description.

16. If the user gets disconnected while entering the description
       the BBS will put "LOSS CARRIER" for the description.
       and place the file in the BBS:CONF/LCFILES directory,
       along with a Comment in the <usernumber>.lc which will contain
       a list of all the files he will need to enter descriptions for
       when he calls back. The Re-Enter description process is
       done at LOGON with the PartUploads routine.

17. Once the description has been entered, the BBS checks if there
       is a door called "FILECHECK" in the SYSCMD directory, if so it will
       be executed and this internal "FCHECK" will be used. This is
       where you can use a multiple type of file checker for all formats.
       If the door doesn`t exists express will check if there is a
       file extension. (a file extension is usually on 3 characters
       preceded by a '.'. (IE:.DMS,.LHA.)).

       Express now compares the extension with any ICON of the same extension name in the BBS:FCHECK directory.

          ICONS in the FCHECK directory specify that you are using
          external file checkers. The format for each ICON has been
          mentioned below.

          If no external checker exists for the file then it
          will be posted with a comment "N" for non checked.

18. If the archive is checked and it passes the BBS puts
       a 'P' between the filename and filesize in the listing.

19. If the archive is checked and if found bad then the BBS
       puts a 'F' between the filename and filesize in the listing.

20. If the file is not one of the above checkable file types
       then the BBS puts a 'N' between the filename and the
       filesize in the listing.

21. Now the BBS will post the file in the listings area.  If the
       user specified a '/' at the beginning of the description
       for the file, or the file failed archive check, or the
       user got disconnected then the BBS posts the file to the
       end of BBS:CONF/HOLD/HELD  If the archive passed or wasn't
       checkable and the user didn't specify a '/' at the beginning
       of the description then the BBS will post the file to the
       end of BBS:CONF/DIR{U} where U is the upload directory (or
       the highest directory available).

22. If when the BBS goes to move the file, like to the hold
       directory and there is already a file in the hold with the
       same name, the BBS will add a '_' to the end of the filename
       until it can be renamed.

23. Once all the file are exhausted the BBS checks to make sure
       there aren't any free floating files in the BBS:NODEx/PLAYPEN
       directory, if there are the BBS then moves the files to
       BBS:CONF/PARTUPLOAD as partially uploaded files from the
       current user ONLINE.

####   [ UP ] - Display uptime for node

Displays the time and date when the node was last (re)started

####   [ V ] - View a Text File:

This command allows the user to view the contents of a TEXT file located in the BBS:CONFNAME/UPLOAD directory. For Co-Sysop's with Access to SYSOP_VIEW in Access ICONS, TEXT files can be viewed from any valid system path.
1. The BBS first checks to see if there are file Dirs in that CONF. by looking in the tooltype NDIRS=<numb>. If this type is unavailable or reports zero, the user is returned back to the MAIN MENU PROMPT after a message stating "No files available in this conference."
2. The BBS then asks the user for the filename to view.
3. If the user has ACCESS to the SYSOP_VIEW Option and he specified 'VS' instead of just 'V' then the BBS will allow the filename to include the path. The sysop view is noted at the end of BBS:NODE{x}/CALLERSLOG what file was viewed.
4. The BBS then displays the file as long as the characters in the file are < 128 in value.  If a character is greater than 127 then the BBS says "This file is not a text file." And drops back to the main prompt.

NOTE: If a file has a comment of RESTRICTED then the user will not be able to view the file. If an attempt was made then the users name will be annotated in the BBS:NODE{x}/CallersLog

####   [ VER ] - View ami-express version information

Displays the version number, date and registration of Express being used on this node.

####   [ W ] - Write User Parameters:

This command allows the user to change some personal items pertaining to his account on the system. When called, this command brings up the following:

```
            1. LOGIN NAME..............ByteMaster
            2. REAL NAME...............Joseph Hodge
            3. INTERNET NAME...........jhodge
            4. LOCATION................Radford, Va.
            5. PHONE NUMBER............603-555-1212
            6. PASSWORD................ENCRYPTED
            7. LINES PER SCREEN........23
            8. COMPUTER................Amiga 2000/GVP030
            9. SCREEN TYPE.............Amiga Ansi
           10. SCREEN CLEAR............Yes
           11. TRANSFER PROTOCOL......./X Zmodem
           12. EDITOR TYPE.............Prompt
           13. ZOOM TYPE...............QWK
           14. AVAILABLE FOR CHAT/OLM..Yes

           Which to change <CR>= QUIT ?
```

At this prompt, the user can select which item to change, or hit return alone to exit from this routine. The first four items can be security set by the Config program so that users without the necessary security cannot change their Name, Location, Phone or Password. For more information, refer to the documentation for the AmiConfig program.

####   [ WHO ] - Node Information:

This command shows the user which users are ONLINE on the other nodes and what they are doing actually. If you choose QUIETNODE for a specified node, this node will be skipped in displaying this information.

####   [ X ] - Expert Mode Toggle:

This command allows the user to switch between eXpert and Novice mode where expert mode will not display the menu unless a '?' is specified at the command line and Novice will Redisplay the menu after every command issued and completed.

####   [ Z ] - Zippy Text Search:

This command allows the user to scan thru all the BBS:CONFNAME/DIR{x} files for a match for a specified string. When it finds a match, it displays the whole filespec including the description. If the NDIRS=<numb> tooltype reports zero or does not exist, then zippy search will not be functional.

####   [ ZOOM ] - Zoo Mail:

You can now extract your messages in ascii or QWK formats. ZOOM will compile all the user's unread mail, (in LHA or ZIP format if requested) from ALL accessible conferences and then a download of the file will be initiated. The download will be classified as a free download.

####   [ CF ] - Set Conference Configuration:

This command will allow your users to set the way express handles conferences. From here they can set the 'NEW FILE SCAN', 'NEW MESSAGE SCAN', and turn 'OFF' and 'ON' what conferences they want to ZOOM mail from. Additionally new in /X5.3.0 you can choose for the mail scan to show messages to ALL 

In the Conference Maintenance option in the Account editor you can also Globally set these options (F5).

####   [ VO ] - Voting Booth:

This Command requires ACS.MODIFY_VOTE for SYSOPS and ACS.VOTE for the users in the access icon.

NOTE: with the VOTING BOOTH a directory called VOTE will automatically be created in the conference directory when you initialize a voting booth for a conference.

The voting booth can have up to 25 topics per conference, each topic can have up to 99 multiple choice questions to it. Also there is a new option to the Conference Maintenance screen called RESET VOTING BOOTH, when this is run it will zero out the bits in the CONF.DB that keeps track of which voting topics a user has already voted on. You should do this for each conference that you plan on having a voting booth in.

The Voting booth is conference based, meaning that one conference cannot share the voting booth of another conference.

To setup a Voting Booth for a conference simply reset the voted flags in the CONF.DB via conference maintenance then:
1. type 'VO' from the menu prompt.
2. Select the 'CREATE VOTE TOPIC' menu option. (REMEMBER you must have ACS.MODIFY_VOTE access for this to work)
3. You will be prompted to enter a TOPIC NUMBER this number can range from 1 - 25, you will probably want to start with '1'.
4. You will now be prompted for a ONE LINE DESCRIPTION of the TOPIC. Then you can save, edit, abort, list, delete etc.
5. Next you will be asked for the QUESTIONS OF THE TOPIC. YOU CAN have up to 99 questions per TOPIC.
6. After you are finished entering a question then enter 'S' for save in order for it to ask you for the multiple choice options. You can have up to 25 multiple choice options per question.
7. When you are finished entering 1 choice, then press return and save to submit it and go onto the next choice.
8. When you are finished entering choices the when prompted for the next choice , simply press save, this will prompt you for the next question.
9. If you have no more questions, then press ABORT at the QUESTION prompt.
10. This should bring you back to the VOTE MAINTENANCE MENU.
11. At the VOTE MAINTENANCE MENU, you can also edit a vote, topic, etc. In case you made a mistake.

NOTE:

Concerning the voting booth. After you setup a TOPIC you cannot add questions to that topic once it is created, when a user votes on a topic they must vote on all questions in the topic for it to be considered a valid vote. This is handled automatically in that once they are in the TOPIC voting process, they cannot get out of it until they answer all the questions for that topic, if they loose carrier while answering the questions, then the answers for that topic will be discarded and the user will have to re-vote on the topic when they log back on. In other words, the questions for a topic are not updated until the user answers all questions in that topic.