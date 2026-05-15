/* $VER:Stock 1.30 (02.07.94.)   */
/*  by Pogi - Call-Ware version  */
/* Call Myth BBS (361)1730552 !  */
/* Temp. number from 6 Jun for about a month : (361)1299498 ! */
/*  Opened : 22.00 - 3.00 CET    */

/* edit here */

bullet    = 'BBS:Screens/Conf/Bulletins/Bull2.txt'    /* LOG-File  */
title     = 'DOORS:STOCK/title.txt'                   /* Title.txt */
divtxt    = 'DOORS:STOCK/divide.txt'                  /* Divide.txt*/
buytxt    = 'DOORS:STOCK/buy.txt'                     /* Buy.txt   */
selltxt   = 'DOORS:STOCK/sell.txt'                    /* Sell.txt  */
listtxt   = 'DOORS:STOCK/list.txt'                    /* List.txt  */
helptxt   = 'DOORS:STOCK/help.txt'                    /* Help.txt  */
deptxt    = 'DOORS:STOCK/dep.txt'                     /* Dep.txt   */
wittxt    = 'DOORS:STOCK/wit.txt'                     /* Wit.txt   */
robtxt    = 'DOORS:STOCK/rob.txt'                     /* Rob.txt   */
userdir	  = 'DOORS:STOCK/users'                       /* users     */
stocks    = 'DOORS:STOCK/stocks'                      /* stocks    */
nuserdir  = 'DOORS:STOCK/nusers'                      /* nusers    */
nstocks   = 'DOORS:STOCK/nstocks'                     /* nstocks   */

defrate   = 250000		/* default stock rate          */
defdiv    = 1.0                 /* dividend = upload * defdiv  */
definc	  = 1.15                /* default rate increment(Buy) */
defdec    = 0.85                /* default rate decrement(Sell)*/
sdefinc   = 1.02                /* \                           */
sdefdec   = 0.98                /*  > rate edit function def.  */
shacc     = 255                 /* /                           */
maxloan   = 25000               /* maximum load / accesslevel  */

/* no more edit */

parse arg node
options results
address value "AERexxControl"node

signal on syntax

numeric digits 10
numeric fuzz 3

tr=transmit
gu=getuser
sm=sendmessage
qu=query

cls=""
CRLF="0D 0A"x
CR="0D"x
LF="0A"x

NOR = "[0m"
BLA = "[30m"
WHI = "[31m"
GRE = "[32m"
YEL = "[33m"
BLU = "[34m"
PIN = "[35m"
CYA = "[36m"
RED = "[37m"

/* Start */

	gu 12 ; sysop=result
        gu 100 ; name=compress(result,':/~()|#?*) ')
	gu 105 ; accesslevel=result
	gu 106 ; ratiotype=result
	gu 107 ; ratio=result
	gu 117 ; bytesupload=result
	gu 118 ; bytedownload=result

	if ratio=0 then do
		tr PIN'You are not allowed to use this door because you have diasbled ratio.'NOR
		call exit
	end
	bull = 1
	if ~exists(bullet) then do
		open(fb,bullet,'W')
		writeln(fb,CLS)
		writeln(fb,YEL'                 *** Stock-Market Log ***')
		writeln(fb,RED'                 ========================')
		writeln(fb,' ')
		writeln(fb,CYA'UserName............Act...........StockName........Time&Date........')
		writeln(fb,YEL'===================================================================='NOR)
		close(fb)
	end
	if ~exists(userdir) then address command 'C:makedir "' || userdir || '"'
	userfile = userdir || '/' || name
	if ~exists(userfile) then do
		if (bytesupload - bytedownload / ratio)<defrate then call neulcr
		bytesupload = bytesupload - defrate
		putustr bytesupload
		putuser 117
		open(fu,userfile,'W')
		writeln(fu,name)
		writeln(fu,1)
		writeln(fu,bytesupload)
		writeln(fu,'#EOF')
		close(fu)
		if ~exists(stocks) then do
			open(fs,stocks,'W')
			writeln(fs,name)
			writeln(fs,defrate)
			writeln(fs,1)
			writeln(fs,bytesupload)
			writeln(fs,0)
			writeln(fs,'#EOF')
			close(fs)
		end
		else do
			open(fs,stocks,'R')
			open(fsn,nstocks,'W')
			oldname = readln(fs)
			do until oldname = '#EOF'
				oldrate = readln(fs)
				oldnum = readln(fs)
				oldul = readln(fs)
				olddul = readln(fs)
				writeln(fsn,oldname)
				writeln(fsn,oldrate)
				writeln(fsn,oldnum)
				writeln(fsn,oldul)
				writeln(fsn,olddul)
				oldname = readln(fs)
			end
			close(fs)
			writeln(fsn,name)
			writeln(fsn,defrate)
			writeln(fsn,1)
			writeln(fsn,bytesupload)
			writeln(fsn,0)
			writeln(fsn,'#EOF')
			close(fsn)
			address command 'C:delete "' || stocks || '"'
			address command 'C:rename "' || nstocks || '" "' || stocks || '"'
		end

		gu 144 ; currtime=result
		open(fb,bullet,'A')
		writeln(fb,left(name,20,'.') || '.N................' || right(currtime,25,'.'))
		close(fb)
	end

	call ReadData
        stock.own.ul = bytesupload

