/* Sec Checker V1.00 written by Delusion Of Virtual In 1994. © DLS/VTL 94 */

parse arg node; options results; CR = '0A 0D'x; address value "AERexxControl"node; GetUser 100; Nam = Result; GetUser 105; Sec = Result
transmit CR'[33;44m Security Checker V1.00 (Part of Account ED V2.00) - © Delusion / VTL 1994 [0m'CR
Open('Data','DOORS:Arexx/Account/AccEd.Presets','R')
 Parse Value ReadCH('Data',2349) With 959 Names'|' 1934 SecCheck'|' 2020 SecSet'|'
Close('Data')
if Sec > SecCheck & Index(Upper(Names),Upper(Nam)) = 0 then do
 transmit '[35mYou have a too high security level! [36mYour security has been droped too[34m: [0m'Strip(SecSet)||CR
 if Open('Log','DOORS:Arexx/Account/AccEd.Log','A') = 0 then Open('Log','DOORS:Arexx/Account/AccEd.Log','W')
  WriteLN('Log',Translate(Date(U),'-','/')' Hack  'Left(Nam,20)' Too high security level ('Sec') ('TIME()')')
 Close('Log')
 PutUstr SecSet; PutUser 105
end
Shutdown; Exit