CBCodeParseClass.FindCommaOrParen   PROCEDURE(STRING CodeTxt, <*STRING OutCharFound>)!,LONG
Comma1    LONG    
Paren1    LONG 
    CODE
    Comma1=INSTRING(',',CodeTxt,1)       !LINE,AT(0
    Paren1=INSTRING('(',CodeTxt,1)       !STRING(@D1),
    IF Paren1 AND Paren1 < Comma1 THEN 
       Comma1 = Paren1
       
    END
    IF ~OMITTED(OutCharFound) THEN
       OutCharFound = SUB(Codetxt,Comma1,1)
       return
       a=1
    END
    RETURN Comma1
