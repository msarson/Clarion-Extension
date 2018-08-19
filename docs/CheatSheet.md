# Snippet Cheat sheet for the clarion-extensions

Snippets are activated when a range of characters are typed that match the selected snippet and then pressing the activation key, TAB for instance.

## Variables

All variable are declared with eiher **V** for a normal variable declaration 
or **RV** if you want a reference variable. The case doesn't matter.

The list below is a list of variables that can be declared, so if you want a BYTE declaration the shortcut is **VB** and if you wanted a reference BYTE (&BYTE) it would be **RVB**

| Shortcut | variable | Comment |
| :---: | --- | --- |
 as | ASTRING |  |
bf4 | BFLOAT4 |  |
bf8 | BFLOAT8 |  |
bs | BSTRING |  |
b | BYTE |  |
c | CSTRING |  |
dt | DATE |  |
d| DECIMAL |  |
l | LONG |  |
pd | PDECIMAL |  |
ps | PSTRING |  |
r  | REAL |  |
sh | SHORT |  |
sg | SIGNED |  |
sr | SREAL |  |
s | STRING |  |
ti | TIME |  |
ul | ULONG |  |
usg | UNSIGNED |  |
us | USHORT |  |

## Classes and procedures

I am using the letter **D** to represent define and **I** for implement

So **DC** defines a class, and **IC** would implement.

| Shortcut | variable | Prefix with |
| :---: | --- | :---: |
| c | Class | d or i |
| ctr | Class with constructor and destructor | D or I |
| cm | Class Method Implementation | D or I |
| m | Class Method body | I |
| p | Procedure | D or I |

