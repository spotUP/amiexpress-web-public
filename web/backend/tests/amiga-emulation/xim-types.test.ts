/**
 * Unit tests for amiga-emulation/xim/types.ts
 * Tests XIM protocol type definitions critical for 68K door communication
 *
 * XIM (eXpress Interface Module) protocol enables communication between
 * 68K doors and the BBS. Command codes, status values, and field lengths
 * MUST match axcommon.e specification exactly for door compatibility.
 */

import {
  XIMCommand,
  ArrowKeyCodes,
  ENVStatus,
  AEDoorError,
  DataDirection,
  FieldLengths,
  isCommandInfoRequestCommand,
} from '../../src/amiga-emulation/xim/types';

describe('XIM Protocol Types (Critical for 68K Door Communication)', () => {
  describe('XIMCommand enum', () => {
    describe('Terminal I/O commands (JH_*)', () => {
      it('should have correct JH_* command codes', () => {
        expect(XIMCommand.JH_LI).toBe(0);
        expect(XIMCommand.JH_REGISTER).toBe(1);
        expect(XIMCommand.JH_SHUTDOWN).toBe(2);
        expect(XIMCommand.JH_WRITE).toBe(3);
        expect(XIMCommand.JH_SM).toBe(4);
        expect(XIMCommand.JH_PM).toBe(5);
        expect(XIMCommand.JH_HK).toBe(6);
        expect(XIMCommand.JH_SG).toBe(7);
        expect(XIMCommand.JH_SF).toBe(8);
        expect(XIMCommand.JH_EF).toBe(9);
        expect(XIMCommand.JH_CO).toBe(10);
        expect(XIMCommand.JH_BBSNAME).toBe(11);
        expect(XIMCommand.JH_SYSOP).toBe(12);
        expect(XIMCommand.JH_FLAGFILE).toBe(13);
        expect(XIMCommand.JH_SHOWFLAGS).toBe(14);
        expect(XIMCommand.JH_ExtHK).toBe(15);
        expect(XIMCommand.JH_SIGBIT).toBe(16);
        expect(XIMCommand.JH_FetchKey).toBe(17);
        expect(XIMCommand.JH_SO).toBe(18);
        expect(XIMCommand.JH_SMPTR).toBe(19);
        expect(XIMCommand.JH_20).toBe(20);
      });

      it('should have correct JH_* aliases', () => {
        expect(XIMCommand.JH_CK).toBe(500); // Check for key (QuickKey)
        expect(XIMCommand.JH_DL).toBe(15);  // Alias for ExtHK/DL
        expect(XIMCommand.JH_MCI).toBe(507); // MCI processing
      });

      it('should have screen address commands', () => {
        expect(XIMCommand.SCREEN_ADDRESS).toBe(139);
        expect(XIMCommand.RAWSCREEN_ADDRESS).toBe(141);
      });
    });

    describe('Data query commands (DT_*)', () => {
      it('should have correct user data commands', () => {
        expect(XIMCommand.DT_NAME).toBe(100);
        expect(XIMCommand.DT_PASSWORD).toBe(101);
        expect(XIMCommand.DT_LOCATION).toBe(102);
        expect(XIMCommand.DT_PHONENUMBER).toBe(103);
        expect(XIMCommand.DT_SLOTNUMBER).toBe(104);
        expect(XIMCommand.DT_SECSTATUS).toBe(105);
        expect(XIMCommand.DT_SECBOARD).toBe(106);
        expect(XIMCommand.DT_SECLIBRARY).toBe(107);
        expect(XIMCommand.DT_SECBULLETIN).toBe(108);
        expect(XIMCommand.DT_MESSAGESPOSTED).toBe(109);
        expect(XIMCommand.DT_UPLOADS).toBe(110);
        expect(XIMCommand.DT_DOWNLOADS).toBe(111);
        expect(XIMCommand.DT_TIMESCALLED).toBe(112);
        expect(XIMCommand.DT_TIMELASTON).toBe(113);
        expect(XIMCommand.DT_TIMEUSED).toBe(114);
        expect(XIMCommand.DT_TIMELIMIT).toBe(115);
        expect(XIMCommand.DT_TIMETOTAL).toBe(116);
        expect(XIMCommand.DT_BYTESUPLOAD).toBe(117);
        expect(XIMCommand.DT_BYTEDOWNLOAD).toBe(118);
        expect(XIMCommand.DT_DAILYBYTELIMIT).toBe(119);
        expect(XIMCommand.DT_DAILYBYTEDLD).toBe(120);
        expect(XIMCommand.DT_EXPERT).toBe(121);
        expect(XIMCommand.DT_LINELENGTH).toBe(122);
      });

      it('should have correct system data commands', () => {
        expect(XIMCommand.ACTIVE_NODES).toBe(123);
        expect(XIMCommand.DT_DUMP).toBe(124);
        expect(XIMCommand.DT_TIMEOUT).toBe(125);
        expect(XIMCommand.DT_USERLOAD).toBe(133);
        expect(XIMCommand.DT_STAMP_LASTON).toBe(143);
        expect(XIMCommand.DT_STAMP_CTIME).toBe(144);
        expect(XIMCommand.DT_CURR_TIME).toBe(145);
        expect(XIMCommand.DT_CONFACCESS).toBe(146);
      });

      it('should have correct user preference commands', () => {
        expect(XIMCommand.DT_LANGUAGE).toBe(527);
        expect(XIMCommand.DT_QUICKFLAG).toBe(528);
        expect(XIMCommand.DT_GOODFILE).toBe(529);
        expect(XIMCommand.DT_GOODFILE_FLAG).toBe(529); // Alias
        expect(XIMCommand.DT_ANSICOLOR).toBe(530);
        expect(XIMCommand.DT_ISANSI).toBe(541);
        expect(XIMCommand.DT_MSGCODE).toBe(543);
        expect(XIMCommand.DT_FILECODE).toBe(545);
      });

      it('should have correct extended user data commands', () => {
        expect(XIMCommand.DT_REALNAME).toBe(606);
        expect(XIMCommand.DT_INTERNETNAME).toBe(637);
        expect(XIMCommand.DT_TRANSLATOR).toBe(638);
        expect(XIMCommand.DT_HOST_LANGUAGE).toBe(639);
        expect(XIMCommand.DT_HOSTNAME).toBe(700);
        expect(XIMCommand.DT_HOSTIP).toBe(701);
        expect(XIMCommand.DT_GEOGRAPHIC).toBe(702);
        expect(XIMCommand.DT_SIZEUPLOAD).toBe(703);
        expect(XIMCommand.DT_SIZEDOWNLOAD).toBe(704);
      });

      it('should have correct conference data commands', () => {
        expect(XIMCommand.DT_CONFACCESS2).toBe(900);
        expect(XIMCommand.DT_CBYTESUPLOAD).toBe(901);
        expect(XIMCommand.DT_CBYTESDOWNLOAD).toBe(902);
        expect(XIMCommand.DT_CFILESUPLOAD).toBe(903);
        expect(XIMCommand.DT_CFILESDOWNLOAD).toBe(904);
        expect(XIMCommand.DT_CALLEDTODAY).toBe(906);
      });

      it('should have bit manipulation commands', () => {
        expect(XIMCommand.DT_ADDBIT).toBe(1000);
        expect(XIMCommand.DT_REMBIT).toBe(1001);
        expect(XIMCommand.DT_QUERYBIT).toBe(1002);
      });
    });

    describe('BBS information commands (BB_*)', () => {
      it('should have correct BB_* commands', () => {
        expect(XIMCommand.BB_CONFNAME).toBe(126);
        expect(XIMCommand.BB_CONFLOCAL).toBe(127);
        expect(XIMCommand.BB_LOCAL).toBe(128);
        expect(XIMCommand.BB_STATUS).toBe(129);
        expect(XIMCommand.BB_COMMAND).toBe(130);
        expect(XIMCommand.BB_MAINLINE).toBe(131);
        expect(XIMCommand.BB_CONFIG).toBe(134);
        expect(XIMCommand.BB_TASKPRI).toBe(140);
        expect(XIMCommand.BB_CHATFLAG).toBe(142);
        expect(XIMCommand.BB_PCONFLOCAL).toBe(147);
        expect(XIMCommand.BB_PCONFNAME).toBe(148);
        expect(XIMCommand.BB_NODEID).toBe(149);
        expect(XIMCommand.BB_CALLERSLOG).toBe(150);
        expect(XIMCommand.BB_UDLOG).toBe(151);
        expect(XIMCommand.BB_CHATSET).toBe(162);
      });

      it('should have correct BB_* extended commands', () => {
        expect(XIMCommand.BB_CONFNUM).toBe(510);
        expect(XIMCommand.BB_DROPDTR).toBe(511);
        expect(XIMCommand.BB_GETTASK).toBe(512);
        expect(XIMCommand.BB_REMOVEPORT).toBe(513);
        expect(XIMCommand.BB_SOPT).toBe(514);
        expect(XIMCommand.BB_LOGONTYPE).toBe(517);
        expect(XIMCommand.BB_SCRLEFT).toBe(518);
        expect(XIMCommand.BB_SCRTOP).toBe(519);
        expect(XIMCommand.BB_SCRWIDTH).toBe(520);
        expect(XIMCommand.BB_SCRHEIGHT).toBe(521);
        expect(XIMCommand.BB_PURGELINE).toBe(522);
        expect(XIMCommand.BB_PURGELINESTART).toBe(523);
        expect(XIMCommand.BB_PURGELINEEND).toBe(524);
        expect(XIMCommand.BB_NONSTOPTEXT).toBe(525);
        expect(XIMCommand.BB_LINECOUNT).toBe(526);
        expect(XIMCommand.BB_CONFACCOUNT).toBe(905);
      });
    });

    describe('System commands (SV_*, NB_*, etc.)', () => {
      it('should have correct system service commands', () => {
        expect(XIMCommand.NB_LOAD).toBe(132);
        expect(XIMCommand.CHG_USER).toBe(135);
        expect(XIMCommand.RETURNCOMMAND).toBe(136);
        expect(XIMCommand.ZMODEMSEND).toBe(137);
        expect(XIMCommand.ZMODEMRECEIVE).toBe(138);
        expect(XIMCommand.EXPRESS_VERSION).toBe(152);
      });

      it('should have correct SV_* commands', () => {
        expect(XIMCommand.SV_UNICONIFY).toBe(153);
        expect(XIMCommand.SV_SYSOPLOG).toBe(154);
        expect(XIMCommand.SV_LOCALLOG).toBe(155);
        expect(XIMCommand.SV_ACCOUNTS).toBe(156);
        expect(XIMCommand.SV_CHAT).toBe(157);
        expect(XIMCommand.SV_NODEOFFHOOK).toBe(158);
        expect(XIMCommand.SV_EXITNODE).toBe(159);
        expect(XIMCommand.SV_INITMODEM).toBe(160);
        expect(XIMCommand.SV_WHATSUP).toBe(161);
        expect(XIMCommand.ENVSTAT).toBe(163);
        expect(XIMCommand.SV_INSTANT).toBe(170);
        expect(XIMCommand.SV_RESERVE).toBe(171);
        expect(XIMCommand.SV_CHATTOGGLE).toBe(172);
        expect(XIMCommand.SV_TOPS).toBe(173);
        expect(XIMCommand.SV_AESHELL).toBe(174);
        expect(XIMCommand.SV_START).toBe(176);
        expect(XIMCommand.SV_NEWMSG).toBe(177);
        expect(XIMCommand.SV_QUIETNODE).toBe(178);
        expect(XIMCommand.SV_SETNRAMS).toBe(179);
        expect(XIMCommand.SV_RESERVENODE).toBe(180);
        expect(XIMCommand.SV_NODE_LOCK).toBe(181);
        expect(XIMCommand.SV_ACPALERT).toBe(182);
        expect(XIMCommand.SV_INCOMING_MSG).toBe(183);
        expect(XIMCommand.SV_KICKUSER).toBe(184);
        expect(XIMCommand.SV_STARTNODE).toBe(185);
        expect(XIMCommand.SV_INFO).toBe(199);
      });

      it('should have correct network commands', () => {
        expect(XIMCommand.INCOMING_TELNET).toBe(200);
        expect(XIMCommand.INCOMING_FTP).toBe(201);
      });

      it('should have additional SV_* commands', () => {
        expect(XIMCommand.SV_ACPSHUTDOWN).toBe(202);
        expect(XIMCommand.SV_CONFMAINT).toBe(203);
        expect(XIMCommand.SV_VIEWLOGS).toBe(204);
        expect(XIMCommand.SV_TOGGLESTATUS).toBe(205);
        expect(XIMCommand.SV_TIMEINCREASE).toBe(206);
        expect(XIMCommand.SV_TIMEDECREASE).toBe(207);
        expect(XIMCommand.SV_CAPTURE).toBe(208);
        expect(XIMCommand.SV_DISPLAYFILE).toBe(209);
        expect(XIMCommand.SV_GRANTTEMP).toBe(210);
      });
    });

    describe('Keyboard/Arrow commands', () => {
      it('should have keyboard input commands', () => {
        expect(XIMCommand.GETKEY).toBe(500);
        expect(XIMCommand.RAWARROW).toBe(501);
        expect(XIMCommand.CHAIN).toBe(502);
      });
    });

    describe('Node/Modem info', () => {
      it('should have node information commands', () => {
        expect(XIMCommand.NODE_DEVICE).toBe(503);
        expect(XIMCommand.NODE_UNIT).toBe(504);
        expect(XIMCommand.NODE_BAUD).toBe(505);
        expect(XIMCommand.NODE_NUMBER).toBe(506);
        expect(XIMCommand.NODE_BAUDRATE).toBe(516);
      });
    });

    describe('Command routing', () => {
      it('should have private command routing', () => {
        expect(XIMCommand.PRV_COMMAND).toBe(508);
        expect(XIMCommand.PRV_GROUP).toBe(509);
      });
    });

    describe('Multicom/Semaphore', () => {
      it('should have multicom command', () => {
        expect(XIMCommand.MULTICOM).toBe(531);
      });
    });

    describe('Account/ConfDB helpers', () => {
      it('should have account management commands', () => {
        expect(XIMCommand.LOAD_ACCOUNT).toBe(532);
        expect(XIMCommand.SAVE_ACCOUNT).toBe(533);
        expect(XIMCommand.SAVE_CONFDB).toBe(534);
        expect(XIMCommand.LOAD_CONFDB).toBe(535);
        expect(XIMCommand.GET_CONFNUM).toBe(536);
        expect(XIMCommand.SEARCH_ACCOUNT).toBe(537);
        expect(XIMCommand.APPEND_ACCOUNT).toBe(538);
        expect(XIMCommand.LAST_ACCOUNTNUM).toBe(539);
        expect(XIMCommand.MOD_TYPE).toBe(540);
      });

      it('should have batch transfer commands', () => {
        expect(XIMCommand.BATCHZMODEMSEND).toBe(542);
      });

      it('should have ACP and editor commands', () => {
        expect(XIMCommand.ACP_COMMAND).toBe(544);
        expect(XIMCommand.EDITOR_STRUCT).toBe(546);
        expect(XIMCommand.BYPASS_CSI_CHECK).toBe(547);
        expect(XIMCommand.SENTBY).toBe(548);
      });
    });

    describe('Override/control commands', () => {
      it('should have override commands', () => {
        expect(XIMCommand.SETOVERIDE).toBe(549);
        expect(XIMCommand.FULLEDIT).toBe(550);
        expect(XIMCommand.SETMCIOFF).toBe(551);
      });
    });

    describe('Message base commands', () => {
      it('should have message base commands', () => {
        expect(XIMCommand.GET_CUSTOM_MSGBASE_PARAM1).toBe(600);
        expect(XIMCommand.GET_CUSTOM_MSGBASE_PARAM2).toBe(601);
        expect(XIMCommand.LAST_READ).toBe(602);
        expect(XIMCommand.LAST_SCANNED).toBe(603);
        expect(XIMCommand.MSGBASE_LOC).toBe(604);
        expect(XIMCommand.GET_CUSTOM_MSGBASE_MENUCMD).toBe(605);
        expect(XIMCommand.UNKNOWN4).toBe(607);
        expect(XIMCommand.QUICK_KEY).toBe(608);
      });
    });

    describe('Serial I/O and file transfer', () => {
      it('should have serial I/O commands', () => {
        expect(XIMCommand.SER_INOUT).toBe(609);
      });

      it('should have AXNet file transfer commands', () => {
        expect(XIMCommand.AXNET_RECEIVE).toBe(610);
        expect(XIMCommand.AXNET_SEND).toBe(611);
        expect(XIMCommand.MEMCONF).toBe(612);
        expect(XIMCommand.SET_SERSHARED).toBe(613);
      });

      it('should have network transfer placeholders', () => {
        expect(XIMCommand.NETUPLOAD).toBe(10001);
        expect(XIMCommand.NETDOWNLOAD).toBe(10002);
      });
    });

    describe('Conference access', () => {
      it('should have conference access command', () => {
        expect(XIMCommand.CONF_ACCESS).toBe(614);
      });
    });

    describe('Password/Display control', () => {
      it('should have password and display commands', () => {
        expect(XIMCommand.PASSWORD_HASH).toBe(615);
        expect(XIMCommand.GET_GNSFLAG).toBe(616);
        expect(XIMCommand.DISPLAY_FILE).toBe(617);
        expect(XIMCommand.CHECK_TO_DISPLAY).toBe(618);
        expect(XIMCommand.CHOOSE_NAME).toBe(619);
        expect(XIMCommand.SET_FILEATTACH).toBe(620);
        expect(XIMCommand.INTERPRET_MCI).toBe(621);
        expect(XIMCommand.GET_XIMPORT).toBe(622);
        expect(XIMCommand.GET_MENU_COMMAND_CHAR).toBe(623);
        expect(XIMCommand.FILE_REQUEST).toBe(624);
        expect(XIMCommand.DISABLE_FILE_ATTACH).toBe(625);
      });

      it('should have QWK and misc commands', () => {
        expect(XIMCommand.QWKZOOM_REC).toBe(626);
        expect(XIMCommand.REL_CONF).toBe(627);
        expect(XIMCommand.RETURNCOMMAND2).toBe(628);
        expect(XIMCommand.CANCEL_TRANSFER_OFFHOOK).toBe(629);
        expect(XIMCommand.CLEAR_OLM_QUEUE).toBe(630);
        expect(XIMCommand.QUIET_DOWNLOAD).toBe(631);
        expect(XIMCommand.CHECK_PLAYPEN_EXISTS).toBe(632);
        expect(XIMCommand.EXT_LOAD_ACCOUNT).toBe(633);
        expect(XIMCommand.EXT_SAVE_ACCOUNT).toBe(634);
        expect(XIMCommand.EXT_CHOOSE_NAME).toBe(635);
        expect(XIMCommand.CHECK_REALNAME).toBe(636);
      });
    });

    describe('AXNet outbound', () => {
      it('should have AXNet outbound command', () => {
        expect(XIMCommand.XNET_OUTBOUND).toBe(640);
      });
    });

    describe('Console/Telnet commands', () => {
      it('should have console and telnet commands', () => {
        expect(XIMCommand.CON_CURSOR).toBe(705);
        expect(XIMCommand.TELNET_CONNECT).toBe(706);
        expect(XIMCommand.GET_CMD_TOOLTYPE).toBe(707);
        expect(XIMCommand.TELNET_USERNAME_PROMPT).toBe(708);
        expect(XIMCommand.TELNET_USERNAME).toBe(709);
        expect(XIMCommand.TELNET_PASSWORD_PROMPT).toBe(710);
        expect(XIMCommand.TELNET_PASSWORD).toBe(711);
      });
    });

    describe('Playpen/Iconify/Logon', () => {
      it('should have playpen and logon commands', () => {
        expect(XIMCommand.SIG_PLAYPEN).toBe(908);
        expect(XIMCommand.ICONIFYQUERY).toBe(909);
        expect(XIMCommand.LOGON_UNAME).toBe(910);
        expect(XIMCommand.LOGON_UPASS).toBe(911);
        expect(XIMCommand.SIG_LI).toBe(912);
      });
    });

    describe('Maximum command value', () => {
      it('should have MAX_CMD', () => {
        expect(XIMCommand.MAX_CMD).toBe(1003);
      });
    });
  });

  describe('ArrowKeyCodes', () => {
    it('should have correct arrow key codes from axconsts.e', () => {
      expect(ArrowKeyCodes.LEFTARROW).toBe(2);
      expect(ArrowKeyCodes.RIGHTARROW).toBe(3);
      expect(ArrowKeyCodes.UPARROW).toBe(4);
      expect(ArrowKeyCodes.DOWNARROW).toBe(5);
    });

    it('should be immutable (as const)', () => {
      // TypeScript enforces this at compile time, but verify structure exists
      expect(ArrowKeyCodes).toBeDefined();
      expect(Object.keys(ArrowKeyCodes)).toHaveLength(4);
    });
  });

  describe('ENVStatus', () => {
    it('should have all environment status values from aedoor.i', () => {
      expect(ENVStatus.ENV_DROPPED).toBe(-1);
      expect(ENVStatus.ENV_IDLE).toBe(0);
      expect(ENVStatus.ENV_DOWNLOADING).toBe(1);
      expect(ENVStatus.ENV_UPLOADING).toBe(2);
      expect(ENVStatus.ENV_DOORS).toBe(3);
      expect(ENVStatus.ENV_MAIL).toBe(4);
      expect(ENVStatus.ENV_STATS).toBe(5);
      expect(ENVStatus.ENV_ACCOUNT).toBe(6);
      expect(ENVStatus.ENV_ZOOM).toBe(7);
      expect(ENVStatus.ENV_FILES).toBe(8);
      expect(ENVStatus.ENV_BULLETINS).toBe(9);
      expect(ENVStatus.ENV_VIEWING).toBe(10);
      expect(ENVStatus.ENV_LOGON).toBe(11);
      expect(ENVStatus.ENV_LOGOFF).toBe(12);
      expect(ENVStatus.ENV_SYSOP).toBe(13);
      expect(ENVStatus.ENV_SHELL).toBe(14);
      expect(ENVStatus.ENV_EMACS).toBe(15);
      expect(ENVStatus.ENV_JOIN).toBe(16);
      expect(ENVStatus.ENV_CHAT).toBe(17);
      expect(ENVStatus.ENV_NOTACTIVE).toBe(18);
      expect(ENVStatus.ENV_REQ_CHAT).toBe(19);
      expect(ENVStatus.ENV_CONNECT).toBe(20);
      expect(ENVStatus.ENV_LOGGINGON).toBe(21);
      expect(ENVStatus.ENV_AWAITCONNECT).toBe(22);
      expect(ENVStatus.ENV_SCANNING).toBe(23);
      expect(ENVStatus.ENV_SHUTDOWN).toBe(24);
      expect(ENVStatus.ENV_MULTICHAT).toBe(25);
      expect(ENVStatus.ENV_SUSPEND).toBe(26);
      expect(ENVStatus.ENV_RESERVE).toBe(27);
    });

    it('should be immutable (as const)', () => {
      expect(ENVStatus).toBeDefined();
      expect(Object.keys(ENVStatus)).toHaveLength(29);
    });
  });

  describe('AEDoorError', () => {
    it('should have all AEDoor error codes from aedoor.i', () => {
      expect(AEDoorError.AEERR_ABORTED).toBe(0);
      expect(AEDoorError.AEERR_NONODE).toBe(-1);
      expect(AEDoorError.AEERR_TIMEOUT).toBe(-2);
      expect(AEDoorError.AEERR_NOCARRIER).toBe(-2); // Same as timeout
      expect(AEDoorError.AEERR_NOMEM).toBe(-3);
      expect(AEDoorError.AEERR_BUFFOVER).toBe(-4);
    });

    it('should have TIMEOUT and NOCARRIER as aliases', () => {
      expect(AEDoorError.AEERR_TIMEOUT).toBe(AEDoorError.AEERR_NOCARRIER);
    });

    it('should be immutable (as const)', () => {
      expect(AEDoorError).toBeDefined();
      expect(Object.keys(AEDoorError)).toHaveLength(6);
    });
  });

  describe('DataDirection', () => {
    it('should have correct data direction convention', () => {
      expect(DataDirection.READIT).toBe(1);  // Door reads FROM BBS
      expect(DataDirection.WRITEIT).toBe(0); // Door writes TO BBS
    });

    it('should be immutable (as const)', () => {
      expect(DataDirection).toBeDefined();
      expect(Object.keys(DataDirection)).toHaveLength(2);
    });
  });

  describe('FieldLengths', () => {
    it('should have correct field length limits from xdoorcmd.def', () => {
      expect(FieldLengths.DT_NAME).toBe(30);
      expect(FieldLengths.DT_PASSWORD).toBe(8);
      expect(FieldLengths.DT_LOCATION).toBe(29);
      expect(FieldLengths.DT_PHONENUMBER).toBe(12);
      expect(FieldLengths.DT_SLOTNUMBER).toBe(10);
      expect(FieldLengths.DT_SECSTATUS).toBe(10);
      expect(FieldLengths.DT_EXPERT).toBe(1);
      expect(FieldLengths.DT_LINELENGTH).toBe(10);
      expect(FieldLengths.ACTIVE_NODES).toBe(9);
      expect(FieldLengths.DT_CONFACCESS).toBe(9);
      expect(FieldLengths.DT_CONFACCESS2).toBe(25);
      expect(FieldLengths.DT_REALNAME).toBe(26);
      expect(FieldLengths.BB_CONFNAME).toBe(58);
      expect(FieldLengths.BB_CONFLOCAL).toBe(58);
      expect(FieldLengths.BB_LOCAL).toBe(40);
      expect(FieldLengths.BB_MAINLINE).toBe(190);
      expect(FieldLengths.BB_STATUS).toBe(10);
      expect(FieldLengths.RETURNCOMMAND).toBe(190);
      expect(FieldLengths.BB_CHATFLAG).toBe(3);
      expect(FieldLengths.DT_STAMP).toBe(190);
      expect(FieldLengths.EXPRESS_VERSION).toBe(10);
      expect(FieldLengths.GENERIC_STRING).toBe(198);
    });

    it('should be immutable (as const)', () => {
      expect(FieldLengths).toBeDefined();
      expect(Object.keys(FieldLengths)).toHaveLength(22);
    });

    it('should have GENERIC_STRING as maximum embedded string', () => {
      // GENERIC_STRING represents MESSAGE_STRING_CAPACITY
      expect(FieldLengths.GENERIC_STRING).toBe(198);
    });
  });

  describe('Critical command codes for common door operations', () => {
    it('should have correct registration sequence codes', () => {
      // Typical door startup: JH_REGISTER, then data queries
      expect(XIMCommand.JH_REGISTER).toBe(1);
      expect(XIMCommand.DT_NAME).toBe(100);
      expect(XIMCommand.DT_SLOTNUMBER).toBe(104);
      expect(XIMCommand.EXPRESS_VERSION).toBe(152);
      expect(XIMCommand.ENVSTAT).toBe(163);
    });

    it('should have correct I/O command codes', () => {
      // Most common door operations
      expect(XIMCommand.JH_WRITE).toBe(3);  // Write to terminal
      expect(XIMCommand.JH_SM).toBe(4);     // Send message
      expect(XIMCommand.JH_HK).toBe(6);     // Hotkey input
      expect(XIMCommand.JH_LI).toBe(0);     // Line input
    });

    it('should have correct BBS data query codes', () => {
      // Common BBS information queries
      expect(XIMCommand.BB_CONFNAME).toBe(126);
      expect(XIMCommand.BB_CONFNUM).toBe(510);
      expect(XIMCommand.BB_MAINLINE).toBe(131);
      expect(XIMCommand.BB_NONSTOPTEXT).toBe(525);
    });

    it('should have correct shutdown codes', () => {
      expect(XIMCommand.JH_SHUTDOWN).toBe(2);
      expect(XIMCommand.RETURNCOMMAND).toBe(136);
      expect(XIMCommand.CHAIN).toBe(502);
    });
  });

  describe('isCommandInfoRequestCommand routing (regression: 551/707 mislabel)', () => {
    it('admits GET_CMD_TOOLTYPE (707) so tooltype lookups reach their handler', () => {
      expect(XIMCommand.GET_CMD_TOOLTYPE).toBe(707);
      expect(isCommandInfoRequestCommand(XIMCommand.GET_CMD_TOOLTYPE)).toBe(true);
    });

    it('admits GET_CUSTOM_MSGBASE_MENUCMD (605)', () => {
      expect(XIMCommand.GET_CUSTOM_MSGBASE_MENUCMD).toBe(605);
      expect(isCommandInfoRequestCommand(XIMCommand.GET_CUSTOM_MSGBASE_MENUCMD)).toBe(true);
    });

    it('does NOT admit SETMCIOFF (551) — it is a system command handled upstream', () => {
      expect(XIMCommand.SETMCIOFF).toBe(551);
      expect(isCommandInfoRequestCommand(551)).toBe(false);
    });

    it('does not admit unrelated commands', () => {
      expect(isCommandInfoRequestCommand(XIMCommand.JH_SM)).toBe(false);
      expect(isCommandInfoRequestCommand(525)).toBe(false);
    });
  });
});
