  PROGRAM

  MAP
    INCLUDE('protos.inc','PROTOTYPES'),ONCE
    MODULE('prefixproto.clw')
reg:ITEM:CashOutExists  PROCEDURE(),LONG
    END
  END

  CODE
  WIN:ShowExits()
  reg:WIN:ShowExits()
  DoNothing# = WIN:Plain(1)
  DoNothing# = reg:WIN:Plain(2)
  WIN:BareOne
  reg:WIN:BareTwo
  DoNothing# = reg:WIN:WithAttr()
  DoNothing# = reg:ITEM:CashOutExists()
  RETURN

reg:ITEM:CashOutExists  PROCEDURE()
  CODE
  RETURN(1)

WIN:ShowExits  PROCEDURE()
  CODE
  RETURN

WIN:Plain  PROCEDURE(LONG pX)
  CODE
  RETURN(pX)

reg:WIN:ShowExits  PROCEDURE()
  CODE
  RETURN

reg:WIN:Plain  PROCEDURE(LONG pX)
  CODE
  RETURN(pX)

WIN:BareOne  PROCEDURE()
  CODE
  RETURN

reg:WIN:BareTwo  PROCEDURE()
  CODE
  RETURN

reg:WIN:WithAttr  PROCEDURE()
  CODE
  RETURN(0)
