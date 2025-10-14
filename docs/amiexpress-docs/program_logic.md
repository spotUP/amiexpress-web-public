We will now describe the program logic of the Express so you can learn how to operate AmiExpress to it's maximum potential.

The ACP window has 15 major buttons at the bottom of the window. Here is a list of there names and function:

#### [ Sysop LOGON ]
Logs you into a node as the sysop.

#### [ Local LOGON ]
Enters the initial log on phase of the Node This will require you to specify your name and password.

#### [ Instant LOGON ]
This will give a carrier detect command to the modem, this is good for re-establishing a connection to a user after talking to them voice on the same line.

#### [ Reserve Node ]
This allows you to tell the Node to only let a certain user on the BBS. After the user has called 
the node will no longer be reserved.

#### [ AEShell ]
This will open a shell on the Node screen.

#### [ Accounts ]
This takes you into account editing on a node.

#### [ Toggle Chat ]
This toggles the Node's chat request flag, if a Nodes Chat request flag is off, then only user of a high enough security level be able to request a chat.

#### [ INIT Modem ]
This re-initializes a modem of a particular node.

#### [ Exit Node  ]
This will shutdown the node in question.

#### [ Node(offhook) ]
This will shutdown the node in question and also make the line busy.

#### [ Node Config ]
This will bring up our Config program for a particular node.

#### [ Node Chat ]
This button will take you into chat mode with a particular node.

#### [ Save Win ]
This button does not require a NODE(x) complement. This simply saves the window coordinates of ACP to a file called S:ACP.Config

#### [ Set NRAMS ]
This button will Set the NRAMS of your Modem and will save it to the EPROM.

NOTE: All of the above mentioned buttons unless said otherwise, require you to press the Appropriate node button for them to take effect.

Once all of the NODES are started the following actions take place for each node:

At this point the BBS will load up the computer types from a ICON called:

        BBS:COMPUTERLIST.INFO

Ami-Express then checks if the node is already running as another task, and if it is, then the program halts and exits with an error message.

Next, Ami-Express will try to access the LIBS:REXXSYSLIB.LIBRARY for it's Arexx port routines, and if not found, will disable the Arexx port and inform the user that the Rexx port is disabled.

Ami-Express will run thru it's initialization process where it will take the modem off-hook, and configure it for BBS operation.  This is done so that an incoming call does not alter the configuration process.

Many of the above actions are also available using function keys F1-F10 from the main Express screen for each node and there are also some additional functions available:

*  F1  - Sysop Logon (As above)
*  F2  - Local Logon (As above)
*  F3  - Instant Logon (As above)
*  F4  - Reserve Node (As above)
*  F5  - Conference Maintenance (Manage the CONF.DB files)
*  Shift+F5  - Remote Shell
*  F6  - Account Editing
*  Shift+F6  - View callers log
*  F7  - Chat Flag toggle (whether you are to be paged or not)
*  F8  - INIT Modem (As above)
*  F9  - Exit Node (As above)
*  F10 - Exit Node Offhook (As above)

While someone is ONLINE you have the following function keys available to you:

*  F1  - Chat in/out
*  F2  - Increase On-line time limit +10 mins
*  F3  - Decrease On-line time limit -10 mins
*  F4  - Asks for a path/filename for a capture file (only on the SYSOPS side) or if one is already open then it closes the capture and lets you know it did so. when you press F4 again the capture will be stopped.
*  Shift+F4  - This will pop up an ASL Requester to let you choose an ASCII File to be send to the user.
*  F5  - Local Shell (not currently implemented)
*  F6  - Account Editing
*  Shift+F6  - This will let you change the Account of a User only for that call he is ONLINE. When he locks off the BBS will reset his Account to the old one. Press Shift+F6 a second time and the changes will be restated to the old ones.
*  F7  - Chat Flag toggle (whether you are to be paged or not)
*  F8  - Serial in on/off (User can`t write until you press F8 again)
*  F9  - Serial out on/off (User can`t see what you are typing)
*  F10 - Disconnect ONLINE User *KICK*

Now follows the normal reactions of AmiExpress when something happens if the BBS is in the standby mode and the nodes are standing at "Awaiting Connect".

#### Awaiting Connect
1. The BBS checks for F key input from the local keyboard.

2. Or data coming in the serial port.

3. Or data coming in the internal communication AmiExpress_Node(x) msgport for commands either suspend, resume, or shutdown.

