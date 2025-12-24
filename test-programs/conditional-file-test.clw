   PROGRAM

            COMPILE('***',UseIPDrv)
PrEquip                 FILE,PRE(PRE),BINDABLE,THREAD   ,DRIVER('IPDRV'),OWNER(IPDRV::OWNER)
            !***
            OMIT('***',UseIPDrv)
PrEquip                 FILE,PRE(PRE),BINDABLE,THREAD   ,DRIVER('TOPSPEED','/TCF=.\Topspeed.TCF')
            !***
KPrEquip_ID              KEY(PRE:Project_ID,PRE:Equip_ID),NOCASE
Record                   RECORD,PRE()
Equip_ID                    STRING(15)
Project_ID                  LONG
Descr                       STRING(40)
Daily_Rate                  REAL
PC_Code                     STRING(10)
Flag                        BYTE         ! Never Used
CreateDate                  DATE
CreateTime                  TIME
UpdateDate                  DATE
UpdateTime                  TIME
                         END
                       END

   CODE
   RETURN