Main:
        tr cls
	sm RED
        showfile title
	tr NOR
	tr GRE'< press space >'NOR
	getchar
	tr CLS
	call Divide
	tr CR
	tr GRE'< press space >'NOR
	getchar
	call ListStocks
	do until char = 'A' | char = 'Q'
		tr CR
		tr CR
		tr 'You have 'PIN || trunc(bytesupload - bytedownload / ratio) || NOR' ULCredits.'
		tr YEL'('CYA'L'YEL')ist - ('CYA'B'YEL')uy - ('CYA'S'YEL')ell - ('CYA'G'YEL')o to the Bank - ('CYA'H'YEL')elp - ('CYA'A'YEL')bort - ('CYA'Q'YEL')uit :'NOR
		getchar
		char = upper(result)
		tr CR
		if char = 'L' then call ListStocks
		if char = 'B' then call BuyStock
		if char = 'S' then call SellStock
		if char = 'G' then call GotoBank
		if char = 'H' then call ShowHelp
		if char = '+' then call IncRates
		if char = '-' then call DecRates
	end

        if char = 'Q' then do
		tr "Please wait. Saving changes..."
        	call WriteData
        	putustr bytesupload
        	putuser 117
        end

        call exit

ShowHelp:
	showfile helptxt
	return

IncRates:
	if accesslevel < shacc then return
	i = 1
	do until stock.i.name = '#EOF'
		stock.i.rate = trunc(stock.i.rate * sdefinc)
		i = i + 1
	end
	tr 'OK.'
	return

DecRates:
	if accesslevel < shacc then return
	i = 1
	do until stock.i.name = '#EOF'
		stock.i.rate = trunc(stock.i.rate * sdefdec)
		i = i + 1
	end
	tr 'OK.'
	return

GotoBank:
	do until char = 'M'
		tr CR
		tr CR
		tr 'You have 'PIN || bank.own.cr || NOR' ULCredits in the Bank.'
		tr YEL'('CYA'D'YEL')eposit - ('CYA'W'YEL')ithdraw - ('CYA'R'YEL')ob the Bank - ('CYA'M'YEL')ain menu :'NOR
		getchar
		char = upper(result)
		tr CR
		if char = 'D' then call Deposit
		if char = 'W' then call Withdraw
		if char = 'R' then call RobBank
	end
	return

Deposit:
	showfile deptxt
        tr 'You can deposit max. 'PIN || trunc(bytesupload - bytedownload / ratio) || NOR' ULCr.'
        qu 'How much do you want to deposit (ULCr) ? '
        depcr = result
	if depcr = '' then return
	if ~datatype(depcr,'w') then return
        if depcr <= 0 then return
        if depcr > (bytesupload - bytedownload / ratio) then return
        bank.own.cr = bank.own.cr + depcr
        bytesupload = bytesupload - depcr
	stock.own.ul = stock.own.ul - depcr
	stock.own.dul = stock.own.dul + depcr
        tr 'OK.'
	return

Withdraw:
	showfile wittxt
        tr 'You can withdraw max. 'PIN || (bank.own.cr + maxloan * accesslevel) || NOR' ULCr.'
        qu 'How much do you want to withdraw (ULCr) ? '
        witcr = result
	if witcr = '' then return
	if ~datatype(witcr,'w') then return
        if witcr <= 0 then return
        if witcr > (bank.own.cr + maxloan * accesslevel) then return
        bank.own.cr = bank.own.cr - witcr
        bytesupload = bytesupload + witcr
	stock.own.ul = stock.own.ul + witcr
	stock.own.dul = stock.own.dul - witcr
        tr 'OK.'
	return

