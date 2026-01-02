

   MEMBER('IBSCommon.clw')                                 ! This is a MEMBER module


   INCLUDE('ABDROPS.INC'),ONCE
   INCLUDE('ABTOOLBA.INC'),ONCE
   INCLUDE('DIWindow.INC'),ONCE

                     MAP
                       INCLUDE('UPDATEPYACCOUNT_IBSCOMMON.INC'),ONCE        !Local module procedure declarations
                     END


    
!!! <summary>
!!! Generated from procedure template - Window
!!! Update the Payroll Account
!!! </summary>
UpdatePYAccount PROCEDURE (BYTE pLastAccount)

Validations       CLASS(ValidationClass).
RegexUtils RegexWrapperType
udpt            UltimateDebugProcedureTracker
oHH           &tagHTMLHelp
CurrentTab           STRING(80)                            ! 
ActionMessage        CSTRING(40)                           ! 
LOC:GL_NAME          STRING(35)                            ! 
LOC:ID               STRING('PayrollBasis    ')            ! The unique ID for the specific Data-entry Field
LocalMessageGroup    GROUP,PRE(LMG)                        ! 
Message1             STRING(71)                            ! 
Message2             STRING(71)                            ! 
Message3             STRING(71)                            ! 
                     END                                   ! 
FDCB8::View:FileDropCombo VIEW(IBSDPC)
                       PROJECT(DPC:DESCRIPTION)
                     END
FDB5::View:FileDrop  VIEW(BMBankAccount)
                       PROJECT(BMA:BankName)
                       PROJECT(BMA:SystemID)
                     END
Queue:FileDropCombo  QUEUE                            !
DPC:DESCRIPTION        LIKE(DPC:DESCRIPTION)          !List box control field - type derived from field
Mark                   BYTE                           !Entry's marked status
ViewPosition           STRING(1024)                   !Entry's view position
                     END
Queue:FileDrop       QUEUE                            !
BMA:BankName           LIKE(BMA:BankName)             !List box control field - type derived from field
BMA:SystemID           LIKE(BMA:SystemID)             !Primary key field - type derived from field
Mark                   BYTE                           !Entry's marked status
ViewPosition           STRING(1024)                   !Entry's view position
                     END
