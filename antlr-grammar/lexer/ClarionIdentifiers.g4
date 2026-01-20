// ============================================================================
// Clarion Identifiers - MUST be imported LAST
// ============================================================================

lexer grammar ClarionIdentifiers;

options { caseInsensitive = true; }

// ============================================================================
// COLUMN-0 LABEL HANDLING
// ============================================================================
// NOTE:
// Clarion labels may use keyword text (WINDOW, STRING, GROUP, etc.).
// Column 0 always implies label position.
// Structure keywords are predicated to non-column-0 to allow this.
//
// Example:
//   Window  WINDOW(...),AT(10,10)
//   ^^^^^^  ^^^^^^^^^^^^^^^^^^^^^^^
//   LABEL   WINDOW keyword + attributes
// ============================================================================

// Qualified identifier with structure prefix (e.g., INV:Customer, inv:customer)
// Also supports namespace qualification: History::PYA:Record
// Case-insensitive for Clarion
QUALIFIED_IDENTIFIER
    : [A-Za-z_][A-Za-z0-9_]* '::' [A-Za-z_][A-Za-z0-9_]* ':' [A-Za-z_][A-Za-z0-9_]*  // Namespace::Prefix:Field
    | [A-Za-z_][A-Za-z0-9_]* '::' [A-Za-z_][A-Za-z0-9_]*  // Namespace::Identifier
    | [A-Za-z_][A-Za-z0-9_]* (':' [A-Za-z_][A-Za-z0-9_]*)+  // Prefix:Field or Prefix:Part1:Part2:...
    ;

// NOTE: Member access (e.g., Object.Method) is handled in the parser
// as: identifier DOT identifier, not as a single lexer token

// Implicit type variables (created by compiler at first use per ClarionDocs)
// # suffix → implicit LONG (e.g., Counter#)
// $ suffix → implicit REAL (e.g., Percent$)
// " suffix → implicit STRING(32) (e.g., Address")
IMPLICIT_NUMERIC
    : [A-Za-z_][A-Za-z0-9_]* '#'
    ;

IMPLICIT_STRING
    : [A-Za-z_][A-Za-z0-9_]* '$'
    ;

IMPLICIT_QUOTE
    : [A-Za-z_][A-Za-z0-9_]* '"'
    ;

// Reference variable (with &) - can be qualified with : or ::
// Reference variables (e.g., &QueueType) are handled in the parser as AMPERSAND + identifier
// to avoid ambiguity with & as the concatenation operator in expressions like ''&GetMOD()
// REFERENCE_VAR
//     : '&' [A-Za-z_][A-Za-z0-9_:]* ('::' [A-Za-z_][A-Za-z0-9_]*)?
//     ;

// Note: Pointer variables (*type) are only used in procedure parameters
// and are handled at parser level as MULT + anyIdentifier, not as a lexer token.
// This avoids ambiguity with multiplication operator: x=3*int(y)

// Column-0 LABEL - matches at column 0 only, allows keyword text
// This MUST appear before IDENTIFIER to get priority at column 0
LABEL
    : {this.charPositionInLine == 0}? [A-Za-z_] [A-Za-z0-9_:]*
    ;

// Regular identifier - matches at any column except when LABEL matches
IDENTIFIER
    : [A-Za-z_] [A-Za-z0-9_]*
    ;
