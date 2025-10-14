To install AmiExpress you must have the following things:

| Program       | Location      | Description               | 
| ------------- | ------------- | ------------------------- |
| Express       | Configurable  | Bulletin Board System     |
| ACP           | WBSTARTUP     | Bulletin Board controller |

### Machine Requirements
* The Workbench should be installed to run ACP
* a Amiga Model (500/600/1000/1200/2000/2500/3000/4000)
* the installed Version of Kickstart V2.0 (Soft or Hardware Version)
* at least 2 MB free Space to be able to get uploads
* Minimum of 2.5MB of RAM to run a single node - Each node requires roughly about an extra 1MB although this can be reduced if you make Express resident. We recommend 8MB+ to run a multi-node BBS effectively.
* the installed .INFO Files in the directories.

In addition to the above machine requirements there are some features which have additional requirements

| Feature       | Requirement  | 
| ------------- | -------------|
| Email notifications | AmiSSL.library is required to interface to an SMTP server in order to send email notifications |
| Remote Shell  | fifo-handler and fifo.library is required to pipe the input and ouput to the shell handler |
| Optional serial locking | owndevunit.library is required to facilitate the locking process |

It is recommend to install AmiExpress on a HardDrive to increase The Speed of AmiExpress and to have enough space for Uploading software on the BBS. If you only want to test the AmiExpress Version than you can install the BBS also on a DiskDrive.