EnhancedFocusManager EnhancedFocusClassType
History::PYA:Record  LIKE(PYA:RECORD),THREAD
QuickWindow          WINDOW('Update the Payroll Account'),AT(,,315,206),FONT('Segoe UI',8),DOUBLE,CENTER,GRAY,IMM, |
  MASK,MDI
                       SHEET,AT(2,2,311,182),USE(?SHEET1),WIZARD
                         TAB('Tab1'),USE(?TAB1)
                           PROMPT('Pa&yroll Account:'),AT(20,6),USE(?P01:PR_ACCOUNT:Prompt),TRN
                           STRING('*'),AT(77,6,5),USE(?String3),FONT(,,COLOR:Black,FONT:bold,CHARSET:ANSI),CENTER,TRN
                           ENTRY(@n2),AT(85,6,,10),USE(PYA:PYAccount),RIGHT(1),INS,MSG('The Payroll Account Number'), |
  REQ,TIP('The Payroll Account Number')
                           CHECK('Active'),AT(121,6),USE(PYA:Active),MSG('Active (T/F)'),TIP('Active (T/F)'),TRN
                           PROMPT('Account &Name:'),AT(23,18),USE(?P01:PR_ACCT_NAME:Prompt),TRN
                           STRING('*'),AT(77,18,5),USE(?String4),FONT(,,COLOR:Black,FONT:bold,CHARSET:ANSI),CENTER,TRN
                           ENTRY(@s35),AT(85,18,,10),USE(PYA:AccountName),MSG('The Name of the Payroll Account'),REQ, |
  TIP('The Name of the Payroll Account')
                           PROMPT('Accrual &G/L Number:'),AT(5,31),USE(?P01:PR_GL_NUMBER:Prompt),TRN
                           STRING('*'),AT(77,31,5),USE(?String5),FONT(,,COLOR:Black,FONT:bold,CHARSET:ANSI),CENTER,TRN
                           ENTRY(@P<<<<#-###P),AT(85,31,,10),USE(PYA:GLNumber),RIGHT(1),OVR,MSG('The Payroll Accru' & |
  'al General Ledger Liability Account'),REQ,TIP('The Payroll Accrual General Ledger Li' & |
  'ability Account')
                           ENTRY(@s35),AT(141,31,126,10),USE(LOC:GL_NAME),READONLY,SKIP
                           BUTTON,AT(271,30,12,12),USE(?SeeGLAccounts),ICON('search.ico'),FLAT
                           PROMPT('&Bank Account:'),AT(25,42),USE(?PYA:BankNumber:prompt),TRN
                           STRING('*'),AT(77,42,5),USE(?String6),FONT(,,COLOR:Black,FONT:bold,CHARSET:ANSI),CENTER,TRN
                           LIST,AT(85,42,140,10),USE(BMA:BankName),VSCROLL,DROP(10),FORMAT('140L(2)|M@s35@'),FROM(Queue:FileDrop),MSG('Bank Name')
                           PROMPT('&Federal Tax ID:'),AT(25,54),USE(?P01:FED_TAX_ID:Prompt),TRN
                           ENTRY(@s11),AT(85,54,,10),USE(PYA:FederalTaxID),MSG('The Federal Tax ID Number'),TIP('The Federa' & |
  'l Tax ID Number')
                           PROMPT('Standard &Payroll Calculation Period:'),AT(21,70),USE(?Prompt17),TRN
                           STRING('*'),AT(147,70,5),USE(?String7),FONT(,,COLOR:Black,FONT:bold,CHARSET:ANSI),CENTER,TRN
                           COMBO(@s25),AT(155,70,79,10),USE(DPC:DESCRIPTION),DROP(6),FORMAT('100L(2)|M@s25@'),FROM(Queue:FileDropCombo), |
  IMM,MSG('The Standard Payroll Calculation Period'),REQ,TIP('The Standard Payroll Calc' & |
  'ulation Period')
                           STRING('Overtime Calculation - '),AT(41,82),USE(?String1),TRN
                           PROMPT('&Factor:'),AT(120,82),USE(?P01:OT_FACTOR:Prompt),TRN
                           STRING('*'),AT(147,82,5),USE(?String8),FONT(,,COLOR:Black,FONT:bold,CHARSET:ANSI),CENTER,TRN
                           ENTRY(@n4.2),AT(155,82,,10),USE(PYA:OvertimeFactor),RIGHT(1),INS,MSG('The Standard Over' & |
  'time Factor'),REQ,TIP('The Standard Overtime Factor')
                           PROMPT('Bas&is:'),AT(195,82),USE(?P01:OT_BASIS:Prompt),TRN
                           STRING('*'),AT(219,82,5),USE(?String9),FONT(,,COLOR:Black,FONT:bold,CHARSET:ANSI),CENTER,TRN
                           ENTRY(@n4),AT(227,82,,10),USE(PYA:OvertimeBasis),RIGHT(1),INS,MSG('The Maximum Hours ea' & |
  'rned before Overtime'),REQ,TIP('The Maximum Hours earned before Overtime')
                           STRING('User Selected Fields on User Defined Check Run Deduction Reports'),AT(34,96),USE(?String2),TRN
                           PROMPT('Deduction #&1:'),AT(56,112),USE(?P01:RPT_DED_1:Prompt),TRN
                           ENTRY(@n4),AT(111,112,,10),USE(PYA:Deduction1),RIGHT(1),INS,MSG('User-Defined Payroll R' & |
  'eport Deduction # 1'),TIP('User-Defined Payroll Report Deduction # 1')
                           ENTRY(@s15),AT(145,112,,10),USE(PYA:Description1),MSG('User-Defined Payroll Report Dedu' & |
  'ction # 1 Description'),TIP('User-Defined Payroll Report Deduction # 1 Description')
                           BUTTON,AT(219,111,12,12),USE(?SeeElement1),ICON('search.ico'),FLAT
                           PROMPT('Deduction #&2:'),AT(56,124),USE(?P01:RPT_DED_2:Prompt),TRN
                           ENTRY(@n4),AT(111,124,,10),USE(PYA:Deduction2),RIGHT(1),MSG('User-Defined Payroll Repor' & |
  't Deduction # 2'),TIP('User-Defined Payroll Report Deduction # 2')
                           ENTRY(@s15),AT(145,124,,10),USE(PYA:Description2),MSG('User-Defined Payroll Report Dedu' & |
  'ction # 2 Description'),TIP('User-Defined Payroll Report Deduction # 2 Description')
                           BUTTON,AT(219,123,12,12),USE(?SeeElement2),ICON('search.ico'),FLAT
                           PROMPT('Deduction #&3:'),AT(56,136),USE(?P01:RPT_DED_3:Prompt),TRN
                           ENTRY(@n4),AT(111,136,,10),USE(PYA:Deduction3),RIGHT(1),MSG('User-Defined Payroll Repor' & |
  't Deduction # 3'),TIP('User-Defined Payroll Report Deduction # 3')
                           ENTRY(@s15),AT(145,136,,10),USE(PYA:Description3),MSG('User-Defined Payroll Report Dedu' & |
  'ction # 3 Description'),TIP('User-Defined Payroll Report Deduction # 3 Description')
                           BUTTON,AT(219,135,12,12),USE(?SeeElement3),ICON('search.ico'),FLAT
                           PROMPT('Deduction #&4:'),AT(56,148),USE(?P01:RPT_DED_4:Prompt),TRN
                           ENTRY(@n4),AT(111,148,,10),USE(PYA:Deduction4),RIGHT(1),MSG('User-Defined Payroll Repor' & |
  't Deduction # 4'),TIP('User-Defined Payroll Report Deduction # 4')
                           ENTRY(@s15),AT(145,148,,10),USE(PYA:Description4),MSG('User-Defined Payroll Report Dedu' & |
  'ction # 4 Description'),TIP('User-Defined Payroll Report Deduction # 4 Description')
                           BUTTON,AT(219,147,12,12),USE(?SeeElement4),ICON('search.ico'),FLAT
                           PROMPT('Deduction #&5:'),AT(56,160),USE(?P01:RPT_DED_5:Prompt),TRN
                           ENTRY(@n4),AT(111,160,,10),USE(PYA:Deduction5),RIGHT(1),MSG('User-Defined Payroll Repor' & |
  't Deduction # 5'),TIP('User-Defined Payroll Report Deduction # 5')
                           ENTRY(@s15),AT(145,160,,10),USE(PYA:Description5),MSG('User-Defined Payroll Report Dedu' & |
  'ction # 5 Description'),TIP('User-Defined Payroll Report Deduction # 5 Description')
                         END
                       END
                       BUTTON,AT(219,159,12,12),USE(?SeeElement5),ICON('search.ico'),FLAT
                       BUTTON('&OK'),AT(167,188,45,14),USE(?OK),LEFT,ICON('ok.ico'),DEFAULT
                       BUTTON('&Cancel'),AT(216,188,45,14),USE(?Cancel),LEFT,ICON('Cancel.ico')
                       BUTTON('&Help'),AT(265,188,45,14),USE(?Help),LEFT,ICON('HELP.ico')
                     END

    omit('***',WE::CantCloseNowSetHereDone=1)  !Getting Nested omit compile error, then uncheck the "Check for duplicate CantCloseNowSetHere variable declaration" in the WinEvent local template