RobBank:
	showfile robtxt
	tr 'This function is not implemented yet. The SysOp will be noticed...'
	putustr 'Somebody tryed to rob the Bank !'LF
	putuser 150
	return

BuyStock:
	showfile buytxt
	qu 'Which stock do you want to buy (#) ? '
	buystock = result
	if stock.buystock.num = 'STOCK.' || buystock || '.NUM' then return
	if bytedownload < (bytesupload - stock.buystock.rate * definc) * ratio then do
		stock.buystock.rate = trunc(stock.buystock.rate * definc)
		bytesupload = bytesupload - stock.buystock.rate
		stock.own.ul = stock.own.ul - stock.buystock.rate
		stock.own.dul = stock.own.dul + stock.buystock.rate
		stock.buystock.num = stock.buystock.num + 1
		locuser = own
		locname = stock.buystock.name
		call LocateU
		if user.own.loc.name = stock.buystock.name then do
			user.own.loc.num = user.own.loc.num + 1
		end
		else do
			j = 1
			do until user.own.j.name = '#EOF'
				j = j + 1
			end
			user.own.j.name = stock.buystock.name
			user.own.j.num = 1
			user.own.j.ul = stock.buystock.ul + stock.buystock.dul
			j = j + 1
			user.own.j.name = '#EOF'
		end
	tr 'OK.'

	gu 144 ; currtime=result
	bulls.bull = left(name,20,'.') || '.B.' || right(stock.buystock.name,20,'.') || right(currtime,25,'.')
	bull = bull + 1

	return

SellStock:
	showfile selltxt
	qu 'Which stock do you want to sell (#) ? '
	sellstock = result
	if stock.sellstock.num = 'STOCK.' || sellstock || '.NUM' then return
	locuser = own
	locname = stock.sellstock.name
	call LocateU
	if user.own.loc.name ~= stock.sellstock.name then return
	if user.own.loc.num < 1 then return
	if (user.own.loc.num < 2) & (user.own.loc.name = name) then return
	stock.sellstock.rate = trunc(stock.sellstock.rate * defdec)
	bytesupload = bytesupload + stock.sellstock.rate
	stock.own.ul = stock.own.ul + stock.sellstock.rate
	stock.own.dul = stock.own.dul - stock.sellstock.rate
	stock.sellstock.num = stock.sellstock.num - 1
	user.own.loc.num = user.own.loc.num - 1
	tr 'OK.'

	gu 144 ; currtime=result
	bulls.bull = left(name,20,'.') || '.S.' || right(stock.sellstock.name,20,'.') || right(currtime,25,'.')
	bull = bull + 1

	return

Divide:
	showfile divtxt
	tr CYA'Stockname............Dividend'
	tr YEL'============================='NOR
	dividend = 0
	bankdiv = 0.0
	banknum = 0
	j = 1
	do until user.own.j.name = '#EOF'
		locname = user.own.j.name
		call LocateS
		divid = trunc(user.own.j.num / stock.loc.num * (stock.loc.ul + stock.loc.dul - user.own.j.ul) * defdiv)
		bankdiv = bankdiv + divid / (stock.loc.rate * user.own.j.num)
		banknum = banknum + 1
		dividend = dividend + divid
		user.own.j.ul = stock.loc.ul + stock.loc.dul
		tr left(user.own.j.name,20,'.') || right(divid,9,'.')
		j = j + 1
	end
	bytesupload = bytesupload + dividend
	stock.own.ul = stock.own.ul + dividend
	stock.own.dul = stock.own.dul - dividend
	tr YEL'============================='NOR
	bankdiv = 1 + bankdiv / banknum
	i = 1
	do until stock.i.name = '#EOF'
		bank.i.cr = trunc(bank.i.cr * bankdiv)
		i = i + 1
	end
        return

LocateS:
	loc = 1
	do while stock.loc.name ~= locname
		loc = loc + 1
	end
	return

