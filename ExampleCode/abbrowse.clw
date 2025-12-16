! Server routines for browse windows
  MEMBER
  MAP
  END
  INCLUDE('Errors.clw'),ONCE
  INCLUDE('Keycodes.clw'),ONCE
  INCLUDE('ABBROWSE.trn'),ONCE
  INCLUDE('ABQUERY.INC'),ONCE
  INCLUDE('ABEIP.inc'),ONCE
  INCLUDE('ABBROWSE.inc'),ONCE


MouseRightIndex EQUATE(249)

Scroll:Alpha     STRING('  AFANATB BFBNBTC CFCNCT'|
                       &'D DFDNDTE EFENETF FFFNFT'|
                       &'G GFGNGTH HFHNHTI IFINIT'|
                       &'J JFJNJTK KFKNKTL LFLNLT'|
                       &'M MFMNMTN NFNNNTO OFONOT'|
                       &'P PFPNPTQ QNR RFRNRTS SF'|
                       &'SNSTT TFTNTTU UFUNUTV VF'|
                       &'VNVTW WFWNWTX XFXNXTY YF'|
                       &'YNYTZ ZN')

Scroll:Name      STRING('   ALBAMEARNBAKBATBENBIABOBBRA'|
                       &'BROBUACACCARCENCHRCOECONCORCRU'|
                       &'DASDELDIADONDURELDEVEFELFISFLO'|
                       &'FREFUTGARGIBGOLGOSGREGUTHAMHEM'|
                       &'HOBHOTINGJASJONKAGKEAKIRKORKYO'|
                       &'LATLEOLIGLOUMACMAQMARMAUMCKMER'|
                       &'MILMONMORNATNOLOKEPAGPAUPETPIN'|
                       &'PORPULRAUREYROBROSRUBSALSCASCH'|
                       &'SCRSHASIGSKISNASOUSTESTISUNTAY'|
                       &'TIRTUCVANWACWASWEIWIEWIMWOLYOR')

OverrideCharacters   STRING('`!"<0A3h>$%%^&*()''-=_+][#;~@:/.,?\| ')
StepClass.Init PROCEDURE(BYTE Controls)
  CODE
    SELF.Controls = Controls

StepClass.Kill PROCEDURE
  CODE

StepClass.GetPercentile PROCEDURE(? Value)
  CODE
    RETURN 50

StepClass.GetValue PROCEDURE(BYTE Percentile)
  CODE
    RETURN ''

StepClass.SetLimit PROCEDURE(? L,? H)
  CODE

StepClass.SetLimitNeeded PROCEDURE
  CODE
    RETURN 1

StepLongClass.GetPercentile PROCEDURE(? Value)
R BYTE,AUTO
  CODE ! Allows out of range values
    IF SELF.Low = SELF.High
      RETURN 50
    END
    R = (Value - SELF.Low) * (100 / (SELF.High - SELF.Low))
    IF BAND(SELF.Controls,ScrollSort:Descending)
      R = 100 - R
    END
    RETURN CHOOSE(R = 0,1,R)

StepLongClass.GetValue PROCEDURE(BYTE P)
  CODE
    IF BAND(SELF.Controls,ScrollSort:Descending)
      P = 100 - P
    END
    RETURN SELF.Low + (SELF.High - SELF.Low) * (P / 100)

StepLongClass.SetLimit PROCEDURE(? low,? high)
  CODE
    IF BAND(SELF.Controls,ScrollSort:Descending)
      SELF.Low = High
      SELF.High = Low
    ELSE
      SELF.Low = Low
      SELF.High = High
    END

StepRealClass.GetPercentile PROCEDURE(? Value)
R BYTE,AUTO
  CODE  ! Allows out of range values
    IF SELF.Low = SELF.High
      RETURN 50
    END
    R = ((Value - SELF.Low) * 100) / (SELF.High - SELF.Low)
    IF BAND(SELF.Controls,ScrollSort:Descending)
      R = 100 - R
    END
    RETURN CHOOSE(R = 0,1,R)

StepRealClass.GetValue PROCEDURE(BYTE P)
  CODE
    IF BAND(SELF.Controls,ScrollSort:Descending)
      P = 100 - P
    END
    RETURN SELF.Low + (SELF.High - SELF.Low) * P / 100

StepRealClass.SetLimit PROCEDURE(? low,? high)
  CODE
    IF BAND(SELF.Controls,ScrollSort:Descending)
      SELF.Low = High
      SELF.High = Low
    ELSE
      SELF.Low = Low
      SELF.High = High
    END

StepCustomClass.AddItem PROCEDURE(STRING s)
  CODE
    ASSERT(~(SELF.Entries &= NULL))
    SELF.Entries.Item &= NEW CSTRING(LEN(s)+1)
    SELF.Entries.Item = s
    ADD(SELF.Entries)

StepStringClass.Init PROCEDURE (BYTE Controls, BYTE Mode)
ValidChars  STRING(255),AUTO
Chars       UNSIGNED,AUTO
I           UNSIGNED,AUTO
  CODE
    SELF.LookupMode = Mode
    PARENT.Init(Controls)
    CASE Mode
    OF ScrollBy:Name
      SELF.Ref &= Scroll:Name
      SELF.TestLen = 3
    OF ScrollBy:Alpha
      SELF.Ref &= Scroll:Alpha
      SELF.TestLen = 2
    OF ScrollBy:Runtime
      SELF.Ref &= NEW STRING(400)
      SELF.TestLen = 4
      Chars = 0

      LOOP I = 1 TO 255   ! Compute string of valid sort characters
        IF BAND(Controls,ScrollSort:AllowAlt) AND INSTRING(CHR(I),OverrideCharacters) OR |
           BAND(Controls,ScrollSort:AllowNumeric) AND CHR(I) >= '0' AND CHR(I) <= '9' OR |
           BAND(Controls,ScrollSort:AllowAlpha) AND ISALPHA(CHR(I)) AND |
               (BAND(Controls,ScrollSort:CaseSensitive) OR ISUPPER(CHR(I)))
          Chars += 1
          ValidChars [Chars] = CHR (I)
        END
      END
      SELF.SortChars &= NEW CSTRING (Chars + 1)
      SELF.SortChars  = ValidChars [1 : Chars]
    END


StepCustomClass.Init PROCEDURE(BYTE Controls)
  CODE
    PARENT.Init(Controls)
    SELF.Entries &= NEW CStringList

StepStringClass.Kill PROCEDURE
  CODE
    IF SELF.LookupMode = ScrollBy:RunTime
      DISPOSE(SELF.Ref)
    END
    DISPOSE(SELF.SortChars)

StepCustomClass.Kill PROCEDURE
I UNSIGNED,AUTO
  CODE
    LOOP I = 1 TO RECORDS(SELF.Entries)
      GET(SELF.Entries,I)
      DISPOSE(SELF.Entries.Item)
    END
    DISPOSE(SELF.Entries)

StepStringClass.Unhash PROCEDURE(LONG l)
RetVal STRING(4),AUTO
I BYTE,AUTO
Base USHORT,AUTO
  CODE
    Base = LEN(SELF.SortChars)
    ASSERT(Base)
    LOOP I = 4 TO 1 BY -1
      RetVal[I] = SELF.SortChars[L%Base + 1]
      L /= Base
    END
    RETURN RetVal

StepStringClass.SetLimit PROCEDURE(? l,? h)
MinLen UNSIGNED,AUTO
Common UNSIGNED,AUTO
LowValue  STRING(4),AUTO
HighValue STRING(4),AUTO
I      UNSIGNED,AUTO
Delta  LONG,AUTO
LowVal LONG,AUTO
Low CSTRING(80)
High CSTRING(80)
  CODE
    Low = CLIP(l)
    High = CLIP(h)
    IF LEN(High) < LEN(Low)
      MinLen = LEN(High)
    ELSE
      MinLen = LEN(Low)
    END
    LOOP Common = 1 TO MinLen     ! Find the common length of the limits
    UNTIL Low[Common] <> High[Common]
    SELF.Root = CHOOSE(Common > 1,Low[ 1 : Common - 1 ],'') ! Common is first non-common character
    LowValue = Low[ Common : LEN(Low) ]
    LOOP I = 2 + LEN(Low) - Common TO 4
      LowValue[I] = SELF.SortChars[1]    ! 'Clear(,-1)'
    END
    HighValue = High[ Common : LEN(High) ]
    LOOP I = 2 + LEN(High) - Common TO 4
      HighValue[I] = SELF.SortChars[LEN(SELF.SortChars)] ! 'Clear(,1)'
    END
    LowVal = SELF.Hash(LowValue)
    Delta = (SELF.Hash(HighValue) - LowVal) / 100
    IF BAND(SELF.Controls,ScrollSort:Descending)
      LOOP I = 99 TO 0 BY -1
        SELF.Ref[1+I*4 : 4+I*4] = SELF.Unhash(LowVal)
        LowVal += Delta
      END
    ELSE
      LOOP I = 0 TO 99
        SELF.Ref[1+I*4 : 4+I*4] = SELF.Unhash(LowVal)
        LowVal += Delta
      END
    END

StepStringClass.SetLimitNeeded PROCEDURE
  CODE
    RETURN CHOOSE(SELF.LookupMode = ScrollBy:RunTime)

StepStringClass.GetPercentile PROCEDURE(? Value)
I BYTE,AUTO
Match CSTRING(80)
  CODE
    IF LEN(SELF.Root)
?     ASSERT(SELF.Root = SUB(Value,1,LEN(SELF.Root)))
      Match = SUB(Value,LEN(SELF.Root)+1,SELF.TestLen+1)
    ELSE
      Match = Value
    END
    IF ~BAND(SELF.Controls,ScrollSort:CaseSensitive)
      Match = UPPER(Match)
    END
    LOOP I = 0 TO 99
      IF SELF.Ref[I*SELF.TestLen+1:(I+1)*SELF.TestLen]>Match
        BREAK
      END
    END
    IF BAND(SELF.Controls,ScrollSort:Descending)
      I = 100 - I
    END
    RETURN CHOOSE(I = 0,1,I)

StepCustomClass.GetPercentile PROCEDURE(? Value)
I UNSIGNED,AUTO
  CODE
    LOOP I = 1 TO RECORDS(SELF.Entries)
      GET(SELF.Entries,I)
      IF BAND(SELF.Controls,ScrollSort:CaseSensitive)
        IF SELF.Entries.Item<Value
          BREAK
        END
      ELSE
        IF SELF.Entries.Item<UPPER(Value)
          BREAK
        END
      END
    END
    I = ((I-1)*100) / RECORDS(SELF.Entries)
    IF BAND(SELF.Controls,ScrollSort:Descending)
      I = 100 - I
    END
    RETURN CHOOSE(I = 0,1,I)

StepStringClass.GetValue PROCEDURE(BYTE P)
  CODE
    IF BAND(SELF.Controls,ScrollSort:Descending)
      P = 100 - P
    END
    IF P = 0
      P = 1
    END
    RETURN SELF.Root & SELF.Ref[(P-1)*SELF.TestLen+1 : P*SELF.TestLen ]

StepCustomClass.GetValue PROCEDURE(BYTE P)
  CODE
    IF BAND(SELF.Controls,ScrollSort:Descending)
      P = 100 - P
    END
    GET(SELF.Entries,P * RECORDS(SELF.Entries) / 100)
    ASSERT(~ERRORCODE())
    RETURN SELF.Entries.Item

StepStringClass.Hash PROCEDURE(STRING Value)
Base USHORT,AUTO
Result LONG(0)
I BYTE,AUTO
Digit BYTE,AUTO
  CODE
    Base = LEN(SELF.SortChars)
    IF ~BAND(SELF.Controls,ScrollSort:CaseSensitive)
      Value = UPPER(Value)
    END
    LOOP I = 1 TO 4
      Digit = INSTRING(Value[I],SELF.SortChars)
      IF Digit THEN Digit -= 1 .
      Result = Result * Base + Digit
    END
    RETURN Result

StandardBehavior.Init PROCEDURE(QUEUE Q, *STRING Pos, SIGNED LC)
  CODE
  SELF.Q &= Q
  SELF.S &= Pos
  SELF.LC = LC

StandardBehavior.IListControl.GetSelectedItem PROCEDURE()
  CODE
     RETURN CHOICE(SELF.LC) - SELF.LC{PROP:YOrigin} + 1

StandardBehavior.IListControl.Choice PROCEDURE
  CODE
  RETURN CHOICE(SELF.Lc)

StandardBehavior.IListControl.SetChoice PROCEDURE(SIGNED NC)
  CODE
  SELF.LC{PROP:SelStart} = NC

StandardBehavior.IListControl.GetControl PROCEDURE
  CODE
  RETURN SELF.Lc

StandardBehavior.IListControl.SetControl PROCEDURE(SIGNED NC)
  CODE
  SELF.Lc = NC

StandardBehavior.IListControl.GetItems PROCEDURE
  CODE
  RETURN SELF.Lc{PROP:Items}

StandardBehavior.IListControl.GetVisible PROCEDURE
  CODE
  RETURN SELF.Lc{PROP:Visible}

StandardBehavior.BrowseQueue.Records PROCEDURE

  CODE
  RETURN RECORDS(SELF.Q)

StandardBehavior.BrowseQueue.Insert PROCEDURE

  CODE
  ADD(SELF.Q)

StandardBehavior.BrowseQueue.Insert PROCEDURE(UNSIGNED RowNum)

  CODE
  ADD(SELF.Q, RowNum)

StandardBehavior.BrowseQueue.Fetch PROCEDURE(UNSIGNED RowNum)

  CODE
  GET(SELF.Q, RowNum)

StandardBehavior.BrowseQueue.Update PROCEDURE

  CODE
  PUT(SELF.Q)

StandardBehavior.BrowseQueue.Delete PROCEDURE

  CODE
  DELETE(SELF.Q)

StandardBehavior.BrowseQueue.Free PROCEDURE

  CODE
  FREE(SELF.Q)

StandardBehavior.BrowseQueue.Who PROCEDURE(UNSIGNED ColNum)

  CODE
  RETURN WHO(SELF.Q, ColNum)

