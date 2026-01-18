

   MEMBER('IBSCommon.clw')                                 ! This is a MEMBER module


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
                     END

FDB5                 CLASS(FileDropClass)                  ! File drop manager
