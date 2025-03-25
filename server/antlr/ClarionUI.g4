parser grammar ClarionUI;

options { tokenVocab=ClarionLexer; }
// Matches any UI attribute (ID or reserved tokens like FONT, STATUS, etc.)
ignoredAttribute
    : attributeName (LPAREN ignoredAttributeContent RPAREN)?
    ;

// Non-greedy: consume anything until the parent RPAREN closes the attribute
ignoredAttributeContent
    : ( . )*?
    ;

// Accepts ID and known UI attribute tokens
attributeName
    : ID
    | FONT
    | ICON
    | AT
    | STATUS
    | CENTER
    | SYSTEM
    | MAX
    | MIN
    | IMM
    | RESIZE
    | MDI
    | MODAL
    | STD
    | MSG
    | USE
    | COLON
    ;
    

windowDefinition
    : ID windowType LPAREN STRING RPAREN
      (COMMA ignoredAttribute)* (LINEBREAK | COMMA)*
      windowBody
    ;

windowType
    : APPLICATION
    | WINDOW
    ;

// Window body = multiple UI elements followed by END
windowBody
    : LINEBREAK* (windowElement LINEBREAK*)* endMarker
    ;

windowElement
    : menubarBlock
    | toolbarBlock
    | sheetBlock
    | groupBlock
    | optionBlock
    | LINEBREAK
    ;

// END / .
endMarker
    : END
    | STATEMENT_END
    ;

// ==============================
// MENUBAR → MENU → ITEM
// ==============================
menubarBlock
    : MENUBAR (COMMA ID)* (LINEBREAK+ menuBlock)* endMarker
    ;

menuBlock
    : MENU (COMMA ID)* LINEBREAK* itemDefinition* endMarker
    ;

itemDefinition
    : ITEM (LPAREN STRING RPAREN)? (COMMA ID)* LINEBREAK*
    ;

// ==============================
// TOOLBAR → BUTTON
// ==============================
toolbarBlock
    : TOOLBAR (COMMA ignoredAttribute)* (LINEBREAK | COMMA)* toolbarContent? endMarker
    ;

toolbarContent
    : (~END)+ // any tokens except END
    ;



buttonDefinition
    : BUTTON (LPAREN STRING RPAREN)? (COMMA ID)* LINEBREAK*
    ;

// ==============================
// SHEET / TAB / GROUP / OPTION
// ==============================
sheetBlock
    : SHEET (COMMA ID)* LINEBREAK* tabBlock* endMarker
    ;

tabBlock
    : TAB (LPAREN STRING RPAREN)? LINEBREAK* controlBlock* endMarker
    ;

groupBlock
    : GROUP (LPAREN STRING RPAREN)? LINEBREAK* controlBlock* endMarker
    ;

optionBlock
    : OPTION (LPAREN STRING RPAREN)? LINEBREAK* controlBlock* endMarker
    ;

// Unknown controls inside GROUP/TAB/OPTION
controlBlock
    : (ID | unknownContent) LINEBREAK*
    ;

// Fallback for control lines
unknownContent
    : ~(END | STATEMENT_END) // fuzzy for folding only
    ;
