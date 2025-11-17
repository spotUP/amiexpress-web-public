*****************************************************************************
*****************************************************************************
* START: Storage file v002 structure.                                       *
*****************************************************************************
*****************************************************************************
		Even
v2_S_Vers	Dc.b	"*SALv002"		File Version (At Start)
v2_S_Vers_Len	Equ	*-v2_S_Vers
		Dc.b	0			Null for search
		Even
;---------------------------------------------------------------------------;
;- Daily Statistics in Storage File ----------------------------------------;
;---------------------------------------------------------------------------;
		RSReset
v2_SD_Date	Rs.l	1		Date (Days Since 1978)
v2_SD_Calls	Rs.w	1		Callers
v2_SD_UpKBytes	Rs.l	1		KBytes Uploaded
v2_SD_UpFiles	Rs.w	1		Files Uploaded
v2_SD_UpFails	Rs.w	1		Upload Fails (Not implemented)
v2_SD_DnKBytes	Rs.l	1		KBytes Downloaded
v2_SD_DnFiles	Rs.w	1		Files Downloaded
v2_SD_DnFails	Rs.w	1		Download Fails (Not implemented)
v2_SD_UsedMins	Rs.l	1		Minutes Of Usage
v2_SD_NewUsers	Rs.w	1		New Users
v2_SD_Hacks	Rs.w	1		Hacks
v2_SD_Drops	Rs.w	1		Drop Carriers
v2_SD_Pages	Rs.w	1		Pages
v2_SD_RESERVED	Rs.b	40		40 CHARS RESERVED FOR ENHANCEMENTS
v2_SD_Len	Equ	__RS		Length
;---------------------------------------------------------------------------;
;- Individual Users in Storage File ----------------------------------------;
;---------------------------------------------------------------------------;
		RSReset
v2_SU_Name	Rs.b	18		"[-----USER-----] ",0	User name
v2_SU_Location	Rs.b	21		"[----LOCATION!----] ",0 Location
v2_SU_Node	Rs.b	1		"0"			Node #
v2_SU_Usage	Rs.b	6		"-:-- ",0		Time online
v2_SU_UpKBytes	Rs.b	6		"   0 ",0		Upl KBytes
v2_SU_UpFiles	Rs.b	6		"   0 ",0		Upl Files
v2_SU_DnKBytes	Rs.b	6		"   0",10,0		Dnl KBytes
v2_SU_DnFiles	Rs.b	6		"   0",10,0		Dnl Files
v2_SU_OnTime	Rs.b	10		"--:--:-- ",0		Logon Time
v2_SU_OffTime	Rs.b	10		"--:--:-- ",0		Logoff Time
v2_SU_AvCPS	Rs.b	6		"   0 ",0		Avg CPS
;;;;;;;;;;;;;;;	(Average-CPS is NOT IMPLEMENTED)
v2_SU_Baud	Rs.b	5		"14400",0		Baud Rate
v2_SU_Flag_1	Rs.b	1		0			Flag #1
v2_SU_Flag_2	Rs.b	1		0			Flag #2
v2_SU_Flag_3	Rs.b	1		0			Flag #3
v2_SU_Reserved	Rs.b	40		40 CHARS RESERVED FOR ENHANCEMENTS
v2_SU_Len	Equ	__RS		Length
;---------------------------------------------------------------------------;
;- Formats of Binary/Boleen Flag bytes in User Structures ------------------;
;---------------------------------------------------------------------------;
;- Flag #1 -----------------------------------------------------------------;
;---------------------------------------------------------------------------;
v2_SU_F1_New	Equ	0		New User?
v2_SU_F1_Hack	Equ	1		Hacking?
v2_SU_F1_Drop	Equ	2		Dropped Carrier?
v2_SU_F1_Page	Equ	3		Paged?
v2_SU_F1_SysC	Equ	4		Used Sysop Command(s)?
v2_SU_F1_Locl	Equ	5		Local Call?
v2_SU_F1_ISDN	Equ	6		ISDN Call?
;---------------------------------------------------------------------------;
;- Flag #2 -----------------------------------------------------------------;
;---------------------------------------------------------------------------;
v2_SU_F2_Upld	Equ	0		Uploaded?
v2_SU_F2_UpFl	Equ	1		Failed an Upload?
v2_SU_F2_Dnld	Equ	2		Downloaded?
v2_SU_F2_DnFl	Equ	3		Failed a Download?
;---------------------------------------------------------------------------;
*****************************************************************************
*****************************************************************************
;===========================================================================;
		RsReset