4. Or data coming in from the AmiExpress window itself (Gadgets etc..)

5. Or data coming in from AmiExpress Control.(ACP)

Once the modem picks up a RING DETECT, the BBS sends an Answer string specified in the Config file to the modem, and waits for a response from the remote modem. If the result string is a valid connect string, the BBS continues with normal operations, if not, it resets the modem and the ACP screen will return to "Awaiting Connect" state.

If the connect string was a valid one, AmiExpress first checks a couple of things before performing the LOGON routine:

#### Logon
1. System checks for a file called: BBS:NODE{x}/NOCALLERSAT{BAUD} where x is node number and BAUD is the baud rate that is unaccepted. If this file exists, and the current baud rate matches the BAUD, then the BBS displays the file and disconnects.
2. Displays the connect string received from the modem.
3. Now, the BBS displays the standard welcome message, and starts to perform the actual LOGON procedure.
4. Check to see if you have a Module called FRONTEND , if so it executes it. see section regarding doors for more info. Explanation: To Install the FRONTEND module you have to a ICON to the BBS:COMMANDS/SYSCMD directory called "FRONTEND"
5. BBS checks if there is a module called "ANSI" in the SYSCMD Directory if so it will start the door you insert and will skip the selecting of ANSI or ASCII Colors. Look at Point (4) above for more Info about installing these doors. If the BBS can`t find such a door it will asks if the user wants ANSI graphics or not.  If a 'Q' is specified at the end of the line like: "YES Q" or "Y Q" etc. Then the BBS checks if the Option DISABLE_QUICK_LOGONS is on or not if the option is on the BBS will display the Logon.txt because you want to have the users seen it. If the Option is off and the user answers "Y Q" or "YES Q" the BBS will not display the LOGON or logoff screens.
6. Then if the sysop has specified a SYSTEM PASSWORD it displays a file called: BBS:NODE<x>/PRIVATE.TXT then asks for the SYSTEM PASSWORD you specifies. The system gives the user three tries and if by then he hasn't gotten it the BBS hangs up, and displays in the CallersLog that someone attempted to get the SYSTEM PASSWORD.
7. The BBS displays the file: BBS:NODE{x}/BBSTITLE.TXT
8. It now asks for the user to enter his FULL NAME, again WILDCARDS are usable and will expand and ask if correct.  A user gets five tries at his user name, then the BBS hangs up.
9. If the BBS can't find the name supplied it will tell the user and ask him if he would like to 'C'ontinue to join or 'R'etry entering his name again.


    #### [C]ontinue as a New User Selected:

    1. If the BBS has been reserved it will notify the user that the BBS has been reserved for a specific member and will then hang-up.
    2. If the BBS hasn't been reserved then the BBS checks to see if the user's baud rate is allowed during the time he has called. If so, then the BBS allows the user to continue, otherwise it displays the file: BBS:NODE{x}/NOTTIME{BAUD}.TXT {x} = Node number, {BAUD} = Current Baud rate.
    3. If the sysop has specified a new user password in the Config file then the BBS displays the file: BBS:NODE{x}/NEWUSERPW.TXT Then it asks for the new user password and if the user gets the password wrong it goes back and asks for his FULL NAME again, after 5 tries the BBS hangs up.
    4. If the System-Operator wishes to have no more NEW users the BBS would look for the file BBS:NODE{x}/NONEWUSERS then displays it and disconnect the User. And if you wishes to have no more NEW users at a SPECIFIC BAUD RATES, the BBS would look for a file called BBS:NODE{x}/NONEWAT{BAUD}, displays it and then disconnecting the User. {x} = Node number, {BAUD} = Current Baud rate.
    5. Now it enters the New Account routines.

    #### New Account
    1. Search displays BBS:NODE{x}/JOIN.TXT
    2. Asks for full name. At this point WILDCARDS are NOT ALLOWED. The user only has 5 chances to enter it then the BBS says "Too Many Errors, Good-bye!"
    3. The BBS checks for use of a name that already exists. If the name already exists it asks again.
    4. The BBS checks the name given to see if not in the list of names supplied in the icon BBS:NAMESNOTALLOWED This is a file that contains names that the sysop does not want to allow on the BBS.  If the file does not exists the BBS will not allow any new users to log on until the file has been added.  This is to prevent someone getting on as ALL or EALL etc.  A notice will be placed at the end of the BBS:NODE{x}/CALLERSLOG file.

    WARNING: You should specify in that list SYSOP, ALL, and EALL

    5. Next it asks for the City, State.
    6. The it asks for Phone Number (xxx-xxx-xxxx)
    7. Next, it asks for the Users personal Password
    8. Number of lines on screen (1-255)
    9. Clear Screen between Messages ?
    10. Asks for which ScreenType the User want to have.
    11. Display back all info and asks if it is correct if the user needs to change something he just says no its not correct and the process starts again at 2..
    12. At this point the BBS checks to see if there is a script Module in the SYSCMD Directory and if express will find this module it will start it instead of the normal SCRIPT questionnaire. And if express can`t find such a Module it will start the normal SCRIPT questionnaire to ask the user to fill out, it checks for BBS:NODE{x}/SCRIPT{BAUD} {x} = Node number, {BAUD} = Current Baud rate.

    NOTE: The {BAUD} should be specified as 1200,2400,4800,9600, 12000, 14400 and 16800 to allow for proper connect handling by USR HST modems.

    Now the user is asked to fill out the script if existent. A sample script may look like:

                    What is your Real Name: ~
                    What is your Real #   : ~
                    What is your Sex,Age  : ~

    Here, the ~ character is used when a prompt for input by the user is expected.  The answers are saved to BBS:NODE{x}/TEMPANS before being validated by the sysop. Once the Sysop validates the User, the answers are copied over to BBS:NODE{x}/Answers.
    13. The BBS then displays the file BBS:NODE{x}/JOINED.TXT

