

   MEMBER('TestKanban.clw')                                ! This is a MEMBER module


   INCLUDE('ABRESIZE.INC'),ONCE
   INCLUDE('ABTOOLBA.INC'),ONCE
   INCLUDE('ABWINDOW.INC'),ONCE

  
!!! <summary>
!!! Generated from procedure template - Window
!!! </summary>
Main PROCEDURE 

cardMeta LIKE(KanbanCardMeta)
udpt            UltimateDebugProcedureTracker
Window               WINDOW('Caption'),AT(,,395,224),FONT('Segoe UI',9),RESIZE,GRAY,MAX,SYSTEM,IMM
                       BUTTON('&OK'),AT(291,201,41,14),USE(?OkButton),DEFAULT
                       BUTTON('&Cancel'),AT(340,201,42,14),USE(?CancelButton)
                       OLE,AT(2,2,391,196),USE(?KanbanOLE)
                       END
                     END

               MAP
KanbanProcess_Kanban   PROCEDURE
               END
Kanban_Event          EQUATE(Event:User+2000+?KanbanOLE)
HelloWorld           CLASS
SayHello               PROCEDURE
                     END
ThisWindow           CLASS(WindowManager)
Init                   PROCEDURE(),BYTE,PROC,DERIVED
Kill                   PROCEDURE(),BYTE,PROC,DERIVED
TakeAccepted           PROCEDURE(),BYTE,PROC,DERIVED
TakeEvent              PROCEDURE(),BYTE,PROC,DERIVED
TakeWindowEvent        PROCEDURE(),BYTE,PROC,DERIVED
                     END

Toolbar              ToolbarClass
! ----- Kanban --------------------------------------------------------------------------
!!! <summary>
!!! This class is a wrapper around the Kanban OLE control, exposing methods and events in a way that is easier to work with in the context of this window manager based window. The class is designed
Kanban               Class(KanbanWrapperClass)
    ! derived method declarations
Init                   PROCEDURE (LONG pCtrl),VIRTUAL
OnPageReady            PROCEDURE (),VIRTUAL
OnContextMenuSelected  PROCEDURE (STRING pCardId, STRING pActionId),VIRTUAL
OnSingleClick          PROCEDURE (STRING pCardId),VIRTUAL
OnDoubleClick          PROCEDURE (STRING pCardId),VIRTUAL
                     End  ! Kanban
! ----- end Kanban -----------------------------------------------------------------------
Resizer              CLASS(WindowResizeClass)
Init                   PROCEDURE(BYTE AppStrategy=AppStrategy:Resize,BYTE SetWindowMinSize=False,BYTE SetWindowMaxSize=False)
                     END


  CODE
  GlobalResponse = ThisWindow.Run()                        ! Opens the window and starts an Accept Loop