v2_StorFil	Equ	__RS		;------- Storage File Memory -------;
;===========================================================================;
v2_SV_Start		Rs.b	v2_S_Vers_Len	File Version
v2_SX_Clear_Date	Rs.l	1		Date that the file was cleared/made.
v2_SX_RESERVED		Rs.b	36		36 CHARS RESERVED FOR ENHANCEMENTS
;---------------------------------------------------------------------------;
;- Daily Stats Structures [8] ----------------------------------------------;
;---------------------------------------------------------------------------;
v2_SD0_Base	Rs.b	v2_SD_Len		Day #0 (Today)
v2_SD1_Base	Rs.b	v2_SD_Len		Day #1 -.
v2_SD2_Base	Rs.b	v2_SD_Len		Day #2	|
v2_SD3_Base	Rs.b	v2_SD_Len		Day #3	|
v2_SD4_Base	Rs.b	v2_SD_Len		Day #4	|- One Full Week.
v2_SD5_Base	Rs.b	v2_SD_Len		Day #5	|
v2_SD6_Base	Rs.b	v2_SD_Len		Day #6	|
v2_SD7_Base	Rs.b	v2_SD_Len		Day #7 -'
;---------------------------------------------------------------------------;
;- Records Structure -------------------------------------------------------;
;---------------------------------------------------------------------------;
v2_SR_Calls		Rs.w	1		Callers
v2_SR_Calls_D		Rs.l	1		Date of Above
v2_SR_UpKBytes		Rs.l	1		KBytes Uploaded
v2_SR_UpKBytes_D	Rs.l	1		Date of Above
v2_SR_UpFiles		Rs.w	1		Files Uploaded
v2_SR_UpFiles_D		Rs.l	1		Date of Above
v2_SR_UpFails		Rs.w	1		Upload Fails  (Not Implemented)
v2_SR_UpFails_D		Rs.l	1		Date of Above (Not Implemented)
v2_SR_DnKBytes		Rs.l	1		KBytes Downloaded
v2_SR_DnKBytes_D	Rs.l	1		Date of Above
v2_SR_DnFiles		Rs.w	1		Files Downloaded
v2_SR_DnFiles_D		Rs.l	1		Date of Above
v2_SR_DnFails		Rs.w	1		Download Fails (Not Implemented)
v2_SR_DnFails_D		Rs.l	1		Date of Above  (Not Implemented)
v2_SR_UsedMins		Rs.l	1		Minutes Of Useage
v2_SR_UsedMins_D	Rs.l	1		Date of Above
v2_SR_NewUsers		Rs.w	1		New Users
v2_SR_NewUsers_D	Rs.l	1		Date of Above
v2_SR_Hacks		Rs.w	1		Hacks
v2_SR_Hacks_D		Rs.l	1		Date of Above
v2_SR_Drops		Rs.w	1		Drop Carriers
v2_SR_Drops_D		Rs.l	1		Date of Above
v2_SR_Pages		Rs.w	1		Pages
v2_SR_Pages_D		Rs.l	1		Date of Above
v2_SR_RESERVED		Rs.b	40		40 CHARS RESERVED FOR ENHANCEMENTS
v2_SR_Len		Equ	__RS-v2_SR_Calls	Length
;---------------------------------------------------------------------------;
;- Individual User Entries [20] --------------------------------------------;
;---------------------------------------------------------------------------;
v2_SU01_Base	Rs.b	v2_SU_Len		User #1
v2_SU02_Base	Rs.b	v2_SU_Len		User #2
v2_SU03_Base	Rs.b	v2_SU_Len		User #3
v2_SU04_Base	Rs.b	v2_SU_Len		User #4
v2_SU05_Base	Rs.b	v2_SU_Len		User #5
v2_SU06_Base	Rs.b	v2_SU_Len		User #6
v2_SU07_Base	Rs.b	v2_SU_Len		User #7
v2_SU08_Base	Rs.b	v2_SU_Len		User #8
v2_SU09_Base	Rs.b	v2_SU_Len		User #9
v2_SU10_Base	Rs.b	v2_SU_Len		User #10
v2_SU11_Base	Rs.b	v2_SU_Len		User #11
v2_SU12_Base	Rs.b	v2_SU_Len		User #12
v2_SU13_Base	Rs.b	v2_SU_Len		User #13
v2_SU14_Base	Rs.b	v2_SU_Len		User #14
v2_SU15_Base	Rs.b	v2_SU_Len		User #15
v2_SU16_Base	Rs.b	v2_SU_Len		User #16
v2_SU17_Base	Rs.b	v2_SU_Len		User #17
v2_SU18_Base	Rs.b	v2_SU_Len		User #18
v2_SU19_Base	Rs.b	v2_SU_Len		User #19
v2_SU20_Base	Rs.b	v2_SU_Len		User #20
;---------------------------------------------------------------------------;
v2_S_Size	Equ	__RS-v2_StorFil	Size of Storage File.
*****************************************************************************
*****************************************************************************
* END: Storage file v002 structure.                                         *
*****************************************************************************
*****************************************************************************

*****************************************************************************
*****************************************************************************
* START: Storage file v003 structure.                                       *
*****************************************************************************
*****************************************************************************
	Even	S_Vers must be even.
v3_S_Vers	Dc.b	"*SALv003"			File Version (At Start)
v3_S_Vers_Len	Equ	*-v3_S_Vers
	Dc.b	0			Nullterm for Search routine.
;---------------------------------------------------------------------------;
** New-Storage File Pieces **************************************************
;---------------------------------------------------------------------------;
	Even