WE::CantCloseNowSetHereDone equate(1)
WE::CantCloseNowSetHere     long
    !***
ThisWindow           CLASS(DirectWindowManager)
Ask                    PROCEDURE(),DERIVED
Init                   PROCEDURE(),BYTE,PROC,DERIVED
Kill                   PROCEDURE(),BYTE,PROC,DERIVED
PrimeFields            PROCEDURE(),PROC,DERIVED
Run                    PROCEDURE(),BYTE,PROC,DERIVED
Run                    PROCEDURE(USHORT Number,BYTE Request),BYTE,PROC,DERIVED
TakeAccepted           PROCEDURE(),BYTE,PROC,DERIVED
TakeEvent              PROCEDURE(),BYTE,PROC,DERIVED
TakeWindowEvent        PROCEDURE(),BYTE,PROC,DERIVED
                     END

Toolbar              ToolbarClass
! ----- ThisListManager:BMA:BankName --------------------------------------------------------------------------
ThisListManager:BMA:BankName Class(ListManager)
                     End  ! ThisListManager:BMA:BankName
! ----- end ThisListManager:BMA:BankName -----------------------------------------------------------------------
ToolbarForm          ToolbarUpdateClass                    ! Form Toolbar Manager
FDCB8                CLASS(FileDropComboClass)             ! File drop combo manager
Q                      &Queue:FileDropCombo           !Reference to browse queue type
                     END

FDB5                 CLASS(FileDropClass)                  ! File drop manager
Q                      &Queue:FileDrop                !Reference to display queue
                     END

CurCtrlFeq          LONG
FieldColorQueue     QUEUE
Feq                   LONG
OldColor              LONG
                    END

  CODE
? DEBUGHOOK(BMBankAccount:Record)
? DEBUGHOOK(GLAccount:Record)
? DEBUGHOOK(IBSDPC:Record)
? DEBUGHOOK(PY1D05A:Record)
? DEBUGHOOK(PYAccount:Record)
? DEBUGHOOK(PYEmployeeDeductions:Record)
  GlobalResponse = ThisWindow.Run()                        ! Opens the window and starts an Accept Loop

