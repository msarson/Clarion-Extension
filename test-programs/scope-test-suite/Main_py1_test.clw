   MEMBER('py1.clw')

   MAP
     INCLUDE('MAIN_PY1.INC'),ONCE        !Local module procedure declarations
     INCLUDE('CHECKD15_PY1.INC'),ONCE        !Req'd for module callout resolution
     INCLUDE('CHECKD17_PY1.INC'),ONCE        !Req'd for module callout resolution
     INCLUDE('CHECKD18_PY1.INC'),ONCE        !Req'd for module callout resolution
     INCLUDE('SELECTPAYROLLACCOUNT_PY1.INC'),ONCE        !Req'd for module callout resolution
     INCLUDE('SELECTSTATETAXID_PY1.INC'),ONCE        !Req'd for module callout resolution
     INCLUDE('SETPYSTATETAX_PY1.INC'),ONCE        !Req'd for module callout resolution
     INCLUDE('STARTPROC_PY1.INC'),ONCE        !Req'd for module callout resolution
   END

TestProc PROCEDURE()
CODE
  StartProc(1)
  RETURN
