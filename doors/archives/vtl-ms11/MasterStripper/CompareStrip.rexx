/* Compare Strip Files V1.00 for MasterStripper V1.00 © Delusion of Virtual */

Parse Arg File

NR = 0

if File = '' then do
 Say "Compare Strip File V1.00 - © Delusion of Virtual"
 Say ""
 Say "Syntax: RX CompareStrip FILE"
 Say ""
 Say "File is the name & path for the file you wan't to add to your"
 Say "previous LHA.Strip file. CompareStrip will only save adds that"
 Say "are not in your LHA.Strip file to LHA.Strip.More."
 Say ""
 Say "You then manually have to copy the contents from LHA.Strip.More"
 Say "to you LHA.Strip file. This is so you could remove .nfo file or"
 Say "wathever you don't need becouse you have a *.nfo in you Strip file!"
 Say ""
 Exit
end

if Open('Strip', 'S:Lha.Strip', 'R') = 0 then do
 Say "Couldn't find the S:Lha.Strip file exiting.."
 Exit
end

if Open('Add', File, 'R') = 0 then do
 Say "Couldn't open "File" exiting.."
 Exit
end

Say "Reading all your adds from S:LHA.Strip"
Say ""
Say ""

Do i = 1 to 10000000 until eof('Strip')
 Say "[AReading row: "i
 Line.i = Upper(Strip(ReadLN('Strip')))
end

if Open('Save', 'S:LHA.Strip.More', 'A') = 0 then if Open('Save', 'S:LHA.Strip.More', 'W') = 0 then do
 Say "Couldn't open S:LHA.Strip.More for writing.. Exiting.."
 Exit
end

Say ""
Say "Comparing the new adds with your old and making an output!"
Say ""
Say ""

Do f = 1 to 10000000 until eof('Add')
 Say "[AWorking with row: "f
 Check = 0
 Add = ReadLN('Add')
 Do k = 1 to i
  if Line.k = Upper(Strip(Add)) then do
   Check = 1
   k = i
  end
 end
 if Check = 0 then do
  WriteLN('Save', Add)
  Nr = Nr + 1
 end
end

Close('Add')
Close('Strip')
Close('Save')

Say ""
Say "Found "NR" adds you didn't have before :)"
Say "Operation finished and successfull!"

Exit
