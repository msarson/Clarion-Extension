# Snippet Cheat Sheet

[← Back to Documentation Home](../../README.md)

Snippets are activated when a range of characters are typed that match the selected snippet and then pressing the activation key, TAB for instance.

## **Variables can be declared in the following way**

**V{variable type}** for a normal variable declaration 
Example **VS** to declare a string
```clarion
Bar String(10)
```
**RV{variable type}** if you want to define a reference variable:
example **RVS** to declare a reference varialbe to a string
```clarion
Bar   &String
```
**PV{variable type}** if you want to define a procedure variable:
example **PVS** to declare a string parameter
```clarion
(STRING Foo)
```
**PVR{variable type}** if you want to define a procedure reference variable:
example **PVRS** to declare a reference to a string parameter
```clarion
(*STRING Foo)
```
## **The following variables types are available**

| Shortcut | Variable | 
| :---: | --- |
 as | ASTRING |
bf4 | BFLOAT4 |
bf8 | BFLOAT8 |
bs | BSTRING |
b | BYTE |
 cs | CSTRING |
dt | DATE |
d| DECIMAL |
l | LONG |
pd | PDECIMAL |
ps | PSTRING |
r  | REAL |
sh | SHORT |
sg | SIGNED |
sr | SREAL |
s | STRING |
ti | TIME |
ul | ULONG |
usg | UNSIGNED |
us | USHORT |

## **Language Snippets**

**Below is a list of Snippits that can be used**

**IF**
```clarion
IF THEN

END
```
**IFE**
```clarion
IF THEN

ELSE

END
```
**MAP**
```clarion
MAP

END
```
**MODULE**
```clarion
MODULE

END
```
**LOOP**
```clarion
LOOP

END
```
**LOOPFT**
```clarion
LOOP {var} = {From} to {To}

END
```
**LOOPFILE**
```clarion
LOOP UNTIL ACCESS:{FileName}.Next()

END
```
**ACCESS**
```clarion
Access:{FileName}.Methd(Params)
```
**DEBUG**
```clarion
'{User Text} [' & {var} & ]'
```
**DCLASS - define a Class**
```clarion
{ClassName}	CLASS,TYPE,MODULE('{ClassName}.clw'),LINK('{ClassName}.clw')

            END
```
**DCLASSCD - define a class with a constructor and destructor**
```clarion
{ClassName}	CLASS,TYPE,MODULE('{ClassName}.clw'),LINK('{ClassName}.clw')
CONSTRUCT		PROCEDURE()
DESTRUCT		PROCEDURE()
            END  
```
**IClass - implement a class**
```clarion
	MEMBER()

    INCLUDE('ClassName.inc'),ONCE

    MAP
    END
```
**IClassCD - implement a class with constructor and destructor**
```clarion
  INCLUDE('{ClassName}.inc'),ONCE

  MAP
  END

{ClassName}.CONSTRUCT		PROCEDURE()

   CODE

{ClassName}.DESTRUCT			PROCEDURE()

  CODE
```
**Method - implement a class method**
```clarion
{ClassName}.{MethodName}      PROCEDURE({Parameters})

  CODE
```
**DProc - define a procedure**
```clarion
{Name}		PROCEDURE({parameters}),{ReturnType}
```
**IProc - implement a procedure**
```clarion
{Name}		PROCEDURE({parameters})

  CODE
```