ListStocks:
	showfile listtxt
	tr CYA'#...StockName.............MidRate.All/Own..BuyRate.SellRate..TotalULB'
	tr YEL'====================================================================='NOR
	i = 1
	do until stock.i.name = '#EOF'
		locuser = own
		locname = stock.i.name
		call LocateU
		if user.own.loc.name = stock.i.name then ownnum = user.own.loc.num
		else ownnum = 0
		tr left(i,4,'.') || left(stock.i.name,20,'.') || right(stock.i.rate,9,'.') || right(stock.i.num || '/' || ownnum,8,'.') || right(trunc(stock.i.rate * definc),9,'.') || right(trunc(stock.i.rate * defdec),9,'.') || right(stock.i.ul + stock.i.dul,10,'.')
		i = i + 1
	end
	tr YEL'====================================================================='NOR
	return

LocateU:
	loc = 1
	do while (user.locuser.loc.name ~= locname) & (user.locuser.loc.name ~= '#EOF')
		loc = loc + 1
	end
	return

ReadData:
	open(fs,stocks,'R')
	i = 1
	stock.i.name = readln(fs)
	do until stock.i.name = '#EOF'
		if stock.i.name = name then own = i
	        stock.i.rate = readln(fs)
		if stock.i.rate = '#1' then do
			bank.i.cr = readln(fs)
			stock.i.rate = readln(fs)
		end
		else do
			bank.i.cr = 0
		end
	        stock.i.num = readln(fs)
	        stock.i.ul = readln(fs)
	        stock.i.dul = readln(fs)
	        userfile = userdir || '/' || stock.i.name
	        open(fu,userfile,'R')
	        j = 1
	        user.i.j.name = readln(fu)
	        do until user.i.j.name = '#EOF'
	        	user.i.j.num = readln(fu)
	        	user.i.j.ul = readln(fu)
	        	if user.i.j.num > 0 then j = j + 1
	        	user.i.j.name = readln(fu)
	        end
	        close(fu)
	        i = i + 1
	        stock.i.name = readln(fs)
	end
        close(fs)
        return

WriteData:
	if exists(nstocks) then address command 'C:delete "' || nstocks || '"'
	if exists(nuserdir) then address command 'C:delete "' || nuserdir || '"'
	address command 'C:makedir "' || nuserdir || '"'
	open(fs,nstocks,'W')
	i = 1
	writeln(fs,stock.i.name)
	do until stock.i.name = '#EOF'
		writeln(fs,'#1')
		writeln(fs,bank.i.cr)
		writeln(fs,stock.i.rate)
		writeln(fs,stock.i.num)
		writeln(fs,stock.i.ul)
		writeln(fs,stock.i.dul)
		nuserfile = nuserdir || '/' || stock.i.name
		open(fu,nuserfile,'W')
		j = 1
		writeln(fu,user.i.j.name)
		do until user.i.j.name = '#EOF'
			writeln(fu,user.i.j.num)
			writeln(fu,user.i.j.ul)
			j = j + 1
			writeln(fu,user.i.j.name)
		end
		close(fu)
		i = i + 1
		writeln(fs,stock.i.name)
	end
	close(fs)
	if exists(stocks) then address command 'C:delete "' || stocks || '"'
	if exists(userdir) then address command 'C:delete "' || userdir || '" ALL'
	address command 'C:rename "' || nstocks || '" "' || stocks || '"'
	address command 'C:rename "' || nuserdir || '" "' || userdir || '"'

	open(fb,bullet,'A')
	bull = 1
	do while bulls.bull ~= 'BULLS.' || bull
		writeln(fb,bulls.bull)
		bull = bull + 1
	end
	close(fb)

	return


neulcr:
	tr crlf
	tr GRE"You haven't got enough ULCredits to use STOCK-MARKET."NOR
	tr crlf
	call exit

Error: ; Syntax: ; IOerr:
	tr CRLF""NOR" An Error Has Occured In The Main Program On Line #"sigl"! Exiting..."
	tr " Please Notify "GRE""SYSOP"."CRLF
	putustr ' *** ERROR IN STOCK-MARKET in line #'sigl' !'LF
	putuser 150
	SHUTDOWN
	EXIT

Exit:
	tr crlf
	tr GRE'Call 'WHI'Myth BBS'YEL' : +(36)-1-173-0552  'PIN'22.00-3.00 CET'NOR
	tr ""
	putustr '        Went to the Stock-Market'LF
	putuser 150
	SHUTDOWN
	EXIT
	END