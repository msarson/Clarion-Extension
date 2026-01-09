                         MENU('&File'),USE(?FileMenu)
                           ITEM('Setup User-Definable Choices'),USE(?FileSetupUserDefinableChoices)
                           MENU('Email Options'),USE(?MNUEmailOptions)
                             ITEM('Email Settings'),USE(?mnuFileEmailSettings)
                             ITEM('Email Log'),USE(?mnuFileEmailLog)
                             ITEM('Check Licence'),USE(?itmCheckLicence)
                           END
                           ITEM,USE(?SEPARATOR1),SEPARATOR
                           ITEM('P&rint Setup...'),USE(?PrintSetup),MSG('Setup Printer'),STD(STD:PrintSetup)
                           ITEM,USE(?SEPARATOR2),SEPARATOR
                           ITEM('E&xit'),USE(?Exit),MSG('Exit this application'),STD(STD:Close)
                         END
