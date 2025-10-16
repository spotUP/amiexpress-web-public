1. Command history has been added in to allow up to 20 history lines to be remembered.  Once the limit of 20 has been released the history will cycle thru. CTRL-B will reset the history pointer to zero entries.

2. The HELP key opens and closes the status display at the top of the screen

3. The BBS checks to make sure the AUXx: or CNN: device can be opened and tells the user if there is a problem.

4. Baud Calling times has been added in, kind of a throw in and will be changed, but for now, specify the time period a baud rate CAN call, like to allow a baud to call all the time enter 0 for start and 2359 for end.  Start time must be a lower number than end time. As I stated this is not perfect and will be removed from the Config and a file will contain all the times a baud can't call.  It will allow more flexibility.

5. AREXX port 'AmiExpress_Node.x', supports the following features:

* suspend - causes the BBS to close the serial port and iconify and wait for a resume command.  If someone is ONLINE the BBS will wait until they logoff to reply to the suspend message, and then the BBS will suspend.  This allows you to create a batch file that will automatically suspend the BBS and load your terminal program and once your finished with the terminal program put the BBS back up.

An example Arexx Program should be like this that the BBS will suspend:

```
               /* The Suspend Command for AmiExpress V4.0 */
               address 'AmiExpress_Node.1'
               'suspend'
```
* resume  - this command is only used while the BBS is suspended.

* shutdown - this command will cause the BBS to lower the users
                time ONLINE to 2 mins and tell the user that it has
                received an emergency shutdown notice.  Once the user
                is off the BBS exits from memory.

     NOTE: None of these features work without Arexx.

There will be lots of AREXX commands in the future, including node to node chatting..

6. Automatic Zmodem upload, if a user starts a Zmodem upload on the main prompt the BBS will detect this and enter the Zmodem upload routines.

7. SYSOP now has the ability to run a node in the background just for his local use.  To do this just remove the device name from the Config file and the BBS will not use the serial port.