StandardBehavior.BrowseQueue.GetViewPosition PROCEDURE

  CODE
  RETURN SELF.S

StandardBehavior.BrowseQueue.SetViewPosition PROCEDURE(STRING S)

  CODE
  SELF.S = S

BrowseClass.AddEditControl PROCEDURE(<EditClass EC>,UNSIGNED Id,BYTE Free)
  CODE
    SELF.CheckEIP
    SELF.EIP.AddControl(EC,Id,Free)

BrowseClass.AddField PROCEDURE(*? FromFile,*? FromQueue)
  CODE
    SELF.Fields.AddPair(FromFile,FromQueue)

BrowseClass.AddField PROCEDURE(*string FromFile,*string FromQueue)
  CODE
    SELF.Fields.AddPair(FromFile,FromQueue)

BrowseClass.AddField PROCEDURE(*long FromFile,*long FromQueue)
  CODE
    SELF.Fields.AddPair(FromFile,FromQueue)

BrowseClass.AddItem PROCEDURE( RecordProcessor RP )
  CODE
  ASSERT(~SELF.Processors &= NULL,'Object not initialized')
  SELF.Processors.P &= RP
  ADD(SELF.Processors)

BrowseClass.AddResetField PROCEDURE(*? Left)
  CODE
    ASSERT(~(SELF.Sort.Resets &= NULL))
    SELF.Sort.Resets.AddItem(Left)

BrowseClass.AddResetField PROCEDURE(*string Left)
  CODE
    ASSERT(~(SELF.Sort.Resets &= NULL))
    SELF.Sort.Resets.AddItem(Left)

BrowseClass.AddLocator PROCEDURE(LocatorClass L)
  CODE
    SELF.Sort.Locator &= L
    PUT(SELF.Sort)

BrowseClass.SetLocatorFromSort  PROCEDURE()
  CODE
    ASSERT(NOT SELF.Sort.Locator &= NULL)
    IF SELF.Sort.Order
       SELF.Sort.Locator.SetLocatorField(SELF.GetFirstSortField())
       SELF.Sort.Locator.UpdateWindow()
    END

BrowseClass.AddSortOrder PROCEDURE(<StepClass Th>,<Key K>)
SNum BYTE,AUTO
  CODE
    CLEAR(SELF.Sort)
    SNum = PARENT.AddSortOrder(K)
    SELF.Sort.Thumb &= Th
    SELF.Sort.Resets &= NEW FieldPairsClass
    SELF.Sort.Resets.Init
    PUT(SELF.Sort)
    ASSERT(~ERRORCODE())
    RETURN SNum

BrowseClass.AddToolbarTarget PROCEDURE(ToolbarClass T)
  CODE
    SELF.Toolbar &= T
    SELF.ToolbarItem &= NEW ToolbarListboxClass
    SELF.ToolbarItem.Browse &= SELF
    T.AddTarget(SELF.ToolbarItem,SELF.ILC.GetControl())
    SELF.UpdateToolbarButtons

BrowseClass.ApplyRange PROCEDURE
RVal BYTE
LI   SIGNED,AUTO
  CODE
    LI = SELF.ILC.GetItems()
    IF SELF.LastItems <> LI  AND  LI >= 0
      IF SELF.FileLoaded
        CLEAR(SELF.LastItems,1)
      ELSE
        SELF.LastItems = LI
        RVal = 1
      END
    END
    IF RVal OR PARENT.ApplyRange() OR ~SELF.Sort.Resets.Equal()
      SELF.LoadPending = 1
      RVal = 1
    END
    RETURN RVal

BrowseClass.Ask PROCEDURE(BYTE Req)
Response BYTE
  CODE
  LOOP
    SELF.Window.VCRRequest = VCR:None
    IF KEYCODE() = MouseRightUp
      SETKEYCODE(0)
    END
    IF SELF.AskProcedure
      IF Req=InsertRecord THEN
        IF SELF.PrimeRecord()
          RETURN RequestCancelled
        END
      END
      Response = SELF.Window.Run(SELF.AskProcedure,Req)
      SELF.ResetFromAsk(Req,Response)
    ELSE
      Response = SELF.AskRecord(Req)
    END
  UNTIL SELF.Window.VCRRequest = VCR:None
  RETURN Response

BrowseClass.AskRecord PROCEDURE(BYTE Req)
  CODE
  SELF.CheckEIP()
  RETURN SELF.EIP.Run(Req)

BrowseClass.CheckEIP PROCEDURE
  CODE
  IF SELF.EIP &= NULL
    SELF.EIP &= NEW BrowseEIPManager
    SELF.FreeEIP = 1
  END
  SELF.EIP.Arrow &= SELF.ArrowAction
  SELF.EIP.DeleteKeyAction = SELF.DeleteAction
  SELF.EIP.BC &= SELF
  SELF.EIP.Enter &= SELF.EnterAction
  SELF.EIP.Eq &= SELF.EditList   ! Certain amount of 'interface swapping' so that EIP manager can mascarade under 'old' browse EIP interface
  SELF.EIP.Errors &= SELF.Window.Errors
  SELF.EIP.Fields &= SELF.Fields
  SELF.EIP.FocusLoss &= SELF.FocusLossAction
  SELF.EIP.ListControl = SELF.ILC.GetControl()
  SELF.EIP.Tab &= SELF.TabAction
  SELF.EIP.VCRRequest &= SELF.Window.VCRRequest


BrowseClass.Fetch PROCEDURE(BYTE Direction)
SkipFirst BYTE(0)
  CODE
  IF SELF.QuickScan AND SELF.ItemsToFill > 1
    SELF.Primary.SetQuickScan(1)
  END
  IF SELF.ListQueue.RECORDS()
    SELF.ListQueue.Fetch(CHOOSE(Direction = FillForward,SELF.ListQueue.Records(),1))
    RESET(SELF.View,SELF.ListQueue.GetViewPosition())
    SkipFirst = 1
  END
  IF SELF.UseMRP
     IF SELF.View{PROP:IPRequestCount} = 0
        IF SELF.ItemsToFill>60
           SELF.View{PROP:IPRequestCount} = 60
        ELSE
           SELF.View{PROP:IPRequestCount} = SELF.ItemsToFill
        END
     END
  END
  LOOP WHILE SELF.ItemsToFill
    IF SELF.UseMRP
       IF SELF.View{PROP:IPRequestCount} = 0
          IF SELF.ItemsToFill>60
             SELF.View{PROP:IPRequestCount} = 60
          ELSE
             SELF.View{PROP:IPRequestCount} = SELF.ItemsToFill
          END
       END
    END
    CASE CHOOSE(Direction = FillForward,SELF.Next(),SELF.Previous())
    OF Level:Notify
      BREAK
    OF Level:Fatal
      RETURN
    END
    IF SkipFirst
      SkipFirst = FALSE
      IF POSITION(SELF.View)= SELF.ListQueue.GetViewPosition()
        CYCLE
      END
    END
    IF SELF.ListQueue.Records() = SELF.LastItems
      SELF.ListQueue.Fetch(CHOOSE(Direction = FillForward,1,SELF.ListQueue.Records()))
      SELF.ListQueue.Delete()
    END
    SELF.SetQueueRecord
    IF Direction = FillForward
      SELF.ListQueue.Insert()
    ELSE
      SELF.ListQueue.Insert(1)
    END
    SELF.ItemsToFill -= 1
  END
  IF SELF.QuickScan
    SELF.Primary.SetQuickScan(0)
  END

BrowseClass.SetUseWaitCursor  PROCEDURE(BYTE useCursor = 1)
 CODE
    SELF.UseWaitCursor = useCursor

BrowseClass.ShowWaitCursor PROCEDURE(BYTE showCursor = 1)
 CODE
    IF SELF.UseWaitCursor
       SELF.DoShowWaitCursor(showCursor)
    END
    
BrowseClass.DoShowWaitCursor PROCEDURE(BYTE showCursor = 1)
 CODE
    IF showCursor
       SETCURSOR(CURSOR:Wait)
    ELSE
       SETCURSOR()
    END
    
BrowseClass.SetUseMRP         PROCEDURE(BYTE UseMRP=True)
 CODE
    SELF.UseMRP = UseMRP

BrowseClass.GetUseMRP         PROCEDURE()
 CODE
    RETURN(SELF.UseMRP)

BrowseClass.ResetFieldS PROCEDURE
  CODE
    SELF.Fields.Kill
    SELF.Fields.Init

BrowseClass.Init  PROCEDURE(SIGNED ListBox,*STRING Posit,VIEW V,QUEUE Q,RelationManager F,WindowManager WM)

  CODE
  SELF.Behavior &= NEW StandardBehavior
  SELF.Behavior.Init(Q,Posit,ListBox)
  SELF.Init(SELF.Behavior.IListControl, V, SELF.Behavior.BrowseQueue, F, WM)

BrowseClass.Init  PROCEDURE(IListControl LI,VIEW V,BrowseQueue LQ,RelationManager F,WindowManager WM)
  CODE
    SELF.SetUseWaitCursor(true)
    SELF.UseMRP = True
    SELF.PrevChoice = 0
    SELF.Window &= WM
    SELF.ListQueue &= LQ
    SELF.ILC &= LI
    SELF.Sort &= NEW BrowseSortOrder
    SELF.Fields &= NEW FieldPairsClass
    SELF.Fields.Init
    SELF.Processors &= NEW ProcessorQueue
    SELF.Popup &= NEW PopupClass
    SELF.EditList &= NEW BrowseEditQueue
    SELF.RetainRow = 1
    ASSERT(~SELF.Popup&=NULL)
    SELF.Popup.Init
    PARENT.Init(V,F,SELF.Sort)
    SELF.Window.AddItem(SELF)
    IF SELF.Selecting
      SELF.Primary.Me.UseFile(UseType:Returns)
      SELF.Buffer = SELF.Primary.Me.SaveBuffer()
    END


BrowseClass.Kill PROCEDURE
I UNSIGNED,AUTO
  CODE
    IF ~(SELF.Sort &= NULL)
      LOOP I = 1 TO RECORDS(SELF.Sort)
        GET(SELF.Sort,I)
        IF ~(SELF.Sort.Thumb &= NULL)
          SELF.Sort.Thumb.Kill
        END
        SELF.Sort.Resets.Kill
        DISPOSE(SELF.Sort.Resets)
      END
    END
    IF ~(SELF.Window &= NULL)
      SELF.Window.RemoveItem(SELF.WindowComponent)
    END
    PARENT.Kill
    DISPOSE(SELF.Sort)
    IF ~SELF.Fields &= NULL
      SELF.Fields.Kill
      DISPOSE(SELF.Fields)
    END
    IF ~SELF.Popup &= NULL
      SELF.Popup.Kill
      DISPOSE(SELF.Popup)
    END
    DISPOSE(SELF.ToolbarItem)
    IF ~SELF.Query &= NULL
      SELF.Query.Kill
    END
    IF SELF.FreeEIP
      DISPOSE(SELF.EIP)
      SELF.FreeEIP = 0
    END
    IF ~SELF.EditList &= NULL
      LOOP I = 1 TO RECORDS(SELF.EditList)
        GET(SELF.EditList,I)
        IF SELF.EditList.FreeUp
          DISPOSE(SELF.EditList.Control)
        END
      END
      DISPOSE(SELF.EditList)
    END
    IF ~SELF.Behavior&= NULL
      self.ListQueue &= NULL
      SELF.ILC &= NULL
      DISPOSE(SELF.Behavior)
    END
    LOOP I = 1 TO RECORDS(SELF.Processors)
      GET(SELF.Processors,I)
      SELF.Processors.P.TakeClose()
    END
    DISPOSE(SELF.Processors)
    IF SELF.UseMRP
       SELF.View{PROP:IPRequestCount} = 0
    END

BrowseClass.Next PROCEDURE
Res BYTE,AUTO
  CODE
    Res = PARENT.Next()
    CASE Res
    OF Level:Notify
      SELF.UpdateResets
    OF Level:Fatal
      POST(EVENT:CloseWindow)
    END
    RETURN Res

BrowseClass.NotifyUpdateError PROCEDURE
  CODE
  SELF.Primary.Me.Throw(Msg:ConcurrencyFailedFromBrowse)
  RETURN TRUE

BrowseClass.PostNewSelection PROCEDURE
  CODE
  IF  SELF.PrevChoice <> 0  OR  SELF.CurrentChoice <> 0  OR  KEYCODE() = MouseRightUp
    SELF.PrevChoice = SELF.CurrentChoice
    SELF.ILC.SetChoice(SELF.CurrentChoice)
    POST(Event:NewSelection,SELF.ILC.GetControl())
  END

BrowseClass.Previous  PROCEDURE
Res BYTE,AUTO
  CODE
    Res = PARENT.Previous()
    CASE Res
    OF Level:Notify
      SELF.UpdateResets
    OF Level:Fatal
      POST(EVENT:CloseWindow)
    END
    RETURN Res

BrowseClass.Records PROCEDURE
RVal BYTE,AUTO
  CODE
    RVal = CHOOSE(SELF.ListQueue.Records())
    IF ~SELF.Sort.Locator &= NULL
      SELF.Sort.Locator.SetEnabled(RVal)
    END
    IF ~RVal
      SELF.CurrentChoice = 0
    END
    RETURN SELF.ListQueue.Records()