v3_S_Usr
v3_S1	Dc.b	"Nobody                        ",0
v3_S1_Len	Equ	*-v3_S1
v3_SU_Name_Len	Equ	v3_S1_Len-1
v3_S2	Dc.b	"Nowhere                      ",0
v3_S2_Len	Equ	*-v3_S2
v3_SU_Location_Len	Equ	v3_S2_Len-1
v3_S3	Dc.b	"0",0
v3_S3_Len	Equ	*-v3_S3
v3_S4	Dc.b	" 0",0
v3_S4_Len	Equ	*-v3_S4
v3_S5	Dc.b	"-:--",0
v3_S5_Len	Equ	*-v3_S5
v3_S6	Dc.b	"   0",0
v3_S6_Len	Equ	*-v3_S6
v3_S7	Dc.b	"   0",0
v3_S7_Len	Equ	*-v3_S7
v3_S8	Dc.b	"   0",0
v3_S8_Len	Equ	*-v3_S8
v3_S9	Dc.b	"   0",0
v3_S9_Len	Equ	*-v3_S9
v3_S10	Dc.b	"--:--:--",0
v3_S10_Len	Equ	*-v3_S10
v3_S11	Dc.b	"--:--:--",0
	Even	Average CPS must be even.
v3_S11_Len	Equ	*-v3_S11
v3_S12	Dc.b	"   0",0
	Even	Baud Rate must be even.
v3_S12_Len	Equ	*-v3_S12
v3_S13	Dc.b	"-----",0
v3_S13_Len	Equ	*-v3_S13
v3_S14	Dc.b	0
v3_S14_Len	Equ	*-v3_S14
v3_S15	Dc.b	0
v3_S15_Len	Equ	*-v3_S15
v3_S16	Dc.b	0
	ODD	v3_S_Usr		Make next ODDly aligned in relation to S_Usr
v3_S16_Len	Equ	*-v3_S16
v3_S17	Dc.b	"DD-MMM-YY",0	(Because "MMM-" MUST be even...)
	Even
v3_S17_Len	Equ	*-v3_S17
v3_S18	Ds.b	40
v3_S18_Len	Equ	*-v3_S18
;---------------------------------------------------------------------------;
;---------------------------------------------------------------------------;
;;;;SCR	Dc.b	"   0",0			Actual CPS "Score"
;;;;	Dc.b	0				Even
;;;;	Dc.w	0				Pointer to Name, etc
v3_SCR_Len	Equ	8
v3_SC_Ptr	Equ	6

v3_S_CPS
v3_SC1	Dc.b	"Nobody                        ",0
v3_SC1_Len	Equ	*-v3_SC1
v3_SC_Name_Len	Equ	v3_SC1_Len-1
v3_SC2	Dc.b	"Nowhere                      ",0
v3_SC2_Len	Equ	*-v3_SC2
v3_SC_Location_Len	Equ	v3_SC2_Len-1
v3_SC3	Dc.b	"DDD, DD-MMM-YY",0
	Even	Filename must be even.
v3_SC3_Len	Equ	*-v3_SC3
v3_STD_Filename_String
v3_SC4	Dc.b	"[-FILENAME-]",0
v3_SC_FileName_Len	Equ	(*-v3_SC4)-1
	Even	Baud Rate must be even.
v3_STD_Filename_Length	Equ	*-v3_STD_Filename_String
v3_SC4_Len	Equ	*-v3_SC4
v3_SC5	Dc.b	"-----",0
	EVEN
v3_SC5_Len	Equ	*-v3_SC5
v3_SC6	Dc.b	"   0k",0
v3_SC6_Len	Equ	*-v3_SC6
v3_SC7	Dc.b	0
	Even	MINS must be even.
v3_SC7_Len	Equ	*-v3_SC7
v3_SC8	Dc.b	"   0",0
	Even	SECS must be even.
v3_SC8_Len	Equ	*-v3_SC8
v3_SC9	Dc.b	" 0",0
	Even	EFFY must be even.
v3_SC9_Len	Equ	*-v3_SC9
v3_SCA	Dc.b	"   0%",0
	Even	RESERVED Bytes must be even.
v3_SCA_Len	Equ	*-v3_SCA
v3_SCB	Ds.b	20
v3_SCB_Len	Equ	*-v3_SCB
****************************************************************************
* Structure Stuff...                                                        *
*****************************************************************************
;---------------------------------------------------------------------------;
;- Daily Statistics in Storage File ----------------------------------------;
;---------------------------------------------------------------------------;
		RSReset
