parser grammar ClarionParser;

import ClarionExpressions, ClarionAssignment, ClarionUI, ClarionData, ClarionFile;
options { tokenVocab=ClarionLexer; }

// 🌟 Entry Point
clarionFile
    : LINEBREAK* (program | memberModule) LINEBREAK* EOF
    ;

program
    : PROGRAM LINEBREAK*
      mapSection LINEBREAK*
      globalDataSection? LINEBREAK*
      procedureDefinition* LINEBREAK*
    ;

memberModule
    : MEMBER (LPAREN STRING? RPAREN)? LINEBREAK*
      mapSection? LINEBREAK*
      moduleBody LINEBREAK*
    ;

moduleBody
    : (LINEBREAK* moduleElement LINEBREAK*)*
    ;

moduleElement  
    : windowDefinition         // ⬅ move it up
    | procedureDefinition
    | routineDefinition
    | classDeclaration
    | queueBlock
    | groupBlock
    | variableDeclaration
    | includeDirective
    | equateDefinition
    | executableStatement
    ;


// 🌟 MAP Support
mapSection
    : MAP LINEBREAK*
      prototypeList? LINEBREAK*
      moduleBlock* LINEBREAK*
      END LINEBREAK*
    ;

moduleBlock
    : MODULE LPAREN STRING RPAREN LINEBREAK*
      prototypeList LINEBREAK*
      END LINEBREAK*
    ;

prototypeList
    : (LINEBREAK* prototype LINEBREAK*)+
    ;

prototype
    : label PROCEDURE (LPAREN (parameter (COMMA parameter)*)? RPAREN)? (COMMA returnType)? SEMI?
    ;

// 🌟 Procedure Definitions
procedureDefinition
    : label PROCEDURE (parameterList)? (COMMA returnType)? LINEBREAK*
      localDataSection?
      (CODE LINEBREAK*
      executableStatement*)?
    ;



// 🌟 Local Data
localDataSection
    : (LINEBREAK* localDataEntry LINEBREAK*)*
    ;

localDataEntry
    : windowDefinition
    | variableDeclaration
    | includeDirective
    | equateDefinition
    | groupBlock
    | queueBlock
    | classDeclaration
    | mapSection
    ;




executableStatement
    : returnStatement
    | assignmentStatement
    | routineDefinition
    | functionCallStatement statementTerminator?
    | controlStructure
    | includeDirective
    | doStatement
    ;

// Function calls
functionCallStatement
    : functionCall
    ;

expressionStatement
    : expression
    ;

// ✅ DO Statement
doStatement
    : DO label statementTerminator
    | DO ID statementTerminator
    ;

returnStatement
    : RETURN expression? statementTerminator
    ;

// 🌟 Class Definitions
classDefinition
    : label CLASS (DOT)? LINEBREAK* classBody LINEBREAK* END
    ;

classBody
    : (LINEBREAK* (methodDefinition | variableDeclaration) LINEBREAK*)*
    ;

methodDefinition
    : label PROCEDURE (parameterList)? (COMMA returnType)? LINEBREAK*
      localDataSection?
      (CODE LINEBREAK*
      executableStatement*)?
    ;

variableDeclaration
    : label label (COMMA label)*
    | label fieldReference (LPAREN argumentList RPAREN)? (COMMA label)*
    ;

// 🌟 Routine Definitions (NO nesting)
routineDefinition
    : label ROUTINE
    | label ROUTINE LINEBREAK* executableStatement+
    | label ROUTINE DATA LINEBREAK* localDataSection
    | label ROUTINE CODE LINEBREAK* executableStatement*
    | label ROUTINE DATA LINEBREAK* localDataSection LINEBREAK* CODE LINEBREAK* executableStatement*
    ;

// 🌟 Control Structures
controlStructure
    : ifStatement
    | loopStatement
    | caseStatement
    ;

// In Clarion, IF statements can be:
// 1. Single-line: IF condition THEN statement.
// 2. Multi-line with END: IF condition THEN statements... END
// 3. Multi-line with ELSE: IF condition THEN statements... ELSE statements... END
ifStatement
    : IF expression (THEN)?
      (
        // Single-line IF with statement terminator
        executableStatement
        |
        // Multi-line IF with END
        LINEBREAK* (executableStatement LINEBREAK*)*
        (elsifClause)*
        (ELSE LINEBREAK* (executableStatement LINEBREAK*)*)?
        END
      )
    ;


elsifClause
    : ELSIF expression (THEN)? LINEBREAK* executableStatement*
    ;

loopStatement
    : LOOP LINEBREAK* executableStatement* LINEBREAK* END
    ;

caseStatement
    : CASE .*? (OF LINEBREAK* caseBranch+)* (ELSE LINEBREAK* executableStatement*)? END
    ;

caseBranch
    : OF .*? LINEBREAK* executableStatement*
    ;

caseBlock
    : label ARROW LINEBREAK* executableStatement*
    ;

// 🌟 Label Rule
label
    : ID (COLON ID)* (DOT ID)?
    ;