BrowseClass.ResetFromAsk PROCEDURE(*BYTE Request,*BYTE Response)
lFilter CSTRING(2048),AUTO
  CODE
  IF Response = RequestCompleted
    FLUSH(SELF.View)
    !
    ! If SQL() is used in the PROP:Filter EVALUATE(SELF.View{PROP:Filter}) will always evalueate to
    ! true a string not equal "" that is the content of the SQL() function
    ! That is why when Request = ChangeRecord and an SQL() filter is used the SELF.ResetFromFile is executed
    ! The client can not evaluate the SQL() function, this is done only in the server.
    !
    lFilter = SELF.View{PROP:Filter}
    IF SELF.Primary.Me.File{PROP:SQLDriver}='1'
       Do ReplaceSQLFilterForEvaluate
    END
    IF Request = DeleteRecord OR (Request = ChangeRecord AND SELF.View{PROP:Filter} AND EVALUATE(lFilter)=False)
      SELF.ListQueue.Delete()
      SELF.ResetQueue(Reset:Queue)
    ELSE
      SELF.ResetFromFile
    END
  ELSE
    SELF.ResetQueue(Reset:Queue)
  END
  IF SELF.Window.VCRRequest = VCR:Insert OR SELF.Window.VCRRequest = VCR:Forward AND Request = InsertRecord
    Request = InsertRecord
    GET(SELF.Primary.Me.File,0)
    CLEAR(SELF.Primary.Me.File)
  ELSE
    SELF.TakeVCRScroll(SELF.Window.VCRRequest)
  END
  IF SELF.Window.VCRRequest = VCR:None
    SELF.ResetFromView
    SELF.UpdateWindow
    SELF.PostNewSelection
    SELECT(SELF.ILC.GetControl())
  END