!---------------------------------------------------------------------------
DefineListboxStyle ROUTINE
!|
!| This routine create all the styles to be shared in this window
!| It`s called after the window open
!|
!---------------------------------------------------------------------------

ThisWindow.Ask PROCEDURE

  CODE
  CASE SELF.Request                                        ! Configure the action message text
  OF ViewRecord
    ActionMessage = 'View Record'
  OF InsertRecord
    ActionMessage = 'Adding a Payroll Account'
  OF ChangeRecord
    ActionMessage = 'Changing a Payroll Account'
  OF DeleteRecord
    GlobalErrors.Throw(Msg:DeleteIllegal)
    RETURN
  END
  QuickWindow{PROP:Text} = ActionMessage                   ! Display status message in title bar
  PARENT.Ask


ThisWindow.Init PROCEDURE

ReturnValue          BYTE,AUTO

  CODE
        udpt.Init(UD,'UpdatePYAccount','UpdatePYAccount_IBSCommon.clw','IBSCommon.DLL','11/05/2025 @ 07:07PM') 
             
  GlobalErrors.SetProcedureName('UpdatePYAccount')
  SELF.Request = GlobalRequest                             ! Store the incoming request
  RegexUtils.INIT()
  ReturnValue = PARENT.Init()
  IF ReturnValue THEN RETURN ReturnValue.
  SELF.FirstField = ?P01:PR_ACCOUNT:Prompt
  SELF.VCRRequest &= VCRRequest
  SELF.Errors &= GlobalErrors                              ! Set this windows ErrorManager to the global ErrorManager
  CLEAR(GlobalRequest)                                     ! Clear GlobalRequest after storing locally
  CLEAR(GlobalResponse)
  SELF.AddItem(Toolbar)
  SELF.HistoryKey = 734
  SELF.AddHistoryFile(PYA:Record,History::PYA:Record)
  SELF.AddHistoryField(?PYA:PYAccount,3)
  SELF.AddHistoryField(?PYA:Active,21)
  SELF.AddHistoryField(?PYA:AccountName,4)
  SELF.AddHistoryField(?PYA:GLNumber,5)
  SELF.AddHistoryField(?PYA:FederalTaxID,19)
  SELF.AddHistoryField(?PYA:OvertimeFactor,17)
  SELF.AddHistoryField(?PYA:OvertimeBasis,18)
  SELF.AddHistoryField(?PYA:Deduction1,7)
  SELF.AddHistoryField(?PYA:Description1,8)
  SELF.AddHistoryField(?PYA:Deduction2,9)
  SELF.AddHistoryField(?PYA:Description2,10)
  SELF.AddHistoryField(?PYA:Deduction3,11)
  SELF.AddHistoryField(?PYA:Description3,12)
  SELF.AddHistoryField(?PYA:Deduction4,13)
  SELF.AddHistoryField(?PYA:Description4,14)
  SELF.AddHistoryField(?PYA:Deduction5,15)
  SELF.AddHistoryField(?PYA:Description5,16)
  SELF.AddItem(?Cancel,RequestCancelled)                   ! Add the cancel control to the window manager
  SELF.AddUpdateFile(Access:PYAccount)
  Relate:BMBankAccount.Open                                ! File BMBankAccount used by this procedure, so make sure it's RelationManager is open
  Relate:GLAccount.Open                                    ! File GLAccount used by this procedure, so make sure it's RelationManager is open
  Relate:IBSDPC.Open                                       ! File IBSDPC used by this procedure, so make sure it's RelationManager is open
  Relate:PY1D05A.Open                                      ! File PY1D05A used by this procedure, so make sure it's RelationManager is open
  Relate:PYAccount.Open                                    ! File PYAccount used by this procedure, so make sure it's RelationManager is open
  Relate:PYEmployeeDeductions.Open                         ! File PYEmployeeDeductions used by this procedure, so make sure it's RelationManager is open
  SELF.FilesOpened = True
  SELF.Primary &= Relate:PYAccount
  IF SELF.Request = ViewRecord AND NOT SELF.BatchProcessing ! Setup actions for ViewOnly Mode
    SELF.InsertAction = Insert:None
    SELF.DeleteAction = Delete:None
    SELF.ChangeAction = Change:None
    SELF.CancelAction = Cancel:Cancel
    SELF.OkControl = 0
  ELSE
    SELF.DeleteAction = Delete:None                        ! Deletes not allowed
    SELF.ChangeAction = Change:Caller                      ! Changes allowed
    SELF.OkControl = ?OK
    IF SELF.PrimeUpdate() THEN RETURN Level:Notify.
  END
  SELF.Open(QuickWindow)                                   ! Open window
   IF ?BMA:BankName{PROP:LineHeight} < 11 THEN ?BMA:BankName{PROP:LineHeight} = 11.
    ComboListFeq# = ?DPC:DESCRIPTION{prop:ListFeq}
    ComboListFeq#{PROP:LineHeight} = 11
  !LIST  ?BMA:BankName
   IF ?BMA:BankName{prop:drop} = 0  !Ive put this in so it doesn't colour lists with prop:drop
    ?BMA:BankName{PROP:SelectedColor} = 8388608  !FGSelected
    ?BMA:BankName{PROP:SelectedFillColor} = 11525621  !BGSelected
    ?BMA:BankName{PROPLIST:Grid} = 12632256  !Grid
   END
    ComboListFeq# = ?DPC:DESCRIPTION{prop:ListFeq}
    ComboListFeq#{PROP:SelectedColor} = 8388608
    ComboListFeq#{PROP:SelectedFillColor} = 11525621
    ComboListFeq#{PROPLIST:Grid} = 12632256
  Do DefineListboxStyle
  Alert(AltKeyPressed)  ! WinEvent : These keys cause a program to crash on Windows 7 and Windows 10.
  Alert(F10Key)         !
  Alert(CtrlF10)        !
  Alert(ShiftF10)       !
  Alert(CtrlShiftF10)   !
  Alert(AltSpace)       !
  WinAlertMouseZoom()
  WinAlert(WE::WM_QueryEndSession,,Return1+PostUser)
  QuickWindow{Prop:Alrt,255} = CtrlShiftP
  SELF.AddItem(ToolbarForm)
  FDCB8.Init(DPC:DESCRIPTION,?DPC:DESCRIPTION,Queue:FileDropCombo.ViewPosition,FDCB8::View:FileDropCombo,Queue:FileDropCombo,Relate:IBSDPC,ThisWindow,GlobalErrors,0,1,0)
  FDCB8.Q &= Queue:FileDropCombo
  FDCB8.AddSortOrder(DPC:KEY)
  FDCB8.AddRange(DPC:ID,LOC:ID)
  FDCB8.AddField(DPC:DESCRIPTION,FDCB8.Q.DPC:DESCRIPTION) !List box control field - type derived from field
  FDCB8.AddUpdateField(DPC:CHOICE,PYA:StandardBasis)
  ThisWindow.AddItem(FDCB8.WindowComponent)
  FDCB8.DefaultFill = 0
  FDB5.Init(?BMA:BankName,Queue:FileDrop.ViewPosition,FDB5::View:FileDrop,Queue:FileDrop,Relate:BMBankAccount,ThisWindow)
  FDB5.Q &= Queue:FileDrop
  FDB5.AddSortOrder(BMA:KeyBankName)
  FDB5.AddRange(BMA:CompanyID,GVF:CompanyID)
  FDB5.SetFilter('BMA:BankNumber > 0')
  FDB5.AddField(BMA:BankName,FDB5.Q.BMA:BankName) !List box control field - type derived from field
  FDB5.AddField(BMA:SystemID,FDB5.Q.BMA:SystemID) !Primary key field - type derived from field
  FDB5.AddUpdateField(BMA:BankNumber,PYA:BankNumber)
  ThisWindow.AddItem(FDB5.WindowComponent)
  FDB5.DefaultFill = 0
  SELF.SetAlerts()
  Bind('RunScreenSelectColumns',RunScreenSelectColumns)
  ThisListManager:BMA:BankName.Init(?BMA:BankName,'RunScreenSelectColumns','Columns...','Hide Column')
  ThisListManager:BMA:BankName.Load(Access:RunScreen,RUNS:PrimaryKey,RUNS:User,GVF:UserID,RUNS:Proc,''&GetMOD()&':UpdatePYAccount:ThisListManager:BMA:BankName',RUNS:Settings)
  ThisListManager:BMA:BankName.FormatList()
  oHH &= NEW tagHTMLHelp
  oHH.Init( GVF:HelpFileLocation & '\' & CLIP(thisStartup.Module) & '.CHM' )
    !Set the hlp to local equate
    IF EQIBSCOMMON:UPDATEPAYROLLACCOUNT <> EQ:NOHELP
      0{prop:hlp} = EQIBSCOMMON:UPDATEPAYROLLACCOUNT
      ohh.SetTopic(EQIBSCOMMON:UPDATEPAYROLLACCOUNT)
    END
  EnhancedFocusManager.Init(1,14211817,0,0,15662847,0,65535,0,2,255,0,0,8421504,'',8)
  EnhancedFocusManager.SetOnScreenKeyboard(False) !Will disable the OSK
  EnhancedFocusManager.DisableControlType(CREATE:Radio)
  EnhancedFocusManager.DisableControlType(CREATE:Check)
  RETURN ReturnValue


ThisWindow.Kill PROCEDURE

ReturnValue          BYTE,AUTO

  CODE
  If self.opened Then WinAlert().
  ReturnValue = PARENT.Kill()
  IF ReturnValue THEN RETURN ReturnValue.
  IF SELF.FilesOpened
    Relate:BMBankAccount.Close
    Relate:GLAccount.Close
    Relate:IBSDPC.Close
    Relate:PY1D05A.Close
    Relate:PYAccount.Close
    Relate:PYEmployeeDeductions.Close
  END
    ThisListManager:BMA:BankName.Save(Access:RunScreen,RUNS:PrimaryKey,RUNS:User,GVF:UserID,RUNS:Proc,''&GetMOD()&':UpdatePYAccount:ThisListManager:BMA:BankName',RUNS:Settings)
  GlobalErrors.SetProcedureName
  IF ~oHH &= NULL
    oHH.Kill()
    DISPOSE( oHH )
  END
            
   
  RETURN ReturnValue


ThisWindow.PrimeFields PROCEDURE

  CODE
  PYA:CompanyID = GVF:CompanyID
  PYA:PYAccount = pLastAccount + 1
  PYA:OvertimeFactor = 1.5
  PYA:OvertimeBasis = 40
  PYA:Active = TRUE
  PARENT.PrimeFields


ThisWindow.Run PROCEDURE

ReturnValue          BYTE,AUTO

  CODE
  IF NOT GVF:Permission[1] THEN
    NoPermission(1,'M')
    RETURN(0)
  END
  ReturnValue = PARENT.Run()
  IF SELF.Request = ViewRecord                             ! In View Only mode always signal RequestCancelled
    ReturnValue = RequestCancelled
  END
  RETURN ReturnValue


ThisWindow.Run PROCEDURE(USHORT Number,BYTE Request)

ReturnValue          BYTE,AUTO

  CODE
  ReturnValue = PARENT.Run(Number,Request)
  IF SELF.Request = ViewRecord
    ReturnValue = RequestCancelled                         ! Always return RequestCancelled if the form was opened in ViewRecord mode
  ELSE
    GlobalRequest = Request
    SelectGLAccountRestricted(GVF:CompanyID)
    ReturnValue = GlobalResponse
  END
  RETURN ReturnValue


ThisWindow.TakeAccepted PROCEDURE

ReturnValue          BYTE,AUTO

Looped BYTE
  CODE
  LOOP                                                     ! This method receive all EVENT:Accepted's
    IF Looped
      RETURN Level:Notify
    ELSE
      Looped = 1
    END
    CASE ACCEPTED()
    OF ?PYA:GLNumber
      PYA:CompanyID = GVF:CompanyID
    OF ?OK
      IF NOT PYA:BankNumber THEN
        SELECT(?BMA:BankName)
        CYCLE
      END
    END
  ReturnValue = PARENT.TakeAccepted()
    CASE ACCEPTED()
    OF ?PYA:GLNumber
      IF PYA:GLNumber OR ?PYA:GLNumber{PROP:Req}
        GLA:GLNumber = PYA:GLNumber
        IF Access:GLAccount.TryFetch(GLA:KeyGLNumber)
          IF SELF.Run(1,SelectRecord) = RequestCompleted
            PYA:GLNumber = GLA:GLNumber
            LOC:GL_NAME = GLA:AccountName
          ELSE
            CLEAR(LOC:GL_NAME)
            SELECT(?PYA:GLNumber)
            CYCLE
          END
        ELSE
          LOC:GL_NAME = GLA:AccountName
        END
      END
      ThisWindow.Reset(1)
      IF NOT GLA:Active THEN
        LMG:Message1 = 'The G/L Account which you have selected'
        LMG:Message2 = 'Is not Active.  It cannot be used.'
        LMG:Message3 = 'Press [ OK ] to enter another Account'
        ShowMessage(LocalMessageGroup)
        CLEAR(PYA:GLNumber)
        DISPLAY(PYA:GLNumber)
        SELECT(?PYA:GLNumber)
        CYCLE
      END
      
      IF NOT GLA:Restricted THEN
        LMG:Message1 = 'The G/L Account which you have selected Is NOT Restricted.'
        LMG:Message2 = 'It cannot be used here.'
        LMG:Message3 = 'Press [ OK ] to enter another Account'
        ShowMessage(LocalMessageGroup)
        CLEAR(PYA:GLNumber)
        DISPLAY(?PYA:GLNumber)
        SELECT(?PYA:GLNumber)
        CYCLE
      END
      
    OF ?SeeGLAccounts
      ThisWindow.Update()
      GLA:GLNumber = PYA:GLNumber
      IF SELF.Run(1,SelectRecord) = RequestCompleted
        PYA:GLNumber = GLA:GLNumber
        LOC:GL_NAME = GLA:AccountName
      END
      ThisWindow.Reset(1)
    OF ?PYA:FederalTaxID
      
      
      IF RegExUtils.initialized AND NOT 0{PROP:AcceptAll} and PYA:FederalTaxID <> ''
        IF NOT RegExUtils.ValidateTin(PYA:FederalTaxID) THEN
          CASE MESSAGE('The Federal Tax ID you entered appears to be invalid.|' & |
            'Expected formats are:|' & |
            '  - EIN: XX-XXXXXXX|' & |
            '  - SSN: XXX-XX-XXXX|' & |
            'Would you like to enter it again?', |
            'Invalid Federal Tax ID', ICON:Question, BUTTON:Yes + BUTTON:No)
          OF BUTTON:Yes
            PYA:FederalTaxID = ''
            DISPLAY(?PYA:FederalTaxID)
            SELECT(?PYA:FederalTaxID)
            CYCLE   ! Allow the user to re-enter the field
      
          END
        END
      END
      
      !      ud.Debug('Validating FederalTaxID: ' & CLIP(PYA:FederalTaxID))
      !      IF PYA:FederalTaxID <> '' and Validations.ValidateTIN(PYA:FederalTaxID) <> Level:Benign
      !        BEEP
      !        SELECT(?PYA:FederalTaxID)
      !      END
    OF ?PYA:Deduction1
      IF PYA:Deduction1 > 1 THEN
        CLEAR(PA5:RECORD)
        PY1D05A{PROP:SQL} = 'SELECT * FROM dbo.PYEmployeeDeductions WHERE CompanyID = ' & PYA:CompanyID & |
                            ' AND EMPLOYEE = 1000000' & |
                            ' AND ELEMENT = ' & PYA:Deduction1
        IF ACCESS:PY1D05A.NEXT() THEN
          GlobalRequest = SelectRecord
          SelectElement
          IF PA5:ELEMENT  > 1 THEN
            PYA:Deduction1 = PA5:ELEMENT
            PYA:Description1 = PA5:CheckDescription
          ELSE
            SELECT(?PYA:Deduction1)
            CYCLE
          END
        ELSE
          PYA:Deduction1 = PA5:ELEMENT
          IF CLIP(PYA:Description1) = '' THEN
            PYA:Description1 = PA5:CheckDescription
          END
        END
      ELSE
        PYA:Deduction1  = 0
        PYA:Description1 = ''
      END
      DISPLAY(?PYA:Deduction1)
      DISPLAY(?PYA:Description1)
    OF ?SeeElement1
      ThisWindow.Update()
      GlobalRequest = SelectRecord
      SelectElement
      IF PA5:ELEMENT > 1 THEN
        PYA:Deduction1  = PA5:ELEMENT
        PYA:Description1 = PA5:CheckDescription
        DISPLAY(?PYA:Deduction1)
        DISPLAY(?PYA:Description1)
        SELECT(? + 1)
      END
    OF ?PYA:Deduction2
      IF PYA:Deduction2 > 1 THEN
        CLEAR(PA5:RECORD)
        PY1D05A{PROP:SQL} = 'SELECT * FROM dbo.PYEmployeeDeductions WHERE CompanyID = ' & PYA:CompanyID & |
                            ' AND EMPLOYEE = 1000000' & |
                            ' AND ELEMENT = ' & PYA:Deduction2
        IF ACCESS:PY1D05A.NEXT() THEN
          GlobalRequest = SelectRecord
          SelectElement
          IF PA5:ELEMENT > 1 THEN
            PYA:Deduction2 = PA5:ELEMENT
            PYA:Description2 = PA5:CheckDescription
          ELSE
            SELECT(?PYA:Deduction2)
            CYCLE
          END
        ELSE
          PYA:Deduction2 = PA5:ELEMENT
          IF CLIP(PYA:Description2) = '' THEN
            PYA:Description2 = PA5:CheckDescription
          END
        END
      ELSE
        PYA:Deduction2  = 0
        PYA:Description2 = ''
      END
      DISPLAY(?PYA:Deduction2)
      DISPLAY(?PYA:Description2)
    OF ?SeeElement2
      ThisWindow.Update()
      GlobalRequest = SelectRecord
      SelectElement
      IF PA5:ELEMENT > 1 THEN
        PYA:Deduction2  = PA5:ELEMENT
        PYA:Description2 = PA5:CheckDescription
        DISPLAY(?PYA:Deduction2)
        DISPLAY(?PYA:Description2)
        SELECT(? + 1)
      END
    OF ?PYA:Deduction3
      IF PYA:Deduction3 > 1 THEN
        CLEAR(PA5:RECORD)
        PY1D05A{PROP:SQL} = 'SELECT * FROM dbo.PYEmployeeDeductions WHERE CompanyID = ' & PYA:CompanyID & |
                            ' AND Employee = 1000000' & |
                            ' AND Element = ' & PYA:Deduction3
        IF ACCESS:PY1D05A.NEXT() THEN
          GlobalRequest = SelectRecord
          SelectElement
          IF PA5:ELEMENT > 1 THEN
            PYA:Deduction3 = PA5:ELEMENT
            PYA:Description3 = PA5:CheckDescription
          ELSE
            SELECT(?PYA:Deduction3)
            CYCLE
          END
        ELSE
          PYA:Deduction3 = PA5:ELEMENT
          IF CLIP(PYA:Description3) = '' THEN
            PYA:Description3 = PA5:CheckDescription
          END
        END
      ELSE
        PYA:Deduction3  = 0
        PYA:Description3 = ''
      END
      DISPLAY(?PYA:Deduction3)
      DISPLAY(?PYA:Description3)
    OF ?SeeElement3
      ThisWindow.Update()
      GlobalRequest = SelectRecord
      SelectElement
      IF PA5:ELEMENT > 1 THEN
        PYA:Deduction3  = PA5:ELEMENT
        PYA:Description3 = PA5:CheckDescription
        DISPLAY(?PYA:Deduction3)
        DISPLAY(?PYA:Description3)
        SELECT(? + 1)
      END
    OF ?PYA:Deduction4
      IF PYA:Deduction4 > 1 THEN
        CLEAR(PA5:RECORD)
        PY1D05A{PROP:SQL} = 'SELECT * FROM dbo.PYEmployeeDeductions WHERE CompanyID = ' & PYA:CompanyID & |
                            ' AND EMPLOYEE = 1000000' & |
                            ' AND ELEMENT = ' & PYA:Deduction4
        IF ACCESS:PY1D05A.NEXT() THEN
          GlobalRequest = SelectRecord
          SelectElement
          IF PA5:ELEMENT > 1 THEN
            PYA:Deduction4 = PA5:ELEMENT
            PYA:Description4 = PA5:CheckDescription
          ELSE
            SELECT(?PYA:Deduction4)
            CYCLE
          END
        ELSE
          PYA:Deduction4 = PA5:ELEMENT
          IF CLIP(PYA:Description4) = '' THEN
            PYA:Description4 = PA5:CheckDescription
          END
        END
      ELSE
        PYA:Deduction4  = 0
        PYA:Description4 = ''
      END
      DISPLAY(?PYA:Deduction4)
      DISPLAY(?PYA:Description4)
    OF ?SeeElement4
      ThisWindow.Update()
      GlobalRequest = SelectRecord
      SelectElement
      IF PA5:ELEMENT  > 1 THEN
        PYA:Deduction4  = PA5:ELEMENT
        PYA:Description4 = PA5:CheckDescription
        DISPLAY(?PYA:Deduction4)
        DISPLAY(?PYA:Description4)
        SELECT(? + 1)
      END
    OF ?PYA:Deduction5
      IF PYA:Deduction5 > 1 THEN
        CLEAR(PA5:RECORD)
        PY1D05A{PROP:SQL} = 'SELECT * FROM dbo.PYEmployeeDeductions WHERE CompanyID = ' & PYA:CompanyID & |
                            ' AND EMPLOYEE = 1000000' & |
                            ' AND ELEMENT = ' & PYA:Deduction5
        IF ACCESS:PY1D05A.NEXT() THEN
          GlobalRequest = SelectRecord
          SelectElement
          IF PA5:ELEMENT  > 1 THEN
            PYA:Deduction5 = PA5:ELEMENT
            PYA:Description5 = PA5:CheckDescription
          ELSE
            SELECT(?PYA:Deduction5)
            CYCLE
          END
        ELSE
          PYA:Deduction5 = PA5:ELEMENT
          IF CLIP(PYA:Description5) = '' THEN
            PYA:Description5 = PA5:CheckDescription
          END
        END
      ELSE
        PYA:Deduction5  = 0
        PYA:Description5 = ''
      END
      DISPLAY(?PYA:Deduction5)
      DISPLAY(?PYA:Description5)
    OF ?SeeElement5
      ThisWindow.Update()
      GlobalRequest = SelectRecord
      SelectElement
      IF PA5:ELEMENT  > 1 THEN
        PYA:Deduction5  = PA5:ELEMENT
        PYA:Description5 = PA5:CheckDescription
        DISPLAY(?PYA:Deduction5)
        DISPLAY(?PYA:Description5)
        SELECT(? + 1)
      END
    OF ?OK
      ThisWindow.Update()
      IF SELF.Request = ViewRecord AND NOT SELF.BatchProcessing THEN
         POST(EVENT:CloseWindow)
      END
    OF ?Help
      ThisWindow.Update()
      CallHelp(EQIBSCOMMON:UPDATEPAYROLLACCOUNT)
      ThisWindow.Reset
    END
    RETURN ReturnValue
  END
  ReturnValue = Level:Fatal
  RETURN ReturnValue


ThisWindow.TakeEvent PROCEDURE

ReturnValue          BYTE,AUTO

Looped BYTE
  CODE
  LOOP                                                     ! This method receives all events
    IF Looped
      RETURN Level:Notify
    ELSE
      Looped = 1
    END
    If ThisListManager:BMA:BankName.TakeEvent() then cycle.
  EnhancedFocusManager.TakeEvent()
  ReturnValue = PARENT.TakeEvent()
     IF KEYCODE()=CtrlShiftP AND EVENT() = Event:PreAlertKey
      RETURN ReturnValue
      ! CYCLE
     END
     IF KEYCODE()=CtrlShiftP  
          ShowProcedureInformation('UpdatePYAccount',UD.SetApplicationName('IBSCommon','DLL'),QuickWindow{PROP:Hlp},'01/21/2025 @ 10:29AM','11/05/2025 @ 07:07PM','12/21/2025 @ 06:05PM')  
       CYCLE
     END
    RETURN ReturnValue
  END
  ReturnValue = Level:Fatal
  RETURN ReturnValue


ThisWindow.TakeWindowEvent PROCEDURE

ReturnValue          BYTE,AUTO

Looped BYTE
  CODE
  LOOP                                                     ! This method receives all window specific events
    IF Looped
      RETURN Level:Notify
    ELSE
      Looped = 1
    END
    CASE EVENT()
    OF EVENT:CloseDown
      if WE::CantCloseNow
        WE::MustClose = 1
        cycle
      else
        self.CancelAction = cancel:cancel
        self.response = requestcancelled
      end
      IF GLO:CleanCloseDown
         SELF.CancelAction = Cancel:Cancel
      END
    END
  ReturnValue = PARENT.TakeWindowEvent()
    CASE EVENT()
    OF EVENT:OpenWindow
      CASE SELF.Request
        OF InsertRecord
          ?OK{PROP:TEXT} = '&Add'
          ?OK{PROP:ICON} = 'ADD.ICO'
        OF ChangeRecord
          ?OK{PROP:TEXT} = '&Save'
          ?OK{PROP:ICON} = 'SAVE.ICO'
          Disable(?PYA:PYAccount)
          SELECT(?OK)
      END
      
      LOC:GL_NAME   = GLName(PYA:CompanyID,PYA:GLNumber)
    END
    RETURN ReturnValue
  END
  ReturnValue = Level:Fatal
  RETURN ReturnValue

