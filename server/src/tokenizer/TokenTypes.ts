/**
 * Token type definitions and interfaces for the Clarion tokenizer
 */

import type { ProcedureParameter } from './ProcedureParameterParser';

/**
 * Branch kind for an OF / OROF / ELSE / ELSIF clause inside a CASE or IF
 * structure. See `BranchInfo` and `Token.branches`.
 */
export type BranchKind = 'OF' | 'OROF' | 'ELSE' | 'ELSIF';

/**
 * Records one OF / OROF / ELSE / ELSIF clause inside a CASE or IF structure.
 * Built by `DocumentStructure.populateBranches()` and attached to the parent
 * CASE/IF token's `branches` array. Consumers (StructureDiagnostics,
 * FoldingRangeProvider, SelectionRangeProvider, etc.) read these instead of
 * re-walking the token stream.
 *
 * `valueExpr` is the conditional expression text (joined across `|`
 * continuations via `getLogicalLine`) for OF/OROF/ELSIF; undefined for ELSE
 * (which has no condition).
 *
 * `endLine` is the last physical line that's part of the branch *body*: the
 * line before the next branch's keyword, or `parent.finishesAt - 1` for the
 * last branch.
 */
export interface BranchInfo {
    kind: BranchKind;
    startLine: number;
    endLine: number;
    valueExpr?: string;
    keywordToken: Token;
}

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
    isFileRecord?: boolean;     // ✅ True when this RECORD token is the direct child of a FILE structure (vs. a standalone or QUEUE/GROUP-nested RECORD)
    parameters?: ProcedureParameter[]; // ✅ Structured parameter list, populated by ClarionTokenizer for the 5 procedure subtypes (GlobalProcedure / MethodImplementation / MapProcedure / MethodDeclaration / InterfaceMethod)
    /** Declared data-type keyword captured for column-0 Label tokens (e.g. 'EQUATE', 'STRING', 'LONG', 'LIKE', 'GROUP'). Set by ClarionTokenizer.populateDeclaredValues() in the same pass that fills `parameters`. Single-line declarations only — Gap P will handle `|` continuation. */
    dataType?: string;
    /** Declared value (raw text inside the (...)) for column-0 Label tokens with a parenthesised argument (e.g. '100' for `MAX_ROWS EQUATE(100)`, '20' for `Name STRING(20)`). Undefined for bare-type declarations like `pId LONG`. */
    dataValue?: string;
    /** OF / OROF / ELSE / ELSIF clauses recorded on a CASE or IF parent token by
     * `DocumentStructure.populateBranches()` (Gap G). Each entry covers a single
     * branch's start/end lines plus its conditional expression (when present).
     * Undefined for any other token type, and for CASE/IF tokens with no
     * branches (just a CODE body). */
    branches?: BranchInfo[];
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
    structureType?: string;           // ✅ Set by DocumentStructure: the Structure/Type keyword on the same line as this label (e.g. 'FILE', 'VIEW', 'GROUP', 'CLASS', 'WINDOW', 'QUEUE', 'REPORT', etc.)
    /** USE() target resolution. Set on USE keyword tokens by DocumentStructure.linkUsesPass:
     * - For USE(?Name): the FieldEquateLabel token of the owning control's `?` identifier.
     * - For USE(VarName): the Label/Variable token of the bound data symbol (resolved via labelIndex).
     * - For USE(File:Field): the StructurePrefix-qualified field token.
     * Undefined when the argument is a deferred form (chained access, dot-paths). */
    linkedTo?: Token;
    /** True when a USE() argument list is empty — the Clarion `USE(?)` "no field equate" idiom.
     * Set on USE keyword tokens. Distinct from `linkedTo === undefined` (which means "couldn't resolve"). */
    hasNoFieldEquate?: boolean;
    /** PRE-expanded fully-qualified name for an EQUATE Label declared inside an
     * `ITEMIZE,PRE(...)` block (e.g. `Clr:Red` for `Red EQUATE` inside
     * `Color ITEMIZE,PRE(Clr)`). Set by DocumentStructure.linkEquatesPass on
     * Label tokens whose `dataType === 'EQUATE'` and whose nearest ITEMIZE
     * ancestor (walking up `parentIndex`) carries a PRE prefix.
     * Undefined for plain EQUATEs, ITEMIZE blocks without PRE, or labels not
     * inside an ITEMIZE at all. */
    prefixedEquateName?: string;
}
