    PROGRAM

    MAP
    END

Window               WINDOW('Enter Your Password'),AT(,,388,339),FONT('Segoe UI',8,,FONT:regular),DOUBLE,CENTER, |
  ICON('ibsmenu.ico'),GRAY,IMM,MASK,SYSTEM
                       SHEET,AT(3,2,383,305),USE(?SHEET1),WIZARD
                         TAB('Tab1'),USE(?TAB1)
                           GROUP,AT(-1,-1,387,165),USE(?GROUP1),HIDE,TRN
                           END
                           IMAGE('DSIBanner.jpg'),AT(3,2,385,162),USE(?LogonImage),CENTERED
                           STRING(@s40),AT(99,181,207,10),USE(LOC:ModuleName),CENTER,TRN
                           STRING('Program Version:'),AT(107,193),USE(?String4),TRN
                           STRING(@s10),AT(170,193,,10),USE(GVF:Version),TRN
                           STRING('Released:'),AT(219,193,,10),USE(?String5),TRN
                           STRING(@S10),AT(255,193,,10),USE(LOC:Released),TRN
                           STRING('Released:'),AT(219,206),USE(?String15),TRN
                           STRING(@s10),AT(255,206),USE(LOC:DBVersionDate),TRN
                           STRING('Database Version:'),AT(104,206),USE(?String13),TRN
                           STRING(@n_6),AT(170,206,46),USE(GVF:VersionID),TRN
                           PROMPT('Company:'),AT(73,220),USE(?AACompanyNamePrompt),TRN
                           LIST,AT(117,220,161,10),USE(AAA:CompanyName),VSCROLL,DROP(10),FORMAT('180L(2)|M*@s45@0L' & |
  '(2)|M*@n2@0L(2)|M*@n3@'),FROM(Queue:FileDrop),IMM,MSG('Select Company'),TIP('Select Company')
                           STRING('User:'),AT(73,234),USE(?String6),TRN
                           ENTRY(@s10),AT(117,234,60,10),USE(LOC:UserID),UPR,IMM,REQ
                           ENTRY(@s35),AT(179,234,153,10),USE(GVF:UserName),READONLY,SKIP
                           PROMPT('&Password:'),AT(73,249),USE(?LOC:PASSWORD:Prompt),TRN
                           ENTRY(@s10),AT(117,249,60,10),USE(LOC:PASSWORD),OVR,UPR,IMM,PASSWORD,REQ
                           ENTRY(@s35),AT(179,249,153,10),USE(LOC:Message),READONLY,SKIP
                           STRING(@s65),AT(65,268,275,10),USE(GVF:LicenseOwnerCompany),CENTER,TRN
                           STRING(@s61),AT(65,281,275,10),USE(GVF:Copyright),CENTER,TRN
                           STRING('Direct Systems, Inc.'),AT(65,295,275),USE(?String3),CENTER,TRN
                         END
                       END
                       BUTTON('&Login'),AT(257,309,61,28),USE(?OK),LEFT,ICON('LoginKey.ico'),DEFAULT
                       BUTTON('&Cancel'),AT(322,308,61,28),USE(?Cancel),LEFT,ICON('Cancel.ico')
                     END