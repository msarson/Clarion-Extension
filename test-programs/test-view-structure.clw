PROGRAM

Customer FILE,DRIVER('TOPSPEED'),PRE(CUS)
          KEY(CUS:ID),PRIMARY
          RECORD
CUS:ID         LONG
CUS:Name       STRING(50)
CUS:City       STRING(30)
          END
        END

Orders   FILE,DRIVER('TOPSPEED'),PRE(ORD)
          KEY(ORD:OrderID),PRIMARY
          KEY(ORD:CustomerID)
          RECORD
ORD:OrderID    LONG
ORD:CustomerID LONG
ORD:Amount     DECIMAL(12,2)
ORD:Date       LONG
          END
        END

OrderDetails FILE,DRIVER('TOPSPEED'),PRE(DTL)
          KEY(DTL:OrderID)
          RECORD
DTL:OrderID    LONG
DTL:ProductID  LONG
DTL:Quantity   SHORT
          END
        END

CustomerOrders VIEW(Customer)
                PROJECT(CUS:ID, CUS:Name, CUS:City)
                FILTER(CUS:City = 'Seattle')
                ORDER(CUS:Name)
                JOIN(ORD:CustomerID, CUS:ID)
                  PROJECT(ORD:OrderID, ORD:Amount, ORD:Date)
                  JOIN(DTL:OrderID, ORD:OrderID)
                    PROJECT(DTL:ProductID, DTL:Quantity)
                  END
                END
              END

CODE
  MESSAGE('Test VIEW Structure')