10. Once the system has loaded the users account, it checks to see if the system has been reserved, if so and the user who just logged in is not the reserved user the BBS displays that the system has been reserved for that specific user, and then hangs up.

11. Then the BBS will display the BBS:NODE{x}/LOGON.TXT, text where x stands for the Node.

12. If the BBS hasn't been reserved then the BBS checks to see if the user's baud rate is allowed during the time he has called. If so, then the BBS allows the user to continue, otherwise it displays the file: BBS:NODE{x}/NOTTIME{BAUD}.TXT

13. If the users Security level is 0 then the BBS displays the file: BBS:NODE{x}/LOCKOUT-0.TXT and then hangs up.

14. If the users Security level is 1 then the BBS displays the file: BBS:NODE{x}/LOCKOUT-1.TXT and then hangs up.

NOTE: These two files allow a sysop to be either polite about not allowing a user on the system, or if the user is an abuser, the sysop can have a full blown rude as hell Lockout text for those types of users.

15. At this point the system adds to the end of BBS:NODE{x}/CALLERSLOG that a user just logged in.

16. Now the BBS asks the user for his password, every time the user gets the password wrong the BBS adds what he tried to the end of BBS:NODE{x}/CALLERSLOG. After 3 tries the BBS hangs up and adds this to the CALLERSLOG.

17. Then the standard LOGON sequence takes place and puts the user at the main command prompt

#### Logon sequence for a previous user

When a user with an existing account logs into the BBS, the LOGON procedure is a lot more simplified. The standard LOGON procedure is listed below:

