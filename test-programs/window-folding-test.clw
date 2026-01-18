  PROGRAM

  MAP
  END

AppFrame             APPLICATION('IBS Main Menu'),AT(,,600,400),FONT('Segoe UI',8,COLOR:Black,FONT:regular,CHARSET:ANSI), |
  RESIZE,CENTERED,HVSCROLL,CENTER,ICON('IBSMenu.ico'),IMM,MAX,STATUS(-1,220,120,45,80),SYSTEM, |
  TIMER(6000)
                       MENUBAR,USE(?MENUBAR1)
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
                         MENU('&Modules'),USE(?Modules)
                           ITEM('Sales/&Lead Tracker (TPS)'),USE(?SalesLeadTracker)
                           ITEM('Cust&omer Service / Dispatch Manager (TPS)'),USE(?OperationsDispatch)
                           ITEM,USE(?SEPARATOR3),SEPARATOR
                           ITEM('&Accounts Payable'),USE(?AccountsPayable)
                           ITEM('Accounts &Receivable'),USE(?AccountsReceivable)
                           ITEM('&Bank Account Manager'),USE(?BankAccountManager)
                           ITEM('&Payroll Manager'),USE(?PayrollManager)
                           ITEM('&Storage Manager'),USE(?StorageManager)
                           ITEM,USE(?SEPARATOR4),SEPARATOR
                           ITEM('&General Ledger'),USE(?GeneralLedger)
                           ITEM('&Commissions Manager'),USE(?CommissionsManager)
                           ITEM('&Job Cost Manager'),USE(?JobCost)
                           ITEM('&Vehicle Profitability Manager'),USE(?VehicleProfitabilityManager)
                           ITEM,USE(?SEPARATOR5),SEPARATOR
                           ITEM('Van Line Statem&ent Download'),USE(?VanLineStatement)
                           ITEM('&Move/Task Manager (TPS)'),USE(?MoveTaskManager)
                           ITEM('Cla&ims Manager'),USE(?ModulesClaimsManager),DISABLE,HIDE
                           ITEM,USE(?SEPARATOR6),SEPARATOR
                           ITEM('Commercial Recor&ds Storage'),USE(?CommercialRecordsStorage)
                           ITEM('&Warehouse Locator'),USE(?WarehouseLocator)
                           ITEM,USE(?SEPARATOR7),SEPARATOR
                           ITEM('Consolidated Financial Reports'),USE(?ModulesConsolidatedGeneralLedger)
                         END
                         MENU('&Updates'),USE(?Updates)
                           ITEM('&How the Update Process Works'),USE(?UpdatesHowtheUpdateProcessWorks)
                           ITEM('&Check for Updates'),USE(?mnuitmCheckForUpdates)
                           ITEM('Download Latest Version'),USE(?mnuDownloadUpdate)
                           ITEM('&Install Updates'),USE(?mnuInstallUpdates)
                           ITEM('Installation Control &File Maintenance'),USE(?UpdatesInstallationControlFileMaintenance), |
  HIDE
                           ITEM,USE(?SepEmail),SEPARATOR
                           ITEM('Check for Email License'),USE(?itmCheckEmailLicense)
                         END
                         MENU('&Edit'),USE(?EditMenu)
                           ITEM('Cu&t'),USE(?Cut),MSG('Remove item to Windows Clipboard'),STD(STD:Cut)
                           ITEM('&Copy'),USE(?Copy),MSG('Copy item to Windows Clipboard'),STD(STD:Copy)
                           ITEM('&Paste'),USE(?Paste),MSG('Paste contents of Windows Clipboard'),STD(STD:Paste)
                         END
                         MENU('&Window'),USE(?MENU1),MSG('Create and Arrange windows'),STD(STD:WindowList)
                           ITEM('T&ile'),USE(?Tile),MSG('Make all open windows visible'),STD(STD:TileWindow)
                           ITEM('&Cascade'),USE(?Cascade),MSG('Stack all open windows'),STD(STD:CascadeWindow)
                         END
                         MENU('&Help'),USE(?MENU2),MSG('Windows Help')
                           ITEM('&Help'),USE(?HelpHelp)
                           ITEM('&About'),USE(?HelpAbout),MSG('About This Program')
                           ITEM('IBS Support Portal'),USE(?itmIBSSupportPortal)
                           ITEM('&License Agreement'),USE(?HelpLicenseAgreement)
                           ITEM('SQL Details'),USE(?mnuSQLDetails)
                         END
                         ITEM('What''s New'),USE(?WhatsNew)
                       END
                       TOOLBAR,AT(0,0,600,31),USE(?TOOLBAR1),COLOR(COLOR:White)
                       END
                     END
  CODE