!
! This will replace the SQL( for ''=SQL(
!
ReplaceSQLFilterForEvaluate ROUTINE
 DATA
lPos    SHORT,AUTO
lStart  SHORT,AUTO
lPosPar SHORT,AUTO
lStrStart   SHORT
lLast   SHORT
 CODE
   lStrStart = 1
   LOOP
      lLast = LEN(lFilter)
      IF lStrStart+4>lLast
         BREAK
      END
      lStart=0
      lPos = STRPOS( lFilter[(lStrStart):(lLast)],'^SQL *(' , true)
      IF lPos=0
          lPos = STRPOS( lFilter[(lStrStart):(lLast)], '[ |(|~|]SQL *(' , true)
          lStart=1
      END
      IF lPos
         lPos+=lStrStart-1+lStart
         lPosPar = INSTRING('(',lFilter[(lPos):(lLast)],1,1)
         lFilter = lFilter[1:(lPos-1)]&' ''''=SQL('&lFilter[(lPos+lPospar):(lLast)]
         lStrStart = lPos+lPospar+1
      ELSE
         BREAK
      END
   END

BrowseClass.ResetFromBuffer PROCEDURE
  CODE
    IF SELF.Sort.MainKey &= NULL
      SELF.Reset(1)
    ELSE
      SELF.Reset(SELF.Primary.Me.GetComponents(SELF.Sort.MainKey))
    END
    SELF.ResetQueue(Reset:Done)
    SELF.UpdateWindow

BrowseClass.ResetFromFile PROCEDURE
  CODE
    RESET(SELF.View,SELF.Primary.Me.File)
    SELF.ResetQueue(Reset:Done)

BrowseClass.ResetFromView PROCEDURE
  CODE
    SELF.ShowWaitCursor(True)
    SELF.ResetThumbLimits
    SELF.UpdateThumb
    SELF.ShowWaitCursor(False)

! Strategy :
! Fill forward from starting position.
! The 'highlight' is either
!    a) The current choice (Reset:Queue)
!    b) The First record read forwards (Reset:Done)
!    c) The first record read backwards (when Reset:Done is beyond EOF)
! If ResetDone and RetainingRow it is -probably- better not to fill the whole page.
! Find where highlighted record is in current set and add records (first to beginning, then end) to fill page
! As this can possible result in too many records, start deleting, trying to move CurrentChoice to correct position
! Noteworthy tweaks :-
!   If loading from start of record set there is no point going backwards
!   If FromQueue then load from -first- element not -required- one (you will probably get lucky and find required where you want it)
!   If EOF hit on read forward then no point attempting to read forward again
BrowseClass.ResetQueue PROCEDURE(BYTE RefreshMode)
HighlightRequired UNSIGNED
TopMargin         LONG
HighlightedPosition      STRING(1024)
FromTop           BYTE
EofHit            BYTE,AUTO
  CODE
  IF ~SELF.ActiveInvisible AND ~SELF.ILC.GetVisible()
    SELF.LoadPending = 1
    RETURN
  END
  SELF.Loaded = 1
  SELF.LoadPending = 0
  SELF.ShowWaitCursor(True)
  IF ~SELF.CurrentChoice THEN SELF.CurrentChoice = 1.
  IF RefreshMode = Reset:Done
    IF SELF.RetainRow
      !The window was resized and now the browse is smaller and the selected item was
      !left outside the limit
      IF SELF.CurrentChoice>SELF.LastItems AND SELF.LastItems>0
         HighLightedPosition = SELF.ListQueue.GetViewPosition()
         TopMargin=SELF.ListQueue.Records()-SELF.LastItems
         LOOP TopMargin TIMES
             SELF.ListQueue.Fetch(1)
             SELF.ListQueue.Delete()
             SELF.CurrentChoice-=1
         END
         TopMargin=0
         SELF.ILC.SetChoice(SELF.CurrentChoice)
         SELF.ListQueue.Fetch(SELF.CurrentChoice)
      END
      !
      TopMargin = SELF.CurrentChoice - 1
    END
  ELSE
    IF SELF.ListQueue.Records()
      SELF.ListQueue.Fetch(SELF.CurrentChoice)
      IF ERRORCODE()
        SELF.ListQueue.Fetch(SELF.ListQueue.Records())
      END
      HighlightedPosition = SELF.ListQueue.GetViewPosition()
      SELF.ListQueue.Fetch(1)
      RESET(SELF.View,SELF.ListQueue.GetViewPosition())
    ELSE
      FromTop = 1
      SELF.Reset()
    END
  END
  IF SELF.RetainRow
    HighlightRequired = SELF.CurrentChoice
  END
  SELF.ListQueue.Free()
  SELF.ItemsToFill = SELF.LastItems-TopMargin
  SELF.Fetch(FillForward)
  EofHit = CHOOSE(SELF.ItemsToFill)
  IF ~HighlightedPosition AND SELF.ListQueue.Records()
    SELF.ListQueue.Fetch(1)
    HighLightedPosition = SELF.ListQueue.GetViewPosition()
  END
  DO ResetCurrentChoice
  IF ~SELF.ListQueue.Records()  ! Probably a locate beyond EOF
    SELF.Reset
  END
  SELF.ItemsToFill = CHOOSE(SELF.AllowUnfilled=0,SELF.LastItems - SELF.ListQueue.Records(),0)
  IF ~FromTop AND ( SELF.ItemsToFill OR TopMargin > 0 )
    SELF.ItemsToFill = CHOOSE(SELF.ItemsToFill > TopMargin,SELF.ItemsToFill,TopMargin)
    SELF.Fetch(FillBackward)
    IF ~HighlightedPosition AND SELF.ListQueue.Records()
      SELF.ListQueue.Fetch(SELF.ListQueue.Records())
      HighLightedPosition = SELF.ListQueue.GetViewPosition()
    END
    DO ResetCurrentChoice
  END
  IF SELF.RetainRow AND (TopMargin < 0 OR SELF.ListQueue.Records() < SELF.LastItems AND ~EofHit)
    SELF.ItemsToFill = CHOOSE(-TopMargin > SELF.LastItems-SELF.ListQueue.Records(),-TopMargin,SELF.LastItems-SELF.ListQueue.Records())
    SELF.Fetch(FillForward)
    DO ResetCurrentChoice
  END
  LOOP WHILE SELF.ListQueue.Records() > SELF.LastItems ! May have happened if over-read to get row correct
    IF TopMargin < 0
      SELF.ListQueue.Fetch(1)
      SELF.ListQueue.Delete()
      TopMargin += 1
      SELF.CurrentChoice -= 1
    ELSE
      SELF.ListQueue.Fetch(SELF.ListQueue.Records())
      SELF.ListQueue.Delete()
    END
  END
  IF ~SELF.CurrentChoice
    SELF.CurrentChoice = 1
  END
  IF SELF.Records()
    SELF.UpdateBuffer
  ELSE
    CLEAR(SELF.Primary.Me.File)
  END
  SELF.ShowWaitCursor(False)

ResetCurrentChoice ROUTINE
  IF HighlightedPosition
    LOOP SELF.CurrentChoice = 1 TO SELF.ListQueue.Records()
      SELF.ListQueue.Fetch(SELF.CurrentChoice)
    UNTIL SELF.ListQueue.GetViewPosition() = HighLightedPosition
    IF SELF.CurrentChoice > SELF.ListQueue.Records()
      SELF.CurrentChoice = 0
    END
  ELSE
    SELF.CurrentChoice = 1
  END
  IF SELF.RetainRow
    TopMargin = HighlightRequired-SELF.CurrentChoice
  END

BrowseClass.ResetResets PROCEDURE
  CODE
    SELF.Sort.Resets.AssignLeftToRight

BrowseClass.ResetSort PROCEDURE(BYTE Force)
  CODE
    RETURN SELF.SetSort(POINTER(SELF.Sort),Force)

! Thumb limits are set using the extrema of the underlying view
BrowseClass.ResetThumbLimits PROCEDURE
HighValue ANY
  CODE
  IF SELF.Sort.Thumb &= NULL OR ~SELF.Sort.Thumb.SetLimitNeeded() OR ~SELF.AllowUnfilled AND SELF.ILC.GetItems() > SELF.ListQueue.Records()
    RETURN
  END
  SELF.Reset
  SELF.View{PROP:IPRequestCount} = 0
  IF SELF.Previous()
    RETURN
  END
  HighValue = SELF.Sort.FreeElement
  SELF.Reset
  SELF.View{PROP:IPRequestCount} = 0
  IF SELF.Next()
    RETURN
  END
  SELF.Sort.Thumb.SetLimit(SELF.Sort.FreeElement,HighValue)

BrowseClass.ScrollOne PROCEDURE(SIGNED Ev)
  CODE
  SELF.CurrentEvent = Ev
  IF Ev = Event:ScrollUp AND SELF.CurrentChoice > 1
    SELF.CurrentChoice -= 1
  ELSIF Ev = Event:ScrollDown AND SELF.CurrentChoice < SELF.ListQueue.Records()
    SELF.CurrentChoice += 1
  ELSIF ~SELF.FileLoaded
    SELF.ItemsToFill = 1
    SELF.Fetch(CHOOSE(Ev = EVENT:ScrollUp,1,2))
  END

BrowseClass.ScrollPage PROCEDURE(SIGNED Ev)
LI SIGNED,AUTO
SEL SIGNED,AUTO
  CODE
  SELF.CurrentEvent = Ev
  Li = SELF.ILC.GetItems()
  IF ~SELF.FileLoaded
    SELF.ItemsToFill = LI
    SELF.Fetch(CHOOSE(Ev = EVENT:PageUp,1,2))                           ! Fill with next read(s)
    LI = SELF.ItemsToFill
  END
  IF Ev = Event:PageUp
    SELF.CurrentChoice -= LI
    IF SELF.CurrentChoice < 1
      SELF.CurrentChoice = 1
    END
  ELSE
    SELF.CurrentChoice += LI
    IF SELF.CurrentChoice > SELF.ListQueue.Records()
      SELF.CurrentChoice = SELF.ListQueue.Records()
    END
  END
  IF SELF.FileLoaded

    SEL = SELF.ILC.GetSelectedItem()    !SELF.ILC.Choice() - SELF.ILC.GetControl(){PROP:YOrigin} + 1
    IF SEL = 1
       SELF.ILC.SetChoice(SELF.CurrentChoice+1)
       SELF.ILC.SetChoice(SELF.CurrentChoice)
    ELSE
       SELF.ILC.SetChoice(SELF.CurrentChoice)
       SELF.ILC.SetChoice(SELF.CurrentChoice-SEL+1)
       SELF.ILC.SetChoice(SELF.CurrentChoice)
    END
  END

BrowseClass.ScrollEnd PROCEDURE(SIGNED Ev)
  CODE
  SELF.CurrentEvent = Ev
  IF ~SELF.FileLoaded
    SELF.ListQueue.Free()
    SELF.Reset
    SELF.ItemsToFill = SELF.ILC.GetItems()
    SELF.Fetch(CHOOSE(Ev = Event:ScrollTop,FillForward,FillBackward))                           ! Fill with next read(s)
  END
  SELF.CurrentChoice = CHOOSE(Ev = Event:ScrollTop,1,SELF.ListQueue.Records())

BrowseClass.SetAlerts PROCEDURE
I BYTE,AUTO
  CODE
    SELF.ILC.GetControl(){Prop:Alrt,MouseLeft2Index} = MouseLeft2
    SELF.ILC.GetControl(){Prop:Alrt,MouseRightIndex} = MouseRightUp
    SELF.ILC.GetControl(){Prop:Alrt,MouseRightIndex} = AppsKey
    SELF.HasThumb = CHOOSE(SELF.ILC.GetControl(){PROP:VScroll})
    SELF.ILC.GetControl(){PROP:VScroll} = 0 ! Not really the right place for this but we want to avoid the peek-a-boo scrollbar
    LOOP I = 1 TO RECORDS(SELF.Sort)
      GET(SELF.Sort,I)
      IF ~ (SELF.Sort.Locator &= NULL)
        SELF.Sort.Locator.SetAlerts(SELF.ILC.GetControl())
      END
    END
    IF SELF.EditViaPopup
       IF SELF.InsertControl
         SELF.ILC.GetControl(){Prop:Alrt,255} = InsertKey
         SELF.Popup.AddItemMimic(DefaultInsertName,SELF.InsertControl,'!'&DefaultInsertName)
       END
       IF SELF.ChangeControl
         SELF.ILC.GetControl(){Prop:Alrt,253} = CtrlEnter
         SELF.Popup.AddItemMimic(DefaultChangeName,SELF.ChangeControl,'!'&DefaultChangeName)
       END
       IF SELF.DeleteControl
         SELF.ILC.GetControl(){Prop:Alrt,254} = DeleteKey
         SELF.Popup.AddItemMimic(DefaultDeleteName,SELF.DeleteControl,'!'&DefaultDeleteName)
       END
       IF SELF.ViewControl
         SELF.ILC.GetControl(){PROP:Alrt,255} = ShiftEnter
         SELF.Popup.AddItemMimic(DefaultViewName, SELF.ViewControl, '!' & DefaultViewName)
       END
    END
    IF SELF.PrintControl
      SELF.Popup.AddItemMimic(DefaultPrintName,SELF.PrintControl,'!'&DefaultPrintName)
    END
    IF SELF.QueryControl
      IF SELF.Popup.GetItems()
         SELF.Popup.AddItem('-','Separator2',SELF.Popup.GetItems(),1)
      END
      SELF.Popup.AddItemMimic(DefaultQueryName,SELF.QueryControl,'!'&DefaultQueryName)
      IF SELF.Query.QkSupport AND ~(SELF.Popup &= NULL)
       SELF.Query.SetQuickPopup(SELF.Popup,SELF.QueryControl)
      END
    END
    IF SELF.SelectControl AND SELF.Selecting
      SELF.Popup.AddItemMimic(DefaultSelectName,SELF.SelectControl,'!'&DefaultSelectName)
    END
    IF SELF.ToolControl
      SELF.Popup.AddItem('-','ToolSeparator2',SELF.Popup.GetItems(),1)
      SELF.Popup.SetToolbox(SELF.Popup.AddItemMimic(DefaultToolName,SELF.ToolControl,'!'&DefaultToolName),0)
    END

BrowseClass.SetQueueRecord PROCEDURE
  CODE
    SELF.Fields.AssignLeftToRight
    SELF.ListQueue.SetViewPosition(POSITION(SELF.View))

BrowseClass.InitSort PROCEDURE(BYTE B)
RVal BYTE(0)
  CODE
    IF SELF.SetSort(B)
      IF ~SELF.Sort.Locator &= NULL
        SELF.Sort.Locator.Set
      END
      Rval = 1
    END
    RETURN RVal

BrowseClass.SetSort PROCEDURE(BYTE B,BYTE Force)
RVal         BYTE(0)
RangeChanged BYTE
  CODE
    RVal = SELF.InitSort(B)
    RangeChanged = SELF.ApplyRange()
    IF RangeChanged OR Rval OR Force OR ~SELF.Loaded OR SELF.LoadPending
      SELF.ResetResets
      SELF.ApplyOrder
      SELF.ApplyFilter
      IF (SELF.Selecting OR SELF.StartAtCurrent) AND ~SELF.Loaded
         IF SELF.Sort.MainKey &= NULL
            SELF.Reset(1)
         ELSE
            SELF.Reset(SELF.GetFreeElementPosition())
         END
         SELF.ResetQueue(Reset:Done)
      ELSIF SELF.ListQueue.Records()
         RESET(SELF.View,SELF.ListQueue.GetViewPosition())
         SELF.ResetQueue(Reset:Done)
      ELSE
        SELF.ResetQueue(Reset:Queue)
      END
      IF ~SELF.LoadPending
        SELF.PostNewSelection
        SELF.ResetFromView
        Rval = 1
      END
    END
    SELF.UpdateBuffer
    RETURN Rval

BrowseClass.TakeAcceptedLocator PROCEDURE
  CODE
    IF ~SELF.Sort.Locator &= NULL AND ACCEPTED() = SELF.Sort.Locator.Control
      IF SELF.Sort.Locator.TakeAccepted()
         IF SELF.Sort.MainKey &= NULL
            SELF.Reset(1)
         ELSE
            SELF.Reset(SELF.GetFreeElementPosition())
         END
         SELECT(SELF.ILC.GetControl())
         SELF.ResetQueue(Reset:Done)
         SELF.Sort.Locator.Reset
         SELF.UpdateWindow
         SELF.PostNewSelection
      END
    END

BrowseClass.TakeEvent PROCEDURE
VSP    REAL,AUTO
OldVsp LONG,AUTO
SEL    LONG,AUTO
  CODE
    CASE FIELD()
    OF 0
      SELF.CurrentChoice = SELF.ILC.Choice()

    OF SELF.ILC.GetControl()
      CASE EVENT()
      OF EVENT:ScrollUp
      OROF EVENT:ScrollDown
      OROF EVENT:PageUp
      OROF EVENT:PageDown
      OROF EVENT:ScrollTop
      OROF EVENT:ScrollBottom
        SELF.TakeScroll
      OF EVENT:ScrollDrag
         VSP = SELF.ILC.GetControl(){PROP:VScrollPos}
         OldVSP = VSP
         IF VSP <= 1
            POST(Event:ScrollTop,SELF.ILC.GetControl())
         ELSE
            IF SELF.ListQueue.RECORDS()>SELF.ILC.GetItems()
               VSP = SELF.ILC.GetControl(){PROP:VScrollPos}*100/(SELF.ListQueue.RECORDS()-SELF.ILC.GetItems())
            END
         END
         IF VSP >= 100
            VSP = 100
            POST(Event:ScrollBottom,SELF.ILC.GetControl())
         ELSE
            IF SELF.FileLoaded
              SEL = SELF.ILC.GetSelectedItem()    !SELF.ILC.Choice() - SELF.ILC.GetControl(){PROP:YOrigin} + 1
              SELF.CurrentChoice = (SELF.ILC.GetControl(){PROP:VScrollPos}/(SELF.ListQueue.RECORDS()-SELF.ILC.GetItems()))*SELF.ListQueue.RECORDS()
              SELF.TakeChoiceChanged()

              IF SEL = 1
                 SELF.ILC.SetChoice(SELF.CurrentChoice+1)
                 SELF.ILC.SetChoice(SELF.CurrentChoice)
              ELSE
                 SELF.ILC.SetChoice(SELF.CurrentChoice)
                 SELF.ILC.SetChoice(SELF.CurrentChoice-SEL+1)
                 SELF.ILC.SetChoice(SELF.CurrentChoice)
              END
              SELF.ILC.GetControl(){PROP:VScrollPos} = OldVSP
            ELSE
              IF ~(SELF.Sort.FreeElement &= NULL) AND ~(SELF.Sort.Thumb &= NULL)
                 SELF.Sort.FreeElement = SELF.Sort.Thumb.GetValue(VSP)
                 SELF.ResetFromBuffer
              ELSE
                 IF VSP < 50
                    POST(Event:PageUp,SELF.ILC.GetControl())
                 ELSE
                    POST(Event:PageDown,SELF.ILC.GetControl())
                 END
              END
            END
         END
      OF EVENT:AlertKey
        SELF.TakeKey
      OF EVENT:NewSelection
        SELF.TakeNewSelection
      OF EVENT:Locate
        SELF.TakeLocate
      END
    END
    IF SELF.QueryControl AND FIELD() = SELF.QueryControl
       IF EVENT() = EVENT:NewSelection
          ASSERT(~SELF.Query&=NULL)
          IF self.query.Take(SELF.Popup) THEN
             SELF.TakeLocate()
          END
       END
    END

    SELF.NeedRefresh = FALSE

    CASE ACCEPTED()
    OF 0
    OF SELF.DeleteControl
      SELF.Window.Update()
      IF  NOT SELF.NeedRefresh
        SELF.Ask(DeleteRecord)
      END
    OF SELF.ChangeControl
      SELF.Window.Update()
      IF  NOT SELF.NeedRefresh
        SELF.Ask(ChangeRecord)
      END
    OF SELF.InsertControl
      SELF.Window.Update()
      IF  NOT SELF.NeedRefresh
        SELF.Ask(InsertRecord)
      END
    OF SELF.ViewControl
      SELF.Window.Update
      IF  NOT SELF.NeedRefresh
        SELF.Ask(ViewRecord)
      END
    OF SELF.SelectControl
      SELF.Window.Response = RequestCompleted
      POST(EVENT:CloseWindow)
    OF SELF.PrintControl
      SELF.UpdateViewRecord
      IF  NOT SELF.NeedRefresh
        SELF.Window.Run(SELF.PrintProcedure,ProcessRecord)
        SELF.UpdateBuffer   ! Print procedure probably corrupts hot-fields
      END
    OF SELF.QueryControl
      CLEAR(SELF.Query.QkCurrentQuery) ! Set Query for non-QuickQBE Mode.
      SELF.TakeLocate
    OF SELF.ToolControl
      SELF.Popup.Toolbox('Browse Actions')
    ELSE
      SELF.TakeAcceptedLocator
    END
    IF  SELF.NeedRefresh
      SELF.ResetQueue (Reset:Done)
      SELF.NeedRefresh = FALSE
    ELSIF EVENT() = EVENT:CloseWindow AND SELF.Selecting
      IF SELF.Window.Response = RequestCompleted
        SELF.Primary.Me.RestoreBuffer(SELF.Buffer,0)
        IF SELF.SelectWholeRecord
          SELF.UpdateViewRecord
        ELSE
          SELF.UpdateBuffer
        END
      ELSE
        SELF.Primary.Me.RestoreBuffer(SELF.Buffer)
      END
    END

BrowseClass.TakeLocate PROCEDURE
CurSort USHORT,AUTO
I USHORT,AUTO
  CODE
    IF ~SELF.Query&=NULL
       IF SELF.Query.Ask()
          DO SS ! Set Sort.
       END
       IF SELF.Query.QkSupport AND ~(SELF.Popup &= NULL)
          SELF.Query.SetQuickPopup(SELF.Popup,SELF.QueryControl) ! Remap Right-click popup.
       END
    END

SS ROUTINE
  IF SELF.QueryShared
     CurSort = POINTER(SELF.Sort)
     LOOP I = 1 TO RECORDS(SELF.Sort)
        PARENT.SetSort(I)
        DO SF
     END
     PARENT.SetSort(CurSort)
  ELSE
     DO SF
  END
  SELF.ResetSort(1)

SF ROUTINE
  SELF.SetFilter(SELF.Query.GetFilter(),'9 - QBE')
  IF SELF.QueryResult
    SELF.QueryResult{PROP:Text} = SELF.Query.GetFilter()
  END

BrowseClass.TakeKey PROCEDURE
  CODE
  IF KEYCODE() = MouseRightUp
    IF SELF.ILC.GetControl(){PROPLIST:mousedownrow}>0
      SELF.CurrentChoice = SELF.ILC.GetControl(){PROPLIST:mousedownrow}
    END
    SELF.PostNewSelection
  ELSE
    IF SELF.ListQueue.Records()
      CASE KEYCODE()
      OF InsertKey
        DO CheckInsert
      OF DeleteKey
        IF SELF.DeleteControl AND NOT SELF.DeleteControl {PROP:Disable}
          POST(EVENT:Accepted, SELF.DeleteControl)
          DO HandledOut
        END
      OF CtrlEnter
        DO CheckChange
      OF ShiftEnter
        DO CheckView
      OF MouseLeft2
        IF SELF.Selecting
          IF SELF.SelectControl AND NOT SELF.SelectControl {PROP:Disable}
            POST(EVENT:Accepted, SELF.SelectControl)
            DO HandledOut
          END
        ELSE
          IF SELF.ILC.GetControl(){PROPLIST:MouseDownZone}<>LISTZONE:Header
             DO CheckChange
          END
        END
      OF AppsKey
         Do HandledOut
      ELSE
        DO CheckLocator
      END
    ELSE
      DO CheckLocator
      DO CheckInsert
    END
  END
  RETURN 0

CheckLocator ROUTINE
  IF ~(SELF.Sort.Locator &= NULL)
    IF SELF.Sort.Locator.TakeKey()
      IF SELF.Sort.MainKey &= NULL
         SELF.Reset(1)
      ELSE
         SELF.Reset(SELF.GetFreeElementPosition())
      END
      SELF.ResetQueue(Reset:Done)
      DO HandledOut
    ELSE
      IF SELF.ListQueue.Records()
        DO HandledOut
      END
    END
  END

HandledOut ROUTINE
  SELF.UpdateWindow
  SELF.PostNewSelection
  RETURN 1

CheckInsert ROUTINE
  IF SELF.InsertControl AND NOT SELF.InsertControl {PROP:Disable}
    IF KEYCODE() = InsertKey
      POST(EVENT:Accepted,SELF.InsertControl)
      DO HandledOut
    END
  END

CheckChange ROUTINE
  IF SELF.ChangeControl AND NOT SELF.ChangeControl {PROP:Disable}
    POST(EVENT:Accepted,SELF.ChangeControl)
    SELF.UpdateBuffer
    DO HandledOut
  END

CheckView ROUTINE
  IF SELF.ViewControl AND NOT SELF.ViewControl {PROP:Disable}
    POST(EVENT:Accepted, SELF.ViewControl)
    SELF.UpdateBuffer
    DO HandledOut
  END

BrowseClass.TakeNewSelection PROCEDURE
  CODE
  IF SELF.ListQueue.Records()
    SELF.CurrentChoice = SELF.ILC.Choice()
    SELF.LastChoice = SELF.CurrentChoice
  END
  SELF.UpdateBuffer
  IF KEYCODE() = MouseRightUp OR KEYCODE()=AppsKey
    IF SELF.UsePopup
       SETKEYCODE(0)
       SELF.Popup.Ask()
    END
  ELSE
    SELF.Window.Reset
  END

BrowseClass.SetUsePopup       PROCEDURE(BYTE UsePopUp=True)
  CODE
  SELF.UsePopup = UsePopUp

BrowseClass.TakeScroll PROCEDURE(SIGNED E)
  CODE
  IF ~E
    E = EVENT()
  END
  IF SELF.ListQueue.Records()
    CASE E
    OF Event:ScrollUp OROF Event:ScrollDown
      SELF.ScrollOne(E)
    OF Event:PageUp OROF Event:PageDown
      SELF.ScrollPage(E)
    OF Event:ScrollTop OROF Event:ScrollBottom
      SELF.ScrollEnd(E)
    END
    SELF.TakeChoiceChanged
  END

BrowseClass.TakeChoiceChanged PROCEDURE
  CODE
    IF ~SELF.Sort.Locator &= NULL
      SELF.Sort.Locator.Set
    END
    SELF.PostNewSelection
    IF SELF.Sort.Thumb &= NULL
      SELF.UpdateThumbFixed
    END
    SELF.UpdateBuffer

BrowseClass.TakeVCRScroll PROCEDURE(SIGNED Vcr)
  CODE
    CASE Vcr
    OF VCR:Forward
      SELF.TakeScroll(Event:ScrollDown)
    OF VCR:Backward
      SELF.TakeScroll(Event:ScrollUp)
    OF VCR:PageForward
      SELF.TakeScroll(Event:PageDown)
    OF VCR:PageBackward
      SELF.TakeScroll(Event:PageUp)
    OF VCR:First
      SELF.TakeScroll(Event:ScrollTop)
    OF VCR:Last
      SELF.TakeScroll(Event:ScrollBottom)
    ELSE
      RETURN
    END
    SELF.Window.Reset
    SELF.Window.Update

BrowseClass.UpdateBuffer PROCEDURE
  CODE
    IF SELF.ListQueue.Records()
      SELF.ListQueue.Fetch(SELF.CurrentChoice)
      SELF.Fields.AssignRightToLeft
    ELSE
      SELF.Fields.ClearLeft
    END

BrowseClass.UpdateQuery PROCEDURE(QueryClass QC, BYTE Caseless)
I       USHORT(1)
FN      CSTRING(100)
Found   BYTE
Field   UNSIGNED(1)
F       &File
  CODE
  ASSERT(SELF.Query &= NULL)
  SELF.Query &= QC
  LOOP WHILE SELF.ILC.GetControl(){PROPLIST:Exists,I}
    FN = SELF.ListQueue.Who(SELF.ILC.GetControl(){PROPLIST:FieldNo,I})
    IF FN
       Found = False
       LOOP Field = 1 to SELF.View{PROP:Fields}
            F &= SELF.View{PROP:FieldsFile, Field}
            IF F{PROP:Label, SELF.View{PROP:Field, Field}}=FN
               Found = True
               BREAK
            END
       END
       IF Found
          IF CaseLess
             FN = 'UPPER(' & FN & ')'
          END
          QC.AddItem(FN,SELF.ILC.GetControl(){PROPLIST:header,I},SELF.ILC.GetControl(){PROPLIST:picture,I})
       END
    END
    I += 1
  END

BrowseClass.UpdateResets PROCEDURE
  CODE
    SELF.Sort.Resets.AssignRightToLeft

BrowseClass.UpdateThumbFixed PROCEDURE
Pos         LONG(50)
Recs        LONG,AUTO
lControl    SIGNED
lIMM        BYTE
  CODE
  lControl = SELF.ILC.GetControl()
  lIMM = lControl{PROP:IMM}
  IF SELF.FileLoaded AND SELF.ListQueue.Records()>SELF.ILC.GetItems()
    Recs = SELF.ListQueue.Records()
    IF  SELF.CurrentChoice <= 1
      Pos = 0
    ELSE
      !IF PROP:IMM is false this value will never be used
      IF lIMM
         Pos = ROUND(SELF.CurrentChoice*(SELF.ListQueue.Records()-SELF.ILC.GetItems())/SELF.ListQueue.Records(),1)
      END
    END
  ELSE
    IF SELF.ItemsToFill
      CASE SELF.CurrentEvent
      OF Event:ScrollDown
      OROF Event:PageDown
      OROF Event:ScrollBottom
        IF SELF.CurrentChoice = SELF.ListQueue.Records()
          IF lIMM
             Pos = 100
          ELSE
             Pos = SELF.ListQueue.Records()
          END
        END
      ELSE
        IF SELF.CurrentChoice = 1
          Pos = 0
        END
      END
    END
  END
  IF lIMM OR NOT SELF.FileLoaded
     lControl{PROP:VScrollPos} = Pos
  END

!|
!| This routine is used to retrieve the VIEW record that corresponds to a
!| chosen listbox record.
!|
BrowseClass.UpdateViewRecord    PROCEDURE
Pos       STRING(1024),AUTO
RC        UNSIGNED,AUTO
  CODE
    IF SELF.ListQueue.Records()
      SELF.CurrentChoice = SELF.ILC.Choice()
      SELF.ListQueue.Fetch(SELF.CurrentChoice)
      WATCH(SELF.View)
      REGET(SELF.View,SELF.ListQueue.GetViewPosition())
      RC = ERRORCODE()
      IF  RC = NoDriverSupport
        Pos = POSITION (SELF.View)
        RESET(SELF.View,SELF.ListQueue.GetViewPosition())
        WATCH(SELF.View)
        NEXT(SELF.View)
        RC = ERRORCODE()
        RESET(SELF.View,Pos)
      END
      IF  RC <> 0
        SELF.NeedRefresh = SELF.NotifyUpdateError()
      END
    END

BrowseClass.UpdateWindow PROCEDURE
  CODE
    IF ~(SELF.Sort.Locator &= NULL)
      SELF.Sort.Locator.UpdateWindow
    END
    IF SELF.Records()
      IF SELF.ChangeControl
        ENABLE(SELF.ChangeControl)
      END
      IF SELF.DeleteControl
        ENABLE(SELF.DeleteControl)
      END
      IF SELF.PrintControl
        ENABLE(SELF.PrintControl)
      END
      IF SELF.ViewControl
        ENABLE(SELF.ViewControl)
      END
    ELSE
      IF SELF.ChangeControl
        DISABLE(SELF.ChangeControl)
      END
      IF SELF.DeleteControl
        DISABLE(SELF.DeleteControl)
      END
      IF SELF.PrintControl
        DISABLE(SELF.PrintControl)
      END
      IF SELF.ViewControl
        DISABLE(SELF.ViewControl)
      END
    END
    IF SELF.SelectControl
      IF SELF.Selecting
        IF SELF.RECORDS() AND SELF.Window.Request = SelectRecord
          ENABLE(SELF.SelectControl)
          SELF.SelectControl{PROP:Default} = 1
        ELSE
          DISABLE(SELF.SelectControl)
        END
      ELSIF SELF.HideSelect
        DISABLE(SELF.SelectControl)   ! For the benefit of the toolbar
        HIDE(SELF.SelectControl)
      END
    END
    SELF.UpdateThumb
    IF ~SELF.Toolbar &= NULL
      SELF.Toolbar.DisplayButtons
    END
    DISPLAY(SELF.ILC.GetControl())
    SELF.ILC.SetChoice(SELF.CurrentChoice)

BrowseClass.UpdateThumb PROCEDURE
  CODE
  IF SELF.HasThumb AND ( SELF.ListQueue.Records() >= SELF.ILC.GetItems() OR SELF.AllowUnfilled )
    SELF.ILC.GetControl(){Prop:VScroll} = True
    IF SELF.Sort.Thumb &= NULL OR SELF.Sort.FreeElement &= NULL
      SELF.UpdateThumbFixed
    ELSIF SELF.Loaded AND ~SELF.LoadPending
      SELF.UpdateBuffer
      SELF.ILC.GetControl(){PROP:VScrollPos} = SELF.Sort.Thumb.GetPercentile(SELF.Sort.FreeElement)
      IF SELF.ListQueue.RECORDS()=SELF.ILC.GetItems()
         CASE SELF.ILC.GetControl(){PROP:VScrollPos}
         OF 1
            SELF.ILC.GetControl(){PROP:VScrollPos} = 0
         OF 99
            SELF.ILC.GetControl(){PROP:VScrollPos} = 100
         END
      END
    END
  ELSE
    SELF.ILC.GetControl(){Prop:VScroll} = False
  END

BrowseClass.UpdateToolbarButtons PROCEDURE
  CODE
    IF SELF.InsertControl
      SELF.ToolbarItem.InsertButton = SELF.InsertControl
    END
    IF SELF.DeleteControl
      SELF.ToolbarItem.DeleteButton = SELF.DeleteControl
    END
    IF SELF.ChangeControl
      SELF.ToolbarItem.ChangeButton = SELF.ChangeControl
    END
    IF SELF.SelectControl
      SELF.ToolbarItem.SelectButton = SELF.SelectControl
    END
    IF SELF.QueryControl
      SELF.ToolbarItem.LocateButton = SELF.QueryControl
    END
    SELF.Toolbar.SetTarget(SELF.ILC.GetControl())

BrowseClass.ReplaceSort         PROCEDURE(STRING NewSortString,<LocatorClass NewLocator>,<StepClass NewStepClass>)
  CODE             
     IF NOT SELF.SavedSort
        SELF.SaveSort()
     END
     IF NOT OMITTED(3)
        SELF.Sort.Locator &= NewLocator
        SELF.Sort.Locator.SetShadow('')
     ELSE
        SELF.Sort.Locator &= NULL
     END
     IF NOT OMITTED(4)
        SELF.Sort.Thumb &= NewStepClass
     ELSE
        SELF.Sort.Thumb &= NULL
     END
     SELF.SetOrder(NewSortString)
     SELF.SetSort(POINTER(SELF.Sort), True)

BrowseClass.SaveSort            PROCEDURE()
  CODE
     IF NOT SELF.SavedSort
        SELF.SavedSort      = True
        SELF.SavedLocator  &= SELF.Sort.Locator
        SELF.SavedThumb    &= SELF.Sort.Thumb
        IF NOT SELF.SavedLocator &= NULL
           SELF.SavedLocatorField &= SELF.SavedLocator.FreeElement
        END
        IF NOT SELF.Sort.Order &= NULL
           IF SELF.Sort.Order<>''
              SELF.SavedSortString= SELF.Sort.Order
           ELSE
              SELF.SavedSortString= ''
           END
        ELSE
           SELF.SavedSortString= ''
        END
     END

BrowseClass.RestoreSort         PROCEDURE()
  CODE
     IF SELF.SavedSort
        SELF.SavedSort     = False
        SELF.Sort.Locator &= SELF.SavedLocator
        IF NOT SELF.SavedLocator &= NULL
           SELF.SavedLocator.FreeElement &= SELF.SavedLocatorField
        END
        SELF.SetOrder(SELF.SavedSortString)
        SELF.SetSort(POINTER(SELF.Sort), True)
        SELF.SavedSortString=''
        SELF.Sort.Thumb &= SELF.SavedThumb
        IF NOT SELF.Sort.Locator &= NULL
           SELF.Sort.Locator.SetShadow('')
           SELF.Sort.Locator.UpdateWindow()
        END
     END

BrowseClass.WindowComponent.Kill         PROCEDURE
  CODE
  SELF.Kill

BrowseClass.WindowComponent.TakeEvent    PROCEDURE
  CODE
  SELF.TakeEvent
  RETURN Level:Benign

BrowseClass.WindowComponent.SetAlerts    PROCEDURE
  CODE
  SELF.SetAlerts

BrowseClass.WindowComponent.Reset        PROCEDURE(BYTE Force)
  CODE
  SELF.ResetSort(Force)

BrowseClass.WindowComponent.ResetRequired PROCEDURE
  CODE
  RETURN SELF.ApplyRange()

BrowseClass.WindowComponent.Update       PROCEDURE
  CODE
  SELF.UpdateViewRecord

BrowseClass.WindowComponent.UpdateWindow PROCEDURE
  CODE
  SELF.UpdateWindow








! Locator classes
LocatorClass.Init PROCEDURE(SIGNED Control,*? Free,BYTE NoCase)
  CODE
    SELF.FreeElement &= Free
    SELF.Control = Control
    SELF.NoCase = NoCase

LocatorClass.Init PROCEDURE(SIGNED Control,*? Free,BYTE NoCase,ViewManager VM)
  CODE
    SELF.ViewManager &= VM
    SELF.Init(Control,Free,NoCase)

LocatorClass.Init PROCEDURE(SIGNED Control,*? Free,BYTE NoCase,BrowseClass BC)
  CODE
    SELF.ViewManager   &= BC
    SELF.BrowseManager &= BC
    SELF.Init(Control,Free,NoCase)

LocatorClass.SetLocatorField PROCEDURE(*? Free)
  CODE
    SELF.FreeElement &= Free
    SELF.FreeElement = ''
    SELF.SetShadow('')

LocatorClass.Destruct PROCEDURE
  CODE
    SELF.FreeElement &= NULL

LocatorClass.Reset PROCEDURE
  CODE

LocatorClass.SetAlerts PROCEDURE(SIGNED S)
  CODE

LocatorClass.SetEnabled PROCEDURE(BYTE E)
  CODE
    IF SELF.Control
      SELF.Control{PROP:Disable} = CHOOSE(E=0)
    END

LocatorClass.TakeAccepted PROCEDURE
  CODE
    RETURN 0

LocatorClass.TakeKey PROCEDURE
  CODE
    RETURN 0

LocatorClass.Set PROCEDURE
  CODE
    SELF.FreeElement = ''

LocatorClass.GetShadow PROCEDURE
  CODE
  RETURN ''

LocatorClass.SetShadow PROCEDURE(STRING S)
  CODE

LocatorClass.UpdateWindow PROCEDURE
  CODE
    SELF.Set ! Locators typically 'one-shot' so updateing the screen nullifies them

StepLocatorClass.Init PROCEDURE(SIGNED Control,*? Free,BYTE NoCase)
  CODE
    PARENT.Init(Control,Free,NoCase)
?   ASSERT(NOT SELF.BrowseManager &= NULL,'The Step Locator require a BrowseClass')

StepLocatorClass.Set PROCEDURE
  CODE

StepLocatorClass.TakeKey PROCEDURE
Key BYTE,AUTO
Handled BYTE(0)
EAsc    BYTE(0)
  CODE
    Key = KEYCHAR()
    IF Key
      IF RECORDS(SELF.BrowseManager.ListQueue)
        Handled = 1
        SELF.BrowseManager.ScrollOne(EVENT:ScrollDown)
        SELF.BrowseManager.UpdateBuffer
      END
      IF SELF.NoCase AND UPPER(SUB(SELF.FreeElement,1,1)) <> UPPER(CHR(Key)) OR |
         ~SELF.NoCase AND SUB(SELF.FreeElement,1,1) <> CHR(Key)
         EAsc = SELF.ViewManager.GetFieldAscending(SELF.FreeElement)
         IF SELF.NoCase
            IF NOT EAsc
               SELF.FreeElement = UPPER(CHR(Key))&CHR(254)
            ELSE
               SELF.FreeElement = UPPER(CHR(Key))
            END
         ELSE
            IF NOT EAsc
               SELF.FreeElement = CHR(Key)&CHR(254)
            ELSE
               SELF.FreeElement = CHR(Key)
            END
         END
         Handled = 1
      END
    END
    RETURN Handled

EntryLocatorClass.TakeAccepted PROCEDURE
EAsc    BYTE,AUTO
  CODE
    IF NOT SELF.ViewManager &= NULL
       EAsc = SELF.ViewManager.GetFieldAscending(SELF.FreeElement)
    ELSE
       EAsc = True
    END
    UPDATE(SELF.Control)
    IF NOT EAsc
       SELF.FreeElement = SELF.Shadow&CHR(254)
    ELSE
       SELF.FreeElement = SELF.Shadow
    END
    IF SELF.FreeElement
      RETURN 1
    ELSE
      RETURN 0
    END

EntryLocatorClass.GetShadow PROCEDURE
  CODE
  RETURN SELF.Shadow

EntryLocatorClass.SetShadow PROCEDURE(STRING S)
  CODE
  SELF.Shadow = S

EntryLocatorClass.TakeKey PROCEDURE
  CODE
    IF KEYCHAR() <> 0 AND SELF.Control{PROP:Enabled}
      SELECT(SELF.Control)
      FORWARDKEY(SELF.Control)
    END
    RETURN 0

EntryLocatorClass.Init PROCEDURE(SIGNED Control,*? Free,BYTE NoCase)
  CODE
    CLEAR(SELF.Shadow)
    PARENT.Init(Control,Free,NoCase)
    SELF.Control{PROP:Use} = SELF.Shadow

EntryLocatorClass.Update PROCEDURE
EAsc    BYTE,AUTO
  CODE
    IF NOT SELF.ViewManager &= NULL
       EAsc = SELF.ViewManager.GetFieldAscending(SELF.FreeElement)
    ELSE
       EAsc = True
    END
    IF NOT EAsc
       SELF.FreeElement = CHOOSE(SELF.NoCase,QUOTE(UPPER(SELF.Shadow)),QUOTE(SELF.Shadow))&CHR(254)
    ELSE
       SELF.FreeElement = CHOOSE(SELF.NoCase,QUOTE(UPPER(SELF.Shadow)),QUOTE(SELF.Shadow))
    END
    SELF.UpdateWindow

EntryLocatorClass.Set PROCEDURE
  CODE
    CLEAR(SELF.Shadow)
    SELF.Control{PROP:Use} = SELF.Shadow
    PARENT.Set
    SELF.Update

EntryLocatorClass.UpdateWindow PROCEDURE
  CODE
    DISPLAY(SELF.Control)

IncrementalLocatorClass.SetAlerts PROCEDURE(SIGNED S)
  CODE
    S{PROP:Alrt,250} = BSKey
    S{PROP:Alrt,251} = SpaceKey

IncrementalLocatorClass.TakeKey PROCEDURE
Key BYTE,AUTO
  CODE
    Key = KEYCHAR()
    IF KEYCODE() = BSKey
      IF LEN(SELF.Shadow)
        SELF.Shadow = SELF.Shadow[1:LEN(SELF.Shadow) - 1]
      END
      SELF.Update
      SELF.FreeElement = UNQUOTE(SELF.FreeElement)
      RETURN 1
    ELSIF KEYCODE() = SpaceKey OR Key
      SELF.Shadow = SELF.Shadow & CHOOSE(KEYCODE()=SpaceKey,' ',CHR(Key))
      SELF.Update
      SELF.FreeElement = UNQUOTE(SELF.FreeElement)
      RETURN 1
    END
    RETURN 0

FilterLocatorClass.SetEnabled PROCEDURE(BYTE E)
  CODE
    IF SELF.DisableOnEmptyResult
      PARENT.SetEnabled(E)
    ELSE
      IF E=0
         IF LEN(SELF.Shadow) = 0
            SELF.Control{PROP:Disable} = TRUE
         END
      ELSE
         PARENT.SetEnabled(E)
      END
    END

FilterLocatorClass.Reset PROCEDURE
  CODE

FilterLocatorClass.UpdateWindow PROCEDURE
FN  CSTRING(100),AUTO
FNS CSTRING(100),AUTO
SN  CSTRING(100),AUTO
  CODE
    ASSERT(~SELF.ViewManager &= NULL)
    FN = SELF.ViewManager.GetFreeElementName()
    IF NOT SELF.UseFreeElementOnly
       FNS = SELF.ViewManager.GetFieldName(SELF.FreeElement)
       IF (INSTRING('UPPER(',FN,1,1) = 1 AND UPPER(FN) <> 'UPPER('&UPPER(FNS)&')') OR (INSTRING('UPPER(',FN,1,1) = 0 AND UPPER(FN)<>UPPER(FNS))
          FN = FNS
          IF SELF.NoCase
             FN = 'UPPER('&FN&')'
          END
       END
    END
    SN = CHOOSE(INSTRING('UPPER(',FN,1,1) = 0,QUOTE(SELF.Shadow),QUOTE(UPPER(SELF.Shadow)))
    IF SELF.FloatRight
      SELF.ViewManager.SetFilter(CHOOSE(SN='','','INSTRING('''&SN&''','&FN&',1,1) <<> 0'),'3 Locator')
    ELSE
      IF LEN(SELF.Shadow)>0
         SELF.ViewManager.SetFilter('SUB('&FN&',1,'&LEN(SELF.Shadow)&') = '''& SN & '''','3 Locator')
      ELSE
         SELF.ViewManager.SetFilter('','3 Locator')
      END
    END
    SELF.ViewManager.ApplyFilter()
    !SELF.FreeElement = SELF.Shadow
    DISPLAY(SELF.Control)

FilterLocatorClass.TakeAccepted PROCEDURE
  CODE
    UPDATE(SELF.Control)
    SELF.Shadow = CLIP(CONTENTS(SELF.Control))
    IF SELF.FreeElement OR (SELF.FreeElement AND NOT SELF.Shadow) OR (SELF.FreeElement <> SELF.Shadow)
       SELF.FreeElement = SELF.Shadow
       SELF.UpdateWindow
       RETURN 1
    ELSE
       RETURN 0
    END

BrowseEIPManager.Init PROCEDURE
RetVal BYTE(RequestCancelled)
AtEnd  BYTE,AUTO
  CODE
  SELF.BC.CurrentChoice = CHOICE(SELF.ListControl)
  CASE SELF.Req
  OF InsertRecord
    IF SELF.BC.ListQueue.Records()
      IF SELF.Insert = EIPAction:Append
        SELF.BC.ScrollEnd(Event:ScrollBottom)
      END
      IF SELF.BC.PrimeRecord()
        RETURN Level:Fatal
      END
      SELF.BC.Primary.Save()
      AtEnd = CHOOSE(SELF.BC.CurrentChoice = SELF.BC.ListQueue.Records())
      SELF.BC.CurrentChoice = CHOOSE(SELF.Insert=EIPAction:Before, SELF.BC.CurrentChoice,SELF.BC.CurrentChoice+1)
      IF SELF.BC.ListQueue.Records() >= SELF.BC.LastItems
        IF AtEnd
          SELF.BC.ListQueue.Fetch(1)
          SELF.BC.CurrentChoice -= 1
        ELSE
          SELF.BC.ListQueue.Fetch(SELF.BC.ListQueue.Records())
        END
        SELF.BC.ListQueue.Delete()
      END
    ELSE
      IF SELF.BC.PrimeRecord()
        RETURN Level:Fatal
      END
      SELF.BC.Primary.Save()
      SELF.BC.CurrentChoice = 1
    END
    SELF.Fields.ClearRight()
    IF SELF.Fields.Equal()
       SELF.WasPrimed = False
    ELSE
       SELF.WasPrimed = True
    END
    SELF.BC.SetQueueRecord
    SELF.BC.ListQueue.Insert(SELF.BC.CurrentChoice)
    ASSERT(~ERRORCODE())
    DISPLAY(SELF.ListControl)
    SELECT(SELF.ListControl,SELF.BC.CurrentChoice)
    SELF.Column = 1
  OF DeleteRecord
    CASE SELF.DeleteKeyAction
    OF EIPAction:Prompted
       RetVal = CHOOSE(SELF.BC.Primary.Delete(True) = Level:Benign,RequestCompleted,RequestCancelled)
    OF EIPAction:Never   
       RetVal = RequestCancelled  
    ELSE !EIPAction:Always
       RetVal = CHOOSE(SELF.BC.Primary.Delete(False) = Level:Benign,RequestCompleted,RequestCancelled)
    END
    SELF.Response = RetVal
    RETURN Level:Fatal
  OF ChangeRecord
    SELF.BC.SetQueueRecord()    ! Buffers are 'fresh' make sure queue record is too
    SELF.BC.ListQueue.Update()
    SELF.BC.Primary.Save()
    IF KEYCODE() = MouseLeft2
      SELF.Column = SELF.ListControl{PROPLIST:MouseUpField}
    END
  ELSE
    ASSERT(0)
  END
  SELF.BC.ListQueue.Fetch(SELF.BC.CurrentChoice)
  SELF.ListControl{PROP:Alrt,MouseLeft2Index} = 0 ! Prevent alert short-stopping double click
  RETURN PARENT.Init()

BrowseEIPManager.Kill PROCEDURE
  CODE
  SELF.BC.ResetFromAsk(SELF.Req,SELF.Response)
  RETURN PARENT.Kill()

BrowseEIPManager.TakeNewSelection PROCEDURE
  CODE
  IF FIELD() = SELF.ListControl
    IF CHOICE(SELF.ListControl) = SELF.BC.CurrentChoice
      RETURN PARENT.TakeNewSelection()
    ELSE                                  ! Focus change to different record
      SELF.TakeFocusLoss
      IF SELF.Again
        SELECT(SELF.ListControl,SELF.BC.CurrentChoice)
        RETURN Level:Benign
      ELSE
        SELF.BC.CurrentChoice = CHOICE(SELF.ListControl)
        SELF.Response = RequestCancelled           ! Avoid cursor following 'new' record
        RETURN Level:Fatal
      END
    END
  END
  RETURN Level:Benign

BrowseEIPManager.TakeCompleted PROCEDURE(BYTE Force)
SaveAns UNSIGNED,AUTO
Id      USHORT,AUTO
  CODE
  IF (Force = Button:Yes OR Force = 0)
     IF NOT SELF.TakeAcceptAll()
        RETURN
     END
  END
  SELF.Again = 0
  SELF.ClearColumn
  SaveAns = CHOOSE(Force = 0,Button:Yes,Force)
  IF SELF.Fields.Equal() AND NOT SELF.WasPrimed
    SaveAns = Button:No
  ELSE
    IF ~Force
      SaveAns = SELF.Errors.Message(Msg:SaveRecord,Button:Yes+Button:No+Button:Cancel,Button:Yes)
    END
  END
  SELF.Response = RequestCancelled
  CASE SaveAns
  OF Button:Cancel
    SELF.Again = 1
  OF Button:No
    IF SELF.Req = InsertRecord
      SELF.BC.ListQueue.Delete()
      IF SELF.BC.CurrentChoice AND SELF.Insert <> EIPAction:Before
        SELF.BC.CurrentChoice -= 1
      END
      SELF.BC.Primary.Me.CancelAutoInc()
    END
  OF Button:Yes
    Id = SELF.BC.Primary.Me.SaveBuffer()
    SELF.BC.UpdateBuffer
    IF CHOOSE(SELF.Req = InsertRecord,SELF.BC.Primary.Insert(),SELF.BC.Primary.Update()) <> Level:Benign
      SELF.Again = 1
    ELSE
      SELF.Response = RequestCompleted
    END
    SELF.BC.Primary.Me.RestoreBuffer(Id,SELF.Again)
    FLUSH(SELF.BC.View)
  END
  Force = Button:No
  PARENT.TakeCompleted(Force)

BrowseEIPManager.ClearColumn PROCEDURE
  CODE
  IF SELF.LastColumn
    UPDATE
    SELF.BC.ListQueue.Update()
    ASSERT(~ERRORCODE())
  END
  PARENT.ClearColumn

!***************************************************************************
! CWEIP Manager Class
! This is the engine for the Edit in place functionality
! this class will work with a Clarion code Browse
! and it can be used also with a hand code listbox
!***************************************************************************
CWEIPManager.SetUp                PROCEDURE(*QUEUE pBrowseQueue,SHORT pListControl,*LONG pVCRRequest,*LONG pCurrentChoice,LONG pTabAction,LONG pEnterAction,LONG pArrowAction,LONG pFocusLossAction,LONG pInsertPosition,LONG pDeleteAction)
 CODE
   SELF.Q           &= pBrowseQueue
   SELF.ListControl  = pListControl
   SELF.VCRRequest  &= pVCRRequest
   SELF.VCRRequest   = VCR:None

   SELF.TabAction   = pTabAction
   SELF.EnterAction = pEnterAction
   SELF.ArrowAction = pArrowAction
   SELF.FocusLossAction = pFocusLossAction
   SELF.Insert      = pInsertPosition

   SELF.Tab         &= SELF.TabAction
   SELF.Arrow       &= SELF.ArrowAction
   SELF.Enter       &= SELF.EnterAction
   SELF.FocusLoss   &= SELF.FocusLossAction
   SELF.CurrentChoice &= pCurrentChoice
   SELF.DeleteKeyAction=pDeleteAction

   SELF.AutoIncDone=False
   FREE(SELF.EQ)
   SELF.Fields.Kill
   SELF.Fields.Init
   !After parent on the Virtual method need to be
   !the calls to the SELF.AddColumn
   !if a column is not editable it will be a
   !call to the SELF.AddColumn with the 3 first parameter in blank

CWEIPManager.PrimeRecord          PROCEDURE()
    CODE
    !Add all the fields that need to be initialized
    !and the auto inc if it is required
    RETURN Level:Benign

CWEIPManager.ProcessScroll        PROCEDURE(LONG pEvent)
    CODE

CWEIPManager.ScrollEnd            PROCEDURE(LONG pEvent)
    CODE

CWEIPManager.SetQueueRecord       PROCEDURE()
    CODE

CWEIPManager.BCPrimarySaveBuffer  PROCEDURE()
    CODE

CWEIPManager.BCPrimaryRestoreBuffer PROCEDURE()
    CODE

CWEIPManager.BCPrimaryCancelAutoInc PROCEDURE()
    CODE

CWEIPManager.BCPrimaryDelete      PROCEDURE(BYTE pAsk=0)
    CODE
    RETURN Level:Benign

CWEIPManager.BCPrimaryInsert      PROCEDURE()
    CODE
    RETURN Level:Benign

CWEIPManager.BCPrimaryUpdate      PROCEDURE()
    CODE
    RETURN Level:Benign

CWEIPManager.Init PROCEDURE
RetVal BYTE(RequestCancelled)
AtEnd  BYTE,AUTO
  CODE
  SELF.CurrentChoice = CHOICE(SELF.ListControl)
  CASE SELF.Req
  OF InsertRecord
    IF RECORDS(SELF.Q)
      IF SELF.Insert = EIPAction:Append
        SELF.ScrollEnd(Event:ScrollBottom)
      END
      IF SELF.PrimeRecord()
        RETURN Level:Fatal
      END
      AtEnd = CHOOSE(SELF.CurrentChoice = RECORDS(SELF.Q))
      SELF.CurrentChoice = CHOOSE(SELF.Insert=EIPAction:Before, SELF.CurrentChoice,SELF.CurrentChoice+1)
      !If this is used on a file loaded browse the SELF.ListControl{PROP:Items} need to
      !be replaced and the next code need to be executed always
      IF NOT SELF.FileLoaded
         IF RECORDS(SELF.Q) >= SELF.ListControl{PROP:Items}
           IF AtEnd
             GET(SELF.Q, 1)
             SELF.CurrentChoice -= 1
           ELSE
             GET(SELF.Q, RECORDS(SELF.Q))
           END
           DELETE(SELF.Q)
         END
      END
    ELSE
      IF SELF.PrimeRecord()
        RETURN Level:Fatal
      END
      SELF.CurrentChoice = 1
    END
    SELF.Fields.ClearRight()
    IF SELF.Fields.Equal()
       SELF.WasPrimed = False
    ELSE
       SELF.WasPrimed = True
    END
    SELF.SetQueueRecord()
    ADD(SELF.Q, SELF.CurrentChoice)
    ASSERT(~ERRORCODE())
    DISPLAY(SELF.ListControl)
    SELECT(SELF.ListControl,SELF.CurrentChoice)
    SELF.Column = 1
  OF DeleteRecord
    CASE SELF.DeleteKeyAction
    OF EIPAction:Never
       RetVal = RequestCancelled
    OF EIPAction:Prompted
       RetVal = CHOOSE(SELF.BCPrimaryDelete(True) = Level:Benign,RequestCompleted,RequestCancelled)
    ELSE !EIPAction:Always
       RetVal = CHOOSE(SELF.BCPrimaryDelete(False) = Level:Benign,RequestCompleted,RequestCancelled)
    END
    SELF.Response = RetVal
    RETURN Level:Fatal
  OF ChangeRecord
    SELF.SetQueueRecord()    ! Buffers are 'fresh' make sure queue record is too
    PUT(SELF.Q)
    IF KEYCODE() = MouseLeft2
      SELF.Column = SELF.ListControl{PROPLIST:MouseUpField}
    END
  ELSE
    ASSERT(0)
  END
  GET(SELF.Q, SELF.CurrentChoice)
  SELF.ListControl{PROP:Alrt,MouseLeft2Index} = 0 ! Prevent alert short-stopping double click
  RETURN PARENT.Init()

CWEIPManager.ClearColumn PROCEDURE
  CODE
  IF SELF.LastColumn
    UPDATE
    PUT(SELF.Q)
    IF ERRORCODE() THEN
       MESSAGE('CWEIPManager.ClearColumn|LastColumn='&SELF.LastColumn&'|Error: ('&ERRORCODE()&') '&ERROR())
    END
    ASSERT(~ERRORCODE())
  END
  PARENT.ClearColumn

CWEIPManager.TakeNewSelection PROCEDURE
  CODE
  IF FIELD() = SELF.ListControl
    IF CHOICE(SELF.ListControl) = SELF.CurrentChoice
      RETURN PARENT.TakeNewSelection()
    ELSE                                  ! Focus change to different record
      SELF.TakeFocusLoss
      IF SELF.Again
        SELF.CurrentChoice = CHOICE(SELF.ListControl)
        SELECT(SELF.ListControl,SELF.CurrentChoice)
        RETURN Level:Benign
      ELSE
        SELF.CurrentChoice = CHOICE(SELF.ListControl)
        SELF.Response = RequestCancelled           ! Avoid cursor following 'new' record
        RETURN Level:Fatal
       END
    END
  END
  RETURN Level:Benign

CWEIPManager.TakeCompleted PROCEDURE(BYTE Force)
SaveAns UNSIGNED,AUTO
  CODE
  IF (Force = Button:Yes OR Force = 0)
     IF NOT SELF.TakeAcceptAll()
        RETURN
     END
  END
  SELF.Again = 0
  SELF.ClearColumn
  SaveAns = CHOOSE(Force = 0,Button:Yes,Force)
  IF SELF.Fields.Equal() AND NOT SELF.WasPrimed
    SaveAns = Button:No
  ELSE
    IF ~Force
        SaveAns = MESSAGE('Do you want to save the changes to this record?'|
                ,'Update Cancelled',ICON:Question,Button:Yes+Button:No+Button:Cancel,|
                Button:No,0)
    END
  END
  SELF.Response = RequestCancelled
  CASE SaveAns
  OF Button:Cancel
    SELF.Again = 1
  OF Button:No
    IF SELF.Req = InsertRecord
       DELETE(SELF.Q)
       IF SELF.CurrentChoice AND SELF.Insert <> EIPAction:Before
          SELF.CurrentChoice -= 1
       END
       SELF.BCPrimaryCancelAutoInc()
    END
  OF Button:Yes
    SELF.BCPrimarySaveBuffer()
    SELF.Fields.AssignRightToLeft()
    IF CHOOSE(SELF.Req = InsertRecord,SELF.BCPrimaryInsert(),SELF.BCPrimaryUpdate()) <> Level:Benign
       SELF.Again = 1
    ELSE
       SELF.Response = RequestCompleted
    END
    SELF.BCPrimaryRestoreBuffer()
  END
  Force = Button:No
  PARENT.TakeCompleted(Force)

CWEIPManager.TakeAction     PROCEDURE(UNSIGNED Action)
 CODE
    PARENT.TakeAction(Action)
    CASE SELF.VCRRequest
    OF VCR:Forward
       SELF.VCRRequest= VCRForward
    OF VCR:Backward
       SELF.VCRRequest= VCRBackward
    END

CWEIPManager.AddColumn            PROCEDURE(<*? FromFile>,<*? FromQueue>,<EditClass EC>,UNSIGNED Id,BYTE Free)
 CODE
       SELF.Fields.AddPair(FromFile,FromQueue)
       SELF.Addcontrol(EC,Id,Free)

CWEIPManager.Construct            PROCEDURE
 CODE
    SELF.Eq     &= NEW(EditQueue)
    SELF.Fields &= NEW(FieldPairsClass)
    SELF.Fields.Init()
    SELF.Tab &= SELF.TabAction
    SELF.Arrow &= SELF.ArrowAction
    SELF.Enter &= SELF.EnterAction
    SELF.FocusLoss &= SELF.FocusLossAction

CWEIPManager.Destruct             PROCEDURE
 CODE
    FREE(SELF.Eq)
    SELF.Fields.Kill()
    DISPOSE(SELF.Eq)
    DISPOSE(SELF.Fields)


QListClass.Init              PROCEDURE(SIGNED ListBox,QUEUE Q)
 CODE
    SELF.SetUseWaitCursor(true)
    SELF.ListBox = ListBox
    SELF.Q &= Q
    SELF.Fields &= NEW FieldPairsClass
    SELF.Fields.Init
    SELF.Popup &= NEW PopupClass
    ASSERT(~SELF.Popup&=NULL)
    SELF.Popup.Init
    SELF.Inited = True
    SELF.Killed = False


QListClass.Kill              PROCEDURE()
I UNSIGNED,AUTO
  CODE
    IF SELF.Inited = False
       RETURN
    END
    IF SELF.FreeEIP
      DISPOSE(SELF.EIP)
      SELF.FreeEIP = 0
    END
    IF ~SELF.Fields &= NULL
      SELF.Fields.Kill
      DISPOSE(SELF.Fields)
    END
    IF ~SELF.Popup &= NULL
      SELF.Popup.Kill
      DISPOSE(SELF.Popup)
    END
    SELF.Killed = True
    SELF.Inited = False

QListClass.DESTRUCT  PROCEDURE()
 CODE
    IF SELF.Inited = True AND SELF.Killed = False
       SELF.Kill()
    END

QListClass.InsertRecord      PROCEDURE()
 CODE
    ADD(SELF.Q,SELF.CurrentChoice)
    SELF.CurrentChoice+=1

QListClass.ChangeRecord      PROCEDURE()
 CODE
    PUT(SELF.Q)

QListClass.DeleteRecord      PROCEDURE()
 CODE
    DELETE(SELF.Q)

QListClass.AddField PROCEDURE(*? FromFile,*? FromQueue)
  CODE
    SELF.Fields.AddPair(FromFile,FromQueue)

QListClass.AddField PROCEDURE(*string FromFile,*string FromQueue)
  CODE
    SELF.Fields.AddPair(FromFile,FromQueue)

QListClass.AddField PROCEDURE(*long FromFile,*long FromQueue)
  CODE
    SELF.Fields.AddPair(FromFile,FromQueue)

QListClass.AddItem PROCEDURE(QListEIPManager EIP)
  CODE
    IF NOT SELF.EIP &= NULL
       IF SELF.FreeEIP
          SELF.FreeEIP = False
          DISPOSE(SELF.EIP)
       END
    END
    SELF.EIP &= EIP
    SELF.EIP.QL &= SELF

QListClass.CheckEIP PROCEDURE()
  CODE
  IF SELF.EIP &= NULL
    SELF.EIP &= NEW QListEIPManager
    SELF.EIP.QL &= SELF
    SELF.FreeEIP = 1
  END
  SELF.EIP.SetUp(SELF.Q,SELF.ListBox,SELF.VCRRequest,SELF.CurrentChoice,SELF.TabAction,SELF.EnterAction,SELF.ArrowAction,SELF.FocusLossAction,SELF.InsertPosition,SELF.DeleteAction)

QListClass.UpdateBuffer      PROCEDURE()             ! Update file fields from CurrentChoice
  CODE
    IF RECORDS(SELF.Q)
      GET(SELF.Q,SELF.CurrentChoice)
      SELF.Fields.AssignRightToLeft
    ELSE
      SELF.Fields.ClearLeft
    END

QListClass.SetQueueRecord    PROCEDURE()
 CODE
    SELF.Fields.AssignLeftToRight

QListClass.Fetch             PROCEDURE()
 CODE
    RETURN Level:Fatal

QListClass.PrimeRecord       PROCEDURE()
 CODE
    RETURN Level:Benign

QListClass.LoadBuffer        PROCEDURE()
 CODE

QListClass.SetUseWaitCursor  PROCEDURE(BYTE useCursor = 1)
 CODE
    SELF.UseWaitCursor = useCursor

QListClass.ShowWaitCursor PROCEDURE(BYTE showCursor = 1)
 CODE
    IF SELF.UseWaitCursor
       SELF.DoShowWaitCursor(showCursor)
    END
    
QListClass.DoShowWaitCursor PROCEDURE(BYTE showCursor = 1)
 CODE
    IF showCursor
       SETCURSOR(CURSOR:Wait)
    ELSE
       SETCURSOR()
    END

QListClass.ResetQueue        PROCEDURE()
 CODE
    FREE(SELF.Q)
    SELF.ShowWaitCursor(True)
    LOOP
       CLEAR(SELF.Q)
       CASE SELF.Fetch()
       OF Level:Benign
          IF SELF.PrimeRecord()<>Level:Benign
             BREAK
          END
          SELF.LoadBuffer()
          SELF.SetQueueRecord()
          SELF.CurrentChoice = RECORDS(SELF.Q)+1
          SELF.InsertRecord()
       OF Level:Notify
          CYCLE
       ELSE
          BREAK
       END
    END
    SELF.ShowWaitCursor(False)
    IF RECORDS(SELF.Q)
       SELF.CurrentChoice = 1
       SELF.ListBox{PROP:SelStart}=1
    END

QListClass.SetAlerts         PROCEDURE()
I BYTE,AUTO
  CODE
    SELF.ListBox{Prop:Alrt,MouseLeft2Index} = MouseLeft2
    SELF.ListBox{Prop:Alrt,MouseRightIndex} = MouseRightUp
    SELF.ListBox{Prop:Alrt,MouseRightIndex} = AppsKey
       IF SELF.InsertControl
         SELF.ListBox{Prop:Alrt,255} = InsertKey
       END
       IF SELF.ChangeControl
         SELF.ListBox{Prop:Alrt,253} = CtrlEnter
       END
       IF SELF.DeleteControl
         SELF.ListBox{Prop:Alrt,254} = DeleteKey
       END
       IF SELF.ViewControl
         SELF.ListBox{PROP:Alrt,255} = ShiftEnter
       END
    IF SELF.EditViaPopup
       IF SELF.InsertControl
         SELF.Popup.AddItemMimic(DefaultInsertName,SELF.InsertControl,SELF.InsertControl{PROP:Text})
       END
       IF SELF.ChangeControl
         SELF.Popup.AddItemMimic(DefaultChangeName,SELF.ChangeControl,SELF.ChangeControl{PROP:Text})
       END
       IF SELF.DeleteControl
         SELF.Popup.AddItemMimic(DefaultDeleteName,SELF.DeleteControl,SELF.DeleteControl{PROP:Text})
       END
       IF SELF.ViewControl
         SELF.Popup.AddItemMimic(DefaultViewName, SELF.ViewControl, SELF.ViewControl{PROP:Text})
       END
    END

QListClass.SetUsePopup       PROCEDURE(BYTE UsePopUp=True)
  CODE
  SELF.UsePopup = UsePopUp

QListClass.TakeEvent PROCEDURE
VSP    REAL,AUTO
OldVsp LONG,AUTO
SEL    LONG,AUTO
  CODE
    CASE FIELD()
    OF 0
      SELF.CurrentChoice = CHOICE(SELF.ListBox)
    OF SELF.ListBox
      CASE EVENT()
      OF EVENT:ScrollUp
      OROF EVENT:ScrollDown
      OROF EVENT:PageUp
      OROF EVENT:PageDown
      OROF EVENT:ScrollTop
      OROF EVENT:ScrollBottom
        SELF.TakeScroll
      OF EVENT:ScrollDrag
         VSP = SELF.ListBox{PROP:VScrollPos}
         OldVSP = VSP
         IF VSP <= 1
            POST(Event:ScrollTop,SELF.ListBox)
         ELSE
            IF RECORDS(SELF.Q)>SELF.ListBox{PROP:Items}
               VSP = SELF.ListBox{PROP:VScrollPos}*100/(RECORDS(SELF.Q)-SELF.ListBox{PROP:Items})
            END
         END
         IF VSP >= 100
            VSP = 100
            POST(Event:ScrollBottom,SELF.ListBox)
         ELSE
                   
             SEL = CHOICE(SELF.ListBox) - SELF.ListBox{PROP:YOrigin} + 1
             SELF.CurrentChoice = (SELF.ListBox{PROP:VScrollPos}/(RECORDS(SELF.Q)-SELF.ListBox{PROP:Items}))*RECORDS(SELF.Q)
              SELF.TakeChoiceChanged()

              IF SEL = 1
                 SELF.ListBox{PROP:SelStart}=(SELF.CurrentChoice+1)
                 SELF.ListBox{PROP:SelStart}=(SELF.CurrentChoice)
              ELSE
                 SELF.ListBox{PROP:SelStart}=(SELF.CurrentChoice)
                 SELF.ListBox{PROP:SelStart}=(SELF.CurrentChoice-SEL+1)
                 SELF.ListBox{PROP:SelStart}=(SELF.CurrentChoice)
              END
              SELF.ListBox{PROP:VScrollPos} = OldVSP
         END
      OF EVENT:AlertKey
        SELF.TakeKey
      OF EVENT:NewSelection
        SELF.TakeNewSelection
!      OF EVENT:Locate
!        SELF.TakeLocate
      END
    END

    CASE ACCEPTED()
    OF 0
    OF SELF.DeleteControl
       SELF.Ask(DeleteRecord)
    OF SELF.ChangeControl
       SELF.Ask(ChangeRecord)
    OF SELF.InsertControl
       SELF.Ask(InsertRecord)
    OF SELF.ViewControl
       SELF.Ask(ViewRecord)
    END
    SELF.UpdateBuffer

QListClass.Ask               PROCEDURE(BYTE Request)
Response BYTE
  CODE
  LOOP
    SELF.VCRRequest = VCR:None
    IF KEYCODE() = MouseRightUp
      SETKEYCODE(0)
    END
    IF NOT SELF.UseEIP
        IF Request=InsertRecord THEN
          CLEAR(SELF.Q)
          IF SELF.PrimeRecord()<>Level:Benign
            RETURN RequestCancelled
          END
        END
        Response = SELF.AskProcedure(Request)
        IF Response = RequestCompleted
           IF SELF.CurrentChoice>RECORDS(SELF.Q)
              SELF.CurrentChoice=RECORDS(SELF.Q)
           END
           IF SELF.CurrentChoice=0 THEN
              SELF.CurrentChoice=1
           END
           SELF.SetQueueRecord()
           CASE Request
           OF InsertRecord
              SELF.InsertRecord()
           OF ChangeRecord
              SELF.ChangeRecord()
           OF DeleteRecord
              SELF.DeleteRecord()
           END
        END
        SELF.PostNewSelection()
        SELECT(SELF.ListBox)
    ELSE
      SELF.CheckEIP
      Response = SELF.EIP.Run(Request)
    END
  UNTIL SELF.VCRRequest = VCR:None
  RETURN Response

QListClass.AskProcedure      PROCEDURE(BYTE Request)
 CODE
    RETURN RequestCancelled

QListClass.PostNewSelection PROCEDURE
  CODE
  IF SELF.PrevChoice <> 0  OR  SELF.CurrentChoice <> 0  OR  KEYCODE() = MouseRightUp
    SELF.PrevChoice = SELF.CurrentChoice
    SELF.ListBox{PROP:SelStart}=SELF.CurrentChoice
    POST(Event:NewSelection,SELF.ListBox)
  END

!QListClass.ResetFields       PROCEDURE
!QListClass.ResetFromAsk      PROCEDURE(*BYTE Request,*BYTE Response),PROTECTED,VIRTUAL

QListClass.TakeScroll PROCEDURE(SIGNED E = 0)
  CODE
  IF NOT E
    E = EVENT()
  END
  IF RECORDS(SELF.Q)
    CASE E
    OF Event:ScrollUp OROF Event:ScrollDown
      SELF.ScrollOne(E)
    OF Event:PageUp OROF Event:PageDown
      SELF.ScrollPage(E)
    OF Event:ScrollTop OROF Event:ScrollBottom
      SELF.ScrollEnd(E)
    END
    SELF.TakeChoiceChanged
  END

QListClass.TakeChoiceChanged PROCEDURE
  CODE
    SELF.PostNewSelection
    SELF.UpdateBuffer

QListClass.TakeVCRScroll PROCEDURE(SIGNED Vcr)
  CODE
    CASE Vcr
    OF VCR:Forward
      SELF.TakeScroll(Event:ScrollDown)
    OF VCR:Backward
      SELF.TakeScroll(Event:ScrollUp)
    OF VCR:PageForward
      SELF.TakeScroll(Event:PageDown)
    OF VCR:PageBackward
      SELF.TakeScroll(Event:PageUp)
    OF VCR:First
      SELF.TakeScroll(Event:ScrollTop)
    OF VCR:Last
      SELF.TakeScroll(Event:ScrollBottom)
    ELSE
      RETURN
    END
    SELF.UpdateWindow

QListClass.ScrollOne PROCEDURE(SIGNED Ev)
  CODE
  SELF.CurrentEvent = Ev
  IF Ev = Event:ScrollUp AND SELF.CurrentChoice > 1
    SELF.CurrentChoice -= 1
  ELSIF Ev = Event:ScrollDown AND SELF.CurrentChoice < RECORDS(SELF.Q)
    SELF.CurrentChoice += 1
  END

QListClass.ScrollPage PROCEDURE(SIGNED Ev)
LI SIGNED,AUTO
SEL SIGNED,AUTO
  CODE
  SELF.CurrentEvent = Ev
  Li = SELF.ListBox{PROP:Items}
  IF Ev = Event:PageUp
    SELF.CurrentChoice -= LI
    IF SELF.CurrentChoice < 1
      SELF.CurrentChoice = 1
    END
  ELSE
    SELF.CurrentChoice += LI
    IF SELF.CurrentChoice > RECORDS(SELF.Q)
      SELF.CurrentChoice = RECORDS(SELF.Q)
    END
  END
    SEL = CHOICE(SELF.ListBox) - SELF.ListBox{PROP:YOrigin} + 1
    IF SEL = 1
       SELF.ListBox{PROP:SelStart}=SELF.CurrentChoice+1
       SELF.ListBox{PROP:SelStart}=SELF.CurrentChoice
    ELSE
       SELF.ListBox{PROP:SelStart}=SELF.CurrentChoice
       SELF.ListBox{PROP:SelStart}=SELF.CurrentChoice-SEL+1
       SELF.ListBox{PROP:SelStart}=SELF.CurrentChoice
    END

QListClass.ScrollEnd PROCEDURE(SIGNED Ev)
  CODE
  SELF.CurrentEvent = Ev
  SELF.CurrentChoice = CHOOSE(Ev = Event:ScrollTop,1,RECORDS(SELF.Q))


QListClass.TakeKey           PROCEDURE()
 CODE
  IF KEYCODE() = MouseRightUp
    IF SELF.ListBox{PROPLIST:MouseDownRow}>0
      SELF.CurrentChoice = SELF.ListBox{PROPLIST:MouseDownRow}
    END
    SELF.PostNewSelection
  ELSE
    IF RECORDS(SELF.Q)
      CASE KEYCODE()
      OF InsertKey
        DO CheckInsert
      OF DeleteKey
        IF SELF.DeleteControl AND NOT SELF.DeleteControl {PROP:Disable}
          POST(EVENT:Accepted, SELF.DeleteControl)
          DO HandledOut
        END
      OF CtrlEnter
        DO CheckChange
      OF ShiftEnter
        DO CheckView
      OF MouseLeft2
!        IF SELF.Selecting
!          IF SELF.SelectControl AND NOT SELF.SelectControl {PROP:Disable}
!            POST(EVENT:Accepted, SELF.SelectControl)
!            DO HandledOut
!          END
!        ELSE
          IF SELF.ListBox{PROPLIST:MouseDownZone}<>LISTZONE:Header
             DO CheckChange
          END
!        END
      OF AppsKey
         Do HandledOut
      END
    ELSE
      DO CheckInsert
    END
  END
  RETURN 0

HandledOut ROUTINE
  SELF.UpdateWindow
  SELF.PostNewSelection
  RETURN 1

CheckInsert ROUTINE
  IF SELF.InsertControl AND NOT SELF.InsertControl {PROP:Disable}
    IF KEYCODE() = InsertKey
      POST(EVENT:Accepted,SELF.InsertControl)
      DO HandledOut
    END
  END

CheckChange ROUTINE
  IF SELF.ChangeControl AND NOT SELF.ChangeControl {PROP:Disable}
    POST(EVENT:Accepted,SELF.ChangeControl)
    SELF.UpdateBuffer
    DO HandledOut
  END

CheckView ROUTINE
  IF SELF.ViewControl AND NOT SELF.ViewControl {PROP:Disable}
    POST(EVENT:Accepted, SELF.ViewControl)
    SELF.UpdateBuffer
    DO HandledOut
  END

QListClass.TakeNewSelection  PROCEDURE()
  CODE
  IF RECORDS(SELF.Q)
    SELF.CurrentChoice = CHOICE(SELF.ListBox)
    SELF.PrevChoice = SELF.CurrentChoice
  END
  SELF.UpdateBuffer
  IF KEYCODE() = MouseRightUp OR KEYCODE()=AppsKey
    IF SELF.UsePopup
       SETKEYCODE(0)
       SELF.Popup.Ask()
    END
  END

QListClass.UpdateWindow PROCEDURE
  CODE
    IF RECORDS(SELF.Q)
      IF SELF.ChangeControl
        ENABLE(SELF.ChangeControl)
      END
      IF SELF.DeleteControl
        ENABLE(SELF.DeleteControl)
      END
!      IF SELF.PrintControl
!        ENABLE(SELF.PrintControl)
!      END
      IF SELF.ViewControl
        ENABLE(SELF.ViewControl)
      END
    ELSE
      IF SELF.ChangeControl
        DISABLE(SELF.ChangeControl)
      END
      IF SELF.DeleteControl
        DISABLE(SELF.DeleteControl)
      END
!      IF SELF.PrintControl
!        DISABLE(SELF.PrintControl)
!      END
      IF SELF.ViewControl
        DISABLE(SELF.ViewControl)
      END
    END
!    IF SELF.SelectControl
!      IF SELF.Selecting
!        IF SELF.RECORDS() AND SELF.Window.Request = SelectRecord
!          ENABLE(SELF.SelectControl)
!          SELF.SelectControl{PROP:Default} = 1
!        ELSE
!          DISABLE(SELF.SelectControl)
!        END
!      ELSIF SELF.HideSelect
!        DISABLE(SELF.SelectControl)   ! For the benefit of the toolbar
!        HIDE(SELF.SelectControl)
!      END
!    END
    !SELF.UpdateThumb
    DISPLAY(SELF.ListBox)
    SELF.ListBox{PROP:SelStart}=SELF.CurrentChoice

QListClass.Records           PROCEDURE()
 CODE
    RETURN RECORDS(SELF.Q)


QListEIPManager.CONSTRUCT            PROCEDURE()
 CODE
    SELF.FileLoaded=True

QListEIPManager.ProcessScroll        PROCEDURE(LONG pEvent)
 CODE
    SELF.QL.TakeScroll(pEvent)

QListEIPManager.ScrollEnd            PROCEDURE(LONG pEvent)
 CODE
   SELF.QL.ScrollEnd(pEvent)
   SELF.QL.TakeChoiceChanged()

QListEIPManager.SetQueueRecord       PROCEDURE()
 CODE
    SELF.QL.SetQueueRecord()

QListEIPManager.PrimeRecord          PROCEDURE()
 CODE
    SELF.QL.Fields.ClearLeft
    RETURN SELF.QL.PrimeRecord()

QListEIPManager.BCPrimarySaveBuffer  PROCEDURE()
 CODE
QListEIPManager.BCPrimaryRestoreBuffer PROCEDURE()
 CODE
QListEIPManager.BCPrimaryCancelAutoInc PROCEDURE()
 CODE
    SELF.QL.CurrentChoice = SELF.CurrentChoice
    SELF.QL.ListBox{PROP:SelStart}=SELF.CurrentChoice
    POST(Event:NewSelection,SELF.QL.ListBox)
    !SELF.QL.TakeChoiceChanged()
QListEIPManager.BCPrimaryDelete      PROCEDURE(BYTE pAsk=0)
 CODE
    SELF.QL.DeleteRecord()
    IF ERRORCODE()
       RETURN Level:Fatal
    ELSE
       RETURN Level:Benign
    END
QListEIPManager.BCPrimaryInsert      PROCEDURE()
 CODE
    !SELF.QL.InsertRecord()
    IF ERRORCODE()
       RETURN Level:Fatal
    ELSE
       RETURN Level:Benign
    END
QListEIPManager.BCPrimaryUpdate      PROCEDURE()
 CODE
    !SELF.QL.ChangeRecord()
    IF ERRORCODE()
       RETURN Level:Fatal
    ELSE
       RETURN Level:Benign
    END
