  PROGRAM

  PRAGMA('link(ClaTPS.lib)')

  MAP
  END

Customer             FILE,DRIVER('TOPSPEED'),PRE(CUS),CREATE,THREAD
CusKey                   KEY(CUS:ID),NOCASE,OPT
Record                   RECORD,PRE()
ID                          LONG
Name                        STRING(30)
                         END
                     END

Orders               FILE,DRIVER('TOPSPEED'),PRE(ORD),CREATE,THREAD
OrdKey                   KEY(ORD:ID),NOCASE,OPT
Record                   RECORD,PRE()
ID                          LONG
CusID                       LONG
Total                       DECIMAL(9,2)
                         END
                     END

! 1. Prefix form - what the app generator emits.
ViewPrefix           VIEW(Orders)
                       PROJECT(ORD:ID)
                       JOIN(CUS:CusKey, ORD:CusID)
                         PROJECT(CUS:Name)
                       END
                     END

! 2. Dot form - File.Key and File.Field. Hand-coder style; legal.
ViewDotted           VIEW(Orders)
                       PROJECT(Orders.ID)
                       JOIN(Customer.CusKey, ORD:CusID)
                         PROJECT(Customer.Name)
                       END
                     END

! 3. Period terminator closing the JOIN instead of END.
ViewShortEnd         VIEW(Orders)
                       PROJECT(ORD:Total)
                       JOIN(CUS:CusKey, ORD:CusID)
                         PROJECT(CUS:Name)
                       .
                     END

  CODE
  RETURN