v3_SD_Date	Rs.l	1		Number of days since Jan 1978.
v3_SD_DayName	Rs.b	4		Three letter day name, null term.
v3_SD_AsciiDate	Rs.b	10		"DD-MMM-YY",0 date.
v3_SD_Calls	Rs.w	1		Callers
v3_SD_UpKBytes	Rs.l	1		KBytes Uploaded
v3_SD_UpFiles	Rs.w	1		Files Uploaded
v3_SD_UpFails	Rs.w	1		Upload Fails (Not implemented)
v3_SD_DnKBytes	Rs.l	1		KBytes Downloaded
v3_SD_DnFiles	Rs.w	1		Files Downloaded
v3_SD_DnFails	Rs.w	1		Download Fails (Not implemented)
v3_SD_UsedMins	Rs.l	1		Minutes Of Usage
v3_SD_NewUsers	Rs.w	1		New Users
v3_SD_Hacks	Rs.w	1		Hacks
v3_SD_Drops	Rs.w	1		Drop Carriers
v3_SD_Pages	Rs.w	1		Pages
v3_SD_H00_Calls	Rs.w	1		00:00 to 00:59 - Nº Calls.
v3_SD_H00_Users	Rs.w	1		"":"" to "":"" - Nº Users in Hour.
v3_SD_H00_Mins	Rs.w	1		00:00 to 00:59 - Minutes of Usage
v3_SD_H01_Calls	Rs.w	1		01:00 to 01:59 - Nº Calls.
v3_SD_H01_Users	Rs.w	1		"":"" to "":"" - Nº Users in Hour.
v3_SD_H01_Mins	Rs.w	1		01:00 to 01:59 - Minutes of Usage
v3_SD_H02_Calls	Rs.w	1		02:00 to 02:59 - Nº Calls.
v3_SD_H02_Users	Rs.w	1		"":"" to "":"" - Nº Users in Hour.
v3_SD_H02_Mins	Rs.w	1		02:00 to 02:59 - Minutes of Usage
v3_SD_H03_Calls	Rs.w	1		03:00 to 03:59 - Nº Calls.
v3_SD_H03_Users	Rs.w	1		"":"" to "":"" - Nº Users in Hour.
v3_SD_H03_Mins	Rs.w	1		03:00 to 03:59 - Minutes of Usage
v3_SD_H04_Calls	Rs.w	1		04:00 to 04:59 - Nº Calls.
v3_SD_H04_Users	Rs.w	1		"":"" to "":"" - Nº Users in Hour.
v3_SD_H04_Mins	Rs.w	1		04:00 to 04:59 - Minutes of Usage
v3_SD_H05_Calls	Rs.w	1		05:00 to 05:59 - Nº Calls.
v3_SD_H05_Users	Rs.w	1		"":"" to "":"" - Nº Users in Hour.
v3_SD_H05_Mins	Rs.w	1		05:00 to 05:59 - Minutes of Usage
v3_SD_H06_Calls	Rs.w	1		06:00 to 06:59 - Nº Calls.
v3_SD_H06_Users	Rs.w	1		"":"" to "":"" - Nº Users in Hour.
v3_SD_H06_Mins	Rs.w	1		06:00 to 06:59 - Minutes of Usage
v3_SD_H07_Calls	Rs.w	1		07:00 to 07:59 - Nº Calls.
v3_SD_H07_Users	Rs.w	1		"":"" to "":"" - Nº Users in Hour.
v3_SD_H07_Mins	Rs.w	1		07:00 to 07:59 - Minutes of Usage
v3_SD_H08_Calls	Rs.w	1		08:00 to 08:59 - Nº Calls.
v3_SD_H08_Users	Rs.w	1		"":"" to "":"" - Nº Users in Hour.
v3_SD_H08_Mins	Rs.w	1		08:00 to 08:59 - Minutes of Usage
v3_SD_H09_Calls	Rs.w	1		09:00 to 09:59 - Nº Calls.
v3_SD_H09_Users	Rs.w	1		"":"" to "":"" - Nº Users in Hour.
v3_SD_H09_Mins	Rs.w	1		09:00 to 09:59 - Minutes of Usage
v3_SD_H10_Calls	Rs.w	1		10:00 to 10:59 - Nº Calls.
v3_SD_H10_Users	Rs.w	1		"":"" to "":"" - Nº Users in Hour.
v3_SD_H10_Mins	Rs.w	1		10:00 to 10:59 - Minutes of Usage
v3_SD_H11_Calls	Rs.w	1		11:00 to 11:59 - Nº Calls.
v3_SD_H11_Users	Rs.w	1		"":"" to "":"" - Nº Users in Hour.
v3_SD_H11_Mins	Rs.w	1		11:00 to 11:59 - Minutes of Usage
v3_SD_H12_Calls	Rs.w	1		12:00 to 12:59 - Nº Calls.
v3_SD_H12_Users	Rs.w	1		"":"" to "":"" - Nº Users in Hour.
v3_SD_H12_Mins	Rs.w	1		12:00 to 12:59 - Minutes of Usage
v3_SD_H13_Calls	Rs.w	1		13:00 to 13:59 - Nº Calls.
v3_SD_H13_Users	Rs.w	1		"":"" to "":"" - Nº Users in Hour.
v3_SD_H13_Mins	Rs.w	1		13:00 to 13:59 - Minutes of Usage
v3_SD_H14_Calls	Rs.w	1		14:00 to 14:59 - Nº Calls.
v3_SD_H14_Users	Rs.w	1		"":"" to "":"" - Nº Users in Hour.
v3_SD_H14_Mins	Rs.w	1		14:00 to 14:59 - Minutes of Usage
v3_SD_H15_Calls	Rs.w	1		15:00 to 15:59 - Nº Calls.
v3_SD_H15_Users	Rs.w	1		"":"" to "":"" - Nº Users in Hour.
v3_SD_H15_Mins	Rs.w	1		15:00 to 15:59 - Minutes of Usage
v3_SD_H16_Calls	Rs.w	1		16:00 to 16:59 - Nº Calls.
v3_SD_H16_Users	Rs.w	1		"":"" to "":"" - Nº Users in Hour.
v3_SD_H16_Mins	Rs.w	1		16:00 to 16:59 - Minutes of Usage
v3_SD_H17_Calls	Rs.w	1		17:00 to 17:59 - Nº Calls.
v3_SD_H17_Users	Rs.w	1		"":"" to "":"" - Nº Users in Hour.
v3_SD_H17_Mins	Rs.w	1		17:00 to 17:59 - Minutes of Usage
v3_SD_H18_Calls	Rs.w	1		18:00 to 18:59 - Nº Calls.
v3_SD_H18_Users	Rs.w	1		"":"" to "":"" - Nº Users in Hour.
v3_SD_H18_Mins	Rs.w	1		18:00 to 18:59 - Minutes of Usage
v3_SD_H19_Calls	Rs.w	1		19:00 to 19:59 - Nº Calls.
v3_SD_H19_Users	Rs.w	1		"":"" to "":"" - Nº Users in Hour.
v3_SD_H19_Mins	Rs.w	1		19:00 to 19:59 - Minutes of Usage
v3_SD_H20_Calls	Rs.w	1		20:00 to 20:59 - Nº Calls.
v3_SD_H20_Users	Rs.w	1		"":"" to "":"" - Nº Users in Hour.
v3_SD_H20_Mins	Rs.w	1		20:00 to 20:59 - Minutes of Usage
v3_SD_H21_Calls	Rs.w	1		21:00 to 21:59 - Nº Calls.
v3_SD_H21_Users	Rs.w	1		"":"" to "":"" - Nº Users in Hour.
v3_SD_H21_Mins	Rs.w	1		21:00 to 21:59 - Minutes of Usage
v3_SD_H22_Calls	Rs.w	1		22:00 to 22:59 - Nº Calls.
v3_SD_H22_Users	Rs.w	1		"":"" to "":"" - Nº Users in Hour.
v3_SD_H22_Mins	Rs.w	1		22:00 to 22:59 - Minutes of Usage
v3_SD_H23_Calls	Rs.w	1		23:00 to 23:59 - Nº Calls.
v3_SD_H23_Users	Rs.w	1		"":"" to "":"" - Nº Users in Hour.
v3_SD_H23_Mins	Rs.w	1		23:00 to 23:59 - Minutes of Usage
v3_SD_RESERVED	Rs.b	40		40 CHARS RESERVED FOR ENHANCEMENTS
v3_SD_Len		Equ	__RS		Length
v3_SD_H_Len	Equ	v3_SD_H01_Calls-v3_SD_H00_Calls
;---------------------------------------------------------------------------;
;- Individual Users in Storage File ----------------------------------------;
;---------------------------------------------------------------------------;
		RSReset