!---------------------------------------------------------------------------
DefineListboxStyle ROUTINE
!|
!| This routine create all the styles to be shared in this window
!| It`s called after the window open
!|
!---------------------------------------------------------------------------

ThisWindow.Init PROCEDURE

ReturnValue          BYTE,AUTO

  CODE
        udpt.Init(UD,'Main','TestKanban001.clw','TestKanban.EXE','04/11/2026 @ 01:36PM')    
             
  GlobalErrors.SetProcedureName('Main')
  SELF.Request = GlobalRequest                             ! Store the incoming request
  ReturnValue = PARENT.Init()
  IF ReturnValue THEN RETURN ReturnValue.
  SELF.FirstField = ?OkButton
  SELF.VCRRequest &= VCRRequest
  SELF.Errors &= GlobalErrors                              ! Set this windows ErrorManager to the global ErrorManager
  CLEAR(GlobalRequest)                                     ! Clear GlobalRequest after storing locally
  CLEAR(GlobalResponse)
  SELF.AddItem(Toolbar)
  SELF.Open(Window)                                        ! Open window
  Do DefineListboxStyle
  Window{Prop:Alrt,255} = CtrlShiftP
  Resizer.Init(AppStrategy:Spread)                         ! Controls will spread out as the window gets bigger
  SELF.AddItem(Resizer)                                    ! Add resizer to window manager
  INIMgr.Fetch('Main',Window)                              ! Restore window settings from non-volatile store
  Resizer.Resize                                           ! Reset required after window size altered by INI manager
  SELF.SetAlerts()
  RETURN ReturnValue


ThisWindow.Kill PROCEDURE

ReturnValue          BYTE,AUTO

  CODE
  ReturnValue = PARENT.Kill()
  IF ReturnValue THEN RETURN ReturnValue.
  IF SELF.Opened
    INIMgr.Update('Main',Window)                           ! Save window data to non-volatile store
  END
  GlobalErrors.SetProcedureName
            
   
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
    OF ?CancelButton
            POST(EVENT:CloseWindow)
    END
  ReturnValue = PARENT.TakeAccepted()
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
  ReturnValue = PARENT.TakeEvent()
  IF Event()=Kanban_Event
    KanbanProcess_Kanban()
  END
     IF KEYCODE()=CtrlShiftP AND EVENT() = Event:PreAlertKey
       CYCLE
     END
     IF KEYCODE()=CtrlShiftP  
        UD.ShowProcedureInfo('Main',UD.SetApplicationName('TestKanban','EXE'),Window{PROP:Hlp},'04/02/2026 @ 10:11AM','04/11/2026 @ 01:36PM','04/11/2026 @ 01:36PM')  
    
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
  ReturnValue = PARENT.TakeWindowEvent()
    CASE EVENT()
    OF EVENT:CloseWindow
      Kanban.Kill()
    OF EVENT:OpenWindow
      ?KanbanOLE{PROP:Create} = 'GenericKanban.GenericKanbanControl'
      Kanban.Init(?KanbanOLE)
      Kanban.RegisterEvents(?KanbanOLE,Kanban_Event)
    END
    RETURN ReturnValue
  END
  ReturnValue = Level:Fatal
  RETURN ReturnValue

!----------------------------------------------------
Kanban.Init   PROCEDURE (LONG pCtrl)
  CODE
  ud.Debug('init called')
  PARENT.Init (pCtrl)
!----------------------------------------------------
Kanban.OnPageReady   PROCEDURE ()
KANBAN_COL_NOTSTARTED    EQUATE(0607D8Bh)   ! Blue Grey
KANBAN_COL_STUDIO        EQUATE(000796Bh)   ! Teal
KANBAN_COL_PRINT         EQUATE(0795548h)   ! Brown
KANBAN_COL_FINISHING     EQUATE(06A1B9Ah)   ! Purple
KANBAN_COL_COMPLETE      EQUATE(0C0392Bh)   ! Dark Red
KANBAN_COL_INVOICED      EQUATE(01A3A6Bh)   ! Dark Teal
KANBAN_PRI_HIGH          EQUATE(0E74C3Ch)   ! Red
KANBAN_PRI_MEDIUM        EQUATE(0F39C12h)   ! Orange
KANBAN_PRI_LOW           EQUATE(027AE60h)   ! Green
KANBAN_TAG_ARTWORK       EQUATE(3498DBh)    ! Blue
KANBAN_TAG_MARKETING     EQUATE(08E44ADh)   ! Green
KANBAN_TAG_DESIGN        EQUATE(09B59B5h)   ! Teal
KANBAN_BOARD_BG          EQUATE(06C3483h)   ! Dark Purple
  CODE
  PARENT.OnPageReady ()
      SELF.AddColumn('notstarted', 'Not Started', KANBAN_COL_NOTSTARTED)
      SELF.AddColumn('studio',     'Studio',      KANBAN_COL_STUDIO)                  
      SELF.AddColumn('print',      'Print',       KANBAN_COL_PRINT)                   
      SELF.AddColumn('finishing',  'Finishing',   KANBAN_COL_FINISHING)
      SELF.AddColumn('complete',   'Complete',    KANBAN_COL_COMPLETE)
      SELF.AddColumn('invoiced',   'Invoiced',    KANBAN_COL_INVOICED)
      SELF.SetAllColumnTextColors(COLOR:White)
      SELF.SetColumnWipLimit('notstarted', 1)
         ! Define status options once - drives filter panel, context menu and card status bar
      SELF.SetStatusTitle('Priority')
      SELF.AddStatusOption('pri_high',   'High',   KANBAN_PRI_HIGH)
      SELF.AddStatusOption('pri_medium', 'Medium', KANBAN_PRI_MEDIUM)
      SELF.AddStatusOption('pri_low',    'Low',    KANBAN_PRI_LOW)
      SELF.AddStatusOption('pri_none',   'None',   -1)
      SELF.SetDarkMode(1)
         !Card Meta
      CLEAR(CardMeta)
      CardMeta.CardId = 'c1'
      CardMeta.ColumnId = 'notstarted'
      CardMeta.Title = 'Fix Login bug'
      CardMeta.Body = 'Repro on Chrome only. Test a ,longer body to see what happens to text'
      CardMeta.Overdue = 1
      CardMeta.Tag = 'Artwork'
      CardMeta.TagColor = KANBAN_TAG_ARTWORK
      CardMeta.Assignee = 'Sarah'
      CardMeta.DueDate = '04/04/26'
      CardMeta.Progress = 65
      CardMeta.StatusOption = 'pri_low'
      SELF.AddCard(CardMeta)
      Clear(CardMeta)
      CardMeta.CardId = 'c2'
      CardMeta.ColumnId = 'studio'
      CardMeta.Title = 'Write unit tests'
      CardMeta.StatusOption = 'pri_medium'
      CardMeta.Assignee = 'Mark'
      CardMeta.Progress = -1
      SELF.AddCard(CardMeta)
      clear(CardMeta)
      CardMeta.CardId = 'c3'
      CardMeta.ColumnId = 'print'
      CardMeta.Title = 'Refactor data layer'
      CardMeta.Body = 'Started 01/04/2026'
      CardMeta.StatusOption = 'pri_high'
      CardMeta.Progress = -1
      SELF.AddCard(CardMeta)
      clear(CardMeta)
      CardMeta.CardId = 'c4'
      CardMeta.ColumnId = 'notstarted'
      CardMeta.Title = 'Deploy to staging'
      CardMeta.Body = 'Completed'
      CardMeta.StatusOption = 'pri_none'
      CardMeta.Progress = -1
      SELF.AddCard(CardMeta)
      clear(CardMeta)
      CardMeta.CardId = 'c5'
      CardMeta.ColumnId = 'print'
      CardMeta.Title = 'Brochure Print Run'
      CardMeta.Body = 'Q2 marketing brochure - 500 copies, A4 gloss'
      CardMeta.Tag = 'Marketing'
      CardMeta.TagColor = KANBAN_TAG_MARKETING
      CardMeta.Assignee = 'Julie'
      CardMeta.DueDate = '18/04/26'
      CardMeta.Progress = 40
      CardMeta.StatusOption = 'pri_medium'
      SELF.AddCard(CardMeta)
      clear(CardMeta)
      CardMeta.CardId = 'c6'
      CardMeta.ColumnId = 'studio'
      CardMeta.Title = 'Design New Logo'
      CardMeta.Body = 'Refresh brand identity - vector source files needed'
      CardMeta.Tag = 'Design'
      CardMeta.TagColor = KANBAN_TAG_DESIGN
      CardMeta.Assignee = 'Emma'
      CardMeta.DueDate = '30/04/26'
      CardMeta.Progress = 20
      CardMeta.StatusOption = 'pri_high'
      SELF.AddCard(CardMeta)
      clear(CardMeta)
      CardMeta.CardId = 'c7'
      CardMeta.ColumnId = 'finishing'
      CardMeta.Title = 'Client Approval Sign-off'
      CardMeta.Body = 'Awaiting final approval from client before invoice raised'     
      CardMeta.Tag = 'Admin'
      CardMeta.TagColor = KANBAN_TAG_ARTWORK
      CardMeta.Assignee = 'Sarah'
      CardMeta.DueDate = '25/04/26'
      CardMeta.Progress = 80
      CardMeta.StatusOption = 'pri_medium'
      SELF.AddCard(CardMeta)
      clear(CardMeta)
      CardMeta.CardId = 'c8'
      CardMeta.ColumnId = 'complete'
      CardMeta.Title = 'Annual Report Layout'
      CardMeta.Body = 'Final layout approved and sent to print'
      CardMeta.Tag = 'Design'
      CardMeta.TagColor = KANBAN_TAG_DESIGN
      CardMeta.Assignee = 'Emma'
      CardMeta.DueDate = '10/04/26'
      CardMeta.Progress = 100
      CardMeta.StatusOption = 'pri_none'
      SELF.AddCard(CardMeta)
      clear(CardMeta)
      CardMeta.CardId = 'c9'
      CardMeta.ColumnId = 'invoiced'
      CardMeta.Title = 'Invoice #1042'
      CardMeta.Body = 'Sent to client 09/04/2026'
      CardMeta.Tag = 'Admin'
      CardMeta.TagColor = KANBAN_TAG_ARTWORK
      CardMeta.Assignee = 'Mark'
      CardMeta.DueDate = '30/04/26'
      CardMeta.Progress = -1
      CardMeta.StatusOption = 'pri_none'
      SELF.AddCard(CardMeta)
         ! Build filter panel and context menu radio group from status definition     
      SELF.BuildFilterFromStatus()
      SELF.ClearContextMenu()
      SELF.AddContextMenuItem('', 'edit',     'Edit Card')
      SELF.AddContextMenuItem('', 'move_top', 'Move to Top')
      SELF.AddContextMenuSep('')
      SELF.BuildMenuFromStatus('')
      SELF.AddContextMenuSep('')
      SELF.AddContextMenuItem('', 'delete', 'Delete Card')
      SELF.SetBoardTitle('Job Tracking Board', KANBAN_BOARD_BG, COLOR:White)
!----------------------------------------------------
Kanban.OnContextMenuSelected   PROCEDURE (STRING pCardId, STRING pActionId)
  CODE
  PARENT.OnContextMenuSelected (pCardId,pActionId)
       
     Case pActionId
     of 'move_top'
       SELF.MoveCardToTop(pCardID)
     of 'pri_high'
     orof 'pri_medium'
     orof 'pri_low'
     orof 'pri_none'
       SELF.SetCardStatus(pCardID, pActionID)
      of 'delete'
        Self.RemoveCard(pCardId)
       ! handle delete
     of 'edit'
       ! handle edit
     END
!----------------------------------------------------
Kanban.OnSingleClick   PROCEDURE (STRING pCardId)
  CODE
  PARENT.OnSingleClick (pCardId)
  ud.Debug('Single Click')
!----------------------------------------------------
Kanban.OnDoubleClick   PROCEDURE (STRING pCardId)
CurrentClick LONG
  CODE
  PARENT.OnDoubleClick (pCardId)
!  CurrentClick = CLOCK()
!  IF  Self.LastClicked < CurrentClick and Self.LastClicked > CurrentClick-30
    ud.Debug('Clicked on:    ' & pCardId)
!    ud.Debug('Last Click:    ' & Self.LastClicked)
!    ud.Debug('Current Click: ' & CurrentClick)
!  END
!  Self.LastClicked = CLOCK()
KanbanProcess_Kanban  PROCEDURE
  CODE
  LOOP WHILE Kanban.GetEvent()
    CASE Kanban.EventName
    OF 'PageReady'
      Kanban.OnPageReady()
    OF 'CardMoved'
      Kanban.OnCardMoved(Kanban.Parm1,Kanban.Parm2,Kanban.Parm3)
    OF 'ContextMenuSelected'
      Kanban.OnContextMenuSelected(Kanban.Parm1,Kanban.Parm2)
    OF 'CardDoubleClick'
      Kanban.OnDoubleClick(Kanban.Parm1)
    OF 'CardClick'
      Kanban.OnSingleClick(Kanban.Parm1)
    OF 'CardRightClick'
      Kanban.OnCardRightClick(Kanban.Parm1)
    ELSE
      Kanban.OnOtherEvent(Kanban.EventName)
    END
  END

Resizer.Init PROCEDURE(BYTE AppStrategy=AppStrategy:Resize,BYTE SetWindowMinSize=False,BYTE SetWindowMaxSize=False)


  CODE
  PARENT.Init(AppStrategy,SetWindowMinSize,SetWindowMaxSize)
  SELF.SetParentDefaults()                                 ! Calculate default control parent-child relationships based upon their positions on the window

HelloWorld.SayHello  PROCEDURE
  CODE
  MESSAGE('Hello World!')