1. The BBS checks to see if the user has any time for the day if not it displays BBS:NODE{x}/LOGON24HRS.txt file to the user and hangs up.
2. If no BULLBATCH files are specified, the BBS looks for any Bulletin files in BBS:NODE{x}/BULL{SEC}.TXT where {x} = NODE NUMBER and {SEC} = USERS CURRENT SECURITY LEVEL. If a file is found that matches the user`s security level, it is displayed. For example, a last callers bulletin for standard user security of 20 would be saved in the BBS:NODE{x} directory as follows: BBS:NODE{x}/BULL20.TXT and BBS:NODE{x}/BULL20.TXT. This routine has also been simplified from the sysop's end so that the appropriate bulletins are searched for in a rounded off method.
     ie: If a user level with security level of 20 has logged in, and the BBS cannot find an entry for
BBS:NODE{x}/BULL20.TXT but finds a file called BBS:NODE{x}/BULL15.TXT, then this file will be displayed. If there is also a file called BBS:NODE{x}/BULL30.TXT, this file will be displayed to users with security level of at least 30 or more. Once the BBS finds the nearest file, it displays that file only.

NOTE: Routines have been added to AmiExpress to make sysop setup a little easier and less annoying to the user.  The BBS will scan for a particular file in this method:

Say a user with access level 30 just logged in, with ANSI color, now the BBS will check first if there is a BULL30.TXT and if not the BBS will go on with searching for bulls lower than 30.

Look here:

      BBS:NODE{x}/BULL30.TXT
      BBS:NODE{x}/BULL25.TXT
      BBS:NODE{x}/BULL20.TXT
      BBS:NODE{x}/BULL15.TXT
      BBS:NODE{x}/BULL10.TXT
      BBS:NODE{x}/BULL5.TXT
      BBS:NODE{x}/BULL.TXT

NOTE: because of this method of searching, all files to be searched for must end in either 0 or 5 (as above), the user access level will be rounded down to the nearest multiple of 5 and the search will start there.

That's an example of a search for a file to be displayed, once a file is found that exists it displays ONLY that file. This method is used on the following:

       BBS:NODE{x}/BULL
       BBS:NODE{x}/JOINCONF
       BBS:CONF/JOINMSGBASE
       BBS:CONF/MENU
       BBS:CONF/BULL

In some cases it works a little different, in this case the user security is not used, like:

       BBS:CONF/Bulletins/BULLHELP.TXT
       BBS:CONF/Bulletins/BULLHELP.TXT

That's how that one works and the following are like that:

       BBS:NODE{x}/JOINED
       BBS:NODE{x}/LOGON24HRS
       BBS:NODE{x}/GUESTLOGON
       BBS:NODE{x}/LOGON
       BBS:NODE{x}/LOGOFF
       BBS:NODE{x}/JOIN
       BBS:NODE{x}/NOTTIMEBAUD
       BBS:NODE{x}/PRIVATE
       BBS:CONF/FILEHELP

NOTE: For multiple bulletins upon LOGON, a BULLBATCH script is used to display the necessary bulletins in the correct order.  For more information on this, please refer to the section under BULLBATCH implementation.

3. If any of the conferences require real names or internet names and the user has not set them, then the bbs:RealNames screen is display (or a default prompt is displayed) and the user must enter a real name. The same process applies to internet names using the bbs:InternetNames screen.

4. The mailscan screen is displayed (bbs:mailscan)

5. Initial User specific checks are made:

     1. The BBS now scans thru all the conferences that the user has access privilege to for any waiting mail. While scanning, AmiExpress will store the MSG numbers in memory until the end of the scan, at the end of the scan AmiExpress will proceed to show the user the originator of each message and then proceed to prompt the user if he/she wishes to read the mail.

        This method of scanning has 3 advantages:

        1. The user will now know who left him/her mail prior to reading it.

        2. The NewMail Scan pointer will not be updated until all the mail is read. So if the user has 2 messages '100' and '101' and he/she reads message 101 and not 100, then the next time the user logs on or does a mail scan, he/she will still  be notified of message 100.

        3. The NewMailScan will now remember the last valid message left to the user when the user losses carrier or logs off. If mail is found, it informs the user about it and asks the user if they want to view it.

     2. The BBS checks to see if there are any unfinished uploads. If someone looses carrier uploading a file and calls back he will be allowed to resume his/her upload.

6. Then the BBS rejoins the conference the user was in the last time he called.

7. It then checks the ICON BBS:CONF to see how many, if any, directories of files that specific conference has.
        It will check if in the ICON the NDIRS is bigger than 0. for example:

        NDIRS=2

This would specify that there are two file directories where files are kept. A carriage return is necessary after the number.

If this file is unavailable, the conference will have NO files available in it, meaning no uploads or downloads will be possible from it.

8. If the number of directories is greater than zero, the BBS looks to see if a in the CONF ICON the Tooltype "FREEDOWNLOADS" is turned on, if so then all files in this particular conference are free to download.

9. Now, the BBS scans for any BBS:CONF/BULL{SEC}.TXT files in the same method as described earlier on.

NOTE: This works exactly like the BBS:NODE{x}/BULL files.

10. After displaying the available bulletins, if the user is not in EXPERT mode, the BBS displays the available BBS:CONF/MENU{SEC}.TXT and reaches the MAIN MENU PROMPT.

Any command entered at the MAIN MENU PROMPT will be looked up in a BBS:Commands/BBSCmd directory. If the command is found as a module name in the directory the module will be executed. If the command cannot be found, then the command will be compared to BBS:Commands/NODE{x}CMD directory and like wise be executed if found. If the command cannot be found, then the command will be compared to BBS:Commands/CONF{x}CMD directory and like wise be executed if found. Otherwise the command will be considered an internal command and maybe any of the commands listed below.