v3_SU_Name	Rs.b	v3_S1_Len
v3_SU_Location	Rs.b	v3_S2_Len
v3_SU_Node	Rs.b	v3_S3_Len
v3_SU_Node2	Rs.b	v3_S4_Len
v3_SU_Usage	Rs.b	v3_S5_Len
v3_SU_UpKBytes	Rs.b	v3_S6_Len
v3_SU_UpFiles	Rs.b	v3_S7_Len
v3_SU_DnKBytes	Rs.b	v3_S8_Len
v3_SU_DnFiles	Rs.b	v3_S9_Len
v3_SU_OnTime	Rs.b	v3_S10_Len
v3_SU_OffTime	Rs.b	v3_S11_Len
v3_SU_AvCPS	Rs.b	v3_S12_Len
v3_SU_Baud	Rs.b	v3_S13_Len
v3_SU_Flag_1	Rs.b	v3_S14_Len
v3_SU_Flag_2	Rs.b	v3_S15_Len
v3_SU_Flag_3	Rs.b	v3_S16_Len
v3_SU_OnDate	Rs.b	v3_S17_Len
v3_SU_Reserved	Rs.b	v3_S18_Len
v3_SU_Len	Equ	__RS		Length
;---------------------------------------------------------------------------;
;- Individual CPS-Records in Storage File ----------------------------------;
;---------------------------------------------------------------------------;
		RSReset
