/**
 * Token type definitions and interfaces for the Clarion tokenizer
 */

export enum TokenType {
    Comment,
    String,
    Keyword,
    Directive,
    Function,
    Variable,
    Number,
    Operator,
    Class,
    Attribute,
    Property,
    Constant,
    Type,
    DataTypeParameter,      // ✅ Parameters in data type declarations: STRING(255), CSTRING(100)
    TypeAnnotation,
    ImplicitVariable,
    Structure,
    ReferenceVariable,
    LineContinuation,
    Delimiter,
    FunctionArgumentParameter,
    PointerParameter,
    FieldEquateLabel,
    PropertyFunction,
    Unknown,
    Label,
    EndStatement,
    ClarionDocument, // ✅ PROGRAM / MEMBER token type
    Procedure,
    Routine,
    ExecutionMarker,
    Region,
    ConditionalContinuation,
    ColorValue,
    StructureField,   // ✅ Field within a structure
    StructurePrefix,   // ✅ Prefix notation for structure fields (e.g., INV:Customer)
    // ✅ New Subtypes for PROCEDURE tokens
    GlobalProcedure,           // PROCEDURE declared at global level (with CODE)
    MethodDeclaration,         // PROCEDURE inside a CLASS/MAP/INTERFACE (definition only, no CODE)
    MethodImplementation,      // e.g., ThisWindow.Init PROCEDURE (with CODE)
    MapProcedure,              // Optional: inside MAP structure
    InterfaceMethod,           // Optional: inside INTERFACE structure
    // ✅ Window structure elements
    WindowElement,             // Elements that appear in window structures (BUTTON, LIST, ITEM)
    PictureFormat,             // Picture format specifiers (e.g., @N10.2)
    TypeReference,             // Type-referencing keywords: LIKE (e.g., uzOptions LIKE(UnzipOptionsType))
    Interface                  // Subtype for INTERFACE structure tokens (distinct from generic Structure)
}

export interface Token {
    label?: string; // ✅ Store label for the token
    colorParams?: string[];
    type: TokenType;
    subType?: TokenType;
    value: string;
    line: number;
    start: number;
    finishesAt?: number;
    parent?: Token;
    children?: Token[];
    executionMarker?: Token;  // ✅ First explicit "CODE" statement (if present)
    hasLocalData?: boolean;   // ✅ True if "DATA" exists before "CODE"
    inferredCode?: boolean;   // ✅ True if "CODE" is implied (not explicitly written)
    maxLabelLength: number;   // ✅ Store max label length
    structurePrefix?: string; // ✅ Store structure prefix (e.g., "INV" from PRE(INV))
    isStructureField?: boolean; // ✅ Flag to identify structure fields
    structureParent?: Token;  // ✅ Reference to the parent structure token
    nestedLabel?: string;     // ✅ Store the label of the nesting structure (e.g., "Queue:Browse:1" for fields inside it)
    referencedFile?: string;  // ✅ Resolved path for any file reference (MODULE/INCLUDE/LINK/MEMBER/etc)
    localVariablesAnalyzed?: boolean;  // 🚀 PERF: Track if procedure's local variables were already analyzed
    isSingleLineWithContinuation?: boolean; // ✅ True if structure is single-line but spans multiple lines due to |
    sourceFile?: string;      // ✅ File this token came from (if from INCLUDE)
    sourceContext?: {         // ✅ Context when token is from an INCLUDE file
        isFromInclude: boolean;
        includeFile: string;
        parentFile: string;   // File that has the INCLUDE statement
    };
    implementedInterfaces?: string[];  // Names of interfaces a CLASS implements (from IMPLEMENTS() attributes)
}