v3_SC_Name	Rs.b	v3_SC1_Len
v3_SC_Location	Rs.b	v3_SC2_Len
v3_SC_Date	Rs.b	v3_SC3_Len
v3_SC_FileName	Rs.b	v3_SC4_Len
v3_SC_Baud	Rs.b	v3_SC5_Len
v3_SC_Size	Rs.b	v3_SC6_Len
v3_SC_Flag_1	Rs.b	v3_SC7_Len
v3_SC_Mins	Rs.b	v3_SC8_Len
v3_SC_Secs	Rs.b	v3_SC9_Len
v3_SC_Effy	Rs.b	v3_SCA_Len
v3_SC_Reserved	Rs.b	v3_SCB_Len
v3_SC_Len	Equ	__RS		Length
;---------------------------------------------------------------------------;
;- Formats of Binary/Boolen Flag bytes in User Structures ------------------;
;---------------------------------------------------------------------------;
;- User Flag #1 ------------------------------------------------------------;
;---------------------------------------------------------------------------;
v3_SU_F1_New	Equ	0		New User?
v3_SU_F1_Hack	Equ	1		Hacking?
v3_SU_F1_Drop	Equ	2		Dropped Carrier?
v3_SU_F1_Page	Equ	3		Paged?
v3_SU_F1_SysC	Equ	4		Used Sysop Command(s)?
v3_SU_F1_Locl	Equ	5		Local Call?
v3_SU_F1_ISDN	Equ	6		ISDN Call?
;---------------------------------------------------------------------------;
;- User Flag #2 ------------------------------------------------------------;
;---------------------------------------------------------------------------;
v3_SU_F2_Upld	Equ	0		Uploaded?
v3_SU_F2_UpFl	Equ	1		Failed an Upload?
v3_SU_F2_Dnld	Equ	2		Downloaded?
v3_SU_F2_DnFl	Equ	3		Failed a Download?
;---------------------------------------------------------------------------;
;- CPS Flag #1 -------------------------------------------------------------;
;---------------------------------------------------------------------------;
v3_SC_F1_UpDn	Equ	0		If = 0 Then UPLOAD, = 1 Then DOWNLOAD
v3_SC_F1_Batch	Equ	1		If = 1 Then it was a Batch Transfer.
*****************************************************************************
*****************************************************************************
* actual file structure in vars below.
*****************************************************************************
*****************************************************************************
* END: Storage file v003 structure.                                         *
*****************************************************************************
*****************************************************************************


	EVEN
*****************************************************************************
*****************************************************************************
*: The Variables (Address Equates for Space allocated at program start) ::::*
*****************************************************************************
;---------------------------------------------------------------------------;
		RSReset
;===========================================================================;
FilHead		Rs.b	260		; File-Header - MUST BE LW ALLIGNED ;
;===========================================================================;
FH_DiskKey	Equ	FilHead+000	[LW]
FH_DirEntryType	Equ	FilHead+004	[LW] If < 0, File. If > 0, Directory.
FH_FileName	Equ	FilHead+008	[108] FileName Null Term. MAX 30chars
FH_Protection	Equ	FilHead+116	[LW] Protection Bit Mask. rwxd=3-0
FH_EntryType	Equ	FilHead+120	[LW]
FH_Size		Equ	FilHead+124	[LW] Number of Bytes In File.
FH_NumBlocks	Equ	FilHead+128	[LW] Number of Blocks In File.
FH_DateStamp	Equ	FilHead+132	[12] DateStamp of time Last Changed.
FH_Comment	Equ	FilHead+144	[80] File Command. Null Term.
FH_Reserved	Equ	FilHead+224	[36] RESERVED.
;===========================================================================;
DTStruc		Rs.b	26		;------- Date-Time Structure -------;
;===========================================================================;
DT_Days		Equ	DTStruc+00	Days Since Jan 1st 1978 or whenever
DT_Mins		Equ	DTStruc+04	Mins Since Midnight
DT_Tiks		Equ	DTStruc+08	Ticks Since Minute (Always Even)
DT_4Mat		Equ	DTStruc+12	Format   -.
DT_Flag		Equ	DTStruc+13	Flags     |
DT_Name		Equ	DTStruc+14	Date Adr  |- For Outputting.
DT_Date		Equ	DTStruc+18	Name Adr  |
DT_Time		Equ	DTStruc+22	Time Adr -'
;= SWITCHES ================================================================;
STD_F_1		Rs.b	1		Files In Memory.
RSEven
;= DATA ====================================================================;
;= FILES ===================================================================;
FileNam		Rs.l	1		Active  File Name
FileHdl		Rs.l	1		Active  File Handle
FileLok		Rs.l	1		Active  File Lock
FileSze		Rs.l	1		Active  File Size
FileAdr		Rs.l	1		Active  File Address
;= ADDRESS-POINTERS ========================================================;
StarStk		Rs.l	1		Original Stack Pointer
DosBase		Rs.l	1		Dos.Library Base
CommAdd		Rs.l	1		CommandLine Address
CommLen		Rs.l	1		CommandLine Length
CLI_Hdl		Rs.l	1		Output CLI (or whatever) handle
NoFilRt		Rs.l	1		Routine to call when no file exists.
NWrtNFd		Rs.l	1		Routine to call when no file exists.
;= TEMP ====================================================================;
Temp001		Rs.l	1		-.
Temp002		Rs.l	1		 |  Temperarary Pointers for
Temp003		Rs.l	1		 |- Subroutine Calls and for
Temp004		Rs.l	1		 |  using instead of the stack!
;= BUFFERS =================================================================;
D8_Name		Rs.b	16		Name String	-.
D8_Date		Rs.b	16		Date String	 |- Date Stuff
D8_Time		Rs.b	16		Time String	-'
ErrBuffLen	Equ	100
ErrBuff		Rs.b	ErrBuffLen	For Fault() to write Error Text.
StdBuffLen	Equ	100
StdBuff		Rs.b	StdBuffLen	Buffer for anything.
;===========================================================================;
; Storage Files... 							    ;
;===========================================================================;
v3_StorFil	Equ	__RS		;------- Storage File Memory -------;
;===========================================================================;
v3_SV_Start		Rs.b	v3_S_Vers_Len	File Version
v3_SX_Clear_Date	Rs.b	10		Date that the file was cleared/made.
v3_SX_Upload_1	Rs.b	v3_STD_Filename_Length	-.
v3_SX_Upload_2	Rs.b	v3_STD_Filename_Length	 |
v3_SX_Upload_3	Rs.b	v3_STD_Filename_Length	 |- Last 5 uploads.
v3_SX_Upload_4	Rs.b	v3_STD_Filename_Length	 |
v3_SX_Upload_5	Rs.b	v3_STD_Filename_Length	-'
v3_Store_Clear_S	Equ	__RS
v3_SX_NumUpdates	Rs.l	1		Number of times Update has been run.
v3_SX_RESERVED		Rs.b	40		40 CHARS RESERVED FOR ENHANCEMENTS
;---------------------------------------------------------------------------;
;- Daily Stats Structures [8] ----------------------------------------------;
;---------------------------------------------------------------------------;
V3_SD0_Base	Rs.b	v3_SD_Len		Day #0 (Today)
v3_SD1_Base	Rs.b	v3_SD_Len		Day #1 -.
v3_SD2_Base	Rs.b	v3_SD_Len		Day #2	|
v3_SD3_Base	Rs.b	v3_SD_Len		Day #3	|
v3_SD4_Base	Rs.b	v3_SD_Len		Day #4	|- One Full Week.
v3_SD5_Base	Rs.b	v3_SD_Len		Day #5	|
v3_SD6_Base	Rs.b	v3_SD_Len		Day #6	|
v3_SD7_Base	Rs.b	v3_SD_Len		Day #7 -'
;---------------------------------------------------------------------------;
;- Records Structure -------------------------------------------------------;
;---------------------------------------------------------------------------;
; Date Format: "DDD, DD-MMM-YY",0,0  LAST null is an EVEN.
v3_SR_Calls		Rs.w	1		Callers
v3_SR_Calls_D		Rs.b	16		Date of Above
v3_SR_UpKBytes		Rs.l	1		KBytes Uploaded
v3_SR_UpKBytes_D	Rs.b	16		Date of Above
v3_SR_UpFiles		Rs.w	1		Files Uploaded
v3_SR_UpFiles_D		Rs.b	16		Date of Above
v3_SR_UpFails		Rs.w	1		Upload Fails   (NOT IMPLEMENTED)
v3_SR_UpFails_D		Rs.b	16		Date of Above  (NOT IMPLEMENTED)
v3_SR_DnKBytes		Rs.l	1		KBytes Downloaded
v3_SR_DnKBytes_D	Rs.b	16		Date of Above
v3_SR_DnFiles		Rs.w	1		Files Downloaded
v3_SR_DnFiles_D		Rs.b	16		Date of Above
v3_SR_DnFails		Rs.w	1		Download Fails (NOT IMPLEMENTED)
v3_SR_DnFails_D		Rs.b	16		Date of Above  (NOT IMPLEMENTED)
v3_SR_UsedMins		Rs.l	1		Minutes Of Useage
v3_SR_UsedMins_D	Rs.b	16		Date of Above
v3_SR_NewUsers		Rs.w	1		New Users
v3_SR_NewUsers_D	Rs.b	16		Date of Above
v3_SR_Hacks		Rs.w	1		Hacks
v3_SR_Hacks_D		Rs.b	16		Date of Above
v3_SR_Drops		Rs.w	1		Drop Carriers
v3_SR_Drops_D		Rs.b	16		Date of Above
v3_SR_Pages		Rs.w	1		Pages
v3_SR_Pages_D		Rs.b	16		Date of Above
v3_SR_RESERVED		Rs.b	40		40 CHARS RESERVED FOR ENHANCEMENTS
v3_SR_Len		Equ	__RS-v3_SR_Calls	Length
;---------------------------------------------------------------------------;
v3_Store_Clear	Equ	__RS-v3_Store_Clear_S
;---------------------------------------------------------------------------;
;- Individual User Entries [20] --------------------------------------------;
;---------------------------------------------------------------------------;
v3_SU01_Base	Rs.b	v3_SU_Len		User #1
v3_SU02_Base	Rs.b	v3_SU_Len		User #2
v3_SU03_Base	Rs.b	v3_SU_Len		User #3
v3_SU04_Base	Rs.b	v3_SU_Len		User #4
v3_SU05_Base	Rs.b	v3_SU_Len		User #5
v3_SU06_Base	Rs.b	v3_SU_Len		User #6
v3_SU07_Base	Rs.b	v3_SU_Len		User #7
v3_SU08_Base	Rs.b	v3_SU_Len		User #8
v3_SU09_Base	Rs.b	v3_SU_Len		User #9
v3_SU10_Base	Rs.b	v3_SU_Len		User #10
v3_SU11_Base	Rs.b	v3_SU_Len		User #11
v3_SU12_Base	Rs.b	v3_SU_Len		User #12
v3_SU13_Base	Rs.b	v3_SU_Len		User #13
v3_SU14_Base	Rs.b	v3_SU_Len		User #14
v3_SU15_Base	Rs.b	v3_SU_Len		User #15
v3_SU16_Base	Rs.b	v3_SU_Len		User #16
v3_SU17_Base	Rs.b	v3_SU_Len		User #17
v3_SU18_Base	Rs.b	v3_SU_Len		User #18
v3_SU19_Base	Rs.b	v3_SU_Len		User #19
v3_SU20_Base	Rs.b	v3_SU_Len		User #20
;---------------------------------------------------------------------------;
;- Individual CPS Record Entries [20] --------------------------------------;
;---------------------------------------------------------------------------;
v3_SCR01_Base	Rs.b	v3_SCR_Len		CPS Record #1
v3_SCR02_Base	Rs.b	v3_SCR_Len		CPS Record #2
v3_SCR03_Base	Rs.b	v3_SCR_Len		CPS Record #3
v3_SCR04_Base	Rs.b	v3_SCR_Len		CPS Record #4
v3_SCR05_Base	Rs.b	v3_SCR_Len		CPS Record #5
v3_SCR06_Base	Rs.b	v3_SCR_Len		CPS Record #6
v3_SCR07_Base	Rs.b	v3_SCR_Len		CPS Record #7
v3_SCR08_Base	Rs.b	v3_SCR_Len		CPS Record #8
v3_SCR09_Base	Rs.b	v3_SCR_Len		CPS Record #9
v3_SCR10_Base	Rs.b	v3_SCR_Len		CPS Record #10
v3_SCR11_Base	Rs.b	v3_SCR_Len		CPS Record #11
v3_SCR12_Base	Rs.b	v3_SCR_Len		CPS Record #12
v3_SCR13_Base	Rs.b	v3_SCR_Len		CPS Record #13
v3_SCR14_Base	Rs.b	v3_SCR_Len		CPS Record #14
v3_SCR15_Base	Rs.b	v3_SCR_Len		CPS Record #15
v3_SCR16_Base	Rs.b	v3_SCR_Len		CPS Record #16
v3_SCR17_Base	Rs.b	v3_SCR_Len		CPS Record #17
v3_SCR18_Base	Rs.b	v3_SCR_Len		CPS Record #18
v3_SCR19_Base	Rs.b	v3_SCR_Len		CPS Record #19
v3_SCR20_Base	Rs.b	v3_SCR_Len		CPS Record #20
;---------------------------------------------------------------------------;
;- Pointers in above are to these structures [20] --------------------------;
;---------------------------------------------------------------------------;
v3_SC01_Base	Rs.b	v3_SC_Len		User #1
v3_SC02_Base	Rs.b	v3_SC_Len		User #2
v3_SC03_Base	Rs.b	v3_SC_Len		User #3
v3_SC04_Base	Rs.b	v3_SC_Len		User #4
v3_SC05_Base	Rs.b	v3_SC_Len		User #5
v3_SC06_Base	Rs.b	v3_SC_Len		User #6
v3_SC07_Base	Rs.b	v3_SC_Len		User #7
v3_SC08_Base	Rs.b	v3_SC_Len		User #8
v3_SC09_Base	Rs.b	v3_SC_Len		User #9
v3_SC10_Base	Rs.b	v3_SC_Len		User #10
v3_SC11_Base	Rs.b	v3_SC_Len		User #11
v3_SC12_Base	Rs.b	v3_SC_Len		User #12
v3_SC13_Base	Rs.b	v3_SC_Len		User #13
v3_SC14_Base	Rs.b	v3_SC_Len		User #14
v3_SC15_Base	Rs.b	v3_SC_Len		User #15
v3_SC16_Base	Rs.b	v3_SC_Len		User #16
v3_SC17_Base	Rs.b	v3_SC_Len		User #17
v3_SC18_Base	Rs.b	v3_SC_Len		User #18
v3_SC19_Base	Rs.b	v3_SC_Len		User #19
v3_SC20_Base	Rs.b	v3_SC_Len		User #20
;---------------------------------------------------------------------------;
v3_S_Size	Equ	__RS-v3_StorFil	Size of Storage File.
;===========================================================================;
NULLEND		Equ	__RS		;------- Overlays Start Here -------;
;===========================================================================;
;===========================================================================;
LENVARS		Equ	__RS		;---- End of variables/overlays ----;
;===========================================================================;
